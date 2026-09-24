# Document 4 — Commandes et code expliqués pas à pas

Ce document explique **chaque commande** utilisée dans le projet, puis **les morceaux de code essentiels** du SIGRH, ligne par ligne.
Lisez-le avec le code ouvert dans VS Code à côté.

---

## Partie 1 — Les commandes

### 1.1 Git (gestion des versions)

| Commande | Ce qu’elle fait |
|---|---|
| `git clone https://github.com/Aeysha2/EMS.git` | Télécharge le dépôt dans un dossier `EMS` |
| `git checkout sigrh-senegal` | Se place sur la branche du SIGRH (le code change dans le dossier) |
| `git branch` | Liste les branches ; l’étoile indique la branche courante |
| `git status` | Montre les fichiers modifiés, ajoutés, supprimés |
| `git add -A` | Prépare **toutes** les modifications pour le prochain commit |
| `git commit -m "message"` | Enregistre un instantané du projet avec un message |
| `git push -u origin sigrh-senegal` | Envoie la branche sur GitHub (`-u` mémorise la destination pour les prochains `git push`) |
| `git pull` | Récupère les modifications publiées par les autres |
| `git log --oneline` | Historique des commits, un par ligne |
| `git checkout -b ma-branche` | Crée une nouvelle branche et s’y place |

### 1.2 npm (Node Package Manager)

| Commande | Ce qu’elle fait |
|---|---|
| `npm init -y` | Crée un `package.json` avec les valeurs par défaut |
| `npm install express pg …` | Télécharge des bibliothèques dans `node_modules/` et les note dans `dependencies` |
| `npm install -D nodemon` | Idem, mais dans `devDependencies` (outil de développement seulement) |
| `npm run install-all` | Script du `package.json` racine : `npm --prefix server install && npm --prefix client install` |
| `npm run server` | Lance `nodemon server.js` dans `server/` : l’API redémarre à chaque sauvegarde |
| `npm run client` | Lance `vite` dans `client/` : serveur de développement avec rechargement instantané |
| `npm run seed` | Exécute `node utils/seed.js` : vide la base et charge les données de démonstration |
| `npm test` | Exécute `node --test --test-concurrency=1 tests/*.test.js` |
| `npm run build` | Produit la version optimisée du frontend dans `client/dist/` |

`--prefix server` signifie « exécute la commande comme si j’étais dans le dossier `server` ».
`--test-concurrency=1` lance les fichiers de test l’un après l’autre, car ils partagent la même base.

### 1.3 PostgreSQL en ligne de commande (facultatif si vous utilisez pgAdmin)

| Commande | Ce qu’elle fait |
|---|---|
| `createdb sigrh` | Crée la base `sigrh` |
| `psql sigrh` | Ouvre une console SQL sur la base |
| `\dt` | (dans psql) liste les tables |
| `\d employees` | (dans psql) décrit les colonnes de la table `employees` |
| `\q` | quitte psql |
| `pg_dump sigrh > sauvegarde.sql` | Sauvegarde complète de la base dans un fichier |
| `psql sigrh < sauvegarde.sql` | Restaure une sauvegarde |

### 1.4 Tester l’API sans Postman (curl)

```bash
# Santé de l’API
curl http://localhost:5002/api/health

# Connexion : renvoie un jeton (token)
curl -X POST http://localhost:5002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"drh.mfp@sigrh.test","password":"Sigrh@2026!"}'

# Appel protégé : remplacer <TOKEN>
curl http://localhost:5002/api/employees -H "Authorization: Bearer <TOKEN>"

# Appel d’un système partenaire avec une clé d’API
curl http://localhost:5002/api/interop/v1/structures -H "X-API-Key: sigrh_demo_men_2026"
```

`-X POST` choisit la méthode HTTP, `-H` ajoute un en-tête, `-d` envoie un corps de requête.

---

## Partie 2 — Le code du serveur

### 2.1 `server/config/db.js` — la connexion à PostgreSQL

```js
pg.types.setTypeParser(1082, (v) => v);
```
Le type n° 1082 est `DATE`. Par défaut, `pg` le transforme en objet `Date` JavaScript, ce qui peut décaler d’un jour à cause des fuseaux horaires.
On garde donc le texte `'2026-09-24'` tel quel.

