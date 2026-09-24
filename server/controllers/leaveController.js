import { query, withTransaction } from '../config/db.js';
import { isGestionnaire } from '../middleware/auth.js';
import { findEmployeeById } from '../models/Employee.js';
import { createRequest, leaveBalanceRow, performAction } from '../models/Workflow.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { businessDaysBetween, isValidISODate, toISODate } from '../utils/dates.js';
import { toInt } from '../utils/sanitize.js';

const calendarDays = (s, e) => Math.round((new Date(`${e}T00:00:00Z`) - new Date(`${s}T00:00:00Z`)) / 864e5) + 1;

/** GET /api/leaves/types */
export const listLeaveTypes = async (req, res) => {
  const { rows } = await query('SELECT * FROM leave_types WHERE is_active ORDER BY label');
  res.json(rows);
};

/** Soldes de l'année (création à la volée à partir du quota du type). */
const balancesFor = async (employeeId, year) => {
  await query(
    `INSERT INTO leave_balances (employee_id, leave_type, year, allotted)
     SELECT $1, code, $2, annual_quota FROM leave_types WHERE annual_quota IS NOT NULL AND is_active
     ON CONFLICT DO NOTHING`, [employeeId, year]);
  const { rows } = await query(
    `SELECT b.*, lt.label,
            COALESCE((SELECT SUM(days) FROM leaves l WHERE l.employee_id = b.employee_id AND l.leave_type = b.leave_type
                        AND l.status = 'pending' AND EXTRACT(YEAR FROM l.start_date) = b.year), 0) AS pending
       FROM leave_balances b JOIN leave_types lt ON lt.code = b.leave_type
      WHERE b.employee_id = $1 AND b.year = $2 ORDER BY lt.label`, [employeeId, year]);
  return rows.map((r) => ({ ...r, available: r.allotted - r.used - r.pending }));
};

/** GET /api/leaves/balance?employee=&year= */
export const getBalance = async (req, res) => {
  const year = toInt(req.query.year, new Date().getFullYear());
  let employeeId = req.user.employee_id;
  if (req.query.employee) {
    const emp = await findEmployeeById(toInt(req.query.employee));
    assert(emp, 'Agent introuvable');
    const allowed = emp.id === req.user.employee_id
      || (isGestionnaire(req.user) && emp.institution_id === req.user.institution_id)
      || req.user.managed_structures.includes(emp.structure_id);
    assert(allowed, 'Accès refusé', 403);
    employeeId = emp.id;
  }
  assert(employeeId, 'Aucun dossier agent lié à ce compte');
  res.json({ year, balances: await balancesFor(employeeId, year) });
};

/** GET /api/leaves?scope=mine|team|institution&status=&type= */
export const listLeaves = async (req, res) => {
  const u = req.user;
  const scope = req.query.scope || 'mine';
  const params = [];
  const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };
  if (scope === 'institution') {
    assert(isGestionnaire(u), 'Réservé aux gestionnaires RH', 403);
    add('s.institution_id = ?', u.institution_id);
  } else if (scope === 'team') {
    assert(u.isChef, 'Réservé aux responsables de structure', 403);
    add('e.structure_id = ANY(?)', u.managed_structures);
  } else {
    add('l.employee_id = ?', u.employee_id ?? -1);
  }
  if (req.query.status) add('l.status = ?', req.query.status);
  if (req.query.type) add('l.leave_type = ?', req.query.type);
  if (req.query.from && isValidISODate(req.query.from)) add('l.end_date >= ?', req.query.from);
  const { rows } = await query(
    `SELECT l.*, lt.label, e.full_name, e.sigrh_id, s.name AS structure_name,
            r.reference, r.current_step, r.status AS request_status,
            (SELECT COUNT(*) FROM workflow_steps ws WHERE ws.type_id = r.type_id) AS total_steps,
            (SELECT ws.name FROM workflow_steps ws WHERE ws.type_id = r.type_id AND ws.step_order = r.current_step) AS step_name
       FROM leaves l JOIN leave_types lt ON lt.code = l.leave_type
       JOIN employees e ON e.id = l.employee_id LEFT JOIN structures s ON s.id = e.structure_id
       LEFT JOIN requests r ON r.id = l.request_id
      WHERE ${where.join(' AND ')}
      ORDER BY (l.status = 'pending') DESC, l.start_date DESC LIMIT 500`, params);
  res.json(rows);
};

/**
 * POST /api/leaves — demande d'absence (congé, permission, maladie, mission…).
 * Crée l'absence (en attente) et la demande qui suit le circuit de validation paramétré du type.
 */
