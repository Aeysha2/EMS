/* Integration tests — run against a dedicated PostgreSQL database:
 *   TEST_DATABASE_URL=postgresql://.../ems_test npm test
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

// The suite TRUNCATEs every table: never run it without an explicit, dedicated test database
if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is required (a disposable database — all tables are wiped).');
  process.exit(1);
}
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test_secret_value_1234567890';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.AUTH_RATE_LIMIT = '1000';

const { app } = await import('../server.js');
const { pool } = await import('../config/db.js');
const { migrate } = await import('../utils/migrate.js');
const bcrypt = (await import('bcryptjs')).default;
const { addDays, toISODate } = await import('../utils/dates.js');

let server;
let base;
const tokens = {};

const api = async (method, path, body, who) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.arrayBuffer(), headers: res.headers };
};

// Next Monday..Friday window in the future (so leave tests do not depend on today's weekday)
const nextMonday = () => {
  let d = addDays(toISODate(), 7);
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  return d;
};

before(async () => {
  await migrate();
  await pool.query(`TRUNCATE documents, project_history, projects, circuit_steps, request_types, deposit_types,
    activity_logs, announcements, notifications, performance_reviews, payrolls, leaves, attendance,
    users, employees, departments RESTART IDENTITY CASCADE`);
  const hash = await bcrypt.hash('Admin@123', 4);
  await pool.query(`INSERT INTO departments (name, code, budget) VALUES ('DRH','DRH',1000000), ('DGC','DGC',1000000)`);
  await pool.query(`INSERT INTO employees (employee_code, matricule, full_name, email, department_id, salary)
                    VALUES ('EMP101','MAT-1','Admin Test','admin@t.gov',1,900000),
                           ('EMP102','MAT-2','Rh Test','rh@t.gov',1,700000),
                           ('EMP103','MAT-3','Chef DGC','chef@t.gov',2,650000)`);
  await pool.query(`UPDATE departments SET manager_id = 3 WHERE id = 2`);
  await pool.query(`INSERT INTO users (name, email, password_hash, role, employee_id) VALUES
                    ('Admin Test','admin@t.gov',$1,'admin',1), ('Rh Test','rh@t.gov',$1,'hr',2),
                    ('Chef DGC','chef@t.gov',$1,'employee',3)`, [hash]);
  await pool.query(`INSERT INTO request_types (code, name, sla_days) VALUES ('AVA','Avancement',30)`);
  await pool.query(`INSERT INTO deposit_types (name) VALUES ('Guichet')`);
  await pool.query(`INSERT INTO circuit_steps (request_type_id, step_order, name, department_id) VALUES
                    (NULL,1,'Enregistrement',1),(NULL,2,'Instruction',2),(NULL,3,'Signature',1)`);

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
  for (const who of ['admin', 'rh', 'chef']) {
    const r = await api('POST', '/auth/login', { email: `${who}@t.gov`, password: 'Admin@123' });
    assert.equal(r.status, 200);
    tokens[who] = r.body.token;
  }
});

after(async () => {
  server?.close();
  await pool.end();
});

describe('authentication & RBAC', () => {
  test('rejects wrong password', async () => {
    const r = await api('POST', '/auth/login', { email: 'admin@t.gov', password: 'nope' });
    assert.equal(r.status, 401);
  });

  test('self-registration always creates an employee', async () => {
    const r = await api('POST', '/auth/register', {
      name: 'Nouvel Agent', email: 'agent@t.gov', password: 'Agent1234', role: 'admin',
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.role, 'employee');
    assert.ok(r.body.user.employee_id);
    tokens.agent = r.body.token;
  });

  test('cannot claim an existing HR record without its matricule', async () => {
    await pool.query(`INSERT INTO employees (employee_code, matricule, full_name, email, department_id, salary)
                      VALUES ('EMP150','MAT-150','Préenregistré','pre@t.gov',2,400000)`);
    const bad = await api('POST', '/auth/register', { name: 'X', email: 'pre@t.gov', password: 'Agent1234' });
    assert.equal(bad.status, 400);
    const ok = await api('POST', '/auth/register', { name: 'Pré', email: 'pre@t.gov', password: 'Agent1234', matricule: 'mat-150' });
    assert.equal(ok.status, 201);
    tokens.pre = ok.body.token;
  });

  test('weak passwords are refused', async () => {
    const r = await api('POST', '/auth/register', { name: 'Weak', email: 'weak@t.gov', password: 'short' });
    assert.equal(r.status, 400);
  });

  test('employees cannot create employees nor list users', async () => {
    assert.equal((await api('POST', '/employees', { full_name: 'X', email: 'x@t.gov' }, 'agent')).status, 403);
    assert.equal((await api('GET', '/users', null, 'agent')).status, 403);
    assert.equal((await api('GET', '/employees', null)).status, 401);
  });

  test('salary is hidden from regular employees', async () => {
    const r = await api('GET', '/employees?q=Admin', null, 'agent');
    assert.equal(r.status, 200);
    assert.equal(r.body.data[0].salary, undefined);
    const hr = await api('GET', '/employees?q=Admin', null, 'rh');
    assert.equal(hr.body.data[0].salary, 900000);
  });
});

describe('employees & departments', () => {
  test('HR creates an employee with an auto-generated ID and a login', async () => {
    const r = await api('POST', '/employees', {
      full_name: 'Jean Test', email: 'jean@t.gov', department_id: 2, designation: 'Analyste',
      salary: 500000, createAccount: true, password: 'Jean12345',
    }, 'rh');
    assert.equal(r.status, 201);
    assert.match(r.body.employee_code, /^EMP\d+$/);
    const login = await api('POST', '/auth/login', { email: 'jean@t.gov', password: 'Jean12345' });
    assert.equal(login.status, 200);
    tokens.jean = login.body.token;
  });

  test('duplicate email is rejected with 409', async () => {
    const r = await api('POST', '/employees', { full_name: 'Dup', email: 'jean@t.gov' }, 'rh');
    assert.equal(r.status, 409);
  });

  test('advanced search filters by department and sorts', async () => {
    const r = await api('GET', '/employees?department=2&sort=name', null, 'rh');
    assert.ok(r.body.data.every((e) => e.department_id === 2));
    assert.ok(r.body.total >= 2);
  });

  test('department list returns employee count', async () => {
    const r = await api('GET', '/departments', null, 'agent');
    const dgc = r.body.find((d) => d.code === 'DGC');
    assert.ok(dgc.employee_count >= 2);
    assert.equal(dgc.manager_name, 'Chef DGC');
  });
});

describe('attendance', () => {
  test('check-in once, duplicate refused, then check-out', async () => {
    const first = await api('POST', '/attendance/check-in', { latitude: 14.69, longitude: -17.44 }, 'jean');
    assert.equal(first.status, 201);
    const dup = await api('POST', '/attendance/check-in', {}, 'jean');
    assert.equal(dup.status, 409);
    const out = await api('POST', '/attendance/check-out', {}, 'jean');
    assert.equal(out.status, 200);
    assert.ok(out.body.check_out);
    assert.equal((await api('POST', '/attendance/check-out', {}, 'jean')).status, 409);
  });

  test('concurrent check-ins create a single row', async () => {
    const results = await Promise.all([1, 2, 3].map(() => api('POST', '/attendance/check-in', {}, 'agent')));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM attendance a JOIN users u ON u.employee_id = a.employee_id WHERE u.email = 'agent@t.gov'`);
    assert.equal(rows[0].count, 1);
  });

  test('monthly report', async () => {
    const now = new Date();
    const r = await api('GET', `/attendance/report?year=${now.getFullYear()}&month=${now.getMonth() + 1}`, null, 'rh');
    assert.equal(r.status, 200);
    assert.ok(r.body.rows.find((x) => x.full_name === 'Jean Test').present_days >= 1);
  });
});

describe('leave management', () => {
  const start = nextMonday();
  let leaveId;

  test('counts business days and reserves the balance', async () => {
    const r = await api('POST', '/leaves', {
      leave_type: 'casual', start_date: start, end_date: addDays(start, 6), reason: 'Famille',
    }, 'jean');
    assert.equal(r.status, 201);
    assert.equal(r.body.days, 5); // Mon→Sun = 5 working days
    leaveId = r.body.id;
  });

  test('overlapping request is refused', async () => {
    const r = await api('POST', '/leaves', { leave_type: 'paid', start_date: addDays(start, 2), end_date: addDays(start, 3) }, 'jean');
    assert.equal(r.status, 409);
  });

  test('pending days count against the balance (no over-booking)', async () => {
    // 12 casual days - 5 pending = 7 left → a 10-day request must fail
    const s = addDays(start, 14);
    const r = await api('POST', '/leaves', { leave_type: 'casual', start_date: s, end_date: addDays(s, 13) }, 'jean');
    assert.equal(r.status, 400);
    assert.match(r.body.message, /Solde insuffisant/);
  });

  test('an employee cannot approve leave', async () => {
    assert.equal((await api('PATCH', `/leaves/${leaveId}/review`, { action: 'approve' }, 'agent')).status, 403);
  });

  test('department manager approves → balance decremented + notification', async () => {
    const r = await api('PATCH', `/leaves/${leaveId}/review`, { action: 'approve', comment: 'OK' }, 'chef');
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'approved');
    const bal = await api('GET', '/leaves/balance', null, 'jean');
    assert.equal(bal.body.casual_balance, 7);
    const notes = await api('GET', '/notifications', null, 'jean');
    assert.ok(notes.body.data.some((n) => n.title.includes('approuvée')));
    assert.equal((await api('PATCH', `/leaves/${leaveId}/review`, { action: 'reject' }, 'rh')).status, 409);
  });

  test('cancelling an approved future leave restores the balance', async () => {
    const r = await api('PATCH', `/leaves/${leaveId}/cancel`, {}, 'jean');
    assert.equal(r.status, 200);
    const bal = await api('GET', '/leaves/balance', null, 'jean');
    assert.equal(bal.body.casual_balance, 12);
  });
});

describe('payroll', () => {
  let slipId;
  test('generates payroll automatically and skips duplicates', async () => {
    const now = new Date();
    const body = { year: now.getFullYear(), month: now.getMonth() + 1, bonuses: { 1: 100000 } };
    const r = await api('POST', '/payroll/generate', body, 'rh');
    assert.equal(r.status, 201);
    assert.ok(r.body.generated >= 4);
    const again = await api('POST', '/payroll/generate', body, 'rh');
    assert.equal(again.body.generated, 0);

    const list = await api('GET', '/payroll', null, 'rh');
    const admin = list.body.find((p) => p.employee_id === 1);
    assert.equal(admin.bonuses, 100000);
    assert.equal(Math.round(admin.gross - admin.deductions - admin.tax), Math.round(admin.net));
    slipId = list.body.find((p) => p.full_name === 'Jean Test').id;
  });

  test('employees only see their own slips and can download the PDF', async () => {
    const mine = await api('GET', '/payroll', null, 'jean');
    assert.ok(mine.body.length >= 1 && mine.body.every((p) => p.full_name === 'Jean Test'));
    const pdf = await api('GET', `/payroll/${slipId}/pdf`, null, 'jean');
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(Buffer.from(pdf.body).subarray(0, 4).toString(), '%PDF');
    assert.equal((await api('GET', `/payroll/${slipId}/pdf`, null, 'agent')).status, 403);
  });
});

describe('projects (dossiers) circuit', () => {
  let id;
  const jeanEmp = async () => (await pool.query(`SELECT id FROM employees WHERE email = 'jean@t.gov'`)).rows[0].id;

  test('registers a dossier with reference, due date and history', async () => {
    const r = await api('POST', '/projects', {
      title: 'Avancement de grade', request_type_id: 1, deposit_type_id: 1, applicant_name: 'Usager Test',
    }, 'agent');
    assert.equal(r.status, 201);
    assert.match(r.body.reference, /^MFP-\d{4}-\d{5}$/);
    assert.equal(r.body.current_step, 1);
    assert.equal(r.body.due_date, addDays(toISODate(), 30));
    id = r.body.id;
  });

  test('a plain employee cannot assign an agent', async () => {
    const r = await api('POST', `/projects/${id}/actions`, { action: 'assign', agent_id: 1 }, 'agent');
    assert.equal(r.status, 403);
  });

  test('HR advances to the DGC step and assigns Jean as agent traitant', async () => {
    const r = await api('POST', `/projects/${id}/actions`, { action: 'advance', agent_id: await jeanEmp(), comment: 'Recevable' }, 'rh');
    assert.equal(r.status, 200);
    assert.equal(r.body.current_step, 2);
    assert.equal(r.body.department_id, 2);
    const notes = await api('GET', '/notifications', null, 'jean');
    assert.ok(notes.body.data.some((n) => n.type === 'project'));
  });

  test('agent requests documents, then resumes and advances', async () => {
    assert.equal((await api('POST', `/projects/${id}/actions`, { action: 'request_documents' }, 'jean')).status, 400);
    let r = await api('POST', `/projects/${id}/actions`, { action: 'request_documents', comment: 'Arrêté manquant' }, 'jean');
    assert.equal(r.body.status, 'awaiting_documents');
    assert.equal((await api('POST', `/projects/${id}/actions`, { action: 'advance' }, 'jean')).status, 400);
    r = await api('POST', `/projects/${id}/actions`, { action: 'resume' }, 'jean');
    assert.equal(r.body.status, 'in_progress');
    r = await api('POST', `/projects/${id}/actions`, { action: 'advance', comment: 'Avis favorable' }, 'jean');
    assert.equal(r.body.current_step, 3);
  });

  test('cannot close before last step; close at last step', async () => {
    const r = await api('POST', `/projects/${id}/actions`, { action: 'close', comment: 'Signé' }, 'admin');
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'completed');
    assert.ok(r.body.history.length >= 6);
    assert.equal((await api('POST', `/projects/${id}/actions`, { action: 'advance' }, 'admin')).status, 400);
  });

  test('unrelated employee cannot see the dossier', async () => {
    assert.equal((await api('GET', `/projects/${id}`, null, 'pre')).status, 404);
  });

  test('deposit receipt PDF', async () => {
    const r = await api('GET', `/projects/${id}/receipt`, null, 'rh');
    assert.equal(r.status, 200);
    assert.equal(Buffer.from(r.body).subarray(0, 4).toString(), '%PDF');
  });
});

describe('dashboard, reports & performance', () => {
  test('HR dashboard contains organisation KPIs', async () => {
    const r = await api('GET', '/dashboard', null, 'rh');
    assert.equal(r.status, 200);
    assert.ok(r.body.org.total_employees >= 5);
    assert.ok(Array.isArray(r.body.org.departments));
  });

  test('employee dashboard has no organisation data', async () => {
    const r = await api('GET', '/dashboard', null, 'jean');
    assert.equal(r.body.org, undefined);
  });

  test('department report and project report', async () => {
    const d = await api('GET', '/reports/departments', null, 'admin');
    assert.equal(d.status, 200);
    assert.ok(d.body[0].annual_salaries >= 0);
    const p = await api('GET', '/reports/projects', null, 'admin');
    assert.ok(p.body.byStatus.length >= 1);
    assert.equal((await api('GET', '/reports/departments', null, 'jean')).status, 403);
  });

  test('manager reviews a team member; insights computed', async () => {
    const empId = (await pool.query(`SELECT id FROM employees WHERE email = 'jean@t.gov'`)).rows[0].id;
    const r = await api('POST', '/performance', {
      employee_id: empId, period: '2026 – S1', rating: 4, feedback: 'Bien', status: 'completed',
      goals: [{ title: 'Objectif 1', progress: 50 }],
    }, 'chef');
    assert.equal(r.status, 201);
    const upd = await api('PUT', `/performance/${r.body.id}`, { goals: [{ progress: 100, done: true, title: 'hacked' }] }, 'jean');
    assert.equal(upd.body.goals[0].title, 'Objectif 1');
    assert.equal(upd.body.goals[0].done, true);
    const ins = await api('GET', `/performance/insights/${empId}`, null, 'jean');
    assert.equal(ins.status, 200);
    assert.ok(ins.body.score > 0);
    assert.equal((await api('POST', '/performance', { employee_id: 1, period: 'x' }, 'jean')).status, 403);
  });

  test('announcement notifies every user', async () => {
    const r = await api('POST', '/announcements', { title: 'Réunion', content: 'Lundi 9h' }, 'rh');
    assert.equal(r.status, 201);
    const n = await api('GET', '/notifications', null, 'agent');
    assert.ok(n.body.data.some((x) => x.type === 'announcement'));
  });
});
