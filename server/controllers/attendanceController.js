import { query, withTransaction } from '../config/db.js';
import { isHRorAdmin } from '../middleware/auth.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { isValidISODate, monthBounds, toISODate } from '../utils/dates.js';
import { notifyEmployee } from '../utils/notify.js';
import { toInt } from '../utils/sanitize.js';

const STANDARD_HOURS = Number(process.env.WORK_HOURS_PER_DAY || 8);
const WORK_START = process.env.WORK_START || '08:00'; // HH:MM
const GRACE_MINUTES = Number(process.env.LATE_GRACE_MINUTES || 15);

const round2 = (n) => Math.round(n * 100) / 100;

export const computeHours = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return { working_hours: 0, overtime: 0 };
  const hours = Math.max(0, (new Date(checkOut) - new Date(checkIn)) / 36e5);
  return { working_hours: round2(hours), overtime: round2(Math.max(0, hours - STANDARD_HOURS)) };
};

const isLate = (date) => {
  const [h, m] = WORK_START.split(':').map(Number);
  return date.getHours() * 60 + date.getMinutes() > h * 60 + m + GRACE_MINUTES;
};

const requireEmployee = (user) => {
  if (!user.employee_id) throw new AppError('Aucun dossier employé lié à ce compte', 400);
  return user.employee_id;
};

const onApprovedLeave = async (employeeId, date) => {
  const { rows } = await query(
    `SELECT 1 FROM leaves WHERE employee_id = $1 AND status = 'approved'
        AND $2::date BETWEEN start_date AND end_date`,
    [employeeId, date]
  );
  return rows.length > 0;
};

/** POST /api/attendance/check-in — optional GPS { latitude, longitude } */
export const checkIn = async (req, res) => {
  const employeeId = requireEmployee(req.user);
  const now = new Date();
  const today = toISODate(now);
  if (await onApprovedLeave(employeeId, today)) {
    throw new AppError('Vous êtes en congé approuvé aujourd’hui', 400);
  }
  const { latitude, longitude, note } = req.body || {};
  const lat = latitude !== undefined && latitude !== null ? Number(latitude) : null;
  const lng = longitude !== undefined && longitude !== null ? Number(longitude) : null;
  assert(lat === null || (lat >= -90 && lat <= 90), 'Latitude invalide');
  assert(lng === null || (lng >= -180 && lng <= 180), 'Longitude invalide');

  // ON CONFLICT DO NOTHING + unique(employee_id, work_date) => no duplicate check-in even on double click
  const { rows } = await query(
    `INSERT INTO attendance (employee_id, work_date, check_in, status, latitude, longitude, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (employee_id, work_date) DO NOTHING RETURNING *`,
    [employeeId, today, now, isLate(now) ? 'late' : 'present', lat, lng, note || null]
  );
  if (!rows[0]) throw new AppError('Vous avez déjà pointé votre arrivée aujourd’hui', 409);
  res.status(201).json(rows[0]);
};

/** POST /api/attendance/check-out */
export const checkOut = async (req, res) => {
  const employeeId = requireEmployee(req.user);
  const now = new Date();
  const today = toISODate(now);
  const { rows } = await query(
    'SELECT * FROM attendance WHERE employee_id = $1 AND work_date = $2',
    [employeeId, today]
  );
  const record = rows[0];
  if (!record || !record.check_in) throw new AppError('Aucun pointage d’arrivée trouvé pour aujourd’hui', 400);
  if (record.check_out) throw new AppError('Vous avez déjà pointé votre départ aujourd’hui', 409);

  const { working_hours: wh, overtime } = computeHours(record.check_in, now);
  const status = wh < STANDARD_HOURS / 2 ? 'half_day' : record.status;
  const updated = await query(
    `UPDATE attendance SET check_out = $1, working_hours = $2, overtime = $3, status = $4
      WHERE id = $5 AND check_out IS NULL RETURNING *`,
    [now, wh, overtime, status, record.id]
  );
  if (!updated.rows[0]) throw new AppError('Départ déjà enregistré', 409);
  res.json(updated.rows[0]);
};

/** GET /api/attendance/today */
export const today = async (req, res) => {
  const employeeId = requireEmployee(req.user);
  const { rows } = await query(
    'SELECT * FROM attendance WHERE employee_id = $1 AND work_date = $2',
    [employeeId, toISODate()]
  );
  res.json(rows[0] || null);
};

/** GET /api/attendance?employee=&from=&to=&status=&department= */
export const listAttendance = async (req, res) => {
  const params = [];
  const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };

  if (isHRorAdmin(req.user)) {
    if (req.query.employee) add('a.employee_id = ?', toInt(req.query.employee));
    if (req.query.department) add('e.department_id = ?', toInt(req.query.department));
  } else if (req.user.isManager && req.query.scope === 'team') {
    add('e.department_id = ANY(?)', req.user.managed_departments);
    if (req.query.employee) add('a.employee_id = ?', toInt(req.query.employee));
  } else {
    add('a.employee_id = ?', requireEmployee(req.user));
  }
  if (req.query.from && isValidISODate(req.query.from)) add('a.work_date >= ?', req.query.from);
  if (req.query.to && isValidISODate(req.query.to)) add('a.work_date <= ?', req.query.to);
  if (req.query.status) add('a.status = ?', req.query.status);

  const { rows } = await query(
    `SELECT a.*, e.full_name, e.employee_code, d.name AS department_name
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.work_date DESC, e.full_name LIMIT 500`,
    params
  );
  res.json(rows);
};