```js
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
pg.types.setTypeParser(20, (v) => parseInt(v, 10));
```
1700 = `NUMERIC` (salaires), 20 = `BIGINT` (résultat de `COUNT(*)`). Sans cela, `pg` renverrait des chaînes de caractères.

```js
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
```
Un **pool** garde jusqu’à 10 connexions ouvertes et les réutilise : ouvrir une connexion à chaque requête serait lent.

```js
export const withTransaction = async (fn) => {
  const client = await pool.connect();       // on réserve UNE connexion
  try {
    await client.query('BEGIN');             // début de transaction
    const result = await fn(client);         // toutes les requêtes passent par ce client
    await client.query('COMMIT');            // tout est validé d’un coup
    return result;
  } catch (err) {
    await client.query('ROLLBACK');          // en cas d’erreur, rien n’est enregistré
    throw err;
  } finally {
    client.release();                        // on rend la connexion au pool
  }
};
```
Exemple d’usage : valider une mutation modifie l’agent, ses affectations, sa carrière et la demande. Soit **tout** est enregistré, soit **rien**.

### 2.2 `server/server.js` — le point d’entrée

```js
import 'dotenv/config';
```
Lit le fichier `.env` et remplit `process.env` (ex. `process.env.DATABASE_URL`).

```js
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) { … process.exit(1); }
```
Sans secret, n’importe qui pourrait fabriquer un jeton : le serveur refuse de démarrer.

```js
app.use(helmet(…));                 // en-têtes HTTP de sécurité
app.use(cors({ origin: … }));       // seul le frontend déclaré dans CLIENT_URL peut appeler l’API
app.use(express.json({ limit: '8mb' }));  // lit les corps JSON (pièces jointes en base64 : 8 Mo max)
app.use(sanitizeBody);              // retire les clés dangereuses (__proto__…) des corps JSON
```

```js
app.use('/api/auth', authRoutes);
app.use('/api/interop/v1', partnerRouter);
…
app.use(notFound);
app.use(errorHandler);
```
Chaque module a son **routeur**. L’ordre compte : les routes d’abord, puis la gestion des routes inconnues (404) et des erreurs.

```js
migrate().then(() => { app.listen(PORT, …); scheduleAlerts(); })
```
Au démarrage : on applique le schéma SQL, puis on écoute le port, puis on lance la vérification horaire des délais.

### 2.3 `server/middleware/auth.js` — qui êtes-vous, que pouvez-vous faire ?

#### Le contexte de l’utilisateur
```sql
SELECT u.id, u.role, u.employee_id, s.institution_id, …,
       (SELECT COALESCE(array_agg(h.id), '{}') FROM structures h
         WHERE h.head_agent_id = u.employee_id) AS headed_structures
  FROM users u LEFT JOIN structures s ON s.id = u.structure_id …
```
- `institution_id` : l’institution (Présidence, SGG ou ministère) de la structure de rattachement. C’est **le périmètre** d’une DRH.
- `headed_structures` : les structures dont l’agent est le responsable (`head_agent_id`). `array_agg` regroupe les identifiants dans un tableau.

```js
user.managed_structures = user.headed_structures.length ? await subtreeIds(user.headed_structures) : [];
user.isChef = user.managed_structures.length > 0;
```
Un directeur dirige aussi les services placés sous sa direction : on calcule tout le **sous-arbre** (voir 2.5). On n’a pas besoin d’un rôle « chef » : il est **déduit de l’organigramme**. Nommer quelqu’un à la tête d’une structure lui donne automatiquement les droits correspondants.

#### Le contrôle de chaque requête (`protect`)
```js
const token = header.startsWith('Bearer ') ? header.slice(7) : null;
payload = jwt.verify(token, process.env.JWT_SECRET);
```
Le jeton est envoyé dans l’en-tête `Authorization: Bearer <jeton>`. `jwt.verify` vérifie la signature et la date d’expiration.

```js
if (payload.purpose === 'mfa') throw new AppError('Code de double authentification requis', 401);
```
Le jeton provisoire remis entre le mot de passe et le code 2FA ne donne accès à rien d’autre.

```js
const user = await loadUserContext(payload.id);
if (!user || !user.is_active) throw …
```
On **relit l’utilisateur en base à chaque requête** : un compte désactivé ou dont le rôle a changé perd ses droits immédiatement, même si son jeton est encore valide.

