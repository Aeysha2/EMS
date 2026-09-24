/* Données de démonstration du SIGRH national (Présidence, SGG, ministères).
 * Usage : npm run seed   (⚠ vide toutes les tables)
 * Toutes les personnes et tous les numéros sont fictifs. */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../config/db.js';
import { loadUserContext } from '../middleware/auth.js';
import { findEmployeeById } from '../models/Employee.js';
import { createRequest, performAction } from '../models/Workflow.js';
import { logActivity } from './audit.js';
import { blindIndex, encrypt, sha256 } from './crypto.js';
import { addDays, toISODate } from './dates.js';
import { migrate } from './migrate.js';
import { computePayslip } from './payroll.js';

const q = (text, params) => pool.query(text, params);
export const DEMO_PASSWORD = 'Sigrh@2026!';

// [code, nom, sigle, type, parent, région]
const STRUCTURES = [
  ['PR', 'Présidence de la République', 'PR', 'presidence', null, 'Dakar'],
  ['PR-SG', 'Secrétariat général de la Présidence', 'SGPR', 'direction', 'PR', 'Dakar'],
  ['PR-DRH', 'Direction des Ressources humaines de la Présidence', 'DRH-PR', 'direction', 'PR', 'Dakar'],
  ['SGG', 'Secrétariat Général du Gouvernement', 'SGG', 'sgg', null, 'Dakar'],
  ['SGG-DCI', 'Direction de la Coordination interministérielle', 'DCI', 'direction', 'SGG', 'Dakar'],
  ['SGG-DSI', 'Direction des Systèmes d’Information', 'DSI', 'direction', 'SGG', 'Dakar'],
  ['SGG-DRH', 'Direction des Ressources humaines du SGG', 'DRH-SGG', 'direction', 'SGG', 'Dakar'],
  ['MFP', 'Ministère de la Fonction publique et de la Réforme du Service public', 'MFPRSP', 'ministere', null, 'Dakar'],
  ['MFP-DGFP', 'Direction générale de la Fonction publique', 'DGFP', 'direction', 'MFP', 'Dakar'],
  ['MFP-DGC', 'Direction de la Gestion des carrières', 'DGC', 'service', 'MFP-DGFP', 'Dakar'],
  ['MFP-DRH', 'Direction des Ressources humaines', 'DRH-MFP', 'direction', 'MFP', 'Dakar'],
  ['MFP-BCA', 'Bureau du courrier et de l’accueil', 'BCA', 'service', 'MFP', 'Dakar'],
  ['MFB', 'Ministère des Finances et du Budget', 'MFB', 'ministere', null, 'Dakar'],
  ['MFB-DS', 'Direction de la Solde', 'DS', 'direction', 'MFB', 'Dakar'],
  ['MFB-DGB', 'Direction générale du Budget', 'DGB', 'direction', 'MFB', 'Dakar'],
  ['MFB-DRH', 'Direction des Ressources humaines', 'DRH-MFB', 'direction', 'MFB', 'Dakar'],
  ['MEN', 'Ministère de l’Éducation nationale', 'MEN', 'ministere', null, 'Dakar'],
  ['MEN-DRH', 'Direction des Ressources humaines', 'DRH-MEN', 'direction', 'MEN', 'Dakar'],
  ['MEN-IA-DKR', 'Inspection d’académie de Dakar', 'IA Dakar', 'deconcentree', 'MEN', 'Dakar'],
  ['MEN-IA-THS', 'Inspection d’académie de Thiès', 'IA Thiès', 'deconcentree', 'MEN', 'Thiès'],
  ['MSAS', 'Ministère de la Santé et de l’Action sociale', 'MSAS', 'ministere', null, 'Dakar'],
  ['MSAS-DRH', 'Direction des Ressources humaines', 'DRH-MSAS', 'direction', 'MSAS', 'Dakar'],
  ['MSAS-RM-DKR', 'Région médicale de Dakar', 'RM Dakar', 'deconcentree', 'MSAS', 'Dakar'],
  ['MSAS-RM-ZIG', 'Région médicale de Ziguinchor', 'RM Ziguinchor', 'deconcentree', 'MSAS', 'Ziguinchor'],
];

const CORPS = [
  ['ADMCIV', 'Administrateurs civils', 'A'], ['INSTRE', 'Inspecteurs du Trésor', 'A'],
  ['PES', 'Professeurs d’enseignement secondaire', 'A'], ['MED', 'Médecins', 'A'],
  ['INGINF', 'Ingénieurs informaticiens', 'A'], ['SECADM', 'Secrétaires d’administration', 'B'],
  ['CONTR', 'Contrôleurs du Trésor', 'B'], ['INFIRM', 'Infirmiers d’État', 'B'], ['INSTIT', 'Instituteurs', 'B'],
  ['AGADM', 'Agents d’administration', 'C'], ['CHAUF', 'Chauffeurs de l’administration', 'D'],
];

