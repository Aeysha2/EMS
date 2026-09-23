import { query } from '../config/db.js';

export const USER_PUBLIC = 'id, name, email, role, employee_id, is_active, last_login_at, created_at';

export const findUserByEmail = async (email) => {
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  return rows[0] || null;
};

export const findUserById = async (id) => {
  const { rows } = await query(`SELECT ${USER_PUBLIC} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
};
