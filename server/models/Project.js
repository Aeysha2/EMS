import { query } from '../config/db.js';

export const PROJECT_SELECT = `
  SELECT p.*,
         rt.name AS request_type_name, rt.code AS request_type_code, rt.sla_days,
         dt.name AS deposit_type_name,
         a.full_name AS agent_name, a.employee_code AS agent_code,
         d.name AS department_name,
         cu.name AS created_by_name,
         (p.status IN ('in_progress','awaiting_documents') AND p.due_date < CURRENT_DATE) AS is_overdue
    FROM projects p
    JOIN request_types rt ON rt.id = p.request_type_id
    JOIN deposit_types dt ON dt.id = p.deposit_type_id
    LEFT JOIN employees a ON a.id = p.agent_id
    LEFT JOIN departments d ON d.id = p.department_id
    LEFT JOIN users cu ON cu.id = p.created_by`;

/** Circuit for a request type: its own steps if defined, otherwise the default circuit. */
export const getCircuit = async (requestTypeId, db = { query }) => {
  const { rows } = await db.query(
    `SELECT cs.*, d.name AS department_name FROM circuit_steps cs
       LEFT JOIN departments d ON d.id = cs.department_id
      WHERE cs.request_type_id IS NOT DISTINCT FROM (
              CASE WHEN EXISTS (SELECT 1 FROM circuit_steps WHERE request_type_id = $1) THEN $1::int END)
      ORDER BY cs.step_order`,
    [requestTypeId]
  );
  return rows;
};

export const nextReference = async (db = { query }) => {
  const { rows } = await db.query(`SELECT nextval('project_reference_seq') AS n`);
  const year = new Date().getFullYear();
  return `MFP-${year}-${String(rows[0].n).padStart(5, '0')}`;
};
