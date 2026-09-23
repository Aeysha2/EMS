# 8. L'API REST avec Postman — toutes les routes, testées pas à pas

Le document 6 présente l'API et la teste avec Thunder Client, dans VS Code. Ce document fait la même chose avec **Postman**, l'outil le plus utilisé en entreprise pour tester une API. Il est accompagné d'une **collection prête à importer** :

```
docs/postman/SIGRH-EMS.postman_collection.json
```

Elle contient **106 requêtes** rangées en 10 dossiers, couvrant **toutes les routes** du serveur. Chaque requête a des **tests automatiques** (141 vérifications au total). La connexion enregistre les jetons toute seule : vous n'avez rien à copier-coller.

> Cette collection a été exécutée en entier, trois fois de suite, sur les données de démonstration : 106 requêtes, 141 vérifications, 0 échec.

## 8.1 Installer Postman

1. Télécharger **Postman Desktop** sur https://www.postman.com/downloads/ (Windows, Mac ou Linux) et l'installer.
2. Au démarrage, créer un compte gratuit, ou cliquer sur *Skip / Continue without an account* s'il est proposé.
3. **Utilisez l'application de bureau, pas la version web.** La version web (dans le navigateur) ne peut pas joindre `localhost` sans installer en plus le *Postman Desktop Agent*.

## 8.2 Préparer le serveur

Dans VS Code, à la racine du projet `EMS` :
```bash
npm run seed      # recharge les données de démonstration (vide la base)
npm run server    # démarre l'API sur http://localhost:5002
```
Laissez ce terminal ouvert pendant tous les tests.

## 8.3 Importer la collection

1. Dans Postman, cliquer sur **Import** (en haut à gauche).
2. Glisser le fichier `EMS/docs/postman/SIGRH-EMS.postman_collection.json`, ou cliquer sur *files* pour le choisir.
3. Cliquer sur **Import**.
4. Dans le panneau de gauche (onglet **Collections**), la collection **SIGRH – EMS API** apparaît avec ses 10 dossiers.

## 8.4 Comprendre l'écran de Postman

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [POST ▼] [ {{baseUrl}}/api/auth/login                    ] [ Send ▼ ]    │  ← méthode, adresse, envoi
├─────────────────────────────────────────────────────────────────────────┤
│ Params | Authorization | Headers | Body | Scripts | Settings              │  ← ce qu'on envoie
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ { "email": "rh@ems.gov", "password": "Rh@12345" }                    │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│ Body | Cookies | Headers | Test Results (3/3)      200 OK · 45 ms · 2 KB │  ← la réponse
│ { "token": "eyJhbGciOi...", "user": { ... } }                             │
└─────────────────────────────────────────────────────────────────────────┘
```

| Onglet | Rôle | Dans cette collection |
| --- | --- | --- |
| **Params** | Les paramètres après `?` dans l'adresse | Filtres : `q`, `status`, `page`… |
| **Authorization** | Qui fait la requête | Type **Bearer Token**, avec la variable `{{tokenRh}}`, `{{tokenAgent}}` ou `{{tokenAdmin}}` |
| **Headers** | En-têtes HTTP | `Content-Type: application/json` quand il y a un corps (ajouté automatiquement) |
| **Body** | Les données envoyées | **raw** + **JSON** |
| **Scripts → Pre-request** | Code exécuté **avant** l'envoi | Calcul de dates, email unique… |
| **Scripts → Post-response** (ou **Tests**) | Code exécuté **après** la réponse | Vérifications et enregistrement des variables |
| **Test Results** (en bas) | Résultat des vérifications | Vert = réussi, rouge = échoué |

## 8.5 Les variables de la collection

Les mots entre doubles accolades `{{...}}` sont des **variables**. Pour les voir : cliquer sur le nom de la collection → onglet **Variables**.

| Variable | Remplie par | Utilisée pour |
| --- | --- | --- |
| `baseUrl` | Vous (`http://localhost:5002` par défaut) | Le début de toutes les adresses. Pour tester le serveur en ligne, il suffit de changer cette valeur |
| `tokenAdmin`, `tokenRh`, `tokenAgent` | Les requêtes « Connexion Admin / RH / Agent » | Le jeton envoyé avec chaque requête |
| `tokenNew`, `newUserId` | « Inscription d'un nouvel agent » | Le compte créé pendant les tests |
| `agentEmployeeId` | « Connexion Agent » | L'id de la fiche employé d'Awa Koné (compte agent de démo) |
| `departmentId`, `employeeId`, `leaveId`, `payrollId`, `reviewId`, `projectId`, `documentId`, `announcementId`… | Les requêtes de création | Enchaîner : créer, puis lire, modifier, supprimer ce qu'on vient de créer |
| `fakeToken` | Fixe | Un jeton falsifié, pour vérifier qu'il est refusé |

