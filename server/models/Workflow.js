import { query } from '../config/db.js';
import AppError, { assert } from '../utils/AppError.js';
import { addDays, isValidISODate, toISODate } from '../utils/dates.js';
import { notifyEmployee, notifyUsers } from '../utils/notify.js';
import { POSITIONS_STATUTAIRES, trackChanges } from './Employee.js';
import { ancestors, institutionOf, subtreeIds } from './Structure.js';

export const ASSIGNEE_KINDS = {
  chef_structure: 'Responsable de la structure de l’agent',
  chef_superieur: 'Responsable de la structure supérieure',
  drh_institution: 'DRH / gestionnaires RH de l’institution',
  drh_destination: 'DRH de l’institution d’accueil',
  structure: 'Structure désignée (ex. DGFP)',
  pilotage: 'Pilotage (SGG / Présidence)',
};

export const ACTION_LABELS = {
  creation: 'Dépôt de la demande',
  approve: 'Validation de l’étape',
  return: 'Retour à l’étape précédente',
  request_documents: 'Demande de pièces complémentaires',
  resume: 'Reprise du traitement',
  reject: 'Rejet',
  cancel: 'Annulation par le demandeur',
  assign: 'Affectation à un agent traitant',
  comment: 'Commentaire',
  document: 'Pièce jointe ajoutée',
  final: 'Validation finale — acte appliqué',
  alert: 'Alerte de dépassement de délai',
};

export const REQUEST_SELECT = `
  SELECT r.*, t.code AS type_code, t.name AS type_name, t.category, t.effect, t.sla_days,
         e.full_name AS employee_name, e.sigrh_id AS employee_sigrh_id, e.structure_id AS employee_structure_id,
         es.name AS employee_structure_name, inst.name AS institution_name, inst.sigle AS institution_sigle,
         a.full_name AS assigned_name, cu.name AS created_by_name,
         (r.status IN ('in_progress','awaiting_documents') AND r.due_date < CURRENT_DATE) AS is_overdue,
         (r.status IN ('in_progress','awaiting_documents') AND r.step_due_date < CURRENT_DATE) AS step_overdue
    FROM requests r
    JOIN workflow_types t ON t.id = r.type_id
    LEFT JOIN employees e ON e.id = r.employee_id
    LEFT JOIN structures es ON es.id = e.structure_id
    LEFT JOIN structures inst ON inst.id = r.institution_id
    LEFT JOIN employees a ON a.id = r.assigned_employee_id
    LEFT JOIN users cu ON cu.id = r.created_by`;

export const getSteps = async (typeId, db = { query }) => {
  const { rows } = await db.query(
    `SELECT ws.*, s.name AS structure_name FROM workflow_steps ws
       LEFT JOIN structures s ON s.id = ws.structure_id
      WHERE ws.type_id = $1 ORDER BY ws.step_order`,
    [typeId]
  );
  return rows;
};

export const findRequest = async (id, db = { query }) => {
  const { rows } = await db.query(`${REQUEST_SELECT} WHERE r.id = $1`, [id]);
  return rows[0] || null;
};

const usersOfEmployees = async (db, employeeIds) => {
  const ids = employeeIds.filter(Boolean);
  if (!ids.length) return [];
  const { rows } = await db.query('SELECT id FROM users WHERE employee_id = ANY($1) AND is_active', [ids]);
  return rows.map((r) => r.id);
};

const gestionnairesOf = async (db, institutionId) => {
  if (!institutionId) return [];
  const { rows } = await db.query(
    `SELECT u.id FROM users u JOIN structures s ON s.id = u.structure_id
      WHERE u.role = 'gestionnaire_rh' AND u.is_active AND s.institution_id = $1`,
    [institutionId]
  );
  return rows.map((r) => r.id);
};

/** Responsables (hors l'agent lui-même) en remontant l'organigramme depuis la structure de l'agent. */
const headsChain = async (db, request) => {
  if (!request.employee_structure_id) return [];
  const chain = await ancestors(request.employee_structure_id, db);
  const heads = [];
  for (const s of chain) {
    if (s.head_agent_id && s.head_agent_id !== request.employee_id && !heads.includes(s.head_agent_id)) {
      heads.push(s.head_agent_id);
    }
  }
  return heads;
};

