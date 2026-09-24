# Document 5 — La base de données PostgreSQL

## 1. Pourquoi PostgreSQL ?

| Besoin du SIGRH | Ce que PostgreSQL apporte |
|---|---|
| Données très liées (agent → structure → institution → carrière) | Base **relationnelle** avec clés étrangères : impossible d’affecter un agent à une structure qui n’existe pas |
| Organigramme de profondeur variable | Requêtes **récursives** (`WITH RECURSIVE`) |
| Règles qui ne doivent jamais être contournées | Contraintes `CHECK`, `UNIQUE`, **déclencheurs** (journal inaltérable) |
| Actes qui modifient plusieurs tables | **Transactions** : tout ou rien |
| Paramètres variables selon l’acte (mutation, avancement…) | Colonnes **JSONB** (`payload`, `indicators`) |
| Libre, sans licence, hébergeable par l’État | Logiciel libre, très répandu |

## 2. Création et accès

- La base s’appelle `sigrh` (et `sigrh_test` pour les tests). Création : voir le document 3, étape A.3.
- **Vous n’écrivez pas les tables à la main** : au démarrage, l’API exécute `server/db/schema.sql` (fonction `migrate()`).
  Le script utilise `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION` : on peut l’exécuter autant de fois qu’on veut sans rien casser (**idempotent**).
- `npm run migrate` applique le schéma sans lancer l’API. `npm run seed` vide les tables et recharge les données de démonstration.

## 3. Vue d’ensemble (33 tables)

```
                        ┌──────────────┐
          ┌────────────►│  structures  │◄─────────────┐ parent_id (arbre)
          │             └──────┬───────┘──────────────┘ institution_id, head_agent_id
          │                    │ structure_id
 ┌────────┴──┐          ┌──────▼───────┐        ┌───────────┐
 │   users   │─────────►│  employees   │◄───────│   corps   │
 └─────┬─────┘employee_id└──┬───┬───┬──┘        └───────────┘
       │                    │   │   │  affectations, career_events, agent_diplomas,
       │                    │   │   │  record_changes, documents, positions
       │                    │   │   └──► leaves, leave_balances, attendance
       │                    │   └──────► enrollments ◄── training_sessions ◄── trainings
       │                    └──────────► payrolls, solde_lines ◄── solde_imports
       │                                 performance_reviews
       │         ┌────────────────┐     ┌────────────────┐
       └────────►│    requests    │────►│ workflow_types │──► workflow_steps
                 └───────┬────────┘     └────────────────┘
                         └──► request_history, documents
 api_clients ──► interop_logs      import_batches ──► import_rows
 notifications, announcements, structure_requests, activity_logs (chaîné)
```

## 4. Les tables, groupe par groupe

### 4.1 Référentiel des structures

| Table | Rôle | Colonnes importantes |
|---|---|---|
| `structures` | Toutes les entités de l’État | `code` (unique, ex. `MFP-DGC`), `name`, `sigle`, `type` (presidence, sgg, ministere, direction, service, deconcentree), `parent_id` (structure mère), `institution_id` (l’institution de rattachement), `head_agent_id` (le responsable), `region` |
| `structure_requests` | Propositions de création ou modification faites par les DRH | `action`, `payload` (JSONB), `status` (pending, approved, rejected), `requested_by`, `reviewed_by` |
| `positions` | Postes budgétaires | `structure_id`, `corps_id`, `is_budgeted`, `employee_id` (NULL = poste vacant) |
| `corps` | Corps de la fonction publique | `code` (ex. `ADMCIV`), `name`, `hierarchie` (A à D) |

**Pourquoi `institution_id` en plus de `parent_id` ?** On pourrait retrouver l’institution en remontant l’arbre, mais c’est la question posée à **chaque** requête
(« cette DRH peut-elle voir cet agent ? »). On la stocke donc directement. Une contrainte impose que seules la Présidence, le SGG et les ministères n’aient pas de parent.

### 4.2 Référentiel des agents

| Table | Rôle | Colonnes importantes |
|---|---|---|
| `employees` | Le dossier administratif unique | `sigrh_id` (unique, `SN00000001`), `matricule_solde` (unique), `nin_enc` (NIN **chiffré**), `nin_hash` (empreinte unique pour le dédoublonnage), `first_name`, `last_name`, `full_name` (**colonne générée**), `sexe`, `date_of_birth`, `structure_id`, `fonction`, `corps_id`, `hierarchie`, `grade`, `echelon`, `statut_emploi`, `position_statutaire`, `date_entree_fp`, `salary`, `biometric_id`, `biometric_enrolled_at`, `identity_verified_at` |
| `affectations` | Historique des affectations | `structure_id`, `start_date`, `end_date` (NULL = en cours), `acte_reference`, `request_id` |
| `career_events` | Événements de carrière | `type` (recrutement, titularisation, avancement, promotion, nomination, mutation, détachement, disponibilité, réintégration, sanction, distinction, formation, retraite…), `effective_date`, `acte_reference`, `details` (JSONB) |
| `agent_diplomas` | Diplômes | `title`, `level`, `school`, `year` |
| `record_changes` | Historique champ par champ | `entity`, `entity_id`, `field`, `old_value`, `new_value`, `user_id`, `request_id` |
| `documents` | Pièces jointes (dossier ou demande) | `employee_id` ou `request_id`, `category`, `mime_type`, `size_bytes`, `content` (base64) |

