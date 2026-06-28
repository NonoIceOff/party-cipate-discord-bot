import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Stockage local persistant (hors du dossier src, pour survivre aux redéploiements).
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
const file = join(dataDir, 'config.json');

let state = { guilds: {}, eventStates: {}, announcerInitialized: false };

function load() {
  try {
    if (existsSync(file)) {
      state = JSON.parse(readFileSync(file, 'utf8'));
    }
  } catch {
    /* fichier corrompu : on repart d'un état vide */
  }
  if (!state || typeof state !== 'object') state = {};
  if (!state.guilds) state.guilds = {};
  if (!state.eventStates || typeof state.eventStates !== 'object') state.eventStates = {};
  if (typeof state.announcerInitialized !== 'boolean') {
    state.announcerInitialized = false;
  }
  // Migration depuis l'ancien annonceur (lastEventId sans eventStates) :
  // on forcera un seed au prochain poll pour ne pas réannoncer l'existant.
  if (
    state.announcerInitialized &&
    !Object.keys(state.eventStates).length &&
    typeof state.lastEventId === 'number' &&
    state.lastEventId > 0
  ) {
    state.announcerInitialized = false;
  }
}

function save() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2));
}

load();

/** Définit le salon d'annonces des événements pour un serveur. */
export function setAnnouncementChannel(guildId, channelId) {
  state.guilds[guildId] = {
    ...(state.guilds[guildId] || {}),
    announcementChannelId: channelId
  };
  save();
}

/** Retire la config d'annonces d'un serveur. */
export function clearAnnouncementChannel(guildId) {
  if (state.guilds[guildId]) {
    delete state.guilds[guildId].announcementChannelId;
    save();
  }
}

/** Salon d'annonces configuré pour un serveur (ou null). */
export function getAnnouncementChannel(guildId) {
  return state.guilds[guildId]?.announcementChannelId || null;
}

// Normalise les productions d'un serveur vers [{ id, name }], en gérant
// l'ancien format mono-production (productionId / productionName).
function normalizeGuildProductions(g) {
  if (!g) return [];
  if (Array.isArray(g.productions)) {
    return g.productions
      .filter((p) => p && p.id != null)
      .map((p) => ({ id: String(p.id), name: p.name || null }));
  }
  if (g.productionId) {
    return [{ id: String(g.productionId), name: g.productionName || null }];
  }
  return [];
}

/**
 * Tous les salons d'annonces configurés, avec les productions éventuellement
 * connectées au serveur :
 * [{ guildId, channelId, productionIds: string[], productions: [{ id, name }] }].
 */
export function getAnnouncementChannels() {
  return Object.entries(state.guilds)
    .filter(([, g]) => g && g.announcementChannelId)
    .map(([guildId, g]) => {
      const productions = normalizeGuildProductions(g);
      return {
        guildId,
        channelId: g.announcementChannelId,
        productionIds: productions.map((p) => p.id),
        productions
      };
    });
}

/**
 * Connecte un serveur à une ou plusieurs productions (filtre les annonces).
 * productions : tableau de { id, name }.
 */
export function setGuildProductions(guildId, productions) {
  const list = (Array.isArray(productions) ? productions : [])
    .filter((p) => p && p.id != null)
    .map((p) => ({ id: String(p.id), name: p.name || null }));
  state.guilds[guildId] = {
    ...(state.guilds[guildId] || {}),
    productions: list
  };
  // Nettoie l'ancien format mono-production.
  delete state.guilds[guildId].productionId;
  delete state.guilds[guildId].productionName;
  save();
}

/** Déconnecte le serveur de toutes ses productions (plus aucune annonce). */
export function clearGuildProductions(guildId) {
  if (state.guilds[guildId]) {
    delete state.guilds[guildId].productions;
    delete state.guilds[guildId].productionId;
    delete state.guilds[guildId].productionName;
    save();
  }
}

/** Productions connectées à un serveur : [{ productionId, productionName }]. */
export function getGuildProductions(guildId) {
  return normalizeGuildProductions(state.guilds[guildId]).map((p) => ({
    productionId: p.id,
    productionName: p.name || null
  }));
}

/** L'annonceur a-t-il déjà été initialisé (évite de spammer l'existant au boot) ? */
export function isAnnouncerInitialized() {
  return !!state.announcerInitialized;
}

/** État connu par événement : { [eventId]: { isOpen, announced } }. */
export function getEventStates() {
  return state.eventStates || {};
}

/**
 * Initialise l'annonceur : marque tous les événements existants comme déjà traités
 * (aucune annonce rétroactive).
 */
export function seedAnnouncerFromEvents(events) {
  const next = { ...(state.eventStates || {}) };
  for (const e of events) {
    const id = String(e.id);
    next[id] = {
      isOpen: e.is_open !== false,
      announced: true,
      // Baseline : on mémorise la demande d'annonce existante pour ne pas
      // la rejouer au démarrage.
      forcedAt: e.announce_requested_at ? String(e.announce_requested_at) : null
    };
  }
  state.eventStates = next;
  state.announcerInitialized = true;
  save();
}

/** Met à jour l'état de plusieurs événements en une seule écriture disque. */
export function setEventStatesBatch(updates) {
  if (!updates || !Object.keys(updates).length) return;
  state.eventStates = { ...(state.eventStates || {}), ...updates };
  save();
}
