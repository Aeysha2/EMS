import { query, withTransaction } from '../config/db.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { recordPunch } from './attendanceController.js';
import { computeIndicators } from './pilotageController.js';
import { importSoldeLines } from './soldeController.js';

/**
 * Bus d'échange interministériel (section 7.2) : API REST versionnée, authentifiée par clé.
 * Chaque système partenaire (Solde, terminaux biométriques, SI d'un ministère, identité numérique…)
 * reçoit une clé et des habilitations (scopes) limitées au strict nécessaire.
 */
export const SCOPES = {
  'agents:read': 'Lire la fiche administrative minimale d’un agent (identité, affectation, position)',
  'structures:read': 'Lire le référentiel national des structures',
  'statistiques:read': 'Lire les effectifs agrégés',
  'biometrie:write': 'Transmettre les pointages des terminaux biométriques',
  'solde:write': 'Transmettre les états de paiement de la Solde',
};

// ---------------------------------------------------------------- authentification par clé

export const apiKeyAuth = async (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key) throw new AppError('Clé d’API requise (en-tête X-API-Key)', 401);
  const { rows } = await query(
    'UPDATE api_clients SET last_used_at = now() WHERE key_hash = $1 AND is_active RETURNING *', [sha256(String(key))]);
  if (!rows[0]) throw new AppError('Clé d’API invalide ou révoquée', 401);
  req.client = rows[0];
  res.on('finish', () => {
    query('INSERT INTO interop_logs (client_id, method, path, status) VALUES ($1,$2,$3,$4)',
      [rows[0].id, req.method, req.originalUrl.slice(0, 200), res.statusCode]).catch(() => {});
  });
  next();
};

export const requireScope = (scope) => (req, res, next) => {
  if (!req.client.scopes.includes(scope)) throw new AppError(`Habilitation « ${scope} » requise`, 403);
  next();
};

// ---------------------------------------------------------------- points d'accès partenaires

/** GET /api/interop/v1/agents/:sigrhId — fiche minimale (pas de données sensibles) */
export const getAgent = async (req, res) => {
  const { rows } = await query(
    `SELECT e.sigrh_id, e.matricule_solde, e.first_name, e.last_name, e.sexe, e.fonction, e.hierarchie, e.grade,
            e.echelon, e.statut_emploi, e.position_statutaire, s.code AS structure_code, s.name AS structure,
            i.code AS institution_code, i.name AS institution
       FROM employees e LEFT JOIN structures s ON s.id = e.structure_id LEFT JOIN structures i ON i.id = s.institution_id
      WHERE e.sigrh_id = $1 OR e.matricule_solde = $1`, [String(req.params.sigrhId).toUpperCase()]);
  if (!rows[0]) throw new AppError('Agent inconnu', 404);
  res.json(rows[0]);
};

/** GET /api/interop/v1/structures */
export const getStructures = async (req, res) => {
  const { rows } = await query(
    `SELECT s.code, s.name, s.sigle, s.type, p.code AS parent_code, i.code AS institution_code, s.region
       FROM structures s LEFT JOIN structures p ON p.id = s.parent_id LEFT JOIN structures i ON i.id = s.institution_id
      WHERE s.is_active ORDER BY s.code`);
  res.json({ count: rows.length, data: rows });
};

/** GET /api/interop/v1/statistiques/effectifs — agrégats (aucune donnée individuelle) */
export const getStats = async (req, res) => {
  const d = await computeIndicators(null);
  res.json({
    generated_at: d.generated_at, effectif: d.effectif, taux_feminisation: d.taux_feminisation,
    par_institution: d.par_institution.map(({ sigle, name, effectif, femmes }) => ({ sigle, name, effectif, femmes })),
    par_hierarchie: d.par_hierarchie,
  });
};

/**
 * POST /api/interop/v1/biometrie/pointages
 * { pointages: [{ biometric_id | sigrh_id, horodatage (ISO 8601), terminal }] } — lot de 1 000 au maximum
 */
export const postPunches = async (req, res) => {
  const list = req.body?.pointages;
  assert(Array.isArray(list) && list.length > 0 && list.length <= 1000, 'Lot de 1 à 1 000 pointages attendu');
  const result = { recus: list.length, arrivees: 0, departs: 0, ignores: 0, rejets: [] };
  await withTransaction(async (db) => {
    for (const [i, p] of list.entries()) {
      const at = new Date(p.horodatage);
      if (Number.isNaN(at.getTime()) || at > new Date(Date.now() + 5 * 60_000)) {
        result.rejets.push({ index: i, motif: 'horodatage invalide' }); continue;
      }
      const { rows } = await db.query(
        `SELECT id FROM employees WHERE (biometric_id = $1 OR sigrh_id = $2) AND position_statutaire IN ('activite','stage')`,
        [p.biometric_id ? String(p.biometric_id).toUpperCase() : null, p.sigrh_id ? String(p.sigrh_id).toUpperCase() : null]);
      if (!rows[0]) { result.rejets.push({ index: i, motif: 'agent inconnu ou inactif' }); continue; }
      const r = await recordPunch(db, rows[0].id, at, { source: 'biometrie', deviceId: p.terminal || null });
      if (r.kind === 'check_in') result.arrivees += 1;
      else if (r.kind === 'check_out') result.departs += 1;
      else result.ignores += 1;
    }
  });
  res.status(202).json(result);
};

