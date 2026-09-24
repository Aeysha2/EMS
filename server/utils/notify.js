import { query } from '../config/db.js';

/** Notifier une liste de comptes. */
export const notifyUsers = async (userIds, type, title, message = null, link = null, db = { query }) => {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return;
  await db.query(
    `INSERT INTO notifications (user_id, type, title, message, link)
     SELECT id, $2, $3, $4, $5 FROM users WHERE id = ANY($1) AND is_active`,
    [ids, type, title, message, link]
  );
};

/** Notifier le compte lié à un agent. */
export const notifyEmployee = async (employeeId, type, title, message = null, link = null, db = { query }) => {
  if (!employeeId) return;
  await db.query(
    `INSERT INTO notifications (user_id, type, title, message, link)
     SELECT id, $2, $3, $4, $5 FROM users WHERE employee_id = $1 AND is_active`,
    [employeeId, type, title, message, link]
  );
};

/**
 * Notifier par rôle, éventuellement limité à une institution.
 * roles vide = tous les rôles ; institutionId null = national.
 */
export const notifyRoles = async (roles, type, title, message = null, link = null, institutionId = null, db = { query }) => {
  await db.query(
    `INSERT INTO notifications (user_id, type, title, message, link)
     SELECT u.id, $2, $3, $4, $5 FROM users u
       LEFT JOIN structures s ON s.id = u.structure_id
      WHERE u.is_active
        AND (cardinality($1::text[]) = 0 OR u.role = ANY($1))
        AND ($6::int IS NULL OR s.institution_id = $6)`,
    [roles || [], type, title, message, link, institutionId]
  );
};