```js
if (mfaRequired() && PRIVILEGED_ROLES.includes(user.role) && !user.totp_enabled && !isMfaRoute) {
  err.code = 'MFA_SETUP_REQUIRED'; throw err;
}
```
Un profil DRH, pilotage ou DSI sans 2FA ne peut appeler que les routes `/api/auth/*` (pour activer sa 2FA). Le frontend reconnaît le code `MFA_SETUP_REQUIRED` et affiche l’écran d’activation.

#### Le niveau d’accès à un dossier
```js
export const accessLevel = (user, emp) => {
  if (user.employee_id === emp.id) return 'full';                                    // son propre dossier
  if (isGestionnaire(user) && user.institution_id === emp.institution_id) return 'full'; // DRH de la même institution
  if (user.managed_structures.includes(emp.structure_id)) return 'team';             // son chef
  return 'public';                                                                    // annuaire
};
```
`models/Employee.js` (`shapeEmployee`) retire ensuite les champs non autorisés : un chef ne voit ni le NIN ni le salaire, l’annuaire ne montre que le nom, la fonction, la structure et l’email professionnel.

### 2.4 `server/controllers/authController.js` — connexion en deux temps

```js
const ok = user && (await bcrypt.compare(password, user.password_hash));
if (!ok) { await logActivity(…'Échec de connexion'…); throw new AppError('Email ou mot de passe incorrect', 401); }
```
`bcrypt.compare` compare le mot de passe saisi avec son empreinte. On ne dit jamais si c’est l’email ou le mot de passe qui est faux (cela aiderait un attaquant). Chaque échec est journalisé.

```js
if (user.totp_enabled) return res.json({ mfa_required: true, mfa_token: signMfaToken(user) });
```
Si la 2FA est active, on ne remet **pas** le vrai jeton, seulement un jeton provisoire de 5 minutes.

```js
// POST /api/auth/mfa/verify
payload = jwt.verify(mfaToken, process.env.JWT_SECRET);
assert(payload.purpose === 'mfa', …);
if (!verifyTotp(decrypt(user.totp_secret_enc), code)) throw …
res.json({ token: signToken(user), user: … });
```
On déchiffre le secret TOTP de l’utilisateur, on vérifie le code à 6 chiffres, puis on remet le jeton de session (8 h).

### 2.5 `server/models/Structure.js` — parcourir l’organigramme

```sql
WITH RECURSIVE t AS (
  SELECT id FROM structures WHERE id = ANY($1)          -- point de départ : la ou les structures
  UNION SELECT s.id FROM structures s JOIN t ON s.parent_id = t.id   -- on ajoute les enfants, puis les enfants des enfants…
) SELECT id FROM t
```
Une **requête récursive** : PostgreSQL répète la seconde partie tant qu’elle trouve de nouvelles lignes. On obtient une direction et tous ses services et bureaux, quelle que soit la profondeur.

`ancestors` fait l’inverse (`JOIN t ON s.id = t.parent_id`) : on remonte de la structure de l’agent jusqu’à la racine. Cela sert à trouver son chef, puis le chef de son chef.

### 2.6 `server/utils/crypto.js` — chiffrement et 2FA

#### Chiffrer le NIN (AES-256-GCM)
```js
const iv = crypto.randomBytes(12);                                  // valeur aléatoire différente à chaque chiffrement
const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
```
- AES-256 : algorithme de chiffrement standard, clé de 32 octets (`DATA_ENCRYPTION_KEY`).
- GCM : ajoute une **étiquette d’authentification** (`authTag`) : si quelqu’un modifie le texte chiffré, le déchiffrement échoue.
- Le résultat stocké ressemble à `v1:iv:tag:données`. Le `v1` permettra de changer d’algorithme plus tard.

#### Détecter les doublons sans déchiffrer (index aveugle)
```js
export const blindIndex = (value) =>
  crypto.createHmac('sha256', key()).update(`idx:${normalized}`).digest('hex');
```
Le chiffrement produit un résultat différent à chaque fois (IV aléatoire) : on ne peut pas chercher « ce NIN existe-t-il déjà ? ».
On stocke donc aussi une **empreinte HMAC**, toujours identique pour un même NIN, dans `nin_hash` (colonne `UNIQUE`). Sans la clé, cette empreinte est inexploitable.

