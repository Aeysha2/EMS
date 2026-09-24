# Document 6 — API REST : référence des routes

Adresse de base en développement : `http://localhost:5002/api`. Toutes les réponses sont en JSON (sauf PDF, Excel et CSV).

## 1. Conventions

| Élément | Règle |
|---|---|
| Authentification | En-tête `Authorization: Bearer <jeton>` obtenu par `POST /auth/login` (ou `/auth/mfa/verify`) |
| Systèmes partenaires | En-tête `X-API-Key: <clé>` sur `/interop/v1/*` |
| Corps de requête | JSON, en-tête `Content-Type: application/json` |
| Dates | Format ISO `AAAA-MM-JJ` |
| Pièces jointes | JSON `{ name, mime_type, content }`, avec `content` en base64 (data URL acceptée) ; 8 Mo maximum |
| Pagination | `?page=1&limit=20` ; réponse `{ data, total, page, limit }` |
| Erreurs | `{ "message": "…" }` et parfois `code` (ex. `MFA_SETUP_REQUIRED`) |

| Code HTTP | Signification |
|---|---|
| 200 / 201 / 202 | Succès / créé / reçu pour traitement |
| 400 | Donnée invalide (message explicite) |
| 401 | Non connecté, jeton expiré, clé d’API absente ou invalide |
| 403 | Connecté, mais hors de votre périmètre ou de votre profil |
| 404 | Introuvable (ou invisible pour vous) |
| 409 | Conflit : doublon, demande déjà clôturée, solde insuffisant |
| 429 | Trop de tentatives de connexion |

Profils : **A** = agent · **C** = chef de structure (agent qui dirige une structure) · **DRH** = gestionnaire_rh · **P** = pilotage · **DSI** = admin_dsi · **Tous** = tout utilisateur connecté.

---

## 2. Authentification — `/api/auth`

| Méthode | Route | Accès | Corps / paramètres | Réponse |
|---|---|---|---|---|
| POST | `/auth/login` | public | `{ email, password }` | `{ token, user }` ou `{ mfa_required: true, mfa_token }` |
| POST | `/auth/mfa/verify` | public (jeton 2FA) | `{ mfa_token, code }` | `{ token, user }` |
| POST | `/auth/activate` | public | `{ email, identifier, password }` — `identifier` = identifiant SIGRH ou matricule de solde | `{ token, user }` |
| GET | `/auth/me` | Tous | — | `{ user }` : profil, institution, structures dirigées, dossier |
| PUT | `/auth/password` | Tous | `{ currentPassword, newPassword }` (10 caractères, majuscule, minuscule, chiffre) | `{ message }` |
| POST | `/auth/mfa/setup` | Tous | — | `{ secret, qr, uri }` (QR code en data URL) |
| POST | `/auth/mfa/enable` | Tous | `{ code }` | `{ user }` |
| POST | `/auth/mfa/disable` | A (interdit aux profils privilégiés si `MFA_REQUIRED`) | `{ code }` | `{ user }` |

## 3. Agents — `/api/employees`

