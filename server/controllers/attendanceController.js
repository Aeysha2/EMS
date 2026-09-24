import { query, withTransaction } from '../config/db.js';
import { isGestionnaire } from '../middleware/auth.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { isValidISODate, monthBounds, toISODate } from '../utils/dates.js';
import { notifyEmployee } from '../utils/notify.js';
import { toInt } from '../utils/sanitize.js';

const STANDARD_HOURS = Number(process.env.WORK_HOURS_PER_DAY || 8);
const WORK_START = process.env.WORK_START || '08:00';
const GRACE_MINUTES = Number(process.env.LATE_GRACE_MINUTES || 15);
const round2 = (n) => Math.round(n * 100) / 100;

export const computeHours = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return { working_hours: 0, overtime: 0 };
  const hours = Math.max(0, (new Date(checkOut) - new Date(checkIn)) / 36e5);
  return { working_hours: round2(hours), overtime: round2(Math.max(0, hours - STANDARD_HOURS)) };
};

export const isLate = (date) => {
  const [h, m] = WORK_START.split(':').map(Number);
  return date.getHours() * 60 + date.getMinutes() > h * 60 + m + GRACE_MINUTES;
};

const onApprovedLeave = async (employeeId, date, db = { query }) => {
  const { rows } = await db.query(
    `SELECT leave_type FROM leaves WHERE employee_id = $1 AND status = 'approved' AND $2::date BETWEEN start_date AND end_date`,
    [employeeId, date]);
  return rows[0]?.leave_type || null;
};

/**
 * Enregistre un pointage (arrivée puis départ) — utilisé par le portail, le mobile et les terminaux biométriques.
 * Un seul enregistrement par agent et par jour : la base garantit l'absence de doublon.
 */
export const recordPunch = async (db, employeeId, at, { source, deviceId = null, latitude = null, longitude = null }) => {
  const day = toISODate(at);
  const { rows } = await db.query(
    `INSERT INTO attendance (employee_id, work_date, check_in, status, source, device_id, latitude, longitude)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (employee_id, work_date) DO NOTHING RETURNING *`,
    [employeeId, day, at, isLate(at) ? 'late' : 'present', source, deviceId, latitude, longitude]);
  if (rows[0]) return { kind: 'check_in', record: rows[0] };
  const { rows: cur } = await db.query('SELECT * FROM attendance WHERE employee_id = $1 AND work_date = $2', [employeeId, day]);
  const rec = cur[0];
  if (!rec.check_in || rec.check_out || new Date(at) <= new Date(rec.check_in)) return { kind: 'ignored', record: rec };
  const { working_hours: wh, overtime } = computeHours(rec.check_in, at);
  const { rows: upd } = await db.query(
    `UPDATE attendance SET check_out = $1, working_hours = $2, overtime = $3,
            status = CASE WHEN $2::numeric < $4::numeric THEN 'half_day' ELSE status END
      WHERE id = $5 AND check_out IS NULL RETURNING *`,
    [at, wh, overtime, STANDARD_HOURS / 2, rec.id]);
  return { kind: upd[0] ? 'check_out' : 'ignored', record: upd[0] || rec };
};

const requireEmployee = (user) => {
  if (!user.employee_id) throw new AppError('Aucun dossier agent lié à ce compte', 400);
  return user.employee_id;
};

/** POST /api/attendance/check-in — pointage portail / mobile (GPS facultatif) */
export const checkIn = async (req, res) => {
  const employeeId = requireEmployee(req.user);
  const now = new Date();
  if (await onApprovedLeave(employeeId, toISODate(now))) throw new AppError('Vous êtes en absence autorisée aujourd’hui', 400);
  const lat = req.body?.latitude ?? null;
  const lng = req.body?.longitude ?? null;
  assert(lat === null || (Number(lat) >= -90 && Number(lat) <= 90), 'Latitude invalide');
  assert(lng === null || (Number(lng) >= -180 && Number(lng) <= 180), 'Longitude invalide');
  const { rows } = await query(
    `INSERT INTO attendance (employee_id, work_date, check_in, status, source, latitude, longitude)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (employee_id, work_date) DO NOTHING RETURNING *`,
    [employeeId, toISODate(now), now, isLate(now) ? 'late' : 'present', lat !== null ? 'mobile' : 'portail', lat, lng]);
  if (!rows[0]) throw new AppError('Vous avez déjà pointé votre arrivée aujourd’hui', 409);
  res.status(201).json(rows[0]);
};

