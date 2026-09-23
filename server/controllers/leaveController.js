import { query, withTransaction } from '../config/db.js';
import { isHRorAdmin } from '../middleware/auth.js';
import { refreshLeaveBalances } from '../models/Employee.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { businessDaysBetween, isValidISODate, toISODate } from '../utils/dates.js';
import { notifyEmployee, notifyRoles } from '../utils/notify.js';
import { toInt } from '../utils/sanitize.js';

export const LEAVE_TYPES = {
  casual: { label: 'Congé occasionnel', column: 'casual_balance' },
  sick: { label: 'Congé maladie', column: 'sick_balance' },
  paid: { label: 'Congé payé (annuel)', column: 'paid_balance' },
  unpaid: { label: 'Congé sans solde', column: null },
};

const LEAVE_SELECT = `
  SELECT l.*, e.full_name, e.employee_code, e.department_id, d.name AS department_name,
         r.name AS reviewer_name
    FROM leaves l
    JOIN employees e ON e.id = l.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN users r ON r.id = l.reviewed_by`;

/** Can this user approve/reject leave for the employee? (HR/Admin, or manager of their department) */
const canReview = (user, leave) =>
  isHRorAdmin(user) || (user.managed_departments.includes(leave.department_id) && user.employee_id !== leave.employee_id);

/** Balance still available = stored balance − days already requested and pending (prevents over-booking). */
const availableBalance = async (employeeId, type, db = { query }) => {
  const col = LEAVE_TYPES[type].column;
  if (!col) return Infinity;
  const { rows } = await db.query(
    `SELECT e.${col} AS balance,
            COALESCE((SELECT SUM(days) FROM leaves
                       WHERE employee_id = e.id AND leave_type = $2 AND status = 'pending'), 0) AS pending
       FROM employees e WHERE e.id = $1`,
    [employeeId, type]
  );
  return rows[0].balance - rows[0].pending;
};

/** GET /api/leaves/balance[?employee=] */
export const getBalance = async (req, res) => {
  await refreshLeaveBalances();
  let employeeId = req.user.employee_id;
  if (req.query.employee && (isHRorAdmin(req.user) || req.user.isManager)) employeeId = toInt(req.query.employee);
  assert(employeeId, 'Aucun dossier employé lié à ce compte');
  const { rows } = await query(
    `SELECT e.id, e.full_name, e.department_id, e.casual_balance, e.sick_balance, e.paid_balance, e.balance_year,
            COALESCE(SUM(l.days) FILTER (WHERE l.status = 'pending'), 0) AS pending_days,
            COALESCE(SUM(l.days) FILTER (WHERE l.status = 'approved'
                     AND EXTRACT(YEAR FROM l.start_date) = e.balance_year), 0) AS taken_days
       FROM employees e LEFT JOIN leaves l ON l.employee_id = e.id
      WHERE e.id = $1 GROUP BY e.id`,
    [employeeId]
  );
  if (!rows[0]) throw new AppError('Employé introuvable', 404);
  if (!isHRorAdmin(req.user) && employeeId !== req.user.employee_id
      && !req.user.managed_departments.includes(rows[0].department_id)) {
    throw new AppError('Accès refusé', 403);
  }
  res.json(rows[0]);
};

/** GET /api/leaves?status=&employee=&scope=mine|team|all */
export const listLeaves = async (req, res) => {
  const params = [];
  const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  const scope = req.query.scope || (isHRorAdmin(req.user) ? 'all' : 'mine');

  if (scope === 'all' && isHRorAdmin(req.user)) {
    if (req.query.employee) add('l.employee_id = ?', toInt(req.query.employee));
    if (req.query.department) add('e.department_id = ?', toInt(req.query.department));
  } else if (scope === 'team' && req.user.isManager) {
    add('e.department_id = ANY(?)', req.user.managed_departments);
  } else {
    add('l.employee_id = ?', req.user.employee_id ?? -1);
  }
  if (req.query.status) add('l.status = ?', req.query.status);
  if (req.query.type) add('l.leave_type = ?', req.query.type);

  const { rows } = await query(
    `${LEAVE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY (l.status = 'pending') DESC, l.created_at DESC LIMIT 500`,
    params
  );
  res.json(rows);
};