/** POST /api/attendance (HR/Admin) — manual entry / correction; upserts the day */
export const upsertAttendance = async (req, res) => {
  const { employee_id: employeeId, work_date: workDate, check_in: ci, check_out: co, status, note } = req.body;
  assert(toInt(employeeId), 'Employé requis');
  assert(isValidISODate(workDate), 'Date invalide');
  const checkInTs = ci ? new Date(ci) : null;
  const checkOutTs = co ? new Date(co) : null;
  assert(!checkInTs || !Number.isNaN(checkInTs.getTime()), 'Heure d’arrivée invalide');
  assert(!checkOutTs || !Number.isNaN(checkOutTs.getTime()), 'Heure de départ invalide');
  assert(!(checkInTs && checkOutTs) || checkOutTs > checkInTs, 'Le départ doit être après l’arrivée');

  const { working_hours: wh, overtime } = computeHours(checkInTs, checkOutTs);
  const finalStatus = status || (checkInTs ? (isLate(checkInTs) ? 'late' : 'present') : 'absent');
  const { rows } = await query(
    `INSERT INTO attendance (employee_id, work_date, check_in, check_out, working_hours, overtime, status, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (employee_id, work_date) DO UPDATE
       SET check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out,
           working_hours = EXCLUDED.working_hours, overtime = EXCLUDED.overtime,
           status = EXCLUDED.status, note = EXCLUDED.note
     RETURNING *`,
    [employeeId, workDate, checkInTs, checkOutTs, wh, overtime, finalStatus, note || null]
  );
  await logActivity(req.user.id, 'Correction pointage', 'attendance', rows[0].id, `employé #${employeeId} – ${workDate}`);
  res.json(rows[0]);
};

/**
 * POST /api/attendance/mark-absent { date } (HR/Admin)
 * Marks active employees with no attendance as absent (or on_leave) and notifies them.
 */
export const markAbsent = async (req, res) => {
  const date = req.body?.date || toISODate();
  assert(isValidISODate(date), 'Date invalide');
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  assert(weekday !== 0 && weekday !== 6, 'Ce jour est un week-end');

  const result = await withTransaction(async (client) => {
    const onLeave = await client.query(
      `INSERT INTO attendance (employee_id, work_date, status)
       SELECT e.id, $1::date, 'on_leave' FROM employees e
        WHERE e.status = 'active'
          AND EXISTS (SELECT 1 FROM leaves l WHERE l.employee_id = e.id AND l.status = 'approved'
                        AND $1::date BETWEEN l.start_date AND l.end_date)
       ON CONFLICT DO NOTHING RETURNING employee_id`,
      [date]
    );
    const absent = await client.query(
      `INSERT INTO attendance (employee_id, work_date, status)
       SELECT e.id, $1::date, 'absent' FROM employees e
        WHERE e.status = 'active' AND e.date_of_joining <= $1::date
       ON CONFLICT DO NOTHING RETURNING employee_id`,
      [date]
    );
    for (const { employee_id: id } of absent.rows) {
      await notifyEmployee(id, 'attendance', 'Pointage manquant',
        `Aucun pointage enregistré le ${date}. Contactez les RH si c’est une erreur.`, '/attendance', client);
    }
    return { absent: absent.rowCount, onLeave: onLeave.rowCount };
  });

  await logActivity(req.user.id, 'Clôture des présences', 'attendance', null,
    `${date}: ${result.absent} absent(s), ${result.onLeave} en congé`);
  res.json({ date, ...result });
};

/** GET /api/attendance/report?year=&month=&department= — monthly attendance report */
export const monthlyReport = async (req, res) => {
  const now = new Date();
  const year = toInt(req.query.year, now.getFullYear());
  const month = toInt(req.query.month, now.getMonth() + 1);
  assert(month >= 1 && month <= 12, 'Mois invalide');
  const { start, end } = monthBounds(year, month);

  const params = [start, end];
  let filter = '';
  if (isHRorAdmin(req.user)) {
    if (req.query.department) { params.push(toInt(req.query.department)); filter = `AND e.department_id = $${params.length}`; }
  } else if (req.user.isManager) {
    params.push(req.user.managed_departments); filter = `AND e.department_id = ANY($${params.length})`;
  } else {
    params.push(requireEmployee(req.user)); filter = `AND e.id = $${params.length}`;
  }

  const { rows } = await query(
    `SELECT e.id, e.employee_code, e.full_name, d.name AS department_name,
            COUNT(a.id) FILTER (WHERE a.status IN ('present','late','half_day')) AS present_days,
            COUNT(a.id) FILTER (WHERE a.status = 'late') AS late_days,
            COUNT(a.id) FILTER (WHERE a.status = 'half_day') AS half_days,
            COUNT(a.id) FILTER (WHERE a.status = 'absent') AS absent_days,
            COUNT(a.id) FILTER (WHERE a.status = 'on_leave') AS leave_days,
            COALESCE(SUM(a.working_hours), 0) AS total_hours,
            COALESCE(SUM(a.overtime), 0) AS overtime_hours
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN attendance a ON a.employee_id = e.id AND a.work_date BETWEEN $1 AND $2
      WHERE e.status <> 'terminated' ${filter}
      GROUP BY e.id, d.name
      ORDER BY d.name NULLS LAST, e.full_name`,
    params
  );
  res.json({ year, month, start, end, rows });
};