/** POST /api/attendance/check-out */
export const checkOut = async (req, res) => {
  const employeeId = requireEmployee(req.user);
  const { rows } = await query('SELECT * FROM attendance WHERE employee_id = $1 AND work_date = $2', [employeeId, toISODate()]);
  if (!rows[0]?.check_in) throw new AppError('Aucun pointage d’arrivée aujourd’hui', 400);
  if (rows[0].check_out) throw new AppError('Vous avez déjà pointé votre départ aujourd’hui', 409);
  const { record } = await recordPunch({ query }, employeeId, new Date(), { source: rows[0].source });
  res.json(record);
};

/** GET /api/attendance/today */
export const today = async (req, res) => {
  const employeeId = requireEmployee(req.user);
  const { rows } = await query('SELECT * FROM attendance WHERE employee_id = $1 AND work_date = $2', [employeeId, toISODate()]);
  res.json(rows[0] || null);
};

/** Filtre de périmètre : mine | team (chef) | institution (gestionnaire) */
const scopeFilter = (user, scope, add) => {
  if (scope === 'institution') {
    assert(isGestionnaire(user), 'Réservé aux gestionnaires RH', 403);
    add('s.institution_id = ?', user.institution_id);
  } else if (scope === 'team') {
    assert(user.isChef, 'Réservé aux responsables de structure', 403);
    add('e.structure_id = ANY(?)', user.managed_structures);
  } else {
    add('a.employee_id = ?', requireEmployee(user));
  }
};

/** GET /api/attendance?scope=&from=&to=&status=&source=&employee= */
export const listAttendance = async (req, res) => {
  const params = [];
  const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };
  scopeFilter(req.user, req.query.scope || 'mine', add);
  if (req.query.employee) add('a.employee_id = ?', toInt(req.query.employee));
  if (req.query.from && isValidISODate(req.query.from)) add('a.work_date >= ?', req.query.from);
  if (req.query.to && isValidISODate(req.query.to)) add('a.work_date <= ?', req.query.to);
  if (req.query.status) add('a.status = ?', req.query.status);
  if (req.query.source) add('a.source = ?', req.query.source);
  const { rows } = await query(
    `SELECT a.*, e.full_name, e.sigrh_id, s.name AS structure_name
       FROM attendance a JOIN employees e ON e.id = a.employee_id LEFT JOIN structures s ON s.id = e.structure_id
      WHERE ${where.join(' AND ')} ORDER BY a.work_date DESC, e.last_name LIMIT 500`, params);
  res.json(rows);
};

/** POST /api/attendance — saisie ou correction manuelle (gestionnaire RH) */
export const upsertAttendance = async (req, res) => {
  assert(isGestionnaire(req.user), 'Réservé aux gestionnaires RH', 403);
  const { employee_id: employeeId, work_date: day, check_in: ci, check_out: co, status, note } = req.body;
  assert(toInt(employeeId), 'Agent requis');
  assert(isValidISODate(day), 'Date invalide');
  const { rows: e } = await query('SELECT s.institution_id FROM employees e JOIN structures s ON s.id = e.structure_id WHERE e.id = $1',
    [toInt(employeeId)]);
  assert(e[0]?.institution_id === req.user.institution_id, 'Agent hors de votre institution', 403);
  const inTs = ci ? new Date(ci) : null;
  const outTs = co ? new Date(co) : null;
  assert(!(inTs && outTs) || outTs > inTs, 'Le départ doit être après l’arrivée');
  const { working_hours: wh, overtime } = computeHours(inTs, outTs);
  const { rows } = await query(
    `INSERT INTO attendance (employee_id, work_date, check_in, check_out, working_hours, overtime, status, source, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'manuel',$8)
     ON CONFLICT (employee_id, work_date) DO UPDATE SET check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out,
       working_hours = EXCLUDED.working_hours, overtime = EXCLUDED.overtime, status = EXCLUDED.status,
       source = 'manuel', note = EXCLUDED.note
     RETURNING *`,
    [toInt(employeeId), day, inTs, outTs, wh, overtime, status || (inTs ? (isLate(inTs) ? 'late' : 'present') : 'absent'),
      note || null]);
  await logActivity(req.user.id, 'Correction de pointage', 'attendance', rows[0].id, `agent #${employeeId} – ${day}`, req.ip);
  res.json(rows[0]);
};