`full_name` est déclarée `GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED` : PostgreSQL la calcule lui-même, elle ne peut pas être incohérente, et elle est indexée pour la recherche.

### 4.3 Comptes et sécurité

| Table | Rôle | Colonnes importantes |
|---|---|---|
| `users` | Comptes de connexion | `email` (unique), `password_hash` (bcrypt), `role` (agent, gestionnaire_rh, pilotage, admin_dsi), `employee_id`, `structure_id` (**définit le périmètre**), `is_active`, `totp_secret_enc` (chiffré), `totp_enabled`, `rights_reviewed_at`, `rights_reviewed_by` |
| `activity_logs` | Journal d’audit chaîné | `action`, `entity`, `entity_id`, `details`, `ip`, `prev_hash`, `hash` — **ajout seul** |
| `api_clients` | Systèmes partenaires | `key_prefix` (début de la clé, pour la reconnaître), `key_hash` (SHA-256), `scopes` (tableau d’habilitations), `is_active` |
| `interop_logs` | Journal des appels partenaires | `client_id`, `method`, `path`, `status` |

### 4.4 Circuits de validation

| Table | Rôle | Colonnes importantes |
|---|---|---|
| `workflow_types` | Types de demandes et d’actes | `code` (CONGE, MUTATION…), `category`, `effect` (ce qui sera appliqué au dossier), `sla_days` (délai global), `agent_can_submit`, `required_documents` |
| `workflow_steps` | Étapes de chaque circuit | `step_order`, `name`, `assignee_kind` (qui valide), `structure_id` (pour « structure désignée »), `expected_days` — `UNIQUE(type_id, step_order)` |
| `requests` | Demandes déposées | `reference` (unique), `employee_id`, `institution_id`, `deposit_channel`, `payload` (JSONB : paramètres de l’acte), `current_step`, `status`, `assigned_employee_id`, `step_due_date`, `due_date`, `alert_sent_at` |
| `request_history` | Historique de chaque demande | `step_name`, `action`, `comment`, `user_id` |

### 4.5 Temps et absences

| Table | Rôle | Colonnes importantes |
|---|---|---|
| `leave_types` | Types de congés | `code` (clé), `annual_quota` (NULL = sans quota), `business_days`, `requires_document`, `workflow_code` |
| `leave_balances` | Soldes par agent, type et année | `allotted`, `used` — clé primaire `(employee_id, leave_type, year)` |
| `leaves` | Absences | `start_date`, `end_date`, `days`, `status`, `request_id` |
| `attendance` | Présences | `work_date`, `check_in`, `check_out`, `status`, `source` (portail, mobile, biometrie, manuel, cloture), `device_id` — **`UNIQUE(employee_id, work_date)`** |

### 4.6 Formation et évaluation

| Table | Rôle |
|---|---|
| `trainings` | Catalogue des formations (`code`, `title`, `domain`, `is_certifying`) |
| `training_sessions` | Sessions datées (`capacity`, `institution_id`, `status`) |
| `enrollments` | Inscriptions (`status` : requested, validated, rejected, attended, certified) — `UNIQUE(session_id, employee_id)` |
| `performance_reviews` | Évaluations (`period`, `rating`, `indicators` JSONB, `status`) |

### 4.7 Solde

| Table | Rôle |
|---|---|
| `solde_imports` | Un import d’état de paiement (période, source, totaux) |
| `solde_lines` | Chaque ligne payée (`matricule_solde`, montants, `employee_id` rapproché ou NULL si inconnu) |
| `payrolls` | Bulletins (`source` : solde ou simulation) — unique par agent, période et source |

### 4.8 Reprise et communication

| Table | Rôle |
|---|---|
| `import_batches` / `import_rows` | Fichiers déposés par une DRH et chaque ligne analysée (`errors`, `duplicate_of`, `applied_employee_id`) |
| `notifications` | Notifications de chaque utilisateur |
| `announcements` | Annonces (`institution_id` NULL = nationale) |

## 5. Les garde-fous intégrés à la base

