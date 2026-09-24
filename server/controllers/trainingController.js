import { query, withTransaction } from '../config/db.js';
import { isGestionnaire } from '../middleware/auth.js';
import { findEmployeeById } from '../models/Employee.js';
import { createRequest } from '../models/Workflow.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { isValidISODate } from '../utils/dates.js';
import { notifyEmployee } from '../utils/notify.js';
import { pick, toInt } from '../utils/sanitize.js';

const canManageCatalogue = (u) => ['gestionnaire_rh', 'pilotage', 'admin_dsi'].includes(u.role);

/** GET /api/trainings — catalogue avec les sessions à venir */
export const listTrainings = async (req, res) => {
  const [trainings, sessions] = await Promise.all([
    query('SELECT * FROM trainings WHERE is_active OR $1 ORDER BY domain, title', [canManageCatalogue(req.user)]),
    query(`SELECT ts.*, i.name AS institution_name,
                  COUNT(en.id) FILTER (WHERE en.status IN ('validated','attended','certified')) AS enrolled,
                  BOOL_OR(en.employee_id = $2) AS i_am_enrolled
             FROM training_sessions ts
             LEFT JOIN structures i ON i.id = ts.institution_id
             LEFT JOIN enrollments en ON en.session_id = ts.id AND en.status NOT IN ('rejected','cancelled')
            WHERE ts.status <> 'cancelled' AND (ts.institution_id IS NULL OR ts.institution_id = $1)
            GROUP BY ts.id, i.name ORDER BY ts.start_date`, [req.user.institution_id ?? -1, req.user.employee_id ?? -1]),
  ]);
  res.json(trainings.rows.map((t) => ({ ...t, sessions: sessions.rows.filter((s) => s.training_id === t.id) })));
};

/** POST /api/trainings — ajout au catalogue */
export const createTraining = async (req, res) => {
  assert(canManageCatalogue(req.user), 'Accès refusé', 403);
  const d = pick(req.body, ['code', 'title', 'provider', 'domain', 'duration_days', 'is_certifying', 'description']);
  assert(d.code && d.title, 'Code et intitulé requis');
  const { rows } = await query(
    `INSERT INTO trainings (code, title, provider, domain, duration_days, is_certifying, description)
     VALUES (upper($1),$2,$3,$4,$5,$6,$7) RETURNING *`,
    [d.code, d.title, d.provider || null, d.domain || null, toInt(d.duration_days, 1), !!d.is_certifying, d.description || null]);
  res.status(201).json(rows[0]);
};

