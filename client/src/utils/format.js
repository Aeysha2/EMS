export const CURRENCY = import.meta.env.VITE_CURRENCY || 'FCFA';

export const money = (n) =>
  `${Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${CURRENCY}`;

export const date = (d) => {
  if (!d) return '—';
  const v = typeof d === 'string' && d.length === 10 ? new Date(`${d}T00:00:00`) : new Date(d);
  return v.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const time = (d) => (d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—');

export const dateTime = (d) => (d ? `${date(d)} ${time(d)}` : '—');

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août',
  'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export const ROLE_LABELS = { admin: 'Administrateur', hr: 'Ressources Humaines', employee: 'Agent' };

export const LEAVE_TYPES = {
  casual: 'Congé occasionnel',
  sick: 'Congé maladie',
  paid: 'Congé payé (annuel)',
  unpaid: 'Congé sans solde',
};

export const LEAVE_STATUS = {
  pending: ['En attente', 'warning'],
  approved: ['Approuvé', 'success'],
  rejected: ['Rejeté', 'danger'],
  cancelled: ['Annulé', 'muted'],
};

export const ATTENDANCE_STATUS = {
  present: ['Présent', 'success'],
  late: ['En retard', 'warning'],
  half_day: ['Demi-journée', 'info'],
  absent: ['Absent', 'danger'],
  on_leave: ['En congé', 'info'],
  holiday: ['Férié', 'muted'],
};

export const EMPLOYEE_STATUS = {
  active: ['Actif', 'success'],
  on_leave: ['En congé', 'info'],
  suspended: ['Suspendu', 'warning'],
  retired: ['Retraité', 'muted'],
  terminated: ['Radié', 'danger'],
};

export const PROJECT_STATUS = {
  in_progress: ['En cours', 'info'],
  awaiting_documents: ['Pièces demandées', 'warning'],
  completed: ['Clôturé', 'success'],
  rejected: ['Rejeté', 'danger'],
};

export const PRIORITY = {
  low: ['Basse', 'muted'],
  normal: ['Normale', 'info'],
  high: ['Haute', 'warning'],
  urgent: ['Urgente', 'danger'],
};

/** Export rows to a CSV file (Excel-compatible, ; separator). */
export const exportCSV = (filename, columns, rows) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [columns.map((c) => esc(c.label)).join(';'),
    ...rows.map((r) => columns.map((c) => esc(c.value ? c.value(r) : r[c.key])).join(';'))];
  const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};