| Règle | Mécanisme |
|---|---|
| Un agent n’a qu’un identifiant, un matricule, un NIN | `UNIQUE` sur `sigrh_id`, `matricule_solde`, `nin_hash` |
| Un seul pointage par agent et par jour | `UNIQUE(employee_id, work_date)` + `INSERT … ON CONFLICT` |
| Pas de valeur hors liste (rôle, position, statut…) | `CHECK (… IN (…))` |
| Une fin d’affectation ou de congé n’est pas avant son début | `CHECK (end_date >= start_date)` |
| Le journal ne peut être ni modifié ni effacé | Déclencheur `activity_logs_no_update` |
| Une demande ne peut pas pointer vers un type inexistant | Clés étrangères `REFERENCES` |

## 6. Index (performances)

Index sur les colonnes utilisées pour filtrer : `structures(parent_id)`, `structures(institution_id)`, `employees(structure_id)`,
`employees(position_statutaire)`, `employees(corps_id)`, `lower(full_name)` (recherche sans tenir compte des majuscules),
`requests(status)`, `requests(institution_id, status)`, `leaves(start_date, end_date)`, `attendance(work_date)`,
`payrolls(period_year, period_month)`, `notifications(user_id, is_read, created_at DESC)`, `activity_logs(created_at DESC)`.

## 7. Utiliser la base dans pgAdmin

Ouvrez **Tools → Query Tool** sur la base `sigrh`, collez une requête, puis appuyez sur **F5**.

### Effectifs par institution
```sql
SELECT i.sigle, COUNT(*) AS effectif,
       COUNT(*) FILTER (WHERE e.sexe = 'F') AS femmes
  FROM employees e
  JOIN structures s ON s.id = e.structure_id
  JOIN structures i ON i.id = s.institution_id
 WHERE e.position_statutaire = 'activite'
 GROUP BY i.sigle ORDER BY effectif DESC;
```
`COUNT(*) FILTER (WHERE …)` compte seulement les lignes qui vérifient la condition, dans la même requête.

### L’organigramme d’un ministère (requête récursive)
```sql
WITH RECURSIVE arbre AS (
  SELECT id, name, 0 AS niveau, ARRAY[name::text] AS chemin FROM structures WHERE code = 'MFP'
  UNION ALL
  SELECT s.id, s.name, a.niveau + 1, a.chemin || s.name::text FROM structures s JOIN arbre a ON s.parent_id = a.id
)
SELECT repeat('    ', niveau) || name AS structure FROM arbre ORDER BY chemin;
```
`chemin` accumule les noms depuis la racine : trier sur ce tableau place chaque sous-structure juste sous sa structure mère.

### Où en sont les demandes ?
```sql
SELECT r.reference, t.name AS type, e.full_name, ws.name AS etape_en_cours, r.step_due_date,
       r.step_due_date < CURRENT_DATE AS en_retard
  FROM requests r
  JOIN workflow_types t ON t.id = r.type_id
  JOIN employees e ON e.id = r.employee_id
  JOIN workflow_steps ws ON ws.type_id = r.type_id AND ws.step_order = r.current_step
 WHERE r.status = 'in_progress'
 ORDER BY r.step_due_date;
```

### Voir un circuit
```sql
SELECT t.code, ws.step_order, ws.name, ws.assignee_kind, ws.expected_days
  FROM workflow_steps ws JOIN workflow_types t ON t.id = ws.type_id
 WHERE t.code = 'MUTATION' ORDER BY ws.step_order;
```

### Agents payés par la Solde mais inconnus du SIGRH (agents fantômes)
```sql
SELECT l.matricule_solde, l.full_name, l.net
  FROM solde_lines l
 WHERE l.import_id = (SELECT MAX(id) FROM solde_imports) AND l.employee_id IS NULL;
```

### Historique des modifications d’un agent
```sql
SELECT c.created_at, c.field, c.old_value, c.new_value, u.name AS auteur
  FROM record_changes c LEFT JOIN users u ON u.id = c.user_id
 WHERE c.entity = 'employee'            -- ajouter AND c.entity_id = <id> pour un agent précis
 ORDER BY c.created_at DESC LIMIT 20;
```

### Constater que le journal est protégé
```sql
DELETE FROM activity_logs WHERE id = 1;
-- ERREUR : Le journal d'audit est en ajout seul
```

### Le NIN n’est pas lisible en base
```sql
SELECT sigrh_id, nin_enc, nin_hash FROM employees LIMIT 3;
-- nin_enc = v1:… (chiffré), nin_hash = empreinte : aucun NIN en clair
```

## 8. Sauvegarde et restauration
- pgAdmin : clic droit sur la base → **Backup…** (format *Custom*) ; restauration par **Restore…**.
- En ligne de commande : `pg_dump -Fc sigrh > sigrh.dump` puis `pg_restore -d sigrh sigrh.dump`.
- ⚠ Conservez la **clé `DATA_ENCRYPTION_KEY`** avec les sauvegardes, dans un coffre séparé : sans elle, les NIN et secrets 2FA sauvegardés sont illisibles.