/** POST /api/attendance/close-day { date } — clôture : absents, absences autorisées, missions ; notifie les pointages manquants */
export const closeDay = async (req, res) => {
  assert(isGestionnaire(req.user), 'Réservé aux gestionnaires RH', 403);
  const date = req.body?.date || toISODate();
  assert(isValidISODate(date), 'Date invalide');
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
  assert(wd !== 0 && wd !== 6, 'Ce jour est un week-end');
  const inst = req.user.institution_id;
  const result = await withTransaction(async (db) => {
    const leaveRows = await db.query(
      `INSERT INTO attendance (employee_id, work_date, status, source)
       SELECT e.id, $1::date, CASE WHEN l.leave_type = 'mission' THEN 'mission' ELSE 'on_leave' END, 'cloture'
         FROM employees e JOIN structures s ON s.id = e.structure_id
         JOIN leaves l ON l.employee_id = e.id AND l.status = 'approved' AND $1::date BETWEEN l.start_date AND l.end_date
        WHERE s.institution_id = $2 AND e.position_statutaire IN ('activite','stage')
       ON CONFLICT DO NOTHING RETURNING employee_id`, [date, inst]);
    const absent = await db.query(
      `INSERT INTO attendance (employee_id, work_date, status, source)
       SELECT e.id, $1::date, 'absent', 'cloture' FROM employees e JOIN structures s ON s.id = e.structure_id
        WHERE s.institution_id = $2 AND e.position_statutaire IN ('activite','stage')
          AND COALESCE(e.date_prise_service, e.date_entree_fp, '1900-01-01') <= $1::date
       ON CONFLICT DO NOTHING RETURNING employee_id`, [date, inst]);
    for (const { employee_id: id } of absent.rows) {
      await notifyEmployee(id, 'attendance', 'Pointage manquant',
        `Aucun pointage enregistré le ${date}. Contactez votre DRH si c’est une erreur.`, '/attendance', db);
    }
    return { absent: absent.rowCount, onLeave: leaveRows.rowCount };
  });
  await logActivity(req.user.id, 'Clôture des présences', 'attendance', null, `${date} : ${result.absent} absent(s)`, req.ip);
  res.json({ date, ...result });
};

/** GET /api/attendance/report?year=&month=&scope= — rapport mensuel et taux d'absentéisme */
export const monthlyReport = async (req, res) => {
  const now = new Date();
  const year = toInt(req.query.year, now.getFullYear());
  const month = toInt(req.query.month, now.getMonth() + 1);
  assert(month >= 1 && month <= 12, 'Mois invalide');
  const { start, end } = monthBounds(year, month);
  const params = [start, end];
  const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`).replace('a.employee_id', 'e.id')); };
  scopeFilter(req.user, req.query.scope || (isGestionnaire(req.user) ? 'institution' : req.user.isChef ? 'team' : 'mine'), add);
  const { rows } = await query(
    `SELECT e.id, e.sigrh_id, e.full_name, s.name AS structure_name,
            COUNT(a.id) FILTER (WHERE a.status IN ('present','late','half_day')) AS present_days,
            COUNT(a.id) FILTER (WHERE a.status = 'late') AS late_days,
            COUNT(a.id) FILTER (WHERE a.status = 'absent') AS absent_days,
            COUNT(a.id) FILTER (WHERE a.status IN ('on_leave','mission')) AS leave_days,
            COUNT(a.id) FILTER (WHERE a.source = 'biometrie') AS biometric_punches,
            COALESCE(SUM(a.working_hours), 0) AS total_hours, COALESCE(SUM(a.overtime), 0) AS overtime_hours
       FROM employees e LEFT JOIN structures s ON s.id = e.structure_id
       LEFT JOIN attendance a ON a.employee_id = e.id AND a.work_date BETWEEN $1 AND $2
      WHERE e.position_statutaire IN ('activite','stage') AND ${where.join(' AND ')}
      GROUP BY e.id, s.name ORDER BY s.name, e.last_name`, params);
  const worked = rows.reduce((t, r) => t + r.present_days + r.absent_days, 0);
  const absent = rows.reduce((t, r) => t + r.absent_days, 0);
  res.json({ year, month, start, end, absenteeism_rate: worked ? Math.round((absent / worked) * 1000) / 10 : 0, rows });
};
