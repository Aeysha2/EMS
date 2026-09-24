import { query, withTransaction } from '../config/db.js';
import { isGestionnaire, isPilotage } from '../middleware/auth.js';
import { findEmployeeById, PAID_POSITIONS } from '../models/Employee.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { parseCsv, toNumber } from '../utils/csv.js';
import { monthBounds } from '../utils/dates.js';
import { notifyRoles } from '../utils/notify.js';
import { computePayslip } from '../utils/payroll.js';
import { streamPayslip } from '../utils/payslipPdf.js';
import { toInt } from '../utils/sanitize.js';

const SALARY_GAP_TOLERANCE = Number(process.env.SOLDE_GAP_TOLERANCE || 0.05);
const NON_PAYABLE = ['retraite', 'demission', 'radiation', 'deces', 'disponibilite'];

const PAYROLL_SELECT = `
  SELECT p.*, e.full_name, e.sigrh_id, e.matricule_solde, e.fonction, e.grade, e.echelon, e.hierarchie,
         c.name AS corps_name, s.name AS structure_name, i.name AS institution_name, s.institution_id
    FROM payrolls p JOIN employees e ON e.id = p.employee_id
    LEFT JOIN structures s ON s.id = e.structure_id LEFT JOIN structures i ON i.id = s.institution_id
    LEFT JOIN corps c ON c.id = e.corps_id`;

// ---------------------------------------------------------------- bulletins dématérialisés

/** GET /api/solde/payslips?scope=mine|institution&year=&month= */
export const listPayslips = async (req, res) => {
  const u = req.user;
  const params = [];
  const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };
  if (req.query.scope === 'institution') {
    assert(isGestionnaire(u), 'Réservé aux gestionnaires RH', 403);
    add('s.institution_id = ?', u.institution_id);
  } else {
    add('p.employee_id = ?', u.employee_id ?? -1);
  }
  if (req.query.year) add('p.period_year = ?', toInt(req.query.year));
  if (req.query.month) add('p.period_month = ?', toInt(req.query.month));
  if (req.query.source) add('p.source = ?', req.query.source);
  const { rows } = await query(
    `${PAYROLL_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.period_year DESC, p.period_month DESC, e.last_name LIMIT 1000`,
    params);
  res.json(rows);
};

/** GET /api/solde/payslips/:id/pdf */
export const payslipPdf = async (req, res) => {
  const { rows } = await query(`${PAYROLL_SELECT} WHERE p.id = $1`, [toInt(req.params.id)]);
  const slip = rows[0];
  if (!slip) throw new AppError('Bulletin introuvable', 404);
  const own = slip.employee_id === req.user.employee_id;
  if (!own && !(isGestionnaire(req.user) && slip.institution_id === req.user.institution_id)) {
    throw new AppError('Accès refusé', 403);
  }
  if (!own) await logActivity(req.user.id, 'Consultation de bulletin', 'payroll', slip.id, slip.sigrh_id, req.ip);
  streamPayslip(res, slip);
};

/**
 * POST /api/solde/simulation { employee_id, year, month, bonus, otherDeductions }
 * Calcul des primes et indemnités (simulation, ne remplace pas la Solde).
 */
export const simulate = async (req, res) => {
  const emp = await findEmployeeById(toInt(req.body.employee_id) || req.user.employee_id);
  assert(emp, 'Agent introuvable');
  const allowed = emp.id === req.user.employee_id || (isGestionnaire(req.user) && emp.institution_id === req.user.institution_id);
  assert(allowed, 'Accès refusé', 403);
  const now = new Date();
  const year = toInt(req.body.year, now.getFullYear());
  const month = toInt(req.body.month, now.getMonth() + 1);
  assert(month >= 1 && month <= 12, 'Mois invalide');
  const { start, end } = monthBounds(year, month);
  const { rows } = await query(
    'SELECT COALESCE(SUM(overtime),0) AS h FROM attendance WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3',
    [emp.id, start, end]);
  res.json(computePayslip({ basic: emp.salary, year, month, overtimeHours: rows[0].h,
    bonus: Number(req.body.bonus || 0), otherDeductions: Number(req.body.otherDeductions || 0) }));
};

// ---------------------------------------------------------------- interconnexion Solde

/**
 * Importe un état de paiement de la Solde (fichier ou API d'interopérabilité).
 * lines : [{ matricule_solde, nom, salaire_base, brut, retenues, impot, net }]
 */
