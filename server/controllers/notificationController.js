import { query } from '../config/db.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { isValidISODate } from '../utils/dates.js';
import { notifyRoles } from '../utils/notify.js';
import { toInt } from '../utils/sanitize.js';

/** GET /api/notifications */
export const listNotifications = async (req, res) => {
  const [list, unread] = await Promise.all([
    query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.user.id]),
    query('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND NOT is_read', [req.user.id]),
  ]);
  res.json({ data: list.rows, unread: unread.rows[0].count });
};

/** PATCH /api/notifications/:id/read  (id = "all" marks everything) */
export const markRead = async (req, res) => {
  if (req.params.id === 'all') {
    await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.user.id]);
  } else {
    await query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [toInt(req.params.id), req.user.id]);
  }
  res.json({ ok: true });
};

/** GET /api/announcements */
export const listAnnouncements = async (req, res) => {
  const { rows } = await query(
    `SELECT a.*, u.name AS author_name FROM announcements a LEFT JOIN users u ON u.id = a.author_id
      ORDER BY a.created_at DESC LIMIT 100`
  );
  res.json(rows);
};

/** POST /api/announcements (Admin/HR) — notifies everyone */
export const createAnnouncement = async (req, res) => {
  const { title, content, event_date: eventDate } = req.body;
  assert(title && content, 'Titre et contenu requis');
  assert(!eventDate || isValidISODate(eventDate), 'Date invalide');
  const { rows } = await query(
    'INSERT INTO announcements (title, content, event_date, author_id) VALUES ($1,$2,$3,$4) RETURNING *',
    [title, content, eventDate || null, req.user.id]
  );
  await notifyRoles([], 'announcement', `Annonce : ${title}`, content.slice(0, 180), '/announcements');
  await logActivity(req.user.id, 'Publication annonce', 'announcement', rows[0].id, title);
  res.status(201).json(rows[0]);
};

/** DELETE /api/announcements/:id (Admin/HR) */
export const deleteAnnouncement = async (req, res) => {
  const { rowCount } = await query('DELETE FROM announcements WHERE id = $1', [toInt(req.params.id)]);
  if (!rowCount) throw new AppError('Annonce introuvable', 404);
  res.json({ message: 'Annonce supprimée' });
};

/** GET /api/calendar?from=&to= — company calendar: events, approved leaves, reviews, dossier deadlines */
export const calendar = async (req, res) => {
  const from = isValidISODate(req.query.from) ? req.query.from : null;
  const to = isValidISODate(req.query.to) ? req.query.to : null;
  assert(from && to, 'Période requise');
  const hr = req.user.role === 'admin' || req.user.role === 'hr';
  const emp = req.user.employee_id ?? -1;
  const [events, leaves, reviews, deadlines] = await Promise.all([
    query(`SELECT id, title, event_date AS date FROM announcements WHERE event_date BETWEEN $1 AND $2`, [from, to]),
    query(
      `SELECT l.id, e.full_name, l.leave_type, l.start_date, l.end_date FROM leaves l JOIN employees e ON e.id = l.employee_id
        WHERE l.status = 'approved' AND l.start_date <= $2 AND l.end_date >= $1
          AND ($3 OR l.employee_id = $4 OR e.department_id = ANY($5))`,
      [from, to, hr, emp, req.user.managed_departments]
    ),
    query(
      `SELECT r.id, r.period, r.review_date AS date, e.full_name FROM performance_reviews r JOIN employees e ON e.id = r.employee_id
        WHERE r.status = 'scheduled' AND r.review_date BETWEEN $1 AND $2 AND ($3 OR r.employee_id = $4 OR r.reviewer_id = $5)`,
      [from, to, hr, emp, req.user.id]
    ),
    query(
      `SELECT id, reference, title, due_date AS date FROM projects
        WHERE status IN ('in_progress','awaiting_documents') AND due_date BETWEEN $1 AND $2 AND ($3 OR agent_id = $4)`,
      [from, to, hr, emp]
    ),
  ]);
  res.json({ events: events.rows, leaves: leaves.rows, reviews: reviews.rows, deadlines: deadlines.rows });
};