// Comptes de démonstration : [clé, prénom, nom, sexe, structure, fonction, corps, rôle, chef de ?]
const KEY_PEOPLE = [
  ['pilotage.presidence', 'Mame Diarra', 'SARR', 'F', 'PR-SG', 'Secrétaire générale de la Présidence', 'ADMCIV', 'pilotage', 'PR-SG'],
  ['drh.presidence', 'Ousmane', 'DIENG', 'M', 'PR-DRH', 'Directeur des ressources humaines', 'ADMCIV', 'gestionnaire_rh', 'PR-DRH'],
  ['pilotage.sgg', 'Abdou Karim', 'FALL', 'M', 'SGG-DCI', 'Directeur de la coordination interministérielle', 'ADMCIV', 'pilotage', 'SGG-DCI'],
  ['admin.dsi', 'Ndeye Fatou', 'NDIAYE', 'F', 'SGG-DSI', 'Directrice des systèmes d’information', 'INGINF', 'admin_dsi', 'SGG-DSI'],
  ['drh.sgg', 'Babacar', 'GUEYE', 'M', 'SGG-DRH', 'Chef de la division du personnel', 'ADMCIV', 'gestionnaire_rh', 'SGG-DRH'],
  ['dgfp', 'Aïssatou', 'BA', 'F', 'MFP-DGFP', 'Directrice générale de la Fonction publique', 'ADMCIV', 'agent', 'MFP-DGFP'],
  ['chef.dgc', 'Ibrahima', 'SOW', 'M', 'MFP-DGC', 'Directeur de la gestion des carrières', 'ADMCIV', 'agent', 'MFP-DGC'],
  ['agent', 'Awa', 'KONÉ', 'F', 'MFP-DGC', 'Gestionnaire des carrières', 'SECADM', 'agent', null],
  ['drh.mfp', 'Moussa', 'DIALLO', 'M', 'MFP-DRH', 'Directeur des ressources humaines', 'ADMCIV', 'gestionnaire_rh', 'MFP-DRH'],
  ['drh.finances', 'Khady', 'FAYE', 'F', 'MFB-DRH', 'Directrice des ressources humaines', 'INSTRE', 'gestionnaire_rh', 'MFB-DRH'],
  ['solde', 'Pape Samba', 'MBAYE', 'M', 'MFB-DS', 'Directeur de la Solde', 'INSTRE', 'agent', 'MFB-DS'],
  ['drh.education', 'Coumba', 'NDOUR', 'F', 'MEN-DRH', 'Directrice des ressources humaines', 'ADMCIV', 'gestionnaire_rh', 'MEN-DRH'],
  ['ia.dakar', 'Mamadou', 'CISSÉ', 'M', 'MEN-IA-DKR', 'Inspecteur d’académie', 'PES', 'agent', 'MEN-IA-DKR'],
  ['enseignant', 'Fatou', 'DIOP', 'F', 'MEN-IA-DKR', 'Professeure de mathématiques', 'PES', 'agent', null],
  ['drh.sante', 'Rokhaya', 'SECK', 'F', 'MSAS-DRH', 'Directrice des ressources humaines', 'ADMCIV', 'gestionnaire_rh', 'MSAS-DRH'],
];

const FIRST_M = ['Cheikh', 'Modou', 'Alioune', 'Lamine', 'Serigne', 'Amadou', 'Saliou', 'Malick', 'Idrissa', 'Boubacar',
  'Mouhamed', 'El Hadji', 'Assane', 'Youssou', 'Demba', 'Omar'];
const FIRST_F = ['Aminata', 'Mariama', 'Astou', 'Ndeye', 'Khadija', 'Sokhna', 'Adja', 'Bineta', 'Seynabou', 'Nafissatou',
  'Oumy', 'Yacine', 'Dieynaba', 'Maimouna'];
const LAST = ['DIOUF', 'THIAM', 'KANE', 'CAMARA', 'SY', 'MBENGUE', 'TOURÉ', 'GAYE', 'SAMB', 'NIANG', 'BÂ', 'DIAGNE',
  'SAGNA', 'MANÉ', 'BADJI', 'LY', 'DIATTA', 'TALL', 'WADE', 'KA', 'NDAO', 'DRAMÉ'];
// Effectif supplémentaire par structure : [structure, nombre, corps possibles, fonctions]
const STAFF = [
  ['PR-SG', 3, ['ADMCIV', 'SECADM', 'CHAUF'], ['Conseiller technique', 'Assistant de direction', 'Chauffeur']],
  ['PR-DRH', 2, ['SECADM', 'AGADM'], ['Gestionnaire du personnel', 'Agent administratif']],
  ['SGG-DCI', 2, ['ADMCIV', 'SECADM'], ['Chargé d’études', 'Assistante']],
  ['SGG-DSI', 3, ['INGINF', 'INGINF', 'SECADM'], ['Ingénieur systèmes', 'Administrateur réseau', 'Chef de projet SIGRH']],
  ['MFP-DGFP', 2, ['ADMCIV', 'SECADM'], ['Conseiller juridique', 'Secrétaire']],
  ['MFP-DGC', 4, ['SECADM', 'SECADM', 'AGADM', 'ADMCIV'], ['Gestionnaire des carrières', 'Contrôleur', 'Agent de saisie', 'Chef de bureau']],
  ['MFP-DRH', 3, ['SECADM', 'AGADM', 'CHAUF'], ['Gestionnaire RH', 'Agent administratif', 'Chauffeur']],
  ['MFP-BCA', 2, ['AGADM', 'AGADM'], ['Agent d’accueil', 'Agent du courrier']],
  ['MFB-DS', 4, ['INSTRE', 'CONTR', 'CONTR', 'AGADM'], ['Chef de division', 'Contrôleur de solde', 'Liquidateur', 'Agent de saisie']],
  ['MFB-DGB', 3, ['INSTRE', 'CONTR', 'SECADM'], ['Analyste budgétaire', 'Contrôleur', 'Assistante']],
  ['MFB-DRH', 2, ['SECADM', 'AGADM'], ['Gestionnaire RH', 'Agent administratif']],
  ['MEN-DRH', 3, ['ADMCIV', 'SECADM', 'AGADM'], ['Chef de bureau', 'Gestionnaire RH', 'Agent administratif']],
  ['MEN-IA-DKR', 6, ['PES', 'PES', 'INSTIT', 'INSTIT', 'INSTIT', 'AGADM'], ['Professeur', 'Professeure', 'Instituteur', 'Institutrice', 'Directeur d’école', 'Secrétaire']],
  ['MEN-IA-THS', 5, ['PES', 'INSTIT', 'INSTIT', 'INSTIT', 'AGADM'], ['Professeur', 'Instituteur', 'Institutrice', 'Directeur d’école', 'Agent administratif']],
  ['MSAS-DRH', 2, ['SECADM', 'AGADM'], ['Gestionnaire RH', 'Agent administratif']],
  ['MSAS-RM-DKR', 5, ['MED', 'MED', 'INFIRM', 'INFIRM', 'CHAUF'], ['Médecin', 'Médecin-chef', 'Infirmier d’État', 'Infirmière d’État', 'Ambulancier']],
  ['MSAS-RM-ZIG', 4, ['MED', 'INFIRM', 'INFIRM', 'AGADM'], ['Médecin-chef de district', 'Infirmier', 'Sage-femme d’État', 'Agent administratif']],
];
const SALARY = { A: 850000, B: 480000, C: 290000, D: 190000 };
const GRADES = { A: ['Principal', 'Exceptionnel', '1re classe'], B: ['1re classe', '2e classe'], C: ['2e classe', '3e classe'], D: ['Classe unique'] };