**Pourquoi des variables ?** Sans elles, il faudrait copier le jeton à la main dans chacune des 106 requêtes, puis recommencer toutes les 8 heures quand il expire.

## 8.6 Première requête, pas à pas

### Étape 1 — Vérifier que le serveur répond
1. Dossier **1. Santé et authentification** → cliquer sur **Santé du serveur**.
2. Cliquer sur **Send**.
3. En bas : `200 OK` et
```json
{ "status": "online", "database": "ok", "timestamp": "..." }
```
4. Onglet **Test Results** : `✓ Statut 200` et `✓ Base de données OK`.

Si vous voyez `Error: connect ECONNREFUSED 127.0.0.1:5002`, le serveur n'est pas lancé (8.2).

### Étape 2 — Se connecter (les jetons s'enregistrent tout seuls)
1. Ouvrir **Connexion RH** → onglet **Body** :
```json
{ "email": "rh@ems.gov", "password": "Rh@12345" }
```
2. **Send** → `200 OK`, la réponse contient `"token": "eyJhbGciOi..."`.
3. Ouvrir l'onglet **Scripts → Post-response** pour voir le code qui s'est exécuté :
```js
pm.test("Statut 200", () => pm.response.to.have.status(200));
const json = pm.response.json();
pm.test("Un jeton est renvoyé", () => pm.expect(json.token).to.be.a("string"));
pm.collectionVariables.set("tokenRh", json.token);
```
   La dernière ligne range le jeton dans la variable `tokenRh`.
4. Faire la même chose avec **Connexion Admin** et **Connexion Agent**.
5. Vérifier : collection → onglet **Variables** → `tokenRh`, `tokenAdmin` et `tokenAgent` sont remplis.

### Étape 3 — Une requête protégée
1. Dossier **3. Employés** → **Recherche (RH)**.
2. Onglet **Authorization** : *Bearer Token* avec `{{tokenRh}}`. Postman ajoutera l'en-tête `Authorization: Bearer <jeton>`.
3. Onglet **Params** : `q = kon`, `sort = name`, `order = asc`, `page = 1`, `limit = 20`. Modifier une valeur ici modifie l'adresse, et inversement.
4. **Send** → la liste des employés dont le nom, l'ID, l'email… contient « kon », **avec** leur salaire (vous êtes RH).
5. Ouvrir **Annuaire (agent, sans salaire)** et envoyer : même liste, mais **sans** le salaire des collègues. C'est la même adresse ; seul le jeton change.

## 8.7 Créer une requête soi-même (pour apprendre)

Refaites une requête à la main pour bien comprendre chaque étape :

1. Clic droit sur le dossier **5. Congés** → **Add request** → la nommer « Mon test de congé ».
2. Méthode : choisir **POST**. Adresse : `{{baseUrl}}/api/leaves`.
3. Onglet **Authorization** → *Auth Type* : **Bearer Token** → *Token* : `{{tokenAgent}}`.
4. Onglet **Body** → **raw** → à droite, choisir **JSON** → écrire :
```json
{
  "leave_type": "casual",
  "start_date": "2027-03-01",
  "end_date": "2027-03-03",
  "reason": "Essai Postman"
}
```
5. **Send** → `201 Created`. La réponse contient `"days": 3` (du lundi au mercredi) et un `id`.
6. Renvoyez-la une 2ᵉ fois → `409 Conflict` : « Cette période chevauche une demande existante ».
7. Onglet **Scripts → Post-response** : ajouter une vérification :
```js
pm.test("Demande créée", () => pm.response.to.have.status(201));
pm.collectionVariables.set("monCongeId", pm.response.json().id);
```
8. Enregistrer avec **Ctrl + S**.
9. Créez une deuxième requête `PATCH {{baseUrl}}/api/leaves/{{monCongeId}}/review` avec le jeton `{{tokenRh}}` et le corps `{ "action": "approve" }` : vous venez d'enchaîner deux requêtes grâce à une variable.

