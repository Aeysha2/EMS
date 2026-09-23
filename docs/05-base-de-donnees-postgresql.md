# 5. La base de données PostgreSQL

Ce document explique pourquoi on a choisi PostgreSQL, comment l'installer, comment la base est organisée (les 16 tables) et comment l'utiliser au quotidien avec pgAdmin.

## 5.1 Pourquoi PostgreSQL ?

PostgreSQL est une base **relationnelle** : les données sont rangées dans des **tables** (comme des feuilles Excel), et les tables sont **reliées** entre elles par des identifiants.

Dans un système RH, tout est lié : un congé appartient à un employé, qui appartient à un département, dont le responsable est un autre employé… Une base relationnelle est faite pour ça :

| Besoin du projet | Ce que PostgreSQL apporte |
| --- | --- |
| Un seul pointage par jour | Contrainte `UNIQUE (employee_id, work_date)` : la base refuse le doublon, même si le code a un bug |
| Pas de congé pour un employé inexistant | **Clé étrangère** : `employee_id` doit exister dans `employees` |
| Soldes de congé exacts | **Transactions** : plusieurs modifications réussissent ensemble, ou sont toutes annulées |
| Rapports (totaux par département, par mois) | SQL : `GROUP BY`, `SUM`, `COUNT`, jointures |
| Statuts toujours valides | Contrainte `CHECK (status IN (...))` |

**Comparaison avec MongoDB** (utilisé dans food-app) : MongoDB range des « documents » JSON sans schéma imposé. C'est souple pour un catalogue de plats, mais pour des données RH très liées et des règles strictes, PostgreSQL protège mieux la cohérence.

## 5.2 Installer PostgreSQL (Windows)

