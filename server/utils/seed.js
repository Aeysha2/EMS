/* Demo data for the Ministry of Civil Service EMS.
 * Usage: npm run seed   (⚠ wipes every table first) */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { addDays, businessDaysBetween, toISODate } from './dates.js';
import { migrate } from './migrate.js';
import { computePayslip } from './payroll.js';

const q = (text, params) => pool.query(text, params);

const DEPARTMENTS = [
  ['Secrétariat Général', 'SG', 180000000],
  ['Direction des Ressources Humaines', 'DRH', 250000000],
  ['Direction de la Gestion des Carrières', 'DGC', 160000000],
  ['Direction des Pensions et de la Retraite', 'DPR', 120000000],
  ['Direction des Affaires Financières', 'DAF', 140000000],
  ['Direction des Systèmes d’Information', 'DSI', 110000000],
  ['Bureau du Courrier et de l’Accueil', 'BCA', 60000000],
];

// [name, dept code, designation, grade, salary, role?, email?]
const PEOPLE = [
  ['Aïcha Ndiaye', 'SG', 'Secrétaire Générale', 'A1', 1250000, 'admin', 'admin@ems.gov'],
  ['Moussa Diallo', 'DRH', 'Directeur des Ressources Humaines', 'A1', 980000, 'hr', 'rh@ems.gov'],
  ['Fatou Sow', 'DRH', 'Chargée de la paie', 'A2', 620000],
  ['Ibrahima Traoré', 'DGC', 'Directeur de la Gestion des Carrières', 'A1', 910000],
  ['Awa Koné', 'DGC', 'Gestionnaire des carrières', 'A3', 480000, 'employee', 'agent@ems.gov'],
  ['Cheikh Mbaye', 'DGC', 'Gestionnaire des carrières', 'B1', 390000],
  ['Mariama Bah', 'DPR', 'Directrice des Pensions', 'A1', 890000],
  ['Oumar Sy', 'DPR', 'Liquidateur de pensions', 'A3', 450000],
  ['Khady Fall', 'DAF', 'Directrice des Affaires Financières', 'A1', 930000],
  ['Abdoulaye Camara', 'DAF', 'Comptable', 'B1', 410000],
  ['Nafissatou Diop', 'DSI', 'Responsable informatique', 'A2', 760000],
  ['Jean-Baptiste Mendy', 'DSI', 'Développeur', 'A3', 540000],
  ['Rokhaya Gueye', 'BCA', 'Cheffe du Bureau Courrier', 'B1', 420000],
  ['Pape Seck', 'BCA', 'Agent d’accueil', 'C1', 260000],
  ['Aminata Cissé', 'DRH', 'Chargée du recrutement', 'A3', 500000],
  ['Lamine Faye', 'DGC', 'Contrôleur', 'B2', 350000],
];
const MANAGERS = { SG: 0, DRH: 1, DGC: 3, DPR: 6, DAF: 8, DSI: 10, BCA: 12 };

const REQUEST_TYPES = [
  ['REC', 'Recrutement / Intégration', 60, 'Diplômes, acte de naissance, casier judiciaire, certificat médical'],
  ['TIT', 'Titularisation', 45, 'Arrêté de nomination, rapport de stage, fiche de notation'],
  ['AVA', 'Avancement d’échelon / de grade', 30, 'Fiches de notation des 2 dernières années'],
  ['REC-L', 'Reclassement', 45, 'Nouveau diplôme, arrêté de nomination'],
  ['DIS', 'Mise en disponibilité', 21, 'Demande manuscrite, avis du supérieur hiérarchique'],
  ['DET', 'Détachement', 30, 'Lettre d’accueil de l’organisme, avis hiérarchique'],
  ['MUT', 'Mutation / Affectation', 21, 'Demande motivée, avis des deux structures'],
  ['RET', 'Retraite / Liquidation de pension', 90, 'Relevé de services, bulletins de salaire, pièces d’état civil'],
  ['ATT', 'Attestation / Acte administratif', 7, 'Pièce d’identité'],
];
const DEPOSIT_TYPES = [
  ['Dépôt physique au guichet', 'Remis en main propre au Bureau du Courrier'],
  ['Courrier postal', 'Reçu par voie postale'],
  ['Plateforme en ligne', 'Déposé via le portail e-services'],
  ['Transmission par la structure employeur', 'Bordereau d’envoi du ministère d’origine'],
];
const DEFAULT_CIRCUIT = [
  ['Enregistrement et contrôle de recevabilité', 'BCA', 2],
  ['Imputation par le Secrétariat Général', 'SG', 2],
  ['Instruction par le service compétent', 'DGC', 10],
  ['Contrôle et validation du Directeur', 'DGC', 5],
  ['Visa financier', 'DAF', 5],
  ['Signature et notification', 'SG', 3],
];
const PENSION_CIRCUIT = [
  ['Enregistrement et contrôle de recevabilité', 'BCA', 2],
  ['Imputation par le Secrétariat Général', 'SG', 2],
  ['Reconstitution de carrière', 'DGC', 15],
  ['Liquidation de la pension', 'DPR', 20],
  ['Visa financier', 'DAF', 7],
  ['Signature du titre de pension', 'SG', 5],
];