## 8.8 Toutes les requêtes, dossier par dossier

Exécutez les dossiers **dans l'ordre** : chaque dossier réutilise des variables remplies par les précédents (le dossier 1 est obligatoire). Dans chaque dossier, envoyez les requêtes de haut en bas.

Colonne « Jeton » : le profil dont le jeton est utilisé. Colonne « Résultat attendu » : le code HTTP, puis les vérifications automatiques de la requête.

### 1. Santé et authentification

Commencer TOUJOURS par ce dossier : il enregistre les jetons des trois profils.

| N° | Requête | Méthode | Adresse (après `{{baseUrl}}`) | Jeton | Résultat attendu |
| --- | --- | --- | --- | --- | --- |
| 1 | Santé du serveur | `GET` | `/api/health` | — | 200 · Base de données OK |
| 2 | Connexion Admin | `POST` | `/api/auth/login` | — | 200 · Un jeton est renvoyé |
| 3 | Connexion RH | `POST` | `/api/auth/login` | — | 200 · Un jeton est renvoyé |
| 4 | Connexion Agent | `POST` | `/api/auth/login` | — | 200 · Un jeton est renvoyé |
| 5 | Mauvais mot de passe | `POST` | `/api/auth/login` | — | 401 |
| 6 | Mon profil (me) | `GET` | `/api/auth/me` | Agent | 200 · Rôle employee |
| 7 | Inscription d'un nouvel agent | `POST` | `/api/auth/register` | — | 201 · Le rôle demandé (admin) est ignoré |
| 8 | Mot de passe trop faible | `POST` | `/api/auth/register` | — | 400 |
| 9 | Changer mon mot de passe | `PUT` | `/api/auth/password` | Nouvel agent | 200 |

### 2. Départements

| N° | Requête | Méthode | Adresse (après `{{baseUrl}}`) | Jeton | Résultat attendu |
| --- | --- | --- | --- | --- | --- |
| 10 | Lister les départements | `GET` | `/api/departments` | Agent | 200 · Liste non vide |
| 11 | Créer un département (RH) | `POST` | `/api/departments` | RH | 201 |
| 12 | Créer un département (agent → refusé) | `POST` | `/api/departments` | Agent | 403 |
| 13 | Détail d'un département | `GET` | `/api/departments/{{departmentId}}` | RH | 200 |
| 14 | Modifier un département | `PUT` | `/api/departments/{{departmentId}}` | RH | 200 · Budget modifié |

### 3. Employés

| N° | Requête | Méthode | Adresse (après `{{baseUrl}}`) | Jeton | Résultat attendu |
| --- | --- | --- | --- | --- | --- |
| 15 | Recherche (RH) | `GET` | `/api/employees?q=kon&sort=name&order=asc&page=1&limit=20` | RH | 200 · Le salaire est visible pour les RH |
| 16 | Annuaire (agent, sans salaire) | `GET` | `/api/employees?limit=5` | Agent | 200 · Aucun salaire de collègue visible |
| 17 | Filtrer par département | `GET` | `/api/employees?department=3&status=active` | RH | 200 |
| 18 | Ma fiche (agent) | `GET` | `/api/employees/me` | Agent | 200 |
| 19 | Modifier mes coordonnées (agent) | `PUT` | `/api/employees/me` | Agent | 200 |
| 20 | Créer un employé avec compte (RH) | `POST` | `/api/employees` | RH | 201 · ID auto EMPxxx |
| 21 | Doublon d'email → 409 | `POST` | `/api/employees` | RH | 409 |
| 22 | Détail d'un employé | `GET` | `/api/employees/{{employeeId}}` | RH | 200 |
| 23 | Modifier un employé (RH) | `PUT` | `/api/employees/{{employeeId}}` | RH | 200 |

### 4. Présences

