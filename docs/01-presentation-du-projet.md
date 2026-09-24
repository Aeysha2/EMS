# Document 1 — Présentation du projet SIGRH

## 1. En une phrase

Le **SIGRH** (Système Intégré de Gestion des Ressources Humaines) est une application web qui donne à l’État du Sénégal
**un seul dossier numérique par agent public**, partagé entre la Présidence, le Secrétariat Général du Gouvernement (SGG) et
les ministères, avec des **circuits de validation dématérialisés** et des **tableaux de bord** pour piloter les effectifs et la masse salariale.

## 2. Le problème de départ

Aujourd’hui, dans beaucoup d’administrations :

| Constat | Conséquence |
|---|---|
| Chaque ministère tient ses propres fichiers (Excel, registres papier, logiciels isolés) | Un agent muté « disparaît » d’un fichier et « réapparaît » dans un autre ; personne n’a la vue d’ensemble |
| Les actes de carrière (avancement, mutation, détachement…) circulent sur papier | Délais longs, dossiers perdus, impossible de savoir où en est une demande |
| La Solde paie à partir de ses propres listes | Risque d’**agents fantômes**, de doubles paiements, d’agents payés alors qu’ils sont en disponibilité |
| Les statistiques RH demandent des semaines de collecte | La Présidence et le SGG décident sans chiffres fiables et à jour |
| Les données personnelles circulent sans contrôle | Risque de fuite, pas de traçabilité de qui a consulté ou modifié quoi |

## 3. Ce que fait le SIGRH

### 3.1 Un référentiel unique
- **Structures de l’État** : Présidence → SGG → ministères → directions → services → structures déconcentrées (inspections d’académie, régions médicales…).
- **Agents** : un identifiant SIGRH national (`SN00000001`) qui suit l’agent toute sa carrière, relié à son **NIN** (vérifié auprès de l’état civil) et à son **matricule de solde**.
- Le dossier regroupe l’état civil, le corps, la hiérarchie (A, B, C, D), le grade, l’échelon, la position statutaire (activité, détachement, disponibilité…), les affectations, diplômes, sanctions, distinctions, pièces jointes et l’historique de chaque modification.

### 3.2 Des circuits de validation paramétrables
Chaque type d’acte suit un circuit défini par l’administration, sans programmation :

```
Mutation : Agent → Chef de structure → DRH d’origine → DRH d’accueil → Visa DGFP → affectation mise à jour automatiquement
Nomination : DRH → Validation SGG → fonction mise à jour
Congé : Agent → Chef de structure → DRH → solde de congés débité
```

Chaque étape a un **délai réglementaire** ; en cas de dépassement, les valideurs et la DRH reçoivent une **alerte**.
Chaque demande reçoit une référence (`SIGRH-2026-000001`), un **récépissé PDF** et un historique complet.

### 3.3 Le lien avec la Solde
La Direction de la Solde reste seule à payer. Le SIGRH **importe ses états de paiement** (fichier ou API) et les **compare** au référentiel :
agents payés mais inconnus, payés deux fois, payés alors qu’ils sont en position non payable, écarts de salaire, agents en activité non payés,
agents payés sans aucune présence enregistrée. Chaque anomalie est chiffrée en FCFA.

### 3.4 Le pilotage
La Présidence et le SGG disposent de tableaux de bord **consolidés et anonymes** : effectifs par institution, corps, hiérarchie et région,
**pyramide des âges**, taux de **féminisation**, **absentéisme**, **masse salariale** et prévision sur 12 mois, départs à la retraite à venir.
Ils s’exportent en **Excel** et en **note PDF**.

### 3.5 Le portail de l’agent
Chaque agent consulte son dossier, dépose ses demandes et suit leur avancement, pointe sa présence, télécharge ses bulletins,
s’inscrit aux formations et consulte ses évaluations.

## 4. Qui fait quoi

| Acteur | Ce qu’il fait dans le SIGRH |
|---|---|
| **Présidence / SGG** (profil pilotage) | Consulte les indicateurs nationaux, valide les créations de structures et les nominations |
| **DRH d’un ministère** | Tient les dossiers de son ministère, instruit les actes, importe les données existantes |
| **Chef de structure** (directeur, chef de service, inspecteur…) | Donne son avis sur les demandes de son équipe, évalue ses agents |
| **DGFP** | Vise les actes de carrière (mutation, avancement, détachement, titularisation, retraite) |
| **Direction de la Solde** | Transmet les états de paiement, traite les anomalies |
| **DSI** | Crée les comptes, revoit les habilitations, contrôle le journal d’audit, gère les clés d’API — sans voir les dossiers |
| **Agent** | Utilise le portail libre-service |

## 5. Ce que le SIGRH améliore dans l’administration

| Domaine | Avant | Avec le SIGRH |
|---|---|---|
| Connaissance des effectifs | Recensements ponctuels, chiffres divergents | Effectifs exacts et à jour, consultables à tout moment |
| Masse salariale | Contrôles a posteriori, fraudes difficiles à détecter | Rapprochement mensuel automatique avec la Solde, anomalies chiffrées |
| Délais de traitement | Dossiers papier, relances téléphoniques | Circuits en ligne, délais mesurés, alertes automatiques |
| Transparence pour l’agent | « Mon dossier est-il arrivé ? » | Suivi en temps réel, récépissé, notifications |
| Mobilité entre ministères | Ressaisie complète du dossier | Le dossier suit l’agent (identifiant unique) |
| Sécurité des données | Fichiers partagés, pas de traçabilité | Accès limité au périmètre, 2FA, chiffrement, journal inaltérable |
| Décision publique | Données tardives | Tableaux de bord Présidence/SGG, exports pour les notes |
| Égalité femmes-hommes | Non mesurée | Taux de féminisation par hiérarchie et institution |

## 6. Ce que contient le prototype

- 24 structures (Présidence, SGG, MFPRSP, Finances, Éducation, Santé et leurs directions et services déconcentrés), 11 corps, 70 agents.
- 11 circuits de validation, 10 demandes à différentes étapes, des congés, pointages biométriques, formations et évaluations.
- Deux imports de la Solde, dont un comportant des anomalies (dont un agent fantôme).
- 15 comptes de démonstration couvrant tous les profils (mot de passe `Sigrh@2026!`).

## 7. Limites et suites

- Le connecteur **état civil** est simulé tant qu’aucune adresse de service réel n’est configurée.
- La **Solde** et les **terminaux biométriques** doivent être raccordés à l’API d’interopérabilité prévue à cet effet.
- Le déploiement recommandé est progressif : **phase pilote** sur quelques ministères (MFPRSP, SGG), reprise des données avec validation des DRH, puis généralisation.
