import { query, withTransaction } from '../config/db.js';
import { accessLevel, isGestionnaire } from '../middleware/auth.js';
import {
  EMPLOYEE_SELECT, findEmployeeById, nextSigrhId, POSITIONS_STATUTAIRES, shapeEmployee, trackChanges,
} from '../models/Employee.js';
import { subtreeIds } from '../models/Structure.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { blindIndex, decrypt, encrypt } from '../utils/crypto.js';
import { isValidISODate, toISODate } from '../utils/dates.js';
import { verifyIdentity } from '../utils/etatCivil.js';
import { pagination, pick, toInt } from '../utils/sanitize.js';

const EDITABLE = [
  'first_name', 'last_name', 'sexe', 'date_of_birth', 'place_of_birth', 'nationality', 'marital_status',
  'children_count', 'email', 'phone', 'address', 'structure_id', 'fonction', 'corps_id', 'hierarchie', 'grade',
  'echelon', 'statut_emploi', 'position_statutaire', 'date_entree_fp', 'date_prise_service', 'salary',
  'matricule_solde', 'biometric_id', 'is_immersion',
];
const SELF_EDITABLE = ['phone', 'address', 'marital_status', 'children_count'];
const SORTS = {
  name: ['e.last_name', 'e.first_name'], sigrh: ['e.sigrh_id'], entree: ['e.date_entree_fp'], structure: ['s.name'],
  hierarchie: ['e.hierarchie'], naissance: ['e.date_of_birth'],
};

const normalize = (data) => {
  for (const f of ['date_of_birth', 'date_entree_fp', 'date_prise_service']) {
    if (data[f] === '') data[f] = null;
    if (data[f]) assert(isValidISODate(data[f]), `Date invalide : ${f}`);
  }
  for (const f of ['structure_id', 'corps_id', 'echelon', 'matricule_solde', 'biometric_id', 'hierarchie', 'sexe']) {
    if (data[f] === '') data[f] = null;
  }
  if (data.email !== undefined) {
    assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || ''), 'Email invalide');
    data.email = data.email.toLowerCase();
  }
  if (data.salary !== undefined) assert(Number(data.salary) >= 0, 'Salaire invalide');
  if (data.position_statutaire) assert(POSITIONS_STATUTAIRES[data.position_statutaire], 'Position statutaire invalide');
  if (data.date_of_birth) {
    const age = (Date.now() - new Date(data.date_of_birth)) / (365.25 * 864e5);
    assert(age >= 16 && age <= 80, 'Date de naissance incohérente');
  }
  return data;
};

/** Un gestionnaire ne gère que les structures de son institution. */
const assertInScope = async (user, structureId) => {
  if (!structureId) return;
  const { rows } = await query('SELECT institution_id FROM structures WHERE id = $1', [structureId]);
  assert(rows[0], 'Structure inconnue');
  if (rows[0].institution_id !== user.institution_id) {
    throw new AppError('Cette structure n’appartient pas à votre institution', 403);
  }
};

const ninFields = (nin) => {
  if (!nin) return {};
  const clean = String(nin).replace(/\s+/g, '');
  assert(/^\d{13,14}$/.test(clean), 'Le NIN doit comporter 13 ou 14 chiffres');
  return { nin_enc: encrypt(clean), nin_hash: blindIndex(clean) };
};

/**
 * GET /api/employees — référentiel des agents (recherche avancée).
 * scope : directory (annuaire interministériel) | institution (gestionnaire RH) | team (chef de structure)
 */