1. Télécharger l'installateur sur **https://www.postgresql.org/download/windows/** (lien « Download the installer », distribution EDB).
2. Lancer l'installateur et laisser cochés : *PostgreSQL Server*, *pgAdmin 4*, *Command Line Tools*.
3. **Mot de passe** : choisir un mot de passe pour l'utilisateur `postgres` (le « super-administrateur »). **Le noter.**
4. **Port** : laisser `5432`.
5. *Locale* : laisser la valeur par défaut. Terminer (Stack Builder n'est pas nécessaire).
6. Le service PostgreSQL démarre automatiquement avec Windows. Pour le vérifier : touche Windows → `services.msc` → *postgresql-x64-18* (le numéro dépend de la version) → *En cours d'exécution*.

**Mac** : installer *Postgres.app* (postgresapp.com) ou `brew install postgresql@18`, puis installer pgAdmin séparément.

**Deux mots de passe différents** :
- le **master password de pgAdmin** : il protège seulement l'application pgAdmin ;
- le **mot de passe de l'utilisateur `postgres`** : c'est celui de la base de données.

## 5.3 Créer la base et l'utilisateur du projet

### Avec pgAdmin (méthode visuelle)
1. Ouvrir pgAdmin, déplier **Servers → PostgreSQL 18** (saisir le mot de passe de `postgres` si demandé).
2. Clic droit sur **Databases → Create → Database…** → *Database* : `ems` → **Save**.
3. Clic droit sur **ems → Query Tool**, coller puis exécuter (▶ ou F5) :
```sql
CREATE USER ems_user WITH PASSWORD 'ems2026';
ALTER DATABASE ems OWNER TO ems_user;
```

**Pourquoi un utilisateur à part ?** Si l'application utilisait `postgres` (qui a tous les droits sur **toutes** les bases), une faille dans l'application exposerait aussi les autres projets (par exemple `gesAdmin`). `ems_user` n'a de droits que sur `ems`. C'est le **principe du moindre privilège**.

### Avec la ligne de commande (alternative)
```bash
psql -U postgres
```
Puis, dans psql :
```sql
CREATE USER ems_user WITH PASSWORD 'ems2026';
CREATE DATABASE ems OWNER ems_user;
CREATE DATABASE ems_test OWNER ems_user;   -- base réservée aux tests
\q
```
(`\q` quitte psql. Sous Windows, si `psql` n'est pas reconnu, ajouter `C:\Program Files\PostgreSQL\18\bin` au PATH, ou utiliser *SQL Shell (psql)* dans le menu Démarrer.)

### Relier l'application à la base
Dans `server/.env` :
```
DATABASE_URL=postgresql://ems_user:ems2026@localhost:5432/ems
```

| Partie | Signification |
| --- | --- |
| `postgresql://` | Le protocole |
| `ems_user` | L'utilisateur |
| `ems2026` | Son mot de passe (s'il contient `@`, `#`, `/`, `:`, le remplacer par son code : `@` → `%40`, `#` → `%23`) |
| `localhost` | La base est sur cet ordinateur |
| `5432` | Le port |
| `ems` | Le nom de la base |

**Il n'y a pas besoin de créer les tables à la main** : au démarrage, le serveur exécute `server/db/schema.sql`, qui crée ce qui manque. Ensuite, `npm run seed` remplit la base avec les données de démonstration.

## 5.4 Le schéma : les 16 tables

```mermaid
erDiagram
  departments ||--o{ employees : "contient"
  employees |o--o| departments : "dirige (manager_id)"
  employees ||--o| users : "a un compte"
  employees ||--o{ attendance : "pointe"
  employees ||--o{ leaves : "demande"
  employees ||--o{ payrolls : "reçoit"
  employees ||--o{ performance_reviews : "est évalué"
  users ||--o{ notifications : "reçoit"
  users ||--o{ activity_logs : "fait"
  users ||--o{ announcements : "publie"
  request_types ||--o{ projects : "type de demande"
  deposit_types ||--o{ projects : "type de dépôt"
  request_types ||--o{ circuit_steps : "circuit spécifique"
  departments ||--o{ circuit_steps : "service de l'étape"
  employees ||--o{ projects : "agent traitant"
  projects ||--o{ project_history : "historique"
  projects ||--o{ documents : "pièces jointes"
```

Lecture : `||--o{` = « un … plusieurs ». Par exemple, un département contient plusieurs employés.

### Les tables du personnel

**`departments`** : les directions et services.
| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | `SERIAL` | Identifiant automatique (1, 2, 3…) — **clé primaire** |
| `name` | `VARCHAR(120)` | Nom, unique |
| `code` | `VARCHAR(20)` | Sigle (DRH, DSI…), unique |
| `description` | `TEXT` | Texte libre |
| `budget` | `NUMERIC(14,2)` | Budget annuel (14 chiffres dont 2 décimales) |
| `manager_id` | `INTEGER` → `employees.id` | Le responsable (chef de service) |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | Dates de création et de modification |

**`employees`** : la fiche de chaque agent.
| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | `SERIAL` | Clé primaire |
| `employee_code` | `VARCHAR(20)` unique | `EMP101`… |
| `matricule` | `VARCHAR(40)` unique | Matricule de la Fonction publique |
| `full_name`, `email` (unique), `phone`, `address` | texte | Identité et contact |
| `department_id` | → `departments.id` | Son département (`ON DELETE SET NULL` : si le département est supprimé, l'agent reste, sans département) |
| `designation`, `grade` | texte | Fonction et grade |
| `date_of_joining`, `date_of_birth` | `DATE` | Dates |
| `salary` | `NUMERIC(14,2)` `CHECK (salary >= 0)` | Salaire de base **mensuel** |
| `status` | `CHECK IN ('active','suspended','on_leave','retired','terminated')` | Statut |
| `casual_balance`, `sick_balance`, `paid_balance` | `NUMERIC(5,1)` | Soldes de congés (12, 10 et 24 par défaut) |
| `balance_year` | `INTEGER` | Année des soldes (pour la remise à zéro annuelle) |

**`users`** : les comptes de connexion.
| Colonne | Rôle |
| --- | --- |
| `email` (unique), `name` | Identifiants |
| `password_hash` | Empreinte bcrypt, **jamais** le mot de passe en clair |
| `role` | `CHECK IN ('admin','hr','employee')` |
| `employee_id` | → `employees.id`, unique : un compte par employé au maximum |
| `is_active` | Compte actif ou désactivé |
| `last_login_at` | Dernière connexion |

Pourquoi séparer `users` et `employees` ? Un employé peut exister sans compte (créé par les RH avant son arrivée), et un compte technique peut exister sans fiche employé.

**`attendance`** : un pointage par agent et par jour.
| Colonne | Rôle |
| --- | --- |
| `employee_id` | → `employees.id` (`ON DELETE CASCADE` : supprimer l'employé supprime ses pointages) |
| `work_date` | Le jour |
| `check_in`, `check_out` | Heures d'arrivée et de départ (`TIMESTAMPTZ` = date + heure + fuseau) |
| `working_hours`, `overtime` | Heures calculées |
| `status` | `present`, `late`, `half_day`, `absent`, `on_leave`, `holiday` |
| `latitude`, `longitude` | Position GPS (facultative) |
| **Contrainte** | `UNIQUE (employee_id, work_date)` : **impossible d'avoir deux pointages le même jour** |

**`leaves`** : les demandes de congé.
| Colonne | Rôle |
| --- | --- |
| `leave_type` | `casual`, `sick`, `paid`, `unpaid` |
| `start_date`, `end_date`, `days` | Période et nombre de jours ouvrés. `CHECK (end_date >= start_date)` |
| `reason` | Motif |
| `status` | `pending`, `approved`, `rejected`, `cancelled` |
| `reviewed_by` → `users.id`, `review_comment`, `reviewed_at` | Qui a validé, avec quel commentaire, et quand |

**`payrolls`** : les bulletins de paie.
| Colonne | Rôle |
| --- | --- |
| `period_year`, `period_month` | La période (`CHECK period_month BETWEEN 1 AND 12`) |
| `basic`, `allowances`, `bonuses`, `overtime_pay`, `gross`, `deductions`, `tax`, `net` | Les montants |
| `details` | `JSONB` : le détail du calcul (logement, transport, cotisation…) |
| `status` | `processed` (traité) ou `paid` (payé) |
| **Contrainte** | `UNIQUE (employee_id, period_year, period_month)` : un seul bulletin par mois |

**`performance_reviews`** : les évaluations.
| Colonne | Rôle |
| --- | --- |
| `employee_id`, `reviewer_id` → `users.id` | L'agent évalué et l'évaluateur |
| `period`, `review_date` | « 2026 – S1 », date |
| `rating` | `NUMERIC(2,1)`, `CHECK (rating BETWEEN 1 AND 5)` |
| `feedback` | Appréciation |
| `goals` | `JSONB` : liste d'objectifs `[{ "title": "...", "progress": 40, "done": false, "due": "2026-12-31" }]` |
| `status` | `scheduled` (planifiée) ou `completed` (réalisée) |

### Les tables de communication et d'audit

| Table | Colonnes principales | Rôle |
| --- | --- | --- |
| `notifications` | `user_id`, `type`, `title`, `message`, `link`, `is_read` | Les messages de la cloche |
| `announcements` | `title`, `content`, `event_date`, `author_id` | Les annonces (et les événements du calendrier) |
| `activity_logs` | `user_id`, `action`, `entity`, `entity_id`, `details`, `created_at` | Le journal d'audit |

### Les tables des dossiers (spécifiques au ministère)

| Table | Colonnes principales | Rôle |
| --- | --- | --- |
| `deposit_types` | `name`, `description`, `is_active` | Types de dépôt : guichet, courrier, en ligne… |
| `request_types` | `code`, `name`, `sla_days`, `required_documents`, `is_active` | Types de demande, avec leur délai de traitement (`sla_days`) et les pièces requises |
| `circuit_steps` | `request_type_id` (NULL = circuit par défaut), `step_order`, `name`, `department_id`, `expected_days` | Les étapes du circuit. Index unique sur `(COALESCE(request_type_id, 0), step_order)` : pas deux étapes avec le même numéro dans un même circuit |
| `projects` | `reference` (unique), `title`, `request_type_id`, `deposit_type_id`, `applicant_*`, `deposit_date`, `due_date`, `priority`, `current_step`, `status`, `agent_id`, `department_id`, `created_by`, `closed_at` | Les dossiers |
| `project_history` | `project_id`, `step_order`, `step_name`, `action`, `from_agent`, `to_agent`, `comment`, `user_id`, `created_at` | Chaque action sur un dossier |
| `documents` | `project_id` ou `employee_id`, `name`, `mime_type`, `size_bytes`, `content` (`BYTEA`) | Les pièces jointes, stockées dans la base |

`project_reference_seq` est une **séquence** : un compteur PostgreSQL qui donne 1, 2, 3… sans jamais donner deux fois le même numéro.

## 5.5 Les types SQL utilisés

| Type | Signification | Exemple |
| --- | --- | --- |
| `SERIAL` | Entier qui s'incrémente tout seul | `id` |
| `INTEGER` | Nombre entier | `period_month` |
| `NUMERIC(14,2)` | Nombre décimal **exact** (idéal pour l'argent) | `salary` |
| `VARCHAR(n)` | Texte de n caractères au maximum | `email` |
| `TEXT` | Texte sans limite | `description` |
| `BOOLEAN` | Vrai ou faux | `is_active` |
| `DATE` | Une date sans heure | `work_date` |
| `TIMESTAMPTZ` | Date + heure + fuseau horaire | `check_in` |
| `JSONB` | Données JSON, interrogeables en SQL | `goals` |
| `BYTEA` | Données binaires (un fichier) | `documents.content` |

## 5.6 Les contraintes (les règles que la base fait respecter)

| Contrainte | Exemple dans le schéma | Effet |
| --- | --- | --- |
| `PRIMARY KEY` | `id SERIAL PRIMARY KEY` | Identifie chaque ligne de façon unique |
| `NOT NULL` | `full_name VARCHAR(150) NOT NULL` | Valeur obligatoire |
| `UNIQUE` | `email ... UNIQUE` | Pas deux fois la même valeur |
| `DEFAULT` | `status ... DEFAULT 'active'` | Valeur si on n'en donne pas |
| `CHECK` | `CHECK (salary >= 0)` | Refuse les valeurs invalides |
| `REFERENCES` (clé étrangère) | `department_id INTEGER REFERENCES departments(id)` | La valeur doit exister dans l'autre table |
| `ON DELETE CASCADE` | pointages, congés, bulletins | Supprimer l'employé supprime aussi ces lignes |
| `ON DELETE SET NULL` | `department_id`, `agent_id` | Supprimer le département laisse l'employé, avec `department_id = NULL` |

Quand une contrainte est violée, PostgreSQL renvoie un code d'erreur (`23505` pour un doublon, par exemple), que `errorHandler.js` transforme en message clair (document 4, section 4.8).

**Cas particulier** : `departments.manager_id` pointe vers `employees`, et `employees.department_id` pointe vers `departments`. Ces deux tables se référencent mutuellement : on crée d'abord les deux tables, puis on ajoute la clé étrangère `departments_manager_fk` avec `ALTER TABLE`. Le bloc `DO $$ ... EXCEPTION WHEN duplicate_object ...` évite une erreur si elle existe déjà.

## 5.7 Les index (pour aller vite)

Un **index**, c'est comme l'index d'un livre : au lieu de lire toutes les lignes, PostgreSQL va directement aux bonnes.

```sql
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(work_date);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_employees_name_lower ON employees(lower(full_name));
```
On indexe les colonnes souvent utilisées dans les filtres (`WHERE`), les jointures et les tris : département, statut, dates, agent traitant, période de paie, notifications non lues. Les contraintes `UNIQUE` créent aussi un index automatiquement.

## 5.8 Utiliser pgAdmin au quotidien

### Voir les données d'une table
*Servers → PostgreSQL 18 → Databases → ems → Schemas → public → Tables* → clic droit sur une table → **View/Edit Data → All Rows**.
On peut modifier une cellule, puis cliquer sur **Save Data Changes** (F6). À éviter pour les soldes et la paie : mieux vaut passer par l'application, qui applique les règles.

### Écrire une requête
Clic droit sur **ems → Query Tool**, écrire la requête, puis ▶ (F5). Pour n'exécuter qu'une partie, la sélectionner avant d'appuyer sur F5.

### Requêtes utiles (à copier)

```sql
-- Tous les employés avec leur département
SELECT e.employee_code, e.full_name, d.name AS departement, e.salary
FROM employees e
LEFT JOIN departments d ON d.id = e.department_id
ORDER BY e.full_name;

-- Les comptes et leur rôle
SELECT name, email, role, is_active, last_login_at FROM users ORDER BY role;

-- Qui a pointé aujourd'hui ?
SELECT e.full_name, a.check_in, a.check_out, a.status
FROM attendance a JOIN employees e ON e.id = a.employee_id
WHERE a.work_date = CURRENT_DATE;

-- Demandes de congé en attente
SELECT e.full_name, l.leave_type, l.start_date, l.end_date, l.days
FROM leaves l JOIN employees e ON e.id = l.employee_id
WHERE l.status = 'pending';

-- Masse salariale par mois
SELECT period_year, period_month, COUNT(*) AS bulletins, SUM(gross) AS brut, SUM(net) AS net
FROM payrolls GROUP BY period_year, period_month ORDER BY 1, 2;

-- Effectif par département
SELECT d.name, COUNT(e.id) AS effectif
FROM departments d LEFT JOIN employees e ON e.department_id = d.id
GROUP BY d.name ORDER BY effectif DESC;

-- Dossiers en retard
SELECT reference, title, due_date, status FROM projects
WHERE status IN ('in_progress', 'awaiting_documents') AND due_date < CURRENT_DATE;

-- Historique d'un dossier
SELECT h.created_at, h.action, h.step_name, h.comment
FROM project_history h JOIN projects p ON p.id = h.project_id
WHERE p.reference = 'MFP-2026-00001' ORDER BY h.created_at;

-- Les objectifs (JSONB) d'une évaluation, un par ligne
SELECT r.period, g->>'title' AS objectif, g->>'progress' AS avancement
FROM performance_reviews r, jsonb_array_elements(r.goals) AS g;

-- Les 20 dernières actions du journal d'audit
SELECT a.created_at, u.name, a.action, a.details
FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
ORDER BY a.created_at DESC LIMIT 20;
```

### Promouvoir un compte sans passer par l'application
```sql
UPDATE users SET role = 'admin' WHERE email = 'mon.email@ems.gov';
```

### Voir la structure d'une table
Clic droit sur la table → **Properties → Columns**, ou onglet **SQL** en haut : pgAdmin affiche le `CREATE TABLE` complet.

### Diagramme automatique
Clic droit sur **ems → ERD For Database** : pgAdmin dessine toutes les tables et leurs liens.

## 5.9 Comment l'application utilise la base

```mermaid
flowchart LR
  R[Page React] -->|fetch /api/leaves| E[Express]
  E --> M[middleware protect]
  M --> C[leaveController]
  C -->|query SQL + paramètres| P[pool pg]
  P --> DB[(PostgreSQL ems)]
  DB -->|lignes| P --> C -->|JSON| R
```

1. React appelle l'API.
2. Le contrôleur prépare une requête SQL **paramétrée** :
```js
await query('SELECT * FROM leaves WHERE employee_id = $1 AND status = $2', [12, 'pending']);
```
   `$1` et `$2` sont remplacés **par PostgreSQL** par `12` et `'pending'`. Même si un utilisateur tape `'; DROP TABLE users; --` dans un champ, c'est traité comme du simple texte : **aucune injection SQL possible**.
3. `pg` renvoie `{ rows: [...] }` : un tableau d'objets, un par ligne.
4. Le contrôleur renvoie ces objets en JSON.

**Transaction** (plusieurs requêtes indissociables) :
```js
await withTransaction(async (client) => {
  await client.query('UPDATE employees SET paid_balance = paid_balance - $1 WHERE id = $2', [5, 12]);
  await client.query("UPDATE leaves SET status = 'approved' WHERE id = $1", [40]);
});   // si la 2ᵉ échoue, la 1ʳᵉ est annulée (ROLLBACK)
```

## 5.10 Créer, remplir, réinitialiser

| Action | Commande | Effet |
| --- | --- | --- |
| Créer ou compléter les tables | `npm run migrate` (dans `server/`) ou simplement démarrer le serveur | Exécute `schema.sql` ; les données existantes sont conservées |
| Charger les données de démo | `npm run seed` | ⚠️ **Vide toutes les tables**, puis insère 7 départements, 16 agents, 30 jours de pointages, des congés, 2 mois de paie, des évaluations, 9 dossiers… |
| Tout effacer, y compris les tables | Query Tool : `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` puis redémarrer le serveur | Repart d'une base vide |
| Tests | `TEST_DATABASE_URL=... npm test` | Utilise **`ems_test`**, jamais `ems`, car les tests vident les tables |

**Ajouter une colonne plus tard** : ne pas modifier seulement le `CREATE TABLE` (la table existe déjà, `IF NOT EXISTS` ne la changerait pas). Ajouter à la fin de `schema.sql` :
```sql
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender VARCHAR(10);
```

## 5.11 Sauvegarder et restaurer

**Avec pgAdmin** :
- Sauvegarder : clic droit sur **ems → Backup…** → *Filename* `ems-2026-09-23.backup`, *Format* **Custom** → **Backup**.
- Restaurer : créer une base vide, puis clic droit dessus → **Restore…** → choisir le fichier.

**En ligne de commande** :
```bash
pg_dump -U ems_user -d ems -F c -f ems.backup      # sauvegarde
pg_restore -U ems_user -d ems_copie ems.backup     # restauration dans une autre base
```

## 5.12 PostgreSQL en ligne (pour la mise en ligne)

1. Créer une base gratuite sur **Neon** (neon.tech), **Render** ou **Railway**.
2. Copier l'adresse de connexion fournie (*connection string*), par exemple `postgresql://user:motdepasse@ep-xxx.eu-central-1.aws.neon.tech/ems?sslmode=require`.
3. Sur le serveur en ligne, définir `DATABASE_URL` avec cette adresse et `DB_SSL=true`.
4. Au premier démarrage, les tables sont créées. Pour les données de démo, lancer `npm run seed` une seule fois depuis votre ordinateur, avec cette `DATABASE_URL` dans `.env`.
5. Pour la voir dans pgAdmin : **Add New Server** → onglet *Connection* : hôte, port, base, utilisateur et mot de passe de l'hébergeur ; onglet *Parameters* : *SSL mode* = `require`.

## 5.13 Erreurs fréquentes

| Erreur | Cause | Solution |
| --- | --- | --- |
| `password authentication failed for user "ems_user"` | Mauvais mot de passe dans `DATABASE_URL` | Corriger `.env`, ou redéfinir : `ALTER USER ems_user WITH PASSWORD 'ems2026';` |
| `database "ems" does not exist` | Base non créée, ou faute dans le nom | Créer la base (5.3) |
| `role "ems_user" does not exist` | Utilisateur non créé | `CREATE USER ...` (5.3) |
| `permission denied for schema public` | La base n'appartient pas à `ems_user` | Dans la base `ems`, en tant que `postgres` : `ALTER DATABASE ems OWNER TO ems_user; ALTER SCHEMA public OWNER TO ems_user;` |
| `must be owner of table ...` | Tables créées par `postgres`, puis serveur lancé avec `ems_user` | Réattribuer : `REASSIGN OWNED BY postgres TO ems_user;` dans la base `ems`, ou tout recréer (5.10) |
| `connect ECONNREFUSED 127.0.0.1:5432` | Service PostgreSQL arrêté, ou autre port | Démarrer le service (`services.msc`) ; vérifier le port dans pgAdmin → *Properties → Connection* |
| `duplicate key value violates unique constraint` | Doublon (email, pointage…) | Normal : c'est la base qui protège la règle ; l'application affiche un message 409 |
| `insert or update ... violates foreign key constraint` | Référence vers une ligne inexistante | Vérifier l'id envoyé (département, agent…) |
| pgAdmin demande un « master password » | Protection propre à pgAdmin | Choisir un mot de passe ; il n'a aucun lien avec la base |

---
Projet SIGRH (EMS) — documentation.