/**
 * Comptes habilités à valider l'étape courante. Si personne n'est trouvé
 * (poste de responsable vacant…), la DRH de l'institution assure la suppléance.
 */
export const resolveActors = async (request, step, db = { query }) => {
  if (!step) return [];
  let actors = [];
  switch (step.assignee_kind) {
    case 'chef_structure':
      actors = await usersOfEmployees(db, (await headsChain(db, request)).slice(0, 1));
      break;
    case 'chef_superieur':
      actors = await usersOfEmployees(db, (await headsChain(db, request)).slice(1, 2));
      break;
    case 'drh_institution':
      actors = await gestionnairesOf(db, request.institution_id);
      break;
    case 'drh_destination':
      actors = await gestionnairesOf(db, request.payload?.target_institution_id);
      break;
    case 'structure': {
      if (!step.structure_id) break;
      const ids = await subtreeIds(step.structure_id, db);
      const { rows } = await db.query(
        `SELECT u.id FROM users u WHERE u.is_active AND (
            (u.role = 'gestionnaire_rh' AND u.structure_id = ANY($1))
            OR u.employee_id = (SELECT head_agent_id FROM structures WHERE id = $2))`,
        [ids, step.structure_id]
      );
      actors = rows.map((r) => r.id);
      break;
    }
    case 'pilotage': {
      const inst = step.structure_id ? await institutionOf(step.structure_id, db) : null;
      const { rows } = await db.query(
        `SELECT u.id FROM users u LEFT JOIN structures s ON s.id = u.structure_id
          WHERE u.role = 'pilotage' AND u.is_active AND ($1::int IS NULL OR s.institution_id = $1)`,
        [inst]
      );
      actors = rows.map((r) => r.id);
      break;
    }
    default:
      break;
  }
  if (!actors.length) actors = await gestionnairesOf(db, request.institution_id);
  return actors;
};

/** L'utilisateur peut-il agir sur l'étape courante ? (jamais sur sa propre demande) */
export const canAct = (user, request, actors) => {
  if (!['in_progress', 'awaiting_documents'].includes(request.status)) return false;
  if (user.employee_id && user.employee_id === request.employee_id) return false;
  return actors.includes(user.id)
    || (user.employee_id && request.assigned_employee_id === user.employee_id);
};

/** Visibilité d'une demande. */
export const canView = async (user, request, actors, db = { query }) => {
  if (request.created_by === user.id) return true;
  if (user.employee_id && [request.employee_id, request.assigned_employee_id].includes(user.employee_id)) return true;
  if (actors.includes(user.id)) return true;
  if (user.role === 'gestionnaire_rh'
      && [request.institution_id, request.payload?.target_institution_id].includes(user.institution_id)) return true;
  if (user.managed_structures.includes(request.employee_structure_id)) return true;
  const { rows } = await db.query(
    'SELECT 1 FROM request_history WHERE request_id = $1 AND user_id = $2 LIMIT 1', [request.id, user.id]
  );
  return rows.length > 0;
};

