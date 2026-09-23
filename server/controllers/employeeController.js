import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../config/db.js';
import { isHRorAdmin } from '../middleware/auth.js';
import { EMPLOYEE_SELECT, findEmployeeById, nextEmployeeCode, toPublic } from '../models/Employee.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { isValidISODate } from '../utils/dates.js';
import { buildUpdate, pagination, pick, toInt } from '../utils/sanitize.js';

const EDITABLE = [
  'full_name', 'email', 'phone', 'department_id', 'designation', 'grade', 'matricule',
  'date_of_joining', 'date_of_birth', 'address', 'salary', 'status',
  'casual_balance', 'sick_balance', 'paid_balance',
];
const SELF_EDITABLE = ['phone', 'address'];
const SORTS = {
  name: 'e.full_name', code: 'e.employee_code', joining: 'e.date_of_joining',
  salary: 'e.salary', department: 'd.name', designation: 'e.designation',
};

const canSeeFull = (user, emp) =>
  isHRorAdmin(user) || user.employee_id === emp.id;

const canSeeTeam = (user, emp) => user.managed_departments.includes(emp.department_id);

/** Strip salary / private data depending on who is asking (challenge #9). */
const shape = (user, emp) => {
  if (canSeeFull(user, emp)) return emp;
  if (canSeeTeam(user, emp)) {
    const { salary, address, date_of_birth, ...rest } = emp; // eslint-disable-line no-unused-vars
    return rest;
  }
  return toPublic(emp);
};

const validate = (data) => {
  if (data.email !== undefined) assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email), 'Email invalide');
  if (data.salary !== undefined) assert(Number(data.salary) >= 0, 'Salaire invalide');
  for (const f of ['date_of_joining', 'date_of_birth']) {
    if (data[f]) assert(isValidISODate(data[f]), `Date invalide : ${f}`);
    if (data[f] === '') data[f] = null;
  }
  if (data.department_id === '') data.department_id = null;
  if (data.matricule === '') data.matricule = null;
  if (data.email) data.email = data.email.toLowerCase();
};

/**
 * GET /api/employees — advanced search (challenge #8)
 * ?q=&department=&status=&designation=&joinedFrom=&joinedTo=&minSalary=&maxSalary=&sort=name&order=asc&page=&limit=
 */
