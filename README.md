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
| `/modifier-event <event> [options]` | Modifie un de tes événements (ou, sans option, ouvre le menu de gestion avec le bouton **Notifier par MP**). | Organisateur |
| `/supprimer-event <event>` | Supprime un de tes événements (avec confirmation). | Organisateur |
| `/tirage <event>` | Lance le tirage au sort (avec confirmation). | Organisateur |
| `/gestion` | Tableau de bord de tes événements créés (stats). | Tous |
| `/setup` | Assistant unique : choisit la production puis le salon d'annonces (menus déroulants), ou déconnecte le serveur. | Admin serveur (Gérer le serveur) |

### Annonces automatiques des nouveaux événements

Un admin du serveur Discord lance **`/setup`** : un premier menu propose les
productions Party-cipate, un second propose les salons texte du serveur. Le bot
enregistre la production **et** le salon en une fois.

Tant que `/setup` n'a pas été fait, le bot **n'annonce rien**. Une fois configuré,
il **surveille l'API toutes les 30 s** et publie automatiquement un message
(embed + boutons S'inscrire / J'aime) dès qu'un nouvel événement **de la
production connectée** est créé — qu'il vienne du launcher **ou** de
`/creer-event`. Relance `/setup` puis « 🔌 Déconnecter ce serveur » pour couper les annonces.

La config (production + salon par serveur, et dernier événement annoncé) est
persistée dans `data/config.json`.

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

### Notifier un événement par messages privés

Deux points de déclenchement, **même comportement** :

- **Sur le site** (party-cipate) : bouton **« Notifier tous les membres en MP »**
  sur la page de modification d'un événement. Il appelle `POST /events/:id/notify`
  (pm-api) qui pose un champ `notify_requested_at` ; le bot le détecte à son poll
  (≤ 30 s) et envoie les MP — même mécanisme que l'annonce forcée.
- **Dans Discord** : bouton **« 📣 Notifier par messages privés »** dans
  `/modifier-event <event>` (avec **confirmation** immédiate).

Dans les deux cas, le bot envoie un MP proposant l'inscription à **tous les
membres** des serveurs Discord **connectés à la production de l'événement** (via
`/setup`) :

- Le ciblage suit le **même filtre par production** que les annonces automatiques :
  seuls les serveurs dont la production connectée correspond à celle de l'événement
  sont concernés.
- Les destinataires sont **dédoublonnés** : un membre présent sur plusieurs
  serveurs ne reçoit qu'**un seul** MP.
- L'envoi est **throttlé** (≈ 1 MP toutes les 0,8 s) pour respecter les limites
  Discord, et les membres qui ont fermé leurs MP sont simplement ignorés.

Chaque MP contient la fiche de l'événement et trois boutons :

- **S'inscrire** — inscrit directement le membre (crée son compte Party-cipate si besoin) ;
- **Pas intéressé** — referme la proposition, sans effet ;
- **Ne plus me notifier** — propose de se désabonner **de cette production** ou de
  **tout Party-cipate**. Ces choix sont **persistés** (`data/config.json`) et
  respectés lors des envois suivants.

> ⚠️ **Garde-fou anti-spam.** Par défaut, une **liste blanche** limite les envois
> réels au(x) seul(s) destinataire(s) autorisé(s) (`NOTIFY_ALLOWLIST`, `nonoice`
> par défaut). Tant que la valeur n'est pas passée à `*`, les autres membres **ne
> reçoivent rien**, même s'ils sont comptés dans le ciblage.

> ⚠️ **Intent privilégié requis.** Énumérer les membres d'un serveur nécessite
> l'intent **Server Members Intent** : active-le dans le *Developer Portal*
> (**Bot → Privileged Gateway Intents → Server Members Intent**), sinon le bot
> **refuse de démarrer**.

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
| `NOTIFY_ALLOWLIST` | (Optionnel) Liste blanche des destinataires des MP de notification (ID ou nom d'utilisateur Discord, séparés par des virgules). Défaut : `nonoice`. Mettre `*` pour notifier tout le monde. |

> ℹ️ Le bouton **Notifier par MP** requiert d'activer l'intent **Server Members
> Intent** dans le *Developer Portal* (voir la section _Notifier un événement par
> messages privés_).

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
