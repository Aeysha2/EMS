# Document 3 — Guide d’installation et de réalisation

Ce guide explique :
- **Partie A** : comment installer et lancer le SIGRH sur votre poste (Windows, macOS ou Linux) ;
- **Partie B** : dans quel ordre refaire le projet vous-même, depuis un dossier vide.

---

## Partie A — Installer et lancer

### A.1 Logiciels nécessaires

| Logiciel | Rôle | Vérifier |
|---|---|---|
| Node.js 20 ou plus (22 conseillé) | Exécute l’API et outille le frontend | `node -v` |
| PostgreSQL 14 ou plus + pgAdmin 4 | Base de données | pgAdmin s’ouvre et se connecte |
| Git | Récupérer le code | `git --version` |
| VS Code | Éditeur | — |

### A.2 Récupérer le code

```bash
git clone https://github.com/Aeysha2/EMS.git
cd EMS
git checkout sigrh-senegal      # la branche du SIGRH national
npm run install-all             # installe les dépendances de server/ et client/
```

### A.3 Créer la base dans pgAdmin

1. Ouvrez pgAdmin et dépliez **Servers → PostgreSQL**.
2. *(Conseillé)* Clic droit sur **Login/Group Roles → Create → Login/Group Role** : nom `sigrh_user` ; onglet *Definition* : mot de passe `sigrh2026` ; onglet *Privileges* : cochez **Can login?**.
3. Clic droit sur **Databases → Create → Database** : nom `sigrh`, propriétaire `sigrh_user`.
4. Pour les tests, créez de la même façon une base `sigrh_test`.

Vous n’avez **pas** besoin de créer les tables : l’API applique `server/db/schema.sql` à chaque démarrage (le script est idempotent).

### A.4 Configurer l’API

```bash
cp server/.env.example server/.env        # Windows : copy server\.env.example server\.env
```

Modifiez au minimum dans `server/.env` :

```ini
DATABASE_URL=postgresql://sigrh_user:sigrh2026@localhost:5432/sigrh
JWT_SECRET=une_longue_chaine_aleatoire_de_plus_de_32_caracteres
MFA_REQUIRED=false          # pour une démonstration ; true en production
```

> Si votre utilisateur `postgres` n’a pas de mot de passe, écrivez `postgresql://postgres@localhost:5432/sigrh`.

### A.5 Charger les données de démonstration

```bash
npm run seed
```

La commande **vide toutes les tables**, puis crée 24 structures, 11 corps, 70 agents, 11 circuits, des demandes, congés, pointages, formations,
évaluations, imports de la Solde et 3 clés d’API. Elle affiche à la fin la liste des comptes (mot de passe commun `Sigrh@2026!`).

### A.6 Lancer

Dans deux terminaux :

```bash
npm run server      # API sur http://localhost:5002 (redémarre à chaque modification grâce à nodemon)
npm run client      # interface sur http://localhost:5173
```

Vérifiez l’API : http://localhost:5002/api/health doit répondre `{"status":"online","database":"ok",…}`.

### A.7 Parcours de démonstration conseillé

1. **Agent** (`agent@sigrh.test`) : Mon dossier → Absences → *Demander un congé* → Demandes : la demande est à l’étape « Avis du supérieur ».
2. **Chef de structure** (`chef.dgc@sigrh.test`) : Demandes → *À traiter* → ouvrir la demande → *Valider*.
3. **DRH** (`drh.mfp@sigrh.test`) : valide l’étape suivante ; le solde de congés de l’agent est débité. Ouvrez un dossier agent → *Initier un acte* (avancement).
4. **DGFP** (`dgfp@sigrh.test`) : vise l’avancement ; le grade de l’agent est mis à jour et l’acte apparaît dans l’onglet Carrière.
5. **Pilotage** (`pilotage.presidence@sigrh.test`) : Tableaux de bord RH → export Excel ou note PDF. Rémunération → contrôle de cohérence de la Solde.
6. **DSI** (`admin.dsi@sigrh.test`) : Habilitations et audit → *Vérifier la chaîne* ; Interopérabilité → créer une clé.

### A.8 Tester la double authentification

1. Mettez `MFA_REQUIRED=true` dans `server/.env` et redémarrez l’API.
2. Connectez-vous avec un profil DRH : l’application impose l’écran **Activer la double authentification**.
3. Scannez le QR code avec Google Authenticator (ou Microsoft Authenticator, FreeOTP), saisissez le code à 6 chiffres.
4. Aux connexions suivantes, le code est demandé après le mot de passe.
5. Téléphone perdu : le DSI réinitialise la 2FA du compte (Habilitations → Modifier).

### A.9 Lancer les tests