const WORKFLOWS = [
  // [code, nom, catégorie, effet, délai, agent peut déposer, pièces, étapes [nom, valideur, structure, jours]]
  ['CONGE', 'Congé et permission d’absence', 'absence', 'leave', 10, true, null,
    [['Avis du supérieur hiérarchique', 'chef_structure', null, 3], ['Validation de la DRH', 'drh_institution', null, 3]]],
  ['MISSION', 'Ordre de mission', 'absence', 'leave', 7, true, 'Termes de référence',
    [['Avis du supérieur hiérarchique', 'chef_structure', null, 2], ['Autorisation du directeur', 'chef_superieur', null, 2]]],
  ['FORMATION', 'Inscription à une formation', 'formation', 'formation', 15, true, null,
    [['Avis du supérieur hiérarchique', 'chef_structure', null, 3], ['Validation du plan de formation (DRH)', 'drh_institution', null, 5]]],
  ['MUTATION', 'Mutation / affectation', 'carriere', 'mutation', 45, true, 'Demande motivée, avis des structures',
    [['Avis du supérieur hiérarchique', 'chef_structure', null, 5], ['Avis de la DRH d’origine', 'drh_institution', null, 7],
      ['Accord de la DRH d’accueil', 'drh_destination', null, 7], ['Visa de la DGFP', 'structure', 'MFP-DGFP', 10]]],
  ['AVANCEMENT', 'Avancement d’échelon / promotion', 'carriere', 'avancement', 30, false, 'Fiches de notation',
    [['Instruction par la DRH', 'drh_institution', null, 10], ['Contrôle et visa de la DGFP', 'structure', 'MFP-DGFP', 15]]],
  ['NOMINATION', 'Nomination à une fonction', 'carriere', 'nomination', 30, false, 'Projet de décret ou d’arrêté',
    [['Proposition de la DRH', 'drh_institution', null, 5], ['Validation du Secrétariat Général du Gouvernement', 'pilotage', 'SGG', 15]]],
  ['DETACHEMENT', 'Détachement', 'carriere', 'position', 30, true, 'Lettre d’accueil de l’organisme',
    [['Avis du supérieur hiérarchique', 'chef_structure', null, 5], ['Instruction DRH', 'drh_institution', null, 7], ['Visa de la DGFP', 'structure', 'MFP-DGFP', 10]]],
  ['DISPONIBILITE', 'Mise en disponibilité', 'carriere', 'position', 21, true, 'Demande manuscrite',
    [['Avis du supérieur hiérarchique', 'chef_structure', null, 5], ['Instruction DRH', 'drh_institution', null, 7], ['Visa de la DGFP', 'structure', 'MFP-DGFP', 7]]],
  ['TITULARISATION', 'Titularisation', 'carriere', 'titularisation', 30, false, 'Rapport de fin de stage',
    [['Instruction DRH', 'drh_institution', null, 10], ['Visa de la DGFP', 'structure', 'MFP-DGFP', 15]]],
  ['RETRAITE', 'Admission à la retraite', 'carriere', 'retraite', 60, false, 'Relevé de services',
    [['Instruction DRH', 'drh_institution', null, 20], ['Visa de la DGFP', 'structure', 'MFP-DGFP', 20]]],
  ['ATTESTATION', 'Attestation / certificat administratif', 'administratif', 'none', 7, true, null,
    [['Établissement par la DRH', 'drh_institution', null, 5]]],
];

const LEAVE_TYPES = [
  // [code, libellé, quota annuel, jours ouvrés ?, justificatif ?, circuit]
  ['annuel', 'Congé annuel', 30, false, false, 'CONGE'],
  ['permission', 'Permission d’absence', 10, true, false, 'CONGE'],
  ['maladie', 'Congé de maladie', null, false, true, 'CONGE'],
  ['maternite', 'Congé de maternité', null, false, true, 'CONGE'],
  ['sans_solde', 'Congé sans solde', null, false, false, 'CONGE'],
  ['mission', 'Mission', null, false, false, 'MISSION'],
];

const TRAININGS = [
  ['ENA-MGP', 'Management public et conduite du changement', 'École nationale d’administration (ENA)', 'Management', 5, true],
  ['ENA-BP', 'Budget-programme et gestion axée sur les résultats', 'École nationale d’administration (ENA)', 'Finances publiques', 4, true],
  ['DSI-CYB', 'Sensibilisation à la cybersécurité et protection des données', 'Direction des Systèmes d’Information', 'Numérique', 1, false],
  ['DSI-SIGRH', 'Prise en main du SIGRH — gestionnaires RH', 'Direction des Systèmes d’Information', 'Numérique', 2, false],
  ['CFPA-LEAD', 'Leadership féminin dans l’administration', 'Centre de formation professionnelle', 'Management', 3, true],
];

