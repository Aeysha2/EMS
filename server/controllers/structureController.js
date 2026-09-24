import { query, withTransaction } from '../config/db.js';
import { isGestionnaire } from '../middleware/auth.js';
import { STRUCTURE_TYPES, subtreeIds } from '../models/Structure.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { notifyRoles, notifyUsers } from '../utils/notify.js';
import { pick, toInt } from '../utils/sanitize.js';

const FIELDS = ['code', 'name', 'sigle', 'type', 'parent_id', 'region', 'head_agent_id', 'is_active'];
const canValidateCentrally = (user) => ['admin_dsi', 'pilotage'].includes(user.role);

const STRUCT_SELECT = `
  SELECT s.*, p.name AS parent_name, i.name AS institution_name, i.sigle AS institution_sigle,
         h.full_name AS head_name, h.fonction AS head_fonction,
         (SELECT COUNT(*) FROM employees e WHERE e.structure_id = s.id
             AND e.position_statutaire IN ('activite','stage')) AS direct_agents
    FROM structures s
    LEFT JOIN structures p ON p.id = s.parent_id
    LEFT JOIN structures i ON i.id = s.institution_id
    LEFT JOIN employees h ON h.id = s.head_agent_id`;

/** GET /api/structures — référentiel national (arbre), visible par tous (annuaire interministériel) */
export const listStructures = async (req, res) => {
  const where = req.query.all === '1' ? '' : 'WHERE s.is_active';
  const { rows } = await query(`${STRUCT_SELECT} ${where} ORDER BY s.type = 'presidence' DESC, s.type = 'sgg' DESC, s.name`);
  // effectif total par sous-arbre (cartographie des effectifs)
  const byId = Object.fromEntries(rows.map((s) => [s.id, { ...s, children: [], total_agents: s.direct_agents }]));
  const roots = [];
  for (const s of Object.values(byId)) {
    if (s.parent_id && byId[s.parent_id]) byId[s.parent_id].children.push(s);
    else roots.push(s);
  }
  const sum = (n) => { n.total_agents = n.direct_agents + n.children.reduce((a, c) => a + sum(c), 0); return n.total_agents; };
  roots.forEach(sum);
  res.json(req.query.flat === '1' ? Object.values(byId).map(({ children, ...s }) => s) : roots); // eslint-disable-line no-unused-vars
};

/** GET /api/structures/:id — fiche structure : sous-structures, postes, agents (annuaire) */
export const getStructure = async (req, res) => {
  const id = toInt(req.params.id);
  const { rows } = await query(`${STRUCT_SELECT} WHERE s.id = $1`, [id]);
  if (!rows[0]) throw new AppError('Structure introuvable', 404);
  const ids = await subtreeIds(id);
  const [children, positions, agents, stats] = await Promise.all([
    query('SELECT id, code, name, sigle, type FROM structures WHERE parent_id = $1 ORDER BY name', [id]),
    query(`SELECT p.*, e.full_name AS occupant_name, c.name AS corps_name FROM positions p
             LEFT JOIN employees e ON e.id = p.employee_id LEFT JOIN corps c ON c.id = p.corps_id
            WHERE p.structure_id = $1 ORDER BY p.title`, [id]),
    query(`SELECT e.id, e.sigrh_id, e.full_name, e.fonction, e.email FROM employees e
            WHERE e.structure_id = $1 AND e.position_statutaire IN ('activite','stage','detachement')
            ORDER BY e.last_name`, [id]),
    query(`SELECT COUNT(*) FILTER (WHERE position_statutaire IN ('activite','stage')) AS effectif,
                  COUNT(*) FILTER (WHERE sexe = 'F' AND position_statutaire IN ('activite','stage')) AS femmes
             FROM employees WHERE structure_id = ANY($1)`, [ids]),
  ]);
  res.json({ ...rows[0], children: children.rows, positions: positions.rows, agents: agents.rows, stats: stats.rows[0] });
};

