import { query } from '../config/db.js';

/** Record an HR activity (audit log). Never throws. */
export const logActivity = async (userId, action, entity = null, entityId = null, details = null, db = { query }) => {
  try {
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [userId ?? null, action, entity, entityId, details]
    );
  } catch (err) {
    console.error('audit log failed:', err.message);
  }
};