/**
 * POST /api/interop/v1/solde/paiements
 * { annee, mois, lignes: [{ matricule_solde, nom, salaire_base, brut, retenues, impot, net }] }
 */
export const postSolde = async (req, res) => {
  const { annee, mois, lignes } = req.body || {};
  const result = await withTransaction((db) => importSoldeLines(db, {
    year: Number(annee), month: Number(mois), lines: lignes, source: 'interop', filename: `API ${req.client.name}`,
    userId: null,
  }));
  await logActivity(null, 'Import Solde (interopérabilité)', 'solde_import', result.id, req.client.name, req.ip);
  res.status(201).json({ import_id: result.id, lignes: result.line_count, rapprochees: result.matched,
    non_rapprochees: result.unmatched });
};

// ---------------------------------------------------------------- gestion des clients (DSI)

/** GET /api/interop/clients */
export const listClients = async (req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.name, c.key_prefix, c.scopes, c.is_active, c.created_at, c.last_used_at, s.name AS structure_name,
            (SELECT COUNT(*) FROM interop_logs l WHERE l.client_id = c.id AND l.created_at > now() - interval '30 days') AS appels_30j
       FROM api_clients c LEFT JOIN structures s ON s.id = c.structure_id ORDER BY c.created_at DESC`);
  res.json({ scopes: SCOPES, clients: rows });
};

/** POST /api/interop/clients { name, structure_id, scopes[] } — la clé n'est affichée qu'une seule fois */
export const createClient = async (req, res) => {
  const { name, structure_id: structureId, scopes } = req.body;
  assert(name, 'Nom du système partenaire requis');
  assert(Array.isArray(scopes) && scopes.length && scopes.every((s) => SCOPES[s]), 'Habilitations invalides');
  const key = `sigrh_${randomToken(24)}`;
  const { rows } = await query(
    `INSERT INTO api_clients (name, structure_id, key_prefix, key_hash, scopes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, key_prefix, scopes, is_active, created_at`,
    [name, structureId || null, key.slice(0, 11), sha256(key), scopes, req.user.id]);
  await logActivity(req.user.id, 'Création de clé d’API', 'api_client', rows[0].id, `${name} : ${scopes.join(', ')}`, req.ip);
  res.status(201).json({ ...rows[0], api_key: key });
};

/** PATCH /api/interop/clients/:id { is_active } — révocation */
export const updateClient = async (req, res) => {
  const { rows } = await query('UPDATE api_clients SET is_active = $1 WHERE id = $2 RETURNING id, name, is_active',
    [!!req.body.is_active, Number(req.params.id)]);
  if (!rows[0]) throw new AppError('Client introuvable', 404);
  await logActivity(req.user.id, rows[0].is_active ? 'Réactivation de clé d’API' : 'Révocation de clé d’API',
    'api_client', rows[0].id, rows[0].name, req.ip);
  res.json(rows[0]);
};

/** GET /api/interop/v1/openapi.json — description normalisée de l'API partenaire */
export const openapi = (req, res) => {
  const secured = { security: [{ ApiKey: [] }] };
  res.json({
    openapi: '3.0.3',
    info: { title: 'SIGRH — API d’interopérabilité', version: '1.0.0',
      description: 'Échanges normalisés entre le SIGRH, la Solde, les terminaux biométriques et les SI de l’État.' },
    servers: [{ url: '/api/interop/v1' }],
    components: { securitySchemes: { ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' } } },
    paths: {
      '/agents/{identifiant}': { get: { ...secured, summary: 'Fiche administrative minimale (scope agents:read)',
        parameters: [{ name: 'identifiant', in: 'path', required: true, schema: { type: 'string' },
          description: 'Identifiant SIGRH ou matricule de solde' }] } },
      '/structures': { get: { ...secured, summary: 'Référentiel des structures (scope structures:read)' } },
      '/statistiques/effectifs': { get: { ...secured, summary: 'Effectifs agrégés (scope statistiques:read)' } },
      '/biometrie/pointages': { post: { ...secured, summary: 'Lot de pointages biométriques (scope biometrie:write)',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
          pointages: { type: 'array', items: { type: 'object', properties: {
            biometric_id: { type: 'string' }, sigrh_id: { type: 'string' },
            horodatage: { type: 'string', format: 'date-time' }, terminal: { type: 'string' } } } } } } } } } } },
      '/solde/paiements': { post: { ...secured, summary: 'État de paiement mensuel de la Solde (scope solde:write)',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
          annee: { type: 'integer' }, mois: { type: 'integer' },
          lignes: { type: 'array', items: { type: 'object', properties: {
            matricule_solde: { type: 'string' }, nom: { type: 'string' }, salaire_base: { type: 'number' },
            brut: { type: 'number' }, retenues: { type: 'number' }, impot: { type: 'number' }, net: { type: 'number' } } } } } } } } } } },
    },
  });
};