#### Le code à 6 chiffres (TOTP, RFC 6238)
```js
counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / step)));   // numéro de la tranche de 30 secondes
const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
const offset = hmac[hmac.length - 1] & 0xf;                          // position choisie par le dernier octet
const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;   // 6 derniers chiffres
```
Le téléphone et le serveur partagent un secret (transmis une fois par le QR code). Chacun calcule le même code à partir de l’heure.
`verifyTotp` accepte aussi la tranche précédente et la suivante (±30 s) pour tolérer un léger décalage d’horloge,
et compare avec `timingSafeEqual` pour ne pas révéler d’information par le temps de réponse.

### 2.7 `server/utils/audit.js` et le déclencheur SQL — un journal inaltérable

```js
await client.query('SELECT pg_advisory_xact_lock(424242)');           // une seule écriture du journal à la fois
const prev = (SELECT hash FROM activity_logs ORDER BY id DESC LIMIT 1) || '000…0';
const hash = sha256([prev, user_id, action, entity, entity_id, details, ip, created_at].join('|'));
INSERT INTO activity_logs (…, prev_hash, hash, …)
```
Chaque ligne contient l’empreinte de la précédente : c’est une **chaîne**. Modifier une ancienne ligne change son empreinte, qui ne correspond plus au `prev_hash` de la ligne suivante.
Le verrou garantit que deux actions simultanées ne s’accrochent pas au même maillon.

```sql
CREATE OR REPLACE FUNCTION activity_logs_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Le journal d''audit est en ajout seul'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER activity_logs_no_update BEFORE UPDATE OR DELETE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION activity_logs_immutable();
```
Deuxième protection, au niveau de la base : toute tentative de `UPDATE` ou `DELETE` sur le journal est refusée, même par l’application.
`verifyAuditChain` recalcule toute la chaîne et indique la première ligne altérée (bouton « Vérifier la chaîne » du DSI).

### 2.8 `server/models/Workflow.js` — le moteur de circuits

C’est le cœur du SIGRH. Un **type de demande** (`workflow_types`) a des **étapes** (`workflow_steps`). Chaque étape désigne un **type de valideur**.

#### Qui doit valider ? (`resolveActors`)
```js
switch (step.assignee_kind) {
  case 'chef_structure':  actors = chef de la structure de l’agent (en remontant si la structure n’a pas de chef)
  case 'chef_superieur':  actors = le chef au-dessus
  case 'drh_institution': actors = gestionnaires RH de l’institution de l’agent
  case 'drh_destination': actors = gestionnaires RH de l’institution d’accueil (mutation)
  case 'structure':       actors = responsable et gestionnaires d’une structure désignée (ex. DGFP)
  case 'pilotage':        actors = profils pilotage (ex. SGG)
}
if (!actors.length) actors = await gestionnairesOf(db, request.institution_id);
```
La dernière ligne est une **suppléance** : si le poste de chef est vacant, la DRH reçoit la demande. Aucune demande ne reste bloquée.

#### Contrôler les paramètres dès le dépôt (`EFFECT_VALIDATORS`)
```js
mutation: async (db, payload, employee) => {
  assert(target, 'Structure d’accueil requise');
  assert(rows[0]?.is_active, 'Structure d’accueil introuvable ou inactive');
  return { ...payload, target_structure_id: target, target_institution_id: rows[0].institution_id };
},
```
Une mutation sans structure d’accueil est refusée **au dépôt**, pas à la fin du circuit. On mémorise l’institution d’accueil pour l’étape `drh_destination`.

#### Créer une demande (`createRequest`)
1. On vérifie qu’un circuit existe et on valide les paramètres.
2. On insère la demande avec une référence `SIGRH-2026-000001` (séquence PostgreSQL), l’échéance de l’étape 1 (`expected_days`) et l’échéance globale (`sla_days`).
3. On écrit la première ligne de l’historique (« Dépôt de la demande »).
4. On notifie les valideurs de l’étape 1.

#### Agir sur une demande (`performAction`)
```js
await db.query('SELECT id FROM requests WHERE id = $1 FOR UPDATE', [requestId]);
```
`FOR UPDATE` **verrouille** la ligne : si deux valideurs cliquent en même temps, le second attend puis voit l’état à jour. On évite ainsi une double validation.