export const addHistory = (db, requestId, step, action, userId, comment = null, assignedEmployeeId = null) =>
  db.query(
    `INSERT INTO request_history (request_id, step_order, step_name, action, comment, assigned_employee_id, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [requestId, step?.step_order ?? null, step?.name ?? null, action, comment, assignedEmployeeId, userId]
  );

const nextReference = async (db) => {
  const { rows } = await db.query(`SELECT nextval('request_reference_seq') AS n`);
  return `SIGRH-${new Date().getFullYear()}-${String(rows[0].n).padStart(6, '0')}`;
};

// ---------------------------------------------------------------- validation des paramètres selon l'effet

const EFFECT_VALIDATORS = {
  mutation: async (db, payload, employee) => {
    const target = Number(payload.target_structure_id);
    assert(target, 'Structure d’accueil requise');
    const { rows } = await db.query('SELECT id, institution_id, is_active FROM structures WHERE id = $1', [target]);
    assert(rows[0]?.is_active, 'Structure d’accueil introuvable ou inactive');
    assert(target !== employee.structure_id, 'L’agent est déjà affecté à cette structure');
    return { ...payload, target_structure_id: target, target_institution_id: rows[0].institution_id };
  },
  avancement: async (db, payload) => {
    assert(payload.grade || payload.echelon, 'Nouveau grade ou nouvel échelon requis');
    if (payload.echelon) assert(Number(payload.echelon) >= 1 && Number(payload.echelon) <= 20, 'Échelon invalide');
    if (payload.hierarchie) assert(['A', 'B', 'C', 'D'].includes(payload.hierarchie), 'Hiérarchie invalide');
    return payload;
  },
  nomination: async (db, payload) => {
    assert(payload.fonction, 'Fonction de nomination requise');
    return payload;
  },
  position: async (db, payload) => {
    assert(['activite', 'detachement', 'disponibilite', 'suspension'].includes(payload.position_statutaire),
      'Position statutaire demandée invalide');
    return payload;
  },
  titularisation: async (db, payload, employee) => {
    assert(employee.statut_emploi !== 'fonctionnaire', 'L’agent est déjà titulaire');
    return payload;
  },
  retraite: async (db, payload) => payload,
  leave: async (db, payload) => { assert(payload.leave_id, 'Absence liée manquante'); return payload; },
  formation: async (db, payload) => { assert(payload.enrollment_id, 'Inscription liée manquante'); return payload; },
  none: async (db, payload) => payload,
};

/**
 * Crée une demande et la place à l'étape 1 de son circuit.
 * type : ligne workflow_types ; employee : agent concerné (ligne employees + institution_id)
 */
export const createRequest = async (db, { type, employee, title, description, payload = {}, userId,
  channel = 'portail', priority = 'normal' }) => {
  assert(type?.is_active, 'Type de demande inactif');
  const steps = await getSteps(type.id, db);
  assert(steps.length, 'Aucun circuit de validation n’est paramétré pour ce type de demande');
  if (payload.effective_date) assert(isValidISODate(payload.effective_date), 'Date d’effet invalide');
  const cleanPayload = await EFFECT_VALIDATORS[type.effect](db, payload, employee);

  const today = toISODate();
  const { rows } = await db.query(
    `INSERT INTO requests (reference, type_id, title, description, employee_id, institution_id, deposit_channel,
                           payload, priority, step_due_date, due_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [await nextReference(db), type.id, title || type.name, description || null, employee.id,
      employee.institution_id, channel, JSON.stringify(cleanPayload), priority,
      addDays(today, steps[0].expected_days), addDays(today, type.sla_days), userId]
  );
  const request = await findRequest(rows[0].id, db);
  await addHistory(db, request.id, steps[0], 'creation', userId, description);
  const actors = await resolveActors(request, steps[0], db);
  await notifyUsers(actors, 'workflow', `À valider : ${type.name}`,
    `${request.reference} — ${employee.full_name} (${steps[0].name})`, `/requests/${request.id}`, db);
  return request;
};

// ---------------------------------------------------------------- effets de la validation finale