const validatePayload = async (data, db = { query }) => {
  if (data.type) assert(STRUCTURE_TYPES[data.type], 'Type de structure invalide');
  if (data.code) data.code = String(data.code).toUpperCase();
  if (data.parent_id === '') data.parent_id = null;
  if (data.head_agent_id === '') data.head_agent_id = null;
  if (data.parent_id) {
    const { rows } = await db.query('SELECT id FROM structures WHERE id = $1', [data.parent_id]);
    assert(rows[0], 'Structure parente introuvable');
  }
  return data;
};

/** Applique une création / modification / désactivation (validation centrale). */
const applyStructureChange = async (db, action, structureId, data, userId) => {
  if (action === 'create') {
    assert(data.code && data.name && data.type, 'Code, nom et type requis');
    assert(['presidence', 'sgg', 'ministere'].includes(data.type) || data.parent_id, 'Structure parente requise');
    const cols = Object.keys(data);
    const { rows } = await db.query(
      `INSERT INTO structures (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id, type, parent_id`,
      Object.values(data)
    );
    const s = rows[0];
    const inst = ['presidence', 'sgg', 'ministere'].includes(s.type)
      ? s.id
      : (await db.query('SELECT institution_id FROM structures WHERE id = $1', [s.parent_id])).rows[0].institution_id;
    await db.query('UPDATE structures SET institution_id = $1 WHERE id = $2', [inst, s.id]);
    return s.id;
  }
  if (action === 'deactivate') {
    const { rows } = await db.query(
      `SELECT (SELECT COUNT(*) FROM employees WHERE structure_id = $1 AND position_statutaire IN ('activite','stage')) AS agents,
              (SELECT COUNT(*) FROM structures WHERE parent_id = $1 AND is_active) AS children`, [structureId]);
    assert(rows[0].agents === 0 && rows[0].children === 0,
      'Impossible de désactiver : la structure a encore des agents ou des sous-structures actives', 409);
    await db.query('UPDATE structures SET is_active = FALSE, updated_at = now() WHERE id = $1', [structureId]);
    return structureId;
  }
  const upd = { ...data };
  delete upd.type; // le type ne change pas (il détermine le périmètre d'habilitation)
  if (upd.parent_id) {
    const sub = await subtreeIds(structureId, db);
    assert(!sub.includes(Number(upd.parent_id)), 'Une structure ne peut pas être rattachée à sa propre sous-structure');
  }
  const cols = Object.keys(upd);
  assert(cols.length, 'Aucune modification');
  await db.query(`UPDATE structures SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now()
                  WHERE id = $${cols.length + 1}`, [...Object.values(upd), structureId]);
  if (upd.parent_id) {
    // recalcule l'institution du sous-arbre rattaché
    const { rows } = await db.query('SELECT institution_id FROM structures WHERE id = $1', [upd.parent_id]);
    const ids = await subtreeIds(structureId, db);
    const { rows: me } = await db.query('SELECT type FROM structures WHERE id = $1', [structureId]);
    if (!['presidence', 'sgg', 'ministere'].includes(me[0].type)) {
      await db.query('UPDATE structures SET institution_id = $1 WHERE id = ANY($2)', [rows[0].institution_id, ids]);
    }
  }
  return structureId;
};

/**
 * POST /api/structures/requests — un ministère propose une création / modification / désactivation.
 * { action, structure_id?, payload }
 */