| N° | Requête | Méthode | Adresse (après `{{baseUrl}}`) | Jeton | Résultat attendu |
| --- | --- | --- | --- | --- | --- |
| 24 | Pointer l'arrivée (agent) | `POST` | `/api/attendance/check-in` | Agent | 201 ou 409 |
| 25 | Pointer une 2ᵉ fois → 409 | `POST` | `/api/attendance/check-in` | Agent | 409 |
| 26 | Mon pointage du jour | `GET` | `/api/attendance/today` | Agent | 200 |
| 27 | Pointer le départ (agent) | `POST` | `/api/attendance/check-out` | Agent | 200 ou 409 |
| 28 | Historique (RH) | `GET` | `/api/attendance?from=2026-09-01&to=2026-09-30&status=late` | RH | 200 |
| 29 | Rapport mensuel (RH) | `GET` | `/api/attendance/report?year=2026&month=9` | RH | 200 · Une ligne par agent |
| 30 | Correction manuelle (RH) | `POST` | `/api/attendance` | RH | 200 |
| 31 | Clôturer une journée (RH) | `POST` | `/api/attendance/mark-absent` | RH | 200 |

### 5. Congés

Scénario complet : demande → approbation → solde débité → annulation → solde recrédité.

| N° | Requête | Méthode | Adresse (après `{{baseUrl}}`) | Jeton | Résultat attendu |
| --- | --- | --- | --- | --- | --- |
| 32 | Mes soldes (agent) | `GET` | `/api/leaves/balance` | Agent | 200 |
| 33 | Demander un congé payé (agent) | `POST` | `/api/leaves` | Agent | 201 · 3 jours ouvrés (lundi → mercredi) |
| 34 | Même période → 409 | `POST` | `/api/leaves` | Agent | 409 |
| 35 | L'agent ne peut pas approuver → 403 | `PATCH` | `/api/leaves/{{leaveId}}/review` | Agent | 403 |
| 36 | Approuver (RH) | `PATCH` | `/api/leaves/{{leaveId}}/review` | RH | 200 |
| 37 | Solde débité | `GET` | `/api/leaves/balance` | Agent | 200 · Solde payé − 3 |
| 38 | Annuler le congé approuvé (agent) | `PATCH` | `/api/leaves/{{leaveId}}/cancel` | Agent | 200 |
| 39 | Solde recrédité | `GET` | `/api/leaves/balance` | Agent | 200 · Solde revenu |
| 40 | Demander un congé sans solde (agent) | `POST` | `/api/leaves` | Agent | 201 |
| 41 | Rejeter (RH) | `PATCH` | `/api/leaves/{{leaveId2}}/review` | RH | 200 |
| 42 | Mon historique (agent) | `GET` | `/api/leaves?scope=mine` | Agent | 200 |
| 43 | Demandes en attente (RH) | `GET` | `/api/leaves?scope=all&status=pending` | RH | 200 |

### 6. Paie

| N° | Requête | Méthode | Adresse (après `{{baseUrl}}`) | Jeton | Résultat attendu |
| --- | --- | --- | --- | --- | --- |
| 44 | Règles de calcul | `GET` | `/api/payroll/rules` | RH | 200 |
| 45 | Simulation d'un bulletin (RH) | `POST` | `/api/payroll/preview` | RH | 200 · net = brut − retenues − impôt |
| 46 | Générer la paie du mois (RH) | `POST` | `/api/payroll/generate` | RH | 201 · Réponse generated/skipped |
| 47 | Générer à nouveau → rien de créé | `POST` | `/api/payroll/generate` | RH | 201 · Aucun doublon |
| 48 | Liste du mois (RH) | `GET` | `/api/payroll?year={{year}}&month={{month}}` | RH | 200 |
| 49 | Mes bulletins (agent) | `GET` | `/api/payroll` | Agent | 200 · Uniquement mes bulletins |
| 50 | Détail de mon bulletin (agent) | `GET` | `/api/payroll/{{payrollId}}` | Agent | 200 · Détail du calcul présent |
| 51 | Télécharger mon bulletin PDF (agent) | `GET` | `/api/payroll/{{payrollId}}/pdf` | Agent | 200 · C'est un PDF |
| 52 | Bulletin d'un autre → 403 | `GET` | `/api/payroll/{{otherPayrollId}}/pdf` | Agent | 403 |
| 53 | Marquer payé (RH) | `PATCH` | `/api/payroll/{{payrollId}}/pay` | RH | 200 ou 404 |
| 54 | Supprimer un bulletin non payé (RH) | `DELETE` | `/api/payroll/{{otherPayrollId}}` | RH | 200 |

