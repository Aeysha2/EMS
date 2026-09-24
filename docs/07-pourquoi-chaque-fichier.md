# Document 7 — Pourquoi chaque fichier, et pourquoi ce nom

Ce document décrit **chaque fichier** du SIGRH : à quoi il sert, pourquoi il porte ce nom, et ce qu’il ne faut pas y mettre.

## 1. Les principes d’organisation

| Principe | Application |
|---|---|
| **Séparer par couche** | `routes/` dit *quelle URL*, `controllers/` dit *quoi faire*, `models/` dit *comment lire la base*. Une modification d’URL ne touche pas la logique, et inversement |
| **Regrouper par module métier** | Un contrôleur par domaine du cahier des charges : structures, agents, circuits, Solde, pilotage… |
| **Nommer en anglais pour le code, en français pour l’utilisateur** | Les noms de fichiers et de variables suivent les conventions du JavaScript (`employeeController.js`) ; tous les textes affichés sont en français. Les termes propres à l’administration sénégalaise restent en français (`Solde`, `Pilotage`, `Reprise`, `Parametrage`) car ils n’ont pas d’équivalent exact |
| **Conventions de casse** | `camelCase` pour les fichiers JavaScript (`authController.js`), `PascalCase` pour les composants React et les modèles (`AgentDossier.jsx`, `Workflow.js`), `snake_case` pour SQL (`workflow_steps`) |
| **Suffixe = rôle** | `…Controller.js`, `…Routes.js`, `….test.js` : on sait ce que contient un fichier sans l’ouvrir |

## 2. Racine du dépôt

| Fichier | Rôle |
|---|---|
| `package.json` | Scripts qui pilotent les deux sous-projets depuis la racine (`install-all`, `server`, `client`, `seed`, `test`, `build`) |
| `README.md` | Présentation, démarrage rapide, comptes de démonstration. C’est la première page affichée par GitHub |
| `.gitignore` | Exclut `node_modules/`, `.env`, `dist/` : les dépendances se réinstallent, les secrets ne se publient jamais |
| `.github/workflows/ci.yml` | Intégration continue : à chaque `push`, GitHub démarre un PostgreSQL, lance les 30 tests et construit le frontend |
| `docs/` | Documentation 01 à 08 et `postman/SIGRH-Senegal.postman_collection.json` |

## 3. Le serveur (`server/`)

### 3.1 Point d’entrée et configuration

| Fichier | Rôle | Pourquoi ce nom |
|---|---|---|
| `server.js` | Crée l’application Express, branche les middlewares et les routes, applique le schéma, démarre l’écoute et les alertes | Nom conventionnel du point d’entrée d’un serveur Node |
| `package.json` | Dépendances (express, pg, bcryptjs, jsonwebtoken, helmet, express-rate-limit, pdfkit, qrcode, exceljs…) et scripts | Imposé par npm |
| `.env.example` | Modèle de configuration **sans secret**, versionné. On le copie en `.env` (non versionné) | Convention : `.env` est lu par `dotenv` |
| `config/db.js` | Pool de connexions PostgreSQL, `query`, `withTransaction` | `config/` regroupe ce qui dépend de l’environnement |
| `db/schema.sql` | Toutes les tables, contraintes, index, séquences et le déclencheur du journal | Un seul fichier SQL lisible, exécutable dans pgAdmin |

### 3.2 Middlewares (`middleware/`)
Un middleware s’exécute **avant** (ou après) le contrôleur, pour toutes les routes concernées.

| Fichier | Rôle |
|---|---|
| `auth.js` | Vérifie le jeton, recharge l’utilisateur et son périmètre (institution, structures dirigées), impose la 2FA, fournit `authorize` et `accessLevel` |
| `errorHandler.js` | Transforme toute erreur en réponse JSON lisible (et les codes PostgreSQL en codes HTTP) ; renvoie 404 pour les routes inconnues |
| `sanitize.js` | Retire des corps JSON les clés dangereuses (`__proto__`, `constructor`) |

### 3.3 Modèles (`models/`)
Fonctions d’accès aux données **réutilisées par plusieurs contrôleurs**. Le nom est au singulier, en PascalCase, comme l’entité.

| Fichier | Rôle |
|---|---|
| `Employee.js` | Requête de lecture d’un agent, filtrage des champs selon le niveau d’accès (`shapeEmployee`), identifiant SIGRH, historisation (`trackChanges`), listes des positions statutaires |
| `Structure.js` | Sous-arbre (`subtreeIds`), ascendants (`ancestors`), institution d’une structure, types de structures |
| `Workflow.js` | **Moteur de circuits** : valideurs de chaque étape, droits d’agir et de voir, création de demande, actions, effets appliqués au dossier |

### 3.4 Contrôleurs (`controllers/`)
Un contrôleur par module ; chaque fonction exportée correspond à une route.

