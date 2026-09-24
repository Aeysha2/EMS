-- ============================================================================
-- SIGRH — Système Intégré de Gestion des Ressources Humaines
-- de l'Administration Publique Sénégalaise — schéma PostgreSQL (idempotent)
-- ============================================================================

-- ---------------------------------------------------------------- Référentiels

-- Référentiel national des structures : Présidence, SGG, ministères, directions, services.
-- institution_id = structure de tête (Présidence, SGG ou ministère) : c'est le périmètre d'habilitation.
CREATE TABLE IF NOT EXISTS structures (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(30)  NOT NULL UNIQUE,
  name            VARCHAR(200) NOT NULL,
  sigle           VARCHAR(30),
  type            VARCHAR(20)  NOT NULL
                  CHECK (type IN ('presidence','sgg','ministere','direction','service','deconcentree')),
  parent_id       INTEGER REFERENCES structures(id) ON DELETE RESTRICT,
  institution_id  INTEGER REFERENCES structures(id) ON DELETE RESTRICT,
  head_agent_id   INTEGER,
  region          VARCHAR(60),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (type IN ('presidence','sgg','ministere') OR parent_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_structures_parent ON structures(parent_id);
CREATE INDEX IF NOT EXISTS idx_structures_institution ON structures(institution_id);

-- Mise à jour collaborative du référentiel, validée centralement (SGG / DSI)
CREATE TABLE IF NOT EXISTS structure_requests (
  id              SERIAL PRIMARY KEY,
  action          VARCHAR(20) NOT NULL CHECK (action IN ('create','update','deactivate')),
  structure_id    INTEGER REFERENCES structures(id) ON DELETE CASCADE,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  institution_id  INTEGER REFERENCES structures(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by    INTEGER,
  reviewed_by     INTEGER,
  review_comment  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ
);

-- Corps de la fonction publique (référentiel DGFP)
CREATE TABLE IF NOT EXISTS corps (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(20)  NOT NULL UNIQUE,
  name        VARCHAR(150) NOT NULL,
  hierarchie  CHAR(1) NOT NULL CHECK (hierarchie IN ('A','B','C','D')),
  description TEXT
);

-- ---------------------------------------------------------------- Agent public

CREATE SEQUENCE IF NOT EXISTS sigrh_agent_seq;

CREATE TABLE IF NOT EXISTS employees (
  id                    SERIAL PRIMARY KEY,
  sigrh_id              VARCHAR(20)  NOT NULL UNIQUE,          -- identifiant unique et pérenne
  matricule_solde       VARCHAR(30)  UNIQUE,                   -- clé d'interconnexion avec la Solde
  nin_enc               TEXT,                                  -- NIN chiffré (AES-256-GCM)
  nin_hash              VARCHAR(64)  UNIQUE,                   -- empreinte HMAC du NIN (recherche, doublons)
  first_name            VARCHAR(100) NOT NULL,
  last_name             VARCHAR(100) NOT NULL,
  full_name             VARCHAR(201) GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  sexe                  CHAR(1) CHECK (sexe IN ('M','F')),
  date_of_birth         DATE,
  place_of_birth        VARCHAR(100),
  nationality           VARCHAR(60) DEFAULT 'Sénégalaise',
  marital_status        VARCHAR(20),
  children_count        INTEGER NOT NULL DEFAULT 0 CHECK (children_count >= 0),
  email                 VARCHAR(150) NOT NULL UNIQUE,
  phone                 VARCHAR(40),
  address               TEXT,
  structure_id          INTEGER REFERENCES structures(id) ON DELETE RESTRICT,
  fonction              VARCHAR(150),
  corps_id              INTEGER REFERENCES corps(id) ON DELETE SET NULL,
  hierarchie            CHAR(1) CHECK (hierarchie IN ('A','B','C','D')),
  grade                 VARCHAR(40),
  echelon               INTEGER CHECK (echelon BETWEEN 1 AND 20),
  statut_emploi         VARCHAR(20) NOT NULL DEFAULT 'fonctionnaire'
                        CHECK (statut_emploi IN ('fonctionnaire','contractuel','stagiaire','non_permanent')),
  position_statutaire   VARCHAR(20) NOT NULL DEFAULT 'activite'
                        CHECK (position_statutaire IN ('activite','stage','detachement','disponibilite','suspension',
                                                       'retraite','demission','radiation','deces')),
  date_entree_fp        DATE,                                  -- entrée dans la fonction publique
  date_prise_service    DATE,                                  -- prise de service dans l'affectation actuelle
  salary                NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (salary >= 0),  -- salaire de base (référence Solde)
  biometric_id          VARCHAR(40) UNIQUE,
  biometric_enrolled_at TIMESTAMPTZ,
  identity_verified_at  TIMESTAMPTZ,                           -- contrôle auprès de l'état civil
  is_immersion          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employees_structure ON employees(structure_id);
CREATE INDEX IF NOT EXISTS idx_employees_position ON employees(position_statutaire);
CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(lower(full_name));
CREATE INDEX IF NOT EXISTS idx_employees_corps ON employees(corps_id);

DO $$ BEGIN
  ALTER TABLE structures ADD CONSTRAINT structures_head_fk
    FOREIGN KEY (head_agent_id) REFERENCES employees(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Postes (référentiel des postes et fonctions)
CREATE TABLE IF NOT EXISTS positions (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(30) NOT NULL UNIQUE,
  title         VARCHAR(150) NOT NULL,
  structure_id  INTEGER NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  corps_id      INTEGER REFERENCES corps(id) ON DELETE SET NULL,
  hierarchie    CHAR(1) CHECK (hierarchie IN ('A','B','C','D')),
  is_budgeted   BOOLEAN NOT NULL DEFAULT TRUE,
  employee_id   INTEGER UNIQUE REFERENCES employees(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_positions_structure ON positions(structure_id);

CREATE TABLE IF NOT EXISTS agent_diplomas (
  id            SERIAL PRIMARY KEY,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title         VARCHAR(200) NOT NULL,
  level         VARCHAR(60),
  school        VARCHAR(200),
  year          INTEGER CHECK (year BETWEEN 1940 AND 2100),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historique des affectations
CREATE TABLE IF NOT EXISTS affectations (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  structure_id    INTEGER NOT NULL REFERENCES structures(id),
  fonction        VARCHAR(150),
  start_date      DATE NOT NULL,
  end_date        DATE,
  acte_reference  VARCHAR(80),
  request_id      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_affectations_employee ON affectations(employee_id, start_date DESC);

-- Actes de carrière, sanctions et distinctions
CREATE TABLE IF NOT EXISTS career_events (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type            VARCHAR(30) NOT NULL CHECK (type IN (
                    'recrutement','titularisation','avancement','promotion','nomination','mutation',
                    'detachement','disponibilite','reintegration','suspension','sanction','distinction',
                    'formation','retraite','demission','radiation','deces')),
  effective_date  DATE NOT NULL,
  acte_reference  VARCHAR(80),
  description     TEXT,
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id      INTEGER,
  created_by      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_career_employee ON career_events(employee_id, effective_date DESC);

-- Traçabilité : toute modification d'une donnée RH (auteur, date, valeur avant/après)
CREATE TABLE IF NOT EXISTS record_changes (
  id          SERIAL PRIMARY KEY,
  entity      VARCHAR(40) NOT NULL,
  entity_id   INTEGER NOT NULL,
  field       VARCHAR(60) NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  user_id     INTEGER,
  request_id  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_changes_entity ON record_changes(entity, entity_id, created_at DESC);

-- ---------------------------------------------------------------- Comptes et habilitations

CREATE TABLE IF NOT EXISTS users (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(150) NOT NULL,
  email               VARCHAR(150) NOT NULL UNIQUE,
  password_hash       VARCHAR(100) NOT NULL,
  role                VARCHAR(20)  NOT NULL DEFAULT 'agent'
                      CHECK (role IN ('agent','gestionnaire_rh','pilotage','admin_dsi')),
  employee_id         INTEGER UNIQUE REFERENCES employees(id) ON DELETE SET NULL,
  structure_id        INTEGER REFERENCES structures(id),          -- ancrage du périmètre
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  totp_secret_enc     TEXT,
  totp_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at       TIMESTAMPTZ,
  rights_reviewed_at  TIMESTAMPTZ,
  rights_reviewed_by  INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- Circuits de validation (workflows)

CREATE TABLE IF NOT EXISTS workflow_types (
  id                  SERIAL PRIMARY KEY,
  code                VARCHAR(20)  NOT NULL UNIQUE,
  name                VARCHAR(150) NOT NULL,
  category            VARCHAR(20)  NOT NULL CHECK (category IN ('absence','carriere','formation','administratif')),
  effect              VARCHAR(20)  NOT NULL DEFAULT 'none'
                      CHECK (effect IN ('none','leave','mutation','avancement','nomination','position',
                                        'titularisation','retraite','formation')),
  sla_days            INTEGER NOT NULL DEFAULT 30 CHECK (sla_days > 0),
  required_documents  TEXT,
  description         TEXT,
  agent_can_submit    BOOLEAN NOT NULL DEFAULT TRUE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE
);

-- Étapes paramétrables. assignee_kind désigne QUI valide, résolu selon la hiérarchie de l'agent :
--   chef_structure    : responsable de la structure de l'agent
--   chef_superieur    : responsable de la structure parente
--   drh_institution   : gestionnaires RH de l'institution de l'agent
--   drh_destination   : gestionnaires RH de l'institution d'accueil (mutation interministérielle)
--   structure         : une structure précise (ex. DGFP) — ses gestionnaires ou son responsable
--   pilotage          : SGG / Présidence
CREATE TABLE IF NOT EXISTS workflow_steps (
  id              SERIAL PRIMARY KEY,
  type_id         INTEGER NOT NULL REFERENCES workflow_types(id) ON DELETE CASCADE,
  step_order      INTEGER NOT NULL CHECK (step_order > 0),
  name            VARCHAR(150) NOT NULL,
  assignee_kind   VARCHAR(20) NOT NULL CHECK (assignee_kind IN
                    ('chef_structure','chef_superieur','drh_institution','drh_destination','structure','pilotage')),
  structure_id    INTEGER REFERENCES structures(id) ON DELETE SET NULL,
  expected_days   INTEGER NOT NULL DEFAULT 5 CHECK (expected_days > 0),
  UNIQUE (type_id, step_order)
);

CREATE SEQUENCE IF NOT EXISTS request_reference_seq;

CREATE TABLE IF NOT EXISTS requests (
  id                    SERIAL PRIMARY KEY,
  reference             VARCHAR(30) NOT NULL UNIQUE,
  type_id               INTEGER NOT NULL REFERENCES workflow_types(id),
  title                 VARCHAR(200) NOT NULL,
  description           TEXT,
  employee_id           INTEGER REFERENCES employees(id) ON DELETE CASCADE,   -- agent concerné
  institution_id        INTEGER REFERENCES structures(id),                    -- périmètre propriétaire
  deposit_channel       VARCHAR(20) NOT NULL DEFAULT 'portail'
                        CHECK (deposit_channel IN ('portail','guichet','courrier','structure','interop')),
  payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority              VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  current_step          INTEGER NOT NULL DEFAULT 1,
  status                VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                        CHECK (status IN ('in_progress','awaiting_documents','approved','rejected','cancelled')),
  assigned_employee_id  INTEGER REFERENCES employees(id) ON DELETE SET NULL,   -- agent traitant
  step_started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  step_due_date         DATE,
  due_date              DATE,
  alert_sent_at         TIMESTAMPTZ,
  created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_institution ON requests(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_employee ON requests(employee_id);

CREATE TABLE IF NOT EXISTS request_history (
  id                    SERIAL PRIMARY KEY,
  request_id            INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  step_order            INTEGER,
  step_name             VARCHAR(150),
  action                VARCHAR(30) NOT NULL,
  comment               TEXT,
  assigned_employee_id  INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  user_id               INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_request_history ON request_history(request_id, created_at);

-- ---------------------------------------------------------------- Temps de travail et absences

CREATE TABLE IF NOT EXISTS leave_types (
  code               VARCHAR(20) PRIMARY KEY,
  label              VARCHAR(100) NOT NULL,
  annual_quota       NUMERIC(5,1),                -- NULL = pas de solde (maladie, mission…)
  business_days      BOOLEAN NOT NULL DEFAULT TRUE,
  requires_document  BOOLEAN NOT NULL DEFAULT FALSE,
  workflow_code      VARCHAR(20) NOT NULL DEFAULT 'CONGE',   -- circuit de validation utilisé
  is_active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS leave_balances (
  employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type   VARCHAR(20) NOT NULL REFERENCES leave_types(code),
  year         INTEGER NOT NULL,
  allotted     NUMERIC(5,1) NOT NULL,
  used         NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (employee_id, leave_type, year)
);

CREATE TABLE IF NOT EXISTS leaves (
  id           SERIAL PRIMARY KEY,
  employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type   VARCHAR(20) NOT NULL REFERENCES leave_types(code),
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  days         NUMERIC(5,1) NOT NULL,
  reason       TEXT,
  destination  VARCHAR(150),                      -- missions
  status       VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  request_id   INTEGER REFERENCES requests(id) ON DELETE SET NULL,
  decided_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_leaves_employee ON leaves(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_leaves_dates ON leaves(start_date, end_date);

CREATE TABLE IF NOT EXISTS attendance (
  id             SERIAL PRIMARY KEY,
  employee_id    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date      DATE NOT NULL,
  check_in       TIMESTAMPTZ,
  check_out      TIMESTAMPTZ,
  working_hours  NUMERIC(5,2) NOT NULL DEFAULT 0,
  overtime       NUMERIC(5,2) NOT NULL DEFAULT 0,
  status         VARCHAR(20) NOT NULL DEFAULT 'present'
                 CHECK (status IN ('present','late','half_day','absent','on_leave','mission','holiday')),
  source         VARCHAR(20) NOT NULL DEFAULT 'portail' CHECK (source IN ('portail','mobile','biometrie','manuel','cloture')),
  device_id      VARCHAR(40),
  latitude       NUMERIC(9,6),
  longitude      NUMERIC(9,6),
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_unique_day UNIQUE (employee_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(work_date);

-- ---------------------------------------------------------------- Formation

CREATE TABLE IF NOT EXISTS trainings (
  id             SERIAL PRIMARY KEY,
  code           VARCHAR(20) NOT NULL UNIQUE,
  title          VARCHAR(200) NOT NULL,
  provider       VARCHAR(150),
  domain         VARCHAR(100),
  duration_days  INTEGER NOT NULL DEFAULT 1 CHECK (duration_days > 0),
  is_certifying  BOOLEAN NOT NULL DEFAULT FALSE,
  description    TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS training_sessions (
  id              SERIAL PRIMARY KEY,
  training_id     INTEGER NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  location        VARCHAR(150),
  capacity        INTEGER NOT NULL DEFAULT 20 CHECK (capacity > 0),
  institution_id  INTEGER REFERENCES structures(id),     -- NULL = session interministérielle
  status          VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','ongoing','done','cancelled')),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS enrollments (
  id            SERIAL PRIMARY KEY,
  session_id    INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status        VARCHAR(20) NOT NULL DEFAULT 'requested'
                CHECK (status IN ('requested','validated','rejected','attended','certified','absent','cancelled')),
  request_id    INTEGER REFERENCES requests(id) ON DELETE SET NULL,
  result        VARCHAR(150),
  certified_at  DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, employee_id)
);

-- ---------------------------------------------------------------- Évaluation

CREATE TABLE IF NOT EXISTS performance_reviews (
  id            SERIAL PRIMARY KEY,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reviewer_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  period        VARCHAR(40) NOT NULL,
  review_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  rating        NUMERIC(2,1) CHECK (rating BETWEEN 1 AND 5),
  feedback      TEXT,
  goals         JSONB NOT NULL DEFAULT '[]'::jsonb,
  indicators    JSONB NOT NULL DEFAULT '[]'::jsonb,       -- indicateurs de performance individuelle
  status        VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_employee ON performance_reviews(employee_id);

-- ---------------------------------------------------------------- Rémunération et interconnexion Solde

-- Bulletins dématérialisés (source Solde) et simulations de primes et indemnités
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
  source         VARCHAR(20) NOT NULL DEFAULT 'solde' CHECK (source IN ('solde','simulation')),
  import_id      INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_unique_period UNIQUE (employee_id, period_year, period_month, source)
);
CREATE INDEX IF NOT EXISTS idx_payrolls_period ON payrolls(period_year, period_month);

CREATE TABLE IF NOT EXISTS solde_imports (
  id            SERIAL PRIMARY KEY,
  period_year   INTEGER NOT NULL,
  period_month  INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  source        VARCHAR(20) NOT NULL DEFAULT 'fichier' CHECK (source IN ('fichier','interop')),
  filename      VARCHAR(200),
  line_count    INTEGER NOT NULL DEFAULT 0,
  total_gross   NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_net     NUMERIC(16,2) NOT NULL DEFAULT 0,
  imported_by   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS solde_lines (
  id               SERIAL PRIMARY KEY,
  import_id        INTEGER NOT NULL REFERENCES solde_imports(id) ON DELETE CASCADE,
  matricule_solde  VARCHAR(30) NOT NULL,
  full_name        VARCHAR(200),
  gross            NUMERIC(14,2) NOT NULL DEFAULT 0,
  net              NUMERIC(14,2) NOT NULL DEFAULT 0,
  base_salary      NUMERIC(14,2),
  employee_id      INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  raw              JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_solde_lines_import ON solde_lines(import_id);

-- ---------------------------------------------------------------- Interopérabilité

CREATE TABLE IF NOT EXISTS api_clients (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(150) NOT NULL,
  structure_id   INTEGER REFERENCES structures(id),
  key_prefix     VARCHAR(12) NOT NULL,
  key_hash       VARCHAR(64) NOT NULL UNIQUE,
  scopes         TEXT[] NOT NULL DEFAULT '{}',
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS interop_logs (
  id          SERIAL PRIMARY KEY,
  client_id   INTEGER REFERENCES api_clients(id) ON DELETE SET NULL,
  method      VARCHAR(10) NOT NULL,
  path        VARCHAR(200) NOT NULL,
  status      INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- Reprise des données

CREATE TABLE IF NOT EXISTS import_batches (
  id              SERIAL PRIMARY KEY,
  institution_id  INTEGER NOT NULL REFERENCES structures(id),
  filename        VARCHAR(200),
  status          VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','applied','rejected')),
  stats           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by      INTEGER,
  validated_by    INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS import_rows (
  id                   SERIAL PRIMARY KEY,
  batch_id             INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number           INTEGER NOT NULL,
  data                 JSONB NOT NULL,
  errors               TEXT[] NOT NULL DEFAULT '{}',
  duplicate_of         INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  duplicate_reason     VARCHAR(100),
  applied_employee_id  INTEGER REFERENCES employees(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------- Documents, communication, audit

CREATE TABLE IF NOT EXISTS documents (
  id            SERIAL PRIMARY KEY,
  employee_id   INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  request_id    INTEGER REFERENCES requests(id) ON DELETE CASCADE,
  category      VARCHAR(60),
  name          VARCHAR(200) NOT NULL,
  mime_type     VARCHAR(100),
  size_bytes    INTEGER,
  content       BYTEA NOT NULL,
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (employee_id IS NOT NULL OR request_id IS NOT NULL)
);

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
  id              SERIAL PRIMARY KEY,
  title           VARCHAR(200) NOT NULL,
  content         TEXT NOT NULL,
  event_date      DATE,
  institution_id  INTEGER REFERENCES structures(id),   -- NULL = annonce nationale
  author_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Journal d'audit infalsifiable : chaque ligne contient l'empreinte de la précédente
CREATE TABLE IF NOT EXISTS activity_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),        -- les comptes ne sont jamais supprimés, seulement désactivés
  action      VARCHAR(80) NOT NULL,
  entity      VARCHAR(40),
  entity_id   INTEGER,
  details     TEXT,
  ip          VARCHAR(60),
  prev_hash   VARCHAR(64) NOT NULL,
  hash        VARCHAR(64) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);

-- Empêche toute modification ou suppression d'une ligne du journal (même par l'application)
CREATE OR REPLACE FUNCTION activity_logs_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Le journal d''audit est en ajout seul';
END $$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER activity_logs_no_update BEFORE UPDATE OR DELETE ON activity_logs
    FOR EACH ROW EXECUTE FUNCTION activity_logs_immutable();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
