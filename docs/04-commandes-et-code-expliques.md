# 4. Commandes et code expliqués ligne par ligne

Ce document explique d'abord **toutes les commandes** du terminal, puis **chaque fichier important** du serveur et du client. Les extraits de code sont copiés tels quels depuis le projet. Les fichiers courts sont expliqués ligne par ligne ; les fichiers longs, par blocs, car ils répètent les mêmes mécanismes.

> **Conseil pour apprendre** : ouvrez le fichier dans VS Code à côté de ce document et suivez les numéros de ligne.

## 4.1 Les commandes du terminal

### Vérifier les outils
| Commande | Où la taper | Ce qu'elle fait |
| --- | --- | --- |
| `node -v` / `npm -v` | Partout | Affiche la version de Node.js et de npm |
| `git --version` | Partout | Vérifie que Git est installé |
| `psql --version` | Partout | Vérifie que PostgreSQL est installé (si `psql` est dans le PATH) |

### Créer le projet
| Commande | Où | Ce qu'elle fait |
| --- | --- | --- |
| `mkdir EMS` | Dossier de vos projets | Crée le dossier du projet |
| `cd EMS` | — | Entre dans le dossier (`cd ..` pour remonter d'un niveau) |
| `git init` | `EMS/` | Transforme le dossier en dépôt Git |
| `mkdir server client docs` | `EMS/` | Crée les trois sous-dossiers |
| `npm init -y` | `server/` | Crée un `package.json` avec les réglages par défaut (`-y` = « oui » à toutes les questions) |
| `npm install express pg bcryptjs jsonwebtoken cors dotenv helmet express-rate-limit pdfkit` | `server/` | Télécharge ces bibliothèques dans `node_modules/` et les inscrit dans `package.json` |
| `npm install -D nodemon` | `server/` | Installe nodemon comme outil de développement (`-D`) : il redémarre le serveur à chaque sauvegarde |
| `npm create vite@latest client -- --template react` | `EMS/` | Crée un projet React avec Vite dans le dossier `client` |
| `npm install react-router-dom lucide-react` | `client/` | Ajoute la navigation entre pages et les icônes |

### Utiliser le projet
| Commande | Où | Ce qu'elle fait |
| --- | --- | --- |
| `npm install` | `server/` ou `client/` | Installe toutes les dépendances listées dans `package.json` (à faire après un `git clone`) |
| `npm run install-all` | `EMS/` | Fait `npm install` dans `server/` puis dans `client/` |
| `npm run seed` | `EMS/` ou `server/` | **Vide** toutes les tables, puis charge les données de démonstration |
| `npm run migrate` | `server/` | Crée ou met à jour les tables à partir de `db/schema.sql`, sans effacer les données |
| `npm run server` | `EMS/` | Lance le serveur avec nodemon (= `npm run dev` dans `server/`) sur http://localhost:5002 |
| `npm start` | `server/` | Lance `node server.js`, sans redémarrage automatique (utilisé en production) |
| `npm run client` | `EMS/` | Lance Vite (= `npm run dev` dans `client/`) sur http://localhost:5173 |
| `npm run build` | `EMS/` ou `client/` | Fabrique la version finale optimisée du site dans `client/dist/` |
| `npm run preview` | `client/` | Affiche localement la version construite par `build` |
| `npm test` | `server/` | Lance les 33 tests d'intégration (nécessite `TEST_DATABASE_URL`) |
| `Ctrl + C` | Terminal qui tourne | Arrête le serveur ou Vite |

### Git
| Commande | Ce qu'elle fait |
| --- | --- |
| `git status` | Montre les fichiers modifiés |
| `git add .` | Prépare tous les fichiers modifiés pour le prochain commit |
| `git commit -m "message"` | Enregistre une version avec un message |
| `git remote add origin https://github.com/<compte>/EMS.git` | Relie le dossier au dépôt GitHub (une seule fois) |
| `git push -u origin main` | Envoie les commits sur GitHub (ensuite, `git push` suffit) |
| `git pull` | Récupère les derniers commits de GitHub |
| `git clone https://github.com/<compte>/EMS.git` | Télécharge le dépôt sur un autre ordinateur |
| `git checkout -b nouvelle-branche` | Crée une branche et s'y place |
| `git log --oneline` | Affiche l'historique des commits |

### Variables d'environnement dans le terminal
| Système | Commande | Effet |
| --- | --- | --- |
| Windows PowerShell | `$env:TEST_DATABASE_URL="postgresql://..."` | Définit une variable pour ce terminal |
| Windows CMD | `set TEST_DATABASE_URL=postgresql://...` | Idem |
| Mac / Linux | `TEST_DATABASE_URL=postgresql://... npm test` | Définit la variable pour cette commande seulement |

## 4.2 `package.json` (racine)

*`package.json`, lignes 1 à 14 :*

```json
{
  "name": "ems",
  "version": "1.0.0",
  "private": true,
  "description": "SIGRH – Employee Management System for the Ministry of Civil Service (React + Express + PostgreSQL)",
  "scripts": {
    "install-all": "npm --prefix server install && npm --prefix client install",
    "server": "npm --prefix server run dev",
    "client": "npm --prefix client run dev",
    "seed": "npm --prefix server run seed",
    "test": "npm --prefix server test",
    "build": "npm --prefix client run build"
  }
}
```

- Ce fichier ne contient **pas de dépendances** : il sert seulement de télécommande.
- `npm --prefix server run dev` signifie « lance le script `dev` du `package.json` qui se trouve dans `server/` ». Cela évite de faire `cd server` à chaque fois.
- `private: true` empêche de publier ce paquet par erreur sur npm.

## 4.3 `server/package.json`

*`server/package.json`, lignes 1 à 31 :*

```json
{
  "name": "ems-server",
  "version": "1.0.0",
  "description": "Employee Management System API (Express + PostgreSQL)",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "seed": "node utils/seed.js",
    "migrate": "node utils/runMigrate.js",
    "test": "node --test --test-concurrency=1 tests/*.test.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "bcryptjs": "^3.0.3",
    "cors": "^2.8.6",
    "dotenv": "^18.0.3",
    "express": "^5.2.1",
    "express-rate-limit": "^8.7.0",
    "helmet": "^8.3.0",
    "jsonwebtoken": "^9.0.3",
    "pdfkit": "^0.20.2",
    "pg": "^8.23.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.14"
  },
  "type": "module"
}
```

- `name`, `version`, `description` : l'identité du projet.
- `main` : le fichier de départ.
- `scripts` : des raccourcis. `npm run seed` exécute `node utils/seed.js`.
  - `test` : `node --test` est le lanceur de tests intégré à Node ; `--test-concurrency=1` lance les fichiers de test l'un après l'autre, car ils partagent la même base.
- `dependencies` : bibliothèques nécessaires pour faire tourner l'application.
  - `express` : le serveur web ; `pg` : le pilote PostgreSQL ; `bcryptjs` : le hachage des mots de passe ; `jsonwebtoken` : les jetons de connexion ;
  - `cors` : autorise le site React à appeler l'API ; `dotenv` : lit le fichier `.env` ; `helmet` : en-têtes de sécurité ;
  - `express-rate-limit` : limite les tentatives de connexion ; `pdfkit` : fabrique les PDF.
- `devDependencies` : outils utiles seulement pendant le développement (nodemon).
- `"type": "module"` : autorise la syntaxe `import ... from`. Sans cette ligne, il faudrait écrire `require()`.

## 4.4 `server/.env` et `server/.env.example`

*`server/.env.example`, lignes 1 à 23 :*

```bash
PORT=5002
NODE_ENV=development
# PostgreSQL (local, Render, Railway, Neon, Supabase…)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ems
DB_SSL=false
# At least 32 random characters in production
JWT_SECRET=change_me_to_a_long_random_secret_value
JWT_EXPIRES_IN=8h
# Comma-separated list of allowed front-end origins
CLIENT_URL=http://localhost:5173
# Server timezone used for attendance dates
TZ=Africa/Dakar
ORG_NAME=Ministère de la Fonction Publique
CURRENCY=FCFA
# Working hours
WORK_START=08:00
LATE_GRACE_MINUTES=15
WORK_HOURS_PER_DAY=8
# Payroll rules (optional overrides)
PAY_HOUSING_RATE=0.15
PAY_TRANSPORT=25000
PAY_SOCIAL_RATE=0.056
PAY_OVERTIME_MULT=1.25
```

- `.env` contient les **vraies** valeurs secrètes. Il n'est **jamais** envoyé sur GitHub (il est listé dans `.gitignore`).
- `.env.example` est une copie **sans secrets**, envoyée sur GitHub pour montrer quelles variables remplir.
- `PORT` : le port d'écoute du serveur.
- `DATABASE_URL` : l'adresse de la base, au format `postgresql://utilisateur:motdepasse@hôte:port/nom_de_la_base`.
- `DB_SSL` : `true` chez les hébergeurs en ligne, qui exigent une connexion chiffrée.
- `JWT_SECRET` : la clé qui signe les jetons. Si elle change, tous les utilisateurs sont déconnectés.
- `JWT_EXPIRES_IN` : durée de validité d'une connexion (`8h`).
- `CLIENT_URL` : l'adresse du site React, seule autorisée par CORS. On peut en mettre plusieurs, séparées par des virgules.
- `TZ` : le fuseau horaire, qui détermine la « date du jour » d'un pointage.
- `ORG_NAME`, `CURRENCY` : le texte affiché sur les PDF.
- `WORK_START`, `LATE_GRACE_MINUTES`, `WORK_HOURS_PER_DAY` : les règles de retard et d'heures supplémentaires.
- `PAY_*` : les taux de paie (voir 4.18).

## 4.5 `server/server.js` — le point d'entrée

*`server/server.js`, lignes 1 à 66 :*

```js
import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pool } from './config/db.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { sanitizeBody } from './middleware/sanitize.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import authRoutes from './routes/authRoutes.js';
import departmentRoutes from './routes/departmentRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import leaveRoutes from './routes/leaveRoutes.js';
import miscRoutes from './routes/miscRoutes.js';
import payrollRoutes from './routes/payrollRoutes.js';
import performanceRoutes from './routes/performanceRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import { migrate } from './utils/migrate.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('❌ JWT_SECRET manquant ou trop court (16 caractères minimum)');
  process.exit(1);
}

export const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim()),
  exposedHeaders: ['Content-Disposition'],
}));
app.use(express.json({ limit: '5mb' }));
app.use(sanitizeBody);

app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'online', database: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', miscRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5002;

if (process.env.NODE_ENV !== 'test') {
  migrate()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`🚀 EMS API démarrée sur http://localhost:${PORT}`);
        console.log(`📋 Santé : http://localhost:${PORT}/api/health`);
      });
    })
    .catch((err) => {
      console.error('❌ Impossible d’initialiser la base de données :', err.message);
      process.exit(1);
    });
}
```

Ligne par ligne :
- `import 'dotenv/config'` : **en tout premier**, charge le fichier `.env` dans `process.env`. Si cette ligne venait plus bas, les autres fichiers liraient des variables vides.
- Les `import ... Routes` : chaque fichier de routes regroupe les adresses d'un module.
- `if (!process.env.JWT_SECRET || ...)` : le serveur **refuse de démarrer** sans secret, car des jetons signés avec une clé vide seraient falsifiables. `process.exit(1)` arrête le programme avec un code d'erreur.
- `export const app = express()` : crée l'application. Elle est exportée pour que les tests puissent la démarrer.
- `app.set('trust proxy', 1)` : chez un hébergeur, l'adresse IP réelle du visiteur est transmise par un proxy ; sans cette ligne, la limitation de débit bloquerait tout le monde à la fois.
- `app.use(...)` : ajoute un **middleware**, c'est-à-dire une fonction exécutée pour chaque requête, dans l'ordre :
  1. `helmet()` : ajoute des en-têtes HTTP de sécurité ;
  2. `cors(...)` : autorise seulement les adresses de `CLIENT_URL`. `exposedHeaders: ['Content-Disposition']` permet au navigateur de lire le nom des PDF téléchargés ;
  3. `express.json({ limit: '5mb' })` : transforme le corps JSON des requêtes en objet `req.body` (5 Mo maximum, pour les pièces jointes) ;
  4. `sanitizeBody` : nettoie `req.body` (4.9).
- `app.get('/api/health', ...)` : une route de test. `SELECT 1` vérifie que la base répond.
- `app.use('/api/employees', employeeRoutes)` : toutes les adresses commençant par `/api/employees` sont confiées au fichier `employeeRoutes.js`.
- `app.use(notFound)` : si aucune route n'a répondu, renvoie une erreur 404.
- `app.use(errorHandler)` : **toujours en dernier**, il attrape toutes les erreurs.
- `if (process.env.NODE_ENV !== 'test')` : pendant les tests, on ne démarre pas le serveur ici (les tests le font eux-mêmes).
- `migrate().then(() => app.listen(PORT, ...))` : crée d'abord les tables manquantes, puis démarre l'écoute. Si la base est injoignable, le message d'erreur s'affiche et le programme s'arrête.

## 4.6 `server/config/db.js` — la connexion à PostgreSQL

*`server/config/db.js`, lignes 1 à 34 :*

```js
import pg from 'pg';

// Return DATE columns as plain 'YYYY-MM-DD' strings (avoids timezone shifts)
pg.types.setTypeParser(1082, (v) => v);
// Return NUMERIC as JS numbers (amounts stay well within double precision)
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// COUNT(*) returns bigint
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

const useSSL = process.env.DB_SSL === 'true';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DB_POOL_MAX || 10),
});

export const query = (text, params) => pool.query(text, params);

