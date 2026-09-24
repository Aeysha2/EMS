import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { isGestionnaire, isPilotage, ROLES } from '../middleware/auth.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity, verifyAuditChain } from '../utils/audit.js';
import { isValidISODate } from '../utils/dates.js';
import { notifyRoles, notifyUsers } from '../utils/notify.js';
import { toInt } from '../utils/sanitize.js';

const REVIEW_PERIOD_DAYS = Number(process.env.RIGHTS_REVIEW_DAYS || 180);

// ---------------------------------------------------------------- comptes et habilitations (DSI)

/** GET /api/admin/users — comptes et état de la revue des habilitations */
export const listUsers = async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.is_active, u.totp_enabled, u.last_login_at, u.created_at,
            u.rights_reviewed_at, r.name AS reviewed_by_name, s.name AS structure_name, i.sigle AS institution_sigle,
            e.sigrh_id, (u.rights_reviewed_at IS NULL OR u.rights_reviewed_at < now() - ($1 || ' days')::interval) AS review_due
       FROM users u LEFT JOIN structures s ON s.id = u.structure_id LEFT JOIN structures i ON i.id = s.institution_id
       LEFT JOIN employees e ON e.id = u.employee_id LEFT JOIN users r ON r.id = u.rights_reviewed_by
      ORDER BY u.role, i.sigle, u.name`, [REVIEW_PERIOD_DAYS]);
  res.json({ review_period_days: REVIEW_PERIOD_DAYS, users: rows });
};

/**
 * POST /api/admin/users — création d'un compte habilité.
 * { name, email, password, role, structure_id, employee_id? }
 */
export const createUser = async (req, res) => {
  const { name, email, password, role, structure_id: structureId, employee_id: employeeId } = req.body;
  assert(name && email, 'Nom et email requis');
  assert(ROLES.includes(role), 'Profil invalide');
  assert(typeof password === 'string' && password.length >= 10, 'Mot de passe initial : 10 caractères minimum');
  assert(structureId, 'Structure de rattachement requise (elle définit le périmètre)');
  if (role === 'pilotage') {
    const { rows } = await query('SELECT i.type FROM structures s JOIN structures i ON i.id = s.institution_id WHERE s.id = $1',
      [structureId]);
    assert(['presidence', 'sgg'].includes(rows[0]?.type), 'Le profil pilotage est réservé à la Présidence et au SGG');
  }
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, structure_id, employee_id, rights_reviewed_at, rights_reviewed_by)
     VALUES ($1, lower($2), $3, $4, $5, $6, now(), $7) RETURNING id, name, email, role`,
    [name, email, await bcrypt.hash(password, 12), role, structureId, employeeId || null, req.user.id]);
  await logActivity(req.user.id, 'Création de compte', 'user', rows[0].id, `${email} – ${role}`, req.ip);
  res.status(201).json(rows[0]);
};

/** PATCH /api/admin/users/:id { role?, structure_id?, is_active?, password?, reset_mfa? } */
export const updateUser = async (req, res) => {
  const id = toInt(req.params.id);
  assert(id !== req.user.id, 'Vous ne pouvez pas modifier vos propres habilitations');
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  if (!rows[0]) throw new AppError('Compte introuvable', 404);
  const changes = [];
  const { role, structure_id: structureId, is_active: active, password, reset_mfa: resetMfa } = req.body;
  if (role !== undefined) {
    assert(ROLES.includes(role), 'Profil invalide');
    await query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    changes.push(`profil ${rows[0].role} → ${role}`);
  }
  if (structureId !== undefined) {
    await query('UPDATE users SET structure_id = $1 WHERE id = $2', [structureId, id]);
    changes.push('structure de rattachement');
  }
  if (active !== undefined) {
    await query('UPDATE users SET is_active = $1 WHERE id = $2', [!!active, id]);
    changes.push(active ? 'réactivé' : 'désactivé');
  }
  if (password) {
    assert(password.length >= 10, 'Mot de passe : 10 caractères minimum');
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(password, 12), id]);
    changes.push('mot de passe réinitialisé');
  }
  if (resetMfa) {
    await query('UPDATE users SET totp_enabled = FALSE, totp_secret_enc = NULL WHERE id = $1', [id]);
    changes.push('2FA réinitialisée');
  }
  assert(changes.length, 'Aucune modification');
  await notifyUsers([id], 'account', 'Vos habilitations ont été modifiées', changes.join(', '));
  await logActivity(req.user.id, 'Modification d’habilitations', 'user', id, changes.join(', '), req.ip);
  res.json({ ok: true, changes });
};

/** POST /api/admin/users/:id/review — revue périodique des droits (principe du moindre privilège) */
export const reviewUser = async (req, res) => {
  const id = toInt(req.params.id);
  const { rows } = await query(
    'UPDATE users SET rights_reviewed_at = now(), rights_reviewed_by = $1 WHERE id = $2 RETURNING id, email, role',
    [req.user.id, id]);
  if (!rows[0]) throw new AppError('Compte introuvable', 404);
  await logActivity(req.user.id, 'Revue des habilitations', 'user', id, `${rows[0].email} (${rows[0].role}) confirmé`, req.ip);
  res.json({ ok: true });
};

// ---------------------------------------------------------------- journal d'audit

