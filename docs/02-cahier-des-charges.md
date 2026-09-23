# 2. Cahier des charges

## 2.1 Contexte et objectifs

**Maître d'ouvrage** : Ministère de la Fonction Publique, Direction des Ressources Humaines.
**Projet** : SIGRH, système de gestion des employés et de suivi des dossiers administratifs.

**Contexte** : le ministère gère son personnel (environ une centaine d'agents répartis en directions) et reçoit chaque jour des dossiers de fonctionnaires : recrutement, titularisation, avancement, mutation, retraite… Aujourd'hui ces tâches se font sur papier et dans des tableurs.

**Objectifs** :
- O1 : centraliser les données du personnel.
- O2 : automatiser le pointage, les congés et la paie.
- O3 : tracer le circuit de traitement de chaque dossier et réduire les délais.
- O4 : fournir des tableaux de bord et des rapports à la direction.
- O5 : sécuriser l'accès aux données sensibles.

## 2.2 Utilisateurs (acteurs)

| Acteur | Description | Droits principaux |
| --- | --- | --- |
| Administrateur (`admin`) | Secrétariat général, informaticien | Tous les droits + comptes, rôles, audit, suppression |
| RH (`hr`) | Direction des Ressources Humaines | Personnel, départements, présences, congés, paie, rapports, paramétrage des dossiers |
| Chef de service | Agent désigné responsable d'un département (ce n'est pas un rôle à part) | Congés, évaluations et dossiers de **son** service |
| Agent (`employee`) | Tout employé | Ses données : pointage, congés, bulletins, évaluations, dossiers affectés |
| Usager | Fonctionnaire qui dépose un dossier | N'utilise pas l'application : il reçoit un récépissé avec une référence |

## 2.3 Besoins fonctionnels

### Authentification et comptes
| N° | Besoin |
| --- | --- |
| F1 | Un visiteur peut créer un compte agent (nom, email, mot de passe, téléphone, matricule) |
| F2 | Un utilisateur se connecte avec son email et son mot de passe |
| F3 | L'écran de connexion propose de choisir un profil (Admin / RH / Agent) |
| F4 | L'utilisateur peut changer son mot de passe |
| F5 | L'administrateur change le rôle d'un compte, le désactive ou réinitialise son mot de passe |

### Employés
| N° | Besoin |
| --- | --- |
| F6 | Les RH créent, modifient et consultent la fiche d'un agent : ID, matricule, nom, département, fonction, grade, email, téléphone, date d'entrée, salaire, statut |
| F7 | L'ID employé est généré automatiquement (`EMP101`, `EMP102`…) |
| F8 | Recherche avancée : texte libre, département, statut, fonction, dates d'entrée, salaire, tri, pagination |
| F9 | Export de la liste en CSV |
| F10 | L'administrateur supprime un agent (son compte est alors désactivé) |
| F11 | L'agent modifie lui-même son téléphone et son adresse (libre-service) |

### Départements
| N° | Besoin |
| --- | --- |
| F12 | Créer, modifier et supprimer un département : nom, sigle, responsable, budget, description |
| F13 | Afficher l'effectif et la part du budget consommée par les salaires |

### Présences
| N° | Besoin |
| --- | --- |
| F14 | L'agent pointe son arrivée et son départ, avec sa position GPS si elle est disponible |
| F15 | Calcul des heures travaillées, des heures supplémentaires (au-delà de 8 h), du retard et de la demi-journée |
| F16 | Les RH saisissent ou corrigent un pointage |
| F17 | Les RH clôturent une journée : les agents sans pointage sont marqués absents et notifiés |
| F18 | Rapport mensuel par agent, exportable et imprimable |

### Congés
| N° | Besoin |
| --- | --- |
| F19 | L'agent demande un congé : occasionnel, maladie, payé ou sans solde |
| F20 | L'agent annule sa demande et consulte son historique |
| F21 | Les RH ou le chef de service approuvent ou rejettent, avec un commentaire |
| F22 | Chaque agent voit ses soldes, ses jours en attente et ses jours pris |

### Paie
| N° | Besoin |
| --- | --- |
| F23 | Les RH génèrent la paie d'un mois pour tous les agents actifs, en ajoutant des primes et des retenues au cas par cas |
| F24 | Le bulletin détaille : salaire de base, indemnités, heures supplémentaires, primes, retenues, impôt, net |
| F25 | Le bulletin est téléchargeable en PDF |
| F26 | Les RH marquent les bulletins comme payés |