export const applyLeave = async (req, res) => {
  const u = req.user;
  const employeeId = u.employee_id;
  assert(employeeId, 'Aucun dossier agent lié à ce compte');
  const { leave_type: code, start_date: start, end_date: end, reason, destination } = req.body;
  const { rows: lt } = await query('SELECT * FROM leave_types WHERE code = $1 AND is_active', [code]);
  const type = lt[0];
  assert(type, 'Type d’absence invalide');
  assert(isValidISODate(start) && isValidISODate(end), 'Dates invalides');
  assert(end >= start, 'La date de fin doit être postérieure à la date de début');
  assert(code === 'maladie' || start >= toISODate(), 'Impossible de demander une absence dans le passé');
  if (code === 'mission') assert(destination, 'Destination de la mission requise');
  const days = type.business_days ? businessDaysBetween(start, end) : calendarDays(start, end);
  assert(days > 0, 'La période ne contient aucun jour ouvré');
  assert(start.slice(0, 4) === end.slice(0, 4), 'Une absence ne peut pas chevaucher deux années : faites deux demandes');

  const emp = await findEmployeeById(employeeId);
  assert(['activite', 'stage'].includes(emp.position_statutaire), 'Votre position statutaire ne permet pas cette demande');
  const { rows: wt } = await query('SELECT * FROM workflow_types WHERE code = $1', [type.workflow_code]);
  assert(wt[0], 'Circuit de validation non paramétré');

  const result = await withTransaction(async (db) => {
    await db.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [employeeId]);
    const overlap = await db.query(
      `SELECT 1 FROM leaves WHERE employee_id = $1 AND status IN ('pending','approved') AND start_date <= $3 AND end_date >= $2`,
      [employeeId, start, end]);
    if (overlap.rows.length) throw new AppError('Cette période chevauche une absence existante', 409);
    const bal = await leaveBalanceRow(db, employeeId, code, Number(start.slice(0, 4)));
    if (bal) {
      const { rows: p } = await db.query(
        `SELECT COALESCE(SUM(days),0) AS s FROM leaves WHERE employee_id = $1 AND leave_type = $2 AND status = 'pending'
            AND EXTRACT(YEAR FROM start_date) = $3`, [employeeId, code, bal.year]);
      const available = bal.allotted - bal.used - p[0].s;
      if (days > available) throw new AppError(`Solde insuffisant : ${available} jour(s) disponible(s), ${days} demandé(s)`, 400);
    }
    const { rows } = await db.query(
      `INSERT INTO leaves (employee_id, leave_type, start_date, end_date, days, reason, destination)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [employeeId, code, start, end, days, reason || null, destination || null]);
    const leave = rows[0];
    const request = await createRequest(db, {
      type: wt[0], employee: emp, userId: u.id,
      title: `${type.label} du ${start} au ${end}`, description: reason,
      payload: { leave_id: leave.id, start_date: start, end_date: end, days, leave_type: code, destination },
    });
    await db.query('UPDATE leaves SET request_id = $1 WHERE id = $2', [request.id, leave.id]);
    return { ...leave, request_id: request.id, reference: request.reference };
  });
  await logActivity(u.id, `Demande d’absence : ${type.label}`, 'leave', result.id, `${days} j`, req.ip);
  res.status(201).json(result);
};

/**
 * PATCH /api/leaves/:id/cancel — annulation par l'agent.
 * En attente : la demande est annulée. Approuvée et non commencée : le solde est recrédité.
 */
export const cancelLeave = async (req, res) => {
  const id = toInt(req.params.id);
  await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT * FROM leaves WHERE id = $1 FOR UPDATE', [id]);
    const leave = rows[0];
    if (!leave) throw new AppError('Absence introuvable', 404);
    const isHR = isGestionnaire(req.user) && (await findEmployeeById(leave.employee_id)).institution_id === req.user.institution_id;
    if (leave.employee_id !== req.user.employee_id && !isHR) throw new AppError('Accès refusé', 403);
    assert(['pending', 'approved'].includes(leave.status), 'Cette absence ne peut plus être annulée', 409);
    if (leave.status === 'pending') {
      await performAction(db, req.user, leave.request_id, { action: 'cancel', comment: 'Annulée par l’agent' });
      return;
    }
    if (!isHR) assert(leave.start_date > toISODate(), 'Une absence déjà commencée ne peut être annulée que par la DRH');
    const bal = await leaveBalanceRow(db, leave.employee_id, leave.leave_type, Number(leave.start_date.slice(0, 4)));
    if (bal) {
      await db.query('UPDATE leave_balances SET used = GREATEST(0, used - $1) WHERE employee_id = $2 AND leave_type = $3 AND year = $4',
        [leave.days, leave.employee_id, leave.leave_type, bal.year]);
    }
    await db.query(`UPDATE leaves SET status = 'cancelled', decided_at = now() WHERE id = $1`, [id]);
  });
  await logActivity(req.user.id, 'Annulation d’absence', 'leave', id, null, req.ip);
  res.json({ ok: true });
};
