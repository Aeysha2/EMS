# 3. Guide de réalisation du projet

On reconstruit SIGRH en 10 phases, dans cet ordre : d'abord la base de données et le serveur (backend), puis l'interface (frontend). **Chaque phase se teste avant de passer à la suivante.** Si un test échoue, on corrige avant d'avancer.

```mermaid
flowchart LR
  A[1. Outils] --> B[2. Dossiers + Git]
  B --> C[3. PostgreSQL]
  C --> D[4. Serveur Express]
  D --> E[5. Schéma SQL]
  E --> F[6. Auth JWT]
  F --> G[7. Modules métier]
  G --> H[8. Client React]
  H --> I[9. Pages]
  I --> J[10. Tests + mise en ligne]
```

Le serveur tourne sur le port **5002**, le client sur le port **5173**. Vite redirige tous les appels `/api` du client vers le serveur.

## Phase 1 — Installer les outils

1. **Node.js** (version 20 ou plus, « LTS ») depuis nodejs.org. Vérifier dans un terminal : `node -v` et `npm -v`.
2. **PostgreSQL** (version 14 ou plus) depuis postgresql.org. L'installateur installe aussi **pgAdmin 4**. Notez le mot de passe de l'utilisateur `postgres` (voir le document 5).
3. **VS Code** et **Git**. Vérifier : `git --version`.
4. Dans VS Code, installer l'extension **Thunder Client** (ou le logiciel Postman) pour tester l'API.

## Phase 2 — Créer la structure des dossiers

```bash
mkdir EMS
cd EMS
git init
mkdir server client docs
```

On sépare `server` (Node/Express) et `client` (React). Ce sont deux programmes différents, chacun avec son propre `package.json`.

Créer tout de suite le fichier `.gitignore` à la racine, pour ne **jamais** envoyer les secrets ni les dépendances sur GitHub :

```
node_modules/
dist/
.env
.env.local
*.log
```

Créer ensuite un `package.json` à la racine avec des raccourcis (voir le document 4, section 4.2).

## Phase 3 — Préparer PostgreSQL

Dans pgAdmin (détails dans le document 5) :
1. Créer la base `ems`.
2. Créer l'utilisateur `ems_user` et le rendre propriétaire de la base :
```sql
CREATE USER ems_user WITH PASSWORD 'ems2026';
ALTER DATABASE ems OWNER TO ems_user;
```

**Test** : dans pgAdmin, la base `ems` apparaît sous *Databases*.

## Phase 4 — Démarrer le serveur Express

```bash
cd server
npm init -y
npm install express pg bcryptjs jsonwebtoken cors dotenv helmet express-rate-limit pdfkit
npm install -D nodemon
```

1. Dans `server/package.json`, ajouter `"type": "module"` et les scripts `start`, `dev`, `seed`, `migrate`, `test` (document 4, section 4.3).
2. Créer `server/.env` et `server/.env.example` (document 4, section 4.4).
3. Créer `server/config/db.js` : la connexion à PostgreSQL (un « pool » de connexions).
4. Créer `server/server.js` avec, pour l'instant, une seule route :
```js
app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'online', database: 'ok' });
});
```
5. Lancer : `npm run dev`.

**Test** : ouvrir http://localhost:5002/api/health. On doit voir `{"status":"online","database":"ok"}`. Si le serveur affiche une erreur de mot de passe, corriger `DATABASE_URL` dans `.env`.

## Phase 5 — Écrire le schéma SQL

1. Créer `server/db/schema.sql` avec toutes les tables (document 5, section 5.4). On écrit `CREATE TABLE IF NOT EXISTS` pour pouvoir relancer le script sans erreur.
2. Créer `server/utils/migrate.js` : il lit `schema.sql` et l'exécute.
3. Dans `server.js`, appeler `migrate()` avant `app.listen(...)`.

**Test** : relancer le serveur, puis dans pgAdmin faire clic droit sur `ems` → **Refresh** → *Schemas → public → Tables*. Les 16 tables apparaissent.

## Phase 6 — Authentification (inscription, connexion, rôles)

Dans cet ordre :
1. `utils/AppError.js` : une erreur avec un code HTTP (400, 401, 403, 404…).
2. `middleware/errorHandler.js` : transforme toutes les erreurs en réponse JSON propre.
3. `models/User.js` et `models/Employee.js` : les requêtes SQL réutilisables.
4. `middleware/auth.js` : `signToken` (crée le jeton), `protect` (vérifie le jeton) et `authorize('admin','hr')` (vérifie le rôle).
5. `controllers/authController.js` : `register`, `login`, `me`, `changePassword`.
6. `routes/authRoutes.js`, branché dans `server.js` : `app.use('/api/auth', authRoutes)`.

