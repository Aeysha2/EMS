import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { query } from '../config/db.js';
import { isGestionnaire, isPilotage } from '../middleware/auth.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { toInt } from '../utils/sanitize.js';
import { computeReconciliation } from './soldeController.js';

const RETIREMENT_AGE = Number(process.env.RETIREMENT_AGE || 60);
const ACTIVE = `e.position_statutaire IN ('activite','stage')`;

/**
 * Périmètre des indicateurs :
 *  - pilotage (Présidence / SGG) : national, ou une institution choisie
 *  - gestionnaire RH : sa propre institution uniquement
 * Les indicateurs sont agrégés : aucun dossier individuel n'est exposé.
 */
const resolveScope = (req) => {
  const u = req.user;
  if (isPilotage(u)) return req.query.institution ? toInt(req.query.institution) : null;
  if (isGestionnaire(u)) return u.institution_id;
  throw new AppError('Tableaux de bord réservés au pilotage et aux DRH', 403);
};

export const computeIndicators = async (institutionId) => {
  const p = [institutionId];
  const scope = '($1::int IS NULL OR s.institution_id = $1)';
  const base = `FROM employees e JOIN structures s ON s.id = e.structure_id WHERE ${scope}`;
  const q = (sql, params = p) => query(sql, params).then((r) => r.rows);

  const [totals, byInstitution, byHierarchie, byCorps, byStatut, byPosition, pyramid, absent, payroll, retirements,
    workflows, lastImport, biometric] = await Promise.all([
    q(`SELECT COUNT(*) FILTER (WHERE ${ACTIVE}) AS effectif,
              COUNT(*) FILTER (WHERE ${ACTIVE} AND e.sexe = 'F') AS femmes,
              COUNT(*) FILTER (WHERE ${ACTIVE} AND e.sexe = 'M') AS hommes,
              ROUND(AVG(EXTRACT(YEAR FROM age(e.date_of_birth))) FILTER (WHERE ${ACTIVE}), 1) AS age_moyen,
              COALESCE(SUM(e.salary) FILTER (WHERE ${ACTIVE}), 0) AS masse_mensuelle_referentiel,
              COUNT(*) FILTER (WHERE ${ACTIVE} AND e.identity_verified_at IS NOT NULL) AS identite_verifiee,
              COUNT(*) FILTER (WHERE ${ACTIVE} AND e.biometric_enrolled_at IS NOT NULL) AS enroles
         ${base}`),
    q(`SELECT i.id, i.name, i.sigle, i.type,
              COUNT(e.id) FILTER (WHERE ${ACTIVE}) AS effectif,
              COUNT(e.id) FILTER (WHERE ${ACTIVE} AND e.sexe = 'F') AS femmes,
              COALESCE(SUM(e.salary) FILTER (WHERE ${ACTIVE}), 0) AS masse_mensuelle
         FROM structures i LEFT JOIN structures s ON s.institution_id = i.id
         LEFT JOIN employees e ON e.structure_id = s.id
        WHERE i.type IN ('presidence','sgg','ministere') AND i.is_active AND ($1::int IS NULL OR i.id = $1)
        GROUP BY i.id ORDER BY effectif DESC`),
    q(`SELECT COALESCE(e.hierarchie, '?') AS hierarchie, COUNT(*) AS effectif,
              COUNT(*) FILTER (WHERE e.sexe = 'F') AS femmes ${base} AND ${ACTIVE} GROUP BY 1 ORDER BY 1`),
    q(`SELECT COALESCE(c.name, 'Non renseigné') AS corps, c.hierarchie, COUNT(*) AS effectif
         FROM employees e JOIN structures s ON s.id = e.structure_id LEFT JOIN corps c ON c.id = e.corps_id
        WHERE ${scope} AND ${ACTIVE} GROUP BY 1, 2 ORDER BY effectif DESC LIMIT 15`),
    q(`SELECT e.statut_emploi, COUNT(*) AS effectif ${base} AND ${ACTIVE} GROUP BY 1 ORDER BY 2 DESC`),
    q(`SELECT e.position_statutaire, COUNT(*) AS effectif ${base} GROUP BY 1 ORDER BY 2 DESC`),
    q(`SELECT LEAST(60, (EXTRACT(YEAR FROM age(e.date_of_birth))::int / 5) * 5) AS tranche,
              COUNT(*) FILTER (WHERE e.sexe = 'M') AS hommes, COUNT(*) FILTER (WHERE e.sexe = 'F') AS femmes
         ${base} AND ${ACTIVE} AND e.date_of_birth IS NOT NULL GROUP BY 1 ORDER BY 1`),
    q(`SELECT COUNT(*) FILTER (WHERE a.status = 'absent') AS absences,
              COUNT(*) FILTER (WHERE a.status IN ('present','late','half_day','absent')) AS jours
         FROM attendance a JOIN employees e ON e.id = a.employee_id JOIN structures s ON s.id = e.structure_id
        WHERE ${scope} AND a.work_date >= CURRENT_DATE - 30`),
    q(`SELECT p.period_year, p.period_month, SUM(p.net) AS net, SUM(p.gross) AS brut, COUNT(*) AS bulletins
         FROM payrolls p JOIN employees e ON e.id = p.employee_id JOIN structures s ON s.id = e.structure_id
        WHERE ${scope} AND p.source = 'solde' GROUP BY 1, 2 ORDER BY 1 DESC, 2 DESC LIMIT 12`),
    q(`SELECT EXTRACT(YEAR FROM e.date_of_birth)::int + $2 AS annee, COUNT(*) AS departs,
              COALESCE(SUM(e.salary), 0) AS masse_mensuelle
         ${base} AND ${ACTIVE} AND e.date_of_birth IS NOT NULL
          AND EXTRACT(YEAR FROM e.date_of_birth)::int + $2 BETWEEN EXTRACT(YEAR FROM CURRENT_DATE)::int
              AND EXTRACT(YEAR FROM CURRENT_DATE)::int + 5
        GROUP BY 1 ORDER BY 1`, [institutionId, RETIREMENT_AGE]),
    q(`SELECT t.name, t.category, COUNT(r.id) FILTER (WHERE r.status IN ('in_progress','awaiting_documents')) AS en_cours,
              COUNT(r.id) FILTER (WHERE r.status IN ('in_progress','awaiting_documents') AND r.due_date < CURRENT_DATE) AS en_retard,
              ROUND(AVG(EXTRACT(EPOCH FROM (r.closed_at - r.created_at)) / 86400) FILTER (WHERE r.status = 'approved')::numeric, 1) AS delai_moyen,
              t.sla_days
         FROM workflow_types t LEFT JOIN requests r ON r.type_id = t.id AND ($1::int IS NULL OR r.institution_id = $1)
        GROUP BY t.id ORDER BY en_cours DESC, t.name`),
    query('SELECT * FROM solde_imports ORDER BY period_year DESC, period_month DESC, id DESC LIMIT 1').then((r) => r.rows[0]),
    q(`SELECT COUNT(*) FILTER (WHERE a.source = 'biometrie') AS pointages_biometriques, COUNT(*) AS pointages
         FROM attendance a JOIN employees e ON e.id = a.employee_id JOIN structures s ON s.id = e.structure_id
        WHERE ${scope} AND a.work_date >= CURRENT_DATE - 30 AND a.check_in IS NOT NULL`),
  ]);

  const t = totals[0];
  const monthly = Number(t.masse_mensuelle_referentiel);
  // Masse salariale prévisionnelle sur 12 mois : effectif actuel, moins les départs à la retraite de l'année
  const nowYear = new Date().getFullYear();
  const retiringThisYear = retirements.find((r) => r.annee === nowYear);
  const monthsLeft = 12 - new Date().getMonth();
  const forecast = monthly * 12 - (retiringThisYear ? Number(retiringThisYear.masse_mensuelle) * Math.max(0, 12 - monthsLeft) : 0);

  const recon = lastImport ? await computeReconciliation(lastImport, institutionId) : null;
  return {
    scope: institutionId ? 'institution' : 'national',
    generated_at: new Date().toISOString(),
    effectif: t.effectif,
    femmes: t.femmes,
    hommes: t.hommes,
    taux_feminisation: t.effectif ? Math.round((t.femmes / t.effectif) * 1000) / 10 : 0,
    age_moyen: t.age_moyen,
    taux_absenteisme: absent[0].jours ? Math.round((absent[0].absences / absent[0].jours) * 1000) / 10 : 0,
    taux_enrolement_biometrique: t.effectif ? Math.round((t.enroles / t.effectif) * 1000) / 10 : 0,
    taux_identite_verifiee: t.effectif ? Math.round((t.identite_verifiee / t.effectif) * 1000) / 10 : 0,
    part_pointages_biometriques: biometric[0].pointages
      ? Math.round((biometric[0].pointages_biometriques / biometric[0].pointages) * 1000) / 10 : 0,
    masse_salariale: {
      mensuelle_referentiel: monthly,
      previsionnelle_12_mois: Math.round(forecast),
      derniere_solde: payroll[0] || null,
      historique: payroll.slice().reverse(),
    },
    retraites: retirements,
    retirement_age: RETIREMENT_AGE,
    par_institution: byInstitution,
    par_hierarchie: byHierarchie,
    par_corps: byCorps,
    par_statut: byStatut,
    par_position: byPosition,
    pyramide: pyramid,
    workflows,
    coherence_solde: recon ? { ...recon.summary, import_id: recon.import.id } : null,
  };
};