const careerEvent = (db, employeeId, type, date, description, details, requestId, userId, acteRef = null) =>
  db.query(
    `INSERT INTO career_events (employee_id, type, effective_date, acte_reference, description, details, request_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [employeeId, type, date, acteRef, description, JSON.stringify(details || {}), requestId, userId]
  );

const updateEmployee = async (db, emp, fields, userId, requestId) => {
  const cols = Object.keys(fields);
  await db.query(
    `UPDATE employees SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${cols.length + 1}`,
    [...Object.values(fields), emp.id]
  );
  await trackChanges(db, 'employee', emp.id, emp, fields, userId, requestId);
};

const leaveBalanceRow = async (db, employeeId, type, year) => {
  const { rows: lt } = await db.query('SELECT * FROM leave_types WHERE code = $1', [type]);
  if (lt[0]?.annual_quota === null || lt[0]?.annual_quota === undefined) return null;
  await db.query(
    `INSERT INTO leave_balances (employee_id, leave_type, year, allotted) VALUES ($1,$2,$3,$4)
     ON CONFLICT DO NOTHING`,
    [employeeId, type, year, lt[0].annual_quota]
  );
  const { rows } = await db.query(
    'SELECT * FROM leave_balances WHERE employee_id = $1 AND leave_type = $2 AND year = $3 FOR UPDATE',
    [employeeId, type, year]
  );
  return rows[0];
};
export { leaveBalanceRow };

const EFFECTS = {
  none: async () => null,

  leave: async (db, r, emp, userId) => {
    const { rows } = await db.query('SELECT * FROM leaves WHERE id = $1 FOR UPDATE', [r.payload.leave_id]);
    const leave = rows[0];
    assert(leave && leave.status === 'pending', 'Absence déjà traitée');
    const bal = await leaveBalanceRow(db, leave.employee_id, leave.leave_type, Number(leave.start_date.slice(0, 4)));
    if (bal) {
      assert(bal.allotted - bal.used >= leave.days, `Solde insuffisant (${bal.allotted - bal.used} j restants)`, 409);
      await db.query('UPDATE leave_balances SET used = used + $1 WHERE employee_id = $2 AND leave_type = $3 AND year = $4',
        [leave.days, leave.employee_id, leave.leave_type, bal.year]);
    }
    await db.query(`UPDATE leaves SET status = 'approved', decided_at = now() WHERE id = $1`, [leave.id]);
    return `Absence du ${leave.start_date} au ${leave.end_date} approuvée`;
  },

  mutation: async (db, r, emp, userId, date) => {
    const p = r.payload;
    await db.query('UPDATE affectations SET end_date = $1 WHERE employee_id = $2 AND end_date IS NULL AND start_date < $3',
      [addDays(date, -1), emp.id, date]);
    await db.query('UPDATE affectations SET end_date = start_date WHERE employee_id = $1 AND end_date IS NULL', [emp.id]);
    await db.query(
      `INSERT INTO affectations (employee_id, structure_id, fonction, start_date, acte_reference, request_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [emp.id, p.target_structure_id, p.fonction || emp.fonction, date, p.acte_reference || r.reference, r.id]
    );
    // L'agent quitte sa structure : s'il la dirigeait, le poste de responsable devient vacant
    await db.query('UPDATE structures SET head_agent_id = NULL WHERE head_agent_id = $1', [emp.id]);
    await db.query('UPDATE positions SET employee_id = NULL WHERE employee_id = $1', [emp.id]);
    await updateEmployee(db, emp, {
      structure_id: p.target_structure_id, fonction: p.fonction || emp.fonction, date_prise_service: date,
    }, userId, r.id);
    await db.query('UPDATE users SET structure_id = $1 WHERE employee_id = $2', [p.target_structure_id, emp.id]);
    const { rows } = await db.query('SELECT name FROM structures WHERE id = $1', [p.target_structure_id]);
    await careerEvent(db, emp.id, 'mutation', date, `Mutation vers ${rows[0].name}`,
      { from: emp.structure_id, to: p.target_structure_id }, r.id, userId, p.acte_reference);
    return `Mutation appliquée : ${rows[0].name}`;
  },

  avancement: async (db, r, emp, userId, date) => {
    const p = r.payload;
    const fields = {};
    if (p.grade) fields.grade = p.grade;
    if (p.echelon) fields.echelon = Number(p.echelon);
    if (p.hierarchie) fields.hierarchie = p.hierarchie;
    if (p.corps_id) fields.corps_id = Number(p.corps_id);
    if (p.salary) fields.salary = Number(p.salary);
    await updateEmployee(db, emp, fields, userId, r.id);
    const promotion = (p.hierarchie && p.hierarchie !== emp.hierarchie) || (p.corps_id && Number(p.corps_id) !== emp.corps_id);
    await careerEvent(db, emp.id, promotion ? 'promotion' : 'avancement', date,
      `${promotion ? 'Promotion' : 'Avancement'} : grade ${fields.grade || emp.grade}, échelon ${fields.echelon || emp.echelon}`,
      { before: { grade: emp.grade, echelon: emp.echelon }, after: fields }, r.id, userId, p.acte_reference);
    return 'Avancement appliqué au dossier';
  },

  nomination: async (db, r, emp, userId, date) => {
    const p = r.payload;
    await updateEmployee(db, emp, { fonction: p.fonction }, userId, r.id);
    if (p.head_of_structure_id) {
      await db.query('UPDATE structures SET head_agent_id = $1 WHERE id = $2', [emp.id, Number(p.head_of_structure_id)]);
    }
    await careerEvent(db, emp.id, 'nomination', date, `Nomination : ${p.fonction}`, p, r.id, userId, p.acte_reference);
    return `Nomination appliquée : ${p.fonction}`;
  },

  position: async (db, r, emp, userId, date) => {
    const pos = r.payload.position_statutaire;
    await updateEmployee(db, emp, { position_statutaire: pos }, userId, r.id);
    const type = pos === 'activite' ? 'reintegration' : pos;
    await careerEvent(db, emp.id, type, date, `Position : ${POSITIONS_STATUTAIRES[pos]}`, r.payload, r.id, userId,
      r.payload.acte_reference);
    return `Position statutaire : ${POSITIONS_STATUTAIRES[pos]}`;
  },

  titularisation: async (db, r, emp, userId, date) => {
    await updateEmployee(db, emp, { statut_emploi: 'fonctionnaire' }, userId, r.id);
    await careerEvent(db, emp.id, 'titularisation', date, 'Titularisation', {}, r.id, userId, r.payload.acte_reference);
    return 'Agent titularisé';
  },

  retraite: async (db, r, emp, userId, date) => {
    await updateEmployee(db, emp, { position_statutaire: 'retraite' }, userId, r.id);
    await db.query('UPDATE structures SET head_agent_id = NULL WHERE head_agent_id = $1', [emp.id]);
    await db.query('UPDATE positions SET employee_id = NULL WHERE employee_id = $1', [emp.id]);
    await db.query('UPDATE affectations SET end_date = $1 WHERE employee_id = $2 AND end_date IS NULL', [date, emp.id]);
    await careerEvent(db, emp.id, 'retraite', date, 'Admission à la retraite', {}, r.id, userId, r.payload.acte_reference);
    return 'Admission à la retraite enregistrée';
  },

  formation: async (db, r) => {
    await db.query(`UPDATE enrollments SET status = 'validated' WHERE id = $1 AND status = 'requested'`,
      [r.payload.enrollment_id]);
    return 'Inscription à la formation validée';
  },
};