/** Run `fn(client)` inside a transaction. */
export const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
```

- `import pg from 'pg'` : le pilote officiel de PostgreSQL pour Node.
- `pg.types.setTypeParser(...)` : dit à `pg` comment convertir certains types SQL en JavaScript :
  - `1082` = `DATE` : garder `'2026-09-23'` en texte. Sinon, `pg` crée un objet `Date` à minuit **heure locale**, et la date peut reculer d'un jour selon le fuseau ;
  - `1700` = `NUMERIC` (salaires, heures) : convertir en nombre ; par défaut, `pg` renvoie du texte ;
  - `20` = `BIGINT` (résultat de `COUNT(*)`) : convertir en nombre entier.
- `new pg.Pool({...})` : un **pool** garde plusieurs connexions ouvertes (10 au maximum) et les prête aux requêtes. C'est beaucoup plus rapide que d'ouvrir une connexion à chaque requête.
- `ssl: useSSL ? { rejectUnauthorized: false } : undefined` : active le chiffrement si `DB_SSL=true`.
- `query(text, params)` : raccourci pour exécuter une requête. **Les valeurs passent toujours par `params`** (`$1`, `$2`…), jamais collées dans le texte SQL. C'est ce qui empêche les **injections SQL**.
- `withTransaction(fn)` : exécute plusieurs requêtes comme **un seul bloc** :
  - `BEGIN` démarre la transaction ;
  - si tout réussit, `COMMIT` enregistre tout ;
  - si une erreur survient, `ROLLBACK` annule **tout**, comme si rien ne s'était passé ;
  - `finally { client.release() }` rend toujours la connexion au pool.
  - Exemple : lors de l'approbation d'un congé, on débite le solde **et** on change le statut. Si la 2ᵉ requête échoue, la 1ʳᵉ est annulée.

## 4.7 `server/utils/AppError.js`

*`server/utils/AppError.js`, lignes 1 à 10 :*

```js
export default class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const assert = (condition, message, status = 400) => {
  if (!condition) throw new AppError(message, status);
};
```

- `class AppError extends Error` : une erreur « normale » à laquelle on ajoute un `status` HTTP.
- `assert(condition, message, status)` : si la condition est fausse, lance une erreur 400 (par défaut). Cela remplace des dizaines de `if (...) return res.status(400).json(...)`.
- Exemple : `assert(email, "L'email est requis")`.

## 4.8 `server/middleware/errorHandler.js`

*`server/middleware/errorHandler.js`, lignes 1 à 33 :*

```js
export const notFound = (req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} introuvable` });
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  // PostgreSQL error codes → HTTP
  const pgMap = {
    23505: [409, 'Cet enregistrement existe déjà (doublon)'],
    23503: [400, 'Référence invalide (élément lié introuvable)'],
    23514: [400, 'Valeur non autorisée'],
    '22P02': [400, 'Format de donnée invalide'],
    22007: [400, 'Date invalide'],
    22008: [400, 'Date invalide'],
  };
  if (err.code && pgMap[err.code]) {
    const [status, message] = pgMap[err.code];
    return res.status(status).json({ message, detail: err.detail });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Fichier ou requête trop volumineux' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'JSON invalide' });
  }

  const status = err.status || 500;
  if (status >= 500) console.error('Unhandled server error:', err);
  res.status(status).json({
    message: status >= 500 ? 'Erreur interne du serveur' : err.message,
    error: process.env.NODE_ENV === 'development' && status >= 500 ? err.message : undefined,
  });
};
```

- `notFound` : réponse 404 pour une adresse inconnue.
- `errorHandler(err, req, res, next)` : Express reconnaît un gestionnaire d'erreurs à ses **4 paramètres**. Avec Express 5, une erreur lancée dans une fonction `async` arrive ici automatiquement.
- `pgMap` : traduit les codes d'erreur de PostgreSQL en messages clairs :
  - `23505` : violation d'unicité (email déjà utilisé, deuxième pointage le même jour…) → **409** ;
  - `23503` : clé étrangère invalide (département inexistant…) → 400 ;
  - `23514` : contrainte `CHECK` non respectée (statut inconnu…) → 400 ;
  - `22P02`, `22007`, `22008` : format de donnée ou date invalide → 400.
- `entity.too.large` : le corps de la requête dépasse 5 Mo → 413.
- Pour les erreurs 500 (bugs), on écrit le détail dans le terminal, mais on n'envoie au navigateur qu'un message général : on ne révèle jamais le fonctionnement interne à un visiteur.

## 4.9 `server/middleware/sanitize.js`

*`server/middleware/sanitize.js`, lignes 1 à 18 :*

```js
/** Strip prototype-pollution keys from JSON bodies. SQL injection is prevented by parameterised queries. */
const clean = (value, key = '') => {
  if (Array.isArray(value)) return value.map((v) => clean(v, key));
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') delete value[k];
      else value[k] = clean(value[k], k);
    }
  }
  // Passwords are kept verbatim
  if (typeof value === 'string') return /password/i.test(key) ? value : value.trim();
  return value;
};

export const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') req.body = clean(req.body);
  next();
};
```

- `clean` parcourt tout le corps de la requête, y compris les objets imbriqués et les tableaux (fonction **récursive**).
- Supprime les clés `__proto__`, `constructor` et `prototype`, qui permettraient une attaque appelée « pollution de prototype ».
- Supprime les espaces au début et à la fin des textes (`trim`), **sauf** pour les mots de passe, qui sont gardés tels quels.

## 4.10 `server/middleware/auth.js` — jeton et rôles

*`server/middleware/auth.js`, lignes 1 à 46 :*

```js
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import AppError from '../utils/AppError.js';

export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

/** Verify JWT and load the current user (role is always read from the DB). */
export const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError('Authentification requise', 401);

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new AppError('Session invalide ou expirée', 401);
  }

  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.employee_id, u.is_active,
            (SELECT COALESCE(array_agg(d.id), '{}') FROM departments d
              WHERE d.manager_id = u.employee_id AND u.employee_id IS NOT NULL) AS managed_departments
       FROM users u WHERE u.id = $1`,
    [payload.id]
  );
  const user = rows[0];
  if (!user || !user.is_active) throw new AppError('Compte introuvable ou désactivé', 401);

  req.user = user;
  req.user.isManager = user.managed_departments.length > 0;
  next();
};

/** Restrict a route to the given roles. */
export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    throw new AppError('Accès refusé : droits insuffisants', 403);
  }
  next();
};

export const isHRorAdmin = (user) => user.role === 'admin' || user.role === 'hr';
```

- `signToken(user)` : crée un **JWT** contenant l'`id` et le `role`, signé avec `JWT_SECRET`, et valable 8 h. Le jeton ressemble à `eyJhbGciOi...` : trois parties séparées par des points (en-tête, contenu, signature).
- `protect` :
  1. lit l'en-tête `Authorization: Bearer <jeton>` ;
  2. `jwt.verify` vérifie la signature et la date d'expiration. Si quelqu'un modifie le jeton (par exemple pour mettre `role: admin`), la signature ne correspond plus → 401 ;
  3. relit l'utilisateur **dans la base**. Ainsi, un compte désactivé ou dont le rôle a changé perd ses droits immédiatement, même avec un ancien jeton ;
  4. la sous-requête `array_agg(d.id)` récupère la liste des départements dont l'agent est responsable ;
  5. `req.user = user` : les contrôleurs sauront qui fait la demande ;
  6. `req.user.isManager` : vrai si l'agent dirige au moins un département ;
  7. `next()` : passe à la suite.
- `authorize(...roles)` : une fonction qui **fabrique** un middleware. `authorize('admin', 'hr')` refuse (403) tous les autres rôles.
- `isHRorAdmin(user)` : petite fonction utilisée partout dans les contrôleurs.

**Différence 401 / 403** : 401 = « je ne sais pas qui vous êtes » (pas de jeton ou jeton invalide) ; 403 = « je sais qui vous êtes, mais vous n'avez pas le droit ».

## 4.11 Les modèles (`server/models/`)

Avec PostgreSQL, les tables sont définies dans `schema.sql` (document 5). Les fichiers de `models/` regroupent les **requêtes SQL réutilisées** par plusieurs contrôleurs.

*`server/models/Employee.js`, lignes 1 à 41 :*

```js
import { query } from '../config/db.js';

/** Full employee row (sensitive fields included) joined with department. */
export const EMPLOYEE_SELECT = `
  SELECT e.*, d.name AS department_name,
         u.id AS user_id, u.role AS user_role
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN users u ON u.employee_id = e.id`;

/** Fields any authenticated user may see about a colleague (directory view). */
export const PUBLIC_FIELDS = [
  'id', 'employee_code', 'full_name', 'email', 'department_id', 'department_name',
  'designation', 'grade', 'status',
];

export const toPublic = (emp) => Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, emp[k]]));

export const findEmployeeById = async (id, db = { query }) => {
  const { rows } = await db.query(`${EMPLOYEE_SELECT} WHERE e.id = $1`, [id]);
  return rows[0] || null;
};

/** Generate the next EMPxxx code. */
export const nextEmployeeCode = async (db = { query }) => {
  const { rows } = await db.query(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(employee_code, '\\D', '', 'g'), '')::int), 100) + 1 AS n
       FROM employees`
  );
  return `EMP${rows[0].n}`;
};

/** Reset annual leave balances when the calendar year changed. */
export const refreshLeaveBalances = async (db = { query }) => {
  await db.query(
    `UPDATE employees
        SET casual_balance = 12, sick_balance = 10, paid_balance = 24,
            balance_year = EXTRACT(YEAR FROM CURRENT_DATE)
      WHERE balance_year < EXTRACT(YEAR FROM CURRENT_DATE)`
  );
};
```

- `EMPLOYEE_SELECT` : une requête avec deux `LEFT JOIN`, pour obtenir en une fois l'employé, le nom de son département et son compte utilisateur. `LEFT JOIN` garde l'employé même s'il n'a ni département ni compte.
- `PUBLIC_FIELDS` et `toPublic` : les seuls champs qu'un agent peut voir sur un collègue (l'annuaire).
- `findEmployeeById` : un employé par son id, ou `null`.
- `nextEmployeeCode` : calcule le prochain identifiant :
  - `regexp_replace(employee_code, '\D', '', 'g')` enlève tout ce qui n'est pas un chiffre (`EMP115` → `115`) ;
  - `MAX(...)` prend le plus grand ; `COALESCE(..., 100)` renvoie 100 si la table est vide ; `+ 1` donne le suivant → `EMP116`.
- `refreshLeaveBalances` : au changement d'année, remet les soldes de congés à 12 / 10 / 24.

*`server/models/Project.js`, lignes 1 à 35 :*

```js
import { query } from '../config/db.js';

export const PROJECT_SELECT = `
  SELECT p.*,
         rt.name AS request_type_name, rt.code AS request_type_code, rt.sla_days,
         dt.name AS deposit_type_name,
         a.full_name AS agent_name, a.employee_code AS agent_code,
         d.name AS department_name,
         cu.name AS created_by_name,
         (p.status IN ('in_progress','awaiting_documents') AND p.due_date < CURRENT_DATE) AS is_overdue
    FROM projects p
    JOIN request_types rt ON rt.id = p.request_type_id
    JOIN deposit_types dt ON dt.id = p.deposit_type_id
    LEFT JOIN employees a ON a.id = p.agent_id
    LEFT JOIN departments d ON d.id = p.department_id
    LEFT JOIN users cu ON cu.id = p.created_by`;

/** Circuit for a request type: its own steps if defined, otherwise the default circuit. */
export const getCircuit = async (requestTypeId, db = { query }) => {
  const { rows } = await db.query(
    `SELECT cs.*, d.name AS department_name FROM circuit_steps cs
       LEFT JOIN departments d ON d.id = cs.department_id
      WHERE cs.request_type_id IS NOT DISTINCT FROM (
              CASE WHEN EXISTS (SELECT 1 FROM circuit_steps WHERE request_type_id = $1) THEN $1::int END)
      ORDER BY cs.step_order`,
    [requestTypeId]
  );
  return rows;
};

export const nextReference = async (db = { query }) => {
  const { rows } = await db.query(`SELECT nextval('project_reference_seq') AS n`);
  const year = new Date().getFullYear();
  return `MFP-${year}-${String(rows[0].n).padStart(5, '0')}`;
};
```

