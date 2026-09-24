# Document 2 — Cahier des charges et matrice de conformité

Ce document reprend les exigences du **cahier des charges SIGRH** (République du Sénégal, DSI, version 1.0, septembre 2026)
et indique, pour chacune, **comment le prototype y répond** et **où le trouver** dans le code.

Légende : ✅ réalisé · 🟡 réalisé en simulation ou partiellement · ⏳ prévu pour une phase ultérieure

## 1. Objectifs généraux

| Objectif | Réponse | Statut |
|---|---|---|
| Interconnecter Présidence, SGG et ministères | Une seule base, un arbre de structures unique ; chaque utilisateur est rattaché à une structure qui définit son institution et son périmètre | ✅ |
| Référentiel unique des agents | Identifiant SIGRH national, NIN chiffré et dédoublonné, matricule de solde unique | ✅ |
| Dématérialiser les actes RH | Moteur de circuits paramétrables, récépissés PDF, pièces jointes | ✅ |
| Fiabiliser la masse salariale | Import des états de la Solde et rapprochement automatique | ✅ |
| Outiller le pilotage | Tableaux de bord consolidés, exports Excel et PDF | ✅ |

## 2. Périmètre fonctionnel

### 2.1 Gestion administrative des agents
| Exigence | Réponse | Où |
|---|---|---|
| Dossier individuel complet (état civil, carrière, affectations, diplômes, sanctions, distinctions, documents) | Onglets du dossier agent | `pages/AgentDossier.jsx`, `controllers/employeeController.js` |
| Identifiant unique national | `sigrh_id` généré par séquence (`SN` + 8 chiffres) | `models/Employee.js` (`nextSigrhId`) |
| Contrôle d’identité (NIN, état civil) | Vérification par connecteur ; simulation si `ETAT_CIVIL_URL` absent | `utils/etatCivil.js` | 
| Pas de doublons | Empreinte HMAC du NIN (`nin_hash` unique), matricule de solde unique | `utils/crypto.js`, `db/schema.sql` |
| Historique des modifications | Table `record_changes` : ancienne valeur, nouvelle valeur, auteur, date | `models/Employee.js` (`trackChanges`) |
| Positions statutaires | activité, détachement, disponibilité, stage, suspension, retraite… | `POSITIONS_STATUTAIRES` |

Statut : ✅ (vérification d’état civil : 🟡 simulée)

### 2.2 Rémunération — interconnexion avec la Solde
| Exigence | Réponse |
|---|---|
| La Solde reste l’autorité de paie | Le SIGRH ne calcule pas la paie officielle ; il importe les montants versés (source `solde`) |
| Échanges automatisés | `POST /api/interop/v1/solde/paiements` (clé d’API avec l’habilitation `solde:write`) ou import CSV |
| Contrôle de cohérence | 7 types d’anomalies : inconnu, doublon, position non payable, écart de salaire (> 5 %), non payé, payé sans présence, non enrôlé biométrie |
| Bulletins | PDF téléchargeable par l’agent |
| Simulation | Calcul indicatif (source `simulation`), jamais confondu avec la Solde |

Statut : ✅ (raccordement au système réel de la Solde : ⏳)

### 2.3 Carrières et mobilité
| Exigence | Réponse |
|---|---|
| Avancements, promotions, nominations, mutations, détachements, disponibilités, titularisations, retraites | Un circuit par acte, avec **effet automatique** sur le dossier à la validation finale (`applyEffect` dans `models/Workflow.js`) |
| Mobilité interministérielle | Étape `drh_destination` : la DRH de l’institution d’accueil donne son accord |
| Visa de la Fonction publique | Étape confiée à la structure DGFP |
| Validation des nominations par le SGG | Étape `pilotage` sur la structure SGG |

Statut : ✅

### 2.4 Évaluation
Entretiens annuels planifiés par le chef de structure ou la DRH, indicateurs avec cible et pondération, note, commentaires,
analyse de performance (assiduité, ponctualité, objectifs). Statut : ✅

### 2.5 Temps de travail et absences
| Exigence | Réponse |
|---|---|
| Congés et permissions | Types paramétrés (quota, jours ouvrés, justificatif, circuit) ; soldes réservés à la demande, débités à la validation |
| Pointage biométrique | `POST /api/interop/v1/biometrie/pointages` (clé `biometrie:write`) ; un pointage par agent et par jour (contrainte d’unicité) |
| Pointage sur le portail | Arrivée et départ, retard calculé |
| Absentéisme | Rapport mensuel par agent et taux d’absentéisme dans le pilotage |

Statut : ✅ (terminaux physiques à raccorder : ⏳)

### 2.6 Formation
Catalogue, sessions, demandes d’inscription via circuit, inscriptions par la DRH, présence et certification. Statut : ✅