export const importSoldeLines = async (db, { year, month, lines, source, filename, userId }) => {
  assert(year >= 2000 && year <= 2100 && month >= 1 && month <= 12, 'Période invalide');
  assert(Array.isArray(lines) && lines.length, 'Aucune ligne à importer');
  const errors = [];
  const clean = lines.map((l, i) => {
    const mat = String(l.matricule_solde || l.matricule || '').trim().toUpperCase();
    const net = toNumber(l.net);
    const gross = toNumber(l.brut ?? l.gross);
    const base = toNumber(l.salaire_base ?? l.base_salary);
    if (!mat) errors.push(`Ligne ${i + 2} : matricule manquant`);
    if (net === null || Number.isNaN(net) || Number.isNaN(gross) || Number.isNaN(base)) errors.push(`Ligne ${i + 2} : montant invalide`);
    return { mat, name: l.nom || l.full_name || null, gross: gross ?? net, net, base,
      deductions: toNumber(l.retenues) || 0, tax: toNumber(l.impot) || 0, raw: l };
  });
  if (errors.length) throw new AppError(`Fichier rejeté : ${errors.slice(0, 5).join(' ; ')}${errors.length > 5 ? '…' : ''}`, 400);

  const { rows: imp } = await db.query(
    `INSERT INTO solde_imports (period_year, period_month, source, filename, line_count, total_gross, total_net, imported_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [year, month, source, filename || null, clean.length, clean.reduce((t, l) => t + (l.gross || 0), 0),
      clean.reduce((t, l) => t + l.net, 0), userId]);
  const importId = imp[0].id;
  const { rows: emps } = await db.query('SELECT id, matricule_solde FROM employees WHERE matricule_solde = ANY($1)',
    [clean.map((l) => l.mat)]);
  const byMat = Object.fromEntries(emps.map((e) => [e.matricule_solde.toUpperCase(), e.id]));
  let matched = 0;
  for (const l of clean) {
    const empId = byMat[l.mat] || null;
    await db.query(
      `INSERT INTO solde_lines (import_id, matricule_solde, full_name, gross, net, base_salary, employee_id, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [importId, l.mat, l.name, l.gross || 0, l.net, l.base, empId, JSON.stringify(l.raw)]);
    if (empId) {
      matched += 1;
      // bulletin dématérialisé mis à disposition de l'agent sur son portail
      await db.query(
        `INSERT INTO payrolls (employee_id, period_year, period_month, basic, allowances, gross, deductions, tax, net,
                               details, source, import_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'solde',$11)
         ON CONFLICT (employee_id, period_year, period_month, source) DO UPDATE SET
           basic = EXCLUDED.basic, allowances = EXCLUDED.allowances, gross = EXCLUDED.gross,
           deductions = EXCLUDED.deductions, tax = EXCLUDED.tax, net = EXCLUDED.net,
           details = EXCLUDED.details, import_id = EXCLUDED.import_id`,
        [empId, year, month, l.base ?? l.gross, Math.max(0, (l.gross || 0) - (l.base ?? l.gross)), l.gross || l.net,
          l.deductions, l.tax, l.net, JSON.stringify({ solde: l.raw }), importId]);
    }
  }
  return { ...imp[0], matched, unmatched: clean.length - matched };
};

/** POST /api/solde/imports { year, month, filename, content (CSV) } — import d'un état de la Solde (pilotage) */
export const uploadSoldeFile = async (req, res) => {
  assert(isPilotage(req.user), 'Import réservé au niveau central (interconnexion Solde)', 403);
  const { year, month, filename, content } = req.body;
  assert(content, 'Fichier CSV requis');
  const text = String(content).startsWith('data:')
    ? Buffer.from(String(content).split(',')[1], 'base64').toString('utf8') : String(content);
  const lines = parseCsv(text);
  const result = await withTransaction((db) => importSoldeLines(db, {
    year: toInt(year), month: toInt(month), lines, source: 'fichier', filename, userId: req.user.id }));
  await notifyRoles(['gestionnaire_rh'], 'solde', 'État de solde importé',
    `${String(month).padStart(2, '0')}/${year} : contrôle de cohérence disponible`, '/solde');
  await logActivity(req.user.id, 'Import état de solde', 'solde_import', result.id,
    `${result.line_count} lignes, ${result.unmatched} non rapprochées`, req.ip);
  res.status(201).json(result);
};

/** GET /api/solde/imports */
export const listImports = async (req, res) => {
  assert(isPilotage(req.user) || isGestionnaire(req.user), 'Accès refusé', 403);
  const { rows } = await query(
    `SELECT si.*, u.name AS imported_by_name,
            (SELECT COUNT(*) FROM solde_lines l WHERE l.import_id = si.id AND l.employee_id IS NULL) AS unmatched
       FROM solde_imports si LEFT JOIN users u ON u.id = si.imported_by
      ORDER BY si.period_year DESC, si.period_month DESC, si.id DESC LIMIT 60`);
  res.json(rows);
};

/**
 * GET /api/solde/imports/:id/reconciliation — contrôle de cohérence effectifs / biométrie / masse salariale.
 * Pilotage : vue nationale. Gestionnaire RH : anomalies de son institution.
 */