### 7. Performance

| N° | Requête | Méthode | Adresse (après `{{baseUrl}}`) | Jeton | Résultat attendu |
| --- | --- | --- | --- | --- | --- |
| 55 | Créer une évaluation (RH) | `POST` | `/api/performance` | RH | 201 |
| 56 | L'agent met à jour ses objectifs | `PUT` | `/api/performance/{{reviewId}}` | Agent | 200 · Le titre n'a pas changé |
| 57 | L'agent ne peut pas évaluer → 403 | `POST` | `/api/performance` | Agent | 403 |
| 58 | Mes évaluations (agent) | `GET` | `/api/performance?scope=mine` | Agent | 200 |
| 59 | Analyse automatique | `GET` | `/api/performance/insights/{{agentEmployeeId}}` | Agent | 200 · Score entre 0 et 100 |
| 60 | Supprimer l'évaluation (RH) | `DELETE` | `/api/performance/{{reviewId}}` | RH | 200 |

### 8. Projets et dossiers

Enregistrement puis circuit complet d'un dossier.

| N° | Requête | Méthode | Adresse (après `{{baseUrl}}`) | Jeton | Résultat attendu |
| --- | --- | --- | --- | --- | --- |
| 61 | Configuration (types et circuits) | `GET` | `/api/projects/config` | Agent | 200 |
| 62 | Enregistrer un dossier (agent) | `POST` | `/api/projects` | Agent | 201 · Référence MFP-AAAA-NNNNN |
| 63 | Modifier l'enregistrement (auteur) | `PUT` | `/api/projects/{{projectId}}` | Agent | 200 · Priorité urgente |
| 64 | L'agent ne peut pas affecter → 403 | `POST` | `/api/projects/{{projectId}}/actions` | Agent | 403 |
| 65 | Transmettre + affecter l'agent (RH) | `POST` | `/api/projects/{{projectId}}/actions` | RH | 200 · Étape 2 |
| 66 | Demander des pièces (agent traitant) | `POST` | `/api/projects/{{projectId}}/actions` | Agent | 200 · En attente de pièces |
| 67 | Transmettre sans les pièces → 400 | `POST` | `/api/projects/{{projectId}}/actions` | Agent | 400 |
| 68 | Reprendre (agent traitant) | `POST` | `/api/projects/{{projectId}}/actions` | Agent | 200 |
| 69 | Ajouter une pièce jointe | `POST` | `/api/projects/{{projectId}}/documents` | Agent | 201 |
| 70 | Télécharger la pièce jointe | `GET` | `/api/projects/{{projectId}}/documents/{{documentId}}` | Agent | 200 |
| 71 | Commenter | `POST` | `/api/projects/{{projectId}}/actions` | Agent | 200 |
| 72 | Détail avec historique | `GET` | `/api/projects/{{projectId}}` | Agent | 200 · Historique rempli |
| 73 | Récépissé PDF | `GET` | `/api/projects/{{projectId}}/receipt` | Agent | 200 · PDF |
| 74 | Clôturer trop tôt → 400 | `POST` | `/api/projects/{{projectId}}/actions` | RH | 400 |
| 75 | Rejeter sans motif → 400 | `POST` | `/api/projects/{{projectId}}/actions` | RH | 400 |
| 76 | Mes dossiers à traiter (agent) | `GET` | `/api/projects?scope=mine` | Agent | 200 |
| 77 | Recherche multicritère (RH) | `GET` | `/api/projects?q=avancement&status=in_progress&priority=high&page=1&limit=20` | RH | 200 |
| 78 | Dossiers en retard (RH) | `GET` | `/api/projects?overdue=1` | RH | 200 |
| 79 | Créer un type de demande (RH) | `POST` | `/api/projects/request-types` | RH | 201 |
| 80 | Modifier le type de demande (RH) | `PUT` | `/api/projects/request-types/{{newRequestTypeId}}` | RH | 200 · Délai modifié |
| 81 | Circuit spécifique pour ce type (RH) | `PUT` | `/api/projects/circuit` | RH | 200 · 3 étapes |
| 82 | Créer un type de dépôt (RH) | `POST` | `/api/projects/deposit-types` | RH | 201 |

