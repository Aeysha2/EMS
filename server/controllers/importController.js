import { query, withTransaction } from '../config/db.js';
import { isGestionnaire } from '../middleware/auth.js';
import { nextSigrhId } from '../models/Employee.js';
import { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { blindIndex, decrypt, encrypt } from '../utils/crypto.js';
import { parseCsv, toNumber } from '../utils/csv.js';
import { isValidISODate } from '../utils/dates.js';
import { toInt } from '../utils/sanitize.js';

/**
 * Reprise des données existantes (section 11) :
 * 1. la DRH charge un fichier (export Excel enregistré en CSV) ;
 * 2. chaque ligne est contrôlée, normalisée et comparée au référentiel (doublons par NIN, matricule, email,
 *    ou nom + date de naissance) ;
 * 3. la DRH valide formellement le lot : seules les lignes sans erreur ni doublon sont intégrées.
 */
const COLUMNS = ['prenom', 'nom', 'sexe', 'date_naissance', 'nin', 'email', 'telephone', 'matricule_solde',
  'code_structure', 'fonction', 'code_corps', 'hierarchie', 'grade', 'echelon', 'date_entree_fp', 'salaire_base'];

const frDate = (v) => {
  if (!v) return null;
  const m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(v);
};

/** GET /api/imports/template — modèle CSV */
export const template = (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modele-reprise-agents.csv"');
  res.send(`﻿${COLUMNS.join(';')}\nAminata;Diop;F;15/03/1985;1234567890123;aminata.diop@exemple.sn;+221770000000;`
    + '600123A;MFP-DRH;Gestionnaire RH;ADMCIV;A;Principal;3;01/02/2010;650000\n');
};

/** POST /api/imports { filename, content } — analyse (aucune écriture dans le référentiel) */
export const analyze = async (req, res) => {
  assert(isGestionnaire(req.user), 'Réservé aux gestionnaires RH', 403);
  const text = String(req.body.content || '').startsWith('data:')
    ? Buffer.from(String(req.body.content).split(',')[1], 'base64').toString('utf8') : String(req.body.content || '');
  const rows = parseCsv(text);
  assert(rows.length, 'Fichier vide ou illisible');
  assert(rows.length <= 5000, '5 000 lignes maximum par lot');
  const missing = ['prenom', 'nom', 'email', 'code_structure'].filter((c) => !(c in rows[0]));
  assert(!missing.length, `Colonnes obligatoires manquantes : ${missing.join(', ')}`);

  const inst = req.user.institution_id;
  const [structs, corps] = await Promise.all([
    query('SELECT id, code FROM structures WHERE institution_id = $1 AND is_active', [inst]),
    query('SELECT id, code, hierarchie FROM corps'),
  ]);
  const structByCode = Object.fromEntries(structs.rows.map((s) => [s.code, s.id]));
  const corpsByCode = Object.fromEntries(corps.rows.map((c) => [c.code, c]));

  const batch = await withTransaction(async (db) => {
    const { rows: b } = await db.query(
      'INSERT INTO import_batches (institution_id, filename, created_by) VALUES ($1,$2,$3) RETURNING *',
      [inst, req.body.filename || 'import.csv', req.user.id]);
    const seenInFile = {};
    const stats = { total: rows.length, valides: 0, erreurs: 0, doublons: 0 };
    for (const [i, raw] of rows.entries()) {
      const errors = [];
      const d = {
        first_name: raw.prenom?.trim(), last_name: raw.nom?.trim().toUpperCase(),
        sexe: (raw.sexe || '').toUpperCase().slice(0, 1) || null,
        date_of_birth: frDate(raw.date_naissance), nin: (raw.nin || '').replace(/\s+/g, '') || null,
        email: (raw.email || '').toLowerCase().trim(), phone: raw.telephone || null,
        matricule_solde: (raw.matricule_solde || '').toUpperCase().trim() || null,
        structure_code: (raw.code_structure || '').toUpperCase().trim(), fonction: raw.fonction || null,
        corps_code: (raw.code_corps || '').toUpperCase().trim() || null,
        hierarchie: (raw.hierarchie || '').toUpperCase() || null, grade: raw.grade || null,
        echelon: raw.echelon ? toInt(raw.echelon) : null, date_entree_fp: frDate(raw.date_entree_fp),
        salary: raw.salaire_base ? toNumber(raw.salaire_base) : 0,
      };
      if (!d.first_name || !d.last_name) errors.push('prénom ou nom manquant');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) errors.push('email invalide');
      if (d.sexe && !['M', 'F'].includes(d.sexe)) errors.push('sexe invalide (M/F)');
      if (d.date_of_birth && !isValidISODate(d.date_of_birth)) errors.push('date de naissance invalide');
      if (d.date_entree_fp && !isValidISODate(d.date_entree_fp)) errors.push('date d’entrée invalide');
      if (d.nin && !/^\d{13,14}$/.test(d.nin)) errors.push('NIN invalide (13 ou 14 chiffres)');
      if (!structByCode[d.structure_code]) errors.push(`structure « ${d.structure_code} » inconnue dans votre institution`);
      if (d.corps_code && !corpsByCode[d.corps_code]) errors.push(`corps « ${d.corps_code} » inconnu`);
      if (d.hierarchie && !['A', 'B', 'C', 'D'].includes(d.hierarchie)) errors.push('hiérarchie invalide (A à D)');
      if (Number.isNaN(d.salary) || d.salary < 0) errors.push('salaire invalide');

      // doublons : dans le fichier, puis dans le référentiel national
      let dup = null;
      let reason = null;
      const fileKey = d.nin || d.email;
      if (seenInFile[fileKey]) reason = `doublon dans le fichier (ligne ${seenInFile[fileKey]})`;
      seenInFile[fileKey] = i + 2;
      if (!reason) {
        const { rows: found } = await db.query(
          `SELECT id, CASE WHEN nin_hash = $1 THEN 'même NIN' WHEN matricule_solde = $2 THEN 'même matricule de solde'
                           WHEN lower(email) = $3 THEN 'même email' ELSE 'même nom et date de naissance' END AS why
             FROM employees
            WHERE nin_hash = $1 OR matricule_solde = $2 OR lower(email) = $3
               OR (upper(last_name) = $4 AND lower(first_name) = lower($5) AND date_of_birth = $6::date)
            LIMIT 1`,
          [d.nin ? blindIndex(d.nin) : null, d.matricule_solde, d.email, d.last_name, d.first_name,
            d.date_of_birth && isValidISODate(d.date_of_birth) ? d.date_of_birth : null]);
        if (found[0]) { dup = found[0].id; reason = `déjà dans le référentiel (${found[0].why})`; }
      }
      if (errors.length) stats.erreurs += 1; else if (reason) stats.doublons += 1; else stats.valides += 1;
      await db.query(
        `INSERT INTO import_rows (batch_id, row_number, data, errors, duplicate_of, duplicate_reason)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [b[0].id, i + 2, JSON.stringify({ ...d, nin: d.nin ? `…${d.nin.slice(-4)}` : null, _nin_enc: encrypt(d.nin) }),
          errors, dup, reason]);
    }
    await db.query('UPDATE import_batches SET stats = $1 WHERE id = $2', [JSON.stringify(stats), b[0].id]);
    return { ...b[0], stats };
  });
  await logActivity(req.user.id, 'Analyse de lot de reprise', 'import_batch', batch.id, JSON.stringify(batch.stats), req.ip);
  res.status(201).json(batch);
};

/** GET /api/imports */
export const listBatches = async (req, res) => {
  assert(isGestionnaire(req.user), 'Réservé aux gestionnaires RH', 403);
  const { rows } = await query(
    `SELECT b.*, u.name AS created_by_name, v.name AS validated_by_name FROM import_batches b
       LEFT JOIN users u ON u.id = b.created_by LEFT JOIN users v ON v.id = b.validated_by
      WHERE b.institution_id = $1 ORDER BY b.created_at DESC LIMIT 50`, [req.user.institution_id]);
  res.json(rows);
};

/** GET /api/imports/:id — détail ligne par ligne */
export const getBatch = async (req, res) => {
  const { rows } = await query('SELECT * FROM import_batches WHERE id = $1', [toInt(req.params.id)]);
  assert(rows[0] && rows[0].institution_id === req.user.institution_id, 'Lot introuvable', 404);
  const { rows: lines } = await query(
    `SELECT r.id, r.row_number, r.data - '_nin_enc' AS data, r.errors, r.duplicate_of, r.duplicate_reason,
            r.applied_employee_id, e.sigrh_id AS duplicate_sigrh_id
       FROM import_rows r LEFT JOIN employees e ON e.id = r.duplicate_of WHERE r.batch_id = $1 ORDER BY r.row_number`,
    [rows[0].id]);
  res.json({ ...rows[0], rows: lines });
};

/** POST /api/imports/:id/decision { decision: apply|reject } — validation formelle par la DRH */
export const decide = async (req, res) => {
  assert(isGestionnaire(req.user), 'Réservé aux gestionnaires RH', 403);
  const { decision } = req.body;
  assert(['apply', 'reject'].includes(decision), 'Décision invalide');
  const result = await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT * FROM import_batches WHERE id = $1 FOR UPDATE', [toInt(req.params.id)]);
    const b = rows[0];
    assert(b && b.institution_id === req.user.institution_id, 'Lot introuvable', 404);
    assert(b.status === 'draft', 'Lot déjà traité', 409);
    let applied = 0;
    if (decision === 'apply') {
      const { rows: lines } = await db.query(
        `SELECT * FROM import_rows WHERE batch_id = $1 AND cardinality(errors) = 0 AND duplicate_reason IS NULL`, [b.id]);
      const { rows: structs } = await db.query('SELECT id, code FROM structures WHERE institution_id = $1', [b.institution_id]);
      const { rows: corps } = await db.query('SELECT id, code, hierarchie FROM corps');
      for (const l of lines) {
        const d = l.data;
        const nin = decrypt(d._nin_enc);
        const c = corps.find((x) => x.code === d.corps_code);
        const sigrhId = await nextSigrhId(db);
        const { rows: ins } = await db.query(
          `INSERT INTO employees (sigrh_id, first_name, last_name, sexe, date_of_birth, nin_enc, nin_hash, email, phone,
             matricule_solde, structure_id, fonction, corps_id, hierarchie, grade, echelon, date_entree_fp,
             date_prise_service, salary)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,$18) RETURNING id`,
          [sigrhId, d.first_name, d.last_name, d.sexe, d.date_of_birth, nin ? encrypt(nin) : null, nin ? blindIndex(nin) : null,
            d.email, d.phone, d.matricule_solde, structs.find((s) => s.code === d.structure_code).id, d.fonction,
            c?.id || null, d.hierarchie || c?.hierarchie || null, d.grade, d.echelon, d.date_entree_fp, d.salary || 0]);
        await db.query(
          `INSERT INTO affectations (employee_id, structure_id, fonction, start_date, acte_reference)
           VALUES ($1,$2,$3,COALESCE($4::date, CURRENT_DATE),$5)`,
          [ins[0].id, structs.find((s) => s.code === d.structure_code).id, d.fonction, d.date_entree_fp, `Reprise lot ${b.id}`]);
        await db.query('UPDATE import_rows SET applied_employee_id = $1 WHERE id = $2', [ins[0].id, l.id]);
        applied += 1;
      }
    }
    await db.query(`UPDATE import_batches SET status = $1, validated_by = $2, validated_at = now(),
                    stats = stats || jsonb_build_object('integres', $3::int) WHERE id = $4`,
      [decision === 'apply' ? 'applied' : 'rejected', req.user.id, applied, b.id]);
    return { id: b.id, applied };
  });
  await logActivity(req.user.id, decision === 'apply' ? 'Validation de lot de reprise' : 'Rejet de lot de reprise',
    'import_batch', result.id, `${result.applied} agent(s) intégré(s)`, req.ip);
  res.json(result);
};

