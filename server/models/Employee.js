import { query } from '../config/db.js';

/** Full employee row (sensitive fields included) joined with department. */
export const EMPLOYEE_SELECT = `
  SELECT e.*, d.name AS department_name,
         u.id AS user_id, u.role AS user_role
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN users u ON u.employee_id = e.id`;

/** Fields any authenticated user may see about a colleague (directory view). */
export const PUBLIC_FIELDS = [
  'id', 'employee_code', 'full_name', 'email', 'department_id', 'department_name',
  'designation', 'grade', 'status',
];

export const toPublic = (emp) => Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, emp[k]]));

export const findEmployeeById = async (id, db = { query }) => {
  const { rows } = await db.query(`${EMPLOYEE_SELECT} WHERE e.id = $1`, [id]);
  return rows[0] || null;
};

/** Generate the next EMPxxx code. */
export const nextEmployeeCode = async (db = { query }) => {
  const { rows } = await db.query(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(employee_code, '\\D', '', 'g'), '')::int), 100) + 1 AS n
       FROM employees`
  );
  return `EMP${rows[0].n}`;
};

/** Reset annual leave balances when the calendar year changed. */
export const refreshLeaveBalances = async (db = { query }) => {
  await db.query(
    `UPDATE employees
        SET casual_balance = 12, sick_balance = 10, paid_balance = 24,
            balance_year = EXTRACT(YEAR FROM CURRENT_DATE)
      WHERE balance_year < EXTRACT(YEAR FROM CURRENT_DATE)`
  );
};