export const listEmployees = async (req, res) => {
  const { page, limit, offset } = pagination(req.query);
  const u = req.user;
  const scope = req.query.scope || (isGestionnaire(u) ? 'institution' : u.isChef ? 'team' : 'directory');
  const params = [];
  const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };

  let level = 'public';
  if (scope === 'institution') {
    if (!isGestionnaire(u)) throw new AppError('Réservé aux gestionnaires RH', 403);
    add('s.institution_id = ?', u.institution_id);
    level = 'full';
  } else if (scope === 'team') {
    if (!u.isChef) throw new AppError('Réservé aux responsables de structure', 403);
    add('e.structure_id = ANY(?)', u.managed_structures);
    level = 'team';
  } else {
    // annuaire interministériel : agents en fonction uniquement
    where.push(`e.position_statutaire IN ('activite','stage','detachement')`);
  }

  if (req.query.q) {
    add(`(e.full_name ILIKE ? OR e.sigrh_id ILIKE ? OR e.email ILIKE ? OR e.fonction ILIKE ?
          OR s.name ILIKE ? ${level === 'full' ? 'OR e.matricule_solde ILIKE ?' : ''})`, `%${req.query.q}%`);
  }
  if (req.query.nin && level === 'full') add('e.nin_hash = ?', blindIndex(req.query.nin));
  if (req.query.structure) add('e.structure_id = ANY(?)', await subtreeIds(toInt(req.query.structure)));
  if (req.query.institution) add('s.institution_id = ?', toInt(req.query.institution));
  if (req.query.hierarchie) add('e.hierarchie = ?', req.query.hierarchie);
  if (req.query.corps) add('e.corps_id = ?', toInt(req.query.corps));
  if (level !== 'public') {
    if (req.query.position) add('e.position_statutaire = ?', req.query.position);
    if (req.query.statut) add('e.statut_emploi = ?', req.query.statut);
    if (req.query.sexe) add('e.sexe = ?', req.query.sexe);
    if (req.query.biometrie === 'non') where.push('e.biometric_enrolled_at IS NULL');
  }

  const order = req.query.order === 'desc' ? 'DESC' : 'ASC';
  const sort = (SORTS[req.query.sort] || SORTS.name).map((c) => `${c} ${order}`).join(', ');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [list, count] = await Promise.all([
    query(`${EMPLOYEE_SELECT} ${whereSql} ORDER BY ${sort}, e.id LIMIT ${limit} OFFSET ${offset}`, params),
    query(`SELECT COUNT(*) FROM employees e LEFT JOIN structures s ON s.id = e.structure_id ${whereSql}`, params),
  ]);
  res.json({ data: list.rows.map((e) => shapeEmployee(e, level)), total: count.rows[0].count, page, limit, scope });
};

/** GET /api/employees/:id */
export const getEmployee = async (req, res) => {
  const emp = await findEmployeeById(toInt(req.params.id));
  if (!emp) throw new AppError('Agent introuvable', 404);
  res.json(shapeEmployee(emp, accessLevel(req.user, emp)));
};

/**
 * GET /api/employees/:id/dossier — dossier numérique complet : état civil, carrière, diplômes, affectations,
 * formation, évaluations, absences, rémunération, documents, historique des modifications.
 */
export const getDossier = async (req, res) => {
  const id = toInt(req.params.id);
  const emp = await findEmployeeById(id);
  if (!emp) throw new AppError('Agent introuvable', 404);
  const level = accessLevel(req.user, emp);
  if (level === 'public') throw new AppError('Accès au dossier individuel non autorisé', 403);

  const full = level === 'full';
  const q = (sql) => query(sql, [id]).then((r) => r.rows);
  const [affectations, career, diplomas, trainings, reviews, leaves, documents, changes, payrolls, requests] =
    await Promise.all([
      q(`SELECT a.*, s.name AS structure_name FROM affectations a JOIN structures s ON s.id = a.structure_id
          WHERE a.employee_id = $1 ORDER BY a.start_date DESC, a.id DESC`),
      q('SELECT * FROM career_events WHERE employee_id = $1 ORDER BY effective_date DESC, id DESC'),
      q('SELECT * FROM agent_diplomas WHERE employee_id = $1 ORDER BY year DESC NULLS LAST'),
      q(`SELECT en.*, t.title, t.provider, t.is_certifying, ts.start_date, ts.end_date FROM enrollments en
           JOIN training_sessions ts ON ts.id = en.session_id JOIN trainings t ON t.id = ts.training_id
          WHERE en.employee_id = $1 ORDER BY ts.start_date DESC`),
      q(`SELECT id, period, review_date, rating, status, feedback FROM performance_reviews
          WHERE employee_id = $1 ORDER BY review_date DESC`),
      q(`SELECT l.*, lt.label FROM leaves l JOIN leave_types lt ON lt.code = l.leave_type
          WHERE l.employee_id = $1 ORDER BY l.start_date DESC LIMIT 50`),
      full ? q(`SELECT id, name, category, mime_type, size_bytes, created_at FROM documents
                 WHERE employee_id = $1 ORDER BY created_at DESC`) : [],
      full ? q(`SELECT c.*, u.name AS user_name FROM record_changes c LEFT JOIN users u ON u.id = c.user_id
                 WHERE c.entity = 'employee' AND c.entity_id = $1 ORDER BY c.created_at DESC LIMIT 100`) : [],
      full ? q(`SELECT id, period_year, period_month, gross, net, source FROM payrolls
                 WHERE employee_id = $1 ORDER BY period_year DESC, period_month DESC LIMIT 24`) : [],
      q(`SELECT r.id, r.reference, r.status, r.created_at, t.name AS type_name FROM requests r
           JOIN workflow_types t ON t.id = r.type_id WHERE r.employee_id = $1 ORDER BY r.created_at DESC LIMIT 30`),
    ]);
  if (full && req.user.employee_id !== id) {
    await logActivity(req.user.id, 'Consultation du dossier', 'employee', id, emp.sigrh_id, req.ip);
  }
  res.json({
    agent: shapeEmployee(emp, level), affectations, career, diplomas, trainings, reviews, leaves, documents,
    changes, payrolls, requests,
  });
};

