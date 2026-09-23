# SIGRH – Système de Gestion des Employés (Ministère de la Fonction Publique)

Application web complète de gestion des ressources humaines, développée pour un **ministère de la Fonction publique** :
gestion des agents et des départements, présences, congés, paie, évaluations de performance, **enregistrement des projets / dossiers
et suivi de leur circuit de traitement** (type de dépôt, type de demande, agent traitant), tableaux de bord et rapports.

| Couche | Technologies |
|---|---|
| Frontend | React 19, React Router 7, Vite, CSS3 (thème clair/sombre, responsive), lucide-react |
| Backend | Node.js 22, Express 5, API REST |
| Base de données | PostgreSQL 16 (driver `pg`, requêtes paramétrées, contraintes et index) |
| Sécurité | JWT, bcrypt, contrôle d'accès par rôle (RBAC), helmet, limitation du débit sur l'authentification |
| Documents | PDFKit : bulletins de paie et récépissés de dépôt téléchargeables |
| Qualité | 34 tests d'intégration (`node:test`) et CI GitHub Actions |


## 📚 Documentation

| N° | Document |
|---|---|
| 1 | [Présentation du projet](docs/01-presentation-du-projet.md) |
| 2 | [Cahier des charges](docs/02-cahier-des-charges.md) |
| 3 | [Guide de réalisation](docs/03-guide-realisation.md) |
| 4 | [Commandes et code expliqués](docs/04-commandes-et-code-expliques.md) |
| 5 | [Base de données PostgreSQL](docs/05-base-de-donnees-postgresql.md) |
| 6 | [API REST](docs/06-api-rest.md) |
| 7 | [Pourquoi chaque fichier](docs/07-pourquoi-chaque-fichier.md) |
| 8 | [API REST avec Postman](docs/08-api-rest-postman.md) + [collection à importer](docs/postman/SIGRH-EMS.postman_collection.json) |

---

## 📂 Structure

```
EMS/
├── client/                    # React (Vite)
│   ├── src/
│   │   ├── components/        # Layout, UI (modales, badges, graphiques), formulaires, pointage
│   │   ├── pages/             # Employés, Départements, Présences, Congés, Paie, Performance,
│   │   │                      # Dossiers, Paramètres du circuit, Rapports, Annonces, Comptes, Profil
│   │   ├── dashboard/         # Tableaux de bord Admin/RH et Agent
│   │   ├── services/api.js    # Client REST (JWT, téléchargements)
│   │   ├── context/           # Auth, thème (mode sombre), notifications toast
│   │   ├── App.jsx            # Routes et protection par rôle
│   │   └── index.jsx          # Point d'entrée
│   └── vercel.json
├── server/                    # Express + PostgreSQL
│   ├── routes/                # Déclaration des routes REST
│   ├── controllers/           # Logique métier
│   ├── models/                # Accès aux données (requêtes SQL partagées)
│   ├── middleware/            # auth JWT/RBAC, erreurs, nettoyage des entrées
│   ├── utils/                 # paie, PDF, notifications, audit, dates, seed, migration
│   ├── db/schema.sql          # Schéma (idempotent, appliqué au démarrage)
│   ├── tests/api.test.js      # Tests d'intégration
│   └── server.js
└── README.md
```

---

## 🚀 Démarrage rapide

Prérequis : Node.js ≥ 20 et PostgreSQL ≥ 14.

```bash
git clone https://github.com/Aeysha2/EMS.git
cd EMS
npm run install-all

# 1. Base de données
createdb ems
cp server/.env.example server/.env      # puis adapter DATABASE_URL et JWT_SECRET

# 2. Données de démonstration (⚠ vide les tables)
npm run seed

# 3. Lancer l'API (http://localhost:5002) et le frontend (http://localhost:5173)
npm run server
npm run client
```

### Comptes de démonstration

