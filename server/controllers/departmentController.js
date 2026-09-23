import { query } from '../config/db.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { buildUpdate, pick, toInt } from '../utils/sanitize.js';

const FIELDS = ['name', 'code', 'description', 'budget', 'manager_id'];

const DEPT_SELECT = `
  SELECT d.*, m.full_name AS manager_name, m.employee_code AS manager_code,
         COUNT(e.id) FILTER (WHERE e.status <> 'terminated') AS employee_count,
         COALESCE(SUM(e.salary) FILTER (WHERE e.status <> 'terminated'), 0) AS monthly_salary_cost
    FROM departments d
    LEFT JOIN employees m ON m.id = d.manager_id
    LEFT JOIN employees e ON e.department_id = d.id`;

const clean = (data) => {
  if (data.manager_id === '') data.manager_id = null;
  if (data.code === '') data.code = null;
  if (data.budget !== undefined) assert(Number(data.budget) >= 0, 'Budget invalide');
  return data;
};

const findDept = async (id) => {
  const { rows } = await query(`${DEPT_SELECT} WHERE d.id = $1 GROUP BY d.id, m.id`, [id]);
  return rows[0];
};

/** GET /api/departments */
export const listDepartments = async (req, res) => {
  const { rows } = await query(`${DEPT_SELECT} GROUP BY d.id, m.id ORDER BY d.name`);
  res.json(rows);
};

/** GET /api/departments/:id — with members */
export const getDepartment = async (req, res) => {
  const id = toInt(req.params.id);
  const dept = await findDept(id);
  if (!dept) throw new AppError('Département introuvable', 404);
  const { rows } = await query(
    `SELECT id, employee_code, full_name, designation, email, status FROM employees
      WHERE department_id = $1 ORDER BY full_name`,
    [id]
  );
  res.json({ ...dept, members: rows });
};

/** POST /api/departments (Admin/HR) */
export const createDepartment = async (req, res) => {
  const data = clean(pick(req.body, FIELDS));
  assert(data.name, 'Le nom du département est requis');
  const cols = Object.keys(data);
  const { rows } = await query(
    `INSERT INTO departments (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    Object.values(data)
  );
  await logActivity(req.user.id, 'Création département', 'department', rows[0].id, data.name);
  res.status(201).json(await findDept(rows[0].id));
};

/** PUT /api/departments/:id (Admin/HR) */
export const updateDepartment = async (req, res) => {
  const id = toInt(req.params.id);
  const data = clean(pick(req.body, FIELDS));
  assert(Object.keys(data).length, 'Aucune modification');
  const { set, values, next } = buildUpdate(data);
  const { rowCount } = await query(
    `UPDATE departments SET ${set}, updated_at = now() WHERE id = $${next}`,
    [...values, id]
  );
  if (!rowCount) throw new AppError('Département introuvable', 404);
  const dept = await findDept(id);
  await logActivity(req.user.id, 'Modification département', 'department', id, dept.name);
  res.json(dept);
};

/** DELETE /api/departments/:id (Admin) */
export const deleteDepartment = async (req, res) => {
  const id = toInt(req.params.id);
  const { rows } = await query('DELETE FROM departments WHERE id = $1 RETURNING name', [id]);
  if (!rows[0]) throw new AppError('Département introuvable', 404);
  await logActivity(req.user.id, 'Suppression département', 'department', id, rows[0].name);
  res.json({ message: 'Département supprimé (les employés sont désormais sans département)' });
};
