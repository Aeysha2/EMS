import PDFDocument from 'pdfkit';
import { query, withTransaction } from '../config/db.js';
import { isHRorAdmin } from '../middleware/auth.js';
import { getCircuit, nextReference, PROJECT_SELECT } from '../models/Project.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { addDays, isValidISODate, toISODate } from '../utils/dates.js';
import { notifyEmployee, notifyUser } from '../utils/notify.js';
import { pagination, pick, toInt } from '../utils/sanitize.js';

export const ACTION_LABELS = {
  creation: 'Enregistrement du dossier',
  assign: 'Affectation à un agent traitant',
  advance: 'Transmission à l’étape suivante',
  return: 'Retour à l’étape précédente',
  request_documents: 'Demande de pièces complémentaires',
  resume: 'Reprise du traitement',
  reject: 'Rejet du dossier',
  close: 'Clôture du dossier',
  comment: 'Commentaire',
  document: 'Pièce jointe ajoutée',
};

const PROJECT_FIELDS = [
  'title', 'description', 'request_type_id', 'deposit_type_id', 'applicant_name', 'applicant_matricule',
  'applicant_phone', 'applicant_email', 'applicant_structure', 'deposit_date', 'priority', 'department_id', 'agent_id',
];

const canViewDirect = (user, p) =>
  isHRorAdmin(user)
  || (user.employee_id && p.agent_id === user.employee_id)
  || p.created_by === user.id
  || user.managed_departments.includes(p.department_id);

/** Anyone who handled the dossier at some step keeps read access to follow it. */
const canView = async (user, p, db = { query }) => {
  if (canViewDirect(user, p)) return true;
  const { rows } = await db.query(
    `SELECT 1 FROM project_history WHERE project_id = $1
        AND (user_id = $2 OR to_agent = $3 OR from_agent = $3) LIMIT 1`,
    [p.id, user.id, user.employee_id ?? -1]
  );
  return rows.length > 0;
};

const canAssign = (user, p) => isHRorAdmin(user) || user.managed_departments.includes(p.department_id);
const canProcess = (user, p) => canAssign(user, p) || (user.employee_id && p.agent_id === user.employee_id);