### 2.7 Organigrammes et annuaire
Arbre des structures avec effectifs, chefs de structure, postes budgétaires (occupés ou vacants).
Les DRH **proposent** les créations et modifications, le niveau central **valide**. L’annuaire des agents ne montre que les informations publiques. Statut : ✅

### 2.8 Reporting et pilotage
| Indicateur demandé | Présent |
|---|---|
| Effectifs par institution, corps, catégorie (hiérarchie), région | ✅ |
| Pyramide des âges | ✅ |
| Taux de féminisation | ✅ |
| Absentéisme | ✅ |
| Masse salariale et prévision | ✅ (12 mois) |
| Départs à la retraite prévus | ✅ |
| Exports Excel, PDF et API | ✅ (`/api/pilotage/export.xlsx`, `/export.pdf`, `/api/interop/v1/statistiques/effectifs`) |

### 2.9 Interopérabilité
API REST versionnée (`/api/interop/v1`), authentification par clé, habilitations par clé (moindre privilège), journal des appels,
spécification OpenAPI publiée (`/api/interop/v1/openapi.json`). Un bus d’échange (ESB) pourra appeler ces points d’accès. Statut : ✅

### 2.10 Portail agent
Dossier personnel, demandes et suivi, congés, pointage, bulletins, formations, évaluations, annonces, calendrier, sécurité du compte. Statut : ✅

## 3. Habilitations

| Exigence | Réponse |
|---|---|
| Présidence / SGG : lecture agrégée | Profil `pilotage` : indicateurs et exports agrégés ; aucun dossier individuel consultable, hormis le sien et, s’il dirige une structure, ceux de son équipe |
| Ministères : gestion limitée à leur périmètre | Profil `gestionnaire_rh` : toutes les requêtes sont filtrées sur `institution_id` |
| DSI : administration technique sans accès métier | Profil `admin_dsi` : comptes, audit, clés d’API ; les routes des dossiers lui renvoient 403 |
| Agent : libre-service | Profil `agent` : son dossier ; s’il dirige une structure, son équipe (chef de structure déduit de l’organigramme) |
| Revue périodique des droits | Date et auteur de la dernière revue, alerte après 180 jours (`RIGHTS_REVIEW_DAYS`) |

## 4. Sécurité

| Exigence | Réponse |
|---|---|
| Authentification forte des profils privilégiés | TOTP obligatoire (`MFA_REQUIRED=true`) ; le serveur bloque toute action tant que la 2FA n’est pas activée (code `MFA_SETUP_REQUIRED`) |
| Chiffrement des données sensibles | AES-256-GCM pour le NIN et les secrets 2FA ; HTTPS attendu en production |
| Traçabilité inaltérable | Journal chaîné SHA-256 ; déclencheur PostgreSQL qui refuse UPDATE et DELETE ; vérification d’intégrité |
| Politique de mots de passe | 10 caractères, majuscule, minuscule et chiffre ; bcrypt |
| Protection contre les attaques | Limitation des tentatives, requêtes paramétrées, en-têtes `helmet`, CORS restreint |

## 5. Circuits paramétrables, délais et alertes

- Écran **Circuits et référentiels** : ajouter, supprimer ou réordonner les étapes ; choisir le valideur (chef de structure, chef supérieur, DRH de l’institution, DRH d’accueil, structure désignée, pilotage) ; délai en jours par étape ; pièces demandées.
- Si aucun valideur n’est trouvé (poste vacant), l’étape revient à la DRH de l’institution : aucune demande ne reste bloquée.
- Une tâche horaire (`utils/alerts.js`) alerte les valideurs et l’agent traitant en cas de dépassement.

## 6. Reprise des données existantes

1. La DRH télécharge le modèle CSV.
2. Elle dépose son fichier : chaque ligne est analysée (champs obligatoires, NIN, dates, structure et corps connus, doublons dans le fichier et dans la base).
3. Elle valide ou rejette les lignes ; seules les lignes validées créent des dossiers. Tout est journalisé.

Statut : ✅

## 7. Exigences non fonctionnelles

| Exigence | Réponse |
|---|---|
| Disponibilité, montée en charge | API sans état (JWT), pool de connexions, index sur les colonnes filtrées, pagination serveur |
| Ergonomie | Interface en français, responsive (mobile), mode sombre, charte aux couleurs nationales |
| Maintenabilité | Code en modules (routes, contrôleurs, modèles), schéma SQL idempotent, tests automatisés, CI |
| Documentation | Documents 01 à 08, spécification OpenAPI, collection Postman |

## 8. Hors périmètre du prototype
- Raccordement effectif aux systèmes de la Solde, de l’état civil et aux terminaux biométriques (les points d’accès sont prêts).
- Signature électronique des actes.
- Hébergement souverain, sauvegardes et plan de reprise d’activité (à organiser par la DSI).
