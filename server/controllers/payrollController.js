import { query, withTransaction } from '../config/db.js';
import { isHRorAdmin } from '../middleware/auth.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';
import { businessDaysBetween, monthBounds } from '../utils/dates.js';
import { notifyEmployee } from '../utils/notify.js';
import { computePayslip, PAYROLL_RULES } from '../utils/payroll.js';
import { streamPayslip } from '../utils/payslipPdf.js';
import { toInt } from '../utils/sanitize.js';

const PAYROLL_SELECT = `
  SELECT p.*, e.full_name, e.employee_code, e.matricule, e.designation, e.grade, d.name AS department_name
    FROM payrolls p
    JOIN employees e ON e.id = p.employee_id
    LEFT JOIN departments d ON d.id = e.department_id`;

/** GET /api/payroll/rules */
export const getRules = (req, res) => {
  res.json({ ...PAYROLL_RULES, taxBrackets: PAYROLL_RULES.taxBrackets.map((b) => ({ ...b, upTo: Number.isFinite(b.upTo) ? b.upTo : null })) });
};

/** POST /api/payroll/preview { employee_id, year, month, bonus, otherDeductions } (HR/Admin) */
export const previewPayslip = async (req, res) => {
  const { employee_id: id, bonus = 0, otherDeductions = 0 } = req.body;
  const year = toInt(req.body.year);
  const month = toInt(req.body.month);
  assert(year >= 2000 && year <= 2100 && month >= 1 && month <= 12, 'Période invalide');
  const { rows } = await query('SELECT salary FROM employees WHERE id = $1', [toInt(id)]);
  if (!rows[0]) throw new AppError('Employé introuvable', 404);
  const inputs = await periodInputs(toInt(id), year, month);
  res.json(computePayslip({
    basic: rows[0].salary, year, month, bonus: Number(bonus), otherDeductions: Number(otherDeductions), ...inputs,
  }));
};

/** Overtime hours and unpaid-leave working days of one employee within the month. */
const periodInputs = async (employeeId, year, month, db = { query }) => {
  const { start, end } = monthBounds(year, month);
  const [ot, unpaid] = await Promise.all([
    db.query(
      'SELECT COALESCE(SUM(overtime), 0) AS h FROM attendance WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3',
      [employeeId, start, end]
    ),
    db.query(
      `SELECT GREATEST(start_date, $2::date)::text AS s, LEAST(end_date, $3::date)::text AS e FROM leaves
        WHERE employee_id = $1 AND leave_type = 'unpaid' AND status = 'approved'
          AND start_date <= $3 AND end_date >= $2`,
      [employeeId, start, end]
    ),
  ]);
  return {
    overtimeHours: ot.rows[0].h,
    unpaidLeaveDays: unpaid.rows.reduce((sum, r) => sum + businessDaysBetween(r.s, r.e), 0),
  };
};

/**
 * POST /api/payroll/generate (HR/Admin) — automatic payroll calculation (challenge #2)
 * { year, month, employee_ids?: number[], bonuses?: {id: amount}, deductions?: {id: amount}, overwrite?: bool }
 */
