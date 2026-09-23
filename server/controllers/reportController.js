import { query } from '../config/db.js';
import { assert } from '../utils/AppError.js';
import { toInt } from '../utils/sanitize.js';

/** GET /api/reports/departments — department-wise report (challenge #6) */
export const departmentReport = async (req, res) => {
  const { rows } = await query(
    `SELECT d.id, d.name, d.code, d.budget, m.full_name AS manager_name,
            COUNT(e.id) FILTER (WHERE e.status <> 'terminated') AS employees,
            COUNT(e.id) FILTER (WHERE e.status = 'active') AS active,
            COALESCE(SUM(e.salary) FILTER (WHERE e.status <> 'terminated'), 0) AS monthly_salaries,
            COALESCE(ROUND(AVG(e.salary) FILTER (WHERE e.status <> 'terminated'), 2), 0) AS avg_salary,
            COALESCE((SELECT ROUND(AVG(r.rating), 2) FROM performance_reviews r JOIN employees x ON x.id = r.employee_id
                       WHERE x.department_id = d.id AND r.status = 'completed'), 0) AS avg_rating,
            (SELECT COUNT(*) FROM projects p WHERE p.department_id = d.id AND p.status IN ('in_progress','awaiting_documents')) AS open_projects
       FROM departments d
       LEFT JOIN employees m ON m.id = d.manager_id
       LEFT JOIN employees e ON e.department_id = d.id
      GROUP BY d.id, m.full_name
      ORDER BY d.name`
  );
  res.json(rows.map((r) => ({
    ...r,
    annual_salaries: r.monthly_salaries * 12,
    budget_usage: r.budget > 0 ? Math.round(((r.monthly_salaries * 12) / r.budget) * 1000) / 10 : null,
  })));
};

/** GET /api/reports/payroll?year= — monthly payroll totals */
export const payrollReport = async (req, res) => {
  const year = toInt(req.query.year, new Date().getFullYear());
  const [months, byDept] = await Promise.all([
    query(
      `SELECT period_month AS month, COUNT(*) AS slips, SUM(gross) AS gross, SUM(deductions) AS deductions,
              SUM(tax) AS tax, SUM(net) AS net, SUM(bonuses) AS bonuses, SUM(overtime_pay) AS overtime
         FROM payrolls WHERE period_year = $1 GROUP BY period_month ORDER BY period_month`,
      [year]
    ),
    query(
      `SELECT COALESCE(d.name, 'Sans département') AS department, SUM(p.net) AS net, SUM(p.gross) AS gross
         FROM payrolls p JOIN employees e ON e.id = p.employee_id LEFT JOIN departments d ON d.id = e.department_id
        WHERE p.period_year = $1 GROUP BY d.name ORDER BY net DESC`,
      [year]
    ),
  ]);
  res.json({ year, months: months.rows, byDepartment: byDept.rows });
};

/** GET /api/reports/leaves?year= */
export const leaveReport = async (req, res) => {
  const year = toInt(req.query.year, new Date().getFullYear());
  const [byType, byDept] = await Promise.all([
    query(
      `SELECT leave_type, status, COUNT(*) AS requests, SUM(days) AS days FROM leaves
        WHERE EXTRACT(YEAR FROM start_date) = $1 GROUP BY leave_type, status ORDER BY leave_type, status`,
      [year]
    ),
    query(
      `SELECT COALESCE(d.name, 'Sans département') AS department, SUM(l.days) AS days, COUNT(*) AS requests
         FROM leaves l JOIN employees e ON e.id = l.employee_id LEFT JOIN departments d ON d.id = e.department_id
        WHERE l.status = 'approved' AND EXTRACT(YEAR FROM l.start_date) = $1
        GROUP BY d.name ORDER BY days DESC`,
      [year]
    ),
  ]);
  res.json({ year, byType: byType.rows, byDepartment: byDept.rows });
};

