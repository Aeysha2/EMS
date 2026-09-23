import { query } from '../config/db.js';
import { isHRorAdmin } from '../middleware/auth.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { isValidISODate } from '../utils/dates.js';
import { notifyEmployee } from '../utils/notify.js';
import { toInt } from '../utils/sanitize.js';

const REVIEW_SELECT = `
  SELECT r.*, e.full_name, e.employee_code, e.department_id, d.name AS department_name, u.name AS reviewer_name
    FROM performance_reviews r
    JOIN employees e ON e.id = r.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN users u ON u.id = r.reviewer_id`;

/** Managers (HR/Admin or head of the employee's department) may review. */
const canManage = async (user, employeeId) => {
  if (isHRorAdmin(user)) return true;
  if (!user.isManager || employeeId === user.employee_id) return false;
  const { rows } = await query('SELECT department_id FROM employees WHERE id = $1', [employeeId]);
  return !!rows[0] && user.managed_departments.includes(rows[0].department_id);
};

const normaliseGoals = (goals) => {
  if (!Array.isArray(goals)) return [];
  return goals
    .filter((g) => g && (g.title || typeof g === 'string'))
    .slice(0, 20)
    .map((g) => (typeof g === 'string'
      ? { title: g, progress: 0, done: false }
      : {
        title: String(g.title).slice(0, 200),
        due: isValidISODate(g.due) ? g.due : null,
        progress: Math.min(100, Math.max(0, toInt(g.progress, 0))),
        done: !!g.done,
      }));
};

/** GET /api/performance?employee=&scope=mine|team|all */
export const listReviews = async (req, res) => {
  const params = [];
  const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  const scope = req.query.scope || (isHRorAdmin(req.user) ? 'all' : 'mine');
  if (scope === 'all' && isHRorAdmin(req.user)) {
    if (req.query.employee) add('r.employee_id = ?', toInt(req.query.employee));
  } else if (scope === 'team' && req.user.isManager) {
    add('e.department_id = ANY(?)', req.user.managed_departments);
    add('r.employee_id <> ?', req.user.employee_id);
  } else {
    add('r.employee_id = ?', req.user.employee_id ?? -1);
  }
  const { rows } = await query(
    `${REVIEW_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.review_date DESC LIMIT 500`,
    params
  );
  res.json(rows);
};

/** POST /api/performance */
export const createReview = async (req, res) => {
  const employeeId = toInt(req.body.employee_id);
  assert(employeeId, 'Employé requis');
  if (!(await canManage(req.user, employeeId))) throw new AppError('Accès refusé', 403);
  const { period, review_date: reviewDate, rating, feedback } = req.body;
  const status = req.body.status === 'completed' ? 'completed' : 'scheduled';
  assert(period, 'La période est requise (ex. « 2026 – S1 »)');
  assert(!reviewDate || isValidISODate(reviewDate), 'Date invalide');
  if (status === 'completed') assert(Number(rating) >= 1 && Number(rating) <= 5, 'Note entre 1 et 5 requise');

  const { rows } = await query(
    `INSERT INTO performance_reviews (employee_id, reviewer_id, period, review_date, rating, feedback, goals, status)
     VALUES ($1,$2,$3,COALESCE($4::date, CURRENT_DATE),$5,$6,$7,$8) RETURNING *`,
    [employeeId, req.user.id, period, reviewDate || null, rating ? Number(rating) : null, feedback || null,
      JSON.stringify(normaliseGoals(req.body.goals)), status]
  );
  const review = rows[0];
  await notifyEmployee(employeeId, 'performance',
    status === 'scheduled' ? 'Évaluation de performance planifiée' : 'Nouvelle évaluation de performance',
    status === 'scheduled' ? `Votre évaluation « ${period} » est prévue le ${review.review_date}.`
      : `Votre évaluation « ${period} » est disponible (note ${rating}/5).`,
    '/performance');
  await logActivity(req.user.id, 'Évaluation de performance', 'review', review.id, `employé #${employeeId} – ${period}`);
  res.status(201).json(review);
};

/** PUT /api/performance/:id — reviewer/HR edit; the employee may only update goal progress */
export const updateReview = async (req, res) => {
  const id = toInt(req.params.id);
  const { rows } = await query('SELECT * FROM performance_reviews WHERE id = $1', [id]);
  const review = rows[0];
  if (!review) throw new AppError('Évaluation introuvable', 404);

  if (await canManage(req.user, review.employee_id)) {
    const status = req.body.status || review.status;
    const rating = req.body.rating !== undefined ? Number(req.body.rating) : review.rating;
    if (status === 'completed') assert(rating >= 1 && rating <= 5, 'Note entre 1 et 5 requise');
    const upd = await query(
      `UPDATE performance_reviews SET period = $1, review_date = $2, rating = $3, feedback = $4, goals = $5, status = $6
        WHERE id = $7 RETURNING *`,
      [req.body.period || review.period, req.body.review_date || review.review_date, rating || null,
        req.body.feedback ?? review.feedback,
        JSON.stringify(req.body.goals ? normaliseGoals(req.body.goals) : review.goals), status, id]
    );
    if (review.status !== 'completed' && status === 'completed') {
      await notifyEmployee(review.employee_id, 'performance', 'Évaluation finalisée',
        `Votre évaluation « ${upd.rows[0].period} » a été finalisée (note ${rating}/5).`, '/performance');
    }
    return res.json(upd.rows[0]);
  }

  if (review.employee_id === req.user.employee_id && Array.isArray(req.body.goals)) {
    // Self-service: only progress / done flags can change, titles stay as set by the manager
    const goals = review.goals.map((g, i) => {
      const incoming = req.body.goals[i] || {};
      return {
        ...g,
        progress: Math.min(100, Math.max(0, toInt(incoming.progress, g.progress))),
        done: incoming.done !== undefined ? !!incoming.done : g.done,
      };
    });
    const upd = await query('UPDATE performance_reviews SET goals = $1 WHERE id = $2 RETURNING *', [JSON.stringify(goals), id]);
    return res.json(upd.rows[0]);
  }
  throw new AppError('Accès refusé', 403);
};

