import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { USER_PUBLIC } from '../models/User.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { notifyUser } from '../utils/notify.js';
import { toInt } from '../utils/sanitize.js';

/** GET /api/users (Admin) */
export const listUsers = async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.employee_id, u.is_active, u.last_login_at, u.created_at,
            e.employee_code, d.name AS department_name
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
      ORDER BY u.created_at DESC`
  );
  res.json(rows);
};

/** PATCH /api/users/:id (Admin) — change role / activate / reset password */
export const updateUser = async (req, res) => {
  const id = toInt(req.params.id);
  const { role, is_active: isActive, password } = req.body;
  assert(id !== req.user.id || (role === undefined && isActive === undefined),
    'Vous ne pouvez pas modifier votre propre rôle ou statut');

  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  if (!rows[0]) throw new AppError('Utilisateur introuvable', 404);

  if (role !== undefined) {
    assert(['admin', 'hr', 'employee'].includes(role), 'Rôle invalide');
    await query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    await notifyUser(id, 'account', 'Votre rôle a été modifié', `Nouveau rôle : ${role}`);
  }
  if (isActive !== undefined) await query('UPDATE users SET is_active = $1 WHERE id = $2', [!!isActive, id]);
  if (password) {
    assert(password.length >= 8, 'Mot de passe : 8 caractères minimum');
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(password, 12), id]);
  }

  await logActivity(req.user.id, 'Modification compte', 'user', id,
    [role && `rôle=${role}`, isActive !== undefined && `actif=${isActive}`, password && 'mot de passe réinitialisé']
      .filter(Boolean).join(', '));
  const updated = await query(`SELECT ${USER_PUBLIC} FROM users WHERE id = $1`, [id]);
  res.json(updated.rows[0]);
};

/** GET /api/users/activity (Admin/HR) — audit log */
export const activityLog = async (req, res) => {
  const limit = Math.min(200, toInt(req.query.limit, 50));
  const { rows } = await query(
    `SELECT a.*, u.name AS user_name FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC LIMIT $1`,
    [limit]
  );
  res.json(rows);
};
