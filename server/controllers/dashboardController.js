import { query } from '../config/db.js';
import { isHRorAdmin } from '../middleware/auth.js';
import { toISODate } from '../utils/dates.js';

/** GET /api/dashboard — KPIs adapted to the caller's role */
export const getDashboard = async (req, res) => {
  const today = toISODate();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const empId = req.user.employee_id ?? -1;

  const personal = await Promise.all([
    query('SELECT * FROM attendance WHERE employee_id = $1 AND work_date = $2', [empId, today]),
    query('SELECT casual_balance, sick_balance, paid_balance FROM employees WHERE id = $1', [empId]),
    query(`SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending FROM leaves WHERE employee_id = $1`, [empId]),
    query(`SELECT COUNT(*) FILTER (WHERE status IN ('in_progress','awaiting_documents')) AS open,
                  COUNT(*) FILTER (WHERE status IN ('in_progress','awaiting_documents') AND due_date < CURRENT_DATE) AS overdue
             FROM projects WHERE agent_id = $1`, [empId]),
    query('SELECT net, period_month, period_year FROM payrolls WHERE employee_id = $1 ORDER BY period_year DESC, period_month DESC LIMIT 1', [empId]),
  ]);

  const result = {
    me: {
      today: personal[0].rows[0] || null,
      balances: personal[1].rows[0] || null,
      pendingLeaves: personal[2].rows[0].pending,
      projects: personal[3].rows[0],
      lastPayslip: personal[4].rows[0] || null,
    },
  };

  const announcements = await query(
    `SELECT a.*, u.name AS author_name FROM announcements a LEFT JOIN users u ON u.id = a.author_id
      ORDER BY a.created_at DESC LIMIT 5`
  );
  result.announcements = announcements.rows;

  if (isHRorAdmin(req.user) || req.user.isManager) {
    const scoped = !isHRorAdmin(req.user);
    const deptFilter = scoped ? 'AND e.department_id = ANY($2)' : '';
    const p = scoped ? [today, req.user.managed_departments] : [today];

    const [totals, byDept, pendingLeaves, payroll, activity, projects, trend] = await Promise.all([
      query(
        `SELECT COUNT(*) FILTER (WHERE e.status <> 'terminated') AS total_employees,
                COUNT(*) FILTER (WHERE a.status IN ('present','late','half_day')) AS present,
                COUNT(*) FILTER (WHERE a.status = 'late') AS late,
                COUNT(*) FILTER (WHERE a.status = 'absent') AS absent,
                COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM leaves l WHERE l.employee_id = e.id
                                   AND l.status = 'approved' AND $1::date BETWEEN l.start_date AND l.end_date)) AS on_leave
           FROM employees e
           LEFT JOIN attendance a ON a.employee_id = e.id AND a.work_date = $1
          WHERE e.status <> 'terminated' ${deptFilter}`,
        p
      ),
      query(
        `SELECT d.id, d.name, COUNT(e.id) FILTER (WHERE e.status <> 'terminated') AS count
           FROM departments d LEFT JOIN employees e ON e.department_id = d.id
          ${scoped ? 'WHERE d.id = ANY($1)' : ''}
          GROUP BY d.id ORDER BY count DESC, d.name`,
        scoped ? [req.user.managed_departments] : []
      ),
      query(
        `SELECT COUNT(*) AS count FROM leaves l JOIN employees e ON e.id = l.employee_id
          WHERE l.status = 'pending' ${scoped ? 'AND e.department_id = ANY($1)' : ''}`,
        scoped ? [req.user.managed_departments] : []
      ),
      scoped ? null : query(
        `SELECT COALESCE(SUM(net), 0) AS net, COALESCE(SUM(gross), 0) AS gross, COUNT(*) AS slips
           FROM payrolls WHERE period_year = $1 AND period_month = $2`,
        [year, month]
      ),
      scoped ? null : query(
        `SELECT a.id, a.action, a.entity, a.details, a.created_at, u.name AS user_name
           FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
          ORDER BY a.created_at DESC LIMIT 10`
      ),
      query(
        `SELECT COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
                COUNT(*) FILTER (WHERE status = 'awaiting_documents') AS awaiting_documents,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
                COUNT(*) FILTER (WHERE status IN ('in_progress','awaiting_documents') AND due_date < CURRENT_DATE) AS overdue,
                COUNT(*) FILTER (WHERE agent_id IS NULL AND status IN ('in_progress','awaiting_documents')) AS unassigned
           FROM projects ${scoped ? 'WHERE department_id = ANY($1)' : ''}`,
        scoped ? [req.user.managed_departments] : []
      ),
      query(
        `SELECT work_date::text AS date,
                COUNT(*) FILTER (WHERE a.status IN ('present','late','half_day')) AS present,
                COUNT(*) FILTER (WHERE a.status = 'absent') AS absent
           FROM attendance a JOIN employees e ON e.id = a.employee_id
          WHERE work_date > $1::date - 14 ${deptFilter}
          GROUP BY work_date ORDER BY work_date`,
        p
      ),
    ]);

    result.org = {
      scope: scoped ? 'team' : 'organisation',
      ...totals.rows[0],
      pendingLeaves: pendingLeaves.rows[0].count,
      monthlyPayroll: payroll?.rows[0] ?? null,
      departments: byDept.rows,
      recentActivities: activity?.rows ?? [],
      projects: projects.rows[0],
      attendanceTrend: trend.rows,
    };
  }
  res.json(result);
};