/** GET /api/pilotage/indicators?institution= */
export const indicators = async (req, res) => {
  res.json(await computeIndicators(resolveScope(req)));
};

/** GET /api/pilotage/export.xlsx — export Excel multi-onglets */
export const exportXlsx = async (req, res) => {
  const inst = resolveScope(req);
  const d = await computeIndicators(inst);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIGRH Sénégal';
  const sheet = (name, columns, rows) => {
    const ws = wb.addWorksheet(name);
    ws.columns = columns.map(([header, key, width = 18]) => ({ header, key, width }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00853F' } };
    rows.forEach((r) => ws.addRow(r));
  };
  sheet('Synthèse', [['Indicateur', 'k', 45], ['Valeur', 'v', 20]], [
    { k: 'Périmètre', v: inst ? d.par_institution[0]?.name : 'National' },
    { k: 'Effectif en activité', v: Number(d.effectif) }, { k: 'Taux de féminisation (%)', v: d.taux_feminisation },
    { k: 'Âge moyen', v: Number(d.age_moyen) }, { k: 'Taux d’absentéisme 30 j (%)', v: d.taux_absenteisme },
    { k: 'Enrôlement biométrique (%)', v: d.taux_enrolement_biometrique },
    { k: 'Masse salariale mensuelle (référentiel)', v: d.masse_salariale.mensuelle_referentiel },
    { k: 'Masse salariale prévisionnelle 12 mois', v: d.masse_salariale.previsionnelle_12_mois },
    { k: 'Anomalies Solde (dernier import)', v: d.coherence_solde?.anomalies ?? '—' },
  ]);
  sheet('Par institution', [['Institution', 'name', 45], ['Sigle', 'sigle'], ['Effectif', 'effectif'], ['Femmes', 'femmes'],
    ['Masse mensuelle', 'masse_mensuelle', 20]], d.par_institution);
  sheet('Par hiérarchie', [['Hiérarchie', 'hierarchie'], ['Effectif', 'effectif'], ['Femmes', 'femmes']], d.par_hierarchie);
  sheet('Par corps', [['Corps', 'corps', 40], ['Hiérarchie', 'hierarchie'], ['Effectif', 'effectif']], d.par_corps);
  sheet('Pyramide des âges', [['Tranche', 'tranche'], ['Hommes', 'hommes'], ['Femmes', 'femmes']],
    d.pyramide.map((r) => ({ ...r, tranche: r.tranche >= 60 ? '60 ans et +' : `${r.tranche}–${r.tranche + 4} ans` })));
  sheet('Départs retraite', [['Année', 'annee'], ['Départs', 'departs'], ['Masse mensuelle concernée', 'masse_mensuelle', 25]],
    d.retraites);
  sheet('Circuits', [['Type de demande', 'name', 40], ['En cours', 'en_cours'], ['En retard', 'en_retard'],
    ['Délai moyen (j)', 'delai_moyen'], ['Délai réglementaire (j)', 'sla_days']], d.workflows);
  await logActivity(req.user.id, 'Export tableau de bord (Excel)', 'pilotage', inst, null, req.ip);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="sigrh-indicateurs-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
};

/** GET /api/pilotage/export.pdf — note de synthèse pour les décideurs */
export const exportPdf = async (req, res) => {
  const inst = resolveScope(req);
  const d = await computeIndicators(inst);
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="sigrh-synthese-${new Date().toISOString().slice(0, 10)}.pdf"`);
  doc.pipe(res);
  doc.rect(50, 40, 165, 4).fill('#00853F').rect(215, 40, 165, 4).fill('#FDEF42').rect(380, 40, 165, 4).fill('#E31B23');
  doc.fillColor('#000').fontSize(12).text('RÉPUBLIQUE DU SÉNÉGAL', 50, 55, { align: 'center' });
  doc.fontSize(8).fillColor('#555').text('Un Peuple – Un But – Une Foi', { align: 'center' });
  doc.moveDown().fontSize(15).fillColor('#00602d')
    .text(`SIGRH — Note de synthèse RH ${inst ? `(${d.par_institution[0]?.sigle || ''})` : '(consolidé national)'}`, { align: 'center' });
  doc.fontSize(9).fillColor('#666').text(`Situation au ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' }).moveDown();
  const fmt = (n) => Math.round(Number(n || 0)).toLocaleString('fr-FR').replace(/ | /g, ' ');
  doc.fillColor('#000').fontSize(11);
  [
    ['Effectif en activité', fmt(d.effectif)], ['Taux de féminisation', `${d.taux_feminisation} %`],
    ['Âge moyen', `${d.age_moyen ?? '—'} ans`], ['Absentéisme (30 jours)', `${d.taux_absenteisme} %`],
    ['Enrôlement biométrique', `${d.taux_enrolement_biometrique} %`],
    ['Masse salariale mensuelle (référentiel)', `${fmt(d.masse_salariale.mensuelle_referentiel)} FCFA`],
    ['Masse salariale prévisionnelle (12 mois)', `${fmt(d.masse_salariale.previsionnelle_12_mois)} FCFA`],
    ['Anomalies de cohérence Solde', d.coherence_solde ? `${d.coherence_solde.anomalies} (${fmt(d.coherence_solde.amount_at_risk)} FCFA à vérifier)` : '—'],
  ].forEach(([k, v]) => doc.font('Helvetica-Bold').text(`${k} : `, { continued: true }).font('Helvetica').text(v));
  doc.moveDown().font('Helvetica-Bold').fillColor('#00602d').text('Effectifs par institution').fillColor('#000').font('Helvetica').fontSize(10);
  d.par_institution.slice(0, 20).forEach((i) => doc.text(`• ${i.name} : ${fmt(i.effectif)} agents (${i.effectif ? Math.round((i.femmes / i.effectif) * 100) : 0} % de femmes)`));
  doc.moveDown().font('Helvetica-Bold').fillColor('#00602d').fontSize(11).text('Départs à la retraite prévus').fillColor('#000').font('Helvetica').fontSize(10);
  d.retraites.forEach((r) => doc.text(`• ${r.annee} : ${r.departs} départ(s)`));
  doc.end();
  await logActivity(req.user.id, 'Export tableau de bord (PDF)', 'pilotage', inst, null, req.ip);
};

/** GET /api/dashboard — accueil adapté au profil */
export const dashboard = async (req, res) => {
  const u = req.user;
  const today = new Date().toISOString().slice(0, 10);
  const empId = u.employee_id ?? -1;
  const year = new Date().getFullYear();
  const [att, balances, openReqs, lastSlip, announcements, todoCount] = await Promise.all([
    query('SELECT * FROM attendance WHERE employee_id = $1 AND work_date = $2', [empId, today]),
    query(`SELECT b.leave_type, lt.label, b.allotted - b.used AS remaining FROM leave_balances b
             JOIN leave_types lt ON lt.code = b.leave_type WHERE b.employee_id = $1 AND b.year = $2`, [empId, year]),
    query(`SELECT COUNT(*) FROM requests WHERE employee_id = $1 AND status IN ('in_progress','awaiting_documents')`, [empId]),
    query(`SELECT net, period_month, period_year FROM payrolls WHERE employee_id = $1 AND source = 'solde'
            ORDER BY period_year DESC, period_month DESC LIMIT 1`, [empId]),
    query(`SELECT a.*, u.name AS author_name, i.sigle AS institution_sigle FROM announcements a
             LEFT JOIN users u ON u.id = a.author_id LEFT JOIN structures i ON i.id = a.institution_id
            WHERE a.institution_id IS NULL OR a.institution_id = $1 ORDER BY a.created_at DESC LIMIT 5`, [u.institution_id ?? -1]),
    query(`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type = 'workflow' AND NOT is_read`, [u.id]),
  ]);
  const result = {
    me: { today: att.rows[0] || null, balances: balances.rows, openRequests: openReqs.rows[0].count,
      lastPayslip: lastSlip.rows[0] || null, pendingValidations: todoCount.rows[0].count },
    announcements: announcements.rows,
  };
  if (isPilotage(u) || isGestionnaire(u)) result.indicators = await computeIndicators(isPilotage(u) ? null : u.institution_id);
  if (u.role === 'admin_dsi') {
    const [users, clients, logs] = await Promise.all([
      query(`SELECT role, COUNT(*) AS n, COUNT(*) FILTER (WHERE totp_enabled) AS mfa,
                    COUNT(*) FILTER (WHERE rights_reviewed_at IS NULL OR rights_reviewed_at < now() - interval '180 days') AS a_revoir
               FROM users WHERE is_active GROUP BY role`),
      query('SELECT COUNT(*) FILTER (WHERE is_active) AS actifs, MAX(last_used_at) AS dernier_appel FROM api_clients'),
      query(`SELECT COUNT(*) FILTER (WHERE action LIKE 'Échec%') AS echecs FROM activity_logs WHERE created_at > now() - interval '24 hours'`),
    ]);
    result.technique = { comptes: users.rows, interop: clients.rows[0], echecs_24h: logs.rows[0].echecs };
  }
  if (u.isChef) {
    const { rows } = await query(
      `SELECT COUNT(*) FILTER (WHERE e.position_statutaire IN ('activite','stage')) AS effectif,
              COUNT(a.id) FILTER (WHERE a.status IN ('present','late','half_day')) AS presents,
              COUNT(l.id) AS en_absence
         FROM employees e LEFT JOIN attendance a ON a.employee_id = e.id AND a.work_date = $2
         LEFT JOIN leaves l ON l.employee_id = e.id AND l.status = 'approved' AND $2::date BETWEEN l.start_date AND l.end_date
        WHERE e.structure_id = ANY($1)`, [u.managed_structures, today]);
    result.team = rows[0];
  }
  assert(result, 'Tableau de bord indisponible');
  res.json(result);
};
