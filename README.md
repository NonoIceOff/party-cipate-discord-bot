# Party-cipate — Bot Discord

Bot Discord branché sur le système **Party-cipate** (l'API `pm-api`).

Quand un membre utilise une commande sans avoir de compte, son compte Party-cipate
est **créé automatiquement** (lié à son identité Discord, **sans mot de passe**).
Il peut ensuite se connecter au launcher via « Continuer avec Discord ».

## Fonctionnement

Le bot est un client de confiance : il s'authentifie auprès de l'API avec une clé
partagée (`BOT_API_KEY`) sur les routes `/api/bot`. Il n'utilise donc pas d'OAuth,
car l'identité Discord est déjà garantie par l'interaction (slash command).

Flux d'une commande :

1. Le bot appelle `POST /api/bot/auth/discord` → l'API résout (ou crée) le compte et
   renvoie un **JWT**.
2. Le bot utilise ce JWT sur les routes classiques `/api/channels` au nom du membre.
   Les autorisations (rôles, admin) restent gérées par l'API.

## Commandes

| Commande | Description | Accès |
| --- | --- | --- |
| `/ping` | Vérifie que le bot répond. | Tous |
| `/profil [membre]` | Affiche ton profil (crée ton compte si besoin) ou celui d'un membre. | Tous |
| `/dire <message>` | Poste un message dans `#général`. | Tous |
| `/annonce <message>` | Publie dans `#annonces`. | Staff (admin) |
| `/membres` | Liste les membres et leurs rôles. | Admin |
| `/role <membre> <role>` | Change le rôle d'un membre (admin/producteur/membre). | Admin |
| `/events [ouverts]` | Liste les événements (option `ouverts` pour filtrer). | Tous |
| `/event <event>` | Détail d'un événement + boutons contextuels (s'inscrire, J'aime, ou gestion si organisateur). | Tous |
| `/inscription <event>` | S'inscrire à un événement (autocomplétion des ouverts). | Tous |
| `/desinscription <event>` | Se désinscrire (autocomplétion de tes events). | Tous |
| `/mesevents` | Liste les événements auxquels tu es inscrit(e). | Tous |
| `/jaime <event>` | Ajoute un "J'aime" à un événement. | Tous |
| `/creer-event` | Crée un événement (nom, description, date, gagnants, image…). | Tous |
| `/modifier-event <event> [options]` | Modifie un de tes événements. | Organisateur |
| `/supprimer-event <event>` | Supprime un de tes événements (avec confirmation). | Organisateur |
| `/tirage <event>` | Lance le tirage au sort (avec confirmation). | Organisateur |
| `/gestion` | Tableau de bord de tes événements créés (stats). | Tous |
| `/config-event-announcements [salon] [desactiver]` | Configure le salon d'annonce automatique des nouveaux événements. | Admin serveur (Gérer le serveur) |

### Annonces automatiques des nouveaux événements

Un admin du serveur Discord lance `/config-event-announcements` (option `salon`,
sinon le salon courant) pour choisir où poster les annonces. Le bot **surveille
l'API toutes les 30 s** et publie automatiquement un message (embed + boutons
S'inscrire / J'aime) dès qu'un nouvel événement est créé — qu'il vienne du
launcher **ou** de `/creer-event`. `desactiver: true` coupe les annonces.

La config (salon par serveur + dernier événement annoncé) est persistée dans
`data/config.json`.

Les contrôles d'accès (admin, super-admin, propriétaire d'event) sont appliqués
**côté API**. Les commandes d'événements utilisent les routes party-cipate
existantes (`/api/events`, `/api/participations`, `/api/votes`) avec le JWT du membre.

### Fiche d'événement interactive

`/event` affiche un embed avec des **boutons contextuels** :
- **Membre** : S'inscrire / Se désinscrire / J'aime
- **Organisateur** : Ouvrir/Fermer les inscriptions / Tirage au sort / Supprimer

Les actions destructives (tirage, suppression) demandent une **confirmation**.
L'embed reflète en direct le statut, le nombre d'inscrits, de J'aime et la liste
des participants (avec les gagnants après tirage).

## Installation

```bash
npm install
cp .env.example .env   # puis remplir les valeurs
```

### Variables d'environnement

| Variable | Description |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Token du bot (Developer Portal > Bot). |
| `DISCORD_CLIENT_ID` | Application ID (Developer Portal > General Information). |
| `DISCORD_GUILD_ID` | (Optionnel) serveur de test pour un déploiement instantané. |
| `PM_API_URL` | Base de l'API, ex. `https://api.montdescartes.fr/api`. |
| `BOT_API_KEY` | Clé partagée — **identique** à `BOT_API_KEY` côté `pm-api`. |

## Démarrage

```bash
# 1. Enregistrer les commandes slash (à refaire si elles changent)
npm run deploy

# 2. Lancer le bot
npm start
# ou en dev (reload auto) :
npm run dev
```

## Côté pm-api

Ajouter dans le `.env` de `pm-api` :

```
BOT_API_KEY=la-meme-cle-que-le-bot
```

La route `/api/bot` est montée automatiquement dans `server.js`.