### 9. Tableau de bord, communication, rapports, comptes

| N° | Requête | Méthode | Adresse (après `{{baseUrl}}`) | Jeton | Résultat attendu |
| --- | --- | --- | --- | --- | --- |
| 83 | Tableau de bord (RH) | `GET` | `/api/dashboard` | RH | 200 · Données organisation |
| 84 | Tableau de bord (agent) | `GET` | `/api/dashboard` | Agent | 200 · Pas de données organisation |
| 85 | Publier une annonce (RH) | `POST` | `/api/announcements` | RH | 201 |
| 86 | Mes notifications (agent) | `GET` | `/api/notifications` | Agent | 200 · Notification d'annonce reçue |
| 87 | Tout marquer comme lu (agent) | `PATCH` | `/api/notifications/all/read` | Agent | 200 |
| 88 | Annonces | `GET` | `/api/announcements` | Agent | 200 |
| 89 | Calendrier | `GET` | `/api/calendar?from=2026-12-01&to=2026-12-31` | Agent | 200 |
| 90 | Supprimer l'annonce (RH) | `DELETE` | `/api/announcements/{{announcementId}}` | RH | 200 |
| 91 | Rapport départements | `GET` | `/api/reports/departments` | RH | 200 |
| 92 | Rapport paie | `GET` | `/api/reports/payroll?year=2026` | RH | 200 |
| 93 | Rapport congés | `GET` | `/api/reports/leaves?year=2026` | RH | 200 |
| 94 | Rapport dossiers | `GET` | `/api/reports/projects?from=2026-01-01&to=2026-12-31` | RH | 200 |
| 95 | Analyses RH | `GET` | `/api/reports/analytics` | RH | 200 |
| 96 | Rapport (agent) → 403 | `GET` | `/api/reports/departments` | Agent | 403 |
| 97 | Comptes utilisateurs (admin) | `GET` | `/api/users` | Admin | 200 |
| 98 | Désactiver le compte créé (admin) | `PATCH` | `/api/users/{{newUserId}}` | Admin | 200 |
| 99 | Journal d'audit (RH) | `GET` | `/api/activity?limit=20` | RH | 200 |
| 100 | Supprimer l'employé créé (admin) | `DELETE` | `/api/employees/{{employeeId}}` | Admin | 200 |
| 101 | Supprimer le département créé (admin) | `DELETE` | `/api/departments/{{departmentId}}` | Admin | 200 |

### 10. Sécurité

Chaque requête ici DOIT échouer : c'est la preuve que les protections fonctionnent.

| N° | Requête | Méthode | Adresse (après `{{baseUrl}}`) | Jeton | Résultat attendu |
| --- | --- | --- | --- | --- | --- |
| 102 | Sans jeton → 401 | `GET` | `/api/employees` | — | 401 |
| 103 | Jeton falsifié → 401 | `GET` | `/api/employees` | Faux jeton | 401 |
| 104 | Agent sur une route admin → 403 | `GET` | `/api/users` | Agent | 403 |
| 105 | Compte désactivé → 401 | `GET` | `/api/auth/me` | Nouvel agent | 401 |
| 106 | Route inconnue → 404 | `GET` | `/api/inexistant` | — | 404 ou 401 |

### Ce qu'il faut observer dans les réponses

| Dossier | À regarder dans la réponse |
| --- | --- |
| 3. Employés | `employee_code` généré (`EMP117`…) ; `total`, `page`, `limit` pour la pagination |
| 4. Présences | `working_hours`, `overtime`, `status` (`present`, `late`, `half_day`) ; `latitude` et `longitude` enregistrées |
| 5. Congés | `days` (jours ouvrés seulement) ; `paid_balance` avant et après l'approbation, puis après l'annulation |
| 6. Paie | `basic`, `allowances`, `overtime_pay`, `bonuses`, `gross`, `deductions`, `tax`, `net`, et `details` (le calcul complet) |
| 7. Performance | `score`, `level` et `recommendations` de l'analyse |
| 8. Dossiers | `reference`, `due_date` (dépôt + délai), `current_step`, `status`, `history` (une ligne par action), `permissions` |
| 9. Tableau de bord | `org` présent pour les RH, absent pour l'agent |