### Performance
| N° | Besoin |
| --- | --- |
| F27 | Les RH et le chef de service évaluent un agent (période, note de 1 à 5, appréciation) et lui fixent des objectifs |
| F28 | Ils peuvent aussi planifier un entretien d'évaluation |
| F29 | L'agent met à jour l'avancement de ses objectifs |
| F30 | L'application calcule un score de performance et propose des recommandations |

### Projets et dossiers (spécifique au ministère)
| N° | Besoin |
| --- | --- |
| F31 | Enregistrer un dossier : objet, type de demande, type de dépôt, demandeur (nom, matricule, structure, contact), date de dépôt, priorité |
| F32 | Une référence unique est attribuée : `MFP-AAAA-NNNNN` |
| F33 | L'échéance est calculée à partir du délai du type de demande |
| F34 | Les RH paramètrent les types de demande, les types de dépôt et le circuit de traitement (étapes, service responsable, délai de chaque étape) |
| F35 | Affecter un agent traitant |
| F36 | Transmettre à l'étape suivante, retourner à l'étape précédente, demander des pièces, reprendre, rejeter, clôturer, commenter |
| F37 | Historique complet des actions |
| F38 | Ajouter des pièces jointes et les télécharger |
| F39 | Imprimer un récépissé de dépôt (PDF) |
| F40 | Signaler les dossiers en retard |

### Tableau de bord, rapports, communication
| N° | Besoin |
| --- | --- |
| F41 | Tableau de bord : total employés, présents, en congé, masse salariale du mois, effectif par département, activités récentes, dossiers |
| F42 | Rapports : départements, paie, congés, dossiers, analyses RH, avec export CSV |
| F43 | Notifications : congé approuvé ou rejeté, salaire traité ou versé, pointage manquant, annonce, évaluation planifiée, dossier affecté |
| F44 | Annonces internes et calendrier |
| F45 | Journal d'audit des actions RH |
| F46 | Mode sombre |

## 2.4 Règles de gestion