export const listEmployees = async (req, res) => {
  const { q, status, designation, joinedFrom, joinedTo, minSalary, maxSalary } = req.query;
  const { page, limit, offset } = pagination(req.query);
  const hr = isHRorAdmin(req.user);
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };

  if (q) add(`(e.full_name ILIKE ? OR e.employee_code ILIKE ? OR e.email ILIKE ?
              OR e.matricule ILIKE ? OR e.designation ILIKE ? OR d.name ILIKE ?)`, `%${q}%`);
  if (req.query.department) add('e.department_id = ?', toInt(req.query.department));
  if (status) add('e.status = ?', status);
  if (designation) add('e.designation ILIKE ?', `%${designation}%`);
  if (joinedFrom && isValidISODate(joinedFrom)) add('e.date_of_joining >= ?', joinedFrom);
  if (joinedTo && isValidISODate(joinedTo)) add('e.date_of_joining <= ?', joinedTo);
  // Salary filters are only honoured for HR/Admin so salaries cannot be inferred
  if (hr && minSalary) add('e.salary >= ?', Number(minSalary));
  if (hr && maxSalary) add('e.salary <= ?', Number(maxSalary));

  let sortCol = SORTS[req.query.sort] || SORTS.name;
  if (!hr && sortCol === SORTS.salary) sortCol = SORTS.name;
  const order = req.query.order === 'desc' ? 'DESC' : 'ASC';
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [list, count] = await Promise.all([
    query(
      `${EMPLOYEE_SELECT} ${whereSql} ORDER BY ${sortCol} ${order}, e.id LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
    query(`SELECT COUNT(*) FROM employees e LEFT JOIN departments d ON d.id = e.department_id ${whereSql}`, params),
  ]);

  res.json({
    data: list.rows.map((e) => shape(req.user, e)),
    total: count.rows[0].count,
    page,
    limit,
  });
};

/** GET /api/employees/:id */
export const getEmployee = async (req, res) => {
  const emp = await findEmployeeById(toInt(req.params.id));
  if (!emp) throw new AppError('Employé introuvable', 404);
  res.json(shape(req.user, emp));
};

/** GET /api/employees/me — self-service profile */
export const getMe = async (req, res) => {
  if (!req.user.employee_id) throw new AppError('Aucun dossier employé lié à ce compte', 404);
  res.json(await findEmployeeById(req.user.employee_id));
};

/** PUT /api/employees/me — self-service update of contact details */
export const updateMe = async (req, res) => {
  if (!req.user.employee_id) throw new AppError('Aucun dossier employé lié à ce compte', 404);
  const fields = pick(req.body, SELF_EDITABLE);
  assert(Object.keys(fields).length, 'Aucune modification');
  const { set, values, next } = buildUpdate(fields);
  await query(`UPDATE employees SET ${set}, updated_at = now() WHERE id = $${next}`, [...values, req.user.employee_id]);
  await logActivity(req.user.id, 'Mise à jour du profil', 'employee', req.user.employee_id);
  res.json(await findEmployeeById(req.user.employee_id));
};

/**
 * POST /api/employees (HR/Admin)
 * Optional: { createAccount: true, password, role } to create the login at the same time.
 */
export const createEmployee = async (req, res) => {
  const data = pick(req.body, EDITABLE);
  assert(data.full_name, 'Le nom complet est requis');
  assert(data.email, "L'email est requis");
  validate(data);

  const { createAccount, password } = req.body;
  let role = req.body.role || 'employee';
  if (req.user.role !== 'admin') role = 'employee'; // only admins grant elevated roles
  if (createAccount) {
    assert(typeof password === 'string' && password.length >= 8, 'Mot de passe initial : 8 caractères minimum');
    assert(['admin', 'hr', 'employee'].includes(role), 'Rôle invalide');
  }

  const id = await withTransaction(async (client) => {
    const code = req.body.employee_code || (await nextEmployeeCode(client));
    const cols = ['employee_code', ...Object.keys(data)];
    const vals = [code, ...Object.values(data)];
    const { rows } = await client.query(
      `INSERT INTO employees (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      vals
    );
    if (createAccount) {
      await client.query(
        'INSERT INTO users (name, email, password_hash, role, employee_id) VALUES ($1,$2,$3,$4,$5)',
        [data.full_name, data.email, await bcrypt.hash(password, 12), role, rows[0].id]
      );
    }
    return rows[0].id;
  });

  const emp = await findEmployeeById(id);
  await logActivity(req.user.id, 'Création employé', 'employee', id, `${emp.employee_code} – ${emp.full_name}`);
  res.status(201).json(emp);
};

/** PUT /api/employees/:id (HR/Admin) */
export const updateEmployee = async (req, res) => {
  const id = toInt(req.params.id);
  const before = await findEmployeeById(id);
  if (!before) throw new AppError('Employé introuvable', 404);

  const data = pick(req.body, EDITABLE);
  validate(data);
  assert(Object.keys(data).length, 'Aucune modification');

  const { set, values, next } = buildUpdate(data);
  await query(`UPDATE employees SET ${set}, updated_at = now() WHERE id = $${next}`, [...values, id]);
  if (data.full_name) await query('UPDATE users SET name = $1 WHERE employee_id = $2', [data.full_name, id]);

  const changes = Object.keys(data)
    .filter((k) => String(before[k] ?? '') !== String(data[k] ?? ''))
    .map((k) => (k === 'salary' ? `salaire ${before.salary} → ${data.salary}` : k));
  await logActivity(req.user.id, 'Modification employé', 'employee', id,
    `${before.full_name}: ${changes.join(', ') || 'aucun changement'}`);
  res.json(await findEmployeeById(id));
};

/** DELETE /api/employees/:id (Admin) */
export const deleteEmployee = async (req, res) => {
  const id = toInt(req.params.id);
  assert(id !== req.user.employee_id, 'Vous ne pouvez pas supprimer votre propre dossier', 400);
  const rows = await withTransaction(async (client) => {
    // The linked login is disabled rather than deleted so the audit trail stays intact
    await client.query('UPDATE users SET is_active = FALSE WHERE employee_id = $1', [id]);
    const res2 = await client.query('DELETE FROM employees WHERE id = $1 RETURNING full_name, employee_code', [id]);
    return res2.rows;
  });
  if (!rows[0]) throw new AppError('Employé introuvable', 404);
  await logActivity(req.user.id, 'Suppression employé', 'employee', id, `${rows[0].employee_code} – ${rows[0].full_name}`);
  res.json({ message: 'Employé supprimé' });
};