/** GET /api/employees/:id/nin — NIN en clair (gestionnaire ou agent lui-même), accès journalisé. */
export const revealNin = async (req, res) => {
  const emp = await findEmployeeById(toInt(req.params.id));
  if (!emp || accessLevel(req.user, emp) !== 'full') throw new AppError('Accès refusé', 403);
  await logActivity(req.user.id, 'Consultation du NIN', 'employee', emp.id, emp.sigrh_id, req.ip);
  res.json({ nin: decrypt(emp.nin_enc) });
};

/** GET /api/employees/me */
export const getMe = async (req, res) => {
  if (!req.user.employee_id) throw new AppError('Aucun dossier agent lié à ce compte', 404);
  res.json(shapeEmployee(await findEmployeeById(req.user.employee_id), 'full'));
};

/** PUT /api/employees/me — libre-service : coordonnées et situation familiale */
export const updateMe = async (req, res) => {
  const id = req.user.employee_id;
  if (!id) throw new AppError('Aucun dossier agent lié à ce compte', 404);
  const data = pick(req.body, SELF_EDITABLE);
  assert(Object.keys(data).length, 'Aucune modification');
  if (data.children_count !== undefined) assert(toInt(data.children_count, -1) >= 0, 'Nombre d’enfants invalide');
  const before = await findEmployeeById(id);
  await withTransaction(async (db) => {
    const cols = Object.keys(data);
    await db.query(`UPDATE employees SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now()
                    WHERE id = $${cols.length + 1}`, [...Object.values(data), id]);
    await trackChanges(db, 'employee', id, before, data, req.user.id);
  });
  res.json(shapeEmployee(await findEmployeeById(id), 'full'));
};