- `PROJECT_SELECT` : le dossier, avec les noms du type de demande, du type de dépôt, de l'agent traitant, du service et de la personne qui l'a enregistré.
- `is_overdue` : colonne calculée : vrai si le dossier est encore ouvert et que son échéance est dépassée.
- `getCircuit(requestTypeId)` : renvoie les étapes du circuit. Si le type de demande a son propre circuit, on le prend ; sinon, on prend le circuit par défaut (`request_type_id IS NULL`). `IS NOT DISTINCT FROM` est une comparaison qui fonctionne aussi avec `NULL` (alors que `NULL = NULL` n'est jamais vrai en SQL).
- `nextReference` : `nextval('project_reference_seq')` donne le numéro suivant d'un compteur PostgreSQL, sans risque de doublon même si deux agents enregistrent un dossier au même instant. `padStart(5, '0')` transforme `12` en `00012` → `MFP-2026-00012`.

## 4.12 `server/controllers/authController.js`

*`server/controllers/authController.js`, lignes 1 à 33 :*

```js
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../config/db.js';
import { signToken } from '../middleware/auth.js';
import { findUserByEmail, USER_PUBLIC } from '../models/User.js';
import { findEmployeeById, nextEmployeeCode } from '../models/Employee.js';
import AppError, { assert } from '../utils/AppError.js';
import { logActivity } from '../utils/audit.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validatePassword = (pw) => {
  assert(typeof pw === 'string' && pw.length >= 8, 'Le mot de passe doit contenir au moins 8 caractères');
  assert(/[A-Za-z]/.test(pw) && /\d/.test(pw), 'Le mot de passe doit contenir des lettres et des chiffres');
};

const buildSession = async (user) => {
  const employee = user.employee_id ? await findEmployeeById(user.employee_id) : null;
  const { rows } = await query(
    'SELECT id, name FROM departments WHERE manager_id = $1',
    [user.employee_id ?? -1]
  );
  return {
    token: signToken(user),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      employee_id: user.employee_id,
      employee,
      managedDepartments: rows,
    },
  };
};
```

- `EMAIL_RE` : une expression régulière qui vérifie la forme `texte@texte.texte`.
- `validatePassword` : au moins 8 caractères, au moins une lettre (`[A-Za-z]`) et un chiffre (`\d`).
- `buildSession` : prépare la réponse envoyée après connexion ou inscription : le jeton, l'utilisateur, sa fiche employé et la liste des départements qu'il dirige.

*`server/controllers/authController.js`, lignes 35 à 86 :*

```js
/**
 * POST /api/auth/register
 * Public self-registration always creates an "employee" account. If HR already
 * created an employee record with the same email, the account is linked to it.
 * Higher roles are granted by an administrator.
 */
export const register = async (req, res) => {
  const { name, email, password, phone, matricule } = req.body;
  assert(name && name.length >= 2, 'Le nom est requis');
  assert(email && EMAIL_RE.test(email), 'Adresse email invalide');
  validatePassword(password);

  const existing = await findUserByEmail(email);
  if (existing) throw new AppError('Un compte existe déjà avec cet email', 409);

  const hash = await bcrypt.hash(password, 12);
  const user = await withTransaction(async (client) => {
    let { rows } = await client.query(
      'SELECT id, matricule, employee_code FROM employees WHERE lower(email) = lower($1)',
      [email]
    );
    let employeeId = rows[0]?.id;
    if (employeeId) {
      // Claiming an existing HR record requires proving the matricule / employee ID
      const proof = String(matricule || '').toUpperCase();
      const known = [rows[0].matricule, rows[0].employee_code].filter(Boolean).map((v) => v.toUpperCase());
      if (!proof || !known.includes(proof)) {
        throw new AppError(
          'Cet email correspond à un agent déjà enregistré : saisissez votre matricule ou identifiant employé',
          400
        );
      }
    } else {
      const code = await nextEmployeeCode(client);
      ({ rows } = await client.query(
        `INSERT INTO employees (employee_code, full_name, email, phone, designation)
         VALUES ($1,$2,lower($3),$4,'Agent') RETURNING id`,
        [code, name, email, phone || null]
      ));
      employeeId = rows[0].id;
    }
    ({ rows } = await client.query(
      `INSERT INTO users (name, email, password_hash, role, employee_id)
       VALUES ($1, lower($2), $3, 'employee', $4) RETURNING *`,
      [name, email, hash, employeeId]
    ));
    return rows[0];
  });

  await logActivity(user.id, 'Inscription', 'user', user.id, `${user.name} a créé son compte`);
  res.status(201).json(await buildSession(user));
};
```

`register`, étape par étape :
1. On vérifie le nom, l'email et le mot de passe.
2. Si un **compte** existe déjà avec cet email → 409.
3. `bcrypt.hash(password, 12)` : transforme le mot de passe en empreinte irréversible. Le `12` est le « coût » : plus il est élevé, plus il est long de tester des millions de mots de passe. **On ne stocke jamais le mot de passe en clair.**
4. Dans une **transaction** :
   - si une **fiche employé** existe déjà avec cet email (créée par les RH), on exige le matricule ou l'ID employé. Sans cette vérification, n'importe qui pourrait s'inscrire avec l'email d'un collègue et voir son salaire ;
   - sinon, on crée une fiche employé avec un nouvel ID ;
   - on crée le compte avec le rôle **`employee`**, en dur. Même si quelqu'un envoie `"role": "admin"`, c'est ignoré.
5. `logActivity` : trace l'inscription dans le journal d'audit.
6. `res.status(201)` : 201 = « créé ».

*`server/controllers/authController.js`, lignes 88 à 119 :*

```js
/** POST /api/auth/login */
export const login = async (req, res) => {
  const { email, password } = req.body;
  assert(email && password, 'Email et mot de passe requis');

  const user = await findUserByEmail(email);
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) throw new AppError('Email ou mot de passe incorrect', 401);
  if (!user.is_active) throw new AppError('Ce compte est désactivé', 403);

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  res.json(await buildSession(user));
};

/** GET /api/auth/me */
export const me = async (req, res) => {
  const { rows } = await query(`SELECT ${USER_PUBLIC} FROM users WHERE id = $1`, [req.user.id]);
  const session = await buildSession(rows[0]);
  res.json({ user: session.user });
};

/** PUT /api/auth/password */
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  validatePassword(newPassword);
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const ok = await bcrypt.compare(currentPassword || '', rows[0].password_hash);
  if (!ok) throw new AppError('Mot de passe actuel incorrect', 400);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(newPassword, 12), req.user.id]);
  await logActivity(req.user.id, 'Changement de mot de passe', 'user', req.user.id);
  res.json({ message: 'Mot de passe mis à jour' });
};
```

- `login` : on cherche l'utilisateur, puis `bcrypt.compare` compare le mot de passe saisi avec l'empreinte. Le message d'erreur est **le même** que l'email ou le mot de passe soit faux : on ne révèle pas quels emails existent.
- `me` : renvoie l'utilisateur connecté. Le client l'appelle au chargement de la page pour savoir si le jeton enregistré est encore valable.
- `changePassword` : vérifie l'ancien mot de passe avant d'enregistrer le nouveau.

## 4.13 `server/controllers/employeeController.js`

Le contrôle de ce que chacun voit :

*`server/controllers/employeeController.js`, lignes 21 à 46 :*

```js
const canSeeFull = (user, emp) =>
  isHRorAdmin(user) || user.employee_id === emp.id;

const canSeeTeam = (user, emp) => user.managed_departments.includes(emp.department_id);

/** Strip salary / private data depending on who is asking (challenge #9). */
const shape = (user, emp) => {
  if (canSeeFull(user, emp)) return emp;
  if (canSeeTeam(user, emp)) {
    const { salary, address, date_of_birth, ...rest } = emp; // eslint-disable-line no-unused-vars
    return rest;
  }
  return toPublic(emp);
};

const validate = (data) => {
  if (data.email !== undefined) assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email), 'Email invalide');
  if (data.salary !== undefined) assert(Number(data.salary) >= 0, 'Salaire invalide');
  for (const f of ['date_of_joining', 'date_of_birth']) {
    if (data[f]) assert(isValidISODate(data[f]), `Date invalide : ${f}`);
    if (data[f] === '') data[f] = null;
  }
  if (data.department_id === '') data.department_id = null;
  if (data.matricule === '') data.matricule = null;
  if (data.email) data.email = data.email.toLowerCase();
};
```

- `canSeeFull` : les RH, l'administrateur et l'agent lui-même voient tout.
- `canSeeTeam` : le chef de service voit son équipe, **sans** le salaire, l'adresse ni la date de naissance. La syntaxe `const { salary, address, date_of_birth, ...rest } = emp` retire ces trois champs et garde le reste dans `rest`.
- Les autres ne voient que les champs publics.
- `validate` : vérifie l'email, le salaire et les dates. Une chaîne vide venant d'un formulaire est remplacée par `null`.

La recherche avancée :

*`server/controllers/employeeController.js`, lignes 48 à 93 :*

```js
/**
 * GET /api/employees — advanced search (challenge #8)
 * ?q=&department=&status=&designation=&joinedFrom=&joinedTo=&minSalary=&maxSalary=&sort=name&order=asc&page=&limit=
 */
export const listEmployees = async (req, res) => {
  const { q, status, designation, joinedFrom, joinedTo, minSalary, maxSalary } = req.query;
  const { page, limit, offset } = pagination(req.query);
  const hr = isHRorAdmin(req.user);
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };

  if (q) add(`(e.full_name ILIKE ? OR e.employee_code ILIKE ? OR e.email ILIKE ?
              OR e.matricule ILIKE ? OR e.designation ILIKE ? OR d.name ILIKE ?)`, `%${q}%`);
  if (req.query.department) add('e.department_id = ?', toInt(req.query.department));
  if (status) add('e.status = ?', status);
  if (designation) add('e.designation ILIKE ?', `%${designation}%`);
  if (joinedFrom && isValidISODate(joinedFrom)) add('e.date_of_joining >= ?', joinedFrom);
  if (joinedTo && isValidISODate(joinedTo)) add('e.date_of_joining <= ?', joinedTo);
  // Salary filters are only honoured for HR/Admin so salaries cannot be inferred
  if (hr && minSalary) add('e.salary >= ?', Number(minSalary));
  if (hr && maxSalary) add('e.salary <= ?', Number(maxSalary));

  let sortCol = SORTS[req.query.sort] || SORTS.name;
  if (!hr && sortCol === SORTS.salary) sortCol = SORTS.name;
  const order = req.query.order === 'desc' ? 'DESC' : 'ASC';
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [list, count] = await Promise.all([
    query(
      `${EMPLOYEE_SELECT} ${whereSql} ORDER BY ${sortCol} ${order}, e.id LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
    query(`SELECT COUNT(*) FROM employees e LEFT JOIN departments d ON d.id = e.department_id ${whereSql}`, params),
  ]);

  res.json({
    data: list.rows.map((e) => shape(req.user, e)),
    total: count.rows[0].count,
    page,
    limit,
  });
};
```

- `pagination(req.query)` : lit `page` et `limit` (20 par défaut, 100 au maximum) et calcule `offset` : pour la page 3 avec 20 résultats par page, `offset = 40`.
- `where` et `params` : on construit la clause `WHERE` morceau par morceau. La petite fonction `add` ajoute la valeur dans `params` et remplace `?` par `$1`, `$2`… Les valeurs ne sont **jamais** collées dans le SQL.
- `ILIKE` : comme `LIKE`, mais sans tenir compte des majuscules. `%texte%` = « contient texte ».
- Les filtres de salaire ne sont pris en compte que pour les RH : sinon, un agent pourrait deviner un salaire en filtrant « entre 500 000 et 501 000 ».
- `SORTS` : une **liste blanche** des colonnes de tri. On ne met jamais directement `req.query.sort` dans le SQL.
- `Promise.all([...])` : lance en même temps la requête de la liste et celle du total, pour aller plus vite.
- `res.json({ data, total, page, limit })` : le client a besoin du total pour afficher « Page 2 / 5 ».

La création :

*`server/controllers/employeeController.js`, lignes 119 à 157 :*

```js
/**
 * POST /api/employees (HR/Admin)
 * Optional: { createAccount: true, password, role } to create the login at the same time.
 */
