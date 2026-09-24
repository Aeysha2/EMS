# Document 8 — Tester l’API REST pas à pas avec Postman

Ce document explique comment tester **toutes les fonctions du SIGRH sans l’interface**, avec Postman.
Il s’appuie sur la collection prête à l’emploi [`docs/postman/SIGRH-Senegal.postman_collection.json`](postman/SIGRH-Senegal.postman_collection.json) :
**111 requêtes** et **172 vérifications automatiques**, réparties en 11 dossiers. La référence complète des routes se trouve dans le **document 6**.

---

## 1. Préparer l’environnement

1. Installez **Postman** (https://www.postman.com/downloads/) ; un compte gratuit suffit.
2. Dans `server/.env`, mettez `MFA_REQUIRED=false` : sinon les profils DRH, pilotage et DSI devraient d’abord activer leur double authentification.
3. Chargez des données propres, puis lancez l’API :
   ```bash
   npm run seed
   npm run server
   ```
4. Vérifiez dans le navigateur : http://localhost:5002/api/health → `{"status":"online","database":"ok",…}`.

## 2. Importer la collection

1. Postman → **Import** (en haut à gauche) → **files** → choisissez `docs/postman/SIGRH-Senegal.postman_collection.json`.
2. La collection **SIGRH Sénégal – API REST** apparaît à gauche avec ses 11 dossiers.
3. Cliquez sur le nom de la collection → onglet **Variables** :

| Variable | Valeur | Rôle |
|---|---|---|
| `baseUrl` | `http://localhost:5002` | Adresse de l’API ; à changer pour tester un serveur déployé |
| `password` | `Sigrh@2026!` | Mot de passe commun des comptes de démonstration |
| `keyMen`, `keySolde`, `keyBio` | `sigrh_demo_…_2026` | Clés d’API de démonstration des systèmes partenaires |

Les autres variables (`tokenAgent`, `tokenDrh`, `leaveRequestId`, `newEmployeeId`…) sont **remplies automatiquement** par les scripts des requêtes.

## 3. Tout exécuter d’un coup (Collection Runner)

1. Survolez la collection → **⋯** → **Run collection**.
2. Laissez tous les dossiers cochés, **dans l’ordre**, puis **Run SIGRH Sénégal**.
3. Résultat attendu : toutes les vérifications en vert (**172 passed, 0 failed**).

La collection peut être relancée plusieurs fois sans recharger les données : elle crée des éléments uniques (horodatés), annule le congé qu’elle a posé et désactive la 2FA qu’elle a activée.

> En ligne de commande, le même test se lance avec **Newman** :
> `npx newman run docs/postman/SIGRH-Senegal.postman_collection.json`

## 4. Comprendre une requête Postman

Ouvrez **1. Santé et connexions → Connexion DRH Fonction publique**. Vous y trouvez :

| Onglet | Contenu |
|---|---|
| Barre d’adresse | `POST {{baseUrl}}/api/auth/login` — `{{…}}` est remplacé par la valeur de la variable |
| **Authorization** | *No Auth* : on n’a pas encore de jeton |
| **Body** → raw → JSON | `{ "email": "drh.mfp@sigrh.test", "password": "{{password}}" }` |
| **Scripts → Post-response** (ou *Tests*) | Le code exécuté **après** la réponse |

Le script :
```js
pm.test("Statut 200", () => pm.response.to.have.status(200));    // vérification affichée en vert ou rouge
const json = pm.response.json();                                   // corps de la réponse
pm.test("Un jeton est renvoyé", () => pm.expect(json.token).to.be.a("string"));
pm.collectionVariables.set("tokenDrh", json.token);               // mémorise le jeton pour les requêtes suivantes
```

Ouvrez ensuite **3. … → DRH : agents de son institution** : onglet **Authorization** → *Bearer Token* → `{{tokenDrh}}`.
Postman ajoute alors l’en-tête `Authorization: Bearer eyJhbGciOi…`. C’est ainsi que l’API sait **qui** appelle.

## 5. Les dossiers, un par un

Cliquez sur une requête puis **Send** pour l’exécuter seule (après avoir exécuté le dossier 1, qui remplit les jetons).

### Dossier 1 — Santé et connexions
Connecte **7 profils** (agent, chef de structure, DRH Fonction publique, DRH Éducation, DGFP, Pilotage Présidence, DSI) et enregistre leurs jetons.
Vérifie aussi qu’un mauvais mot de passe renvoie **401** et qu’une requête sans jeton est refusée.

### Dossier 2 — Référentiel des structures
- Lit l’organigramme et mémorise les identifiants de `MFP`, `MFP-DGC` et `MEN-IA-DKR`.
- **Scénario de gouvernance** : la DRH **propose** une nouvelle structure (`201`, statut `pending`), elle ne peut pas la valider elle-même (**403**), puis le **pilotage la valide**.

### Dossier 3 — Dossier des agents et habilitations
Le cœur de la sécurité métier :

| Requête | Ce qu’elle démontre |
|---|---|
| DRH : agents de son institution | Tous les agents renvoyés sont de **son** ministère ; elle voit la rémunération |
| DRH Fonction publique → dossier d’un autre ministère | **403** : cloisonnement entre ministères |
| DSI → dossier individuel | **403** : la DSI administre sans accès métier |
| Annuaire (agent) | Ni salaire ni NIN |
| DRH : enregistrer un agent | Création, identifiant `SN…` attribué ; NIN, email et matricule générés à chaque exécution |
| Même NIN → doublon | **409** : dédoublonnage par empreinte, sans jamais comparer des NIN en clair |
| Consulter le NIN | NIN déchiffré, **consultation inscrite au journal** |
| Vérifier l’identité, enrôlement biométrique, diplôme, distinction | Compléments du dossier |

### Dossier 4 — Circuits : congé et avancement
Le parcours complet d’une demande :

```
Agent : demande de congé ──► Chef DGC : avis (étape 1) ──► DRH : validation (étape 2) ──► solde débité
DRH : initie un avancement ──► DRH : instruction ──► DGFP : visa ──► échelon mis à jour dans le dossier
```

À observer :
- le script de pré-requête de **Mes soldes de congés** choisit deux jours ouvrés dans le futur (variables `leaveStart`, `leaveEnd`, `leaveYear`) ;
- l’agent **ne peut pas valider sa propre demande** ;
- un **rejet sans motif** est refusé (**400**) ;
- après validation, **Solde débité de 2 jours** compare le solde avant et après ;
- **Récépissé PDF** : cliquez sur **Save Response → Save to a file** pour ouvrir le PDF ;
- après le visa DGFP, **Le dossier est à jour** vérifie que l’échelon vaut 2 : l’acte a été **appliqué automatiquement**.

### Dossier 5 — Présences, formation, évaluation
Pointage d’arrivée (201 la première fois, 409 si déjà pointé ce jour), rapport mensuel avec taux d’absentéisme, catalogue des formations, demande d’inscription (qui ouvre une demande dans le circuit FORMATION), évaluations et analyse de performance.

### Dossier 6 — Solde et contrôle de cohérence
- L’agent consulte et télécharge **ses** bulletins, et fait une simulation.
- Le pilotage lance le **contrôle de cohérence national** : des anomalies sont trouvées, dont un **agent fantôme** (`inconnu`).
- La DRH voit le même contrôle **limité à son ministère** (pas d’agents inconnus, qui n’appartiennent à aucun ministère).
- Le pilotage importe un état de solde en CSV : une ligne est rapprochée, l’autre (matricule `799999X`) ne l’est pas.

Astuce : dans le corps JSON, les retours à la ligne du CSV s’écrivent `\n`.

### Dossier 7 — Pilotage
Indicateurs nationaux (effectif, pyramide des âges…), indicateurs d’une DRH (son institution), refus pour un agent (**403**), **export Excel** et **note PDF** (utilisez *Save Response* pour les ouvrir).

### Dossier 8 — Interopérabilité
Ces requêtes n’utilisent **pas** de jeton mais l’en-tête **`X-API-Key`** (onglet **Headers**).

| Requête | Résultat |
|---|---|
| Sans clé / clé invalide | 401 |
| Clé MEN → référentiel | 200 (habilitation `structures:read`) |
| Clé MEN → pointages biométriques | **403** : cette clé n’a pas l’habilitation `biometrie:write` |
| Terminal biométrique | 202 : un pointage accepté, un agent inconnu rejeté |
| Solde par API | 201 : ligne non rapprochée signalée |
| DSI crée une clé, l’utilise, la révoque | La clé révoquée renvoie 401 |

### Dossier 9 — Reprise des données
La DRH dépose un CSV de deux lignes : une correcte, une avec une structure inconnue. L’analyse signale l’erreur ; la validation ne crée que la ligne correcte ; un second traitement du même lot est refusé (**409**).

### Dossier 10 — Administration, audit et communication
Revue des droits d’un compte, refus de créer un compte *pilotage* hors Présidence/SGG, lecture du journal (chaque entrée a une empreinte de 64 caractères), **vérification de l’intégrité de la chaîne**, publication puis suppression d’une annonce nationale, calendrier et notifications.

### Dossier 11 — Double authentification
Ce dossier montre la 2FA **sans téléphone** : le code à 6 chiffres est calculé dans la pré-requête, avec le même algorithme que Google Authenticator :

```js
const cjs = require('crypto-js');
// 1. décoder le secret base32 en octets
// 2. compteur = nombre de périodes de 30 s depuis 1970
const counter = Math.floor(Date.now() / 1000 / 30).toString(16).padStart(16, '0');
// 3. HMAC-SHA1(secret, compteur), puis extraction de 6 chiffres
const h = cjs.HmacSHA1(cjs.enc.Hex.parse(counter), cjs.enc.Hex.parse(keyHex)).toString();
const offset = parseInt(h.slice(-1), 16);
const code = ((parseInt(h.substr(offset * 2, 8), 16) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
```

Déroulé : activation (secret et QR code) → mauvais code refusé → activation avec le bon code → la connexion renvoie `mfa_required` **sans jeton** → le jeton provisoire n’ouvre rien (**401**) → le code donne le jeton de session → désactivation.

## 6. Tester à la main une nouvelle route

1. Clic droit sur un dossier → **Add request**.
2. Choisissez la méthode (GET, POST…) et l’adresse : `{{baseUrl}}/api/…`.
3. **Authorization** → *Bearer Token* → `{{tokenDrh}}` (ou un autre profil).
4. Pour un POST/PUT/PATCH : **Body** → *raw* → *JSON*, puis le corps (voir le document 6).
5. **Send**. Lisez le code (en haut à droite de la réponse) et le message.

Exemple — la DRH initie une mutation vers l’Éducation :
```json
POST {{baseUrl}}/api/requests
{
  "type_id": 4,
  "employee_id": {{newEmployeeId}},
  "title": "Mutation vers l’IA de Dakar",
  "payload": { "target_structure_id": {{iaDakarId}} }
}
```
(L’identifiant du type MUTATION se lit dans **Types de demandes et circuits**.) La demande passe ensuite par le chef de structure, la DRH d’origine, la **DRH de l’Éducation** (`tokenDrhMen`), puis la DGFP.

## 7. Diagnostiquer une erreur

| Réponse | Cause probable | Que faire |
|---|---|---|
| `Could not send request` / `ECONNREFUSED` | API arrêtée | `npm run server` |
| 401 `Authentification requise` | Jeton absent : le dossier 1 n’a pas été exécuté | Exécuter le dossier 1 |
| 401 `Session invalide ou expirée` | Jeton de plus de 8 h | Réexécuter le dossier 1 |
| 403 `code: MFA_SETUP_REQUIRED` | `MFA_REQUIRED=true` | Mettre `false` dans `.env` et redémarrer l’API |
| 403 `Accès refusé` | Mauvais profil ou hors périmètre : **comportement voulu** | Vérifier le jeton utilisé |
| 404 sur une demande | La demande existe mais vous n’y êtes pas associé | Utiliser le profil concerné |
| 409 | Doublon, lot déjà traité, demande clôturée | Normal dans les requêtes « … → 409 » |
| 429 | Trop d’échecs de connexion | Attendre 15 minutes ou augmenter `AUTH_RATE_LIMIT` en développement |
| Variables `{{…}}` non remplacées | Une requête précédente a échoué | Relancer le dossier dans l’ordre |