```bash
cd server
# macOS/Linux
TEST_DATABASE_URL=postgresql://sigrh_user:sigrh2026@localhost:5432/sigrh_test npm test
# Windows PowerShell
$env:TEST_DATABASE_URL="postgresql://sigrh_user:sigrh2026@localhost:5432/sigrh_test"; npm test
```

Résultat attendu : `# tests 30`, `# pass 30`, `# fail 0`.

### A.10 Problèmes fréquents

| Message | Cause | Solution |
|---|---|---|
| `password authentication failed` | Mauvais mot de passe dans `DATABASE_URL` | Corriger le `.env` (le mot de passe de pgAdmin n’est pas forcément celui de l’utilisateur SQL) |
| `database "sigrh" does not exist` | Base non créée | Étape A.3 |
| `JWT_SECRET manquant ou trop court` | `.env` absent ou secret de moins de 16 caractères | Étape A.4 |
| `EADDRINUSE :5002` | Une autre API tourne déjà | Fermer l’autre terminal ou changer `PORT` |
| Écran « Activer la double authentification » bloquant | `MFA_REQUIRED=true` | Activer la 2FA ou passer `MFA_REQUIRED=false` en démonstration |
| `Trop de tentatives échouées` | 20 échecs de connexion en 15 minutes | Attendre ou augmenter `AUTH_RATE_LIMIT` en développement |

---

## Partie B — Refaire le projet soi-même, étape par étape

Suivez cet ordre : chaque étape s’appuie sur la précédente. Le **document 4** explique le code de chaque étape, le **document 7** le rôle de chaque fichier.

### Étape 1 — Squelette
```bash
mkdir EMS && cd EMS && git init
mkdir server client docs
cd server && npm init -y
npm install express pg bcryptjs jsonwebtoken cors helmet express-rate-limit dotenv pdfkit qrcode exceljs
npm install -D nodemon
```
Dans `server/package.json`, ajoutez `"type": "module"` et les scripts `start`, `dev`, `seed`, `test`.

### Étape 2 — Base de données
Écrivez `server/db/schema.sql` (document 5) dans cet ordre, car les clés étrangères imposent que la table cible existe :
structures → corps → employees → positions, diplômes, affectations, career_events, record_changes → users → workflow_types, workflow_steps,
requests, request_history → leave_types, leave_balances, leaves, attendance → trainings, sessions, enrollments → performance_reviews →
payrolls, solde_imports, solde_lines → api_clients, interop_logs → import_batches, import_rows → documents, notifications, announcements → activity_logs (+ déclencheur).

Puis `config/db.js` (pool de connexions, `query`, `withTransaction`) et `utils/migrate.js` (exécute le schéma au démarrage).

### Étape 3 — Utilitaires transverses
`utils/AppError.js` (erreurs HTTP), `utils/dates.js`, `utils/sanitize.js`, `utils/crypto.js` (chiffrement, TOTP),
`utils/audit.js` (journal chaîné), `utils/notify.js`, `utils/csv.js`.

### Étape 4 — Authentification et habilitations
`middleware/auth.js` : lecture du JWT, rechargement de l’utilisateur à chaque requête, calcul de son institution et des structures qu’il dirige,
obligation de 2FA, fonction `accessLevel`. Puis `controllers/authController.js` et `routes/authRoutes.js`. Testez la connexion avec Postman (document 8).

### Étape 5 — Référentiels
`models/Structure.js` (sous-arbre récursif), `controllers/structureController.js` ; `models/Employee.js`, `controllers/employeeController.js`.

### Étape 6 — Moteur de circuits
`models/Workflow.js` : c’est le cœur du SIGRH (qui doit valider, action, passage à l’étape suivante, effet final). Puis `workflowController.js` et `utils/alerts.js`.

### Étape 7 — Modules métier
Absences et présences (`leaveController`, `attendanceController`), formation, évaluation, Solde, pilotage, interopérabilité, reprise, administration.

### Étape 8 — Données de démonstration et tests
`utils/seed.js`, puis `tests/sigrh.test.js`. Lancez les tests après chaque modification importante.

### Étape 9 — Frontend
```bash
cd ../client
npm create vite@latest . -- --template react
npm install react-router-dom lucide-react
```
Dans l’ordre : `services/api.js` → `context/` (auth, thème, toasts) → `components/ui.jsx` → `components/Layout.jsx` → `App.jsx` (routes) → `pages/Login.jsx` → les autres pages, module par module.
Dans `vite.config.js`, déclarez le proxy `'/api': 'http://localhost:5002'`.

### Étape 10 — Qualité et publication
`.github/workflows/ci.yml` (tests et build à chaque push), README, documentation, puis `git add`, `git commit`, `git push`.