Les actions possibles : `approve` (étape suivante, ou validation finale), `return` (étape précédente, motif obligatoire), `request_documents`, `resume`,
`reject` (motif obligatoire), `cancel` (demandeur uniquement), `assign` (désigner un agent traitant), `comment`.
Règle importante (`canAct`) : **personne ne valide sa propre demande**.

#### Appliquer l’acte (`applyEffect`)
À la validation de la dernière étape, dans la même transaction :

| Effet | Ce qui change dans le dossier |
|---|---|
| `leave` | Solde de congés débité (après vérification), absence approuvée |
| `mutation` | Ancienne affectation close, nouvelle affectation, structure et compte mis à jour, poste de chef libéré, événement de carrière |
| `avancement` | Grade, échelon (hiérarchie ou corps pour une promotion), événement de carrière |
| `nomination` | Fonction ; éventuellement désigné chef d’une structure |
| `position` | Position statutaire (détachement, disponibilité…) |
| `titularisation` | Statut « fonctionnaire » |
| `retraite` | Position « retraite », fin d’affectation, postes libérés |
| `formation` | Inscription validée |

Chaque changement passe par `trackChanges`, qui écrit l’ancienne et la nouvelle valeur dans `record_changes` avec la référence de l’acte.

### 2.9 `server/utils/alerts.js` — les délais

```js
SELECT … WHERE r.status = 'in_progress' AND r.step_due_date < CURRENT_DATE AND r.alert_sent_at IS NULL
```
Toutes les heures (`setInterval(run, 60 * 60 * 1000)`), on cherche les demandes dont l’étape a dépassé son délai et qui n’ont pas encore été signalées.
On notifie les valideurs, puis on renseigne `alert_sent_at` pour ne pas répéter l’alerte. Passer à l’étape suivante remet `alert_sent_at` à `NULL`.

### 2.10 `server/controllers/soldeController.js` — le contrôle de cohérence

Pour chaque ligne de l’état de paiement de la Solde, jointe au référentiel (`LEFT JOIN employees`) :

```js
lines.filter((l) => !l.employee_id).forEach((l) => push('inconnu', l, 'Payé par la Solde mais absent du référentiel SIGRH'));
if (seen[l.employee_id]) push('doublon', …);
if (NON_PAYABLE.includes(l.position_statutaire)) push('position_non_payable', …);
if (Math.abs(l.base_salary - l.salary) / l.salary > SALARY_GAP_TOLERANCE) push('ecart_salaire', …);
if (!l.biometric_enrolled_at) push('non_enrole', …);
if (Number(l.presence_days) === 0) push('sans_presence', …);
```
Puis on cherche l’inverse : les agents en activité **absents** de l’état de paiement (`non_paye`).
Le `LEFT JOIN` est essentiel : avec un `JOIN` simple, les lignes sans agent correspondant (les agents fantômes) disparaîtraient du résultat.
Le « montant à risque » additionne les anomalies les plus graves (inconnu, doublon, position non payable, sans présence).

### 2.11 `server/controllers/interopController.js` — les systèmes partenaires

```js
const { rows } = await query(
  'UPDATE api_clients SET last_used_at = now() WHERE key_hash = $1 AND is_active RETURNING *', [sha256(String(key))]);
```
La clé n’est **jamais stockée en clair** : seulement son empreinte SHA-256 (comme un mot de passe). La même requête vérifie la clé et note la date d’utilisation.

```js
res.on('finish', () => query('INSERT INTO interop_logs …', [client.id, req.method, req.originalUrl, res.statusCode]));
```
Chaque appel est journalisé une fois la réponse envoyée, avec son code de statut.

```js
export const requireScope = (scope) => (req, res, next) => {
  if (!req.client.scopes.includes(scope)) throw new AppError(`Habilitation « ${scope} » requise`, 403);
  next();
};
```
Principe du moindre privilège : la clé des terminaux biométriques ne peut qu’envoyer des pointages (`biometrie:write`), celle de la Solde que des paiements (`solde:write`).

### 2.12 `server/middleware/errorHandler.js` — des erreurs lisibles

Express 5 transmet automatiquement les erreurs des fonctions `async` au gestionnaire d’erreurs. Celui-ci :
- renvoie le statut et le message des `AppError` (ex. 403 « Accès refusé ») ;
- traduit les erreurs PostgreSQL : `23505` (doublon) → 409, `23503` (référence inexistante) → 400, `P0001` (exception levée par un déclencheur) → 403 ;
- ne montre jamais les détails techniques en production.

