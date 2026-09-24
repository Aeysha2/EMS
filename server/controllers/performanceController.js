import { query } from '../config/db.js';
import { isGestionnaire } from '../middleware/auth.js';
import { findEmployeeById } from '../models/Employee.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { isValidISODate } from '../utils/dates.js';
import { notifyEmployee } from '../utils/notify.js';
import { toInt } from '../utils/sanitize.js';

const REVIEW_SELECT = `
  SELECT r.*, e.full_name, e.sigrh_id, e.structure_id, s.name AS structure_name, u.name AS reviewer_name
    FROM performance_reviews r JOIN employees e ON e.id = r.employee_id
    LEFT JOIN structures s ON s.id = e.structure_id LEFT JOIN users u ON u.id = r.reviewer_id`;

/** Évaluateur : chef de la structure de l'agent, ou DRH de son institution (jamais soi-même). */
const canEvaluate = (user, emp) => emp && user.employee_id !== emp.id
  && (user.managed_structures.includes(emp.structure_id)
      || (isGestionnaire(user) && user.institution_id === emp.institution_id));

const cleanList = (list, max = 20) => (Array.isArray(list) ? list : [])
  .filter((g) => g && g.title).slice(0, max)
  .map((g) => ({
    title: String(g.title).slice(0, 200),
    due: isValidISODate(g.due) ? g.due : null,
    target: g.target ? String(g.target).slice(0, 60) : null,
    achieved: g.achieved ? String(g.achieved).slice(0, 60) : null,
    progress: Math.min(100, Math.max(0, toInt(g.progress, 0))),
    done: !!g.done,
  }));

/** GET /api/performance?scope=mine|team|institution&year= */
export const listReviews = async (req, res) => {
  const u = req.user;
  const scope = req.query.scope || 'mine';
  const params = [];
  let where;
  if (scope === 'institution') {
    assert(isGestionnaire(u), 'Réservé aux gestionnaires RH', 403);
    params.push(u.institution_id); where = 's.institution_id = $1';
  } else if (scope === 'team') {
    assert(u.isChef, 'Réservé aux responsables de structure', 403);
    params.push(u.managed_structures, u.employee_id ?? -1); where = 'e.structure_id = ANY($1) AND e.id <> $2';
  } else {
    params.push(u.employee_id ?? -1); where = 'r.employee_id = $1';
  }
  if (req.query.year) { params.push(`${toInt(req.query.year)}%`); where += ` AND r.period LIKE $${params.length}`; }
  const { rows } = await query(`${REVIEW_SELECT} WHERE ${where} ORDER BY r.review_date DESC LIMIT 500`, params);
  res.json(rows);
};

/** POST /api/performance — fiche d'évaluation annuelle (objectifs + indicateurs) */
export const createReview = async (req, res) => {
  const emp = await findEmployeeById(toInt(req.body.employee_id));
  if (!canEvaluate(req.user, emp)) throw new AppError('Vous n’êtes pas l’évaluateur de cet agent', 403);
  const { period, review_date: date, rating, feedback } = req.body;
  const status = req.body.status === 'completed' ? 'completed' : 'scheduled';
  assert(period, 'Période requise (ex. 2026)');
  assert(!date || isValidISODate(date), 'Date invalide');
  if (status === 'completed') assert(Number(rating) >= 1 && Number(rating) <= 5, 'Note entre 1 et 5 requise');
  const { rows } = await query(
    `INSERT INTO performance_reviews (employee_id, reviewer_id, period, review_date, rating, feedback, goals, indicators, status)
     VALUES ($1,$2,$3,COALESCE($4::date, CURRENT_DATE),$5,$6,$7,$8,$9) RETURNING *`,
    [emp.id, req.user.id, period, date || null, rating ? Number(rating) : null, feedback || null,
      JSON.stringify(cleanList(req.body.goals)), JSON.stringify(cleanList(req.body.indicators)), status]);
  await notifyEmployee(emp.id, 'performance',
    status === 'scheduled' ? 'Entretien d’évaluation planifié' : 'Nouvelle évaluation disponible',
    `${period}${status === 'scheduled' ? ` — le ${rows[0].review_date}` : ` — note ${rating}/5`}`, '/performance');
  await logActivity(req.user.id, 'Évaluation', 'review', rows[0].id, `${emp.sigrh_id} – ${period}`, req.ip);
  res.status(201).json(rows[0]);
};