const findProject = async (id, db = { query }) => {
  const { rows } = await db.query(`${PROJECT_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] || null;
};

const addHistory = (db, project, step, action, { comment, fromAgent, toAgent, userId }) =>
  db.query(
    `INSERT INTO project_history (project_id, step_order, step_name, action, from_agent, to_agent, comment, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [project.id, step?.step_order ?? project.current_step, step?.name ?? null, action,
      fromAgent ?? null, toAgent ?? null, comment || null, userId]
  );

// ------------------------------------------------------------------ configuration

/** GET /api/projects/config — deposit types, request types and circuits */
export const getConfig = async (req, res) => {
  const [deposit, types, steps] = await Promise.all([
    query('SELECT * FROM deposit_types ORDER BY name'),
    query('SELECT * FROM request_types ORDER BY name'),
    query(`SELECT cs.*, d.name AS department_name FROM circuit_steps cs
             LEFT JOIN departments d ON d.id = cs.department_id
            ORDER BY cs.request_type_id NULLS FIRST, cs.step_order`),
  ]);
  const circuits = { default: steps.rows.filter((s) => s.request_type_id === null) };
  for (const s of steps.rows.filter((x) => x.request_type_id !== null)) {
    (circuits[s.request_type_id] ||= []).push(s);
  }
  res.json({ depositTypes: deposit.rows, requestTypes: types.rows, circuits });
};

/** POST|PUT /api/projects/request-types[/:id] (Admin/HR) */
export const saveRequestType = async (req, res) => {
  const data = pick(req.body, ['code', 'name', 'description', 'sla_days', 'required_documents', 'is_active']);
  const id = toInt(req.params.id);
  let rows;
  if (id) {
    const cols = Object.keys(data);
    assert(cols.length, 'Aucune modification');
    ({ rows } = await query(
      `UPDATE request_types SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1} RETURNING *`,
      [...Object.values(data), id]
    ));
    if (!rows[0]) throw new AppError('Type de demande introuvable', 404);
  } else {
    assert(data.code && data.name, 'Code et libellé requis');
    ({ rows } = await query(
      `INSERT INTO request_types (code, name, description, sla_days, required_documents)
       VALUES (upper($1),$2,$3,COALESCE($4,30),$5) RETURNING *`,
      [data.code, data.name, data.description || null, data.sla_days ? toInt(data.sla_days) : null, data.required_documents || null]
    ));
  }
  await logActivity(req.user.id, 'Paramétrage type de demande', 'request_type', rows[0].id, rows[0].name);
  res.status(id ? 200 : 201).json(rows[0]);
};

/** POST|PUT /api/projects/deposit-types[/:id] (Admin/HR) */
export const saveDepositType = async (req, res) => {
  const { name, description, is_active: isActive } = req.body;
  const id = toInt(req.params.id);
  let rows;
  if (id) {
    ({ rows } = await query(
      `UPDATE deposit_types SET name = COALESCE($1, name), description = COALESCE($2, description),
              is_active = COALESCE($3, is_active) WHERE id = $4 RETURNING *`,
      [name || null, description ?? null, isActive ?? null, id]
    ));
    if (!rows[0]) throw new AppError('Type de dépôt introuvable', 404);
  } else {
    assert(name, 'Libellé requis');
    ({ rows } = await query('INSERT INTO deposit_types (name, description) VALUES ($1,$2) RETURNING *', [name, description || null]));
  }
  res.status(id ? 200 : 201).json(rows[0]);
};

/**
 * PUT /api/projects/circuit (Admin/HR)
 * { request_type_id: number|null, steps: [{ name, department_id, expected_days }] } — replaces the circuit.
 * Sending an empty list for a request type makes it fall back to the default circuit.
 */
export const saveCircuit = async (req, res) => {
  const typeId = req.body.request_type_id ? toInt(req.body.request_type_id) : null;
  const steps = Array.isArray(req.body.steps) ? req.body.steps : [];
  assert(typeId !== null || steps.length > 0, 'Le circuit par défaut doit contenir au moins une étape');
  steps.forEach((s, i) => assert(s.name, `Nom manquant pour l’étape ${i + 1}`));

  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT MAX(current_step) AS m FROM projects p
        WHERE status IN ('in_progress','awaiting_documents')
          AND (p.request_type_id = $1 OR ($1 IS NULL AND NOT EXISTS
               (SELECT 1 FROM circuit_steps c WHERE c.request_type_id = p.request_type_id)))`,
      [typeId]
    );
    if (rows[0].m && steps.length && rows[0].m > steps.length) {
      throw new AppError(`Des dossiers en cours sont à l’étape ${rows[0].m} : le circuit doit garder au moins ${rows[0].m} étapes`, 409);
    }
    await client.query('DELETE FROM circuit_steps WHERE request_type_id IS NOT DISTINCT FROM $1', [typeId]);
    for (const [i, s] of steps.entries()) {
      await client.query(
        'INSERT INTO circuit_steps (request_type_id, step_order, name, department_id, expected_days) VALUES ($1,$2,$3,$4,$5)',
        [typeId, i + 1, s.name, s.department_id ? toInt(s.department_id) : null, toInt(s.expected_days, 5)]
      );
    }
  });
  await logActivity(req.user.id, 'Paramétrage du circuit', 'circuit', typeId, `${steps.length} étape(s)`);
  res.json(await getCircuit(typeId));
};

// ------------------------------------------------------------------ dossiers

/** GET /api/projects?q=&status=&type=&deposit=&agent=&step=&priority=&overdue=1&from=&to=&scope=mine|all */
export const listProjects = async (req, res) => {
  const { page, limit, offset } = pagination(req.query);
  const params = [];
  const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };

  if (req.query.scope === 'mine') {
    // "Mes dossiers à traiter": only those assigned to me
    add('p.agent_id = ?', req.user.employee_id ?? -1);
  } else if (!isHRorAdmin(req.user)) {
    params.push(req.user.employee_id ?? -1, req.user.id, req.user.managed_departments);
    const n = params.length;
    where.push(`(p.agent_id = $${n - 2} OR p.created_by = $${n - 1} OR p.department_id = ANY($${n})
         OR EXISTS (SELECT 1 FROM project_history h WHERE h.project_id = p.id
                     AND (h.user_id = $${n - 1} OR h.to_agent = $${n - 2} OR h.from_agent = $${n - 2})))`);
  }
  if (req.query.q) {
    add(`(p.reference ILIKE ? OR p.title ILIKE ? OR p.applicant_name ILIKE ? OR p.applicant_matricule ILIKE ?)`,
      `%${req.query.q}%`);
  }
  if (req.query.status) add('p.status = ?', req.query.status);
  if (req.query.type) add('p.request_type_id = ?', toInt(req.query.type));
  if (req.query.deposit) add('p.deposit_type_id = ?', toInt(req.query.deposit));
  if (req.query.agent) add('p.agent_id = ?', toInt(req.query.agent));
  if (req.query.department) add('p.department_id = ?', toInt(req.query.department));
  if (req.query.step) add('p.current_step = ?', toInt(req.query.step));
  if (req.query.priority) add('p.priority = ?', req.query.priority);
  if (req.query.overdue === '1') where.push(`p.status IN ('in_progress','awaiting_documents') AND p.due_date < CURRENT_DATE`);
  if (req.query.from && isValidISODate(req.query.from)) add('p.deposit_date >= ?', req.query.from);
  if (req.query.to && isValidISODate(req.query.to)) add('p.deposit_date <= ?', req.query.to);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [list, count] = await Promise.all([
    query(
      `SELECT * FROM (${PROJECT_SELECT} ${whereSql}) x
        ORDER BY (status IN ('in_progress','awaiting_documents')) DESC,
                 CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                 due_date NULLS LAST, created_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
    query(`SELECT COUNT(*) FROM projects p ${whereSql}`, params),
  ]);

  // attach current step name
  const circuits = {};
  for (const p of list.rows) {
    circuits[p.request_type_id] ||= await getCircuit(p.request_type_id);
    const circuit = circuits[p.request_type_id];
    p.total_steps = circuit.length;
    p.current_step_name = circuit[p.current_step - 1]?.name || null;
  }
  res.json({ data: list.rows, total: count.rows[0].count, page, limit });
};

