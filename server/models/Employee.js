import { query } from '../config/db.js';
import { decrypt, mask } from '../utils/crypto.js';

/** Agent avec sa structure, son institution, son corps et son compte. */
export const EMPLOYEE_SELECT = `
  SELECT e.*, s.name AS structure_name, s.sigle AS structure_sigle, s.institution_id,
         i.name AS institution_name, i.sigle AS institution_sigle,
         c.name AS corps_name, u.id AS user_id, u.role AS user_role
    FROM employees e
    LEFT JOIN structures s ON s.id = e.structure_id
    LEFT JOIN structures i ON i.id = s.institution_id
    LEFT JOIN corps c ON c.id = e.corps_id
    LEFT JOIN users u ON u.employee_id = e.id`;

/** Champs de l'annuaire interministériel, visibles par tout utilisateur connecté. */
const PUBLIC_FIELDS = ['id', 'sigrh_id', 'full_name', 'first_name', 'last_name', 'fonction', 'email', 'structure_id',
  'structure_name', 'structure_sigle', 'institution_id', 'institution_name', 'institution_sigle', 'position_statutaire'];

/** Champs retirés pour le chef de structure (données personnelles et rémunération). */
const TEAM_HIDDEN = ['salary', 'nin_enc', 'nin_hash', 'date_of_birth', 'place_of_birth', 'address', 'marital_status',
  'children_count', 'matricule_solde', 'biometric_id'];

/** Adapte le dossier au niveau d'accès (protection des données personnelles). */
export const shapeEmployee = (emp, level) => {
  if (!emp) return emp;
  if (level === 'public') return Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, emp[k]]));
  const out = { ...emp };
  if (level === 'team') TEAM_HIDDEN.forEach((k) => delete out[k]);
  if (level === 'full') {
    let nin = null;
    try { nin = decrypt(emp.nin_enc); } catch { nin = null; }
    out.nin_masked = mask(nin);
  }
  delete out.nin_enc;
  delete out.nin_hash;
  out.access_level = level;
  return out;
};

export const findEmployeeById = async (id, db = { query }) => {
  const { rows } = await db.query(`${EMPLOYEE_SELECT} WHERE e.id = $1`, [id]);
  return rows[0] || null;
};

/** Identifiant unique et pérenne : SN + 8 chiffres (jamais réattribué). */
export const nextSigrhId = async (db = { query }) => {
  const { rows } = await db.query(`SELECT nextval('sigrh_agent_seq') AS n`);
  return `SN${String(rows[0].n).padStart(8, '0')}`;
};

/** Enregistre chaque champ modifié (valeur avant / après) pour la traçabilité (6.1). */
export const trackChanges = async (db, entity, entityId, before, after, userId, requestId = null) => {
  for (const [field, value] of Object.entries(after)) {
    const oldV = before?.[field];
    const norm = (v) => (v === null || v === undefined ? null : String(v));
    if (norm(oldV) === norm(value)) continue;
    const sensitive = ['nin_enc', 'nin_hash'].includes(field);
    await db.query(
      `INSERT INTO record_changes (entity, entity_id, field, old_value, new_value, user_id, request_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [entity, entityId, sensitive ? 'nin' : field, sensitive ? '(chiffré)' : norm(oldV),
        sensitive ? '(chiffré)' : norm(value), userId, requestId]
    );
  }
};

export const POSITIONS_STATUTAIRES = {
  activite: 'Activité', stage: 'Stage', detachement: 'Détachement', disponibilite: 'Disponibilité',
  suspension: 'Suspension', retraite: 'Retraite', demission: 'Démission', radiation: 'Radiation', deces: 'Décès',
};

/** Positions dans lesquelles l'agent est normalement rémunéré par sa structure. */
export const PAID_POSITIONS = ['activite', 'stage'];