| Rôle | Email | Mot de passe |
|---|---|---|
| 👑 Administrateur | `admin@ems.gov` | `Admin@123` |
| 👩‍💼 Ressources Humaines | `rh@ems.gov` | `Rh@12345` |
| 👨‍💻 Agent | `agent@ems.gov` | `Agent@123` |

Tous les autres agents du jeu de données se connectent avec leur email et `Agent@123`.
Sur l'écran de connexion, un clic sur un profil pré-remplit les identifiants.

### Tests

Les tests vident les tables : ils exigent une base dédiée.

```bash
createdb ems_test
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/ems_test npm test
```

---

## 🎨 Parcours applicatif

`Connexion → choix du profil (Admin / RH / Agent) → Tableau de bord → Présences → Congés → Paie → Rapports`

## 📌 Fonctionnalités

### 👤 Authentification et rôles
- Inscription et connexion (`POST /api/auth/register`, `POST /api/auth/login`), mots de passe hachés avec bcrypt (coût 12), jeton JWT.
- Trois rôles : **Administrateur**, **RH**, **Agent**. Un agent désigné comme **responsable d'un département** devient automatiquement *chef de service* : il valide les congés, évalue son équipe et affecte les dossiers de son service.
- L'inscription publique crée toujours un compte *agent*. Pour rattacher un dossier RH existant, il faut fournir son matricule, ce qui empêche l'usurpation d'un dossier par simple email.
- Le rôle est relu en base à chaque requête : un compte désactivé ou rétrogradé perd ses droits immédiatement.

### 👨‍💼 Employés
- Identifiant auto-généré (`EMP101`…), matricule, nom, département, fonction, grade, email, téléphone, date d'entrée, salaire, statut, soldes de congés.
- **Recherche avancée** : texte libre (nom, ID, matricule, email, fonction, département), filtres par département, statut, fonction, dates d'entrée et fourchette de salaire (RH uniquement), tri et pagination. Vue tableau ou cartes, export CSV.
- **Données sensibles protégées** : les agents ne voient que l'annuaire, sans salaire ni données privées. Les chefs de service voient leur équipe, sans salaire.

### 🏢 Départements
Nom, sigle, responsable, effectif (calculé), budget annuel et taux de consommation par la masse salariale. Création et modification par les RH et l'administrateur, suppression par l'administrateur.

### 🕒 Présences
- Pointage d'arrivée et de départ avec **géolocalisation GPS** (mobile), détection des retards (heure de début configurable), calcul des heures travaillées et des heures supplémentaires, demi-journée.
- **Aucun doublon possible** : contrainte `UNIQUE(employee_id, work_date)` et `INSERT … ON CONFLICT`. Plusieurs clics simultanés ne créent qu'une seule ligne (testé).
- Saisie ou correction manuelle par les RH. Le bouton *Clôturer la journée* marque les absents et les agents en congé, et **notifie les pointages manquants**.
- **Rapport mensuel** par agent (présences, retards, absences, congés, heures, heures supplémentaires), exportable en CSV et imprimable.

### 📝 Congés
- Types : occasionnel, maladie, payé (annuel), sans solde. Seuls les **jours ouvrés** sont décomptés.
- L'agent demande, annule et consulte son historique. Les RH, l'administrateur et le chef de service approuvent ou rejettent avec un commentaire.
- **Soldes exacts** : les jours en attente sont réservés (pas de surréservation), le débit se fait à l'approbation, le crédit à l'annulation d'un congé approuvé, avec verrouillage transactionnel (`SELECT … FOR UPDATE`). Les chevauchements sont refusés et les soldes sont réinitialisés chaque année.

