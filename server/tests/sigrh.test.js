/* Tests d'intégration du SIGRH — base dédiée obligatoire (toutes les tables sont vidées) :
 *   TEST_DATABASE_URL=postgresql://.../sigrh_test npm test
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL est obligatoire (base jetable : toutes les tables sont vidées).');
  process.exit(1);
}
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test_secret_value_1234567890';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.AUTH_RATE_LIMIT = '10000';
process.env.MFA_REQUIRED = 'false';

const { app } = await import('../server.js');
const { pool } = await import('../config/db.js');
const { seed, DEMO_PASSWORD } = await import('../utils/seed.js');
const { totpCode, decrypt } = await import('../utils/crypto.js');
const { runOverdueAlerts } = await import('../utils/alerts.js');
const { toISODate, addDays } = await import('../utils/dates.js');

let server;
let base;
let S;
let K;
const tokens = {};
const sql = async (text, params) => (await pool.query(text, params)).rows;

const api = async (method, path, body, who, headers = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers,
    body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
};
const login = async (key) => {
  const r = await api('POST', '/auth/login', { email: `${key}@sigrh.test`, password: DEMO_PASSWORD });
  assert.equal(r.status, 200, `connexion ${key}`);
  tokens[key] = r.body.token;
  return r.body;
};
const requestId = async (reference) => (await sql('SELECT id FROM requests WHERE reference = $1', [reference]))[0].id;

before(async () => {
  ({ S, K } = await seed({ quiet: true }));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
  for (const key of ['pilotage.presidence', 'pilotage.sgg', 'admin.dsi', 'drh.mfp', 'drh.education', 'drh.finances',
    'drh.sante', 'dgfp', 'chef.dgc', 'agent', 'enseignant', 'ia.dakar']) await login(key);
});

after(async () => {
  server?.close();
  await pool.end();
});

describe('Authentification et double authentification', () => {
  test('mauvais mot de passe refusé et journalisé', async () => {
    const r = await api('POST', '/auth/login', { email: 'agent@sigrh.test', password: 'faux' });
    assert.equal(r.status, 401);
    const logs = await sql(`SELECT 1 FROM activity_logs WHERE action = 'Échec de connexion' AND details = 'agent@sigrh.test'`);
    assert.ok(logs.length >= 1);
  });

  test('la 2FA est imposée aux profils sensibles quand MFA_REQUIRED est actif', async () => {
    process.env.MFA_REQUIRED = 'true';
    try {
      const blocked = await api('GET', '/employees', null, 'drh.sante');
      assert.equal(blocked.status, 403);
      assert.equal(blocked.body.code, 'MFA_SETUP_REQUIRED');
      assert.equal((await api('GET', '/employees?scope=directory', null, 'agent')).status, 200, 'un agent n’est pas bloqué');

      const setup = await api('POST', '/auth/mfa/setup', {}, 'drh.sante');
      assert.equal(setup.status, 200);
      assert.match(setup.body.qr, /^data:image\/png;base64,/);
      assert.equal((await api('POST', '/auth/mfa/enable', { code: '000000' }, 'drh.sante')).status, 400);
      const enabled = await api('POST', '/auth/mfa/enable', { code: totpCode(setup.body.secret) }, 'drh.sante');
      assert.equal(enabled.status, 200);

      const step1 = await api('POST', '/auth/login', { email: 'drh.sante@sigrh.test', password: DEMO_PASSWORD });
      assert.equal(step1.body.mfa_required, true);
      assert.equal(step1.body.token, undefined);
      assert.equal((await api('GET', '/employees', null, null, { Authorization: `Bearer ${step1.body.mfa_token}` })).status, 401);
      assert.equal((await api('POST', '/auth/mfa/verify', { mfa_token: step1.body.mfa_token, code: '123456' })).status, 401);
      const step2 = await api('POST', '/auth/mfa/verify', { mfa_token: step1.body.mfa_token, code: totpCode(setup.body.secret) });
      assert.equal(step2.status, 200);
      tokens['drh.sante'] = step2.body.token;
      assert.equal((await api('GET', '/employees', null, 'drh.sante')).status, 200);
      assert.equal((await api('POST', '/auth/mfa/disable', { code: totpCode(setup.body.secret) }, 'drh.sante')).status, 403);
      const stored = await sql(`SELECT totp_secret_enc FROM users WHERE email = 'drh.sante@sigrh.test'`);
      assert.ok(!stored[0].totp_secret_enc.includes(setup.body.secret), 'le secret 2FA est chiffré en base');
    } finally {
      process.env.MFA_REQUIRED = 'false';
    }
  });

  test('activation de compte : l’agent doit exister dans le référentiel', async () => {
    const created = await api('POST', '/employees', { first_name: 'Test', last_name: 'ACTIVATION', email: 'activation@sigrh.test',
      structure_id: S['MFP-DRH'].id, sexe: 'M' }, 'drh.mfp');
    assert.equal(created.status, 201);
    assert.equal((await api('POST', '/auth/activate', { email: 'activation@sigrh.test', identifier: 'SN99999999',
      password: 'Motdepasse2026' })).status, 400);
    assert.equal((await api('POST', '/auth/activate', { email: 'activation@sigrh.test', identifier: created.body.sigrh_id,
      password: 'faible' })).status, 400);
    const ok = await api('POST', '/auth/activate', { email: 'activation@sigrh.test', identifier: created.body.sigrh_id,
      password: 'Motdepasse2026' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.user.role, 'agent');
    assert.equal((await api('POST', '/auth/activate', { email: 'activation@sigrh.test', identifier: created.body.sigrh_id,
      password: 'Motdepasse2026' })).status, 409);
  });
});

describe('Habilitations par périmètre (section 10)', () => {
  test('la DRH ne gère que les agents de son institution', async () => {
    const r = await api('GET', '/employees?scope=institution&limit=100', null, 'drh.mfp');
    assert.equal(r.status, 200);
    assert.ok(r.body.data.length > 5);
    assert.ok(r.body.data.every((e) => e.institution_id === S.MFP.institution_id));
    assert.ok('salary' in r.body.data[0]);
    const men = await sql(`SELECT e.id FROM employees e WHERE structure_id = $1 LIMIT 1`, [S['MEN-IA-DKR'].id]);
    assert.equal((await api('GET', `/employees/${men[0].id}/dossier`, null, 'drh.mfp')).status, 403);
    assert.equal((await api('PUT', `/employees/${men[0].id}`, { fonction: 'X' }, 'drh.mfp')).status, 403);
    assert.equal((await api('POST', '/employees', { first_name: 'A', last_name: 'B', email: 'ab@sigrh.test',
      structure_id: S['MEN-DRH'].id }, 'drh.mfp')).status, 403);
  });

  test('l’annuaire interministériel ne révèle aucune donnée sensible', async () => {
    const r = await api('GET', '/employees?scope=directory&limit=100', null, 'agent');
    assert.ok(r.body.data.length > 20);
    for (const e of r.body.data) {
      for (const k of ['salary', 'nin_masked', 'date_of_birth', 'matricule_solde', 'address']) assert.equal(e[k], undefined);
    }
  });

  test('DSI et pilotage n’accèdent pas aux dossiers individuels des ministères', async () => {
    const id = K.enseignant.id;
    assert.equal((await api('GET', `/employees/${id}/dossier`, null, 'admin.dsi')).status, 403);
    assert.equal((await api('GET', `/employees/${id}/dossier`, null, 'pilotage.presidence')).status, 403);
    assert.equal((await api('GET', '/employees?scope=institution', null, 'pilotage.sgg')).status, 403);
  });

  test('le chef de structure voit son équipe sans données personnelles', async () => {
    const r = await api('GET', '/employees?scope=team', null, 'chef.dgc');
    assert.equal(r.status, 200);
    assert.ok(r.body.data.some((e) => e.id === K.agent.id));
    assert.equal(r.body.data[0].salary, undefined);
    const dossier = await api('GET', `/employees/${K.agent.id}/dossier`, null, 'chef.dgc');
    assert.equal(dossier.status, 200);
    assert.equal(dossier.body.agent.access_level, 'team');
    assert.deepEqual(dossier.body.changes, []);
  });

  test('pilotage : tableaux de bord consolidés ; DRH : sa seule institution ; agent : refusé', async () => {
    const national = await api('GET', '/pilotage/indicators', null, 'pilotage.presidence');
    assert.equal(national.status, 200);
    assert.equal(national.body.scope, 'national');
    assert.ok(national.body.par_institution.length >= 6);
    const drh = await api('GET', '/pilotage/indicators', null, 'drh.education');
    assert.equal(drh.body.scope, 'institution');
    assert.ok(drh.body.effectif < national.body.effectif);
    assert.equal(drh.body.par_institution.length, 1);
    const forced = await api('GET', `/pilotage/indicators?institution=${S.MFP.institution_id}`, null, 'drh.education');
    assert.equal(forced.body.par_institution[0].id, S.MEN.institution_id, 'une DRH ne peut pas viser une autre institution');
    assert.equal((await api('GET', '/pilotage/indicators', null, 'agent')).status, 403);
  });
});

describe('Référentiel unique de l’agent', () => {
  test('le NIN est chiffré, dédoublonné et sa consultation est tracée', async () => {
    const created = await api('POST', '/employees', { first_name: 'Nin', last_name: 'CHIFFRE', email: 'nin@sigrh.test',
      structure_id: S['MFP-DGC'].id, nin: '1234567890123', sexe: 'F' }, 'drh.mfp');
    assert.equal(created.status, 201);
    assert.match(created.body.sigrh_id, /^SN\d{8}$/);
    assert.equal(created.body.nin_masked, '•••••••••0123');
    const raw = await sql('SELECT nin_enc FROM employees WHERE id = $1', [created.body.id]);
    assert.ok(!raw[0].nin_enc.includes('1234567890123'));
    assert.equal(decrypt(raw[0].nin_enc), '1234567890123');
    const dup = await api('POST', '/employees', { first_name: 'Autre', last_name: 'PERSONNE', email: 'autre@sigrh.test',
      structure_id: S['MFP-DGC'].id, nin: '1234 5678 90123' }, 'drh.mfp');
    assert.equal(dup.status, 409);
    const reveal = await api('GET', `/employees/${created.body.id}/nin`, null, 'drh.mfp');
    assert.equal(reveal.body.nin, '1234567890123');
    assert.ok((await sql(`SELECT 1 FROM activity_logs WHERE action = 'Consultation du NIN' AND entity_id = $1`, [created.body.id])).length);
  });

  test('chaque modification est historisée (valeur avant / après)', async () => {
    const before = (await sql('SELECT grade FROM employees WHERE id = $1', [K.agent.id]))[0].grade;
    const r = await api('PUT', `/employees/${K.agent.id}`, { grade: 'Exceptionnel', phone: '+221 77 000 00 01' }, 'drh.mfp');
    assert.equal(r.status, 200);
    const changes = await sql(`SELECT field, old_value, new_value FROM record_changes WHERE entity_id = $1 AND field = 'grade'`,
      [K.agent.id]);
    assert.deepEqual(changes[0], { field: 'grade', old_value: before, new_value: 'Exceptionnel' });
    const dossier = await api('GET', `/employees/${K.agent.id}/dossier`, null, 'agent');
    assert.ok(dossier.body.changes.some((c) => c.field === 'grade'));
    assert.ok(dossier.body.affectations.length >= 1);
    assert.ok(dossier.body.career.some((c) => c.type === 'recrutement'));
  });

  test('vérification d’identité (connecteur état civil en simulation) et enrôlement biométrique', async () => {
    const v = await api('POST', `/employees/${K.agent.id}/verify-identity`, {}, 'drh.mfp');
    assert.equal(v.status, 200);
    assert.equal(v.body.source, 'simulation');
    const b = await api('POST', `/employees/${K.agent.id}/biometrie`, { biometric_id: 'BIO-TEST-01' }, 'drh.mfp');
    assert.equal(b.body.biometric_id, 'BIO-TEST-01');
  });
});

describe('Circuits de validation paramétrables (section 6.3)', () => {
  test('congé : chef de structure puis DRH ; solde débité ; personne ne valide sa propre demande', async () => {
    const start = addDays(toISODate(), 60);
    const r = await api('POST', '/leaves', { leave_type: 'annuel', start_date: start, end_date: addDays(start, 4), reason: 'Test' }, 'agent');
    assert.equal(r.status, 201);
    assert.equal(r.body.days, 5);
    const id = r.body.request_id;
    assert.equal((await api('POST', `/requests/${id}/actions`, { action: 'approve' }, 'agent')).status, 403);
    assert.equal((await api('POST', `/requests/${id}/actions`, { action: 'approve' }, 'drh.mfp')).status, 403, 'étape du chef');
    const todo = await api('GET', '/requests?scope=todo', null, 'chef.dgc');
    assert.ok(todo.body.data.some((x) => x.id === id));
    let step = await api('POST', `/requests/${id}/actions`, { action: 'approve', comment: 'OK' }, 'chef.dgc');
    assert.equal(step.body.current_step, 2);
    step = await api('POST', `/requests/${id}/actions`, { action: 'approve' }, 'drh.mfp');
    assert.equal(step.body.status, 'approved');
    const leave = await sql('SELECT status FROM leaves WHERE request_id = $1', [id]);
    assert.equal(leave[0].status, 'approved');
    const bal = await api('GET', '/leaves/balance', null, 'agent');
    const annuel = bal.body.balances.find((b) => b.leave_type === 'annuel');
    assert.equal(Number(annuel.used), 5);
    const notif = await api('GET', '/notifications', null, 'agent');
    assert.ok(notif.body.data.some((n) => n.title.includes('validée')));
  });

  test('chevauchement et solde insuffisant refusés', async () => {
    const start = addDays(toISODate(), 60);
    assert.equal((await api('POST', '/leaves', { leave_type: 'permission', start_date: start, end_date: start }, 'agent')).status, 409);
    const s2 = addDays(toISODate(), 120);
    const r = await api('POST', '/leaves', { leave_type: 'permission', start_date: s2, end_date: addDays(s2, 20) }, 'agent');
    assert.equal(r.status, 400);
  });

  test('mutation interministérielle : DRH d’accueil puis DGFP, acte appliqué au dossier', async () => {
    const id = await requestId('SIGRH-2026-000004');
    assert.equal((await api('POST', `/requests/${id}/actions`, { action: 'approve' }, 'drh.education')).status, 403);
    assert.equal((await api('POST', `/requests/${id}/actions`, { action: 'return' }, 'drh.mfp')).status, 400, 'motif requis');
    let r = await api('POST', `/requests/${id}/actions`, { action: 'approve', comment: 'Accueil accepté' }, 'drh.mfp');
    assert.equal(r.body.current_step, 4);
    r = await api('POST', `/requests/${id}/actions`, { action: 'approve', comment: 'Visa' }, 'dgfp');
    assert.equal(r.body.status, 'approved');
    const emp = (await sql('SELECT structure_id, fonction FROM employees WHERE id = $1', [K.enseignant.id]))[0];
    assert.equal(emp.structure_id, S['MFP-DRH'].id);
    assert.equal(emp.fonction, 'Chargée de la formation');
    const aff = await sql('SELECT end_date FROM affectations WHERE employee_id = $1 ORDER BY id', [K.enseignant.id]);
    assert.ok(aff[0].end_date, 'ancienne affectation clôturée');
    assert.equal(aff.at(-1).end_date, null);
    assert.ok((await sql(`SELECT 1 FROM career_events WHERE employee_id = $1 AND type = 'mutation'`, [K.enseignant.id])).length);
    // le dossier suit l'agent : la DRH d'origine perd la main, la DRH d'accueil la prend
    assert.equal((await api('PUT', `/employees/${K.enseignant.id}`, { phone: '1' }, 'drh.education')).status, 403);
    assert.equal((await api('PUT', `/employees/${K.enseignant.id}`, { phone: '+221 70 111 11 11' }, 'drh.mfp')).status, 200);
    await login('enseignant');
    const me = await api('GET', '/auth/me', null, 'enseignant');
    assert.equal(me.body.user.institution_id, S.MFP.institution_id);
  });

  test('avancement visé par la DGFP ; nomination validée par le SGG', async () => {
    const av = await requestId('SIGRH-2026-000006');
    const r = await api('POST', `/requests/${av}/actions`, { action: 'approve' }, 'dgfp');
    assert.equal(r.body.status, 'approved');
    const emp = (await sql(`SELECT echelon FROM employees WHERE id = (SELECT employee_id FROM requests WHERE id = $1)`, [av]))[0];
    assert.equal(emp.echelon, 6);
    const nom = await requestId('SIGRH-2026-000007');
    assert.equal((await api('POST', `/requests/${nom}/actions`, { action: 'approve' }, 'drh.sante')).status, 403);
    const n = await api('POST', `/requests/${nom}/actions`, { action: 'approve' }, 'pilotage.sgg');
    assert.equal(n.body.status, 'approved');
    const head = (await sql('SELECT head_agent_id FROM structures WHERE id = $1', [S['MSAS-RM-ZIG'].id]))[0].head_agent_id;
    assert.equal(head, n.body.employee_id);
  });

  test('un acte de carrière n’est pas initiable par l’agent lui-même', async () => {
    const types = await api('GET', '/workflows/types', null, 'agent');
    const avancement = types.body.types.find((t) => t.code === 'AVANCEMENT');
    assert.equal((await api('POST', '/requests', { type_id: avancement.id, payload: { echelon: 9 } }, 'agent')).status, 403);
  });

  test('alertes de dépassement de délai', async () => {
    const sent = await runOverdueAlerts();
    assert.ok(sent >= 1);
    const n = await api('GET', '/notifications', null, 'drh.mfp');
    assert.ok(n.body.data.some((x) => x.type === 'alerte'));
    assert.equal(await runOverdueAlerts(), 0, 'une seule alerte par étape');
  });

  test('paramétrage des circuits réservé au niveau central', async () => {
    const types = await api('GET', '/workflows/types', null, 'pilotage.sgg');
    const att = types.body.types.find((t) => t.code === 'ATTESTATION');
    assert.equal((await api('PUT', `/workflows/types/${att.id}`, { sla_days: 5 }, 'drh.mfp')).status, 403);
    const ok = await api('PUT', `/workflows/types/${att.id}`, { sla_days: 5, steps: [
      { name: 'Établissement', assignee_kind: 'drh_institution', expected_days: 3 },
      { name: 'Signature du directeur', assignee_kind: 'chef_superieur', expected_days: 2 }] }, 'pilotage.sgg');
    assert.equal(ok.status, 200);
  });

  test('formation : inscription validée par le circuit', async () => {
    const list = await api('GET', '/trainings', null, 'agent');
    const session = list.body.find((t) => t.code === 'ENA-BP').sessions[0];
    const e = await api('POST', `/trainings/sessions/${session.id}/enroll`, { motivation: 'Plan de carrière' }, 'agent');
    assert.equal(e.status, 201);
    const req = (await sql('SELECT request_id FROM enrollments WHERE id = $1', [e.body.id]))[0].request_id;
    await api('POST', `/requests/${req}/actions`, { action: 'approve' }, 'chef.dgc');
    await api('POST', `/requests/${req}/actions`, { action: 'approve' }, 'drh.mfp');
    assert.equal((await sql('SELECT status FROM enrollments WHERE id = $1', [e.body.id]))[0].status, 'validated');
    assert.equal((await api('POST', `/trainings/sessions/${session.id}/enroll`, {}, 'agent')).status, 409);
  });
});

describe('Rémunération et cohérence avec la Solde', () => {
  test('le rapprochement détecte les anomalies (effectifs, positions, montants, présence)', async () => {
    const imports = await api('GET', '/solde/imports', null, 'pilotage.presidence');
    const r = await api('GET', `/solde/imports/${imports.body[0].id}/reconciliation`, null, 'pilotage.presidence');
    assert.equal(r.status, 200);
    const types = new Set(r.body.anomalies.map((a) => a.type));
    for (const t of ['inconnu', 'position_non_payable', 'ecart_salaire', 'non_paye', 'sans_presence', 'non_enrole']) {
      assert.ok(types.has(t), `anomalie ${t} détectée`);
    }
    assert.ok(r.body.summary.amount_at_risk > 0);
    const drh = await api('GET', `/solde/imports/${imports.body[0].id}/reconciliation`, null, 'drh.finances');
    assert.ok(drh.body.anomalies.every((a) => a.institution === 'MFB'));
    assert.ok(!drh.body.anomalies.some((a) => a.type === 'inconnu'));
    assert.equal((await api('POST', '/solde/imports', { year: 2026, month: 1, content: 'a;b' }, 'drh.finances')).status, 403);
  });

  test('bulletins dématérialisés : chacun les siens', async () => {
    const mine = await api('GET', '/solde/payslips', null, 'agent');
    assert.ok(mine.body.length >= 1 && mine.body.every((p) => p.employee_id === K.agent.id));
    const pdf = await api('GET', `/solde/payslips/${mine.body[0].id}/pdf`, null, 'agent');
    assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
    assert.equal((await api('GET', `/solde/payslips/${mine.body[0].id}/pdf`, null, 'chef.dgc')).status, 403);
  });

  test('import CSV de la Solde et rapprochement par matricule', async () => {
    const mat = (await sql('SELECT matricule_solde FROM employees WHERE id = $1', [K.agent.id]))[0].matricule_solde;
    const csv = `matricule_solde;nom;salaire_base;brut;retenues;impot;net\n${mat};Awa KONE;500000;600000;40000;50000;510000\nXXX999;Inconnu;100;100;0;0;100\n`;
    const r = await api('POST', '/solde/imports', { year: 2026, month: 1, filename: 'etat.csv', content: csv }, 'pilotage.sgg');
    assert.equal(r.status, 201);
    assert.equal(r.body.matched, 1);
    assert.equal(r.body.unmatched, 1);
    const bad = await api('POST', '/solde/imports', { year: 2026, month: 2, content: 'matricule_solde;net\nA1;abc\n' }, 'pilotage.sgg');
    assert.equal(bad.status, 400);
  });
});

describe('Interopérabilité (bus d’échange)', () => {
  const key = (k) => ({ 'X-API-Key': k });
  test('clé obligatoire, habilitations limitées', async () => {
    assert.equal((await api('GET', '/interop/v1/structures')).status, 401);
    assert.equal((await api('GET', '/interop/v1/structures', null, null, key('mauvaise'))).status, 401);
    assert.equal((await api('GET', '/interop/v1/structures', null, null, key('sigrh_demo_biometrie_2026'))).status, 403);
    const s = await api('GET', '/interop/v1/structures', null, null, key('sigrh_demo_men_2026'));
    assert.equal(s.status, 200);
    assert.ok(s.body.count >= 20);
  });

  test('fiche agent minimale, sans donnée sensible', async () => {
    const sigrh = (await sql('SELECT sigrh_id FROM employees WHERE id = $1', [K.agent.id]))[0].sigrh_id;
    const r = await api('GET', `/interop/v1/agents/${sigrh}`, null, null, key('sigrh_demo_men_2026'));
    assert.equal(r.status, 200);
    assert.equal(r.body.sigrh_id, sigrh);
    for (const k of ['nin_enc', 'nin_hash', 'salary', 'date_of_birth', 'address']) assert.equal(r.body[k], undefined);
  });

  test('pointages biométriques : arrivée puis départ, rejets motivés', async () => {
    const bio = (await sql(`SELECT biometric_id FROM employees WHERE biometric_id IS NOT NULL AND position_statutaire = 'activite'
                            AND id NOT IN (SELECT employee_id FROM attendance WHERE work_date = CURRENT_DATE) LIMIT 1`))[0].biometric_id;
    const day = toISODate();
    const r = await api('POST', '/interop/v1/biometrie/pointages', { pointages: [
      { biometric_id: bio, horodatage: `${day}T07:52:00`, terminal: 'TERM-TEST' },
      { biometric_id: bio, horodatage: `${day}T17:10:00`, terminal: 'TERM-TEST' },
      { biometric_id: 'INCONNU', horodatage: `${day}T08:00:00` },
      { biometric_id: bio, horodatage: 'pas une date' }] }, null, key('sigrh_demo_biometrie_2026'));
    assert.equal(r.status, 202);
    assert.equal(r.body.arrivees, 1);
    assert.equal(r.body.departs, 1);
    assert.equal(r.body.rejets.length, 2);
  });

  test('la DSI gère les clés ; la clé n’est affichée qu’une fois', async () => {
    const c = await api('POST', '/interop/clients', { name: 'SI Test', scopes: ['structures:read'] }, 'admin.dsi');
    assert.equal(c.status, 201);
    assert.match(c.body.api_key, /^sigrh_/);
    assert.equal((await api('GET', '/interop/v1/structures', null, null, key(c.body.api_key))).status, 200);
    const list = await api('GET', '/interop/clients', null, 'admin.dsi');
    assert.ok(list.body.clients.every((x) => x.api_key === undefined));
    await api('PATCH', `/interop/clients/${c.body.id}`, { is_active: false }, 'admin.dsi');
    assert.equal((await api('GET', '/interop/v1/structures', null, null, key(c.body.api_key))).status, 401);
    assert.equal((await api('GET', '/interop/clients', null, 'drh.mfp')).status, 403);
  });
});

describe('Référentiel des structures, reprise des données, audit', () => {
  test('un ministère propose, le niveau central valide', async () => {
    assert.equal((await api('POST', '/structures', { code: 'X', name: 'X', type: 'service', parent_id: S.MEN.id }, 'drh.education')).status, 403);
    const pending = await api('GET', '/structures/requests', null, 'admin.dsi');
    const reqId = pending.body.find((r) => r.status === 'pending').id;
    assert.equal((await api('PATCH', `/structures/requests/${reqId}`, { decision: 'approve' }, 'drh.education')).status, 403);
    assert.equal((await api('PATCH', `/structures/requests/${reqId}`, { decision: 'approve' }, 'admin.dsi')).status, 200);
    const s = await sql(`SELECT institution_id FROM structures WHERE code = 'MEN-IA-STL'`);
    assert.equal(s[0].institution_id, S.MEN.institution_id);
  });

  test('reprise : contrôle, dédoublonnage puis validation formelle par la DRH', async () => {
    const csv = ['prenom;nom;sexe;date_naissance;nin;email;code_structure;code_corps;hierarchie;salaire_base',
      'Seynabou;GAYE;F;12/05/1988;2345678901234;seynabou.gaye@sigrh.test;MFP-DGC;SECADM;B;450000',
      'Awa;KONÉ;F;;;agent@sigrh.test;MFP-DGC;;;',
      'Paul;SARR;M;31/02/1990;;paul.sarr@sigrh.test;MEN-DRH;;;',
      'Seynabou;GAYE;F;12/05/1988;2345678901234;seynabou2@sigrh.test;MFP-DGC;;;'].join('\n');
    const r = await api('POST', '/imports', { filename: 'reprise.csv', content: csv }, 'drh.mfp');
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.stats, { total: 4, valides: 1, erreurs: 1, doublons: 2 });
    const detail = await api('GET', `/imports/${r.body.id}`, null, 'drh.mfp');
    assert.ok(detail.body.rows.every((x) => !('_nin_enc' in x.data)));
    assert.equal((await api('GET', `/imports/${r.body.id}`, null, 'drh.education')).status, 404);
    const apply = await api('POST', `/imports/${r.body.id}/decision`, { decision: 'apply' }, 'drh.mfp');
    assert.equal(apply.body.applied, 1);
    assert.equal((await sql(`SELECT COUNT(*)::int AS n FROM employees WHERE email = 'seynabou.gaye@sigrh.test'`))[0].n, 1);
    assert.equal((await api('POST', `/imports/${r.body.id}/decision`, { decision: 'apply' }, 'drh.mfp')).status, 409);
  });

  test('journal d’audit : chaîne intègre et modification impossible', async () => {
    const v = await api('GET', '/admin/audit/verify', null, 'admin.dsi');
    assert.equal(v.body.valid, true);
    assert.ok(v.body.checked > 20);
    await assert.rejects(pool.query(`UPDATE activity_logs SET details = 'falsifié' WHERE id = 1`), /ajout seul/);
    await assert.rejects(pool.query('DELETE FROM activity_logs WHERE id = 1'), /ajout seul/);
    assert.equal((await api('GET', '/admin/audit/verify', null, 'drh.mfp')).status, 403);
  });

  test('revue des habilitations et exports', async () => {
    const users = await api('GET', '/admin/users', null, 'admin.dsi');
    const due = users.body.users.find((u) => u.email === 'drh.education@sigrh.test');
    assert.equal(due.review_due, true);
    await api('POST', `/admin/users/${due.id}/review`, {}, 'admin.dsi');
    const after2 = await api('GET', '/admin/users', null, 'admin.dsi');
    assert.equal(after2.body.users.find((u) => u.id === due.id).review_due, false);
    const xlsx = await api('GET', '/pilotage/export.xlsx', null, 'pilotage.sgg');
    assert.equal(xlsx.body.subarray(0, 2).toString(), 'PK');
    const pdf = await api('GET', '/pilotage/export.pdf', null, 'drh.mfp');
    assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
  });
});
