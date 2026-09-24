import PDFDocument from 'pdfkit';
import { query, withTransaction } from '../config/db.js';
import { isGestionnaire } from '../middleware/auth.js';
import { findEmployeeById } from '../models/Employee.js';
import {
  ACTION_LABELS, addHistory, ASSIGNEE_KINDS, canAct, canView, createRequest, findRequest, getSteps, performAction,
  REQUEST_SELECT, resolveActors,
} from '../models/Workflow.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { pagination, pick, toInt } from '../utils/sanitize.js';

const canConfigure = (user) => ['admin_dsi', 'pilotage'].includes(user.role);

// ---------------------------------------------------------------- paramétrage des circuits

/** GET /api/workflows/types — types de demandes/actes et leurs circuits */
export const listTypes = async (req, res) => {
  const [types, steps] = await Promise.all([
    query('SELECT * FROM workflow_types ORDER BY category, name'),
    query(`SELECT ws.*, s.name AS structure_name FROM workflow_steps ws
             LEFT JOIN structures s ON s.id = ws.structure_id ORDER BY ws.type_id, ws.step_order`),
  ]);
  res.json({
    assigneeKinds: ASSIGNEE_KINDS,
    types: types.rows.map((t) => ({ ...t, steps: steps.rows.filter((s) => s.type_id === t.id) })),
  });
};

/**
 * PUT /api/workflows/types/:id — paramétrage d'un circuit (SGG / DSI) :
 * { name, sla_days, required_documents, is_active, agent_can_submit, steps: [{ name, assignee_kind, structure_id, expected_days }] }
 */