### 💰 Paie
- **Calcul automatique** pour tous les agents actifs ou une sélection : salaire de base, indemnités (logement 15 %, transport), heures supplémentaires pointées (×1,25), primes, retenues (congé sans solde, cotisation sociale, autres), **impôt progressif par tranches** et net à payer. Tous les taux sont configurables par variables d'environnement (`utils/payroll.js`).
- Un seul bulletin par agent et par mois (contrainte d'unicité). Recalcul possible tant que le bulletin n'est pas payé.
- **Bulletins PDF téléchargeables**, statut *traité* puis *payé*, export CSV, et notification « Salaire traité » puis « Salaire versé ».

### 🎯 Performance
- Évaluations (période, note de 1 à 5, feedback) et **objectifs** avec échéance et avancement. L'agent met à jour la progression de ses objectifs mais ne peut pas en modifier l'intitulé.
- Planification d'entretiens, avec notification « évaluation planifiée ».
- **Analyse automatique de performance** : un score sur 100 et des recommandations, calculés à partir des notes et de leur tendance, de l'assiduité et de la ponctualité sur 90 jours, des heures supplémentaires, des objectifs atteints et des dossiers en retard.

### 📁 Projets et dossiers (spécifique au ministère)
- **Enregistrement** d'un dossier : référence automatique `MFP-AAAA-00001`, objet, **type de demande** (recrutement, titularisation, avancement, reclassement, disponibilité, détachement, mutation, retraite, attestation…), **type de dépôt** (guichet, courrier, plateforme en ligne, transmission par la structure employeur), demandeur (matricule, structure), priorité. L'échéance est calculée à partir du délai réglementaire du type de demande.
- **Circuit de traitement** paramétrable : un circuit par défaut, et un circuit spécifique par type de demande (par exemple les pensions). Chaque étape est rattachée à un service et a un délai cible.
- **Agent traitant** : affectation par les RH, l'administrateur ou le chef du service concerné. Lors d'une transmission, le dossier passe au service de l'étape suivante et l'agent désigné est notifié.
- Actions : transmettre, retourner à l'étape précédente (motif obligatoire), demander des pièces complémentaires puis reprendre, rejeter (motif obligatoire), clôturer à la dernière étape, commenter.
- **Historique complet** (qui, quand, quelle étape, commentaire), **pièces jointes** (PDF, images, Word ; 3 Mo maximum) et **récépissé de dépôt PDF**.
- Visibilité : un agent voit les dossiers qui lui sont affectés, ceux qu'il a enregistrés, ceux de son service s'il en est chef, et ceux sur lesquels il est intervenu.

### 📊 Tableau de bord et rapports
- Admin et RH : effectif, présents du jour, agents en congé, demandes en attente, masse salariale du mois, effectif par département, présences sur 14 jours, dossiers par statut, dossiers en retard ou non affectés, activités récentes.
- Chef de service : les mêmes indicateurs, limités à son service. Agent : pointage, soldes de congés, dernier salaire, dossiers à traiter.
- Rapports : par département (effectif, masse salariale, budget, note moyenne), paie mensuelle, congés, **dossiers** (volumes, délais moyens comparés aux délais cibles, retards, charge des agents traitants), analyses RH (ancienneté, recrutements, grades). Export CSV et impression.

### 🔔 Notifications
Congé approuvé ou rejeté, nouvelle demande de congé (RH), salaire traité ou versé, pointage manquant, annonce publiée, évaluation planifiée ou finalisée, dossier affecté ou à traiter, dossier clôturé ou rejeté. Cloche avec compteur, actualisée toutes les 30 secondes.

### 🌟 Bonus inclus
🌙 Mode sombre · 📅 Calendrier (événements, congés, évaluations, échéances des dossiers) · 📱 Pointage mobile GPS · 😊 Portail libre-service (coordonnées, mot de passe) · 📄 Gestion des pièces des dossiers · 📊 Analyses RH · 🤖 Analyse de performance · 🧾 Journal d'audit des activités RH · 📲 Manifeste PWA (installable) · ⚙️ CI GitHub Actions.

---

## 🔐 Sécurité (défi n° 9)
- Requêtes SQL **toujours paramétrées**. Les noms de colonnes dynamiques passent par des listes blanches.
- Hachage bcrypt, JWT signé avec un secret obligatoire (le serveur refuse de démarrer s'il est absent), expiration de 8 h par défaut.
- Limitation du débit sur `/login` et `/register`, en-têtes de sécurité `helmet`, CORS restreint à `CLIENT_URL`.
- Filtrage des champs sensibles selon le rôle, protection contre la pollution de prototype sur les corps JSON.
- Toute action RH sensible (création ou modification d'un employé, changement de salaire, paie, congés, rôles, dossiers) est tracée dans `activity_logs`.

## ⚡ Performances de la base (défi n° 7)
Index sur les clés de filtrage (département, statut, dates de présence, statut et agent des dossiers, période de paie, notifications non lues), index sur `lower(full_name)`, agrégations côté SQL (`COUNT … FILTER`), pagination serveur.

---

## 📡 API REST (extrait)

| Méthode | Route | Accès |
|---|---|---|
| POST | `/api/auth/register` · `/api/auth/login` | public |
| GET | `/api/auth/me` · PUT `/api/auth/password` | connecté |
| GET/POST/PUT/DELETE | `/api/employees[/:id]` | lecture : tous (champs filtrés) · écriture : RH/Admin · suppression : Admin |
| GET/PUT | `/api/employees/me` | agent (libre-service) |
| GET/POST/PUT/DELETE | `/api/departments[/:id]` | lecture : tous · écriture : RH/Admin |
| POST | `/api/attendance/check-in` · `/check-out` | agent |
| GET | `/api/attendance` · `/today` · `/report?year=&month=` | selon le périmètre |
| POST | `/api/attendance` · `/mark-absent` | RH/Admin |
| GET/POST | `/api/leaves` · GET `/api/leaves/balance` | agent |
| PATCH | `/api/leaves/:id/review` · `/api/leaves/:id/cancel` | RH/Admin/chef de service · demandeur |
| POST | `/api/payroll/generate` · `/preview` | RH/Admin |
| GET | `/api/payroll` · `/:id` · `/:id/pdf` | propriétaire ou RH/Admin |
| GET/POST/PUT | `/api/performance` · GET `/insights/:employeeId` | RH/Admin/chef de service (+ agent : ses objectifs) |
| GET/POST | `/api/projects` · GET/PUT `/api/projects/:id` | selon la visibilité |
| POST | `/api/projects/:id/actions` `{action, comment, agent_id}` | agent traitant / chef de service / RH |
| GET | `/api/projects/:id/receipt` · POST `/:id/documents` | selon la visibilité |
| GET/POST/PUT | `/api/projects/config` · `/request-types` · `/deposit-types` · `/circuit` | lecture : tous · écriture : RH/Admin |
| GET | `/api/dashboard` · `/api/notifications` · `/api/calendar` | connecté |
| GET | `/api/reports/{departments,payroll,leaves,projects,analytics}` | RH/Admin |
| GET/PATCH | `/api/users` · GET `/api/activity` | Admin (audit : RH/Admin) |

---

## 🌍 Déploiement

**Base de données** : PostgreSQL managé (Render, Railway, Neon, Supabase). Le schéma est appliqué automatiquement au démarrage de l'API.

**Backend (Render ou Railway)**
- Root directory : `server`
- Build : `npm install` · Start : `npm start`
- Variables : `DATABASE_URL`, `DB_SSL=true` (si requis par l'hébergeur), `JWT_SECRET` (au moins 32 caractères aléatoires), `CLIENT_URL=https://<votre-app>.vercel.app`, `TZ=Africa/Dakar` (fuseau utilisé pour dater les pointages), `NODE_ENV=production`
- Données de démonstration (optionnel, une seule fois) : `npm run seed`

**Frontend (Vercel)**
- Root directory : `client`, preset Vite
- Variable : `VITE_API_URL=https://<votre-api>.onrender.com`
- `vercel.json` gère la réécriture des routes de la SPA.

---

## 🧭 Pistes d'évolution
Recrutement et intégration, planning des équipes, notes de frais, pointage biométrique, notifications temps réel (WebSockets), mode hors ligne (service worker), signature électronique des actes, portail usager pour suivre un dossier par sa référence.
