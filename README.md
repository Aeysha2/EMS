# 🇸🇳 SIGRH – Système Intégré de Gestion des Ressources Humaines

**République du Sénégal — Un Peuple, Un But, Une Foi**

Prototype du SIGRH national de l’administration publique sénégalaise, réalisé à partir du cahier des charges de la DSI (version 1.0, septembre 2026).
Il interconnecte la **Présidence de la République**, le **Secrétariat Général du Gouvernement (SGG)** et les **ministères** autour d’un
**référentiel unique des agents et des structures de l’État**.

| Couche | Technologies |
|---|---|
| Frontend | React 19, React Router 7, Vite, CSS (charte vert-jaune-rouge, mode sombre, responsive), lucide-react |
| Backend | Node.js 22, Express 5, API REST |
| Base de données | PostgreSQL 16 (33 tables, requêtes paramétrées, contraintes, index, déclencheur d’inaltérabilité) |
| Sécurité | JWT, double authentification TOTP, bcrypt, chiffrement AES-256-GCM, journal d’audit chaîné SHA-256, helmet, limitation de débit |
| Documents | PDFKit (bulletins, récépissés, note de pilotage), ExcelJS (exports), QR codes (2FA) |
| Qualité | 30 tests d’intégration (`node:test`), CI GitHub Actions |

> La branche `main` du dépôt contient la version précédente (« EMS », un seul ministère). La branche **`sigrh-senegal`** contient cette adaptation nationale.

## 📚 Documentation

| N° | Document |
|---|---|
| 1 | [Présentation du projet](docs/01-presentation-du-projet.md) : ce que fait le SIGRH et ce qu’il améliore dans l’administration |
| 2 | [Cahier des charges et conformité](docs/02-cahier-des-charges.md) : exigences et réponse apportée à chacune |
| 3 | [Guide d’installation et de réalisation](docs/03-guide-realisation.md) |
| 4 | [Commandes et code expliqués](docs/04-commandes-et-code-expliques.md) |
| 5 | [Base de données PostgreSQL](docs/05-base-de-donnees-postgresql.md) |
| 6 | [API REST : référence des routes](docs/06-api-rest.md) |
| 7 | [Pourquoi chaque fichier](docs/07-pourquoi-chaque-fichier.md) |
| 8 | [Tester l’API avec Postman](docs/08-api-rest-postman.md) + [collection à importer](docs/postman/SIGRH-Senegal.postman_collection.json) |

---

## 🚀 Démarrage rapide

Prérequis : Node.js ≥ 20 et PostgreSQL ≥ 14 (pgAdmin conseillé).

```bash
git clone https://github.com/Aeysha2/EMS.git
cd EMS
git checkout sigrh-senegal
npm run install-all

# 1. Base de données : créer la base « sigrh » (pgAdmin ou createdb sigrh)
cp server/.env.example server/.env     # adapter DATABASE_URL et JWT_SECRET ; MFA_REQUIRED=false pour une démonstration

# 2. Données de démonstration (⚠ vide les tables)
npm run seed

# 3. API (http://localhost:5002) et interface (http://localhost:5173), dans deux terminaux
npm run server
npm run client
```

### Comptes de démonstration (mot de passe commun : `Sigrh@2026!`)

| Profil | Email | Rôle SIGRH |
|---|---|---|
| Présidence – pilotage | `pilotage.presidence@sigrh.test` | Vue consolidée nationale, lecture seule agrégée |
| SGG – coordination | `pilotage.sgg@sigrh.test` | Pilotage, validation des nominations |
| DSI (SGG) | `admin.dsi@sigrh.test` | Comptes, habilitations, audit, interopérabilité — sans accès aux dossiers |
| DRH Fonction publique | `drh.mfp@sigrh.test` | Gestion RH du MFPRSP |
| DRH Éducation | `drh.education@sigrh.test` | Gestion RH du MEN |
| DRH Finances / Santé / SGG / Présidence | `drh.finances@…`, `drh.sante@…`, `drh.sgg@…`, `drh.presidence@…` | Gestion RH de leur institution |
| Directrice générale de la Fonction publique | `dgfp@sigrh.test` | Chef de structure : visa DGFP des actes de carrière |
| Directeur de la gestion des carrières | `chef.dgc@sigrh.test` | Chef de structure : avis hiérarchique |
| Directeur de la Solde | `solde@sigrh.test` | Chef de structure (MFB) |
| Inspecteur d’académie de Dakar | `ia.dakar@sigrh.test` | Chef de structure déconcentrée |
| Agent | `agent@sigrh.test`, `enseignant@sigrh.test` | Portail libre-service |

Les 70 agents du jeu de données ont tous un compte agent (`prenom.nom<n>@sigrh.test`).
Clés d’API de démonstration : `sigrh_demo_solde_2026`, `sigrh_demo_biometrie_2026`, `sigrh_demo_men_2026`.

### Tests

Les tests vident les tables : ils exigent une base dédiée.

```bash
createdb sigrh_test
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/sigrh_test npm test
```

---

## 📌 Modules du cahier des charges

