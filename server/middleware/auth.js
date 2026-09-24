import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { subtreeIds } from '../models/Structure.js';
import AppError from '../utils/AppError.js';

/**
 * Profils d'habilitation (section 10 du cahier des charges) :
 *  - agent           : libre-service sur son propre dossier
 *  - gestionnaire_rh : gestion complète des agents de SON institution (ministère, SGG ou Présidence)
 *  - pilotage        : Présidence / SGG — lecture consolidée des données agrégées, validations interministérielles
 *  - admin_dsi       : administration technique (comptes, référentiels, sécurité), sans accès métier aux dossiers
 * Un agent désigné responsable d'une structure (head_agent_id) est « chef de structure » sur tout son sous-arbre.
 */
export const ROLES = ['agent', 'gestionnaire_rh', 'pilotage', 'admin_dsi'];
export const PRIVILEGED_ROLES = ['gestionnaire_rh', 'pilotage', 'admin_dsi'];

export const mfaRequired = () => process.env.MFA_REQUIRED !== 'false';

export const signToken = (user, extra = {}) =>
  jwt.sign({ id: user.id, role: user.role, ...extra }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

/** Jeton court (5 min) remis après le mot de passe, en attente du code 2FA. */
export const signMfaToken = (user) =>
  jwt.sign({ id: user.id, purpose: 'mfa' }, process.env.JWT_SECRET, { expiresIn: '5m' });

export const loadUserContext = async (userId) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.employee_id, u.structure_id, u.is_active, u.totp_enabled,
            s.institution_id, i.name AS institution_name, i.type AS institution_type, s.name AS structure_name,
            (SELECT COALESCE(array_agg(h.id), '{}') FROM structures h
              WHERE h.head_agent_id = u.employee_id AND u.employee_id IS NOT NULL) AS headed_structures
       FROM users u
       LEFT JOIN structures s ON s.id = u.structure_id
       LEFT JOIN structures i ON i.id = s.institution_id
      WHERE u.id = $1`,
    [userId]
  );
  const user = rows[0];
  if (!user) return null;
  user.managed_structures = user.headed_structures.length ? await subtreeIds(user.headed_structures) : [];
  user.isChef = user.managed_structures.length > 0;
  return user;
};

/** Vérifie le jeton, recharge le compte (rôle et périmètre toujours relus en base). */
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
  if (payload.purpose === 'mfa') throw new AppError('Code de double authentification requis', 401);

  const user = await loadUserContext(payload.id);
  if (!user || !user.is_active) throw new AppError('Compte introuvable ou désactivé', 401);

  // Profils sensibles : la double authentification est obligatoire (section 9)
  const isMfaRoute = req.originalUrl.startsWith('/api/auth/');
  if (mfaRequired() && PRIVILEGED_ROLES.includes(user.role) && !user.totp_enabled && !isMfaRoute) {
    const err = new AppError('Activez la double authentification pour accéder à votre profil', 403);
    err.code = 'MFA_SETUP_REQUIRED';
    throw err;
  }

  req.user = user;
  next();
};

/** Restreint une route à certains profils. */
export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw new AppError('Accès refusé : habilitation insuffisante', 403);
  next();
};

export const isGestionnaire = (user) => user.role === 'gestionnaire_rh';
export const isPilotage = (user) => user.role === 'pilotage';

/**
 * Niveau d'accès d'un utilisateur au dossier d'un agent :
 *  'full'   : l'agent lui-même, ou un gestionnaire RH de la même institution
 *  'team'   : son chef de structure (sans données personnelles sensibles ni rémunération)
 *  'public' : annuaire interministériel (nom, fonction, structure, email professionnel)
 */
export const accessLevel = (user, emp) => {
  if (!emp) return null;
  if (user.employee_id && user.employee_id === emp.id) return 'full';
  if (isGestionnaire(user) && user.institution_id && user.institution_id === emp.institution_id) return 'full';
  if (user.managed_structures.includes(emp.structure_id)) return 'team';
  return 'public';
};