**Test** avec Thunder Client (document 6) :
- `POST http://localhost:5002/api/auth/register` avec `{"name":"Test","email":"test@ems.gov","password":"Test1234"}` renvoie `201` et un `token`.
- `POST /api/auth/login` avec les mêmes identifiants renvoie `200`.
- `GET /api/auth/me` avec l'en-tête `Authorization: Bearer <token>` renvoie l'utilisateur.

## Phase 7 — Les modules métier (un par un)

Pour **chaque** module, on applique toujours le même schéma : **contrôleur → routes → branchement dans `server.js` → test**.

| Ordre | Module | Fichiers | Test rapide |
| --- | --- | --- | --- |
| 7.1 | Départements | `departmentController.js`, `departmentRoutes.js` | `POST /api/departments` en RH |
| 7.2 | Employés | `employeeController.js`, `employeeRoutes.js` | `GET /api/employees?q=...` |
| 7.3 | Utilitaires | `utils/dates.js`, `utils/notify.js`, `utils/audit.js`, `utils/sanitize.js` | — |
| 7.4 | Présences | `attendanceController.js`, `attendanceRoutes.js` | Deux `check-in` → le 2ᵉ renvoie `409` |
| 7.5 | Congés | `leaveController.js`, `leaveRoutes.js` | Demande, puis approbation → solde diminué |
| 7.6 | Paie | `utils/payroll.js`, `utils/payslipPdf.js`, `payrollController.js`, `payrollRoutes.js` | `POST /api/payroll/generate`, puis PDF |
| 7.7 | Performance | `performanceController.js`, `performanceRoutes.js` | `GET /api/performance/insights/1` |
| 7.8 | Dossiers | `models/Project.js`, `projectController.js`, `projectRoutes.js` | Créer un dossier, puis `POST /actions` avec `advance` |
| 7.9 | Tableau de bord, rapports, notifications, comptes | `dashboardController.js`, `reportController.js`, `notificationController.js`, `userController.js`, `miscRoutes.js` | `GET /api/dashboard` |

Ensuite, écrire `utils/seed.js` (les données de démo) et lancer `npm run seed`.

**Test** : dans pgAdmin, clic droit sur la table `employees` → *View/Edit Data → All Rows* : 16 agents apparaissent.

## Phase 8 — Créer le client React

```bash
cd ..            # revenir à la racine EMS
npm create vite@latest client -- --template react
cd client
npm install
npm install react-router-dom lucide-react
```

1. Supprimer les fichiers de démonstration de Vite (`App.css`, `assets/react.svg`…).
2. Renommer `src/main.jsx` en `src/index.jsx`, et modifier la balise `<script>` de `index.html` en conséquence.
3. Dans `vite.config.js`, ajouter le **proxy** `/api` vers `http://localhost:5002` (document 4, section 4.30).
4. Créer les dossiers `src/components`, `src/pages`, `src/dashboard`, `src/services`, `src/context`, `src/utils`.
5. Écrire dans cet ordre :
   - `services/api.js` : toutes les requêtes vers le serveur, avec le jeton ;
   - `context/AuthContext.jsx` : l'utilisateur connecté ;
   - `context/ThemeContext.jsx` : le mode sombre ;
   - `context/ToastContext.jsx` : les petits messages de confirmation ;
   - `utils/format.js` : l'affichage des dates, des montants et des libellés ;
   - `utils/useFetch.js` : un « hook » qui charge des données ;
   - `components/ui.jsx` : les briques d'interface (Modal, Badge, StatCard, graphiques…) ;
   - `index.css` : le style global.
6. Écrire `index.jsx` (les fournisseurs de contexte), puis `App.jsx` (les routes).

**Test** : `npm run dev` dans `client/`, puis ouvrir http://localhost:5173.

## Phase 9 — Les pages

Ordre conseillé, du plus simple au plus complexe :

1. `pages/Login.jsx` et `pages/Register.jsx`, puis `components/Layout.jsx` (menu latéral, barre du haut, cloche des notifications).
2. `dashboard/Dashboard.jsx`, `EmployeeDashboard.jsx`, `AdminDashboard.jsx`, `AnnouncementsWidget.jsx`, `components/CheckInCard.jsx`.
3. `pages/Departments.jsx`.
4. `pages/Employees.jsx`, `components/EmployeeForm.jsx`, `pages/EmployeeDetail.jsx`.
5. `pages/Attendance.jsx`.
6. `pages/Leaves.jsx`.
7. `pages/Payroll.jsx`.
8. `pages/Performance.jsx`, `components/InsightsPanel.jsx`.
9. `pages/Projects.jsx`, `components/ProjectForm.jsx`, `pages/ProjectDetail.jsx`, `pages/ProjectSettings.jsx`.
10. `pages/Reports.jsx`, `pages/Announcements.jsx`, `pages/Users.jsx`, `pages/Profile.jsx`.

