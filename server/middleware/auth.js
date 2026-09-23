import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import AppError from '../utils/AppError.js';

export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

/** Verify JWT and load the current user (role is always read from the DB). */
export const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError('Authentification requise', 401);

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new AppError('Session invalide ou expirée', 401);
  }

  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.employee_id, u.is_active,
            (SELECT COALESCE(array_agg(d.id), '{}') FROM departments d
              WHERE d.manager_id = u.employee_id AND u.employee_id IS NOT NULL) AS managed_departments
       FROM users u WHERE u.id = $1`,
    [payload.id]
  );
  const user = rows[0];
  if (!user || !user.is_active) throw new AppError('Compte introuvable ou désactivé', 401);

  req.user = user;
  req.user.isManager = user.managed_departments.length > 0;
  next();
};

/** Restrict a route to the given roles. */
export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    throw new AppError('Accès refusé : droits insuffisants', 403);
  }
  next();
};

export const isHRorAdmin = (user) => user.role === 'admin' || user.role === 'hr';