export const createEmployee = async (req, res) => {
  const data = pick(req.body, EDITABLE);
  assert(data.full_name, 'Le nom complet est requis');
  assert(data.email, "L'email est requis");
  validate(data);

  const { createAccount, password } = req.body;
  let role = req.body.role || 'employee';
  if (req.user.role !== 'admin') role = 'employee'; // only admins grant elevated roles
  if (createAccount) {
    assert(typeof password === 'string' && password.length >= 8, 'Mot de passe initial : 8 caractères minimum');
    assert(['admin', 'hr', 'employee'].includes(role), 'Rôle invalide');
  }

  const id = await withTransaction(async (client) => {
    const code = req.body.employee_code || (await nextEmployeeCode(client));
    const cols = ['employee_code', ...Object.keys(data)];
    const vals = [code, ...Object.values(data)];
    const { rows } = await client.query(
      `INSERT INTO employees (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      vals
    );
    if (createAccount) {
      await client.query(
        'INSERT INTO users (name, email, password_hash, role, employee_id) VALUES ($1,$2,$3,$4,$5)',
        [data.full_name, data.email, await bcrypt.hash(password, 12), role, rows[0].id]
      );
    }
    return rows[0].id;
  });

  const emp = await findEmployeeById(id);
  await logActivity(req.user.id, 'Création employé', 'employee', id, `${emp.employee_code} – ${emp.full_name}`);
  res.status(201).json(emp);
};
```

- `pick(req.body, EDITABLE)` : ne garde que les champs autorisés. Un utilisateur qui enverrait `"id": 1` ou d'autres champs ne pourrait rien modifier d'autre.
- `if (req.user.role !== 'admin') role = 'employee'` : les RH créent des comptes agents ; seul l'administrateur peut créer un compte RH ou admin.
- La fiche employé et le compte sont créés dans **la même transaction** : jamais l'un sans l'autre.
- La requête `INSERT` est construite à partir des colonnes réellement envoyées : `cols.map((_, i) => '$' + (i + 1))` produit `$1, $2, $3…`.

Les autres fonctions (`updateEmployee`, `deleteEmployee`, `getMe`, `updateMe`) suivent le même modèle. `updateEmployee` note dans l'audit les champs modifiés, et l'ancien et le nouveau salaire si le salaire change. `deleteEmployee` désactive le compte avant de supprimer la fiche.

## 4.14 `server/controllers/departmentController.js`

Le point clé est la requête `DEPT_SELECT` :

*`server/controllers/departmentController.js`, lignes 8 à 14 :*

```js
const DEPT_SELECT = `
  SELECT d.*, m.full_name AS manager_name, m.employee_code AS manager_code,
         COUNT(e.id) FILTER (WHERE e.status <> 'terminated') AS employee_count,
         COALESCE(SUM(e.salary) FILTER (WHERE e.status <> 'terminated'), 0) AS monthly_salary_cost
    FROM departments d
    LEFT JOIN employees m ON m.id = d.manager_id
    LEFT JOIN employees e ON e.department_id = d.id`;
```

- `COUNT(e.id) FILTER (WHERE ...)` : compte seulement les employés qui ne sont pas radiés. `FILTER` est une fonction de PostgreSQL très pratique pour faire plusieurs comptages différents dans une seule requête.
- `SUM(e.salary)` : la masse salariale mensuelle du département.
- Plus loin, `GROUP BY d.id, m.id` regroupe les lignes par département.

Les fonctions `list`, `get`, `create`, `update` et `delete` suivent le même schéma que pour les employés.

## 4.15 `server/utils/dates.js`

*`server/utils/dates.js`, lignes 1 à 36 :*

```js
/** Local-date helpers working with 'YYYY-MM-DD' strings. */
export const toISODate = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const isValidISODate = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Count working days (Mon–Fri) between two ISO dates, inclusive. */
export const businessDaysBetween = (startIso, endIso) => {
  let count = 0;
  const d = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (d <= end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) count += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
};

export const monthBounds = (year, month) => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { start, end };
};
```

- `toISODate` : transforme une date en texte `AAAA-MM-JJ` selon l'heure **locale** (d'où l'importance de `TZ`).
- `isValidISODate` : vérifie le format et que la date existe.
- `addDays('2026-09-23', 30)` → `'2026-10-23'`. On calcule en UTC pour éviter les décalages dus aux changements d'heure.
- `businessDaysBetween` : compte les jours du lundi au vendredi. `getUTCDay()` renvoie 0 pour dimanche et 6 pour samedi.
- `monthBounds(2026, 2)` → `{ start: '2026-02-01', end: '2026-02-28' }`. `Date.UTC(year, month, 0)` donne le dernier jour du mois (le « jour 0 » du mois suivant).

## 4.16 `server/controllers/attendanceController.js` — le pointage

*`server/controllers/attendanceController.js`, lignes 9 à 38 :*

```js
const STANDARD_HOURS = Number(process.env.WORK_HOURS_PER_DAY || 8);
const WORK_START = process.env.WORK_START || '08:00'; // HH:MM
const GRACE_MINUTES = Number(process.env.LATE_GRACE_MINUTES || 15);

const round2 = (n) => Math.round(n * 100) / 100;

export const computeHours = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return { working_hours: 0, overtime: 0 };
  const hours = Math.max(0, (new Date(checkOut) - new Date(checkIn)) / 36e5);
  return { working_hours: round2(hours), overtime: round2(Math.max(0, hours - STANDARD_HOURS)) };
};

const isLate = (date) => {
  const [h, m] = WORK_START.split(':').map(Number);
  return date.getHours() * 60 + date.getMinutes() > h * 60 + m + GRACE_MINUTES;
};

const requireEmployee = (user) => {
  if (!user.employee_id) throw new AppError('Aucun dossier employé lié à ce compte', 400);
  return user.employee_id;
};

const onApprovedLeave = async (employeeId, date) => {
  const { rows } = await query(
    `SELECT 1 FROM leaves WHERE employee_id = $1 AND status = 'approved'
        AND $2::date BETWEEN start_date AND end_date`,
    [employeeId, date]
  );
  return rows.length > 0;
};
```

- Les constantes lisent `.env`, avec une valeur par défaut après `||`.
- `computeHours` : `(checkOut - checkIn) / 36e5` = différence en millisecondes divisée par 3 600 000, soit des heures. Heures supplémentaires = heures − 8, jamais négatives.
- `isLate` : compare l'heure d'arrivée, en minutes, à `08:00 + 15`.
- `onApprovedLeave` : vrai si un congé approuvé couvre la date.

*`server/controllers/attendanceController.js`, lignes 40 à 63 :*

```js
/** POST /api/attendance/check-in — optional GPS { latitude, longitude } */
export const checkIn = async (req, res) => {
  const employeeId = requireEmployee(req.user);
  const now = new Date();
  const today = toISODate(now);
  if (await onApprovedLeave(employeeId, today)) {
    throw new AppError('Vous êtes en congé approuvé aujourd’hui', 400);
  }
  const { latitude, longitude, note } = req.body || {};
  const lat = latitude !== undefined && latitude !== null ? Number(latitude) : null;
  const lng = longitude !== undefined && longitude !== null ? Number(longitude) : null;
  assert(lat === null || (lat >= -90 && lat <= 90), 'Latitude invalide');
  assert(lng === null || (lng >= -180 && lng <= 180), 'Longitude invalide');

  // ON CONFLICT DO NOTHING + unique(employee_id, work_date) => no duplicate check-in even on double click
  const { rows } = await query(
    `INSERT INTO attendance (employee_id, work_date, check_in, status, latitude, longitude, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (employee_id, work_date) DO NOTHING RETURNING *`,
    [employeeId, today, now, isLate(now) ? 'late' : 'present', lat, lng, note || null]
  );
  if (!rows[0]) throw new AppError('Vous avez déjà pointé votre arrivée aujourd’hui', 409);
  res.status(201).json(rows[0]);
};
```

L'**anti-doublon** repose sur deux mécanismes :
1. dans la base, la contrainte `UNIQUE (employee_id, work_date)` interdit deux lignes pour le même agent le même jour ;
2. `ON CONFLICT (employee_id, work_date) DO NOTHING RETURNING *` : si la ligne existe déjà, PostgreSQL n'insère rien et ne renvoie aucune ligne. `rows[0]` est alors vide, et on répond 409.

Même si l'agent clique trois fois très vite, une seule ligne est créée : c'est la base qui garantit la règle, pas seulement le code.

*`server/controllers/attendanceController.js`, lignes 65 à 87 :*

```js
/** POST /api/attendance/check-out */
export const checkOut = async (req, res) => {
  const employeeId = requireEmployee(req.user);
  const now = new Date();
  const today = toISODate(now);
  const { rows } = await query(
    'SELECT * FROM attendance WHERE employee_id = $1 AND work_date = $2',
    [employeeId, today]
  );
  const record = rows[0];
  if (!record || !record.check_in) throw new AppError('Aucun pointage d’arrivée trouvé pour aujourd’hui', 400);
  if (record.check_out) throw new AppError('Vous avez déjà pointé votre départ aujourd’hui', 409);

  const { working_hours: wh, overtime } = computeHours(record.check_in, now);
  const status = wh < STANDARD_HOURS / 2 ? 'half_day' : record.status;
  const updated = await query(
    `UPDATE attendance SET check_out = $1, working_hours = $2, overtime = $3, status = $4
      WHERE id = $5 AND check_out IS NULL RETURNING *`,
    [now, wh, overtime, status, record.id]
  );
  if (!updated.rows[0]) throw new AppError('Départ déjà enregistré', 409);
  res.json(updated.rows[0]);
};
```

- On cherche le pointage du jour ; sans arrivée, pas de départ possible.
- On calcule les heures ; moins de 4 h → `half_day`.
- `WHERE id = $5 AND check_out IS NULL` : protège contre deux départs enregistrés en même temps.

Les autres fonctions :
- `listAttendance` : les RH voient tout ; le chef de service voit son équipe (`scope=team`) ; l'agent voit ses propres pointages.
- `upsertAttendance` : saisie manuelle par les RH. `ON CONFLICT ... DO UPDATE` remplace la ligne si elle existe déjà (*upsert* = *update* ou *insert*).
- `markAbsent` : dans une transaction, insère `on_leave` pour les agents en congé, puis `absent` pour tous les autres agents actifs qui n'ont pas de ligne ce jour-là (`ON CONFLICT DO NOTHING` ignore ceux qui ont pointé), et notifie chaque absent.
- `monthlyReport` : une seule requête avec `COUNT(...) FILTER (WHERE a.status = ...)` pour chaque statut, et `SUM` pour les heures.

## 4.17 `server/controllers/leaveController.js` — les congés

*`server/controllers/leaveController.js`, lignes 25 à 41 :*

```js
/** Can this user approve/reject leave for the employee? (HR/Admin, or manager of their department) */
const canReview = (user, leave) =>
  isHRorAdmin(user) || (user.managed_departments.includes(leave.department_id) && user.employee_id !== leave.employee_id);

/** Balance still available = stored balance − days already requested and pending (prevents over-booking). */
const availableBalance = async (employeeId, type, db = { query }) => {
  const col = LEAVE_TYPES[type].column;
  if (!col) return Infinity;
  const { rows } = await db.query(
    `SELECT e.${col} AS balance,
            COALESCE((SELECT SUM(days) FROM leaves
                       WHERE employee_id = e.id AND leave_type = $2 AND status = 'pending'), 0) AS pending
       FROM employees e WHERE e.id = $1`,
    [employeeId, type]
  );
  return rows[0].balance - rows[0].pending;
};
```

- `canReview` : les RH, l'administrateur ou le chef du département de l'agent, **mais pas l'agent lui-même**.
- `availableBalance` : solde disponible = solde enregistré − jours déjà demandés et encore en attente. Sans cette soustraction, un agent avec 12 jours pourrait faire trois demandes de 10 jours en attente.
- `e.${col}` : le nom de la colonne vient de `LEAVE_TYPES` (une liste fixe), jamais de l'utilisateur.

*`server/controllers/leaveController.js`, lignes 92 à 134 :*

```js
/** POST /api/leaves — apply for leave */
export const applyLeave = async (req, res) => {
  const employeeId = req.user.employee_id;
  assert(employeeId, 'Aucun dossier employé lié à ce compte');
  const { leave_type: type, start_date: start, end_date: end, reason } = req.body;
  assert(LEAVE_TYPES[type], 'Type de congé invalide');
  assert(isValidISODate(start) && isValidISODate(end), 'Dates invalides');
  assert(end >= start, 'La date de fin doit être postérieure à la date de début');
  assert(type === 'sick' || start >= toISODate(), 'Impossible de demander un congé dans le passé');

  const days = businessDaysBetween(start, end);
  assert(days > 0, 'La période ne contient aucun jour ouvré');

  await refreshLeaveBalances();
  const leave = await withTransaction(async (client) => {
    // Serialise requests of the same employee to keep balances accurate (challenge #5)
    await client.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [employeeId]);

    const overlap = await client.query(
      `SELECT 1 FROM leaves WHERE employee_id = $1 AND status IN ('pending','approved')
          AND start_date <= $3 AND end_date >= $2`,
      [employeeId, start, end]
    );
    if (overlap.rows.length) throw new AppError('Cette période chevauche une demande existante', 409);

    const available = await availableBalance(employeeId, type, client);
    if (days > available) {
      throw new AppError(`Solde insuffisant : ${available} jour(s) disponible(s), ${days} demandé(s)`, 400);
    }

    const { rows } = await client.query(
      `INSERT INTO leaves (employee_id, leave_type, start_date, end_date, days, reason)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [employeeId, type, start, end, days, reason || null]
    );
    return rows[0];
  });

  await notifyRoles(['hr', 'admin'], 'leave', 'Nouvelle demande de congé',
    `${req.user.name} : ${LEAVE_TYPES[type].label}, ${days} jour(s) du ${start} au ${end}`, '/leaves');
  await logActivity(req.user.id, 'Demande de congé', 'leave', leave.id, `${LEAVE_TYPES[type].label} – ${days} j`);
  res.status(201).json(leave);
};
```

1. Vérifications : type connu, dates valides, fin ≥ début, pas de date passée (sauf un congé maladie déclaré après coup).
2. `businessDaysBetween` : nombre de jours ouvrés.
3. `SELECT ... FOR UPDATE` **verrouille** la ligne de l'employé jusqu'à la fin de la transaction. Si deux demandes arrivent en même temps, la seconde attend la fin de la première : le solde reste exact.
4. **Chevauchement** : deux périodes se chevauchent si `début1 ≤ fin2` et `fin1 ≥ début2`.
5. Contrôle du solde disponible.
6. Insertion, puis notification des RH et de l'administrateur.

*`server/controllers/leaveController.js`, lignes 136 à 174 :*

```js
/** PATCH /api/leaves/:id/review { action: 'approve'|'reject', comment } */
export const reviewLeave = async (req, res) => {
  const id = toInt(req.params.id);
  const { action, comment } = req.body;
  assert(['approve', 'reject'].includes(action), 'Action invalide');

  const leave = await withTransaction(async (client) => {
    const { rows } = await client.query(`${LEAVE_SELECT} WHERE l.id = $1 FOR UPDATE OF l`, [id]);
    const current = rows[0];
    if (!current) throw new AppError('Demande introuvable', 404);
    if (!canReview(req.user, current)) throw new AppError('Accès refusé', 403);
    if (current.status !== 'pending') throw new AppError('Cette demande a déjà été traitée', 409);

    if (action === 'approve') {
      const col = LEAVE_TYPES[current.leave_type].column;
      if (col) {
        const upd = await client.query(
          `UPDATE employees SET ${col} = ${col} - $1 WHERE id = $2 AND ${col} >= $1 RETURNING ${col}`,
          [current.days, current.employee_id]
        );
        if (!upd.rows[0]) throw new AppError('Solde de congé insuffisant pour approuver', 400);
      }
    }
    const status = action === 'approve' ? 'approved' : 'rejected';
    const upd = await client.query(
      `UPDATE leaves SET status = $1, reviewed_by = $2, review_comment = $3, reviewed_at = now()
        WHERE id = $4 RETURNING *`,
      [status, req.user.id, comment || null, id]
    );
    return { ...current, ...upd.rows[0] };
  });

  const label = leave.status === 'approved' ? 'approuvée' : 'rejetée';
  await notifyEmployee(leave.employee_id, 'leave', `Demande de congé ${label}`,
    `${LEAVE_TYPES[leave.leave_type].label} du ${leave.start_date} au ${leave.end_date}${comment ? ` — ${comment}` : ''}`,
    '/leaves');
  await logActivity(req.user.id, `Congé ${label}`, 'leave', id, `${leave.full_name} – ${leave.days} j`);
  res.json(leave);
};
```

- `FOR UPDATE OF l` : verrouille la demande pour qu'elle ne soit pas traitée deux fois en même temps.
- `status !== 'pending'` → 409 : une demande déjà traitée ne peut pas l'être à nouveau.
- Débit du solde : `UPDATE ... SET col = col - jours WHERE ... AND col >= jours`. La condition `col >= jours` empêche un solde négatif ; si aucune ligne n'est modifiée, on refuse.
- L'agent est notifié ; l'action est tracée dans l'audit.

`cancelLeave` : recrédite le solde si le congé était déjà approuvé. Un congé déjà commencé ne peut être annulé que par les RH.

## 4.18 `server/utils/payroll.js` — le calcul de la paie

*`server/utils/payroll.js`, lignes 1 à 36 :*

```js
import { businessDaysBetween, monthBounds } from './dates.js';

/**
 * Payroll rules. Values are configurable through environment variables so the
 * ministry can align them with the applicable civil-service pay grid.
 * `salary` on an employee is the MONTHLY base salary.
 */
export const PAYROLL_RULES = {
  housingAllowanceRate: Number(process.env.PAY_HOUSING_RATE ?? 0.15), // % of basic
  transportAllowance: Number(process.env.PAY_TRANSPORT ?? 25000), // flat amount
  overtimeMultiplier: Number(process.env.PAY_OVERTIME_MULT ?? 1.25),
  socialSecurityRate: Number(process.env.PAY_SOCIAL_RATE ?? 0.056), // pension / social contribution
  hoursPerDay: 8,
  // Progressive monthly income tax brackets applied to taxable income
  taxBrackets: [
    { upTo: 50000, rate: 0 },
    { upTo: 130000, rate: 0.1 },
    { upTo: 280000, rate: 0.15 },
    { upTo: 530000, rate: 0.2 },
    { upTo: Infinity, rate: 0.3 },
  ],
};

const round = (n) => Math.round(n * 100) / 100;

export const progressiveTax = (taxable, brackets = PAYROLL_RULES.taxBrackets) => {
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of brackets) {
    if (taxable <= lower) break;
    const slice = Math.min(taxable, upTo) - lower;
    tax += slice * rate;
    lower = upTo;
  }
  return round(tax);
};
```

- `PAYROLL_RULES` : tous les taux au même endroit, modifiables par `.env`. `??` signifie « si la variable n'existe pas, prendre la valeur par défaut ».
- `progressiveTax` : **impôt par tranches**. Exemple avec un revenu imposable de 200 000 :
  - de 0 à 50 000 → 0 % = 0 ;
  - de 50 000 à 130 000 → 10 % × 80 000 = 8 000 ;
  - de 130 000 à 200 000 → 15 % × 70 000 = 10 500 ;
  - total = **18 500**.

*`server/utils/payroll.js`, lignes 38 à 101 :*

```js
/**
 * Compute a salary slip.
 * @param {object} p
 * @param {number} p.basic            monthly base salary
 * @param {number} p.year, p.month    pay period
 * @param {number} [p.overtimeHours]  overtime hours worked during the period
 * @param {number} [p.unpaidLeaveDays] unpaid leave days during the period
 * @param {number} [p.bonus]          extra bonus / prime
 * @param {number} [p.otherDeductions] advances, loans, …
 */