export const generatePayroll = async (req, res) => {
  const year = toInt(req.body.year);
  const month = toInt(req.body.month);
  assert(year >= 2000 && year <= 2100, 'Année invalide');
  assert(month >= 1 && month <= 12, 'Mois invalide');
  const bonuses = req.body.bonuses || {};
  const deductions = req.body.deductions || {};
  const ids = Array.isArray(req.body.employee_ids) && req.body.employee_ids.length
    ? req.body.employee_ids.map((v) => toInt(v)).filter(Boolean) : null;
  const { end } = monthBounds(year, month);

  const { rows: employees } = await query(
    `SELECT id, salary FROM employees
      WHERE status IN ('active','on_leave') AND date_of_joining <= $1 AND ($2::int[] IS NULL OR id = ANY($2))`,
    [end, ids]
  );

  const result = await withTransaction(async (client) => {
    const created = [];
    const skipped = [];
    for (const emp of employees) {
      const inputs = await periodInputs(emp.id, year, month, client);
      const slip = computePayslip({
        basic: emp.salary, year, month, ...inputs,
        bonus: Number(bonuses[emp.id] || 0),
        otherDeductions: Number(deductions[emp.id] || 0),
      });
      const conflict = req.body.overwrite
        ? `ON CONFLICT (employee_id, period_year, period_month) DO UPDATE SET
             basic = EXCLUDED.basic, allowances = EXCLUDED.allowances, bonuses = EXCLUDED.bonuses,
             overtime_pay = EXCLUDED.overtime_pay, gross = EXCLUDED.gross, deductions = EXCLUDED.deductions,
             tax = EXCLUDED.tax, net = EXCLUDED.net, details = EXCLUDED.details,
             generated_by = EXCLUDED.generated_by, created_at = now()
           WHERE payrolls.status = 'processed'`
        : 'ON CONFLICT (employee_id, period_year, period_month) DO NOTHING';
      const { rows } = await client.query(
        `INSERT INTO payrolls (employee_id, period_year, period_month, basic, allowances, bonuses, overtime_pay,
                               gross, deductions, tax, net, details, generated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ${conflict} RETURNING id`,
        [emp.id, year, month, slip.basic, slip.allowances, slip.bonuses, slip.overtimePay,
          slip.gross, slip.deductions, slip.tax, slip.net, JSON.stringify(slip.details), req.user.id]
      );
      if (rows[0]) {
        created.push(rows[0].id);
        await notifyEmployee(emp.id, 'payroll', 'Salaire traité',
          `Votre bulletin de ${String(month).padStart(2, '0')}/${year} est disponible (net : ${slip.net}).`, '/payroll', client);
      } else {
        skipped.push(emp.id);
      }
    }
    return { created, skipped };
  });

  await logActivity(req.user.id, 'Génération de la paie', 'payroll', null,
    `${String(month).padStart(2, '0')}/${year} : ${result.created.length} bulletin(s), ${result.skipped.length} ignoré(s)`);
  res.status(201).json({ year, month, generated: result.created.length, skipped: result.skipped.length });
};

/** GET /api/payroll?year=&month=&employee=&department= */
export const listPayrolls = async (req, res) => {
  const params = [];
  const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (isHRorAdmin(req.user)) {
    if (req.query.employee) add('p.employee_id = ?', toInt(req.query.employee));
    if (req.query.department) add('e.department_id = ?', toInt(req.query.department));
  } else {
    add('p.employee_id = ?', req.user.employee_id ?? -1);
  }
  if (req.query.year) add('p.period_year = ?', toInt(req.query.year));
  if (req.query.month) add('p.period_month = ?', toInt(req.query.month));

  const { rows } = await query(
    `${PAYROLL_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY p.period_year DESC, p.period_month DESC, e.full_name LIMIT 1000`,
    params
  );
  res.json(rows);
};

const loadSlip = async (req) => {
  const { rows } = await query(`${PAYROLL_SELECT} WHERE p.id = $1`, [toInt(req.params.id)]);
  const slip = rows[0];
  if (!slip) throw new AppError('Bulletin introuvable', 404);
  if (!isHRorAdmin(req.user) && slip.employee_id !== req.user.employee_id) throw new AppError('Accès refusé', 403);
  return slip;
};

/** GET /api/payroll/:id */
export const getPayroll = async (req, res) => res.json(await loadSlip(req));

/** GET /api/payroll/:id/pdf — downloadable salary slip (challenge #3) */
export const downloadPayslip = async (req, res) => {
  const slip = await loadSlip(req);
  streamPayslip(res, slip);
};

/** PATCH /api/payroll/:id/pay (HR/Admin) */
export const markPaid = async (req, res) => {
  const { rows } = await query(
    `UPDATE payrolls SET status = 'paid' WHERE id = $1 AND status = 'processed' RETURNING *`,
    [toInt(req.params.id)]
  );
  if (!rows[0]) throw new AppError('Bulletin introuvable ou déjà payé', 404);
  await notifyEmployee(rows[0].employee_id, 'payroll', 'Salaire versé',
    `Votre salaire de ${String(rows[0].period_month).padStart(2, '0')}/${rows[0].period_year} a été versé.`, '/payroll');
  await logActivity(req.user.id, 'Paiement salaire', 'payroll', rows[0].id);
  res.json(rows[0]);
};

/** DELETE /api/payroll/:id (HR/Admin) — only unpaid slips */
export const deletePayroll = async (req, res) => {
  const { rows } = await query(
    `DELETE FROM payrolls WHERE id = $1 AND status = 'processed' RETURNING id`,
    [toInt(req.params.id)]
  );
  if (!rows[0]) throw new AppError('Bulletin introuvable ou déjà payé', 404);
  await logActivity(req.user.id, 'Suppression bulletin', 'payroll', rows[0].id);
  res.json({ message: 'Bulletin supprimé' });
};