/** POST /api/trainings/:id/sessions — session (interministérielle si créée par le niveau central) */
export const createSession = async (req, res) => {
  assert(canManageCatalogue(req.user), 'Accès refusé', 403);
  const { start_date: s, end_date: e, location, capacity } = req.body;
  assert(isValidISODate(s) && isValidISODate(e) && e >= s, 'Dates invalides');
  const institution = isGestionnaire(req.user) ? req.user.institution_id : null;
  const { rows } = await query(
    `INSERT INTO training_sessions (training_id, start_date, end_date, location, capacity, institution_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [toInt(req.params.id), s, e, location || null, toInt(capacity, 20), institution]);
  res.status(201).json(rows[0]);
};

const sessionCapacityCheck = async (db, sessionId) => {
  const { rows } = await db.query(
    `SELECT ts.*, t.title, (SELECT COUNT(*) FROM enrollments WHERE session_id = ts.id
                             AND status IN ('requested','validated','attended','certified')) AS taken
       FROM training_sessions ts JOIN trainings t ON t.id = ts.training_id WHERE ts.id = $1 FOR UPDATE OF ts`, [sessionId]);
  const s = rows[0];
  assert(s && s.status === 'planned', 'Session introuvable ou fermée aux inscriptions');
  assert(s.taken < s.capacity, 'Session complète', 409);
  return s;
};

/** POST /api/trainings/sessions/:id/enroll — l'agent demande son inscription (circuit FORMATION) */
export const requestEnrollment = async (req, res) => {
  const u = req.user;
  assert(u.employee_id, 'Aucun dossier agent lié à ce compte');
  const emp = await findEmployeeById(u.employee_id);
  const { rows: wt } = await query(`SELECT * FROM workflow_types WHERE code = 'FORMATION'`);
  const result = await withTransaction(async (db) => {
    const s = await sessionCapacityCheck(db, toInt(req.params.id));
    const { rows } = await db.query(
      `INSERT INTO enrollments (session_id, employee_id, status) VALUES ($1,$2,'requested') RETURNING *`,
      [s.id, emp.id]);
    const request = await createRequest(db, {
      type: wt[0], employee: emp, userId: u.id, title: `Formation : ${s.title}`,
      description: req.body.motivation || null, payload: { enrollment_id: rows[0].id, session_id: s.id },
    });
    await db.query('UPDATE enrollments SET request_id = $1 WHERE id = $2', [request.id, rows[0].id]);
    return { ...rows[0], reference: request.reference };
  });
  await logActivity(u.id, 'Demande d’inscription à une formation', 'enrollment', result.id, null, req.ip);
  res.status(201).json(result);
};

/** POST /api/trainings/sessions/:id/participants { employee_id } — inscription directe par la DRH */
export const addParticipant = async (req, res) => {
  assert(isGestionnaire(req.user), 'Réservé aux gestionnaires RH', 403);
  const emp = await findEmployeeById(toInt(req.body.employee_id));
  assert(emp && emp.institution_id === req.user.institution_id, 'Agent hors de votre institution', 403);
  const row = await withTransaction(async (db) => {
    const s = await sessionCapacityCheck(db, toInt(req.params.id));
    const { rows } = await db.query(
      `INSERT INTO enrollments (session_id, employee_id, status) VALUES ($1,$2,'validated') RETURNING *`, [s.id, emp.id]);
    await notifyEmployee(emp.id, 'formation', 'Inscription à une formation', `${s.title} — du ${s.start_date} au ${s.end_date}`,
      '/trainings', db);
    return rows[0];
  });
  res.status(201).json(row);
};

/** GET /api/trainings/sessions/:id/participants */
export const listParticipants = async (req, res) => {
  const { rows } = await query(
    `SELECT en.*, e.full_name, e.sigrh_id, s.name AS structure_name, s.institution_id
       FROM enrollments en JOIN employees e ON e.id = en.employee_id LEFT JOIN structures s ON s.id = e.structure_id
      WHERE en.session_id = $1 ORDER BY e.last_name`, [toInt(req.params.id)]);
  const visible = canManageCatalogue(req.user) && !isGestionnaire(req.user)
    ? rows
    : rows.filter((r) => r.institution_id === req.user.institution_id || r.employee_id === req.user.employee_id);
  res.json(visible);
};

/** PATCH /api/trainings/enrollments/:id { status: attended|certified|absent, result } — suivi et certification */
export const updateEnrollment = async (req, res) => {
  assert(isGestionnaire(req.user), 'Réservé aux gestionnaires RH', 403);
  const { status, result } = req.body;
  assert(['attended', 'certified', 'absent'].includes(status), 'Statut invalide');
  const { rows } = await query(
    `SELECT en.*, s.institution_id, t.title, t.is_certifying, ts.end_date FROM enrollments en
       JOIN employees e ON e.id = en.employee_id JOIN structures s ON s.id = e.structure_id
       JOIN training_sessions ts ON ts.id = en.session_id JOIN trainings t ON t.id = ts.training_id
      WHERE en.id = $1`, [toInt(req.params.id)]);
  const en = rows[0];
  assert(en && en.institution_id === req.user.institution_id, 'Inscription hors de votre institution', 403);
  assert(['validated', 'attended'].includes(en.status), 'Inscription non validée', 409);
  if (status === 'certified') assert(en.is_certifying, 'Cette formation n’est pas certifiante');
  await withTransaction(async (db) => {
    await db.query('UPDATE enrollments SET status = $1, result = $2, certified_at = $3 WHERE id = $4',
      [status, result || null, status === 'certified' ? en.end_date : null, en.id]);
    if (status === 'certified') {
      await db.query(
        `INSERT INTO career_events (employee_id, type, effective_date, description, created_by)
         VALUES ($1,'formation',$2,$3,$4)`, [en.employee_id, en.end_date, `Certification : ${en.title}`, req.user.id]);
    }
  });
  res.json({ ok: true });
};