| Fichier | Module du cahier des charges |
|---|---|
| `authController.js` | Connexion, 2FA (enrôlement, vérification, désactivation), activation de compte, mot de passe |
| `employeeController.js` | Dossier administratif : liste et recherche, création, modification, NIN, identité, biométrie, diplômes, sanctions et distinctions, pièces |
| `structureController.js` | Référentiel des structures, propositions et validation centrale, postes budgétaires, corps |
| `workflowController.js` | Paramétrage des circuits, dépôt et suivi des demandes, actions, récépissé, pièces |
| `leaveController.js` | Types et soldes de congés, demandes d’absence (reliées au circuit CONGE), annulation |
| `attendanceController.js` | Pointages (portail, biométrie via `recordPunch`), clôture de journée, rapport mensuel et absentéisme |
| `trainingController.js` | Catalogue, sessions, inscriptions, certification |
| `performanceController.js` | Évaluations annuelles et analyse de performance |
| `soldeController.js` | Bulletins, simulation, import des états de la Solde, **contrôle de cohérence** |
| `pilotageController.js` | Indicateurs consolidés, exports Excel et PDF, tableau de bord d’accueil |
| `interopController.js` | Authentification par clé, points d’accès partenaires, gestion des clés, OpenAPI |
| `importController.js` | Reprise des données existantes (analyse, validation par la DRH) |
| `adminController.js` | Comptes et revue des droits, journal d’audit, notifications, annonces, calendrier |

### 3.5 Routes (`routes/`)
Associent une méthode HTTP et une URL à une fonction de contrôleur. Certaines routes de modules proches sont regroupées :

| Fichier | URLs |
|---|---|
| `authRoutes.js` | `/api/auth/*` (avec limitation du nombre de tentatives) |
| `employeeRoutes.js` | `/api/employees/*` |
| `structureRoutes.js` | `/api/structures/*` |
| `workflowRoutes.js` | `/api/requests/*` et, via `typesRouter`, `/api/workflows/types` |
| `timeRoutes.js` | « Temps de travail » : `/api/leaves/*` et `/api/attendance/*` |
| `careerRoutes.js` | « Carrière » : `/api/trainings/*` et `/api/performance/*` |
| `soldeRoutes.js` | `/api/solde/*` |
| `interopRoutes.js` | `/api/interop/v1/*` (partenaires, clé d’API) et `/api/interop/clients` (DSI) |
| `adminRoutes.js` | Routes transverses montées sur `/api` : dashboard, pilotage, corps, postes, reprise, notifications, annonces, calendrier, administration |

### 3.6 Utilitaires (`utils/`)
Fonctions techniques sans lien avec une URL précise.

| Fichier | Rôle |
|---|---|
| `AppError.js` | Classe d’erreur avec code HTTP, et `assert(condition, message, statut)` |
| `crypto.js` | Chiffrement AES-256-GCM, index aveugle HMAC, masquage, empreintes, **TOTP** |
| `audit.js` | Écriture et vérification du **journal chaîné** |
| `notify.js` | Envoi de notifications à des comptes, à un agent, ou à des profils d’une institution |
| `alerts.js` | Contrôle horaire des délais des circuits |
| `dates.js` | Validation stricte des dates, jours ouvrés, bornes d’un mois |
| `csv.js` | Lecture des CSV (séparateur `;` ou `,`, guillemets, BOM Excel) |
| `sanitize.js` | `pick` (liste blanche de champs), `buildUpdate`, `toInt`, `pagination` |
| `etatCivil.js` | Connecteur au registre d’état civil (réel si `ETAT_CIVIL_URL`, sinon simulation) |
| `payroll.js` | Calcul indicatif d’un bulletin (simulation) |
| `payslipPdf.js` | Mise en page PDF du bulletin, aux couleurs nationales |
| `migrate.js` / `runMigrate.js` | Application du schéma (au démarrage / en ligne de commande) |
| `seed.js` | Données de démonstration nationales |

### 3.7 Tests (`tests/sigrh.test.js`)
Un seul fichier, organisé en blocs `describe` par thème (authentification, habilitations, dossier, circuits, formation, Solde, interopérabilité, référentiel, reprise, audit).
Le suffixe `.test.js` permet à `node --test` de le trouver.

## 4. L’interface (`client/`)

### 4.1 Configuration

| Fichier | Rôle |
|---|---|
| `index.html` | Page unique qui charge l’application React ; titre, couleur de thème, favicon |
| `vite.config.js` | Outil de développement ; **proxy** `/api` → `http://localhost:5002` pour éviter les problèmes de CORS en local |
| `package.json` | React, React Router, lucide-react (icônes), Vite |
| `.env.example` | `VITE_API_URL` (adresse de l’API en production), `VITE_CURRENCY` |
| `vercel.json`, `public/_redirects` | Réécriture des routes vers `index.html` sur les hébergeurs (Vercel, Netlify) |
| `public/favicon.svg`, `public/manifest.webmanifest` | Icône aux couleurs du drapeau ; application installable |