const seed = async () => {
  await migrate();
  await q(`TRUNCATE documents, project_history, projects, circuit_steps, request_types, deposit_types,
           activity_logs, announcements, notifications, performance_reviews, payrolls, leaves, attendance,
           users, employees, departments RESTART IDENTITY CASCADE`);
  await q('ALTER SEQUENCE project_reference_seq RESTART WITH 1');

  const dept = {};
  for (const [name, code, budget] of DEPARTMENTS) {
    const { rows } = await q('INSERT INTO departments (name, code, budget) VALUES ($1,$2,$3) RETURNING id', [name, code, budget]);
    dept[code] = rows[0].id;
  }

  const today = toISODate();
  const emp = [];
  for (const [i, [name, code, designation, grade, salary, role, email]] of PEOPLE.entries()) {
    const joined = addDays(today, -(200 + i * 190));
    const mail = email || `${name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@ems.gov`;
    const { rows } = await q(
      `INSERT INTO employees (employee_code, matricule, full_name, email, phone, department_id, designation, grade,
                              date_of_joining, date_of_birth, salary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [`EMP${101 + i}`, `MAT-${String(502310 + i * 37)}`, name, mail, `+221 77 ${String(1000000 + i * 45321).slice(0, 3)} ${String(10 + i).padStart(2, '0')} ${String(30 + i)}`,
        dept[code], designation, grade, joined, addDays('1975-03-12', i * 400), salary]
    );
    emp.push({ id: rows[0].id, name, code, email: mail, salary });
    if (role) {
      const pw = { admin: 'Admin@123', hr: 'Rh@12345', employee: 'Agent@123' }[role];
      await q('INSERT INTO users (name, email, password_hash, role, employee_id) VALUES ($1,$2,$3,$4,$5)',
        [name, mail, await bcrypt.hash(pw, 10), role, rows[0].id]);
    }
  }
  // Every other employee also gets a login (password: Agent@123)
  const hash = await bcrypt.hash('Agent@123', 10);
  for (const e of emp) {
    await q(`INSERT INTO users (name, email, password_hash, role, employee_id) VALUES ($1,$2,$3,'employee',$4)
             ON CONFLICT DO NOTHING`, [e.name, e.email, hash, e.id]);
  }
  for (const [code, idx] of Object.entries(MANAGERS)) {
    await q('UPDATE departments SET manager_id = $1 WHERE id = $2', [emp[idx].id, dept[code]]);
  }
  const users = Object.fromEntries((await q('SELECT id, employee_id FROM users')).rows.map((u) => [u.employee_id, u.id]));
  const adminUser = users[emp[0].id];
  const hrUser = users[emp[1].id];

  // Attendance over the last 30 days (weekdays), deterministic pseudo-random
  let seedN = 7;
  const rnd = () => { seedN = (seedN * 9301 + 49297) % 233280; return seedN / 233280; };
  for (let d = 30; d >= 1; d -= 1) {
    const day = addDays(today, -d);
    const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    for (const e of emp) {
      const r = rnd();
      if (r < 0.05) {
        await q(`INSERT INTO attendance (employee_id, work_date, status) VALUES ($1,$2,'absent')`, [e.id, day]);
        continue;
      }
      const inMin = 7 * 60 + 40 + Math.floor(rnd() * (r > 0.85 ? 80 : 30));
      const outMin = 16 * 60 + 30 + Math.floor(rnd() * 150);
      const ci = new Date(`${day}T00:00:00`); ci.setMinutes(inMin);
      const co = new Date(`${day}T00:00:00`); co.setMinutes(outMin);
      const hours = Math.round(((outMin - inMin) / 60) * 100) / 100;
      await q(
        `INSERT INTO attendance (employee_id, work_date, check_in, check_out, working_hours, overtime, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [e.id, day, ci, co, hours, Math.max(0, Math.round((hours - 8) * 100) / 100), inMin > 8 * 60 + 15 ? 'late' : 'present']
      );
    }
  }

  // Today: most agents have already checked in (demo accounts are left free to try the check-in)
  const todayWd = new Date(`${today}T00:00:00Z`).getUTCDay();
  if (todayWd !== 0 && todayWd !== 6) {
    for (const [i, e] of emp.entries()) {
      if ([0, 1, 4, 13].includes(i)) continue; // admin, hr, agent demo accounts, and an agent on leave
      if (i === 9) continue; // one missing check-in
      const ci = new Date(`${today}T00:00:00`); ci.setMinutes(7 * 60 + 45 + ((i * 7) % 40));
      await q(`INSERT INTO attendance (employee_id, work_date, check_in, status) VALUES ($1,$2,$3,$4)`,
        [e.id, today, ci, ci.getHours() * 60 + ci.getMinutes() > 8 * 60 + 15 ? 'late' : 'present']);
    }
  }

  // Leaves
  const leaveRows = [
    [emp[4].id, 'paid', addDays(today, 10), addDays(today, 16), 'pending', 'Congé annuel'],
    [emp[5].id, 'sick', addDays(today, -12), addDays(today, -10), 'approved', 'Certificat médical fourni'],
    [emp[7].id, 'casual', addDays(today, 3), addDays(today, 4), 'pending', 'Événement familial'],
    [emp[9].id, 'unpaid', addDays(today, -40), addDays(today, -36), 'approved', 'Convenance personnelle'],
    [emp[13].id, 'paid', addDays(today, -1), addDays(today, 5), 'approved', 'Congé annuel'],
    [emp[11].id, 'casual', addDays(today, -20), addDays(today, -20), 'rejected', 'Déménagement'],
  ];
  for (const [id, type, s, e, status, reason] of leaveRows) {
    const days = businessDaysBetween(s, e) || 1;
    await q(
      `INSERT INTO leaves (employee_id, leave_type, start_date, end_date, days, reason, status, reviewed_by, reviewed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, type, s, e, days, reason, status, status === 'pending' ? null : hrUser, status === 'pending' ? null : new Date()]
    );
    const col = { casual: 'casual_balance', sick: 'sick_balance', paid: 'paid_balance' }[type];
    if (status === 'approved' && col) await q(`UPDATE employees SET ${col} = ${col} - $1 WHERE id = $2`, [days, id]);
  }

  // Payroll for the two previous months
  const now = new Date();
  for (let back = 2; back >= 1; back -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    for (const e of emp) {
      const s = computePayslip({ basic: e.salary, year, month, overtimeHours: Math.round(rnd() * 12), bonus: e.id % 5 === 0 ? 50000 : 0 });
      await q(
        `INSERT INTO payrolls (employee_id, period_year, period_month, basic, allowances, bonuses, overtime_pay, gross,
                               deductions, tax, net, details, status, generated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [e.id, year, month, s.basic, s.allowances, s.bonuses, s.overtimePay, s.gross, s.deductions, s.tax, s.net,
          JSON.stringify(s.details), back === 2 ? 'paid' : 'processed', hrUser]
      );
    }
  }

  // Performance reviews
  const reviews = [
    [emp[4].id, '2025 – Annuel', addDays(today, -200), 4, 'Très bonne maîtrise des dossiers de carrière.', [{ title: 'Réduire le délai moyen d’instruction à 20 jours', progress: 70, done: false }, { title: 'Former deux nouveaux agents', progress: 100, done: true }]],
    [emp[4].id, '2026 – S1', addDays(today, -30), 4.5, 'Progression nette, excellente relation avec les usagers.', [{ title: 'Numériser les dossiers de 2020', progress: 40, done: false }]],
    [emp[5].id, '2026 – S1', addDays(today, -28), 3, 'Doit améliorer la ponctualité et le suivi des délais.', [{ title: 'Respecter les échéances des dossiers', progress: 20, done: false }]],
    [emp[11].id, '2026 – S1', addDays(today, -25), 4.2, 'A livré le module de pointage mobile.', [{ title: 'Mettre en place la sauvegarde automatisée', progress: 100, done: true }]],
  ];
  for (const [id, period, date, rating, feedback, goals] of reviews) {
    await q(
      `INSERT INTO performance_reviews (employee_id, reviewer_id, period, review_date, rating, feedback, goals, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'completed')`,
      [id, hrUser, period, date, rating, feedback, JSON.stringify(goals)]
    );
  }
  await q(`INSERT INTO performance_reviews (employee_id, reviewer_id, period, review_date, status)
           VALUES ($1,$2,'2026 – S2',$3,'scheduled')`, [emp[7].id, hrUser, addDays(today, 12)]);

  // Dossier configuration
  const rt = {};
  for (const [code, name, sla, docs] of REQUEST_TYPES) {
    const { rows } = await q('INSERT INTO request_types (code, name, sla_days, required_documents) VALUES ($1,$2,$3,$4) RETURNING id', [code, name, sla, docs]);
    rt[code] = rows[0].id;
  }
  const dt = [];
  for (const [name, desc] of DEPOSIT_TYPES) {
    const { rows } = await q('INSERT INTO deposit_types (name, description) VALUES ($1,$2) RETURNING id', [name, desc]);
    dt.push(rows[0].id);
  }
  for (const [i, [name, code, days]] of DEFAULT_CIRCUIT.entries()) {
    await q('INSERT INTO circuit_steps (request_type_id, step_order, name, department_id, expected_days) VALUES (NULL,$1,$2,$3,$4)', [i + 1, name, dept[code], days]);
  }
  for (const [i, [name, code, days]] of PENSION_CIRCUIT.entries()) {
    await q('INSERT INTO circuit_steps (request_type_id, step_order, name, department_id, expected_days) VALUES ($1,$2,$3,$4,$5)', [rt.RET, i + 1, name, dept[code], days]);
  }

  // Dossiers: [title, type, deposit, applicant, structure, daysAgo, step, status, agentIdx, priority]
  const dossiers = [
    ['Demande d’avancement au grade A2', 'AVA', 0, 'Seydou Konaté', 'Ministère de la Santé', 45, 4, 'in_progress', 3, 'normal'],
    ['Titularisation après stage probatoire', 'TIT', 3, 'Adja Thiam', 'Ministère de l’Éducation', 20, 3, 'in_progress', 4, 'high'],
    ['Liquidation de pension de retraite', 'RET', 0, 'Mamadou Ba', 'Ministère des Finances', 60, 4, 'in_progress', 7, 'normal'],
    ['Demande de mise en disponibilité', 'DIS', 2, 'Coumba Ndour', 'Ministère de l’Agriculture', 35, 3, 'awaiting_documents', 4, 'normal'],
    ['Attestation de présence au poste', 'ATT', 0, 'Babacar Diouf', 'Ministère de la Fonction Publique', 12, 6, 'completed', 4, 'low'],
    ['Mutation vers la région de Thiès', 'MUT', 1, 'Ndeye Sarr', 'Ministère de l’Intérieur', 5, 2, 'in_progress', 12, 'normal'],
    ['Recrutement sur titre – Ingénieur statisticien', 'REC', 2, 'Youssou Kane', 'Agence Nationale de la Statistique', 3, 1, 'in_progress', 13, 'urgent'],
    ['Reclassement suite à obtention de master', 'REC-L', 3, 'Astou Mbengue', 'Ministère de la Justice', 50, 3, 'rejected', 5, 'normal'],
    ['Détachement auprès d’une organisation internationale', 'DET', 0, 'Ousmane Gaye', 'Ministère des Affaires Étrangères', 1, 1, 'in_progress', null, 'high'],
  ];
  const circuitFor = (code) => (code === 'RET' ? PENSION_CIRCUIT : DEFAULT_CIRCUIT);
  const bca = users[emp[12].id];
  for (const [i, [title, type, dep, applicant, structure, ago, step, status, agentIdx, priority]] of dossiers.entries()) {
    const depositDate = addDays(today, -ago);
    const sla = REQUEST_TYPES.find((r) => r[0] === type)[2];
    const circuit = circuitFor(type);
    const agent = agentIdx !== null ? emp[agentIdx].id : null;
    const closed = ['completed', 'rejected'].includes(status);
    const { rows } = await q(
      `INSERT INTO projects (reference, title, request_type_id, deposit_type_id, applicant_name, applicant_matricule,
         applicant_structure, applicant_phone, deposit_date, due_date, priority, current_step, status, agent_id, department_id,
         created_by, created_at, closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [`MFP-${now.getFullYear()}-${String(i + 1).padStart(5, '0')}`, title, rt[type], dt[dep], applicant,
        `MAT-${600100 + i * 13}`, structure, '+221 76 000 00 0' + i, depositDate, addDays(depositDate, sla), priority, step, status,
        agent, dept[circuit[step - 1][1]], bca, `${depositDate}T09:15:00`, closed ? `${addDays(depositDate, Math.min(ago, 10))}T15:00:00` : null]
    );
    const pid = rows[0].id;
    await q('INSERT INTO project_history (project_id, step_order, step_name, action, comment, user_id, created_at) VALUES ($1,1,$2,$3,$4,$5,$6)',
      [pid, circuit[0][0], 'creation', 'Dossier reçu et enregistré', bca, `${depositDate}T09:15:00`]);
    for (let s = 2; s <= step; s += 1) {
      await q(
        `INSERT INTO project_history (project_id, step_order, step_name, action, to_agent, comment, user_id, created_at)
         VALUES ($1,$2,$3,'advance',$4,$5,$6,$7)`,
        [pid, s, circuit[s - 1][0], s === step ? agent : null, s === 2 ? 'Dossier complet et recevable' : 'Avis favorable',
          adminUser, `${addDays(depositDate, Math.min(ago, s * 2))}T10:00:00`]
      );
    }
    if (status === 'awaiting_documents') {
      await q(`INSERT INTO project_history (project_id, step_order, step_name, action, comment, user_id) VALUES ($1,$2,$3,'request_documents',$4,$5)`,
        [pid, step, circuit[step - 1][0], 'Avis du supérieur hiérarchique manquant', users[emp[4].id]]);
    }
    if (status === 'rejected') {
      await q(`INSERT INTO project_history (project_id, step_order, step_name, action, comment, user_id) VALUES ($1,$2,$3,'reject',$4,$5)`,
        [pid, step, circuit[step - 1][0], 'Diplôme non reconnu par la commission d’équivalence', users[emp[5].id]]);
    }
    if (status === 'completed') {
      await q(`INSERT INTO project_history (project_id, step_order, step_name, action, comment, user_id) VALUES ($1,$2,$3,'close',$4,$5)`,
        [pid, step, circuit[step - 1][0], 'Attestation signée et remise à l’intéressé', adminUser]);
    }
  }
  await q(`SELECT setval('project_reference_seq', $1)`, [dossiers.length]);

  // Announcements, notifications, activity
  await q(`INSERT INTO announcements (title, content, event_date, author_id) VALUES
    ('Séminaire annuel de la Fonction Publique', 'Le séminaire se tiendra au Centre International de Conférences. Présence obligatoire des directeurs.', $1, $2),
    ('Mise en service du pointage mobile', 'Le pointage par téléphone avec géolocalisation est désormais disponible pour tous les agents.', NULL, $3)`,
  [addDays(today, 9), adminUser, hrUser]);
  await q(`INSERT INTO notifications (user_id, type, title, message, link)
           SELECT id, 'announcement', 'Annonce : Mise en service du pointage mobile', 'Le pointage par téléphone est disponible.', '/announcements' FROM users`);
  await q(`INSERT INTO activity_logs (user_id, action, entity, details) VALUES
    ($1, 'Génération de la paie', 'payroll', 'Paie du mois précédent générée'),
    ($2, 'Initialisation', 'system', 'Données de démonstration chargées')`, [hrUser, adminUser]);

  console.log('✅ Données de démonstration chargées');
  console.log('   Admin    : admin@ems.gov / Admin@123');
  console.log('   RH       : rh@ems.gov / Rh@12345');
  console.log('   Employé  : agent@ems.gov / Agent@123  (tous les autres agents : <email> / Agent@123)');
};

seed()
  .catch((err) => { console.error('❌ Seed échoué :', err); process.exitCode = 1; })
  .finally(() => pool.end());