/** PUT /api/performance/:id — l'évaluateur modifie tout ; l'agent ne met à jour que l'avancement de ses objectifs */
export const updateReview = async (req, res) => {
  const { rows } = await query(`${REVIEW_SELECT} WHERE r.id = $1`, [toInt(req.params.id)]);
  const review = rows[0];
  if (!review) throw new AppError('Évaluation introuvable', 404);
  const emp = await findEmployeeById(review.employee_id);
  if (canEvaluate(req.user, emp)) {
    const status = req.body.status || review.status;
    const rating = req.body.rating !== undefined ? Number(req.body.rating) : review.rating;
    if (status === 'completed') assert(rating >= 1 && rating <= 5, 'Note entre 1 et 5 requise');
    const { rows: upd } = await query(
      `UPDATE performance_reviews SET period = $1, review_date = $2, rating = $3, feedback = $4, goals = $5,
              indicators = $6, status = $7 WHERE id = $8 RETURNING *`,
      [req.body.period || review.period, req.body.review_date || review.review_date, rating || null,
        req.body.feedback ?? review.feedback,
        JSON.stringify(req.body.goals ? cleanList(req.body.goals) : review.goals),
        JSON.stringify(req.body.indicators ? cleanList(req.body.indicators) : review.indicators), status, review.id]);
    if (review.status !== 'completed' && status === 'completed') {
      await notifyEmployee(emp.id, 'performance', 'Évaluation finalisée', `${upd[0].period} — note ${rating}/5`, '/performance');
    }
    return res.json(upd[0]);
  }
  if (review.employee_id === req.user.employee_id && Array.isArray(req.body.goals)) {
    const goals = review.goals.map((g, i) => {
      const inc = req.body.goals[i] || {};
      return { ...g, progress: Math.min(100, Math.max(0, toInt(inc.progress, g.progress))),
        done: inc.done !== undefined ? !!inc.done : g.done };
    });
    const { rows: upd } = await query('UPDATE performance_reviews SET goals = $1 WHERE id = $2 RETURNING *',
      [JSON.stringify(goals), review.id]);
    return res.json(upd[0]);
  }
  throw new AppError('Accès refusé', 403);
};

/** GET /api/performance/insights/:employeeId — analyse automatique (score et recommandations) */
export const insights = async (req, res) => {
  const emp = await findEmployeeById(toInt(req.params.employeeId));
  if (!emp || (emp.id !== req.user.employee_id && !canEvaluate(req.user, emp))) throw new AppError('Accès refusé', 403);
  const [reviews, att, reqs, trainings] = await Promise.all([
    query(`SELECT rating, goals FROM performance_reviews WHERE employee_id = $1 AND status = 'completed' ORDER BY review_date`, [emp.id]),
    query(`SELECT COUNT(*) FILTER (WHERE status IN ('present','late','half_day')) AS present,
                  COUNT(*) FILTER (WHERE status = 'late') AS late, COUNT(*) FILTER (WHERE status = 'absent') AS absent
             FROM attendance WHERE employee_id = $1 AND work_date >= CURRENT_DATE - 90`, [emp.id]),
    query(`SELECT COUNT(*) FILTER (WHERE status IN ('in_progress','awaiting_documents') AND step_due_date < CURRENT_DATE) AS late
             FROM requests WHERE assigned_employee_id = $1`, [emp.id]),
    query(`SELECT COUNT(*) FILTER (WHERE status = 'certified') AS certified, COUNT(*) AS total
             FROM enrollments WHERE employee_id = $1 AND status NOT IN ('rejected','cancelled')`, [emp.id]),
  ]);
  const ratings = reviews.rows.map((r) => Number(r.rating));
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const trend = ratings.length >= 2 ? ratings.at(-1) - ratings.at(-2) : 0;
  const goals = reviews.rows.flatMap((r) => r.goals || []);
  const goalRate = goals.length ? goals.filter((g) => g.done).length / goals.length : null;
  const a = att.rows[0];
  const attendance = a.present + a.absent ? a.present / (a.present + a.absent) : null;
  const punctuality = a.present ? 1 - a.late / a.present : null;
  const parts = [[avg !== null ? avg / 5 : null, 0.45], [attendance, 0.2], [punctuality, 0.15], [goalRate, 0.2]]
    .filter(([v]) => v !== null);
  const w = parts.reduce((s, [, x]) => s + x, 0);
  const score = w ? Math.round((parts.reduce((s, [v, x]) => s + v * x, 0) / w) * 100) : null;
  const tips = [];
  if (avg === null) tips.push('Aucune évaluation finalisée : planifier l’évaluation annuelle.');
  else if (avg >= 4.2) tips.push('Performance élevée et régulière : à considérer pour un avancement ou une responsabilité.');
  else if (avg < 3) tips.push('Note moyenne faible : proposer un plan d’accompagnement et une formation ciblée.');
  if (trend < 0) tips.push('Baisse depuis la dernière évaluation : organiser un entretien de suivi.');
  if (attendance !== null && attendance < 0.9) tips.push(`Assiduité de ${Math.round(attendance * 100)} % sur 90 jours.`);
  if (punctuality !== null && punctuality < 0.85) tips.push('Retards fréquents.');
  if (goalRate !== null && goalRate < 0.5) tips.push('Moins de la moitié des objectifs atteints.');
  if (Number(reqs.rows[0].late) > 0) tips.push(`${reqs.rows[0].late} dossier(s) en retard à instruire.`);
  if (Number(trainings.rows[0].total) === 0) tips.push('Aucune formation suivie : consulter le catalogue.');
  if (!tips.length) tips.push('Indicateurs satisfaisants.');
  res.json({
    score,
    level: score === null ? 'Indéterminé' : score >= 80 ? 'Excellent' : score >= 65 ? 'Bon' : score >= 50 ? 'À améliorer' : 'Insuffisant',
    metrics: { avgRating: avg && Math.round(avg * 10) / 10, reviews: ratings.length,
      attendanceRate: attendance !== null ? Math.round(attendance * 100) : null,
      punctuality: punctuality !== null ? Math.round(punctuality * 100) : null,
      goalCompletion: goalRate !== null ? Math.round(goalRate * 100) : null,
      trainings: Number(trainings.rows[0].total), certifications: Number(trainings.rows[0].certified) },
    recommendations: tips,
  });
};