/** POST /api/employees — enregistrement d'un agent dans le référentiel (gestionnaire RH, dans son institution) */
export const createEmployee = async (req, res) => {
  const data = normalize(pick(req.body, EDITABLE));
  assert(data.first_name && data.last_name, 'Prénom et nom requis');
  assert(data.email, 'Email professionnel requis');
  assert(data.structure_id, 'Structure d’affectation requise');
  await assertInScope(req.user, data.structure_id);
  const ninData = ninFields(req.body.nin);

  const id = await withTransaction(async (db) => {
    if (ninData.nin_hash) {
      const { rows } = await db.query('SELECT sigrh_id FROM employees WHERE nin_hash = $1', [ninData.nin_hash]);
      if (rows[0]) throw new AppError(`Ce NIN est déjà enregistré (agent ${rows[0].sigrh_id})`, 409);
    }
    const all = { ...data, ...ninData, sigrh_id: await nextSigrhId(db) };
    if (!all.date_prise_service) all.date_prise_service = toISODate();
    const cols = Object.keys(all);
    const { rows } = await db.query(
      `INSERT INTO employees (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(all)
    );
    const newId = rows[0].id;
    await db.query(
      'INSERT INTO affectations (employee_id, structure_id, fonction, start_date, acte_reference) VALUES ($1,$2,$3,$4,$5)',
      [newId, all.structure_id, all.fonction || null, all.date_prise_service, req.body.acte_reference || null]
    );
    await db.query(
      `INSERT INTO career_events (employee_id, type, effective_date, acte_reference, description, created_by)
       VALUES ($1,'recrutement',$2,$3,'Enregistrement dans le référentiel national',$4)`,
      [newId, all.date_entree_fp || all.date_prise_service, req.body.acte_reference || null, req.user.id]
    );
    return newId;
  });
  const emp = await findEmployeeById(id);
  await logActivity(req.user.id, 'Création de dossier agent', 'employee', id, `${emp.sigrh_id} – ${emp.full_name}`, req.ip);
  res.status(201).json(shapeEmployee(emp, 'full'));
};

/**
 * PUT /api/employees/:id — correction de données administratives (DRH de l'institution).
 * Les actes de carrière (mutation, avancement, position) passent normalement par un circuit de validation ;
 * une correction directe reste possible et est tracée champ par champ (valeur avant / après).
 */
export const updateEmployee = async (req, res) => {
  const id = toInt(req.params.id);
  const before = await findEmployeeById(id);
  if (!before) throw new AppError('Agent introuvable', 404);
  if (!isGestionnaire(req.user) || accessLevel(req.user, before) !== 'full') {
    throw new AppError('Seule la DRH de l’institution de l’agent peut modifier ce dossier', 403);
  }
  const data = normalize(pick(req.body, EDITABLE));
  if (data.structure_id && data.structure_id !== before.structure_id) await assertInScope(req.user, data.structure_id);
  Object.assign(data, ninFields(req.body.nin));
  assert(Object.keys(data).length, 'Aucune modification');

  await withTransaction(async (db) => {
    if (data.nin_hash) {
      const { rows } = await db.query('SELECT sigrh_id FROM employees WHERE nin_hash = $1 AND id <> $2', [data.nin_hash, id]);
      if (rows[0]) throw new AppError(`Ce NIN est déjà enregistré (agent ${rows[0].sigrh_id})`, 409);
    }
    const cols = Object.keys(data);
    await db.query(`UPDATE employees SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now()
                    WHERE id = $${cols.length + 1}`, [...Object.values(data), id]);
    await trackChanges(db, 'employee', id, before, data, req.user.id);
    if (data.structure_id && data.structure_id !== before.structure_id) {
      await db.query('UPDATE users SET structure_id = $1 WHERE employee_id = $2', [data.structure_id, id]);
    }
  });
  await logActivity(req.user.id, 'Modification de dossier agent', 'employee', id,
    `${before.sigrh_id} : ${Object.keys(data).filter((k) => !k.startsWith('nin')).join(', ') || 'NIN'}`, req.ip);
  res.json(shapeEmployee(await findEmployeeById(id), 'full'));
};

const assertManage = async (req) => {
  const emp = await findEmployeeById(toInt(req.params.id));
  if (!emp) throw new AppError('Agent introuvable', 404);
  if (!isGestionnaire(req.user) || accessLevel(req.user, emp) !== 'full') throw new AppError('Accès refusé', 403);
  return emp;
};

/** POST /api/employees/:id/verify-identity — contrôle auprès du registre d'état civil */
export const verifyEmployeeIdentity = async (req, res) => {
  const emp = await assertManage(req);
  const nin = decrypt(emp.nin_enc);
  assert(nin, 'Aucun NIN enregistré pour cet agent');
  const result = await verifyIdentity({ nin, first_name: emp.first_name, last_name: emp.last_name,
    date_of_birth: emp.date_of_birth });
  if (result.match) await query('UPDATE employees SET identity_verified_at = now() WHERE id = $1', [emp.id]);
  await logActivity(req.user.id, 'Vérification état civil', 'employee', emp.id,
    `${emp.sigrh_id} : ${result.match ? 'conforme' : 'non conforme'}`, req.ip);
  res.json(result);
};

/** POST /api/employees/:id/biometrie { biometric_id } — enrôlement biométrique */
export const enrollBiometric = async (req, res) => {
  const emp = await assertManage(req);
  const bioId = String(req.body.biometric_id || '').trim().toUpperCase();
  assert(/^[A-Z0-9-]{4,40}$/.test(bioId), 'Identifiant biométrique invalide');
  await withTransaction(async (db) => {
    await db.query('UPDATE employees SET biometric_id = $1, biometric_enrolled_at = now() WHERE id = $2', [bioId, emp.id]);
    await trackChanges(db, 'employee', emp.id, emp, { biometric_id: bioId }, req.user.id);
  });
  await logActivity(req.user.id, 'Enrôlement biométrique', 'employee', emp.id, emp.sigrh_id, req.ip);
  res.json(shapeEmployee(await findEmployeeById(emp.id), 'full'));
};

/** POST /api/employees/:id/diplomas */
export const addDiploma = async (req, res) => {
  const emp = await assertManage(req);
  const { title, level, school, year } = req.body;
  assert(title, 'Intitulé du diplôme requis');
  const { rows } = await query(
    'INSERT INTO agent_diplomas (employee_id, title, level, school, year) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [emp.id, title, level || null, school || null, year ? toInt(year) : null]
  );
  await trackChanges({ query }, 'employee', emp.id, { diplome: null }, { diplome: title }, req.user.id);
  res.status(201).json(rows[0]);
};

/** DELETE /api/employees/:id/diplomas/:diplomaId */
export const deleteDiploma = async (req, res) => {
  const emp = await assertManage(req);
  const { rows } = await query('DELETE FROM agent_diplomas WHERE id = $1 AND employee_id = $2 RETURNING title',
    [toInt(req.params.diplomaId), emp.id]);
  if (!rows[0]) throw new AppError('Diplôme introuvable', 404);
  await trackChanges({ query }, 'employee', emp.id, { diplome: rows[0].title }, { diplome: null }, req.user.id);
  res.json({ ok: true });
};

/** POST /api/employees/:id/career-events — sanction ou distinction (les autres actes passent par un circuit) */
export const addCareerEvent = async (req, res) => {
  const emp = await assertManage(req);
  const { type, effective_date: date, acte_reference: acte, description } = req.body;
  assert(['sanction', 'distinction'].includes(type),
    'Seules les sanctions et distinctions se saisissent directement ; les autres actes passent par un circuit de validation');
  assert(isValidISODate(date), 'Date d’effet invalide');
  assert(description, 'Description requise');
  const { rows } = await query(
    `INSERT INTO career_events (employee_id, type, effective_date, acte_reference, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [emp.id, type, date, acte || null, description, req.user.id]
  );
  await logActivity(req.user.id, `Acte : ${type}`, 'employee', emp.id, `${emp.sigrh_id} – ${description}`, req.ip);
  res.status(201).json(rows[0]);
};

const MAX_DOC = 3 * 1024 * 1024;
const ALLOWED_MIME = /^(application\/pdf|image\/(png|jpe?g|webp)|application\/(msword|vnd\.openxmlformats-officedocument\.[\w.]+)|text\/plain)$/;

/** POST /api/employees/:id/documents — archivage numérique du dossier individuel */
export const uploadDocument = async (req, res) => {
  const emp = await findEmployeeById(toInt(req.params.id));
  if (!emp) throw new AppError('Agent introuvable', 404);
  const own = req.user.employee_id === emp.id;
  if (!own && !(isGestionnaire(req.user) && accessLevel(req.user, emp) === 'full')) throw new AppError('Accès refusé', 403);
  const { name, mime_type: mime, content, category } = req.body;
  assert(name && content, 'Fichier requis');
  assert(ALLOWED_MIME.test(mime || ''), 'Type de fichier non autorisé (PDF, image, Word, texte)');
  const buf = Buffer.from(String(content).replace(/^data:[^;]+;base64,/, ''), 'base64');
  assert(buf.length > 0 && buf.length <= MAX_DOC, 'Fichier vide ou trop volumineux (3 Mo max)');
  const { rows } = await query(
    `INSERT INTO documents (employee_id, category, name, mime_type, size_bytes, content, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, category, mime_type, size_bytes, created_at`,
    [emp.id, category || 'autre', name.slice(0, 200), mime, buf.length, buf, req.user.id]
  );
  await logActivity(req.user.id, 'Ajout de pièce au dossier', 'employee', emp.id, name, req.ip);
  res.status(201).json(rows[0]);
};

/** GET /api/employees/:id/documents/:docId */
export const downloadDocument = async (req, res) => {
  const emp = await findEmployeeById(toInt(req.params.id));
  if (!emp || accessLevel(req.user, emp) !== 'full') throw new AppError('Accès refusé', 403);
  const { rows } = await query('SELECT * FROM documents WHERE id = $1 AND employee_id = $2',
    [toInt(req.params.docId), emp.id]);
  if (!rows[0]) throw new AppError('Document introuvable', 404);
  res.setHeader('Content-Type', rows[0].mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(rows[0].name)}"`);
  res.send(rows[0].content);
};