/** Applique l'acte au dossier de l'agent (appelé dans la transaction de validation finale). */
export const applyEffect = async (db, request, userId) => {
  const { rows } = await db.query(
    `SELECT e.*, s.institution_id FROM employees e LEFT JOIN structures s ON s.id = e.structure_id
      WHERE e.id = $1 FOR UPDATE OF e`, [request.employee_id]
  );
  const date = request.payload.effective_date || toISODate();
  return EFFECTS[request.effect](db, request, rows[0], userId, date);
};

/** Conséquences d'un rejet ou d'une annulation sur les objets liés. */
export const releaseLinked = async (db, request, status) => {
  if (request.effect === 'leave' && request.payload.leave_id) {
    await db.query(`UPDATE leaves SET status = $1, decided_at = now() WHERE id = $2 AND status = 'pending'`,
      [status === 'rejected' ? 'rejected' : 'cancelled', request.payload.leave_id]);
  }
  if (request.effect === 'formation' && request.payload.enrollment_id) {
    await db.query(`UPDATE enrollments SET status = $1 WHERE id = $2 AND status = 'requested'`,
      [status === 'rejected' ? 'rejected' : 'cancelled', request.payload.enrollment_id]);
  }
};

/**
 * Exécute une action sur une demande (dans une transaction). Renvoie le message de l'acte appliqué le cas échéant.
 * actions : approve | return | request_documents | resume | reject | cancel | assign | comment
 */