### 4.2 Socle (`src/`)

| Fichier | Rôle |
|---|---|
| `index.jsx` | Point d’entrée : monte `<App />` dans les fournisseurs (routeur, thème, notifications, authentification) |
| `App.jsx` | Toutes les routes, et `RequireAuth` (connexion, 2FA obligatoire, profil autorisé) |
| `index.css` | Toute la mise en forme : variables de couleur (vert `#00853F`, jaune `#FDEF42`, rouge `#E31B23`), mode sombre, responsive |
| `services/api.js` | Seul endroit qui appelle l’API : jeton, erreurs, téléchargements |
| `utils/useFetch.js` | Hook de chargement (`data`, `loading`, `error`, `reload`) |
| `utils/format.js` | Libellés français (profils, positions, statuts…), formats de montants et de dates, export CSV |
| `context/AuthContext.jsx` | Utilisateur connecté, connexion en deux étapes, raccourcis de profil |
| `context/ThemeContext.jsx` | Mode clair ou sombre (mémorisé) |
| `context/ToastContext.jsx` | Messages de confirmation et d’erreur |

### 4.3 Composants (`src/components/`)
Morceaux d’interface réutilisés par plusieurs pages.

| Fichier | Rôle |
|---|---|
| `ui.jsx` | Boîte à outils : badges, modales, champs, cartes de statistiques, onglets, pagination, graphiques (barres, colonnes, anneau) |
| `Layout.jsx` | Cadre : barre latérale filtrée selon le profil, bandeau « République du Sénégal », emblème, cloche de notifications |
| `AgentForm.jsx` | Formulaire de création et de modification d’un dossier agent |
| `RequestForm.jsx` | Formulaire de dépôt d’une demande ou d’initiation d’un acte (champs du `payload` selon le type) |
| `Indicators.jsx` | Indicateurs de pilotage et **pyramide des âges** |
| `InsightsPanel.jsx` | Analyse de performance d’un agent |
| `CheckInCard.jsx` | Carte de pointage d’arrivée et de départ |
| `MfaEnroll.jsx` | Enrôlement de la double authentification (QR code, confirmation) |

### 4.4 Pages (`src/pages/`) et tableau de bord

| Fichier | Écran |
|---|---|
| `Login.jsx` | Connexion (profils de démonstration), saisie du code 2FA |
| `Activate.jsx` | Activation de son compte par l’agent |
| `MfaSetup.jsx` | Activation imposée de la 2FA |
| `dashboard/Dashboard.jsx` | Accueil adapté au profil |
| `Agents.jsx` | Annuaire et liste des agents avec filtres |
| `AgentDossier.jsx` | Dossier individuel (onglets) ; sert aussi pour « Mon dossier » |
| `Structures.jsx` | Organigramme de l’État, fiche structure, propositions de modification |
| `Requests.jsx` / `RequestDetail.jsx` | Liste des demandes / détail, circuit, historique, actions |
| `Absences.jsx` | Congés, soldes, pointages, rapport mensuel |
| `Trainings.jsx` | Catalogue et sessions de formation |
| `Performance.jsx` | Évaluations |
| `Solde.jsx` | Bulletins, simulation, imports et contrôle de cohérence |
| `Pilotage.jsx` | Tableaux de bord RH et exports |
| `Parametrage.jsx` | Éditeur de circuits et référentiel des corps |
| `Interop.jsx` | Systèmes partenaires et clés d’API |
| `Reprise.jsx` | Reprise des données existantes |
| `Admin.jsx` | Habilitations et journal d’audit |
| `Announcements.jsx` | Annonces et calendrier |
| `Profile.jsx` | Mon compte : coordonnées, mot de passe, double authentification |

## 5. Où ajouter quoi ?

| Je veux… | Fichiers à modifier |
|---|---|
| Ajouter un champ au dossier agent | `db/schema.sql` (colonne), `employeeController.js` (liste `EDITABLE`), `models/Employee.js` (niveau d’accès), `AgentForm.jsx`, `AgentDossier.jsx` |
| Ajouter un type d’acte | Aucun code si l’effet existe : écran **Circuits et référentiels**. Nouvel effet : `models/Workflow.js` (`EFFECT_VALIDATORS` et `EFFECTS`), contrainte `effect` du schéma, `RequestForm.jsx` |
| Ajouter un indicateur de pilotage | `pilotageController.js` (`computeIndicators`, exports), `Indicators.jsx` |
| Ouvrir un nouveau point d’accès partenaire | `interopController.js` (+ `SCOPES` et `openapi`), `interopRoutes.js` |
| Ajouter une page | `pages/NouvellePage.jsx`, une route dans `App.jsx`, une entrée dans `NAV` de `Layout.jsx` |