export const computePayslip = ({
  basic,
  year,
  month,
  overtimeHours = 0,
  unpaidLeaveDays = 0,
  bonus = 0,
  otherDeductions = 0,
}) => {
  const r = PAYROLL_RULES;
  const { start, end } = monthBounds(year, month);
  const workingDays = businessDaysBetween(start, end);
  const dailyRate = workingDays ? basic / workingDays : 0;
  const hourlyRate = dailyRate / r.hoursPerDay;

  const housing = round(basic * r.housingAllowanceRate);
  const transport = round(r.transportAllowance);
  const allowances = round(housing + transport);
  const overtimePay = round(overtimeHours * hourlyRate * r.overtimeMultiplier);
  const bonuses = round(bonus);
  const gross = round(basic + allowances + overtimePay + bonuses);

  const unpaidLeave = round(unpaidLeaveDays * dailyRate);
  const socialSecurity = round((basic - unpaidLeave) * r.socialSecurityRate);
  const deductions = round(unpaidLeave + socialSecurity + otherDeductions);

  // Transport allowance is treated as non-taxable reimbursement
  const taxable = Math.max(0, gross - transport - unpaidLeave - socialSecurity);
  const tax = progressiveTax(taxable);
  const net = round(Math.max(0, gross - deductions - tax));

  return {
    basic: round(basic),
    allowances,
    bonuses,
    overtimePay,
    gross,
    deductions,
    tax,
    net,
    details: {
      workingDays,
      dailyRate: round(dailyRate),
      housing,
      transport,
      overtimeHours: round(overtimeHours),
      unpaidLeaveDays,
      unpaidLeave,
      socialSecurity,
      otherDeductions: round(otherDeductions),
      taxable: round(taxable),
    },
  };
};
```

Le calcul, dans l'ordre :
1. Jours ouvrés du mois → taux journalier = base ÷ jours ; taux horaire = taux journalier ÷ 8.
2. **Gains** : logement (15 % de la base) + transport (forfait) + heures supplémentaires (heures × taux horaire × 1,25) + primes. Leur somme avec la base donne le **brut**.
3. **Retenues** : congé sans solde (jours × taux journalier) + cotisation sociale (5,6 %) + autres retenues.
4. **Imposable** = brut − transport (non imposable) − congé sans solde − cotisation.
5. **Net** = brut − retenues − impôt.
6. `details` : toutes les valeurs intermédiaires, stockées pour réimprimer le bulletin à l'identique.
7. `round` arrondit à 2 décimales pour éviter les erreurs d'arrondi comme `0.1 + 0.2 = 0.30000000000000004`.

## 4.19 `server/utils/payslipPdf.js` — le bulletin PDF

Principe de pdfkit :
```js
const doc = new PDFDocument({ size: 'A4', margin: 50 });
res.setHeader('Content-Type', 'application/pdf');
res.setHeader('Content-Disposition', 'attachment; filename="bulletin-EMP101-2026-09.pdf"');
doc.pipe(res);                    // le PDF est envoyé au navigateur au fur et à mesure
doc.fontSize(16).text('Titre', { align: 'center' });
doc.end();                        // termine le document
```
- `Content-Disposition: attachment` : le navigateur télécharge le fichier au lieu de l'afficher.
- `row(label, amount, opts)` : une petite fonction qui écrit une ligne du bulletin (libellé à gauche, montant à droite), avec un fond coloré en option.
- `section(title)` : un titre bleu (« Gains », « Retenues »).
- `fmt(n)` : formate les montants à la française (`1 250 000 FCFA`).

## 4.20 `server/controllers/payrollController.js`

*`server/controllers/payrollController.js`, lignes 36 à 55 :*

```js
/** Overtime hours and unpaid-leave working days of one employee within the month. */
const periodInputs = async (employeeId, year, month, db = { query }) => {
  const { start, end } = monthBounds(year, month);
  const [ot, unpaid] = await Promise.all([
    db.query(
      'SELECT COALESCE(SUM(overtime), 0) AS h FROM attendance WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3',
      [employeeId, start, end]
    ),
    db.query(
      `SELECT GREATEST(start_date, $2::date)::text AS s, LEAST(end_date, $3::date)::text AS e FROM leaves
        WHERE employee_id = $1 AND leave_type = 'unpaid' AND status = 'approved'
          AND start_date <= $3 AND end_date >= $2`,
      [employeeId, start, end]
    ),
  ]);
  return {
    overtimeHours: ot.rows[0].h,
    unpaidLeaveDays: unpaid.rows.reduce((sum, r) => sum + businessDaysBetween(r.s, r.e), 0),
  };
};
```

- Pour un agent et un mois donnés : la somme de ses heures supplémentaires pointées, et ses jours de congé sans solde approuvés **dans ce mois**. `GREATEST` et `LEAST` coupent un congé qui déborde sur le mois précédent ou suivant.

*`server/controllers/payrollController.js`, lignes 57 à 117 :*

```js
/**
 * POST /api/payroll/generate (HR/Admin) — automatic payroll calculation (challenge #2)
 * { year, month, employee_ids?: number[], bonuses?: {id: amount}, deductions?: {id: amount}, overwrite?: bool }
 */
export const generatePayroll = async (req, res) => {
  const year = toInt(req.body.year);
  const month = toInt(req.body.month);
  assert(year >= 2000 && year <= 2100, 'Année invalide');
  assert(month >= 1 && month <= 12, 'Mois invalide');
  const bonuses = req.body.bonuses || {};
  const deductions = req.body.deductions || {};
  const ids = Array.isArray(req.body.employee_ids) && req.body.employee_ids.length
    ? req.body.employee_ids.map((v) => toInt(v)).filter(Boolean) : null;
  const { end } = monthBounds(year, month);

  const { rows: employees } = await query(
    `SELECT id, salary FROM employees
      WHERE status IN ('active','on_leave') AND date_of_joining <= $1 AND ($2::int[] IS NULL OR id = ANY($2))`,
    [end, ids]
  );

  const result = await withTransaction(async (client) => {
    const created = [];
    const skipped = [];
    for (const emp of employees) {
      const inputs = await periodInputs(emp.id, year, month, client);
      const slip = computePayslip({
        basic: emp.salary, year, month, ...inputs,
        bonus: Number(bonuses[emp.id] || 0),
        otherDeductions: Number(deductions[emp.id] || 0),
      });
      const conflict = req.body.overwrite
        ? `ON CONFLICT (employee_id, period_year, period_month) DO UPDATE SET
             basic = EXCLUDED.basic, allowances = EXCLUDED.allowances, bonuses = EXCLUDED.bonuses,
             overtime_pay = EXCLUDED.overtime_pay, gross = EXCLUDED.gross, deductions = EXCLUDED.deductions,
             tax = EXCLUDED.tax, net = EXCLUDED.net, details = EXCLUDED.details,
             generated_by = EXCLUDED.generated_by, created_at = now()
           WHERE payrolls.status = 'processed'`
        : 'ON CONFLICT (employee_id, period_year, period_month) DO NOTHING';
      const { rows } = await client.query(
        `INSERT INTO payrolls (employee_id, period_year, period_month, basic, allowances, bonuses, overtime_pay,
                               gross, deductions, tax, net, details, generated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ${conflict} RETURNING id`,
        [emp.id, year, month, slip.basic, slip.allowances, slip.bonuses, slip.overtimePay,
          slip.gross, slip.deductions, slip.tax, slip.net, JSON.stringify(slip.details), req.user.id]
      );
      if (rows[0]) {
        created.push(rows[0].id);
        await notifyEmployee(emp.id, 'payroll', 'Salaire traité',
          `Votre bulletin de ${String(month).padStart(2, '0')}/${year} est disponible (net : ${slip.net}).`, '/payroll', client);
      } else {
        skipped.push(emp.id);
      }
    }
    return { created, skipped };
  });

  await logActivity(req.user.id, 'Génération de la paie', 'payroll', null,
    `${String(month).padStart(2, '0')}/${year} : ${result.created.length} bulletin(s), ${result.skipped.length} ignoré(s)`);
  res.status(201).json({ year, month, generated: result.created.length, skipped: result.skipped.length });
};
```

- Sélection des agents actifs entrés avant la fin du mois (ou seulement ceux de `employee_ids`).
- Pour chacun : collecte des données du mois, puis `computePayslip`, puis `INSERT`.
- **Un seul bulletin par mois** : la contrainte `UNIQUE (employee_id, period_year, period_month)` et :
  - `ON CONFLICT DO NOTHING` : les bulletins existants sont ignorés (comptés dans `skipped`) ;
  - avec `overwrite: true` : `ON CONFLICT DO UPDATE ... WHERE payrolls.status = 'processed'` recalcule, mais **jamais** un bulletin déjà payé.
- Tout se fait dans une transaction : en cas d'erreur, aucun bulletin n'est créé.
- Chaque agent reçoit la notification « Salaire traité ».

Les autres fonctions : `listPayrolls` (un agent ne voit que ses bulletins), `loadSlip` (vérifie que le bulletin appartient à l'agent, sinon 403), `downloadPayslip` (appelle `streamPayslip`), `markPaid` et `deletePayroll` (seulement les bulletins non payés).

## 4.21 `server/controllers/performanceController.js`

- `canManage` : les RH, l'administrateur, ou le chef du département de l'agent (mais pas pour lui-même).
- `normaliseGoals` : nettoie la liste des objectifs (20 au maximum, titre limité à 200 caractères, avancement entre 0 et 100).
- `updateReview` : si c'est le responsable, il modifie tout. Si c'est l'agent évalué, **seuls** l'avancement (`progress`) et la case « atteint » (`done`) de ses objectifs sont modifiés ; les titres restent ceux fixés par le responsable.
- `insights` : l'analyse automatique. Trois requêtes (évaluations, présences sur 90 jours, dossiers), puis un **score pondéré** :
  - note moyenne 40 %, assiduité 20 %, ponctualité 15 %, objectifs atteints 15 %, dossiers traités sans retard 10 % ;
  - si un indicateur manque, son poids est retiré et le score est recalculé sur les autres ;
  - des règles simples produisent des recommandations (« Retards fréquents… », « Risque de surcharge… »).

## 4.22 `server/controllers/projectController.js` — les dossiers

Les droits :

*`server/controllers/projectController.js`, lignes 29 à 60 :*

```js
const canViewDirect = (user, p) =>
  isHRorAdmin(user)
  || (user.employee_id && p.agent_id === user.employee_id)
  || p.created_by === user.id
  || user.managed_departments.includes(p.department_id);

/** Anyone who handled the dossier at some step keeps read access to follow it. */
const canView = async (user, p, db = { query }) => {
  if (canViewDirect(user, p)) return true;
  const { rows } = await db.query(
    `SELECT 1 FROM project_history WHERE project_id = $1
        AND (user_id = $2 OR to_agent = $3 OR from_agent = $3) LIMIT 1`,
    [p.id, user.id, user.employee_id ?? -1]
  );
  return rows.length > 0;
};

const canAssign = (user, p) => isHRorAdmin(user) || user.managed_departments.includes(p.department_id);
const canProcess = (user, p) => canAssign(user, p) || (user.employee_id && p.agent_id === user.employee_id);

