import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Stockage local persistant (hors du dossier src, pour survivre aux redéploiements).
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
const file = join(dataDir, 'config.json');

let state = { guilds: {}, lastEventId: 0 };

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
  if (typeof state.lastEventId !== 'number') state.lastEventId = 0;
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

/**
 * Tous les salons d'annonces configurés, avec la production éventuellement
 * connectée au serveur : [{ guildId, channelId, productionId, productionName }].
 */
export function getAnnouncementChannels() {
  return Object.entries(state.guilds)
    .filter(([, g]) => g && g.announcementChannelId)
    .map(([guildId, g]) => ({
      guildId,
      channelId: g.announcementChannelId,
      productionId: g.productionId || null,
      productionName: g.productionName || null
    }));
}

/** Connecte un serveur à une production (filtre les annonces à cette production). */
export function setGuildProduction(guildId, productionId, productionName) {
  state.guilds[guildId] = {
    ...(state.guilds[guildId] || {}),
    productionId: String(productionId),
    productionName: productionName || null
  };
  save();
}

/** Déconnecte le serveur de sa production (toutes les annonces reviennent). */
export function clearGuildProduction(guildId) {
  if (state.guilds[guildId]) {
    delete state.guilds[guildId].productionId;
    delete state.guilds[guildId].productionName;
    save();
  }
}

/** Production connectée à un serveur : { productionId, productionName } ou null. */
export function getGuildProduction(guildId) {
  const g = state.guilds[guildId];
  if (!g || !g.productionId) return null;
  return { productionId: g.productionId, productionName: g.productionName || null };
}

/** Dernier id d'événement déjà annoncé (anti-doublon). */
export function getLastEventId() {
  return state.lastEventId;
}

export function setLastEventId(id) {
  state.lastEventId = Number(id) || 0;
  save();
}