### Télécharger un PDF dans Postman
Pour « Télécharger mon bulletin PDF » ou « Récépissé PDF » : cliquer sur la **flèche à droite de Send** → **Send and Download**. Postman propose d'enregistrer le fichier `.pdf`. Avec un simple **Send**, le PDF s'affiche dans le panneau de réponse.

## 8.9 Lancer toute la collection d'un coup (Runner)

1. Survoler la collection **SIGRH – EMS API** → **⋯** → **Run collection** (ou le bouton **Run** en haut de la collection).
2. Laisser toutes les requêtes cochées, dans l'ordre. *Iterations* : `1`.
3. Cliquer sur **Run SIGRH – EMS API**.
4. En quelques secondes : 106 requêtes, 141 vérifications. Chaque ligne est verte (réussie) ou rouge (échouée). Cliquer sur une ligne affiche la requête et la réponse.

On peut relancer le Runner autant de fois qu'on veut : les données créées (département, employé, email, type de demande…) portent un suffixe unique basé sur l'heure, et les tests acceptent qu'un pointage ou un paiement ait déjà été fait lors d'un passage précédent.

**Idée pour la soutenance** : lancez le Runner devant le jury. En 5 secondes, il montre que toutes les fonctionnalités et toutes les protections marchent.

## 8.10 Les scripts de test expliqués

Les scripts sont écrits en JavaScript, avec l'objet `pm` (« Postman ») :

| Instruction | Signification |
| --- | --- |
| `pm.test("Nom", () => { ... })` | Déclare une vérification, qui apparaît dans *Test Results* |
| `pm.response.to.have.status(201)` | Le code HTTP doit être 201 |
| `pm.response.code` | Le code HTTP reçu (nombre) |
| `pm.response.json()` | Le corps de la réponse, transformé en objet JavaScript |
| `pm.response.headers.get("Content-Type")` | Lire un en-tête de réponse |
| `pm.expect(x).to.eql(y)` | `x` doit être égal à `y` |
| `pm.expect(x).to.be.oneOf([200, 409])` | `x` doit être l'une de ces valeurs |
| `pm.expect(x).to.be.above(0)` / `.within(0, 100)` | Comparaisons de nombres |
| `pm.expect(obj).to.have.property("salary")` / `.to.not.have.property(...)` | Présence ou absence d'un champ |
| `pm.expect(texte).to.match(/^EMP\d+$/)` | Le texte doit respecter un modèle (expression régulière) |
| `pm.collectionVariables.set("nom", valeur)` | Enregistrer une variable de collection |
| `pm.collectionVariables.get("nom")` | Lire une variable |

Exemple de script *Pre-request* (dossier Congés) : il calcule une période future qui commence un lundi, pour que la requête fonctionne quel que soit le jour où on la lance :
```js
const d = new Date(); d.setDate(d.getDate() + 60 + Math.floor(Math.random() * 200));
while (d.getDay() !== 1) d.setDate(d.getDate() + 1);        // avancer jusqu'au lundi
const e = new Date(d); e.setDate(d.getDate() + 2);          // mercredi
pm.collectionVariables.set("leaveStart", d.toISOString().slice(0, 10));
pm.collectionVariables.set("leaveEnd", e.toISOString().slice(0, 10));
```

## 8.11 En ligne de commande avec Newman (optionnel)

**Newman** exécute une collection Postman dans le terminal. C'est pratique pour l'automatiser, par exemple dans GitHub Actions.
```bash
npm install -g newman
newman run docs/postman/SIGRH-EMS.postman_collection.json
```
Pour viser le serveur en ligne :
```bash
newman run docs/postman/SIGRH-EMS.postman_collection.json --env-var "baseUrl=https://mon-api.onrender.com"
```
Le résultat affiche un tableau `requests / assertions` avec le nombre d'échecs.

## 8.12 Problèmes fréquents dans Postman