/** GET /api/reports/projects?from=&to= — dossiers: volumes, delays, agents' workload */
export const projectReport = async (req, res) => {
  const from = req.query.from || '1900-01-01';
  const to = req.query.to || '2999-12-31';
  assert(/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to), 'Dates invalides');
  const p = [from, to];
  const [byStatus, byType, byDeposit, byAgent, monthly] = await Promise.all([
    query(`SELECT status, COUNT(*) AS count FROM projects WHERE deposit_date BETWEEN $1 AND $2 GROUP BY status`, p),
    query(
      `SELECT rt.name, rt.sla_days, COUNT(pr.id) AS count,
              COUNT(pr.id) FILTER (WHERE pr.status = 'completed') AS completed,
              ROUND(AVG(EXTRACT(EPOCH FROM (pr.closed_at - pr.created_at)) / 86400)
                    FILTER (WHERE pr.status = 'completed')::numeric, 1) AS avg_days,
              COUNT(pr.id) FILTER (WHERE pr.status IN ('in_progress','awaiting_documents') AND pr.due_date < CURRENT_DATE) AS overdue
         FROM request_types rt
         LEFT JOIN projects pr ON pr.request_type_id = rt.id AND pr.deposit_date BETWEEN $1 AND $2
        GROUP BY rt.id ORDER BY count DESC, rt.name`,
      p
    ),
    query(
      `SELECT dt.name, COUNT(pr.id) AS count FROM deposit_types dt
         LEFT JOIN projects pr ON pr.deposit_type_id = dt.id AND pr.deposit_date BETWEEN $1 AND $2
        GROUP BY dt.id ORDER BY count DESC`,
      p
    ),
    query(
      `SELECT e.id, e.full_name, d.name AS department_name,
              COUNT(pr.id) FILTER (WHERE pr.status IN ('in_progress','awaiting_documents')) AS open,
              COUNT(pr.id) FILTER (WHERE pr.status = 'completed') AS completed,
              COUNT(pr.id) FILTER (WHERE pr.status IN ('in_progress','awaiting_documents') AND pr.due_date < CURRENT_DATE) AS overdue
         FROM projects pr JOIN employees e ON e.id = pr.agent_id LEFT JOIN departments d ON d.id = e.department_id
        WHERE pr.deposit_date BETWEEN $1 AND $2
        GROUP BY e.id, d.name ORDER BY open DESC, completed DESC`,
      p
    ),
    query(
      `SELECT to_char(deposit_date, 'YYYY-MM') AS month, COUNT(*) AS deposited,
              COUNT(*) FILTER (WHERE status = 'completed') AS completed
         FROM projects WHERE deposit_date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`,
      p
    ),
  ]);
  res.json({
    byStatus: byStatus.rows, byType: byType.rows, byDeposit: byDeposit.rows, byAgent: byAgent.rows, monthly: monthly.rows,
  });
};

/** GET /api/reports/analytics — HR analytics: headcount by status, seniority, hires per year, grades */
export const hrAnalytics = async (req, res) => {
  const [status, seniority, hires, grades] = await Promise.all([
    query('SELECT status, COUNT(*) AS count FROM employees GROUP BY status'),
    query(
      `SELECT CASE WHEN age(CURRENT_DATE, date_of_joining) < interval '1 year' THEN '< 1 an'
                   WHEN age(CURRENT_DATE, date_of_joining) < interval '5 years' THEN '1–5 ans'
                   WHEN age(CURRENT_DATE, date_of_joining) < interval '10 years' THEN '5–10 ans'
                   ELSE '10 ans et +' END AS bucket, COUNT(*) AS count
         FROM employees WHERE status <> 'terminated' GROUP BY 1 ORDER BY MIN(date_of_joining) DESC`
    ),
    query(
      `SELECT to_char(date_of_joining, 'YYYY') AS year, COUNT(*) AS hires FROM employees
        WHERE date_of_joining >= CURRENT_DATE - interval '6 years' GROUP BY 1 ORDER BY 1`
    ),
    query(`SELECT COALESCE(grade, 'Non renseigné') AS grade, COUNT(*) AS count FROM employees
            WHERE status <> 'terminated' GROUP BY 1 ORDER BY 1`),
  ]);
  res.json({ status: status.rows, seniority: seniority.rows, hires: hires.rows, grades: grades.rows });
};