export const reconciliation = async (req, res) => {
  const u = req.user;
  assert(isPilotage(u) || isGestionnaire(u), 'Accès refusé', 403);
  const { rows: imp } = await query('SELECT * FROM solde_imports WHERE id = $1', [toInt(req.params.id)]);
  assert(imp[0], 'Import introuvable');
  res.json(await computeReconciliation(imp[0], isPilotage(u) ? null : u.institution_id));
};

export const computeReconciliation = async (imp, institutionId = null) => {
  const { start, end } = monthBounds(imp.period_year, imp.period_month);
  const { rows: lines } = await query(
    `SELECT l.*, e.full_name AS agent_name, e.sigrh_id, e.position_statutaire, e.salary, e.biometric_enrolled_at,
            s.institution_id, i.sigle AS institution_sigle,
            (SELECT COUNT(*) FROM attendance a WHERE a.employee_id = e.id AND a.work_date BETWEEN $2 AND $3
                AND a.status IN ('present','late','half_day','mission','on_leave')) AS presence_days
       FROM solde_lines l LEFT JOIN employees e ON e.id = l.employee_id
       LEFT JOIN structures s ON s.id = e.structure_id LEFT JOIN structures i ON i.id = s.institution_id
      WHERE l.import_id = $1`, [imp.id, start, end]);
  const scoped = institutionId ? lines.filter((l) => l.institution_id === institutionId) : lines;
  const anomalies = [];
  const push = (type, line, detail, amount = line?.net) => anomalies.push({
    type, matricule_solde: line.matricule_solde, name: line.agent_name || line.full_name, sigrh_id: line.sigrh_id,
    employee_id: line.employee_id, institution: line.institution_sigle, amount, detail,
  });

  if (!institutionId) {
    lines.filter((l) => !l.employee_id).forEach((l) => push('inconnu', l, 'Payé par la Solde mais absent du référentiel SIGRH'));
  }
  const seen = {};
  for (const l of scoped.filter((x) => x.employee_id)) {
    if (seen[l.employee_id]) push('doublon', l, 'Agent payé plusieurs fois sur la période');
    seen[l.employee_id] = true;
    if (NON_PAYABLE.includes(l.position_statutaire)) {
      push('position_non_payable', l, `Payé alors que sa position est « ${l.position_statutaire} »`);
    }
    if (l.base_salary && l.salary && Math.abs(l.base_salary - l.salary) / l.salary > SALARY_GAP_TOLERANCE) {
      push('ecart_salaire', l, `Base Solde ${Math.round(l.base_salary)} ≠ référentiel ${Math.round(l.salary)}`,
        Math.round(l.base_salary - l.salary));
    }
    if (PAID_POSITIONS.includes(l.position_statutaire) && !l.biometric_enrolled_at) {
      push('non_enrole', l, 'Payé mais non enrôlé dans le système biométrique');
    }
    if (PAID_POSITIONS.includes(l.position_statutaire) && Number(l.presence_days) === 0) {
      push('sans_presence', l, 'Aucune présence enregistrée sur la période (effectif physique non confirmé)');
    }
  }
  const paidIds = lines.map((l) => l.employee_id).filter(Boolean);
  const { rows: unpaid } = await query(
    `SELECT e.id, e.full_name, e.sigrh_id, e.matricule_solde, i.sigle AS institution_sigle
       FROM employees e JOIN structures s ON s.id = e.structure_id JOIN structures i ON i.id = s.institution_id
      WHERE e.position_statutaire IN ('activite','stage') AND NOT (e.id = ANY($1))
        AND COALESCE(e.date_prise_service, e.date_entree_fp, '1900-01-01') <= $2
        AND ($3::int IS NULL OR s.institution_id = $3)`, [paidIds, end, institutionId]);
  unpaid.forEach((e) => anomalies.push({ type: 'non_paye', matricule_solde: e.matricule_solde, name: e.full_name,
    sigrh_id: e.sigrh_id, employee_id: e.id, institution: e.institution_sigle, amount: 0,
    detail: 'En activité dans le référentiel mais absent de l’état de solde' }));

  const riskTypes = ['inconnu', 'doublon', 'position_non_payable', 'sans_presence'];
  const summary = {
    period: `${String(imp.period_month).padStart(2, '0')}/${imp.period_year}`,
    lines: scoped.length,
    total_net: scoped.reduce((t, l) => t + Number(l.net), 0),
    anomalies: anomalies.length,
    amount_at_risk: anomalies.filter((a) => riskTypes.includes(a.type)).reduce((t, a) => t + Number(a.amount || 0), 0),
    by_type: anomalies.reduce((acc, a) => ({ ...acc, [a.type]: (acc[a.type] || 0) + 1 }), {}),
    reconciled_rate: scoped.length
      ? Math.round((1 - new Set(anomalies.filter((a) => a.type !== 'non_paye').map((a) => a.matricule_solde)).size / scoped.length) * 1000) / 10
      : 100,
  };
  return { import: imp, summary, anomalies };
};
