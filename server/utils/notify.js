import { query } from '../config/db.js';

/** Notify a single user. */
export const notifyUser = async (userId, type, title, message = null, link = null, db = { query }) => {
  if (!userId) return;
  await db.query(
    'INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,$2,$3,$4,$5)',
    [userId, type, title, message, link]
  );
};

/** Notify the user account linked to an employee (if any). */
export const notifyEmployee = async (employeeId, type, title, message = null, link = null, db = { query }) => {
  if (!employeeId) return;
  await db.query(
    `INSERT INTO notifications (user_id, type, title, message, link)
     SELECT id, $2, $3, $4, $5 FROM users WHERE employee_id = $1 AND is_active`,
    [employeeId, type, title, message, link]
  );
};

/** Notify every active user having one of the given roles (or everybody when roles is empty). */
export const notifyRoles = async (roles, type, title, message = null, link = null, db = { query }) => {
  const all = !roles || roles.length === 0;
  await db.query(
    `INSERT INTO notifications (user_id, type, title, message, link)
     SELECT id, $2, $3, $4, $5 FROM users WHERE is_active AND ($6 OR role = ANY($1))`,
    [roles || [], type, title, message, link, all]
  );
};