export const performAction = async (db, user, requestId, { action, comment, assigned_employee_id: assignedId }) => {
  assert(ACTION_LABELS[action] && !['creation', 'document', 'final', 'alert'].includes(action), 'Action invalide');
  await db.query('SELECT id FROM requests WHERE id = $1 FOR UPDATE', [requestId]);
  const r = await findRequest(requestId, db);
  if (!r) throw new AppError('Demande introuvable', 404);
  const steps = await getSteps(r.type_id, db);
  const step = steps[r.current_step - 1];
  const actors = await resolveActors(r, step, db);
  if (!(await canView(user, r, actors, db))) throw new AppError('Demande introuvable', 404);
  const open = ['in_progress', 'awaiting_documents'].includes(r.status);

  if (action === 'comment') {
    assert(comment, 'Commentaire requis');
    await addHistory(db, r.id, step, 'comment', user.id, comment);
    return { request: r };
  }
  assert(open, 'Cette demande est clôturée', 409);

  if (action === 'cancel') {
    const isOwner = r.created_by === user.id || (user.employee_id && user.employee_id === r.employee_id);
    if (!isOwner) throw new AppError('Seul le demandeur peut annuler sa demande', 403);
    await db.query(`UPDATE requests SET status = 'cancelled', closed_at = now(), updated_at = now() WHERE id = $1`, [r.id]);
    await releaseLinked(db, r, 'cancelled');
    await addHistory(db, r.id, step, 'cancel', user.id, comment);
    return { request: r };
  }

  const isGestionnaireOfInstitution = user.role === 'gestionnaire_rh' && user.institution_id === r.institution_id;
  if (action === 'assign') {
    if (!canAct(user, r, actors) && !isGestionnaireOfInstitution) throw new AppError('Action non autorisée', 403);
    assert(assignedId, 'Agent traitant requis');
    await db.query('UPDATE requests SET assigned_employee_id = $1, updated_at = now() WHERE id = $2', [assignedId, r.id]);
    await addHistory(db, r.id, step, 'assign', user.id, comment, assignedId);
    await notifyEmployee(assignedId, 'workflow', 'Demande à instruire', `${r.reference} — ${r.type_name}`,
      `/requests/${r.id}`, db);
    return { request: r };
  }

  if (!canAct(user, r, actors)) throw new AppError('Vous n’êtes pas le valideur de cette étape', 403);

  const today = toISODate();
  const set = (sql, params) => db.query(`UPDATE requests SET ${sql}, updated_at = now() WHERE id = $1`, [r.id, ...params]);
  let message = null;

  switch (action) {
    case 'approve': {
      assert(r.status === 'in_progress', 'Des pièces complémentaires sont attendues');
      const next = steps[r.current_step];
      await addHistory(db, r.id, step, 'approve', user.id, comment);
      if (next) {
        await set('current_step = $2, step_started_at = now(), step_due_date = $3, assigned_employee_id = NULL, alert_sent_at = NULL',
          [r.current_step + 1, addDays(today, next.expected_days)]);
        const moved = await findRequest(r.id, db);
        const nextActors = await resolveActors(moved, next, db);
        await notifyUsers(nextActors, 'workflow', `À valider : ${r.type_name}`,
          `${r.reference} — ${r.employee_name} (${next.name})`, `/requests/${r.id}`, db);
      } else {
        message = await applyEffect(db, r, user.id);
        await set(`status = 'approved', closed_at = now()`, []);
        await addHistory(db, r.id, step, 'final', user.id, message);
      }
      break;
    }
    case 'return': {
      assert(r.current_step > 1, 'La demande est déjà à la première étape');
      assert(comment, 'Motif du retour requis');
      const prev = steps[r.current_step - 2];
      await set('current_step = $2, step_started_at = now(), step_due_date = $3, assigned_employee_id = NULL',
        [r.current_step - 1, addDays(today, prev.expected_days)]);
      await addHistory(db, r.id, prev, 'return', user.id, comment);
      break;
    }
    case 'request_documents':
      assert(comment, 'Précisez les pièces demandées');
      assert(r.status === 'in_progress', 'Des pièces sont déjà demandées');
      await set(`status = 'awaiting_documents'`, []);
      await addHistory(db, r.id, step, 'request_documents', user.id, comment);
      break;
    case 'resume':
      assert(r.status === 'awaiting_documents', 'La demande n’attend pas de pièces');
      await set(`status = 'in_progress'`, []);
      await addHistory(db, r.id, step, 'resume', user.id, comment);
      break;
    case 'reject':
      assert(comment, 'Motif du rejet requis');
      await set(`status = 'rejected', closed_at = now()`, []);
      await releaseLinked(db, r, 'rejected');
      await addHistory(db, r.id, step, 'reject', user.id, comment);
      break;
    default:
      break;
  }

  // Informer l'agent concerné des décisions qui le concernent
  const labels = { approve: message ? 'validée' : 'a franchi une étape', reject: 'rejetée',
    request_documents: 'en attente de pièces', return: 'renvoyée à l’étape précédente' };
  if (labels[action]) {
    await notifyEmployee(r.employee_id, 'workflow', `Votre demande ${labels[action]}`,
      `${r.reference} — ${r.type_name}${comment ? ` : ${comment}` : ''}`, `/requests/${r.id}`, db);
  }
  return { request: r, message };
};