export const saveType = async (req, res) => {
  assert(canConfigure(req.user), 'Paramétrage réservé au niveau central (SGG / DSI)', 403);
  const id = toInt(req.params.id);
  const data = pick(req.body, ['name', 'sla_days', 'required_documents', 'description', 'is_active', 'agent_can_submit']);
  const steps = req.body.steps;
  await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT * FROM workflow_types WHERE id = $1', [id]);
    if (!rows[0]) throw new AppError('Type introuvable', 404);
    const cols = Object.keys(data);
    if (cols.length) {
      await db.query(`UPDATE workflow_types SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}
                      WHERE id = $${cols.length + 1}`, [...Object.values(data), id]);
    }
    if (Array.isArray(steps)) {
      assert(steps.length > 0, 'Le circuit doit contenir au moins une étape');
      steps.forEach((s, i) => {
        assert(s.name, `Nom manquant à l’étape ${i + 1}`);
        assert(ASSIGNEE_KINDS[s.assignee_kind], `Valideur invalide à l’étape ${i + 1}`);
        if (s.assignee_kind === 'structure') assert(s.structure_id, `Structure requise à l’étape ${i + 1}`);
      });
      const { rows: open } = await db.query(
        `SELECT MAX(current_step) AS m FROM requests WHERE type_id = $1 AND status IN ('in_progress','awaiting_documents')`, [id]);
      assert(!open[0].m || open[0].m <= steps.length,
        `Des demandes en cours sont à l’étape ${open[0].m} : le circuit doit garder au moins ${open[0].m} étapes`, 409);
      await db.query('DELETE FROM workflow_steps WHERE type_id = $1', [id]);
      for (const [i, s] of steps.entries()) {
        await db.query(
          `INSERT INTO workflow_steps (type_id, step_order, name, assignee_kind, structure_id, expected_days)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [id, i + 1, s.name, s.assignee_kind, s.structure_id || null, toInt(s.expected_days, 5)]);
      }
    }
  });
  await logActivity(req.user.id, 'Paramétrage de circuit', 'workflow_type', id, null, req.ip);
  res.json({ ok: true });
};

// ---------------------------------------------------------------- demandes

/**
 * GET /api/requests?scope=mine|todo|institution|all&status=&type=&category=&overdue=1&q=
 *  mine        : mes demandes (je suis l'agent concerné ou le déposant)
 *  todo        : demandes dont je suis valideur de l'étape en cours
 *  institution : toutes les demandes de mon institution (gestionnaire RH)
 */
export const listRequests = async (req, res) => {
  const { page, limit, offset } = pagination(req.query);
  const u = req.user;
  const scope = req.query.scope || 'mine';
  const params = [];
  const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };

  if (scope === 'mine') {
    params.push(u.employee_id ?? -1, u.id);
    where.push(`(r.employee_id = $${params.length - 1} OR r.created_by = $${params.length})`);
  }
  if (scope === 'institution') {
    assert(isGestionnaire(u), 'Réservé aux gestionnaires RH', 403);
    add(`(r.institution_id = ? OR (r.payload->>'target_institution_id')::int = ?)`, u.institution_id);
  }
  if (scope === 'todo') where.push(`r.status IN ('in_progress','awaiting_documents')`);
  if (req.query.status) add('r.status = ?', req.query.status);
  if (req.query.type) add('r.type_id = ?', toInt(req.query.type));
  if (req.query.category) add('t.category = ?', req.query.category);
  if (req.query.overdue === '1') where.push(`r.status IN ('in_progress','awaiting_documents') AND r.due_date < CURRENT_DATE`);
  if (req.query.q) add('(r.reference ILIKE ? OR r.title ILIKE ? OR e.full_name ILIKE ?)', `%${req.query.q}%`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await query(
    `${REQUEST_SELECT} ${whereSql}
     ORDER BY (r.status IN ('in_progress','awaiting_documents')) DESC,
              CASE r.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
              r.step_due_date NULLS LAST, r.created_at DESC
     LIMIT ${scope === 'todo' ? 1000 : limit} OFFSET ${scope === 'todo' ? 0 : offset}`, params);

  const stepsCache = {};
  const enriched = [];
  for (const r of rows) {
    stepsCache[r.type_id] ||= await getSteps(r.type_id);
    const steps = stepsCache[r.type_id];
    const step = steps[r.current_step - 1];
    const open = ['in_progress', 'awaiting_documents'].includes(r.status);
    const actors = open ? await resolveActors(r, step) : [];
    const mine = canAct(u, r, actors);
    if (scope === 'todo' && !mine) continue;
    enriched.push({ ...r, total_steps: steps.length, current_step_name: step?.name, can_act: mine });
  }
  if (scope === 'todo') {
    return res.json({ data: enriched.slice(offset, offset + limit), total: enriched.length, page, limit });
  }
  const { rows: c } = await query(
    `SELECT COUNT(*) FROM requests r JOIN workflow_types t ON t.id = r.type_id
       LEFT JOIN employees e ON e.id = r.employee_id ${whereSql}`, params);
  return res.json({ data: enriched, total: c[0].count, page, limit });
};

/** GET /api/requests/:id — détail, circuit, historique, pièces, droits */
export const getRequest = async (req, res) => {
  const r = await findRequest(toInt(req.params.id));
  if (!r) throw new AppError('Demande introuvable', 404);
  const steps = await getSteps(r.type_id);
  const actors = ['in_progress', 'awaiting_documents'].includes(r.status)
    ? await resolveActors(r, steps[r.current_step - 1]) : [];
  if (!(await canView(req.user, r, actors))) throw new AppError('Demande introuvable', 404);
  const [history, docs, actorNames, target] = await Promise.all([
    query(`SELECT h.*, u.name AS user_name, a.full_name AS assigned_name FROM request_history h
             LEFT JOIN users u ON u.id = h.user_id LEFT JOIN employees a ON a.id = h.assigned_employee_id
            WHERE h.request_id = $1 ORDER BY h.created_at, h.id`, [r.id]),
    query(`SELECT id, name, category, mime_type, size_bytes, created_at FROM documents WHERE request_id = $1
            ORDER BY created_at`, [r.id]),
    query('SELECT name FROM users WHERE id = ANY($1)', [actors]),
    r.payload?.target_structure_id
      ? query('SELECT name FROM structures WHERE id = $1', [r.payload.target_structure_id]) : { rows: [] },
  ]);
  const isOwner = r.created_by === req.user.id || (req.user.employee_id && req.user.employee_id === r.employee_id);
  res.json({
    ...r,
    target_structure_name: target.rows[0]?.name,
    steps,
    current_actors: actorNames.rows.map((a) => a.name),
    history: history.rows.map((h) => ({ ...h, action_label: ACTION_LABELS[h.action] || h.action })),
    documents: docs.rows,
    permissions: {
      canAct: canAct(req.user, r, actors),
      canCancel: isOwner && ['in_progress', 'awaiting_documents'].includes(r.status),
      canAssign: canAct(req.user, r, actors) || (isGestionnaire(req.user) && req.user.institution_id === r.institution_id),
    },
  });
};

/**
 * POST /api/requests — dépôt d'une demande ou initiation d'un acte.
 * { type_id, employee_id?, title, description, payload, priority, deposit_channel }
 * - un agent dépose pour lui-même (types ouverts aux agents)
 * - un gestionnaire RH initie un acte pour un agent de son institution
 */
export const createNewRequest = async (req, res) => {
  const u = req.user;
  const { rows: t } = await query('SELECT * FROM workflow_types WHERE id = $1', [toInt(req.body.type_id)]);
  const type = t[0];
  assert(type, 'Type de demande inconnu');
  assert(!['leave', 'formation'].includes(type.effect),
    'Les absences et les formations se demandent depuis leurs modules respectifs');
  const employeeId = toInt(req.body.employee_id) || u.employee_id;
  assert(employeeId, 'Agent concerné requis');
  const emp = await findEmployeeById(employeeId);
  assert(emp, 'Agent introuvable');
  const self = employeeId === u.employee_id;
  if (self) {
    assert(type.agent_can_submit, 'Cet acte est initié par la DRH, pas par l’agent', 403);
  } else {
    assert(isGestionnaire(u) && emp.institution_id === u.institution_id,
      'Seule la DRH de l’institution de l’agent peut initier cet acte', 403);
  }
  const channel = req.body.deposit_channel || (self ? 'portail' : 'structure');
  const request = await withTransaction((db) => createRequest(db, {
    type, employee: emp, title: req.body.title, description: req.body.description,
    payload: req.body.payload || {}, userId: u.id, channel, priority: req.body.priority || 'normal',
  }));
  await logActivity(u.id, `Dépôt : ${type.name}`, 'request', request.id, `${request.reference} – ${emp.sigrh_id}`, req.ip);
  res.status(201).json(request);
};

/** POST /api/requests/:id/actions { action, comment, assigned_employee_id } */
export const requestAction = async (req, res) => {
  const id = toInt(req.params.id);
  const { request, message } = await withTransaction((db) => performAction(db, req.user, id, req.body));
  await logActivity(req.user.id, ACTION_LABELS[req.body.action] || req.body.action, 'request', id,
    `${request.reference}${message ? ` – ${message}` : ''}${req.body.comment ? ` – ${req.body.comment}` : ''}`, req.ip);
  return getRequest(req, res);
};

const MAX_DOC = 3 * 1024 * 1024;
const ALLOWED_MIME = /^(application\/pdf|image\/(png|jpe?g|webp)|application\/(msword|vnd\.openxmlformats-officedocument\.[\w.]+)|text\/plain)$/;

/** POST /api/requests/:id/documents — pièces justificatives */
export const uploadRequestDocument = async (req, res) => {
  const r = await findRequest(toInt(req.params.id));
  if (!r) throw new AppError('Demande introuvable', 404);
  const steps = await getSteps(r.type_id);
  const actors = await resolveActors(r, steps[r.current_step - 1]);
  if (!(await canView(req.user, r, actors))) throw new AppError('Demande introuvable', 404);
  const { name, mime_type: mime, content } = req.body;
  assert(name && content, 'Fichier requis');
  assert(ALLOWED_MIME.test(mime || ''), 'Type de fichier non autorisé (PDF, image, Word, texte)');
  const buf = Buffer.from(String(content).replace(/^data:[^;]+;base64,/, ''), 'base64');
  assert(buf.length > 0 && buf.length <= MAX_DOC, 'Fichier vide ou trop volumineux (3 Mo max)');
  const { rows } = await query(
    `INSERT INTO documents (request_id, employee_id, category, name, mime_type, size_bytes, content, uploaded_by)
     VALUES ($1,$2,'piece_justificative',$3,$4,$5,$6,$7) RETURNING id, name, mime_type, size_bytes, created_at`,
    [r.id, r.employee_id, name.slice(0, 200), mime, buf.length, buf, req.user.id]);
  await addHistory({ query }, r.id, steps[r.current_step - 1], 'document', req.user.id, name);
  res.status(201).json(rows[0]);
};

/** GET /api/requests/:id/documents/:docId */
export const downloadRequestDocument = async (req, res) => {
  const r = await findRequest(toInt(req.params.id));
  if (!r) throw new AppError('Demande introuvable', 404);
  const steps = await getSteps(r.type_id);
  const actors = await resolveActors(r, steps[r.current_step - 1]);
  if (!(await canView(req.user, r, actors))) throw new AppError('Demande introuvable', 404);
  const { rows } = await query('SELECT * FROM documents WHERE id = $1 AND request_id = $2', [toInt(req.params.docId), r.id]);
  if (!rows[0]) throw new AppError('Document introuvable', 404);
  res.setHeader('Content-Type', rows[0].mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(rows[0].name)}"`);
  res.send(rows[0].content);
};

/** GET /api/requests/:id/receipt — accusé de dépôt (PDF) */
export const requestReceipt = async (req, res) => {
  const r = await findRequest(toInt(req.params.id));
  if (!r) throw new AppError('Demande introuvable', 404);
  const steps = await getSteps(r.type_id);
  const actors = await resolveActors(r, steps[r.current_step - 1]);
  if (!(await canView(req.user, r, actors))) throw new AppError('Demande introuvable', 404);
  const doc = new PDFDocument({ size: 'A5', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="accuse-${r.reference}.pdf"`);
  doc.pipe(res);
  doc.fontSize(10).fillColor('#00853F').text('RÉPUBLIQUE DU SÉNÉGAL', { align: 'center' });
  doc.fontSize(8).fillColor('#555').text('Un Peuple – Un But – Une Foi', { align: 'center' });
  doc.moveDown(0.5).fontSize(12).fillColor('#000').text('SIGRH — ACCUSÉ DE DÉPÔT', { align: 'center', underline: true });
  doc.moveDown();
  doc.fontSize(10);
  [
    ['Référence', r.reference], ['Objet', r.title], ['Type', r.type_name], ['Agent', `${r.employee_name} (${r.employee_sigrh_id})`],
    ['Institution', r.institution_name], ['Déposé le', new Date(r.created_at).toLocaleDateString('fr-FR')],
    ['Délai réglementaire', `${r.sla_days} jours (échéance ${r.due_date})`],
    ['Circuit', steps.map((s) => `${s.step_order}. ${s.name}`).join(' → ')],
  ].forEach(([k, v]) => doc.font('Helvetica-Bold').text(`${k} : `, { continued: true }).font('Helvetica').text(String(v)));
  doc.moveDown(2).fontSize(8).fillColor('#666')
    .text('Suivez l’avancement de votre demande dans votre espace SIGRH, rubrique « Demandes et actes ».', { align: 'center' });
  doc.end();
};
