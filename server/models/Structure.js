import { query } from '../config/db.js';

/** Identifiants de la structure et de toutes ses sous-structures. */
export const subtreeIds = async (rootIds, db = { query }) => {
  const roots = Array.isArray(rootIds) ? rootIds : [rootIds];
  if (!roots.length) return [];
  const { rows } = await db.query(
    `WITH RECURSIVE t AS (
       SELECT id FROM structures WHERE id = ANY($1)
       UNION SELECT s.id FROM structures s JOIN t ON s.parent_id = t.id
     ) SELECT id FROM t`,
    [roots]
  );
  return rows.map((r) => r.id);
};

/** Chaîne des structures de la structure donnée jusqu'à la racine (elle-même en premier). */
export const ancestors = async (structureId, db = { query }) => {
  const { rows } = await db.query(
    `WITH RECURSIVE t AS (
       SELECT id, parent_id, head_agent_id, name, type, 0 AS depth FROM structures WHERE id = $1
       UNION ALL SELECT s.id, s.parent_id, s.head_agent_id, s.name, s.type, t.depth + 1
         FROM structures s JOIN t ON s.id = t.parent_id
     ) SELECT * FROM t ORDER BY depth`,
    [structureId]
  );
  return rows;
};

/** Institution (Présidence, SGG ou ministère) d'une structure. */
export const institutionOf = async (structureId, db = { query }) => {
  if (!structureId) return null;
  const { rows } = await db.query('SELECT institution_id FROM structures WHERE id = $1', [structureId]);
  return rows[0]?.institution_id ?? null;
};

/** Calcule institution_id d'une nouvelle structure à partir de son parent. */
export const computeInstitution = async (type, parentId, db = { query }) => {
  if (['presidence', 'sgg', 'ministere'].includes(type)) return null; // = elle-même, fixé après insertion
  return institutionOf(parentId, db);
};

export const STRUCTURE_TYPES = {
  presidence: 'Présidence de la République',
  sgg: 'Secrétariat Général du Gouvernement',
  ministere: 'Ministère',
  direction: 'Direction',
  service: 'Service / Division',
  deconcentree: 'Structure déconcentrée',
};
