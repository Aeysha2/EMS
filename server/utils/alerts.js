import { query } from '../config/db.js';
import { getSteps, resolveActors, REQUEST_SELECT } from '../models/Workflow.js';
import { notifyEmployee, notifyUsers } from './notify.js';

/**
 * Alertes de dépassement des délais réglementaires (section 6.3).
 * Pour chaque demande dont l'étape en cours a dépassé son délai, les valideurs sont alertés (une fois par étape),
 * et la DRH de l'institution est mise en copie.
 */
export const runOverdueAlerts = async () => {
  const { rows } = await query(
    `${REQUEST_SELECT} WHERE r.status = 'in_progress' AND r.step_due_date < CURRENT_DATE AND r.alert_sent_at IS NULL`);
  for (const r of rows) {
    const steps = await getSteps(r.type_id);
    const step = steps[r.current_step - 1];
    const actors = await resolveActors(r, step);
    await notifyUsers(actors, 'alerte', `Délai dépassé : ${r.reference}`,
      `${r.type_name} — ${r.employee_name} est à l’étape « ${step?.name} » depuis le ${String(r.step_started_at).slice(0, 10)}`,
      `/requests/${r.id}`);
    if (r.assigned_employee_id) {
      await notifyEmployee(r.assigned_employee_id, 'alerte', `Délai dépassé : ${r.reference}`, r.type_name, `/requests/${r.id}`);
    }
    await query(`UPDATE requests SET alert_sent_at = now() WHERE id = $1`, [r.id]);
    await query(
      `INSERT INTO request_history (request_id, step_order, step_name, action, comment)
       VALUES ($1,$2,$3,'alert',$4)`,
      [r.id, step?.step_order, step?.name, `Délai de l’étape dépassé (échéance ${r.step_due_date})`]);
  }
  return rows.length;
};

/** Planifie la vérification toutes les heures (et une première fois au démarrage). */
export const scheduleAlerts = () => {
  const run = () => runOverdueAlerts().catch((err) => console.error('alertes :', err.message));
  setTimeout(run, 5_000);
  return setInterval(run, 60 * 60 * 1000);
};