| Méthode | Route | Accès | Détails |
|---|---|---|---|
| GET | `/employees` | Tous | `?scope=directory|institution|team`, `q`, `structure` (inclut les sous-structures), `institution`, `hierarchie`, `corps`, `position`, `statut`, `sexe`, `nin`, `biometrie=non`, `sort=name|sigrh|entree|structure|hierarchie|naissance`, `order`, `page`, `limit`. Les champs renvoyés dépendent du niveau d’accès |
| GET | `/employees/me` | A | Mon dossier complet |
| PUT | `/employees/me` | A | `{ phone, address, marital_status, children_count }` |
| POST | `/employees` | DRH | Création dans son institution : `first_name`, `last_name`, `email`, `structure_id` (obligatoires), `sexe`, `date_of_birth`, `nin`, `matricule_solde`, `corps_id`, `hierarchie`, `grade`, `echelon`, `statut_emploi`, `position_statutaire`, `date_entree_fp`, `date_prise_service`, `salary`, `fonction`, `acte_reference`… |
| GET | `/employees/:id` | Tous | Fiche selon le niveau d’accès (full, team, public) |
| GET | `/employees/:id/dossier` | A (le sien), C (son équipe), DRH (son institution) | Dossier complet : carrière, affectations, diplômes, absences, formations, évaluations, demandes, rémunération, historique |
| GET | `/employees/:id/nin` | A (le sien), DRH | NIN en clair — **consultation journalisée** |
| PUT | `/employees/:id` | DRH | Mêmes champs que la création ; chaque modification est historisée |
| POST | `/employees/:id/verify-identity` | DRH | Vérification auprès de l’état civil |
| POST | `/employees/:id/biometrie` | DRH | `{ biometric_id }` |
| POST | `/employees/:id/diplomas` | DRH | `{ title, level, school, year }` |
| DELETE | `/employees/:id/diplomas/:diplomaId` | DRH | — |
| POST | `/employees/:id/career-events` | DRH | Sanction ou distinction : `{ type, effective_date, acte_reference, description }` (les autres actes passent par un circuit) |
| POST | `/employees/:id/documents` | A (le sien), DRH | `{ name, mime_type, content, category }` |
| GET | `/employees/:id/documents/:docId` | A (le sien), DRH | Téléchargement |

## 4. Structures — `/api/structures`

| Méthode | Route | Accès | Détails |
|---|---|---|---|
| GET | `/structures` | Tous | Arbre national ; `?flat=1` liste à plat ; `?all=1` inclut les inactives |
| GET | `/structures/:id` | Tous | Fiche : sous-structures, postes, agents (annuaire) |
| POST | `/structures/requests` | DRH, P, DSI | Proposition : `{ action: create|update|deactivate, structure_id?, payload: { code, name, sigle, type, parent_id, region, head_agent_id } }` |
| GET | `/structures/requests` | DRH (les siennes), P, DSI | Liste des propositions |
| PATCH | `/structures/requests/:id` | P, DSI | `{ decision: approve|reject, comment }` |
| POST | `/structures` | P, DSI | Création directe |
| PUT | `/structures/:id` | P, DSI ; DRH pour le responsable d’une structure de son institution | `{ name, sigle, region, head_agent_id, is_active… }` |
| POST | `/structures/:id/positions` | DRH | Poste budgétaire : `{ code, title, corps_id, hierarchie, is_budgeted }` |
| PUT | `/positions/:id` | DRH | `{ employee_id | null, title }` |
| GET | `/corps` | Tous | Corps de la fonction publique |
| POST | `/corps` | P, DSI | `{ code, name, hierarchie, description }` |

## 5. Circuits et demandes

| Méthode | Route | Accès | Détails |
|---|---|---|---|
| GET | `/workflows/types` | Tous | Types de demandes avec leurs étapes |
| PUT | `/workflows/types/:id` | P, DSI | `{ name, sla_days, required_documents, description, is_active, agent_can_submit, steps: [{ name, assignee_kind, structure_id, expected_days }] }` |
| GET | `/requests` | Tous | `?scope=mine|todo|institution`, `status`, `type`, `category`, `overdue=1`, `q`, `page`, `limit` |
| POST | `/requests` | A (pour lui-même, si `agent_can_submit`), DRH (pour un agent de son institution) | `{ type_id, employee_id?, title, description, priority, deposit_channel, payload }` |
| GET | `/requests/:id` | Personnes concernées | Détail, circuit, historique, pièces, droits (`canAct`, `canAssign`…) |
| POST | `/requests/:id/actions` | Valideur de l’étape (jamais le demandeur) | `{ action, comment, assigned_employee_id }` |
| GET | `/requests/:id/receipt` | Personnes concernées | Récépissé PDF |
| POST | `/requests/:id/documents` | Personnes concernées | Pièce justificative |
| GET | `/requests/:id/documents/:docId` | Personnes concernées | Téléchargement |

**Actions** : `approve`, `return` (motif obligatoire), `request_documents`, `resume`, `reject` (motif obligatoire), `cancel` (demandeur), `assign`, `comment`.

**`payload` selon l’acte** :