/** GET /api/admin/audit?limit=&action=&user= */
export const auditLog = async (req, res) => {
  const limit = Math.min(500, toInt(req.query.limit, 100));
  const params = [limit];
  const where = [];
  if (req.query.action) { params.push(`%${req.query.action}%`); where.push(`a.action ILIKE $${params.length}`); }
  if (req.query.user) { params.push(toInt(req.query.user)); where.push(`a.user_id = $${params.length}`); }
  const { rows } = await query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.ip, a.created_at, a.hash, u.name AS user_name, u.role
       FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.id DESC LIMIT $1`, params);
  res.json(rows);
};

/** GET /api/admin/audit/verify — contrôle d'intégrité de la chaîne */
export const auditVerify = async (req, res) => {
  const result = await verifyAuditChain();
  await logActivity(req.user.id, 'Vérification d’intégrité du journal', 'audit', null,
    result.valid ? `${result.checked} entrées intègres` : `rupture à l’entrée ${result.brokenAt}`, req.ip);
  res.json(result);
};

// ---------------------------------------------------------------- communication

/** GET /api/notifications */
export const listNotifications = async (req, res) => {
  const [list, unread] = await Promise.all([
    query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.user.id]),
    query('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND NOT is_read', [req.user.id]),
  ]);
  res.json({ data: list.rows, unread: unread.rows[0].count });
};

/** PATCH /api/notifications/:id/read (id = all) */
export const markRead = async (req, res) => {
  if (req.params.id === 'all') await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.user.id]);
  else await query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [toInt(req.params.id), req.user.id]);
  res.json({ ok: true });
};

/** GET /api/announcements — annonces nationales et de mon institution */
export const listAnnouncements = async (req, res) => {
  const { rows } = await query(
    `SELECT a.*, u.name AS author_name, i.sigle AS institution_sigle FROM announcements a
       LEFT JOIN users u ON u.id = a.author_id LEFT JOIN structures i ON i.id = a.institution_id
      WHERE a.institution_id IS NULL OR a.institution_id = $1 ORDER BY a.created_at DESC LIMIT 100`,
    [req.user.institution_id ?? -1]);
  res.json(rows);
};

/** POST /api/announcements — nationale (pilotage) ou institutionnelle (DRH) */
export const createAnnouncement = async (req, res) => {
  assert(isPilotage(req.user) || isGestionnaire(req.user), 'Accès refusé', 403);
  const { title, content, event_date: eventDate } = req.body;
  assert(title && content, 'Titre et contenu requis');
  assert(!eventDate || isValidISODate(eventDate), 'Date invalide');
  const institution = isPilotage(req.user) && req.body.national !== false ? null : req.user.institution_id;
  const { rows } = await query(
    'INSERT INTO announcements (title, content, event_date, institution_id, author_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [title, content, eventDate || null, institution, req.user.id]);
  await notifyRoles([], 'announcement', `Annonce : ${title}`, content.slice(0, 180), '/announcements', institution);
  await logActivity(req.user.id, 'Publication d’annonce', 'announcement', rows[0].id, title, req.ip);
  res.status(201).json(rows[0]);
};

/** DELETE /api/announcements/:id */
export const deleteAnnouncement = async (req, res) => {
  const { rows } = await query('SELECT * FROM announcements WHERE id = $1', [toInt(req.params.id)]);
  assert(rows[0], 'Annonce introuvable', 404);
  const allowed = rows[0].author_id === req.user.id || (isPilotage(req.user) && rows[0].institution_id === null)
    || (isGestionnaire(req.user) && rows[0].institution_id === req.user.institution_id);
  assert(allowed, 'Accès refusé', 403);
  await query('DELETE FROM announcements WHERE id = $1', [rows[0].id]);
  res.json({ ok: true });
};

/** GET /api/calendar?from=&to= */
export const calendar = async (req, res) => {
  const { from, to } = req.query;
  assert(isValidISODate(from) && isValidISODate(to), 'Période requise');
  const u = req.user;
  const [events, leaves, reviews, sessions, deadlines] = await Promise.all([
    query(`SELECT id, title, event_date AS date FROM announcements WHERE event_date BETWEEN $1 AND $2
             AND (institution_id IS NULL OR institution_id = $3)`, [from, to, u.institution_id ?? -1]),
    query(`SELECT l.id, e.full_name, lt.label, l.leave_type, l.start_date, l.end_date FROM leaves l
             JOIN employees e ON e.id = l.employee_id JOIN leave_types lt ON lt.code = l.leave_type
            WHERE l.status = 'approved' AND l.start_date <= $2 AND l.end_date >= $1
              AND (l.employee_id = $3 OR e.structure_id = ANY($4))`,
    [from, to, u.employee_id ?? -1, u.managed_structures]),
    query(`SELECT r.id, r.period, r.review_date AS date, e.full_name FROM performance_reviews r
             JOIN employees e ON e.id = r.employee_id
            WHERE r.status = 'scheduled' AND r.review_date BETWEEN $1 AND $2 AND (r.employee_id = $3 OR r.reviewer_id = $4)`,
    [from, to, u.employee_id ?? -1, u.id]),
    query(`SELECT ts.id, t.title, ts.start_date, ts.end_date FROM enrollments en
             JOIN training_sessions ts ON ts.id = en.session_id JOIN trainings t ON t.id = ts.training_id
            WHERE en.employee_id = $1 AND en.status IN ('validated','attended','certified')
              AND ts.start_date <= $3 AND ts.end_date >= $2`, [u.employee_id ?? -1, from, to]),
    query(`SELECT id, reference, title, step_due_date AS date FROM requests
            WHERE status IN ('in_progress','awaiting_documents') AND step_due_date BETWEEN $1 AND $2
              AND (assigned_employee_id = $3 OR employee_id = $3)`, [from, to, u.employee_id ?? -1]),
  ]);
  res.json({ events: events.rows, leaves: leaves.rows, reviews: reviews.rows, sessions: sessions.rows,
    deadlines: deadlines.rows });
};