const findProject = async (id, db = { query }) => {
  const { rows } = await db.query(`${PROJECT_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] || null;
};

const addHistory = (db, project, step, action, { comment, fromAgent, toAgent, userId }) =>
  db.query(
    `INSERT INTO project_history (project_id, step_order, step_name, action, from_agent, to_agent, comment, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [project.id, step?.step_order ?? project.current_step, step?.name ?? null, action,
      fromAgent ?? null, toAgent ?? null, comment || null, userId]
  );
```

- `canViewDirect` : les RH, l'administrateur, l'agent traitant, la personne qui a enregistré le dossier et le chef du service où se trouve le dossier.
- `canView` : en plus, toute personne qui est **intervenue** sur le dossier (présente dans l'historique) peut continuer à le suivre après l'avoir transmis.
- `canAssign` : RH, administrateur ou chef du service actuel.
- `canProcess` : ceux qui peuvent affecter, plus l'agent traitant.
- `addHistory` : ajoute une ligne à `project_history` (étape, action, ancien et nouvel agent, commentaire, auteur).

L'enregistrement :

*`server/controllers/projectController.js`, lignes 239 à 284 :*

```js
/** POST /api/projects — register a new dossier (enregistrement) */
export const createProject = async (req, res) => {
  const data = pick(req.body, PROJECT_FIELDS);
  assert(data.title, 'L’objet du dossier est requis');
  assert(data.applicant_name, 'Le nom du demandeur est requis');
  assert(toInt(data.request_type_id), 'Type de demande requis');
  assert(toInt(data.deposit_type_id), 'Type de dépôt requis');
  if (data.deposit_date) assert(isValidISODate(data.deposit_date), 'Date de dépôt invalide');
  if (data.priority) assert(['low', 'normal', 'high', 'urgent'].includes(data.priority), 'Priorité invalide');
  const depositDate = data.deposit_date || toISODate();
  assert(depositDate <= toISODate(), 'La date de dépôt ne peut pas être dans le futur');

  const { rows: rt } = await query('SELECT * FROM request_types WHERE id = $1 AND is_active', [toInt(data.request_type_id)]);
  if (!rt[0]) throw new AppError('Type de demande invalide', 400);
  const circuit = await getCircuit(rt[0].id);
  assert(circuit.length, 'Aucun circuit de traitement n’est paramétré');
  const agentId = data.agent_id ? toInt(data.agent_id) : null;
  if (agentId && !isHRorAdmin(req.user) && !req.user.isManager) {
    throw new AppError('Seuls les RH, administrateurs et chefs de service affectent un agent', 403);
  }

  const project = await withTransaction(async (client) => {
    const reference = await nextReference(client);
    const { rows } = await client.query(
      `INSERT INTO projects (reference, title, description, request_type_id, deposit_type_id, applicant_name,
         applicant_matricule, applicant_phone, applicant_email, applicant_structure, deposit_date, due_date,
         priority, agent_id, department_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [reference, data.title, data.description || null, rt[0].id, toInt(data.deposit_type_id), data.applicant_name,
        data.applicant_matricule || null, data.applicant_phone || null, data.applicant_email || null,
        data.applicant_structure || null, depositDate, addDays(depositDate, rt[0].sla_days),
        data.priority || 'normal', agentId, toInt(data.department_id) || circuit[0].department_id || null, req.user.id]
    );
    const p = rows[0];
    await addHistory(client, p, circuit[0], 'creation', { comment: data.description, userId: req.user.id });
    if (agentId) {
      await addHistory(client, p, circuit[0], 'assign', { toAgent: agentId, userId: req.user.id });
      await notifyEmployee(agentId, 'project', 'Nouveau dossier affecté',
        `${reference} – ${data.title}`, `/projects/${p.id}`, client);
    }
    return p;
  });

  await logActivity(req.user.id, 'Enregistrement de dossier', 'project', project.id, `${project.reference} – ${project.title}`);
  res.status(201).json(await findProject(project.id));
};
```

1. Vérifications : objet, demandeur, type de demande, type de dépôt, date de dépôt pas dans le futur.
2. On charge le type de demande (pour son délai `sla_days`) et son circuit.
3. Dans une transaction : référence → `INSERT` avec `due_date = date de dépôt + délai` et le service de la 1ʳᵉ étape → historique « creation » → si un agent est choisi, historique « assign » et notification.

Le moteur du circuit :

*`server/controllers/projectController.js`, lignes 303 à 413 :*

```js
/**
 * POST /api/projects/:id/actions — move the dossier through its circuit
 * { action: assign|advance|return|request_documents|resume|reject|close|comment, comment?, agent_id? }
 */
export const projectAction = async (req, res) => {
  const id = toInt(req.params.id);
  const { action, comment } = req.body;
  assert(ACTION_LABELS[action] && !['creation', 'document'].includes(action), 'Action invalide');
  const newAgent = req.body.agent_id ? toInt(req.body.agent_id) : null;

  const outcome = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM projects WHERE id = $1 FOR UPDATE', [id]);
    const p = rows[0];
    if (!p || !(await canView(req.user, p))) throw new AppError('Dossier introuvable', 404);
    const circuit = await getCircuit(p.request_type_id, client);
    const step = circuit[p.current_step - 1];
    const open = ['in_progress', 'awaiting_documents'].includes(p.status);
    const ctx = { comment, userId: req.user.id, fromAgent: p.agent_id };
    const set = { updated_at: new Date() };
    let notifyAgent = null;
    let historyStep = step;

    if (action === 'comment') {
      assert(comment, 'Commentaire requis');
    } else {
      assert(open, 'Ce dossier est clôturé');
      const allowed = action === 'assign' ? canAssign(req.user, p) : canProcess(req.user, p);
      if (!allowed) throw new AppError('Vous n’êtes pas autorisé à effectuer cette action sur ce dossier', 403);
    }

    switch (action) {
      case 'assign': {
        assert(newAgent, 'Agent traitant requis');
        const { rows: ag } = await client.query(
          `SELECT id FROM employees WHERE id = $1 AND status IN ('active','on_leave')`, [newAgent]);
        assert(ag[0], 'Agent introuvable ou inactif');
        set.agent_id = newAgent;
        ctx.toAgent = newAgent;
        notifyAgent = newAgent;
        break;
      }
      case 'advance': {
        assert(p.status === 'in_progress', 'Le dossier attend des pièces complémentaires');
        const next = circuit[p.current_step];
        if (!next) throw new AppError('Dernière étape atteinte : utilisez « Clôturer »', 400);
        set.current_step = p.current_step + 1;
        set.department_id = next.department_id || p.department_id;
        // Hand over to the agent chosen for the next step, otherwise leave unassigned for the next service
        set.agent_id = newAgent || (next.department_id && next.department_id !== p.department_id ? null : p.agent_id);
        ctx.toAgent = set.agent_id;
        notifyAgent = set.agent_id !== p.agent_id ? set.agent_id : null;
        historyStep = next;
        break;
      }
      case 'return': {
        assert(p.current_step > 1, 'Le dossier est déjà à la première étape');
        assert(comment, 'Motif du retour requis');
        const prev = circuit[p.current_step - 2];
        set.current_step = p.current_step - 1;
        set.department_id = prev.department_id || p.department_id;
        set.agent_id = newAgent || null;
        ctx.toAgent = set.agent_id;
        notifyAgent = set.agent_id;
        historyStep = prev;
        break;
      }
      case 'request_documents':
        assert(comment, 'Précisez les pièces demandées');
        assert(p.status === 'in_progress', 'Des pièces sont déjà demandées');
        set.status = 'awaiting_documents';
        break;
      case 'resume':
        assert(p.status === 'awaiting_documents', 'Le dossier n’est pas en attente de pièces');
        set.status = 'in_progress';
        break;
      case 'reject':
        assert(comment, 'Motif du rejet requis');
        set.status = 'rejected';
        set.closed_at = new Date();
        break;
      case 'close':
        assert(p.current_step === circuit.length, `Le dossier doit d’abord atteindre la dernière étape (${circuit.length})`);
        set.status = 'completed';
        set.closed_at = new Date();
        break;
      default:
        break;
    }

    const cols = Object.keys(set);
    await client.query(
      `UPDATE projects SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1}`,
      [...Object.values(set), id]
    );
    await addHistory(client, p, historyStep, action, ctx);

    if (notifyAgent) {
      await notifyEmployee(notifyAgent, 'project', 'Dossier à traiter',
        `${p.reference} – ${p.title} (${historyStep?.name || 'étape'})`, `/projects/${p.id}`, client);
    }
    if (['reject', 'close'].includes(action) && p.created_by && p.created_by !== req.user.id) {
      await notifyUser(p.created_by, 'project', `Dossier ${action === 'close' ? 'clôturé' : 'rejeté'}`,
        `${p.reference} – ${p.title}`, `/projects/${p.id}`, client);
    }
    return p;
  });

  await logActivity(req.user.id, ACTION_LABELS[action], 'project', id, `${outcome.reference}${comment ? ` – ${comment}` : ''}`);
  req.params.id = String(id);
  return getProject(req, res);
};
```

- Une **seule** route (`POST /api/projects/:id/actions`) gère toutes les actions, grâce au `switch (action)`.
- `SELECT ... FOR UPDATE` : verrouille le dossier pendant l'action.
- `circuit[p.current_step - 1]` : l'étape actuelle (le tableau commence à 0, les étapes à 1).
- `set` : un objet où chaque `case` ajoute les colonnes à modifier. À la fin, on construit un seul `UPDATE`.
- Les cas :
  - `assign` : vérifie que l'agent existe et est actif ;
  - `advance` : impossible si des pièces sont attendues ou si c'est la dernière étape. On passe à l'étape suivante et au service de cette étape. Si le service change et qu'aucun agent n'est désigné, le dossier devient « non affecté » pour que le nouveau chef de service l'affecte ;
  - `return` : motif obligatoire, retour à l'étape précédente ;
  - `request_documents` / `resume` : passe en « pièces demandées » puis revient « en cours » ;
  - `reject` : motif obligatoire, dossier fermé ;
  - `close` : seulement à la dernière étape.
- Ensuite : historique, notification du nouvel agent, et notification de la personne qui a enregistré le dossier s'il est clôturé ou rejeté.
- La fonction se termine en renvoyant le dossier complet, pour que l'écran se mette à jour.

Les pièces jointes : le navigateur envoie le fichier en **base64** (du texte qui représente des octets). Le serveur vérifie le type (`ALLOWED_MIME`) et la taille (3 Mo), puis stocke les octets dans une colonne `BYTEA`. Le récépissé (`depositReceipt`) utilise pdfkit comme le bulletin.

## 4.23 `server/utils/notify.js` et `server/utils/audit.js`

*`server/utils/notify.js`, lignes 1 à 30 :*

```js
import { query } from '../config/db.js';

/** Notify a single user. */
export const notifyUser = async (userId, type, title, message = null, link = null, db = { query }) => {
  if (!userId) return;
  await db.query(
    'INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,$2,$3,$4,$5)',
    [userId, type, title, message, link]
  );
};

/** Notify the user account linked to an employee (if any). */
export const notifyEmployee = async (employeeId, type, title, message = null, link = null, db = { query }) => {
  if (!employeeId) return;
  await db.query(
    `INSERT INTO notifications (user_id, type, title, message, link)
     SELECT id, $2, $3, $4, $5 FROM users WHERE employee_id = $1 AND is_active`,
    [employeeId, type, title, message, link]
  );
};

/** Notify every active user having one of the given roles (or everybody when roles is empty). */
export const notifyRoles = async (roles, type, title, message = null, link = null, db = { query }) => {
  const all = !roles || roles.length === 0;
  await db.query(
    `INSERT INTO notifications (user_id, type, title, message, link)
     SELECT id, $2, $3, $4, $5 FROM users WHERE is_active AND ($6 OR role = ANY($1))`,
    [roles || [], type, title, message, link, all]
  );
};
```

- `notifyUser` : une notification pour un compte.
- `notifyEmployee` : `INSERT ... SELECT` crée la notification pour le compte lié à l'employé, en une seule requête.
- `notifyRoles(['hr','admin'], ...)` : une notification pour chaque compte ayant l'un de ces rôles ; avec une liste vide, pour tout le monde (annonces).
- Le paramètre `db = { query }` permet de passer le `client` d'une transaction : la notification est alors annulée si la transaction échoue.

*`server/utils/audit.js`, lignes 1 à 13 :*

```js
import { query } from '../config/db.js';

/** Record an HR activity (audit log). Never throws. */
export const logActivity = async (userId, action, entity = null, entityId = null, details = null, db = { query }) => {
  try {
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [userId ?? null, action, entity, entityId, details]
    );
  } catch (err) {
    console.error('audit log failed:', err.message);
  }
};
```

- `logActivity` : ajoute une ligne dans `activity_logs`. Le `try/catch` fait qu'une erreur d'audit ne bloque jamais l'action principale.

## 4.24 Les autres contrôleurs

| Fichier | Fonctions | Idée principale |
| --- | --- | --- |
| `dashboardController.js` | `getDashboard` | Toujours les données personnelles (pointage du jour, soldes, dernier bulletin, dossiers) ; en plus, pour les RH et l'administrateur, les chiffres de toute l'organisation ; pour un chef de service, ceux de son service. `Promise.all` lance toutes les requêtes en parallèle |
| `reportController.js` | `departmentReport`, `payrollReport`, `leaveReport`, `projectReport`, `hrAnalytics` | Des requêtes d'agrégation : `GROUP BY`, `SUM`, `AVG`, `COUNT FILTER`, `to_char(date,'YYYY-MM')` pour grouper par mois, `age()` pour l'ancienneté |
| `notificationController.js` | notifications, annonces, `calendar` | Le calendrier rassemble en une réponse les événements, les congés approuvés, les évaluations planifiées et les échéances des dossiers de la période |
| `userController.js` | `listUsers`, `updateUser`, `activityLog` | L'administrateur ne peut pas modifier son propre rôle (pour ne pas se retirer ses droits par erreur) |

## 4.25 Les routes (`server/routes/`)

*`server/routes/leaveRoutes.js`, lignes 1 à 14 :*

```js
import { Router } from 'express';
import * as c from '../controllers/leaveController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', c.listLeaves);
router.get('/balance', c.getBalance);
router.post('/', c.applyLeave);
router.patch('/:id/review', c.reviewLeave); // HR/Admin or department manager (checked in controller)
router.patch('/:id/cancel', c.cancelLeave);

export default router;
```

- `Router()` : un mini-routeur, branché dans `server.js` sur `/api/leaves`.
- `router.use(protect)` : **toutes** les routes du fichier exigent d'être connecté.
- `router.get('/', c.listLeaves)` : `GET /api/leaves` appelle `listLeaves`.
- `/:id` : une partie variable ; dans le contrôleur, `req.params.id` vaut `12` pour `/api/leaves/12/review`.

*`server/routes/employeeRoutes.js`, lignes 1 à 16 :*

```js
import { Router } from 'express';
import * as c from '../controllers/employeeController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', c.listEmployees);
router.get('/me', c.getMe);
router.put('/me', c.updateMe);
router.get('/:id', c.getEmployee);
router.post('/', authorize('admin', 'hr'), c.createEmployee);
router.put('/:id', authorize('admin', 'hr'), c.updateEmployee);
router.delete('/:id', authorize('admin'), c.deleteEmployee);

export default router;
```

- `authorize('admin', 'hr')` placé **avant** le contrôleur : si le rôle ne convient pas, le contrôleur n'est jamais exécuté.
- **L'ordre compte** : `/me` est déclaré avant `/:id`. Sinon, Express croirait que `me` est un identifiant.

*`server/routes/authRoutes.js`, lignes 1 à 22 :*

```js
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { changePassword, login, me, register } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// Brute-force protection on credential endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 20),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Trop de tentatives, réessayez dans quelques minutes' },
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', protect, me);
router.put('/password', protect, changePassword);

export default router;
```

- `rateLimit` : 20 tentatives par tranche de 15 minutes et par adresse IP. Au-delà, erreur 429. Cela empêche de deviner un mot de passe en en essayant des milliers.

## 4.26 `server/utils/migrate.js` et `server/utils/seed.js`

*`server/utils/migrate.js`, lignes 1 à 12 :*

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/db.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** Apply db/schema.sql (idempotent). */
export const migrate = async () => {
  const sql = fs.readFileSync(path.join(dir, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
};
```

- `fileURLToPath(import.meta.url)` : en mode `module`, `__dirname` n'existe pas ; ces deux lignes retrouvent le dossier du fichier.
- `fs.readFileSync` lit `schema.sql`, et `pool.query(sql)` exécute tout le script d'un coup.

`seed.js` (données de démo) :
1. `migrate()` puis `TRUNCATE ... RESTART IDENTITY CASCADE` : vide toutes les tables et remet les compteurs d'id à 1.
2. Crée 7 départements, puis 16 agents à partir des tableaux `DEPARTMENTS` et `PEOPLE`.
3. Crée les comptes (mot de passe haché avec bcrypt) et désigne les responsables de département.
4. Génère 30 jours de pointages avec un générateur pseudo-aléatoire **déterministe** (`rnd`) : les mêmes données à chaque fois.
5. Ajoute des congés, deux mois de paie, des évaluations, les types de demande, les types de dépôt, les deux circuits et 9 dossiers avec leur historique.
6. `pool.end()` ferme les connexions, pour que le script se termine.

## 4.27 `server/tests/api.test.js`

```js
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

describe('attendance', () => {
  test('check-in once, duplicate refused', async () => {
    const first = await api('POST', '/attendance/check-in', {}, 'jean');
    assert.equal(first.status, 201);
    const dup = await api('POST', '/attendance/check-in', {}, 'jean');
    assert.equal(dup.status, 409);
  });
});
```
- `before` : avant tous les tests, crée les tables, vide la base de test, insère quelques données, démarre le serveur sur un port libre (`app.listen(0)`) et connecte 3 utilisateurs.
- `api(method, path, body, who)` : une petite fonction qui appelle le serveur avec le jeton de `who`.
- `assert.equal(a, b)` : le test échoue si `a` est différent de `b`.
- Le fichier s'arrête immédiatement si `TEST_DATABASE_URL` n'est pas défini, pour ne jamais vider la base de travail par erreur.

---

# Partie client (React)

## 4.28 Comment React fonctionne (le minimum à savoir)

- Un **composant** est une fonction qui renvoie du **JSX** (du HTML dans du JavaScript) :
```jsx
function Bonjour({ nom }) {          // { nom } = les "props" reçues du parent
  return <h1>Bonjour {nom}</h1>;      // {nom} insère une valeur JavaScript
}
// Utilisation : <Bonjour nom="Awa" />
```
- `useState` : une valeur qui, quand elle change, **redessine** le composant :
```jsx
const [count, setCount] = useState(0);   // valeur initiale 0
<button onClick={() => setCount(count + 1)}>{count}</button>
```
- `useEffect(fn, [deps])` : exécute `fn` après l'affichage, puis à chaque changement des dépendances. On s'en sert pour charger des données.
- **Contexte** (`createContext` + `useContext`) : partage une valeur (l'utilisateur connecté, le thème) avec tous les composants, sans la passer de parent en enfant.
- En JSX, on écrit `className` au lieu de `class`, et `onClick={fonction}` au lieu de `onclick="..."`.
- `{condition && <Composant />}` : affiche le composant seulement si la condition est vraie.
- `{liste.map((x) => <li key={x.id}>{x.nom}</li>)}` : affiche une liste. `key` aide React à reconnaître chaque élément.

## 4.29 `client/index.html`

*`client/index.html`, lignes 1 à 15 :*

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#1e40af" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>SIGRH – Ministère de la Fonction Publique</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/index.jsx"></script>
  </body>
</html>
```

- `lang="fr"` : la page est en français (utile aux lecteurs d'écran).
- `viewport` : indispensable pour que le site s'adapte aux téléphones.
- `manifest` : permet d'« installer » le site comme une application sur un téléphone (PWA).
- `<div id="root">` : React dessine toute l'application dans cette balise.
- `<script type="module" src="/src/index.jsx">` : le point de départ du code React.

## 4.30 `client/vite.config.js`

*`client/vite.config.js`, lignes 1 à 11 :*

```js
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development, /api is proxied to the Express server
    proxy: { '/api': 'http://localhost:5002' },
  },
});
```

- `plugins: [react()]` : permet à Vite de comprendre le JSX.
- `port: 5173` : l'adresse du site en développement.
- `proxy: { '/api': 'http://localhost:5002' }` : quand React appelle `/api/employees`, Vite transmet la requête au serveur Express. Le navigateur croit parler à une seule adresse, donc pas de problème de CORS en développement.

## 4.31 `client/src/index.jsx` — le point de départ

*`client/src/index.jsx`, lignes 1 à 22 :*

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
```

- `createRoot(...).render(...)` : affiche l'application dans `<div id="root">`.
- `StrictMode` : en développement, signale les erreurs courantes (il exécute certains effets deux fois exprès).
- Les fournisseurs sont **emboîtés** : chacun rend son contexte disponible pour tout ce qu'il contient.
  - `BrowserRouter` : la navigation par adresse ;
  - `ThemeProvider` : le thème clair ou sombre ;
  - `ToastProvider` : les messages de confirmation ;
  - `AuthProvider` : l'utilisateur connecté. Il est à l'intérieur de `ToastProvider` pour pouvoir, si besoin, afficher des messages.
- `import './index.css'` : le style global.

## 4.32 `client/src/services/api.js` — parler au serveur

*`client/src/services/api.js`, lignes 1 à 73 :*

```js
/** Thin fetch wrapper around the EMS REST API. */
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';
const TOKEN_KEY = 'ems_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const request = async (method, path, body, { raw = false } = {}) => {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Serveur injoignable. Vérifiez votre connexion.', 0);
  }

  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event('ems:logout'));
  }
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try { message = (await res.json()).message || message; } catch { /* not json */ }
    throw new ApiError(message, res.status);
  }
  if (raw) return res;
  return res.status === 204 ? null : res.json();
};

/** Build a query string, skipping empty values. */
export const qs = (params = {}) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return s ? `?${s}` : '';
};

/** Download a binary endpoint (PDF…) as a file. */
export const download = async (path, fallbackName = 'document.pdf') => {
  const res = await request('GET', path, undefined, { raw: true });
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = match ? decodeURIComponent(match[1]) : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b = {}) => request('PUT', p, b),
  patch: (p, b = {}) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
};