**Test à chaque page** : se connecter avec chacun des trois profils et vérifier ce que chacun voit, et ce qu'il **ne doit pas** voir.

## Phase 10 — Tests, GitHub et mise en ligne

1. **Tests automatiques** : créer une base `ems_test` (réservée aux tests, car ils vident toutes les tables), écrire `server/tests/api.test.js`, puis lancer :
```bash
# Windows (PowerShell)
$env:TEST_DATABASE_URL="postgresql://ems_user:ems2026@localhost:5432/ems_test"; npm test
# Mac / Linux
TEST_DATABASE_URL=postgresql://ems_user:ems2026@localhost:5432/ems_test npm test
```
   Pour créer `ems_test` avec `ems_user` comme propriétaire : `CREATE DATABASE ems_test OWNER ems_user;` dans pgAdmin.
2. **Build du client** : `npm run build` dans `client/`. Il ne doit y avoir aucune erreur.
3. **GitHub** :
```bash
git add .
git commit -m "Première version de SIGRH"
git branch -M main
git remote add origin https://github.com/<votre-compte>/EMS.git
git push -u origin main
```
4. **Intégration continue** : le fichier `.github/workflows/ci.yml` relance les tests et le build à chaque `push`. Le résultat apparaît dans l'onglet **Actions** de GitHub.
5. **Mise en ligne** (optionnelle) :
   - base PostgreSQL gratuite sur Render, Railway ou Neon ;
   - serveur sur Render : *Root directory* = `server`, *Start* = `npm start`, et les variables `DATABASE_URL`, `DB_SSL=true`, `JWT_SECRET`, `CLIENT_URL`, `TZ` ;
   - client sur Vercel : *Root directory* = `client`, et la variable `VITE_API_URL` = l'adresse du serveur Render.

## Lancer le projet au quotidien

```bash
# Terminal 1 (à la racine EMS)
npm run server
# Terminal 2 (à la racine EMS)
npm run client
```
Ouvrir http://localhost:5173. Pour arrêter : `Ctrl + C` dans chaque terminal.

## Dépannage

| Message ou symptôme | Cause | Solution |
| --- | --- | --- |
| `'npm' n'est pas reconnu…` | Node.js n'est pas installé, ou VS Code a été ouvert avant l'installation | Installer Node.js, puis fermer et rouvrir VS Code |
| `JWT_SECRET manquant ou trop court` | `.env` absent, mal nommé ou pas dans `server/` | Le fichier doit s'appeler exactement `server/.env`, avec un `JWT_SECRET` d'au moins 16 caractères |
| `password authentication failed for user …` | Mauvais mot de passe dans `DATABASE_URL` | Corriger `.env` ; tester la même connexion dans pgAdmin |
| `database "ems" does not exist` | Base non créée, ou nom différent | Créer la base `ems` (document 5) |
| `connect ECONNREFUSED 127.0.0.1:5432` | Le service PostgreSQL est arrêté, ou le port est différent | Windows : `services.msc` → *postgresql-x64-18* → Démarrer. Vérifier le port dans pgAdmin |
| `permission denied for schema public` | La base n'appartient pas à `ems_user` | `ALTER DATABASE ems OWNER TO ems_user;` puis `ALTER SCHEMA public OWNER TO ems_user;` (exécuté dans la base `ems`) |
| `EADDRINUSE: address already in use :::5002` | Un serveur tourne déjà | Fermer l'autre terminal, ou changer `PORT` dans `.env` |
| Page « Serveur injoignable » | Le terminal du serveur a été fermé ou a planté | Relancer `npm run server` et lire l'erreur affichée |
| Connexion refusée avec les comptes de démo | Données de démo non chargées | `npm run seed` |
| Le pointage « tourne » longtemps | Le navigateur attend l'autorisation de géolocalisation | Répondre à la demande, ou attendre 10 s : le pointage se fait alors sans GPS |
| Les changements de code ne s'affichent pas | Cache du navigateur, ou serveur lancé avec `npm start` | `Ctrl + Shift + R`, et utiliser `npm run server` (nodemon) |

**Réflexes de débogage**
1. **Lire le terminal du serveur** : la vraie cause de l'erreur y est écrite.
2. **Ouvrir la console du navigateur** (F12 → *Console*, puis onglet *Network*) : cliquer sur la requête en rouge et regarder *Response*.
3. **Rejouer la requête dans Thunder Client** : si elle marche là, le problème vient de React ; sinon, il vient du serveur.
4. **Tester la requête SQL directement dans pgAdmin** (*Query Tool*).
5. **Changer une seule chose à la fois**, puis retester.

---
Projet SIGRH (EMS) — documentation.