| Type (effet) | `payload` |
|---|---|
| MUTATION (`mutation`) | `{ target_structure_id, fonction?, effective_date?, acte_reference? }` |
| AVANCEMENT (`avancement`) | `{ grade?, echelon?, hierarchie?, corps_id?, salary?, effective_date? }` (grade ou échelon obligatoire) |
| NOMINATION (`nomination`) | `{ fonction, head_of_structure_id? }` |
| DETACHEMENT, DISPONIBILITE (`position`) | `{ position_statutaire: detachement|disponibilite|activite|suspension }` |
| TITULARISATION, RETRAITE, ATTESTATION | `{}` (facultatif : `effective_date`, `acte_reference`) |

Les congés et les inscriptions en formation créent leur demande automatiquement (voir 6 et 7).

## 6. Temps et absences

| Méthode | Route | Accès | Détails |
|---|---|---|---|
| GET | `/leaves/types` | Tous | Types de congés |
| GET | `/leaves/balance` | A ; DRH et C avec `?employee=` | Soldes : `?year=` |
| GET | `/leaves` | Tous | `?scope=mine|team|institution`, `status`, `type`, `from` |
| POST | `/leaves` | A | `{ leave_type, start_date, end_date, reason, destination }` → crée l’absence **et** la demande du circuit CONGE |
| PATCH | `/leaves/:id/cancel` | A (la sienne), DRH | Annulation (recrédite le solde si déjà approuvé) |
| POST | `/attendance/check-in` | A | `{ latitude?, longitude? }` |
| POST | `/attendance/check-out` | A | — |
| GET | `/attendance/today` | A ; DRH (vue institution) | Pointage du jour |
| GET | `/attendance` | Tous | `?scope=mine|team|institution`, `from`, `to`, `status`, `source`, `employee` |
| POST | `/attendance` | DRH | Saisie ou correction : `{ employee_id, work_date, check_in, check_out, status, note }` |
| POST | `/attendance/close-day` | DRH | `{ date }` : marque absents et absences autorisées, notifie |
| GET | `/attendance/report` | Tous (selon périmètre) | `?year=&month=&scope=` : rapport mensuel et absentéisme |

## 7. Formation et évaluation

| Méthode | Route | Accès | Détails |
|---|---|---|---|
| GET | `/trainings` | Tous | Catalogue et sessions à venir |
| POST | `/trainings` | DRH, P, DSI | `{ code, title, provider, domain, duration_days, is_certifying, description }` |
| POST | `/trainings/:id/sessions` | DRH, P, DSI | `{ start_date, end_date, location, capacity }` |
| POST | `/trainings/sessions/:id/enroll` | A | `{ motivation }` → demande du circuit FORMATION |
| POST | `/trainings/sessions/:id/participants` | DRH | `{ employee_id }` : inscription directe |
| GET | `/trainings/sessions/:id/participants` | DRH, P, DSI | Participants |
| PATCH | `/trainings/enrollments/:id` | DRH | `{ status: attended|certified|absent, result }` |
| GET | `/performance` | Tous | `?scope=mine|team|institution&year=` |
| POST | `/performance` | C, DRH | `{ employee_id, period, review_date, rating, feedback, goals[], indicators[], status }` |
| PUT | `/performance/:id` | Évaluateur ; l’agent ne modifie que l’avancement de ses objectifs | — |
| GET | `/performance/insights/:employeeId` | A (lui-même), C, DRH | Score et recommandations |

## 8. Rémunération et Solde — `/api/solde`

| Méthode | Route | Accès | Détails |
|---|---|---|---|
| GET | `/solde/payslips` | A ; DRH avec `?scope=institution` | `?year=&month=&source=` |
| GET | `/solde/payslips/:id/pdf` | A (les siens), DRH | Bulletin PDF |
| POST | `/solde/simulation` | A, DRH | `{ employee_id?, year, month, bonus, otherDeductions }` |
| POST | `/solde/imports` | P | `{ year, month, filename, content }` (CSV : `matricule_solde;nom;salaire_base;brut;retenues;impot;net`) |
| GET | `/solde/imports` | P, DRH | Imports reçus |
| GET | `/solde/imports/:id/reconciliation` | P (national), DRH (son institution) | `{ summary, anomalies[] }` |