export default api;
```

- `BASE` : en développement, `VITE_API_URL` est vide, donc les appels vont vers `/api` (le proxy de Vite). En production, on met l'adresse du serveur en ligne. Les variables lues par Vite doivent commencer par `VITE_`.
- `getToken` / `setToken` : le jeton est gardé dans `localStorage`, ce qui permet de rester connecté après avoir rechargé la page.
- `request` : la fonction centrale :
  1. ajoute l'en-tête `Authorization: Bearer <jeton>` ;
  2. ajoute `Content-Type: application/json` quand il y a un corps ;
  3. `fetch(...)` envoie la requête ; si le serveur est éteint, `fetch` échoue et on affiche « Serveur injoignable » ;
  4. si la réponse est 401 alors qu'on avait un jeton, celui-ci a expiré : on le supprime et on émet l'événement `ems:logout`, que `AuthContext` écoute pour renvoyer vers la page de connexion ;
  5. si la réponse n'est pas « ok » (code ≥ 400), on lance une `ApiError` avec le message envoyé par le serveur ;
  6. sinon, on renvoie le JSON.
- `qs({ page: 2, q: 'awa', status: '' })` → `?page=2&q=awa` : fabrique les paramètres d'adresse en ignorant les valeurs vides.
- `download(path)` : pour les PDF. On récupère le fichier en mémoire (`blob`), on crée un lien invisible, on clique dessus par programme, puis on le supprime. On ne peut pas utiliser un simple lien `<a href>`, car il faut envoyer le jeton dans l'en-tête.
- `api.get('/employees')`, `api.post('/leaves', {...})` : les raccourcis utilisés dans toutes les pages.

## 4.33 `client/src/context/AuthContext.jsx` — l'utilisateur connecté

*`client/src/context/AuthContext.jsx`, lignes 1 à 68 :*

```jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { getToken, setToken } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    try {
      const { user: u } = await api.get('/auth/me');
      setUser(u);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onLogout = () => setUser(null);
    window.addEventListener('ems:logout', onLogout);
    return () => window.removeEventListener('ems:logout', onLogout);
  }, [refresh]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const register = async (data) => {
    const res = await api.post('/auth/register', data);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const value = useMemo(() => {
    const isHR = user?.role === 'admin' || user?.role === 'hr';
    return {
      user,
      loading,
      login,
      register,
      logout,
      refresh,
      isAdmin: user?.role === 'admin',
      isHR,
      isManager: (user?.managedDepartments?.length ?? 0) > 0,
      canManage: isHR || (user?.managedDepartments?.length ?? 0) > 0,
    };
  }, [user, loading, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
```

- `user` : l'utilisateur connecté, ou `null`.
- `loading` : vrai tant qu'on ne sait pas encore si le jeton enregistré est valable. Pendant ce temps, on affiche « Chargement… » au lieu de renvoyer trop tôt vers la page de connexion.
- `refresh` : appelle `/auth/me`. `useCallback` garde la même fonction d'un affichage à l'autre.
- `useEffect(() => {...}, [refresh])` : au démarrage, vérifie le jeton et écoute `ems:logout`. La fonction renvoyée (`return () => ...`) retire l'écouteur quand le composant disparaît.
- `login` / `register` : appellent l'API, enregistrent le jeton et l'utilisateur.
- `logout` : efface le jeton ; l'utilisateur étant `null`, `App.jsx` renvoie vers `/login`.
- `useMemo` : calcule `isAdmin`, `isHR`, `isManager` et `canManage` une seule fois par changement d'utilisateur.
- `useAuth()` : ce que les pages appellent, par exemple `const { user, isHR } = useAuth();`.

## 4.34 `ThemeContext.jsx` et `ToastContext.jsx`

*`client/src/context/ThemeContext.jsx`, lignes 1 à 22 :*

```jsx
import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('ems_theme')
        || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } catch { return 'light'; }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('ems_theme', theme); } catch { /* ignore */ }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
```

- Au démarrage, on lit le choix enregistré ; sinon, on suit le réglage du système (`prefers-color-scheme: dark`).
- `document.documentElement.dataset.theme = theme` ajoute `data-theme="dark"` sur la balise `<html>`. Le CSS change alors toutes les couleurs (4.39).
- Les `try/catch` évitent une erreur si le navigateur bloque `localStorage` (navigation privée).

`ToastContext.jsx` : `toast.success('Enregistré')` ajoute un message dans une liste ; `setTimeout(..., 4000)` le retire après 4 secondes. Les messages s'affichent en bas à droite.

## 4.35 `client/src/utils/useFetch.js` — charger des données

*`client/src/utils/useFetch.js`, lignes 1 à 26 :*

```js
import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';

/** GET `path` and expose { data, loading, error, reload }. Pass null to skip. */
export default function useFetch(path, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.get(path));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, setData, loading, error, reload: load };
}
```

- Un **hook personnalisé** : une fonction qui commence par `use` et utilise d'autres hooks.
- Utilisation dans une page : `const { data, loading, error, reload } = useFetch('/departments');`.
- Quand `path` change (par exemple quand on change un filtre), `load` change et `useEffect` recharge automatiquement.
- Passer `null` comme adresse n'appelle rien. C'est utile pour charger une donnée seulement si l'utilisateur en a le droit : `useFetch(isHR ? '/departments' : null)`.
- `reload()` : recharge après une modification.

## 4.36 `client/src/utils/format.js`

*`client/src/utils/format.js`, lignes 1 à 31 :*

```js
export const CURRENCY = import.meta.env.VITE_CURRENCY || 'FCFA';

export const money = (n) =>
  `${Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${CURRENCY}`;