| Symptôme | Cause | Solution |
| --- | --- | --- |
| `Error: connect ECONNREFUSED 127.0.0.1:5002` | Serveur arrêté | `npm run server` |
| `Cloud Agent Error: Can not send requests to localhost` | Vous utilisez Postman dans le navigateur | Utiliser l'application de bureau, ou installer le *Postman Desktop Agent* |
| `401 Authentification requise` | Jeton vide : le dossier 1 n'a pas été exécuté | Envoyer « Connexion RH / Admin / Agent » |
| `401 Session invalide ou expirée` | Le jeton a plus de 8 heures, ou la base a été rechargée par `npm run seed` | Refaire les connexions du dossier 1 |
| `429 Trop de tentatives échouées` | Plus de 20 connexions ou inscriptions **ratées** en 15 minutes (les réussies ne comptent pas) | Attendre 15 minutes, ou redémarrer le serveur (le compteur est en mémoire) |
| `404` avec `{{projectId}}` dans l'adresse | La variable est vide : la requête de création n'a pas été exécutée | Exécuter les requêtes du dossier dans l'ordre |
| `400 JSON invalide` | Virgule en trop ou guillemets manquants dans le Body | Vérifier le JSON (Postman souligne l'erreur en rouge) ; le type doit être **raw → JSON** |
| `409` en rejouant une requête | Normal : doublon refusé (pointage, email, période de congé, bulletin) | C'est la règle de gestion qui fonctionne |
| « Mes soldes » ne correspond pas | Des congés créés à la main (8.7) sont restés en attente | Les annuler, ou relancer `npm run seed` |

## 8.13 Référence rapide de toutes les routes

| Module | Routes |
| --- | --- |
| Santé | `GET /api/health` |
| Authentification | `POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/me` · `PUT /api/auth/password` |
| Employés | `GET /api/employees` · `GET /api/employees/me` · `PUT /api/employees/me` · `GET /api/employees/:id` · `POST /api/employees` · `PUT /api/employees/:id` · `DELETE /api/employees/:id` |
| Départements | `GET /api/departments` · `GET /api/departments/:id` · `POST /api/departments` · `PUT /api/departments/:id` · `DELETE /api/departments/:id` |
| Présences | `POST /api/attendance/check-in` · `POST /api/attendance/check-out` · `GET /api/attendance/today` · `GET /api/attendance` · `GET /api/attendance/report` · `POST /api/attendance` · `POST /api/attendance/mark-absent` |
| Congés | `GET /api/leaves` · `GET /api/leaves/balance` · `POST /api/leaves` · `PATCH /api/leaves/:id/review` · `PATCH /api/leaves/:id/cancel` |
| Paie | `GET /api/payroll` · `GET /api/payroll/rules` · `POST /api/payroll/preview` · `POST /api/payroll/generate` · `GET /api/payroll/:id` · `GET /api/payroll/:id/pdf` · `PATCH /api/payroll/:id/pay` · `DELETE /api/payroll/:id` |
| Performance | `GET /api/performance` · `POST /api/performance` · `PUT /api/performance/:id` · `DELETE /api/performance/:id` · `GET /api/performance/insights/:employeeId` |
| Dossiers | `GET /api/projects/config` · `POST /api/projects/request-types` · `PUT /api/projects/request-types/:id` · `POST /api/projects/deposit-types` · `PUT /api/projects/deposit-types/:id` · `PUT /api/projects/circuit` · `GET /api/projects` · `POST /api/projects` · `GET /api/projects/:id` · `PUT /api/projects/:id` · `POST /api/projects/:id/actions` · `GET /api/projects/:id/receipt` · `POST /api/projects/:id/documents` · `GET /api/projects/:id/documents/:docId` |
| Tableau de bord | `GET /api/dashboard` |
| Notifications et annonces | `GET /api/notifications` · `PATCH /api/notifications/:id/read` · `GET /api/announcements` · `POST /api/announcements` · `DELETE /api/announcements/:id` · `GET /api/calendar` |
| Rapports | `GET /api/reports/departments` · `/payroll` · `/leaves` · `/projects` · `/analytics` |
| Comptes et audit | `GET /api/users` · `PATCH /api/users/:id` · `GET /api/activity` |

Le détail des paramètres, des corps et des droits de chaque route est dans le document 6, section 6.2. Les codes de réponse sont expliqués dans la section 6.4.

La collection appelle **chacune** de ces routes au moins une fois.

---
Projet SIGRH (EMS) — documentation.
