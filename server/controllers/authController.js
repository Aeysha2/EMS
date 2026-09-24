import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { query } from '../config/db.js';
import {
  loadUserContext, mfaRequired, PRIVILEGED_ROLES, signMfaToken, signToken,
} from '../middleware/auth.js';
import { findEmployeeById, shapeEmployee } from '../models/Employee.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { decrypt, encrypt, generateTotpSecret, totpUri, verifyTotp } from '../utils/crypto.js';

const validatePassword = (pw) => {
  assert(typeof pw === 'string' && pw.length >= 10, 'Le mot de passe doit contenir au moins 10 caractères');
  assert(/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw),
    'Le mot de passe doit contenir une minuscule, une majuscule et un chiffre');
};

const buildSession = async (userId) => {
  const u = await loadUserContext(userId);
  const employee = u.employee_id ? shapeEmployee(await findEmployeeById(u.employee_id), 'full') : null;
  const { rows: headed } = await query('SELECT id, name FROM structures WHERE id = ANY($1)', [u.headed_structures]);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    employee_id: u.employee_id,
    structure_id: u.structure_id,
    structure_name: u.structure_name,
    institution_id: u.institution_id,
    institution_name: u.institution_name,
    institution_type: u.institution_type,
    totp_enabled: u.totp_enabled,
    isChef: u.isChef,
    headedStructures: headed,
    mfa_setup_required: mfaRequired() && PRIVILEGED_ROLES.includes(u.role) && !u.totp_enabled,
    employee,
  };
};

/**
 * POST /api/auth/activate — activation du compte par l'agent lui-même.
 * Le référentiel est tenu par les DRH : l'agent doit déjà exister et prouver son identité
 * (email professionnel + identifiant SIGRH ou matricule de solde).
 */
export const activate = async (req, res) => {
  const { email, identifier, password } = req.body;
  assert(email && identifier, 'Email et identifiant SIGRH (ou matricule de solde) requis');
  validatePassword(password);

  const { rows } = await query(
    `SELECT e.id, e.full_name, e.structure_id, e.sigrh_id, e.matricule_solde, u.id AS user_id
       FROM employees e LEFT JOIN users u ON u.employee_id = e.id
      WHERE lower(e.email) = lower($1)`,
    [email]
  );
  const emp = rows[0];
  const proof = String(identifier).trim().toUpperCase();
  if (!emp || ![emp.sigrh_id, emp.matricule_solde].filter(Boolean).map((v) => v.toUpperCase()).includes(proof)) {
    throw new AppError('Aucun agent ne correspond à ces informations dans le référentiel', 400);
  }
  if (emp.user_id) throw new AppError('Un compte existe déjà pour cet agent', 409);

  const { rows: created } = await query(
    `INSERT INTO users (name, email, password_hash, role, employee_id, structure_id)
     VALUES ($1, lower($2), $3, 'agent', $4, $5) RETURNING id, role`,
    [emp.full_name, email, await bcrypt.hash(password, 12), emp.id, emp.structure_id]
  );
  await logActivity(created[0].id, 'Activation de compte', 'user', created[0].id, emp.sigrh_id, req.ip);
  res.status(201).json({ token: signToken(created[0]), user: await buildSession(created[0].id) });
};

/** POST /api/auth/login — étape 1 : mot de passe. */
export const login = async (req, res) => {
  const { email, password } = req.body;
  assert(email && password, 'Email et mot de passe requis');
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    await logActivity(user?.id ?? null, 'Échec de connexion', 'user', user?.id ?? null, email, req.ip);
    throw new AppError('Email ou mot de passe incorrect', 401);
  }
  if (!user.is_active) throw new AppError('Ce compte est désactivé', 403);

  if (user.totp_enabled) {
    return res.json({ mfa_required: true, mfa_token: signMfaToken(user) });
  }
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  await logActivity(user.id, 'Connexion', 'user', user.id, null, req.ip);
  return res.json({ token: signToken(user), user: await buildSession(user.id) });
};

/** POST /api/auth/mfa/verify — étape 2 : code à 6 chiffres. */
export const mfaVerify = async (req, res) => {
  const { mfa_token: mfaToken, code } = req.body;
  let payload;
  try {
    payload = jwt.verify(mfaToken || '', process.env.JWT_SECRET);
  } catch {
    throw new AppError('Délai dépassé : reconnectez-vous', 401);
  }
  assert(payload.purpose === 'mfa', 'Jeton invalide', 401);
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [payload.id]);
  const user = rows[0];
  if (!user?.is_active || !user.totp_enabled) throw new AppError('Compte indisponible', 401);
  if (!verifyTotp(decrypt(user.totp_secret_enc), code)) {
    await logActivity(user.id, 'Échec du code 2FA', 'user', user.id, null, req.ip);
    throw new AppError('Code de vérification incorrect', 401);
  }
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  await logActivity(user.id, 'Connexion (2FA)', 'user', user.id, null, req.ip);
  res.json({ token: signToken(user), user: await buildSession(user.id) });
};

/** POST /api/auth/mfa/setup — génère un secret (non actif tant qu'il n'est pas confirmé). */
export const mfaSetup = async (req, res) => {
  if (req.user.totp_enabled) throw new AppError('La double authentification est déjà active', 409);
  const secret = generateTotpSecret();
  await query('UPDATE users SET totp_secret_enc = $1 WHERE id = $2', [encrypt(secret), req.user.id]);
  const uri = totpUri(secret, req.user.email);
  res.json({ secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) });
};

/** POST /api/auth/mfa/enable { code } — confirme avec un premier code. */
export const mfaEnable = async (req, res) => {
  const { rows } = await query('SELECT totp_secret_enc, totp_enabled FROM users WHERE id = $1', [req.user.id]);
  assert(rows[0].totp_secret_enc, 'Commencez par générer le code QR');
  if (!verifyTotp(decrypt(rows[0].totp_secret_enc), req.body.code)) throw new AppError('Code incorrect', 400);
  await query('UPDATE users SET totp_enabled = TRUE WHERE id = $1', [req.user.id]);
  await logActivity(req.user.id, 'Activation de la 2FA', 'user', req.user.id, null, req.ip);
  res.json({ user: await buildSession(req.user.id) });
};

/** POST /api/auth/mfa/disable { code } — interdit pour les profils où elle est obligatoire. */
export const mfaDisable = async (req, res) => {
  if (mfaRequired() && PRIVILEGED_ROLES.includes(req.user.role)) {
    throw new AppError('La double authentification est obligatoire pour votre profil', 403);
  }
  const { rows } = await query('SELECT totp_secret_enc FROM users WHERE id = $1', [req.user.id]);
  if (!verifyTotp(decrypt(rows[0].totp_secret_enc), req.body.code)) throw new AppError('Code incorrect', 400);
  await query('UPDATE users SET totp_enabled = FALSE, totp_secret_enc = NULL WHERE id = $1', [req.user.id]);
  await logActivity(req.user.id, 'Désactivation de la 2FA', 'user', req.user.id, null, req.ip);
  res.json({ user: await buildSession(req.user.id) });
};

/** GET /api/auth/me */
export const me = async (req, res) => res.json({ user: await buildSession(req.user.id) });

/** PUT /api/auth/password */
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  validatePassword(newPassword);
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(currentPassword || '', rows[0].password_hash))) {
    throw new AppError('Mot de passe actuel incorrect', 400);
  }
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(newPassword, 12), req.user.id]);
  await logActivity(req.user.id, 'Changement de mot de passe', 'user', req.user.id, null, req.ip);
  res.json({ message: 'Mot de passe mis à jour' });
};