// Générateur pseudo-aléatoire déterministe : mêmes données à chaque seed
let seedN = 20260924;
const rnd = () => { seedN = (seedN * 1103515245 + 12345) % 2147483648; return seedN / 2147483648; };
const pickOne = (arr) => arr[Math.floor(rnd() * arr.length)];

export const seed = async ({ quiet = false } = {}) => {
  await migrate();
  await q(`TRUNCATE documents, request_history, requests, workflow_steps, workflow_types, enrollments, training_sessions,
           trainings, leave_balances, leaves, leave_types, attendance, performance_reviews, payrolls, solde_lines,
           solde_imports, interop_logs, api_clients, import_rows, import_batches, record_changes, career_events,
           affectations, agent_diplomas, positions, notifications, announcements, activity_logs, structure_requests,
           users, employees, corps, structures RESTART IDENTITY CASCADE`);
  await q('ALTER SEQUENCE sigrh_agent_seq RESTART WITH 1');
  await q('ALTER SEQUENCE request_reference_seq RESTART WITH 1');
  const today = toISODate();
  const thisYear = Number(today.slice(0, 4));

  // ---- structures
  const S = {};
  for (const [code, name, sigle, type, parent, region] of STRUCTURES) {
    const parentId = parent ? S[parent].id : null;
    const inst = parent ? S[parent].institution_id : null;
    const { rows } = await q(
      `INSERT INTO structures (code, name, sigle, type, parent_id, institution_id, region) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, institution_id`, [code, name, sigle, type, parentId, inst, region]);
    if (!parent) await q('UPDATE structures SET institution_id = id WHERE id = $1', [rows[0].id]);
    S[code] = { id: rows[0].id, institution_id: parent ? inst : rows[0].id };
  }

  const C = {};
  for (const [code, name, h] of CORPS) {
    const { rows } = await q('INSERT INTO corps (code, name, hierarchie) VALUES ($1,$2,$3) RETURNING id', [code, name, h]);
    C[code] = { id: rows[0].id, h };
  }

  // ---- agents
  let n = 0;
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const people = [];
  const createAgent = async ({ first, last, sexe, structure, fonction, corps, overrides = {} }) => {
    n += 1;
    const h = C[corps].h;
    const age = overrides.age ?? 26 + Math.floor(rnd() * 33);
    const dob = addDays(today, -Math.floor(age * 365.25 + rnd() * 300));
    const entry = addDays(today, -Math.floor(Math.min(age - 23, 1 + rnd() * 30) * 365.25));
    const nin = `${sexe === 'M' ? 1 : 2}${String(754 + n * 37).padStart(3, '0')}${dob.slice(2, 4)}${String(100000 + n * 7919).slice(-6)}${n % 10}`
      .padEnd(13, '0').slice(0, 13);
    const sigrhId = `SN${String(n).padStart(8, '0')}`;
    const salary = Math.round((SALARY[h] * (0.85 + rnd() * 0.5)) / 1000) * 1000;
    const enrolled = overrides.enrolled ?? rnd() > 0.12;
    const email = overrides.email || `${first.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${last.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')}${n}@sigrh.test`;
    const row = {
      sigrh_id: sigrhId, matricule_solde: `${600000 + n * 13}${'ABCDEFGH'[n % 8]}`, nin_enc: encrypt(nin), nin_hash: blindIndex(nin),
      first_name: first, last_name: last, sexe, date_of_birth: dob, place_of_birth: pickOne(['Dakar', 'Thiès', 'Saint-Louis', 'Kaolack', 'Ziguinchor', 'Louga', 'Tambacounda', 'Diourbel']),
      marital_status: pickOne(['Marié(e)', 'Célibataire', 'Marié(e)', 'Divorcé(e)']), children_count: Math.floor(rnd() * 5),
      email, phone: `+221 7${Math.floor(rnd() * 8)} ${String(100 + n).slice(-3)} ${String(10 + (n % 90)).padStart(2, '0')} ${String(20 + (n % 70)).padStart(2, '0')}`,
      structure_id: S[structure].id, fonction, corps_id: C[corps].id, hierarchie: h, grade: pickOne(GRADES[h]),
      echelon: 1 + Math.floor(rnd() * 8), statut_emploi: 'fonctionnaire', position_statutaire: 'activite',
      date_entree_fp: entry, date_prise_service: addDays(entry, Math.floor(rnd() * 2000)), salary,
      biometric_id: enrolled ? `BIO-${String(n).padStart(5, '0')}` : null, biometric_enrolled_at: enrolled ? addDays(today, -200) : null,
      identity_verified_at: rnd() > 0.2 ? addDays(today, -150) : null, ...overrides.fields,
    };
    if (row.date_prise_service > today) row.date_prise_service = entry;
    const cols = Object.keys(row);
    const { rows } = await q(
      `INSERT INTO employees (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(row));
    const id = rows[0].id;
    await q('INSERT INTO affectations (employee_id, structure_id, fonction, start_date) VALUES ($1,$2,$3,$4)',
      [id, row.structure_id, fonction, row.date_prise_service]);
    await q(`INSERT INTO career_events (employee_id, type, effective_date, acte_reference, description)
             VALUES ($1,'recrutement',$2,$3,'Recrutement dans la fonction publique')`,
    [id, entry, `Arrêté n° ${1000 + n}/MFPRSP/DGFP`]);
    await q('INSERT INTO agent_diplomas (employee_id, title, level, school, year) VALUES ($1,$2,$3,$4,$5)',
      [id, { A: 'Master', B: 'Licence', C: 'Baccalauréat', D: 'BFEM' }[h], { A: 'Bac+5', B: 'Bac+3', C: 'Bac', D: 'BFEM' }[h],
        pickOne(['Université Cheikh Anta Diop', 'Université Gaston Berger', 'ENA', 'Université Assane Seck']),
        Number(entry.slice(0, 4)) - 1]);
    const person = { id, ...row, structure, corps };
    people.push(person);
    return person;
  };

  const K = {};
  for (const [key, first, last, sexe, structure, fonction, corps, role, heads] of KEY_PEOPLE) {
    const p = await createAgent({ first, last, sexe, structure, fonction, corps,
      overrides: { email: `${key}@sigrh.test`, enrolled: true, age: role === 'agent' && !heads ? 34 : 45 + Math.floor(rnd() * 12) } });
    K[key] = { ...p, role, heads };
    if (heads) await q('UPDATE structures SET head_agent_id = $1 WHERE id = $2', [p.id, S[heads].id]);
  }
  for (const [structure, count, corpsList, fonctions] of STAFF) {
    for (let i = 0; i < count; i += 1) {
      const sexe = rnd() > 0.62 ? 'F' : 'M';
      await createAgent({ first: pickOne(sexe === 'M' ? FIRST_M : FIRST_F), last: pickOne(LAST), sexe, structure,
        fonction: fonctions[i % fonctions.length], corps: corpsList[i % corpsList.length] });
    }
  }
  await q(`SELECT setval('sigrh_agent_seq', $1)`, [n]);
  // Chefs des structures sans responsable désigné (premier agent de catégorie A, sinon le premier)
  for (const [code] of STRUCTURES) {
    const { rows } = await q('SELECT head_agent_id FROM structures WHERE id = $1', [S[code].id]);
    if (rows[0].head_agent_id) continue;
    const staff = people.filter((p) => p.structure === code);
    const head = staff.find((p) => p.hierarchie === 'A') || staff[0];
    if (head) await q('UPDATE structures SET head_agent_id = $1 WHERE id = $2', [head.id, S[code].id]);
  }

  // Situations particulières (utiles au contrôle de cohérence avec la Solde)
  const others = people.filter((p) => !Object.values(K).some((k) => k.id === p.id));
  const retired = others.find((p) => p.structure === 'MEN-IA-THS');
  await q(`UPDATE employees SET position_statutaire = 'retraite' WHERE id = $1`, [retired.id]);
  await q(`INSERT INTO career_events (employee_id, type, effective_date, description) VALUES ($1,'retraite',$2,'Admission à la retraite')`,
    [retired.id, addDays(today, -95)]);
  const dispo = others.find((p) => p.structure === 'MFB-DGB');
  await q(`UPDATE employees SET position_statutaire = 'disponibilite' WHERE id = $1`, [dispo.id]);
  const detache = others.find((p) => p.structure === 'MSAS-RM-DKR');
  await q(`UPDATE employees SET position_statutaire = 'detachement' WHERE id = $1`, [detache.id]);
  const contractuels = others.filter((p) => p.hierarchie === 'D' || p.structure === 'SGG-DSI').slice(0, 3);
  for (const c of contractuels) await q(`UPDATE employees SET statut_emploi = 'contractuel' WHERE id = $1`, [c.id]);
  const stagiaire = others.find((p) => p.structure === 'MFP-DGC' && p.hierarchie === 'B');
  await q(`UPDATE employees SET statut_emploi = 'stagiaire', position_statutaire = 'stage' WHERE id = $1`, [stagiaire.id]);
  const salaryGap = others.find((p) => p.structure === 'MFB-DS');

  // ---- comptes
  for (const [key] of KEY_PEOPLE) {
    const k = K[key];
    const reviewed = key === 'drh.education' ? addDays(today, -260) : addDays(today, -20);
    const { rows } = await q(
      `INSERT INTO users (name, email, password_hash, role, employee_id, structure_id, rights_reviewed_at, last_login_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now() - interval '1 day') RETURNING id`,
      [`${k.first_name} ${k.last_name}`, `${key}@sigrh.test`, hash, k.role, k.id, k.structure_id, reviewed]);
    K[key].user_id = rows[0].id;
  }
  // Tous les autres agents ont un compte « agent » (portail libre-service)
  for (const p of others) {
    if (['retraite'].includes((await q('SELECT position_statutaire FROM employees WHERE id = $1', [p.id])).rows[0].position_statutaire)) continue;
    await q(`INSERT INTO users (name, email, password_hash, role, employee_id, structure_id)
             VALUES ($1,$2,$3,'agent',$4,$5)`, [`${p.first_name} ${p.last_name}`, p.email, hash, p.id, p.structure_id]);
  }

  // ---- postes
  for (const [code, count] of [['MFP-DGC', 6], ['MFB-DS', 5], ['MEN-IA-DKR', 8], ['SGG-DSI', 4]]) {
    const staff = people.filter((p) => p.structure === code);
    for (let i = 0; i < count; i += 1) {
      await q(`INSERT INTO positions (code, title, structure_id, corps_id, hierarchie, employee_id)
               VALUES ($1,$2,$3,$4,$5,$6)`,
      [`${code}-P${String(i + 1).padStart(2, '0')}`, staff[i]?.fonction || 'Poste vacant — à pourvoir', S[code].id,
        staff[i] ? C[staff[i].corps].id : null, staff[i]?.hierarchie || 'B', staff[i]?.id || null]);
    }
  }

  // ---- référentiels RH
  for (const [code, label, quota, business, doc, wf] of LEAVE_TYPES) {
    await q(`INSERT INTO leave_types (code, label, annual_quota, business_days, requires_document, workflow_code)
             VALUES ($1,$2,$3,$4,$5,$6)`, [code, label, quota, business, doc, wf]);
  }
  const W = {};
  for (const [code, name, category, effect, sla, agentCan, docs, steps] of WORKFLOWS) {
    const { rows } = await q(
      `INSERT INTO workflow_types (code, name, category, effect, sla_days, agent_can_submit, required_documents)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [code, name, category, effect, sla, agentCan, docs]);
    W[code] = rows[0];
    for (const [i, [sName, kind, sCode, days]] of steps.entries()) {
      await q(`INSERT INTO workflow_steps (type_id, step_order, name, assignee_kind, structure_id, expected_days)
               VALUES ($1,$2,$3,$4,$5,$6)`, [rows[0].id, i + 1, sName, kind, sCode ? S[sCode].id : null, days]);
    }
  }

  // ---- présences des 30 derniers jours (biométrie pour les agents enrôlés)
  const { rows: actives } = await q(`SELECT id, biometric_id FROM employees WHERE position_statutaire IN ('activite','stage')`);
  for (let d = 30; d >= 0; d -= 1) {
    const day = addDays(today, -d);
    const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    for (const e of actives) {
      if (d === 0 && [K.agent.id, K.enseignant.id, K['drh.mfp'].id].includes(e.id)) continue;
      const r = rnd();
      if (r < 0.05) { if (d > 0) await q(`INSERT INTO attendance (employee_id, work_date, status, source) VALUES ($1,$2,'absent','cloture')`, [e.id, day]); continue; }
      const inMin = 7 * 60 + 35 + Math.floor(rnd() * (r > 0.85 ? 75 : 35));
      const outMin = 16 * 60 + 15 + Math.floor(rnd() * 150);
      const ci = new Date(`${day}T00:00:00`); ci.setMinutes(inMin);
      const co = new Date(`${day}T00:00:00`); co.setMinutes(outMin);
      const hours = Math.round(((outMin - inMin) / 60) * 100) / 100;
      await q(`INSERT INTO attendance (employee_id, work_date, check_in, check_out, working_hours, overtime, status, source, device_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [e.id, day, ci, d === 0 ? null : co, d === 0 ? 0 : hours, d === 0 ? 0 : Math.max(0, Math.round((hours - 8) * 100) / 100),
        inMin > 8 * 60 + 15 ? 'late' : 'present', e.biometric_id ? 'biometrie' : 'portail', e.biometric_id ? 'TERM-DKR-01' : null]);
    }
  }
  // Un agent payé sans aucune présence le mois dernier (effectif physique à confirmer)
  const ghost = others.find((p) => p.structure === 'MSAS-RM-ZIG' && p.hierarchie !== 'A');
  await q(`DELETE FROM attendance WHERE employee_id = $1`, [ghost.id]);
  await q(`UPDATE employees SET biometric_id = NULL, biometric_enrolled_at = NULL WHERE id = $1`, [ghost.id]);

  // ---- circuits : demandes à différents stades (moteur réel, comme en production)
  const ctx = async (key) => loadUserContext(K[key].user_id);
  const req = async (key, typeCode, employeeKeyOrId, title, payload = {}, extra = {}) => withTransaction(async (db) => {
    const emp = await findEmployeeById(typeof employeeKeyOrId === 'number' ? employeeKeyOrId : K[employeeKeyOrId].id, db);
    return createRequest(db, { type: W[typeCode], employee: emp, userId: K[key].user_id, title, payload, ...extra });
  });
  const act = async (key, id, action, comment) => withTransaction(async (db) => performAction(db, await ctx(key), id, { action, comment }));
  const leave = async (key, type, start, end, reason) => {
    const emp = await findEmployeeById(K[key].id);
    return withTransaction(async (db) => {
      const days = type === 'permission' ? 3 : Math.round((new Date(end) - new Date(start)) / 864e5) + 1;
      const { rows } = await db.query(
        `INSERT INTO leaves (employee_id, leave_type, start_date, end_date, days, reason) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [emp.id, type, start, end, days, reason]);
      const r = await createRequest(db, { type: W[type === 'mission' ? 'MISSION' : 'CONGE'], employee: emp, userId: K[key].user_id,
        title: `${LEAVE_TYPES.find((l) => l[0] === type)[1]} du ${start} au ${end}`, payload: { leave_id: rows[0].id, start_date: start, end_date: end, days } });
      await db.query('UPDATE leaves SET request_id = $1 WHERE id = $2', [r.id, rows[0].id]);
      return r;
    });
  };

  // 1. Congé annuel de l'agent : en attente de l'avis de son chef (chef.dgc)
  await leave('agent', 'annuel', addDays(today, 20), addDays(today, 34), 'Congé annuel');
  // 2. Congé de l'enseignante : avis favorable de l'IA, en attente de la DRH Éducation
  const l2 = await leave('enseignant', 'annuel', addDays(today, 12), addDays(today, 21), 'Vacances de fin de trimestre');
  await act('ia.dakar', l2.id, 'approve', 'Avis favorable');
  // 3. Mission approuvée pour l'agent de la DGC (circuit complet)
  const l3 = await leave('agent', 'mission', addDays(today, -10), addDays(today, -8), 'Mission de contrôle des dossiers à Thiès');
  await q(`UPDATE leaves SET destination = 'Thiès' WHERE request_id = $1`, [l3.id]);
  await act('chef.dgc', l3.id, 'approve', 'Accord');
  await act('dgfp', l3.id, 'approve', 'Mission autorisée');
  // 4. Mutation interministérielle : enseignante vers la DRH de la Fonction publique, en attente de la DRH d'accueil
  const m1 = await req('enseignant', 'MUTATION', 'enseignant', 'Demande de mutation vers le MFPRSP',
    { target_structure_id: S['MFP-DRH'].id, fonction: 'Chargée de la formation', motif: 'Rapprochement de conjoint' });
  await act('ia.dakar', m1.id, 'approve', 'Avis favorable sous réserve de remplacement');
  await act('drh.education', m1.id, 'approve', 'Pas d’objection');
  // 5. Mutation déjà réalisée (actes appliqués au dossier) : un agent du BCA muté à la DGC
  const bca = others.find((p) => p.structure === 'MFP-BCA');
  const m2 = await req('drh.mfp', 'MUTATION', bca.id, 'Renforcement de la DGC', { target_structure_id: S['MFP-DGC'].id,
    fonction: 'Agent de saisie des actes', effective_date: addDays(today, -40) });
  await act('drh.mfp', m2.id, 'approve', 'Avis favorable'); // chef du BCA absent → suppléance DRH
  await act('drh.mfp', m2.id, 'approve', 'Mutation interne');
  await act('drh.mfp', m2.id, 'approve', 'Accord');
  await act('dgfp', m2.id, 'approve', 'Visa');
  // 6. Avancement initié par la DRH Finances, en attente du visa DGFP
  const av = await req('drh.finances', 'AVANCEMENT', salaryGap.id, 'Avancement au titre de l’année', { echelon: 6, grade: 'Principal' });
  await act('drh.finances', av.id, 'approve', 'Conditions d’ancienneté remplies');
  // 7. Nomination en attente de validation du SGG
  const nom = await req('drh.sante', 'NOMINATION', others.find((p) => p.structure === 'MSAS-RM-ZIG' && p.hierarchie === 'A').id,
    'Nomination Médecin-chef de région', { fonction: 'Médecin-chef de la région médicale de Ziguinchor', head_of_structure_id: S['MSAS-RM-ZIG'].id });
  await act('drh.sante', nom.id, 'approve', 'Proposition transmise');
  // 8. Disponibilité rejetée
  const dispoReq = await req('agent', 'DISPONIBILITE', others.find((p) => p.structure === 'MFP-DGC' && p.id !== stagiaire.id).id,
    'Demande de disponibilité pour convenances personnelles', { position_statutaire: 'disponibilite' },
    { userId: K.agent.user_id });
  await act('chef.dgc', dispoReq.id, 'reject', 'Nécessité de service : effectif insuffisant');
  // 9. Attestation en retard (délai dépassé) pour illustrer les alertes
  const att = await req('agent', 'ATTESTATION', 'agent', 'Attestation de travail pour dossier bancaire');
  await q(`UPDATE requests SET created_at = now() - interval '12 days', step_started_at = now() - interval '12 days',
           step_due_date = CURRENT_DATE - 7, due_date = CURRENT_DATE - 5 WHERE id = $1`, [att.id]);
  // 10. Titularisation du stagiaire en attente DRH
  await req('drh.mfp', 'TITULARISATION', stagiaire.id, 'Titularisation après stage probatoire');

  // ---- formation
  const T = {};
  for (const [code, title, provider, domain, days, cert] of TRAININGS) {
    const { rows } = await q(`INSERT INTO trainings (code, title, provider, domain, duration_days, is_certifying)
                              VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [code, title, provider, domain, days, cert]);
    T[code] = rows[0].id;
  }
  const sess = async (code, start, days, location, cap, inst = null, status = 'planned') => (await q(
    `INSERT INTO training_sessions (training_id, start_date, end_date, location, capacity, institution_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [T[code], start, addDays(start, days - 1), location, cap, inst, status])).rows[0].id;
  const past = await sess('ENA-MGP', addDays(today, -60), 5, 'ENA, Dakar', 25, null, 'done');
  const s2 = await sess('DSI-SIGRH', addDays(today, 15), 2, 'SGG, salle de formation', 20);
  await sess('ENA-BP', addDays(today, 30), 4, 'ENA, Dakar', 30);
  await sess('DSI-CYB', addDays(today, 8), 1, 'En ligne', 100);
  await sess('CFPA-LEAD', addDays(today, 45), 3, 'CICAD, Diamniadio', 30);
  for (const key of ['chef.dgc', 'drh.mfp', 'drh.education']) {
    await q(`INSERT INTO enrollments (session_id, employee_id, status, certified_at, result) VALUES ($1,$2,'certified',$3,'Validé')`,
      [past, K[key].id, addDays(today, -56)]);
    await q(`INSERT INTO career_events (employee_id, type, effective_date, description) VALUES ($1,'formation',$2,$3)`,
      [K[key].id, addDays(today, -56), 'Certification : Management public et conduite du changement']);
  }
  for (const key of ['drh.mfp', 'drh.finances', 'drh.education', 'drh.sante', 'drh.presidence', 'drh.sgg']) {
    await q(`INSERT INTO enrollments (session_id, employee_id, status) VALUES ($1,$2,'validated')`, [s2, K[key].id]);
  }

  // ---- évaluations
  for (const [key, reviewer, rating, text] of [['agent', 'chef.dgc', 4, 'Très bonne maîtrise des actes de carrière.'],
    ['enseignant', 'ia.dakar', 4.5, 'Excellents résultats de ses classes au BFEM.'],
    ['chef.dgc', 'dgfp', 3.5, 'Bon pilotage ; délais de traitement à réduire.']]) {
    await q(`INSERT INTO performance_reviews (employee_id, reviewer_id, period, review_date, rating, feedback, goals, indicators, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'completed')`,
    [K[key].id, K[reviewer].user_id, String(thisYear - 1), addDays(today, -200), rating, text,
      JSON.stringify([{ title: 'Réduire le délai moyen de traitement des actes', progress: 60, done: false },
        { title: 'Former deux collègues au SIGRH', progress: 100, done: true }]),
      JSON.stringify([{ title: 'Dossiers traités par mois', target: '40', achieved: '37', progress: 92 }])]);
  }
  await q(`INSERT INTO performance_reviews (employee_id, reviewer_id, period, review_date, status) VALUES ($1,$2,$3,$4,'scheduled')`,
    [K.agent.id, K['chef.dgc'].user_id, String(thisYear), addDays(today, 18)]);

  // ---- Solde : deux mois importés (le dernier contient des anomalies à détecter)
  const { rows: payable } = await q(
    `SELECT id, first_name, last_name, matricule_solde, salary, position_statutaire FROM employees`);
  for (const back of [2, 1]) {
    const dt = new Date(thisYear, new Date().getMonth() - back, 1);
    const [y, m] = [dt.getFullYear(), dt.getMonth() + 1];
    const lines = [];
    for (const e of payable) {
      const isLast = back === 1;
      if (e.position_statutaire === 'detachement') continue;                       // payé par l'organisme d'accueil
      if (e.position_statutaire === 'disponibilite' && !isLast) continue;         // payé à tort le dernier mois
      if (e.position_statutaire === 'retraite' && !isLast) continue;              // payé à tort le dernier mois
      if (isLast && e.id === K.enseignant.id + 1) continue;                        // oublié par la Solde
      const base = isLast && e.id === salaryGap.id ? Math.round(e.salary * 1.18) : e.salary;
      const s = computePayslip({ basic: base, year: y, month: m });
      lines.push([e, base, s]);
    }
    const totalGross = lines.reduce((t, [, , s]) => t + s.gross, 0);
    const totalNet = lines.reduce((t, [, , s]) => t + s.net, 0);
    const { rows: imp } = await q(
      `INSERT INTO solde_imports (period_year, period_month, source, filename, line_count, total_gross, total_net, imported_by, created_at)
       VALUES ($1,$2,'interop','API Direction de la Solde',$3,$4,$5,NULL,$6) RETURNING id`,
      [y, m, lines.length + (back === 1 ? 1 : 0), totalGross, totalNet, `${y}-${String(m).padStart(2, '0')}-28T18:00:00Z`]);
    for (const [e, base, s] of lines) {
      await q(`INSERT INTO solde_lines (import_id, matricule_solde, full_name, gross, net, base_salary, employee_id, raw)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'{}')`, [imp[0].id, e.matricule_solde, `${e.first_name} ${e.last_name}`, s.gross, s.net, base, e.id]);
      await q(`INSERT INTO payrolls (employee_id, period_year, period_month, basic, allowances, bonuses, overtime_pay, gross,
                 deductions, tax, net, details, source, import_id) VALUES ($1,$2,$3,$4,$5,0,0,$6,$7,$8,$9,$10,'solde',$11)`,
      [e.id, y, m, s.basic, s.allowances, s.gross, s.deductions, s.tax, s.net, JSON.stringify(s.details), imp[0].id]);
    }
    if (back === 1) {
      // matricule inconnu du référentiel : agent potentiellement fictif
      await q(`INSERT INTO solde_lines (import_id, matricule_solde, full_name, gross, net, base_salary, raw)
               VALUES ($1,'699999Z','Modou NDIAYE',612000,498000,520000,'{}')`, [imp[0].id]);
    }
  }

  // ---- interopérabilité : clés de démonstration (à ne jamais utiliser en production)
  const DEMO_KEYS = [
    ['Direction de la Solde (MFB)', 'MFB-DS', ['solde:write', 'agents:read'], 'sigrh_demo_solde_2026'],
    ['Terminaux biométriques — Dakar', 'SGG-DSI', ['biometrie:write'], 'sigrh_demo_biometrie_2026'],
    ['SI du Ministère de l’Éducation', 'MEN', ['agents:read', 'structures:read', 'statistiques:read'], 'sigrh_demo_men_2026'],
  ];
  for (const [name, code, scopes, key] of DEMO_KEYS) {
    await q(`INSERT INTO api_clients (name, structure_id, key_prefix, key_hash, scopes, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
      [name, S[code].id, key.slice(0, 11), sha256(key), scopes, K['admin.dsi'].user_id]);
  }

  // ---- référentiel collaboratif : proposition en attente
  await q(`INSERT INTO structure_requests (action, payload, institution_id, requested_by) VALUES ('create',$1,$2,$3)`,
    [JSON.stringify({ code: 'MEN-IA-STL', name: 'Inspection d’académie de Saint-Louis', sigle: 'IA Saint-Louis', type: 'deconcentree',
      parent_id: S.MEN.id, region: 'Saint-Louis' }), S.MEN.institution_id, K['drh.education'].user_id]);

  // ---- communication et journal
  await q(`INSERT INTO announcements (title, content, event_date, institution_id, author_id) VALUES
    ('Lancement du SIGRH — phase pilote', 'Le Système Intégré de Gestion des Ressources Humaines entre en phase pilote dans trois ministères. Les correspondants RH sont invités à la session de prise en main.', $1, NULL, $2),
    ('Campagne d’évaluation annuelle', 'Les fiches d’évaluation annuelle doivent être finalisées avant la fin du mois dans le SIGRH.', $3, $4, $5)`,
  [addDays(today, 15), K['pilotage.sgg'].user_id, addDays(today, 25), S.MFP.institution_id, K['drh.mfp'].user_id]);
  await logActivity(K['admin.dsi'].user_id, 'Initialisation', 'system', null, 'Données de démonstration chargées');

  if (quiet) return { S, K, W };
  console.log('✅ Données de démonstration SIGRH chargées');
  console.log(`   ${people.length} agents, ${STRUCTURES.length} structures, ${WORKFLOWS.length} circuits`);
  console.log(`   Mot de passe de tous les comptes : ${DEMO_PASSWORD}`);
  KEY_PEOPLE.forEach(([key, , , , , fonction, , role]) => console.log(`   ${`${key}@sigrh.test`.padEnd(32)} ${role.padEnd(16)} ${fonction}`));
  console.log('   Clés d’API de démonstration : sigrh_demo_solde_2026, sigrh_demo_biometrie_2026, sigrh_demo_men_2026');
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed()
    .catch((err) => { console.error('❌ Seed échoué :', err); process.exitCode = 1; })
    .finally(() => pool.end());
}