/** DELETE /api/performance/:id (HR/Admin) */
export const deleteReview = async (req, res) => {
  const { rowCount } = await query('DELETE FROM performance_reviews WHERE id = $1', [toInt(req.params.id)]);
  if (!rowCount) throw new AppError('Évaluation introuvable', 404);
  res.json({ message: 'Évaluation supprimée' });
};

/**
 * GET /api/performance/insights/:employeeId
 * Automatic performance insights: combines ratings trend, attendance, punctuality,
 * overtime, goals completion and handled dossiers into a score and plain-language advice.
 */
export const insights = async (req, res) => {
  const employeeId = toInt(req.params.employeeId);
  if (employeeId !== req.user.employee_id && !(await canManage(req.user, employeeId))) {
    throw new AppError('Accès refusé', 403);
  }
  const [reviews, att, projects] = await Promise.all([
    query(`SELECT rating, goals, review_date FROM performance_reviews
            WHERE employee_id = $1 AND status = 'completed' ORDER BY review_date`, [employeeId]),
    query(`SELECT COUNT(*) FILTER (WHERE status IN ('present','late','half_day')) AS present,
                  COUNT(*) FILTER (WHERE status = 'late') AS late,
                  COUNT(*) FILTER (WHERE status = 'absent') AS absent,
                  COALESCE(SUM(overtime), 0) AS overtime, COALESCE(AVG(NULLIF(working_hours, 0)), 0) AS avg_hours
             FROM attendance WHERE employee_id = $1 AND work_date >= CURRENT_DATE - 90`, [employeeId]),
    query(`SELECT COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                  COUNT(*) FILTER (WHERE status IN ('in_progress','awaiting_documents')) AS open,
                  COUNT(*) FILTER (WHERE status IN ('in_progress','awaiting_documents') AND due_date < CURRENT_DATE) AS overdue
             FROM projects WHERE agent_id = $1`, [employeeId]),
  ]);

  const ratings = reviews.rows.map((r) => Number(r.rating));
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const trend = ratings.length >= 2 ? ratings[ratings.length - 1] - ratings[ratings.length - 2] : 0;
  const goals = reviews.rows.flatMap((r) => r.goals || []);
  const goalRate = goals.length ? goals.filter((g) => g.done).length / goals.length : null;
  const a = att.rows[0];
  const worked = a.present + a.absent;
  const attendanceRate = worked ? a.present / worked : null;
  const punctuality = a.present ? 1 - a.late / a.present : null;
  const p = projects.rows[0];

  const parts = [
    [avgRating !== null ? avgRating / 5 : null, 0.4],
    [attendanceRate, 0.2],
    [punctuality, 0.15],
    [goalRate, 0.15],
    [p.completed + p.open ? 1 - p.overdue / Math.max(1, p.open + p.completed) : null, 0.1],
  ].filter(([v]) => v !== null);
  const weight = parts.reduce((s, [, w]) => s + w, 0);
  const score = weight ? Math.round((parts.reduce((s, [v, w]) => s + v * w, 0) / weight) * 100) : null;

  const tips = [];
  if (avgRating !== null) {
    if (avgRating >= 4.2) tips.push('Performance excellente et régulière : envisager des responsabilités élargies ou un avancement.');
    else if (avgRating < 3) tips.push('Note moyenne faible : proposer un plan d’accompagnement et des objectifs à court terme.');
  } else tips.push('Aucune évaluation finalisée : planifier une première évaluation.');
  if (trend > 0) tips.push('Tendance en progression depuis la dernière évaluation.');
  if (trend < 0) tips.push('Baisse de la note depuis la dernière évaluation : organiser un entretien de suivi.');
  if (attendanceRate !== null && attendanceRate < 0.9) tips.push(`Assiduité à ${Math.round(attendanceRate * 100)} % sur 90 jours : vérifier les absences.`);
  if (punctuality !== null && punctuality < 0.85) tips.push('Retards fréquents : rappeler les horaires de service.');
  if (a.overtime > 40) tips.push(`${Math.round(a.overtime)} h supplémentaires en 90 jours : risque de surcharge, rééquilibrer la charge.`);
  if (goalRate !== null && goalRate < 0.5) tips.push('Moins de la moitié des objectifs atteints : revoir leur priorisation.');
  if (p.overdue > 0) tips.push(`${p.overdue} dossier(s) en retard : prioriser leur traitement ou redistribuer.`);
  if (!tips.length) tips.push('Indicateurs satisfaisants, aucun point d’alerte.');

  res.json({
    score,
    level: score === null ? 'Indéterminé' : score >= 80 ? 'Excellent' : score >= 65 ? 'Bon' : score >= 50 ? 'À améliorer' : 'Insuffisant',
    metrics: {
      avgRating: avgRating && Math.round(avgRating * 10) / 10,
      ratingTrend: trend,
      reviews: ratings.length,
      attendanceRate: attendanceRate !== null ? Math.round(attendanceRate * 100) : null,
      punctuality: punctuality !== null ? Math.round(punctuality * 100) : null,
      overtimeHours90d: a.overtime,
      goalCompletion: goalRate !== null ? Math.round(goalRate * 100) : null,
      projectsCompleted: p.completed,
      projectsOpen: p.open,
      projectsOverdue: p.overdue,
    },
    recommendations: tips,
  });
};