export const proposeChange = async (req, res) => {
  assert(isGestionnaire(req.user) || canValidateCentrally(req.user), 'Accès refusé', 403);
  const { action } = req.body;
  assert(['create', 'update', 'deactivate'].includes(action), 'Action invalide');
  const payload = await validatePayload(pick(req.body.payload || {}, FIELDS));
  const structureId = action === 'create' ? null : toInt(req.body.structure_id);
  // le ministère ne propose que dans son propre périmètre
  const anchor = action === 'create' ? payload.parent_id : structureId;
  assert(anchor, 'Structure concernée requise');
  const { rows: a } = await query('SELECT institution_id FROM structures WHERE id = $1', [anchor]);
  assert(a[0], 'Structure introuvable');
  if (isGestionnaire(req.user)) {
    assert(a[0].institution_id === req.user.institution_id, 'Hors de votre institution', 403);
    if (action === 'create') assert(!['presidence', 'sgg', 'ministere'].includes(payload.type),
      'La création d’un ministère relève du niveau central', 403);
  }
  const { rows } = await query(
    `INSERT INTO structure_requests (action, structure_id, payload, institution_id, requested_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [action, structureId, JSON.stringify(payload), a[0].institution_id, req.user.id]
  );
  await notifyRoles(['admin_dsi', 'pilotage'], 'structure', 'Référentiel des structures : proposition à valider',
    `${action} — ${payload.name || ''}`, '/structures?tab=requests');
  await logActivity(req.user.id, 'Proposition de modification de structure', 'structure_request', rows[0].id, action, req.ip);
  res.status(201).json(rows[0]);
};

/** GET /api/structures/requests */
export const listChangeRequests = async (req, res) => {
  const params = [];
  let where = '';
  if (!canValidateCentrally(req.user)) { params.push(req.user.institution_id); where = 'WHERE r.institution_id = $1'; }
  const { rows } = await query(
    `SELECT r.*, s.name AS structure_name, i.name AS institution_name, u.name AS requested_by_name, v.name AS reviewed_by_name
       FROM structure_requests r LEFT JOIN structures s ON s.id = r.structure_id
       LEFT JOIN structures i ON i.id = r.institution_id
       LEFT JOIN users u ON u.id = r.requested_by LEFT JOIN users v ON v.id = r.reviewed_by
      ${where} ORDER BY r.status = 'pending' DESC, r.created_at DESC LIMIT 200`, params);
  res.json(rows);
};

/** PATCH /api/structures/requests/:id { decision: approve|reject, comment } — validation centrale */
export const reviewChangeRequest = async (req, res) => {
  assert(canValidateCentrally(req.user), 'Validation réservée au niveau central (SGG / DSI)', 403);
  const { decision, comment } = req.body;
  assert(['approve', 'reject'].includes(decision), 'Décision invalide');
  const result = await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT * FROM structure_requests WHERE id = $1 FOR UPDATE', [toInt(req.params.id)]);
    const r = rows[0];
    if (!r) throw new AppError('Proposition introuvable', 404);
    assert(r.status === 'pending', 'Proposition déjà traitée', 409);
    let structureId = r.structure_id;
    if (decision === 'approve') structureId = await applyStructureChange(db, r.action, r.structure_id, r.payload, req.user.id);
    await db.query(
      `UPDATE structure_requests SET status = $1, reviewed_by = $2, review_comment = $3, reviewed_at = now(),
              structure_id = COALESCE(structure_id, $4) WHERE id = $5`,
      [decision === 'approve' ? 'approved' : 'rejected', req.user.id, comment || null, structureId, r.id]
    );
    return r;
  });
  await notifyUsers([result.requested_by], 'structure',
    `Proposition ${decision === 'approve' ? 'validée' : 'rejetée'}`, comment || null, '/structures?tab=requests');
  await logActivity(req.user.id, `Référentiel structures : ${decision}`, 'structure_request', result.id, comment, req.ip);
  res.json({ ok: true });
};

/** POST /api/structures — création directe par le niveau central */
export const createStructure = async (req, res) => {
  assert(canValidateCentrally(req.user), 'Création réservée au niveau central', 403);
  const data = await validatePayload(pick(req.body, FIELDS));
  const id = await withTransaction((db) => applyStructureChange(db, 'create', null, data, req.user.id));
  await logActivity(req.user.id, 'Création de structure', 'structure', id, data.name, req.ip);
  const { rows } = await query(`${STRUCT_SELECT} WHERE s.id = $1`, [id]);
  res.status(201).json(rows[0]);
};

/**
 * PUT /api/structures/:id — modification directe par le niveau central.
 * Exception : un gestionnaire RH peut désigner le responsable d'une structure de son institution.
 */
export const updateStructure = async (req, res) => {
  const id = toInt(req.params.id);
  const { rows: cur } = await query('SELECT * FROM structures WHERE id = $1', [id]);
  if (!cur[0]) throw new AppError('Structure introuvable', 404);
  let data = await validatePayload(pick(req.body, FIELDS));
  if (!canValidateCentrally(req.user)) {
    assert(isGestionnaire(req.user) && cur[0].institution_id === req.user.institution_id, 'Accès refusé', 403);
    data = pick(data, ['head_agent_id']);
    assert(Object.keys(data).length, 'Proposez la modification au niveau central (référentiel validé centralement)', 403);
  }
  if (data.head_agent_id) {
    const { rows } = await query(
      `SELECT s.institution_id FROM employees e JOIN structures s ON s.id = e.structure_id WHERE e.id = $1`,
      [data.head_agent_id]);
    assert(rows[0]?.institution_id === cur[0].institution_id, 'Le responsable doit appartenir à la même institution');
  }
  if (data.is_active === false) {
    await withTransaction((db) => applyStructureChange(db, 'deactivate', id, {}, req.user.id));
    delete data.is_active;
  }
  if (Object.keys(data).length) await withTransaction((db) => applyStructureChange(db, 'update', id, data, req.user.id));
  await logActivity(req.user.id, 'Modification de structure', 'structure', id, Object.keys(req.body).join(', '), req.ip);
  const { rows } = await query(`${STRUCT_SELECT} WHERE s.id = $1`, [id]);
  res.json(rows[0]);
};

// ---------------------------------------------------------------- postes

/** POST /api/structures/:id/positions */
export const createPosition = async (req, res) => {
  const id = toInt(req.params.id);
  const { rows: s } = await query('SELECT institution_id FROM structures WHERE id = $1', [id]);
  assert(s[0], 'Structure introuvable');
  assert(isGestionnaire(req.user) && s[0].institution_id === req.user.institution_id, 'Accès refusé', 403);
  const { code, title, corps_id: corps, hierarchie, is_budgeted: budgeted } = req.body;
  assert(code && title, 'Code et intitulé du poste requis');
  const { rows } = await query(
    `INSERT INTO positions (code, title, structure_id, corps_id, hierarchie, is_budgeted)
     VALUES (upper($1),$2,$3,$4,$5,$6) RETURNING *`,
    [code, title, id, corps || null, hierarchie || null, budgeted !== false]
  );
  res.status(201).json(rows[0]);
};

/** PUT /api/positions/:id { employee_id | null, title } — affectation d'un occupant */
export const updatePosition = async (req, res) => {
  const { rows: p } = await query(
    'SELECT p.*, s.institution_id FROM positions p JOIN structures s ON s.id = p.structure_id WHERE p.id = $1',
    [toInt(req.params.id)]);
  if (!p[0]) throw new AppError('Poste introuvable', 404);
  assert(isGestionnaire(req.user) && p[0].institution_id === req.user.institution_id, 'Accès refusé', 403);
  const data = pick(req.body, ['title', 'employee_id', 'is_budgeted', 'hierarchie', 'corps_id']);
  if (data.employee_id === '') data.employee_id = null;
  const cols = Object.keys(data);
  assert(cols.length, 'Aucune modification');
  const { rows } = await query(
    `UPDATE positions SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1} RETURNING *`,
    [...Object.values(data), p[0].id]);
  res.json(rows[0]);
};

// ---------------------------------------------------------------- corps

/** GET /api/corps */
export const listCorps = async (req, res) => {
  const { rows } = await query(
    `SELECT c.*, COUNT(e.id) FILTER (WHERE e.position_statutaire IN ('activite','stage')) AS effectif
       FROM corps c LEFT JOIN employees e ON e.corps_id = c.id GROUP BY c.id ORDER BY c.hierarchie, c.name`);
  res.json(rows);
};

/** POST /api/corps — référentiel DGFP (niveau central) */
export const createCorps = async (req, res) => {
  assert(canValidateCentrally(req.user), 'Référentiel géré au niveau central', 403);
  const { code, name, hierarchie, description } = req.body;
  assert(code && name && ['A', 'B', 'C', 'D'].includes(hierarchie), 'Code, intitulé et hiérarchie (A–D) requis');
  const { rows } = await query(
    'INSERT INTO corps (code, name, hierarchie, description) VALUES (upper($1),$2,$3,$4) RETURNING *',
    [code, name, hierarchie, description || null]);
  res.status(201).json(rows[0]);
};