---

## Partie 3 — Le code de l’interface (React)

### 3.1 `client/src/services/api.js`
```js
const token = getToken();
if (token) headers.Authorization = `Bearer ${token}`;
…
if (res.status === 401 && token) { setToken(null); window.dispatchEvent(new Event('ems:logout')); }
```
Toutes les pages appellent l’API par ce fichier. Il ajoute le jeton, et si la session expire (401) il déconnecte proprement l’utilisateur.

### 3.2 `client/src/context/AuthContext.jsx`
```js
const login = async (email, password) => {
  const res = await api.post('/auth/login', { email, password });
  if (res.mfa_required) return res;            // l’écran de connexion affiche alors la saisie du code
  return { user: openSession(res) };
};
const verifyMfa = async (mfaToken, code) => ({ user: openSession(await api.post('/auth/mfa/verify', { mfa_token: mfaToken, code })) });
```
Le **contexte** partage l’utilisateur connecté avec toutes les pages et calcule des raccourcis : `isDRH`, `isPilotage`, `isDSI`, `isChef`, `hasDossier`.

### 3.3 `client/src/components/Layout.jsx`
```js
const NAV = [
  { to: '/reprise', label: 'Reprise des données', icon: FileSpreadsheet, show: (a) => a.isDRH },
  { to: '/admin', label: 'Habilitations et audit', icon: ShieldCheck, show: (a) => a.isDSI },
  …
];
```
Le menu est une liste ; chaque entrée a une fonction `show` qui décide si le profil la voit. **Attention** : masquer un lien n’est pas une sécurité. Le serveur vérifie toujours les droits (voir 2.3).

### 3.4 `client/src/App.jsx`
```jsx
<Route path="admin" element={<RequireAuth allow={(a) => a.isDSI}><Admin /></RequireAuth>} />
```
`RequireAuth` redirige vers `/login` si personne n’est connecté, vers l’activation de la 2FA si elle est exigée, et vers l’accueil si le profil n’est pas autorisé.

### 3.5 Une page type : `client/src/pages/Admin.jsx`
```js
const { data, reload } = useFetch('/admin/users');          // charge les données au montage
const run = async (fn, msg) => { try { await fn(); toast.success(msg); reload(); } catch (err) { toast.error(err); } };
```
Toutes les pages suivent ce schéma : `useFetch` pour lire, `api.post/patch/put` pour écrire, un message (`toast`) pour le résultat, puis `reload()` pour rafraîchir.

### 3.6 `client/src/components/Indicators.jsx` — la pyramide des âges
```jsx
<div className="pyr-side left"><span>{d.hommes}</span>
  <div className="pyr-bar tone-primary" style={{ width: `${(d.hommes / max) * 100}%` }} /></div>
```
Pas de bibliothèque de graphiques : chaque barre est un `div` dont la largeur est proportionnelle à l’effectif (pourcentage du maximum). Les hommes sont à gauche (alignés à droite), les femmes à droite.

---

## Partie 4 — Les tests (`server/tests/sigrh.test.js`)

```js
if (!process.env.TEST_DATABASE_URL) { console.error('TEST_DATABASE_URL est obligatoire …'); process.exit(1); }
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.MFA_REQUIRED = 'false';
```
Les tests utilisent **une autre base** (ils la vident), puis rechargent les données de démonstration avec `seed()`.

```js
test('la DRH ne gère que les agents de son institution', async () => {
  const r = await api('GET', '/employees?scope=institution&limit=100', null, 'drh.mfp');
  assert.equal(r.status, 200);
  assert.ok(r.body.data.every((e) => e.institution_id === S.MFP.institution_id));   // uniquement son ministère
  const men = await sql(`SELECT e.id FROM employees e WHERE structure_id = $1 LIMIT 1`, [S['MEN-IA-DKR'].id]);
  assert.equal((await api('GET', `/employees/${men[0].id}/dossier`, null, 'drh.mfp')).status, 403); // pas l’Éducation
});
```
`api(méthode, chemin, corps, profil)` connecte le profil de démonstration indiqué et envoie une vraie requête HTTP à l’API.
Les 30 tests couvrent les habilitations, la 2FA, le chiffrement, le journal, les circuits et leurs effets, la Solde, l’interopérabilité et la reprise.