| N° | Règle |
| --- | --- |
| R1 | L'inscription publique crée **toujours** un compte `employee`. Seul un administrateur donne les rôles `hr` ou `admin` |
| R2 | Pour rattacher un compte à une fiche déjà créée par les RH, l'agent doit fournir son matricule ou son ID employé |
| R3 | Mot de passe : 8 caractères minimum, avec au moins une lettre et un chiffre |
| R4 | **Un seul pointage par agent et par jour** |
| R5 | Arrivée après 08:00 + 15 min de tolérance → statut « en retard ». Journée de moins de 4 h → « demi-journée » |
| R6 | Heures supplémentaires = heures travaillées − 8 h (jamais négatives) |
| R7 | Soldes annuels : occasionnel 12 j, maladie 10 j, payé 24 j. Congé sans solde : illimité. Remise à zéro au 1er janvier |
| R8 | Seuls les jours ouvrés (lundi à vendredi) sont comptés |
| R9 | Une demande est refusée si elle chevauche une autre demande en attente ou approuvée |
| R10 | Une demande est refusée si les jours demandés dépassent le solde moins les jours déjà en attente |
| R11 | Le solde est débité à l'approbation et recrédité si un congé approuvé est annulé |
| R12 | Un agent ne peut pas valider son propre congé |
| R13 | Un seul bulletin par agent et par mois. Un bulletin payé ne peut plus être modifié |
| R14 | Paie : logement = 15 % du salaire de base ; transport = 25 000 FCFA (non imposable) ; heure supplémentaire = taux horaire × 1,25 ; cotisation sociale = 5,6 % ; congé sans solde = jours × taux journalier ; impôt progressif (0 % jusqu'à 50 000, 10 %, 15 %, 20 %, 30 %) |
| R15 | Net = brut − retenues − impôt |
| R16 | Un agent ne voit jamais le salaire d'un collègue |
| R17 | Un dossier ne peut être clôturé qu'à la dernière étape du circuit |
| R18 | Un retour ou un rejet exige un motif ; une demande de pièces exige la liste des pièces |
| R19 | Seuls les RH, l'administrateur et le chef du service concerné affectent un agent traitant |
| R20 | Un dossier est « en retard » s'il est encore ouvert après sa date d'échéance |
| R21 | Pièces jointes : PDF, images, Word ou texte, 3 Mo maximum |
| R22 | Toute action sensible est enregistrée dans le journal d'audit |

## 2.5 Besoins non fonctionnels

| N° | Besoin |
| --- | --- |
| NF1 | **Sécurité** : mots de passe hachés (bcrypt), jeton JWT valable 8 h, requêtes SQL paramétrées, limitation des tentatives de connexion, en-têtes de sécurité |
| NF2 | **Confidentialité** : les données visibles dépendent du rôle |
| NF3 | **Responsive** : utilisable sur téléphone (menu repliable, cartes empilées) |
| NF4 | **Performance** : index sur les colonnes filtrées, pagination côté serveur |
| NF5 | **Fiabilité** : les opérations critiques (congés, paie, dossiers) passent par des transactions |
| NF6 | **Langue** : interface en français, montants en FCFA |
| NF7 | **Qualité** : tests automatiques et intégration continue |
| NF8 | **Accessibilité** : contraste suffisant, mode sombre, navigation au clavier dans les fenêtres |

## 2.6 Choix techniques

| Élément | Choix | Pourquoi |
| --- | --- | --- |
| Frontend | React 19 + Vite | Composants réutilisables, rechargement instantané en développement |
| Navigation | React Router 7 | Une adresse par page (`/employees`, `/projects/12`…) |
| Style | CSS3 pur (variables CSS) | Pas de dépendance, thème clair et sombre facile |
| Icônes | lucide-react | Icônes légères |
| Backend | Node.js 22 + Express 5 | JavaScript des deux côtés ; Express 5 gère les erreurs `async` |
| Base de données | PostgreSQL | Données très liées (agent ↔ département ↔ congé ↔ paie) : une base **relationnelle** convient mieux, avec des contraintes (unicité, clés étrangères) qui empêchent les incohérences |
| Accès à la base | `pg` (SQL direct) | On apprend le vrai SQL ; les requêtes sont visibles et optimisables |
| Authentification | JWT + bcryptjs | Standard, sans état côté serveur |
| PDF | pdfkit | Génère les bulletins et récépissés côté serveur |
| Sécurité HTTP | helmet, express-rate-limit, cors | Protections courantes |
| Tests | `node:test` (intégré à Node) | Aucune bibliothèque de test à installer |

## 2.7 Contraintes et livrables

**Contraintes** : fonctionner sur un poste Windows avec PostgreSQL local ; déployable gratuitement (Vercel pour le frontend, Render ou Railway pour le backend et la base) ; code sur GitHub.

**Livrables** :
1. Code source (dépôt `EMS`) : `client/` et `server/`.
2. Script de création de la base (`server/db/schema.sql`) et données de démonstration (`npm run seed`).
3. Tests automatiques (`server/tests/api.test.js`).
4. Documentation : ces 7 documents et le `README.md`.

## 2.8 Critères d'acceptation

| N° | Critère | Comment vérifier |
| --- | --- | --- |
| CA1 | Un agent ne peut pas pointer deux fois le même jour | Cliquer deux fois : message « déjà pointé » |
| CA2 | Un agent ne voit pas les salaires | Se connecter en agent, ouvrir Employés : pas de colonne salaire |
| CA3 | Le solde baisse à l'approbation et remonte à l'annulation | Demander 2 j, approuver en RH, annuler : solde revenu |
| CA4 | La paie génère un bulletin PDF correct | Paie → Générer → télécharger : net = brut − retenues − impôt |
| CA5 | Un dossier suit son circuit | Enregistrer, transmettre jusqu'à la dernière étape, clôturer : l'historique montre chaque étape |
| CA6 | Un agent n'accède pas aux dossiers qui ne le concernent pas | Adresse directe `/projects/1` en agent non concerné : « introuvable » |
| CA7 | L'application est utilisable sur mobile | Largeur 390 px : menu repliable, aucun défilement horizontal |
| CA8 | Les 33 tests passent | `npm test` avec `TEST_DATABASE_URL` défini |

---
Projet SIGRH (EMS) — documentation.