| Module | Contenu |
|---|---|
| **Référentiel des structures** | Arborescence Présidence → SGG → ministères → directions → services → structures déconcentrées. Chefs de structure, postes budgétaires. Les DRH proposent les créations et modifications ; le niveau central (pilotage) les valide. |
| **Dossier administratif unique** | Identifiant SIGRH (`SN00000001`), matricule de solde, **NIN chiffré et dédoublonné**, état civil, corps, hiérarchie A à D, grade, échelon, position statutaire, affectations, diplômes, sanctions et distinctions, pièces jointes, historique de chaque modification. Vérification d’identité (connecteur état civil), enrôlement biométrique. |
| **Circuits de validation paramétrables** | Congés, missions, formations, mutations, avancements, nominations, détachements, disponibilités, titularisations, retraites, attestations. Étapes configurables (chef de structure, chef supérieur, DRH d’origine ou d’accueil, DGFP, SGG), délai par étape, **alertes de dépassement**, pièces demandées, effets appliqués automatiquement au dossier à la validation finale. |
| **Temps et absences** | Soldes par type de congé, pointage sur le portail ou par terminal biométrique (via l’API), clôture de journée, rapport mensuel et taux d’absentéisme. |
| **Formation** | Catalogue, sessions, inscriptions (demande de l’agent via circuit ou inscription par la DRH), présence et certification. |
| **Évaluation** | Entretiens annuels, indicateurs pondérés, notation, analyse de performance. |
| **Rémunération et Solde** | La Solde (MFB) reste l’autorité de paie : import des états de paiement (CSV ou API), **contrôle de cohérence** (agent inconnu ou « fantôme », doublon, position non payable, écart de salaire, agent non payé, payé sans présence, non enrôlé), bulletins PDF, simulation. |
| **Pilotage** | Effectifs par institution, corps, hiérarchie et région, pyramide des âges, féminisation, absentéisme, masse salariale et prévision sur 12 mois, départs à la retraite, anomalies Solde. Export **Excel** et **note PDF** ; données agrégées uniquement. |
| **Interopérabilité** | API partenaires versionnée `/api/interop/v1` authentifiée par clé (`X-API-Key`) avec habilitations, journal des appels, description **OpenAPI**. |
| **Reprise des données** | Import CSV des fichiers existants, analyse (doublons, NIN invalides, structures inconnues), puis validation ou rejet ligne à ligne par la DRH. |
| **Portail agent** | Mon dossier, demandes et suivi, congés, pointage, bulletins, formations, évaluations, annonces et calendrier, sécurité du compte. |

## 🔐 Habilitations

| Profil | Périmètre |
|---|---|
| `pilotage` (Présidence, SGG) | Lecture **agrégée** nationale, validation des structures et des nominations |
| `gestionnaire_rh` (DRH) | Gestion complète des agents **de son institution** uniquement |
| Chef de structure (déduit de l’organigramme) | Son équipe et ses sous-structures : avis, validations, évaluations |
| `admin_dsi` | Technique : comptes, habilitations, audit, clés d’API — **aucun accès aux dossiers individuels** |
| `agent` | Son propre dossier et ses demandes |

## 🛡️ Sécurité
- **Double authentification** (TOTP, compatible Google/Microsoft Authenticator) **obligatoire** pour les profils privilégiés (`MFA_REQUIRED=true`).
- **Chiffrement AES-256-GCM** du NIN et des secrets 2FA ; recherche de doublons par empreinte HMAC sans déchiffrer.
- **Journal d’audit inaltérable** : chaque entrée est chaînée à la précédente (SHA-256) ; un déclencheur PostgreSQL refuse UPDATE et DELETE ; vérification d’intégrité à la demande.
- **Revue périodique des droits** (180 jours par défaut) ; les comptes ne sont jamais supprimés, seulement désactivés.
- Mots de passe forts (10 caractères, majuscule, minuscule, chiffre), bcrypt, JWT à durée limitée, limitation des tentatives, requêtes SQL paramétrées, listes blanches de champs.

---

## 📂 Structure

```
EMS/
├── client/                     # React (Vite)
│   └── src/
│       ├── components/         # Layout (charte Sénégal), UI, formulaires, indicateurs, 2FA
│       ├── pages/              # Agents, dossier, organigramme, demandes, absences, formation, évaluation,
│       │                       # Solde, pilotage, paramétrage, interopérabilité, reprise, habilitations…
│       ├── dashboard/          # Tableau de bord adapté au profil
│       ├── context/            # Authentification (+2FA), thème, notifications
│       └── services/api.js     # Client REST
├── server/                     # Express + PostgreSQL
│   ├── controllers/            # Logique métier par module
│   ├── models/                 # Employee, Structure, Workflow (moteur de circuits)
│   ├── middleware/             # auth (JWT, 2FA, périmètres), erreurs
│   ├── routes/                 # Déclaration des routes
│   ├── utils/                  # crypto, audit, alertes, CSV, état civil, PDF, seed…
│   ├── db/schema.sql           # Schéma idempotent (appliqué au démarrage)
│   └── tests/sigrh.test.js     # Tests d’intégration
└── docs/                       # Documentation 01 à 08 + collection Postman
```

## 🌍 Déploiement
- **Base** : PostgreSQL managé ou serveur de l’État ; le schéma s’applique au démarrage de l’API.
- **API** : `server/`, `npm install` puis `npm start`. Variables : `DATABASE_URL`, `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `MFA_REQUIRED=true`, `CLIENT_URL`, `TZ=Africa/Dakar`, `NODE_ENV=production` (voir `server/.env.example`).
- **Interface** : `client/`, `npm run build` ; `VITE_API_URL` pointe vers l’API.

## ⚠️ Limites du prototype
- Le connecteur **état civil** fonctionne en simulation tant que `ETAT_CIVIL_URL` n’est pas défini.
- Les échanges **Solde** et **biométrie** passent par l’API d’interopérabilité : les systèmes réels devront être raccordés à ces points d’accès.
- Le prototype est destiné à une **phase pilote** (quelques ministères) avant la généralisation prévue par le cahier des charges.