/** GET /api/projects/:id — details, circuit, history, documents */
export const getProject = async (req, res) => {
  const p = await findProject(toInt(req.params.id));
  if (!p || !(await canView(req.user, p))) throw new AppError('Dossier introuvable', 404);
  const [circuit, history, docs] = await Promise.all([
    getCircuit(p.request_type_id),
    query(`SELECT h.*, fa.full_name AS from_agent_name, ta.full_name AS to_agent_name, u.name AS user_name
             FROM project_history h
             LEFT JOIN employees fa ON fa.id = h.from_agent
             LEFT JOIN employees ta ON ta.id = h.to_agent
             LEFT JOIN users u ON u.id = h.user_id
            WHERE h.project_id = $1 ORDER BY h.created_at, h.id`, [p.id]),
    query(`SELECT id, name, category, mime_type, size_bytes, created_at FROM documents
            WHERE project_id = $1 ORDER BY created_at`, [p.id]),
  ]);
  res.json({
    ...p,
    circuit,
    history: history.rows.map((h) => ({ ...h, action_label: ACTION_LABELS[h.action] || h.action })),
    documents: docs.rows,
    permissions: { canAssign: canAssign(req.user, p), canProcess: canProcess(req.user, p) },
  });
};

/** POST /api/projects — register a new dossier (enregistrement) */
export const createProject = async (req, res) => {
  const data = pick(req.body, PROJECT_FIELDS);
  assert(data.title, 'L’objet du dossier est requis');
  assert(data.applicant_name, 'Le nom du demandeur est requis');
  assert(toInt(data.request_type_id), 'Type de demande requis');
  assert(toInt(data.deposit_type_id), 'Type de dépôt requis');
  if (data.deposit_date) assert(isValidISODate(data.deposit_date), 'Date de dépôt invalide');
  if (data.priority) assert(['low', 'normal', 'high', 'urgent'].includes(data.priority), 'Priorité invalide');
  const depositDate = data.deposit_date || toISODate();
  assert(depositDate <= toISODate(), 'La date de dépôt ne peut pas être dans le futur');

  const { rows: rt } = await query('SELECT * FROM request_types WHERE id = $1 AND is_active', [toInt(data.request_type_id)]);
  if (!rt[0]) throw new AppError('Type de demande invalide', 400);
  const circuit = await getCircuit(rt[0].id);
  assert(circuit.length, 'Aucun circuit de traitement n’est paramétré');
  const agentId = data.agent_id ? toInt(data.agent_id) : null;
  if (agentId && !isHRorAdmin(req.user) && !req.user.isManager) {
    throw new AppError('Seuls les RH, administrateurs et chefs de service affectent un agent', 403);
  }

  const project = await withTransaction(async (client) => {
    const reference = await nextReference(client);
    const { rows } = await client.query(
      `INSERT INTO projects (reference, title, description, request_type_id, deposit_type_id, applicant_name,
         applicant_matricule, applicant_phone, applicant_email, applicant_structure, deposit_date, due_date,
         priority, agent_id, department_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [reference, data.title, data.description || null, rt[0].id, toInt(data.deposit_type_id), data.applicant_name,
        data.applicant_matricule || null, data.applicant_phone || null, data.applicant_email || null,
        data.applicant_structure || null, depositDate, addDays(depositDate, rt[0].sla_days),
        data.priority || 'normal', agentId, toInt(data.department_id) || circuit[0].department_id || null, req.user.id]
    );
    const p = rows[0];
    await addHistory(client, p, circuit[0], 'creation', { comment: data.description, userId: req.user.id });
    if (agentId) {
      await addHistory(client, p, circuit[0], 'assign', { toAgent: agentId, userId: req.user.id });
      await notifyEmployee(agentId, 'project', 'Nouveau dossier affecté',
        `${reference} – ${data.title}`, `/projects/${p.id}`, client);
    }
    return p;
  });

  await logActivity(req.user.id, 'Enregistrement de dossier', 'project', project.id, `${project.reference} – ${project.title}`);
  res.status(201).json(await findProject(project.id));
};

/** PUT /api/projects/:id — edit registration details (not the workflow) */
export const updateProject = async (req, res) => {
  const id = toInt(req.params.id);
  const p = await findProject(id);
  if (!p || !(await canView(req.user, p))) throw new AppError('Dossier introuvable', 404);
  if (!canProcess(req.user, p) && p.created_by !== req.user.id) throw new AppError('Accès refusé', 403);
  const data = pick(req.body, ['title', 'description', 'applicant_name', 'applicant_matricule', 'applicant_phone',
    'applicant_email', 'applicant_structure', 'priority', 'deposit_type_id']);
  assert(Object.keys(data).length, 'Aucune modification');
  const cols = Object.keys(data);
  await query(
    `UPDATE projects SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${cols.length + 1}`,
    [...Object.values(data), id]
  );
  res.json(await findProject(id));
};

/**
 * POST /api/projects/:id/actions — move the dossier through its circuit
 * { action: assign|advance|return|request_documents|resume|reject|close|comment, comment?, agent_id? }
 */
export const projectAction = async (req, res) => {
  const id = toInt(req.params.id);
  const { action, comment } = req.body;
  assert(ACTION_LABELS[action] && !['creation', 'document'].includes(action), 'Action invalide');
  const newAgent = req.body.agent_id ? toInt(req.body.agent_id) : null;

  const outcome = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM projects WHERE id = $1 FOR UPDATE', [id]);
    const p = rows[0];
    if (!p || !(await canView(req.user, p))) throw new AppError('Dossier introuvable', 404);
    const circuit = await getCircuit(p.request_type_id, client);
    const step = circuit[p.current_step - 1];
    const open = ['in_progress', 'awaiting_documents'].includes(p.status);
    const ctx = { comment, userId: req.user.id, fromAgent: p.agent_id };
    const set = { updated_at: new Date() };
    let notifyAgent = null;
    let historyStep = step;

    if (action === 'comment') {
      assert(comment, 'Commentaire requis');
    } else {
      assert(open, 'Ce dossier est clôturé');
      const allowed = action === 'assign' ? canAssign(req.user, p) : canProcess(req.user, p);
      if (!allowed) throw new AppError('Vous n’êtes pas autorisé à effectuer cette action sur ce dossier', 403);
    }

    switch (action) {
      case 'assign': {
        assert(newAgent, 'Agent traitant requis');
        const { rows: ag } = await client.query(
          `SELECT id FROM employees WHERE id = $1 AND status IN ('active','on_leave')`, [newAgent]);
        assert(ag[0], 'Agent introuvable ou inactif');
        set.agent_id = newAgent;
        ctx.toAgent = newAgent;
        notifyAgent = newAgent;
        break;
      }
      case 'advance': {
        assert(p.status === 'in_progress', 'Le dossier attend des pièces complémentaires');
        const next = circuit[p.current_step];
        if (!next) throw new AppError('Dernière étape atteinte : utilisez « Clôturer »', 400);
        set.current_step = p.current_step + 1;
        set.department_id = next.department_id || p.department_id;
        // Hand over to the agent chosen for the next step, otherwise leave unassigned for the next service
        set.agent_id = newAgent || (next.department_id && next.department_id !== p.department_id ? null : p.agent_id);
        ctx.toAgent = set.agent_id;
        notifyAgent = set.agent_id !== p.agent_id ? set.agent_id : null;
        historyStep = next;
        break;
      }
      case 'return': {
        assert(p.current_step > 1, 'Le dossier est déjà à la première étape');
        assert(comment, 'Motif du retour requis');
        const prev = circuit[p.current_step - 2];
        set.current_step = p.current_step - 1;
        set.department_id = prev.department_id || p.department_id;
        set.agent_id = newAgent || null;
        ctx.toAgent = set.agent_id;
        notifyAgent = set.agent_id;
        historyStep = prev;
        break;
      }
      case 'request_documents':
        assert(comment, 'Précisez les pièces demandées');
        assert(p.status === 'in_progress', 'Des pièces sont déjà demandées');
        set.status = 'awaiting_documents';
        break;
      case 'resume':
        assert(p.status === 'awaiting_documents', 'Le dossier n’est pas en attente de pièces');
        set.status = 'in_progress';
        break;
      case 'reject':
        assert(comment, 'Motif du rejet requis');
        set.status = 'rejected';
        set.closed_at = new Date();
        break;
      case 'close':
        assert(p.current_step === circuit.length, `Le dossier doit d’abord atteindre la dernière étape (${circuit.length})`);
        set.status = 'completed';
        set.closed_at = new Date();
        break;
      default:
        break;
    }

    const cols = Object.keys(set);
    await client.query(
      `UPDATE projects SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1}`,
      [...Object.values(set), id]
    );
    await addHistory(client, p, historyStep, action, ctx);

    if (notifyAgent) {
      await notifyEmployee(notifyAgent, 'project', 'Dossier à traiter',
        `${p.reference} – ${p.title} (${historyStep?.name || 'étape'})`, `/projects/${p.id}`, client);
    }
    if (['reject', 'close'].includes(action) && p.created_by && p.created_by !== req.user.id) {
      await notifyUser(p.created_by, 'project', `Dossier ${action === 'close' ? 'clôturé' : 'rejeté'}`,
        `${p.reference} – ${p.title}`, `/projects/${p.id}`, client);
    }
    return p;
  });

  await logActivity(req.user.id, ACTION_LABELS[action], 'project', id, `${outcome.reference}${comment ? ` – ${comment}` : ''}`);
  req.params.id = String(id);
  return getProject(req, res);
};

// ------------------------------------------------------------------ documents

const MAX_DOC_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME = /^(application\/pdf|image\/(png|jpe?g|webp)|application\/(msword|vnd\.openxmlformats-officedocument\.[\w.]+)|text\/plain)$/;

/** POST /api/projects/:id/documents { name, mime_type, content (base64), category } */
export const uploadProjectDocument = async (req, res) => {
  const p = await findProject(toInt(req.params.id));
  if (!p || !(await canView(req.user, p))) throw new AppError('Dossier introuvable', 404);
  const { name, mime_type: mime, content, category } = req.body;
  assert(name && content, 'Fichier requis');
  assert(ALLOWED_MIME.test(mime || ''), 'Type de fichier non autorisé (PDF, image, Word, texte)');
  const buffer = Buffer.from(String(content).replace(/^data:[^;]+;base64,/, ''), 'base64');
  assert(buffer.length > 0 && buffer.length <= MAX_DOC_BYTES, 'Fichier vide ou trop volumineux (3 Mo max)');
  const { rows } = await query(
    `INSERT INTO documents (project_id, name, category, mime_type, size_bytes, content, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, category, mime_type, size_bytes, created_at`,
    [p.id, name.slice(0, 200), category || null, mime, buffer.length, buffer, req.user.id]
  );
  await addHistory({ query }, p, null, 'document', { comment: name, userId: req.user.id });
  res.status(201).json(rows[0]);
};

/** GET /api/projects/:id/documents/:docId */
export const downloadProjectDocument = async (req, res) => {
  const p = await findProject(toInt(req.params.id));
  if (!p || !(await canView(req.user, p))) throw new AppError('Dossier introuvable', 404);
  const { rows } = await query('SELECT * FROM documents WHERE id = $1 AND project_id = $2',
    [toInt(req.params.docId), p.id]);
  if (!rows[0]) throw new AppError('Document introuvable', 404);
  res.setHeader('Content-Type', rows[0].mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(rows[0].name)}"`);
  res.send(rows[0].content);
};

/** GET /api/projects/:id/receipt — récépissé de dépôt (PDF) */
export const depositReceipt = async (req, res) => {
  const p = await findProject(toInt(req.params.id));
  if (!p || !(await canView(req.user, p))) throw new AppError('Dossier introuvable', 404);
  const doc = new PDFDocument({ size: 'A5', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="recepisse-${p.reference}.pdf"`);
  doc.pipe(res);
  doc.fontSize(13).fillColor('#1e3a8a').text(process.env.ORG_NAME || 'Ministère de la Fonction Publique', { align: 'center' });
  doc.moveDown(0.3).fontSize(11).fillColor('#000').text('RÉCÉPISSÉ DE DÉPÔT DE DOSSIER', { align: 'center', underline: true });
  doc.moveDown();
  doc.fontSize(10);
  [
    ['Référence', p.reference],
    ['Objet', p.title],
    ['Type de demande', p.request_type_name],
    ['Mode de dépôt', p.deposit_type_name],
    ['Demandeur', p.applicant_name],
    ['Matricule', p.applicant_matricule || '—'],
    ['Structure', p.applicant_structure || '—'],
    ['Date de dépôt', p.deposit_date],
    ['Délai de traitement estimé', `${p.sla_days} jours (échéance ${p.due_date})`],
  ].forEach(([k, v]) => doc.font('Helvetica-Bold').text(`${k} : `, { continued: true }).font('Helvetica').text(String(v)));
  doc.moveDown(2).fontSize(8).fillColor('#666')
    .text('Conservez ce récépissé : la référence permet de suivre l’avancement de votre dossier.', { align: 'center' })
    .text(`Émis le ${new Date().toLocaleString('fr-FR')}`, { align: 'center' });
  doc.end();
};