## 9. Pilotage, tableau de bord, communication

| Méthode | Route | Accès | Détails |
|---|---|---|---|
| GET | `/dashboard` | Tous | Accueil adapté au profil |
| GET | `/pilotage/indicators` | P (`?institution=` facultatif), DRH (son institution) | Indicateurs agrégés |
| GET | `/pilotage/export.xlsx` | P, DRH | Classeur Excel multi-onglets |
| GET | `/pilotage/export.pdf` | P, DRH | Note de synthèse |
| GET | `/notifications` | Tous | `{ data, unread }` |
| PATCH | `/notifications/:id/read` | Tous | `:id` ou `all` |
| GET | `/announcements` | Tous | Nationales et de mon institution |
| POST | `/announcements` | P (nationale par défaut, `national: false` sinon), DRH (institution) | `{ title, content, event_date?, national? }` |
| DELETE | `/announcements/:id` | Auteur, P (nationales), DRH (son institution) | — |
| GET | `/calendar` | Tous | `?from=&to=` : événements, congés, évaluations, sessions, échéances |

## 10. Reprise des données — `/api/imports`

| Méthode | Route | Accès | Détails |
|---|---|---|---|
| GET | `/imports/template` | DRH | Modèle CSV |
| POST | `/imports` | DRH | `{ filename, content }` : analyse sans écriture dans le référentiel |
| GET | `/imports` | DRH | Lots de son institution |
| GET | `/imports/:id` | DRH | Détail ligne par ligne (erreurs, doublons) |
| POST | `/imports/:id/decision` | DRH | `{ decision: apply|reject }` |

## 11. Administration (DSI) — `/api/admin`

| Méthode | Route | Détails |
|---|---|---|
| GET | `/admin/users` | Comptes et état de la revue des droits (`review_due`) |
| POST | `/admin/users` | `{ name, email, password, role, structure_id, employee_id? }` (pilotage réservé à la Présidence et au SGG) |
| PATCH | `/admin/users/:id` | `{ role?, structure_id?, is_active?, password?, reset_mfa? }` (pas sur son propre compte) |
| POST | `/admin/users/:id/review` | Confirme les droits (revue périodique) |
| GET | `/admin/audit` | `?limit=&action=&user=` |
| GET | `/admin/audit/verify` | `{ valid, checked, brokenAt }` |
| GET | `/interop/clients` | Systèmes partenaires, habilitations disponibles, appels sur 30 jours |
| POST | `/interop/clients` | `{ name, structure_id, scopes[] }` → la clé est renvoyée **une seule fois** |
| PATCH | `/interop/clients/:id` | `{ is_active }` (révocation) |

## 12. API partenaires — `/api/interop/v1` (en-tête `X-API-Key`)

| Méthode | Route | Habilitation | Détails |
|---|---|---|---|
| GET | `/interop/v1/openapi.json` | aucune | Spécification OpenAPI 3 |
| GET | `/interop/v1/agents/:identifiant` | `agents:read` | Identifiant SIGRH ou matricule de solde ; fiche minimale sans donnée sensible |
| GET | `/interop/v1/structures` | `structures:read` | Référentiel des structures |
| GET | `/interop/v1/statistiques/effectifs` | `statistiques:read` | Effectifs agrégés |
| POST | `/interop/v1/biometrie/pointages` | `biometrie:write` | `{ pointages: [{ biometric_id | sigrh_id, horodatage, terminal }] }` (1 à 1 000) → 202 `{ recus, arrivees, departs, ignores, rejets[] }` |
| POST | `/interop/v1/solde/paiements` | `solde:write` | `{ annee, mois, lignes: [{ matricule_solde, nom, salaire_base, brut, retenues, impot, net }] }` → 201 `{ import_id, lignes, rapprochees, non_rapprochees }` |

## 13. Divers

| Méthode | Route | Détails |
|---|---|---|
| GET | `/health` | `{ status, database, etat_civil, timestamp }` — sans authentification |
