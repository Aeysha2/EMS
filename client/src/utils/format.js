export const CURRENCY = import.meta.env.VITE_CURRENCY || 'FCFA';

export const money = (n) => `${Math.round(Number(n || 0)).toLocaleString('fr-FR')} ${CURRENCY}`;
export const num = (n) => Math.round(Number(n || 0)).toLocaleString('fr-FR');
export const pct = (n) => `${Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

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
export const age = (dob) => (dob ? Math.floor((Date.now() - new Date(dob)) / (365.25 * 864e5)) : null);

export const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre',
  'Novembre', 'Décembre'];

export const ROLE_LABELS = {
  agent: 'Agent',
  gestionnaire_rh: 'Gestionnaire RH (DRH)',
  pilotage: 'Pilotage (Présidence / SGG)',
  admin_dsi: 'Administrateur DSI',
};

export const STRUCTURE_TYPES = {
  presidence: 'Présidence', sgg: 'SGG', ministere: 'Ministère', direction: 'Direction', service: 'Service',
  deconcentree: 'Structure déconcentrée',
};

export const POSITIONS = {
  activite: ['Activité', 'success'], stage: ['Stage', 'info'], detachement: ['Détachement', 'purple'],
  disponibilite: ['Disponibilité', 'warning'], suspension: ['Suspension', 'danger'], retraite: ['Retraite', 'muted'],
  demission: ['Démission', 'muted'], radiation: ['Radiation', 'danger'], deces: ['Décès', 'muted'],
};

export const STATUT_EMPLOI = {
  fonctionnaire: 'Fonctionnaire', contractuel: 'Contractuel', stagiaire: 'Stagiaire', non_permanent: 'Non permanent',
};

export const CAREER_TYPES = {
  recrutement: 'Recrutement', titularisation: 'Titularisation', avancement: 'Avancement', promotion: 'Promotion',
  nomination: 'Nomination', mutation: 'Mutation', detachement: 'Détachement', disponibilite: 'Disponibilité',
  reintegration: 'Réintégration', suspension: 'Suspension', sanction: 'Sanction', distinction: 'Distinction',
  formation: 'Formation / certification', retraite: 'Retraite', demission: 'Démission', radiation: 'Radiation', deces: 'Décès',
};

export const REQUEST_STATUS = {
  in_progress: ['En cours', 'info'], awaiting_documents: ['Pièces demandées', 'warning'],
  approved: ['Validée', 'success'], rejected: ['Rejetée', 'danger'], cancelled: ['Annulée', 'muted'],
};

export const LEAVE_STATUS = {
  pending: ['En attente', 'warning'], approved: ['Approuvée', 'success'], rejected: ['Rejetée', 'danger'],
  cancelled: ['Annulée', 'muted'],
};

export const ATTENDANCE_STATUS = {
  present: ['Présent', 'success'], late: ['En retard', 'warning'], half_day: ['Demi-journée', 'info'],
  absent: ['Absent', 'danger'], on_leave: ['Absence autorisée', 'info'], mission: ['En mission', 'purple'],
  holiday: ['Férié', 'muted'],
};

export const ATTENDANCE_SOURCE = { portail: 'Portail', mobile: 'Mobile (GPS)', biometrie: 'Biométrie', manuel: 'Saisie RH', cloture: 'Clôture' };

export const PRIORITY = { low: ['Basse', 'muted'], normal: ['Normale', 'info'], high: ['Haute', 'warning'], urgent: ['Urgente', 'danger'] };

export const CATEGORY = { absence: 'Absences', carriere: 'Carrière', formation: 'Formation', administratif: 'Administratif' };

export const ASSIGNEE = {
  chef_structure: 'Responsable de la structure', chef_superieur: 'Responsable supérieur', drh_institution: 'DRH de l’institution',
  drh_destination: 'DRH d’accueil', structure: 'Structure désignée', pilotage: 'Pilotage (SGG / Présidence)',
};

export const ANOMALY = {
  inconnu: ['Matricule inconnu du référentiel', 'danger'],
  doublon: ['Paiement en double', 'danger'],
  position_non_payable: ['Payé hors position rémunérée', 'danger'],
  ecart_salaire: ['Écart de salaire de base', 'warning'],
  non_paye: ['Agent actif non payé', 'info'],
  sans_presence: ['Aucune présence sur la période', 'warning'],
  non_enrole: ['Non enrôlé en biométrie', 'muted'],
};

export const ENROLLMENT_STATUS = {
  requested: ['Demandée', 'warning'], validated: ['Validée', 'success'], rejected: ['Refusée', 'danger'],
  attended: ['Suivie', 'info'], certified: ['Certifiée', 'success'], absent: ['Absent', 'danger'], cancelled: ['Annulée', 'muted'],
};

/** Export CSV compatible Excel (séparateur ;). */
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

/** Lit un fichier local en data URL (base64) pour l'envoyer à l'API. */
export const readFile = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});
