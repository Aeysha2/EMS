import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../config/db.js';
import { signToken } from '../middleware/auth.js';
import { findUserByEmail, USER_PUBLIC } from '../models/User.js';
import { findEmployeeById, nextEmployeeCode } from '../models/Employee.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validatePassword = (pw) => {
  assert(typeof pw === 'string' && pw.length >= 8, 'Le mot de passe doit contenir au moins 8 caractères');
  assert(/[A-Za-z]/.test(pw) && /\d/.test(pw), 'Le mot de passe doit contenir des lettres et des chiffres');
};

const buildSession = async (user) => {
  const employee = user.employee_id ? await findEmployeeById(user.employee_id) : null;
  const { rows } = await query(
    'SELECT id, name FROM departments WHERE manager_id = $1',
    [user.employee_id ?? -1]
  );
  return {
    token: signToken(user),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      employee_id: user.employee_id,
      employee,
      managedDepartments: rows,
    },
  };
};

/**
 * POST /api/auth/register
 * Public self-registration always creates an "employee" account. If HR already
 * created an employee record with the same email, the account is linked to it.
 * Higher roles are granted by an administrator.
 */
export const register = async (req, res) => {
  const { name, email, password, phone, matricule } = req.body;
  assert(name && name.length >= 2, 'Le nom est requis');
  assert(email && EMAIL_RE.test(email), 'Adresse email invalide');
  validatePassword(password);

  const existing = await findUserByEmail(email);
  if (existing) throw new AppError('Un compte existe déjà avec cet email', 409);

  const hash = await bcrypt.hash(password, 12);
  const user = await withTransaction(async (client) => {
    let { rows } = await client.query(
      'SELECT id, matricule, employee_code FROM employees WHERE lower(email) = lower($1)',
      [email]
    );
    let employeeId = rows[0]?.id;
    if (employeeId) {
      // Claiming an existing HR record requires proving the matricule / employee ID
      const proof = String(matricule || '').toUpperCase();
      const known = [rows[0].matricule, rows[0].employee_code].filter(Boolean).map((v) => v.toUpperCase());
      if (!proof || !known.includes(proof)) {
        throw new AppError(
          'Cet email correspond à un agent déjà enregistré : saisissez votre matricule ou identifiant employé',
          400
        );
      }
    } else {
      const code = await nextEmployeeCode(client);
      ({ rows } = await client.query(
        `INSERT INTO employees (employee_code, full_name, email, phone, designation)
         VALUES ($1,$2,lower($3),$4,'Agent') RETURNING id`,
        [code, name, email, phone || null]
      ));
      employeeId = rows[0].id;
    }
    ({ rows } = await client.query(
      `INSERT INTO users (name, email, password_hash, role, employee_id)
       VALUES ($1, lower($2), $3, 'employee', $4) RETURNING *`,
      [name, email, hash, employeeId]
    ));
    return rows[0];
  });

  await logActivity(user.id, 'Inscription', 'user', user.id, `${user.name} a créé son compte`);
  res.status(201).json(await buildSession(user));
};

/** POST /api/auth/login */
export const login = async (req, res) => {
  const { email, password } = req.body;
  assert(email && password, 'Email et mot de passe requis');

  const user = await findUserByEmail(email);
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) throw new AppError('Email ou mot de passe incorrect', 401);
  if (!user.is_active) throw new AppError('Ce compte est désactivé', 403);

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  res.json(await buildSession(user));
};

/** GET /api/auth/me */
export const me = async (req, res) => {
  const { rows } = await query(`SELECT ${USER_PUBLIC} FROM users WHERE id = $1`, [req.user.id]);
  const session = await buildSession(rows[0]);
  res.json({ user: session.user });
};

/** PUT /api/auth/password */
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  validatePassword(newPassword);
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const ok = await bcrypt.compare(currentPassword || '', rows[0].password_hash);
  if (!ok) throw new AppError('Mot de passe actuel incorrect', 400);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(newPassword, 12), req.user.id]);
  await logActivity(req.user.id, 'Changement de mot de passe', 'user', req.user.id);
  res.json({ message: 'Mot de passe mis à jour' });
};
