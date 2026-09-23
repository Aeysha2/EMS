-- Employee Management System — PostgreSQL schema (idempotent)

CREATE TABLE IF NOT EXISTS departments (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL UNIQUE,
  code          VARCHAR(20)  UNIQUE,
  description   TEXT,
  budget        NUMERIC(14,2) NOT NULL DEFAULT 0,
  manager_id    INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  id               SERIAL PRIMARY KEY,
  employee_code    VARCHAR(20)  NOT NULL UNIQUE,
  matricule        VARCHAR(40)  UNIQUE,
  full_name        VARCHAR(150) NOT NULL,
  email            VARCHAR(150) NOT NULL UNIQUE,
  phone            VARCHAR(40),
  department_id    INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  designation      VARCHAR(120),
  grade            VARCHAR(40),
  date_of_joining  DATE NOT NULL DEFAULT CURRENT_DATE,
  date_of_birth    DATE,
  address          TEXT,
  salary           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (salary >= 0),
  status           VARCHAR(20) NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','suspended','on_leave','retired','terminated')),
  casual_balance   NUMERIC(5,1) NOT NULL DEFAULT 12,
  sick_balance     NUMERIC(5,1) NOT NULL DEFAULT 10,
  paid_balance     NUMERIC(5,1) NOT NULL DEFAULT 24,
  balance_year     INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE departments ADD CONSTRAINT departments_manager_fk
    FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_name_lower ON employees(lower(full_name));

CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(150) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,
  password_hash  VARCHAR(100) NOT NULL,
  role           VARCHAR(20)  NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','hr','employee')),
  employee_id    INTEGER UNIQUE REFERENCES employees(id) ON DELETE SET NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance (
  id             SERIAL PRIMARY KEY,
  employee_id    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date      DATE NOT NULL,
  check_in       TIMESTAMPTZ,
  check_out      TIMESTAMPTZ,
  working_hours  NUMERIC(5,2) NOT NULL DEFAULT 0,
  overtime       NUMERIC(5,2) NOT NULL DEFAULT 0,
  status         VARCHAR(20) NOT NULL DEFAULT 'present'
                 CHECK (status IN ('present','late','half_day','absent','on_leave','holiday')),
  latitude       NUMERIC(9,6),
  longitude      NUMERIC(9,6),
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Challenge #4: prevent duplicate attendance entries
  CONSTRAINT attendance_unique_day UNIQUE (employee_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(work_date);

CREATE TABLE IF NOT EXISTS leaves (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type      VARCHAR(20) NOT NULL CHECK (leave_type IN ('casual','sick','paid','unpaid')),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  days            NUMERIC(5,1) NOT NULL,
  reason          TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  review_comment  TEXT,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_leaves_employee ON leaves(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_leaves_dates ON leaves(start_date, end_date);

CREATE TABLE IF NOT EXISTS payrolls (
  id             SERIAL PRIMARY KEY,
  employee_id    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_year    INTEGER NOT NULL,
  period_month   INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  basic          NUMERIC(14,2) NOT NULL,
  allowances     NUMERIC(14,2) NOT NULL DEFAULT 0,
  bonuses        NUMERIC(14,2) NOT NULL DEFAULT 0,
  overtime_pay   NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross          NUMERIC(14,2) NOT NULL,
  deductions     NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax            NUMERIC(14,2) NOT NULL DEFAULT 0,
  net            NUMERIC(14,2) NOT NULL,
  details        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         VARCHAR(20) NOT NULL DEFAULT 'processed' CHECK (status IN ('processed','paid')),
  generated_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_unique_period UNIQUE (employee_id, period_year, period_month)
);
CREATE INDEX IF NOT EXISTS idx_payrolls_period ON payrolls(period_year, period_month);

CREATE TABLE IF NOT EXISTS performance_reviews (
  id            SERIAL PRIMARY KEY,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reviewer_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  period        VARCHAR(40) NOT NULL,
  review_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  rating        NUMERIC(2,1) CHECK (rating BETWEEN 1 AND 5),
  feedback      TEXT,
  goals         JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_employee ON performance_reviews(employee_id);

CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(30) NOT NULL,
  title       VARCHAR(200) NOT NULL,
  message     TEXT,
  link        VARCHAR(200),
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS announcements (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  content     TEXT NOT NULL,
  event_date  DATE,
  author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(60) NOT NULL,
  entity      VARCHAR(40),
  entity_id   INTEGER,
  details     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);

-- ============ Ministère : enregistrement et circuit des projets / dossiers ============

CREATE TABLE IF NOT EXISTS deposit_types (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(120) NOT NULL UNIQUE,
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS request_types (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(20)  NOT NULL UNIQUE,
  name         VARCHAR(150) NOT NULL UNIQUE,
  description  TEXT,
  sla_days     INTEGER NOT NULL DEFAULT 30 CHECK (sla_days > 0),
  required_documents TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

-- Circuit (workflow) steps. request_type_id NULL = default circuit.
CREATE TABLE IF NOT EXISTS circuit_steps (
  id               SERIAL PRIMARY KEY,
  request_type_id  INTEGER REFERENCES request_types(id) ON DELETE CASCADE,
  step_order       INTEGER NOT NULL CHECK (step_order > 0),
  name             VARCHAR(120) NOT NULL,
  department_id    INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  expected_days    INTEGER NOT NULL DEFAULT 5
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_circuit_type_order
  ON circuit_steps (COALESCE(request_type_id, 0), step_order);

CREATE SEQUENCE IF NOT EXISTS project_reference_seq;

CREATE TABLE IF NOT EXISTS projects (
  id                   SERIAL PRIMARY KEY,
  reference            VARCHAR(30) NOT NULL UNIQUE,
  title                VARCHAR(200) NOT NULL,
  description          TEXT,
  request_type_id      INTEGER NOT NULL REFERENCES request_types(id),
  deposit_type_id      INTEGER NOT NULL REFERENCES deposit_types(id),
  applicant_name       VARCHAR(150) NOT NULL,
  applicant_matricule  VARCHAR(40),
  applicant_phone      VARCHAR(40),
  applicant_email      VARCHAR(150),
  applicant_structure  VARCHAR(150),
  deposit_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date             DATE,
  priority             VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  current_step         INTEGER NOT NULL DEFAULT 1,
  status               VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                       CHECK (status IN ('in_progress','awaiting_documents','rejected','completed')),
  agent_id             INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  department_id        INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  closed_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_agent ON projects(agent_id);
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(request_type_id);

CREATE TABLE IF NOT EXISTS project_history (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step_order   INTEGER,
  step_name    VARCHAR(120),
  action       VARCHAR(30) NOT NULL,
  from_agent   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  to_agent     INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  comment      TEXT,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_history ON project_history(project_id, created_at);

CREATE TABLE IF NOT EXISTS documents (
  id            SERIAL PRIMARY KEY,
  employee_id   INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  project_id    INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  name          VARCHAR(200) NOT NULL,
  category      VARCHAR(60),
  mime_type     VARCHAR(100),
  size_bytes    INTEGER,
  content       BYTEA NOT NULL,
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (employee_id IS NOT NULL OR project_id IS NOT NULL)
);