/** POST /api/leaves — apply for leave */
export const applyLeave = async (req, res) => {
  const employeeId = req.user.employee_id;
  assert(employeeId, 'Aucun dossier employé lié à ce compte');
  const { leave_type: type, start_date: start, end_date: end, reason } = req.body;
  assert(LEAVE_TYPES[type], 'Type de congé invalide');
  assert(isValidISODate(start) && isValidISODate(end), 'Dates invalides');
  assert(end >= start, 'La date de fin doit être postérieure à la date de début');
  assert(type === 'sick' || start >= toISODate(), 'Impossible de demander un congé dans le passé');

  const days = businessDaysBetween(start, end);
  assert(days > 0, 'La période ne contient aucun jour ouvré');

  await refreshLeaveBalances();
  const leave = await withTransaction(async (client) => {
    // Serialise requests of the same employee to keep balances accurate (challenge #5)
    await client.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [employeeId]);

    const overlap = await client.query(
      `SELECT 1 FROM leaves WHERE employee_id = $1 AND status IN ('pending','approved')
          AND start_date <= $3 AND end_date >= $2`,
      [employeeId, start, end]
    );
    if (overlap.rows.length) throw new AppError('Cette période chevauche une demande existante', 409);

    const available = await availableBalance(employeeId, type, client);
    if (days > available) {
      throw new AppError(`Solde insuffisant : ${available} jour(s) disponible(s), ${days} demandé(s)`, 400);
    }

    const { rows } = await client.query(
      `INSERT INTO leaves (employee_id, leave_type, start_date, end_date, days, reason)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [employeeId, type, start, end, days, reason || null]
    );
    return rows[0];
  });

  await notifyRoles(['hr', 'admin'], 'leave', 'Nouvelle demande de congé',
    `${req.user.name} : ${LEAVE_TYPES[type].label}, ${days} jour(s) du ${start} au ${end}`, '/leaves');
  await logActivity(req.user.id, 'Demande de congé', 'leave', leave.id, `${LEAVE_TYPES[type].label} – ${days} j`);
  res.status(201).json(leave);
};

/** PATCH /api/leaves/:id/review { action: 'approve'|'reject', comment } */
export const reviewLeave = async (req, res) => {
  const id = toInt(req.params.id);
  const { action, comment } = req.body;
  assert(['approve', 'reject'].includes(action), 'Action invalide');

  const leave = await withTransaction(async (client) => {
    const { rows } = await client.query(`${LEAVE_SELECT} WHERE l.id = $1 FOR UPDATE OF l`, [id]);
    const current = rows[0];
    if (!current) throw new AppError('Demande introuvable', 404);
    if (!canReview(req.user, current)) throw new AppError('Accès refusé', 403);
    if (current.status !== 'pending') throw new AppError('Cette demande a déjà été traitée', 409);

    if (action === 'approve') {
      const col = LEAVE_TYPES[current.leave_type].column;
      if (col) {
        const upd = await client.query(
          `UPDATE employees SET ${col} = ${col} - $1 WHERE id = $2 AND ${col} >= $1 RETURNING ${col}`,
          [current.days, current.employee_id]
        );
        if (!upd.rows[0]) throw new AppError('Solde de congé insuffisant pour approuver', 400);
      }
    }
    const status = action === 'approve' ? 'approved' : 'rejected';
    const upd = await client.query(
      `UPDATE leaves SET status = $1, reviewed_by = $2, review_comment = $3, reviewed_at = now()
        WHERE id = $4 RETURNING *`,
      [status, req.user.id, comment || null, id]
    );
    return { ...current, ...upd.rows[0] };
  });

  const label = leave.status === 'approved' ? 'approuvée' : 'rejetée';
  await notifyEmployee(leave.employee_id, 'leave', `Demande de congé ${label}`,
    `${LEAVE_TYPES[leave.leave_type].label} du ${leave.start_date} au ${leave.end_date}${comment ? ` — ${comment}` : ''}`,
    '/leaves');
  await logActivity(req.user.id, `Congé ${label}`, 'leave', id, `${leave.full_name} – ${leave.days} j`);
  res.json(leave);
};

/** PATCH /api/leaves/:id/cancel — employee cancels own request (restores balance if it was approved) */
export const cancelLeave = async (req, res) => {
  const id = toInt(req.params.id);
  const leave = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM leaves WHERE id = $1 FOR UPDATE', [id]);
    const current = rows[0];
    if (!current) throw new AppError('Demande introuvable', 404);
    if (current.employee_id !== req.user.employee_id && !isHRorAdmin(req.user)) throw new AppError('Accès refusé', 403);
    if (!['pending', 'approved'].includes(current.status)) throw new AppError('Cette demande ne peut plus être annulée', 409);
    if (current.status === 'approved' && current.start_date <= toISODate() && !isHRorAdmin(req.user)) {
      throw new AppError('Un congé déjà commencé ne peut être annulé que par les RH', 400);
    }
    const col = LEAVE_TYPES[current.leave_type].column;
    if (current.status === 'approved' && col) {
      await client.query(`UPDATE employees SET ${col} = ${col} + $1 WHERE id = $2`, [current.days, current.employee_id]);
    }
    const upd = await client.query(`UPDATE leaves SET status = 'cancelled' WHERE id = $1 RETURNING *`, [id]);
    return upd.rows[0];
  });
  await logActivity(req.user.id, 'Annulation de congé', 'leave', id);
  res.json(leave);
};