export const date = (d) => {
  if (!d) return '—';
  const v = typeof d === 'string' && d.length === 10 ? new Date(`${d}T00:00:00`) : new Date(d);
  return v.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const time = (d) => (d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—');

export const dateTime = (d) => (d ? `${date(d)} ${time(d)}` : '—');

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août',
  'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export const ROLE_LABELS = { admin: 'Administrateur', hr: 'Ressources Humaines', employee: 'Agent' };

export const LEAVE_TYPES = {
  casual: 'Congé occasionnel',
  sick: 'Congé maladie',
  paid: 'Congé payé (annuel)',
  unpaid: 'Congé sans solde',
};
```

- `money(1250000)` → `1 250 000 FCFA` grâce à `toLocaleString('fr-FR')`.
- `date('2026-09-23')` → `23 sept. 2026`. On ajoute `T00:00:00` pour que la date soit interprétée en heure locale.
- `LEAVE_STATUS`, `PROJECT_STATUS`… : pour chaque valeur stockée en base (`pending`), le libellé affiché (« En attente ») et la couleur du badge (`warning`). Un seul endroit à modifier pour changer un libellé.
- `exportCSV` (plus bas dans le fichier) : fabrique un fichier CSV. Le séparateur `;` et le caractère `﻿` en début de fichier permettent à Excel d'ouvrir correctement les accents.

## 4.37 `client/src/App.jsx` — les routes

*`client/src/App.jsx`, lignes 1 à 62 :*

```jsx
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { Loader } from './components/ui';
import { useAuth } from './context/AuthContext';
import Dashboard from './dashboard/Dashboard';
import Announcements from './pages/Announcements';
import Attendance from './pages/Attendance';
import Departments from './pages/Departments';
import EmployeeDetail from './pages/EmployeeDetail';
import Employees from './pages/Employees';
import Leaves from './pages/Leaves';
import Login from './pages/Login';
import Payroll from './pages/Payroll';
import Performance from './pages/Performance';
import Profile from './pages/Profile';
import ProjectDetail from './pages/ProjectDetail';
import Projects from './pages/Projects';
import ProjectSettings from './pages/ProjectSettings';
import Register from './pages/Register';
import Reports from './pages/Reports';
import Users from './pages/Users';

function RequireAuth({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen"><Loader /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen"><Loader /></div>;
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="employees" element={<Employees />} />
        <Route path="employees/:id" element={<EmployeeDetail />} />
        <Route path="departments" element={<Departments />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="leaves" element={<Leaves />} />
        <Route path="payroll" element={<Payroll />} />
        <Route path="performance" element={<Performance />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="projects-settings" element={<RequireAuth roles={['admin', 'hr']}><ProjectSettings /></RequireAuth>} />
        <Route path="reports" element={<RequireAuth roles={['admin', 'hr']}><Reports /></RequireAuth>} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="users" element={<RequireAuth roles={['admin']}><Users /></RequireAuth>} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

- `RequireAuth` : un composant « garde ». Pendant le chargement, il affiche un indicateur ; sans utilisateur, il redirige vers `/login` ; avec `roles`, il redirige vers l'accueil si le rôle ne convient pas.
- `PublicOnly` : un utilisateur déjà connecté qui ouvre `/login` est renvoyé vers le tableau de bord.
- `<Route element={<RequireAuth><Layout /></RequireAuth>}>` : une route « parente » sans adresse. Toutes les routes à l'intérieur sont protégées et affichées **dans** `Layout` (menu + barre du haut), à l'endroit du `<Outlet />`.
- `index` : la page de `/`.
- `employees/:id` : `:id` est lu dans la page avec `const { id } = useParams();`.
- `path="*"` : toute adresse inconnue renvoie vers l'accueil.
- **Important** : masquer une page dans le menu ne suffit pas à la protéger. La vraie protection est sur le serveur (`authorize`) ; le client ne fait qu'éviter d'afficher des écrans inutiles.

## 4.38 Les composants

### `components/ui.jsx` — les briques réutilisables
*`client/src/components/ui.jsx`, lignes 24 à 50 :*

```jsx
export const Modal = ({ title, onClose, children, footer, wide }) => {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
};

export const Field = ({ label, children, hint, full }) => (
  <label className={`field ${full ? 'field-full' : ''}`}>
    <span>{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>
);
```

- `Modal` : une fenêtre par-dessus la page. `useEffect` écoute la touche Échap pour la fermer. `onMouseDown` sur le fond ferme la fenêtre seulement si on clique à côté (`e.target === e.currentTarget`).
- `role="dialog"` et `aria-modal` : pour les lecteurs d'écran.
- Les autres briques du fichier : `Badge` (étiquette colorée), `Loader`, `ErrorBox`, `Empty`, `Field` (étiquette + champ), `StatCard` (carte chiffre clé), `PageHeader`, `Pagination`, `Tabs` (onglets), `Avatar` (initiales sur une couleur calculée à partir du nom) et trois graphiques **sans bibliothèque** :
  - `BarChart` : barres horizontales ; la largeur de chaque barre = `valeur / maximum × 100 %` ;
  - `ColumnChart` : colonnes verticales, avec une ou deux séries ;
  - `Donut` : un cercle SVG ; chaque part est un `<circle>` dont `strokeDasharray` dessine la longueur voulue.

### `components/Layout.jsx` — le cadre de l'application
*`client/src/components/Layout.jsx`, lignes 13 à 30 :*

```jsx
const NAV = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { section: 'Gestion du personnel' },
  { to: '/employees', label: 'Employés', icon: Users },
  { to: '/departments', label: 'Départements', icon: Building2 },
  { to: '/attendance', label: 'Présences', icon: Clock },
  { to: '/leaves', label: 'Congés', icon: CalendarDays },
  { to: '/payroll', label: 'Paie', icon: Wallet },
  { to: '/performance', label: 'Performance', icon: Target },
  { section: 'Projets & dossiers' },
  { to: '/projects', label: 'Dossiers', icon: FolderKanban },
  { to: '/projects-settings', label: 'Circuit & paramètres', icon: Settings2, roles: ['admin', 'hr'] },
  { section: 'Organisation' },
  { to: '/reports', label: 'Rapports', icon: BarChart3, roles: ['admin', 'hr'] },
  { to: '/announcements', label: 'Annonces & calendrier', icon: Megaphone },
  { to: '/users', label: 'Comptes & audit', icon: ShieldCheck, roles: ['admin'] },
  { to: '/profile', label: 'Mon espace', icon: UserCircle },
];
```

- `NAV` : la liste du menu. `roles` limite une entrée à certains rôles ; `section` crée un titre de groupe.
- `NAV.filter((n) => !n.roles || n.roles.includes(user.role))` : garde les entrées autorisées.
- `NavLink` ajoute la classe `active` à la page ouverte.
- `NotificationBell` : charge `/notifications` au démarrage puis toutes les 30 s (`setInterval`). Un clic sur une notification la marque comme lue et ouvre la page liée (`navigate(n.link)`).
- Sur mobile, le menu est caché ; le bouton ☰ l'ouvre (état `menuOpen`) et il se referme à chaque changement de page.
- `<Outlet />` : l'endroit où s'affiche la page courante.

### `components/CheckInCard.jsx` — le pointage
*`client/src/components/CheckInCard.jsx`, lignes 8 à 48 :*

```jsx
/**
 * Ask the browser for the GPS position (mobile attendance). Resolves null if refused/unavailable.
 * The browser's own timeout does not run while the permission prompt is open, hence the extra guard.
 */
const getPosition = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  const guard = setTimeout(() => resolve(null), 10000);
  navigator.geolocation.getCurrentPosition(
    (p) => { clearTimeout(guard); resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }); },
    () => { clearTimeout(guard); resolve(null); },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
  return null;
});

export default function CheckInCard({ onChange }) {
  const toast = useToast();
  const [record, setRecord] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    api.get('/attendance/today').then(setRecord).catch(() => setRecord(null));
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const act = async (kind) => {
    setBusy(true);
    try {
      const body = kind === 'check-in' ? (await getPosition()) || {} : {};
      const r = await api.post(`/attendance/${kind}`, body);
      setRecord(r);
      toast.success(kind === 'check-in' ? 'Arrivée enregistrée' : 'Départ enregistré');
      onChange?.();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
```

- `getPosition` : demande la position GPS au navigateur. On la transforme en `Promise` pour pouvoir écrire `await`. Si l'utilisateur refuse ou ne répond pas dans les 10 s (`guard`), on continue sans GPS : le pointage n'est jamais bloqué.
- `record === undefined` : pas encore chargé ; `null` : pas encore pointé aujourd'hui.
- `act('check-in')` : récupère la position, appelle l'API, met à jour l'affichage et affiche un message. `onChange?.()` prévient la page parente (le `?.` n'appelle la fonction que si elle existe).
- L'affichage dépend de l'état : bouton « Pointer l'arrivée », puis « Pointer le départ », puis « Journée terminée ».

### Les autres composants
| Fichier | Rôle |
| --- | --- |
| `EmployeeForm.jsx` | Fenêtre de création ou de modification d'un employé. `useState(() => ...)` prépare le formulaire à partir de l'employé existant. La case « Créer aussi un compte » affiche le mot de passe initial et le rôle (modifiable seulement par l'admin) |
| `ProjectForm.jsx` | Fenêtre d'enregistrement d'un dossier. Quand on choisit un type de demande, son délai et ses pièces requises s'affichent |
| `InsightsPanel.jsx` | Affiche le score de performance, les indicateurs et les recommandations de `/performance/insights/:id` |

## 4.39 Les pages (lecture par blocs)

Toutes les pages suivent **le même modèle** :

```jsx
export default function Departments() {
  const { isHR } = useAuth();                              // 1. qui est connecté ?
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/departments');  // 2. charger
  const [editing, setEditing] = useState(null);            // 3. état local (fenêtre ouverte…)

  const remove = async (d) => {                            // 4. actions
    if (!window.confirm('Supprimer ?')) return;
    try { await api.del(`/departments/${d.id}`); toast.success('Supprimé'); reload(); }
    catch (err) { toast.error(err); }
  };

  return (                                                 // 5. affichage
    <>
      <PageHeader title="Départements">
        {isHR && <button onClick={() => setEditing({})}>Nouveau</button>}
      </PageHeader>
      {loading && <Loader />}
      {data?.map((d) => <div key={d.id} className="card">{d.name}</div>)}
      {editing && <DepartmentForm ... onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}
```
1. **Qui** : `useAuth()` pour afficher ou masquer les boutons selon le rôle.
2. **Charger** : `useFetch(adresse)`. Si l'adresse contient les filtres (`/employees?q=...`), la liste se recharge seule quand un filtre change.
3. **État local** : quelle fenêtre est ouverte, quel onglet est actif, les valeurs d'un formulaire.
4. **Actions** : `try { await api.xxx(); toast.success(); reload(); } catch (err) { toast.error(err); }`.
5. **Affichage** : `data?.map(...)`. Le `?.` évite une erreur tant que `data` vaut `null`.

**Formulaire contrôlé** (dans toutes les fenêtres) :
```jsx
const [form, setForm] = useState({ name: '', budget: 0 });
const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
<input value={form.name} onChange={set('name')} />
```
- `set('name')` renvoie une fonction qui met à jour **seulement** le champ `name`. `...form` recopie les autres champs.

Particularités de chaque page :

| Page | Ce qu'il faut remarquer |
| --- | --- |
| `Login.jsx` | `ROLES` : trois cartes ; un clic remplit l'email et le mot de passe (`pickRole`). `e.preventDefault()` empêche le formulaire de recharger la page |
| `Register.jsx` | Vérifie que les deux mots de passe sont identiques avant l'envoi. `const { confirm, ...data } = form` retire le champ de confirmation |
| `dashboard/Dashboard.jsx` | Choisit `AdminDashboard` (RH, admin, chef de service) ou `EmployeeDashboard` |
| `AdminDashboard.jsx` | Cartes de chiffres (`StatCard` cliquables avec `navigate`), graphiques, activités récentes |
| `Employees.jsx` | Les filtres sont dans un état ; un `setTimeout` de 300 ms (**debounce**) évite d'interroger le serveur à chaque lettre tapée. Vue tableau ou cartes (`.employee-card`), export CSV |
| `EmployeeDetail.jsx` | Onglets ; chaque onglet charge ses données seulement quand il est ouvert (`useFetch(tab === 'leaves' ? ... : null)`) |
| `Attendance.jsx` | Trois onglets : mon pointage, l'équipe, le rapport mensuel. `ManualEntry` convertit l'heure saisie (`08:30`) en date complète avec `new Date(date + 'T' + heure)` |
| `Leaves.jsx` | `countWorkingDays` affiche le nombre de jours avant l'envoi (le serveur recalcule quand même). Boutons Approuver / Rejeter seulement pour les demandes des autres |
| `Payroll.jsx` | `GenerateModal` : une ligne par agent pour saisir primes et retenues, stockées dans un objet `{ idAgent: montant }`. `SlipModal` : détail du bulletin |
| `Performance.jsx` | `Stars` : 5 étoiles ; `ReviewCard` : l'agent coche ses objectifs ; le curseur `range` change l'avancement |
| `Projects.jsx` | Les filtres sont **dans l'adresse** (`useSearchParams`) : on peut partager ou recharger une recherche. Un clic sur une ligne ouvre le dossier |
| `ProjectDetail.jsx` | `ACTIONS` décrit chaque bouton (libellé, icône, commentaire obligatoire ou non, choix d'agent). `available` calcule les boutons autorisés selon le statut, l'étape et `permissions`. Le **stepper** colore les étapes : faite ✓, en cours, à venir. `upload` lit le fichier avec `FileReader.readAsDataURL` (base64) |
| `ProjectSettings.jsx` | Éditeur de circuit : ajouter, supprimer et déplacer (↑ ↓) des étapes, puis tout envoyer en une fois |
| `Reports.jsx` | Un sous-composant par onglet ; chacun charge son rapport. `window.print()` imprime (le CSS `@media print` masque le menu) |
| `Announcements.jsx` | `Calendar` : une grille de 42 cases (6 semaines × 7 jours) qui commence le lundi précédant le 1ᵉʳ du mois |
| `Users.jsx` | Changement de rôle par liste déroulante, activation par case à cocher |
| `Profile.jsx` | Libre-service : coordonnées et changement de mot de passe |

## 4.40 `client/src/index.css` — le style

*`client/src/index.css`, lignes 2 à 28 :*

```css
:root {
  --bg: #f1f5f9;
  --surface: #ffffff;
  --surface-2: #f8fafc;
  --border: #e2e8f0;
  --text: #0f172a;
  --muted: #64748b;
  --primary: #1e40af;
  --primary-2: #2563eb;
  --primary-soft: #dbeafe;
  --success: #15803d;
  --success-soft: #dcfce7;
  --warning: #b45309;
  --warning-soft: #fef3c7;
  --danger: #b91c1c;
  --danger-soft: #fee2e2;
  --info: #0369a1;
  --info-soft: #e0f2fe;
  --purple: #7c3aed;
  --purple-soft: #ede9fe;
  --gold: #f59e0b;
  --radius: 12px;
  --shadow: 0 1px 2px rgb(15 23 42 / 0.06), 0 4px 12px rgb(15 23 42 / 0.04);
  --sidebar: #0f1e46;
  --sidebar-text: #cbd5e1;
  color-scheme: light;
}
```

- `:root { --primary: ... }` : des **variables CSS**. Partout ailleurs, on écrit `color: var(--primary)`.
- `[data-theme='dark'] { --bg: #0b1120; ... }` : en mode sombre, on redéfinit seulement les variables. Tout le site change de couleurs sans autre modification.
- `.tone-success { --tone: #16a34a; }` : une classe qui choisit une couleur, réutilisée par les cartes, les barres et les graphiques (`background: var(--tone)`).
- `display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr))` : autant de colonnes que la largeur le permet, chacune d'au moins 210 px. C'est ce qui rend les cartes responsive.

L'exemple du cahier des charges, et le responsive :

*`client/src/index.css`, lignes 451 à 460 :*

```css
@media (max-width: 768px) {
  .employee-card { width: 100%; }
  .only-mobile { display: inline-grid; }
  .hide-mobile { display: none !important; }
  .sidebar { position: fixed; left: 0; top: 0; z-index: 60; transform: translateX(-100%); transition: transform 0.2s; box-shadow: 0 0 40px rgb(0 0 0 / 0.4); }
  .sidebar.open { transform: none; }
  .sidebar-backdrop { display: block; position: fixed; inset: 0; background: rgb(0 0 0 / 0.45); z-index: 55; }
  .content { padding: 1rem; }
  .topbar { padding: 0.5rem 0.75rem; }
  .card { padding: 0.9rem; }
```

- `@media (max-width: 768px) { ... }` : ces règles ne s'appliquent que sur les écrans de moins de 768 px (téléphones) : `.employee-card` prend toute la largeur, le menu devient un tiroir (`transform: translateX(-100%)`), les statistiques passent sur deux colonnes.
- `@media print` : à l'impression, on masque le menu, les boutons et les onglets.

## 4.41 `.github/workflows/ci.yml` — l'intégration continue

*`.github/workflows/ci.yml`, lignes 1 à 35 :*

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  server:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: ems
          POSTGRES_PASSWORD: ems
          POSTGRES_DB: ems_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
    defaults:
      run:
        working-directory: server
    env:
      TEST_DATABASE_URL: postgresql://ems:ems@localhost:5432/ems_test
      JWT_SECRET: ci_secret_value_for_tests_only
      TZ: Africa/Dakar
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: server/package-lock.json
      - run: npm ci
      - run: npm test
```

- `on: push` : s'exécute à chaque envoi sur GitHub.
- `services: postgres` : GitHub démarre une base PostgreSQL temporaire pour les tests.
- `steps` : récupérer le code (`checkout`), installer Node 22, `npm ci` (installation exacte d'après `package-lock.json`), puis `npm test`.
- Le job `client` fait `npm run build` : si le code React contient une erreur, la construction échoue et GitHub affiche une croix rouge.

---
Projet SIGRH (EMS) — documentation.
