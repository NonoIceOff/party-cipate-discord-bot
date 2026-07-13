import axios from 'axios';
import { config } from './config.js';

const http = axios.create({
  baseURL: config.apiUrl,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' }
});

// En-têtes pour les routes de confiance /api/bot.
function botHeaders() {
  return { 'x-bot-key': config.botApiKey };
}

// En-têtes pour agir au nom d'un utilisateur (JWT obtenu via resolveUser).
function userHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function avatarUrl(discordUser) {
  // discord.js fournit displayAvatarURL ; on force un format statique (png).
  try {
    return discordUser.displayAvatarURL({ extension: 'png', size: 256 });
  } catch {
    return null;
  }
}

/**
 * Résout (ou crée) le compte party-cipate d'un utilisateur Discord.
 * Renvoie { token, created, user } — le compte est créé sans mot de passe
 * la première fois qu'un membre interagit avec le bot.
 */
export async function resolveUser(discordUser) {
  const { data } = await http.post(
    '/bot/auth/discord',
    {
      discordId: discordUser.id,
      username: discordUser.username,
      avatarUrl: avatarUrl(discordUser)
    },
    { headers: botHeaders() }
  );
  return data; // { token, created, user }
}

/** Profil party-cipate d'un Discord ID (sans création). Renvoie null si absent. */
export async function getProfile(discordId) {
  try {
    const { data } = await http.get(`/bot/users/${discordId}`, { headers: botHeaders() });
    return data.user;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

/**
 * Productions de l'utilisateur (token) avec ses permissions par production
 * (is_chef, can_edit_events, can_draw, …). Sert au contrôle des droits du bot.
 */
export async function getMyProductions(token) {
  const { data } = await http.get('/productions/mine', { headers: userHeaders(token) });
  return Array.isArray(data) ? data : [];
}

/** Liste des channels + droits du user (au nom de son token). */
export async function getChannels(token) {
  const { data } = await http.get('/channels', { headers: userHeaders(token) });
  return data; // { channels, isAdmin, role }
}

/** Poste un message dans un channel au nom de l'utilisateur. */
export async function postMessage(token, channel, content) {
  const { data } = await http.post(
    `/channels/${channel}/messages`,
    { content },
    { headers: userHeaders(token) }
  );
  return data.message;
}

// ── Events Party-cipate ──

/** Liste publique des productions (id + nom). */
export async function listProductions() {
  const { data } = await http.get('/productions');
  return Array.isArray(data) ? data : [];
}

/** Liste tous les événements (public). */
export async function listEvents() {
  const { data } = await http.get('/events');
  return Array.isArray(data) ? data : [];
}

/** Détail d'un événement. Renvoie null si introuvable. */
export async function getEvent(eventId) {
  try {
    const { data } = await http.get(`/events/${eventId}`);
    return data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

/** Inscrit l'utilisateur (token) à un événement. */
export async function participate(token, eventId) {
  const { data } = await http.post(
    '/participations',
    { event_id: eventId },
    { headers: userHeaders(token) }
  );
  return data;
}

/** Désinscrit l'utilisateur d'un événement. */
export async function unparticipate(token, userId, eventId) {
  const { data } = await http.delete(
    `/participations/user/${userId}/event/${eventId}`,
    { headers: userHeaders(token) }
  );
  return data;
}

/** Indique si l'utilisateur est inscrit à un événement. */
export async function hasParticipated(token, userId, eventId) {
  const { data } = await http.get(
    `/participations/user/${userId}/event/${eventId}`,
    { headers: userHeaders(token) }
  );
  return Boolean(data.participated);
}

/** Liste les participations de l'utilisateur (token). */
export async function myParticipations(token, userId) {
  const { data } = await http.get(`/participations/user/${userId}`, {
    headers: userHeaders(token)
  });
  return Array.isArray(data) ? data : [];
}

/** Liste des participants d'un événement (avec pseudo + gagnants). */
export async function getParticipants(token, eventId) {
  const { data } = await http.get(`/participations/event/${eventId}`, {
    headers: userHeaders(token)
  });
  return Array.isArray(data) ? data : [];
}

/** Nombre de "J'aime" d'un événement (public). */
export async function getLikesCount(eventId) {
  try {
    const { data } = await http.get(`/votes/event/${eventId}`);
    return Number(data?.[0]?.count) || 0;
  } catch {
    return 0;
  }
}

/** Ajoute un "J'aime" sur un événement. */
export async function likeEvent(token, eventId) {
  const { data } = await http.post(
    '/votes',
    { event_id: eventId, value: 1 },
    { headers: userHeaders(token) }
  );
  return data;
}

// ── Gestion d'événements (propriétaire) ──

/** Crée un événement. Renvoie l'événement créé. */
export async function createEvent(token, payload) {
  const { data } = await http.post('/events', payload, {
    headers: userHeaders(token)
  });
  return data;
}

/** Met à jour un événement (propriétaire). */
export async function updateEvent(token, eventId, patch) {
  const { data } = await http.patch(`/events/${eventId}`, patch, {
    headers: userHeaders(token)
  });
  return data;
}

/** Supprime un événement (propriétaire). */
export async function deleteEvent(token, eventId) {
  await http.delete(`/events/${eventId}`, { headers: userHeaders(token) });
}

/** Lance le tirage au sort d'un événement (propriétaire). */
export async function drawLottery(token, eventId) {
  const { data } = await http.post(
    `/participations/event/${eventId}/draw`,
    {},
    { headers: userHeaders(token) }
  );
  return data;
}

/** Liste les événements créés par un utilisateur. */
export async function getMyEvents(userId) {
  const { data } = await http.get(`/events/user/${userId}`);
  return Array.isArray(data) ? data : [];
}

/** Liste des membres + rôles (admin uniquement). */
export async function listMembers(token) {
  const { data } = await http.get('/channels/members', { headers: userHeaders(token) });
  return data.members;
}

/** Modifie le rôle d'un membre party-cipate (admin uniquement). */
export async function setMemberRole(token, memberId, role) {
  const { data } = await http.patch(
    `/channels/members/${memberId}`,
    { role },
    { headers: userHeaders(token) }
  );
  return data;
}

// ── Mentions du chat (notification MP) ──

/**
 * Mentions @username pas encore notifiées par MP Discord. Le simple fait
 * d'appeler cette route les marque comme notifiées côté API (voir
 * getPendingMentionsForBot) : à n'appeler que juste avant l'envoi effectif.
 */
export async function getPendingMentions(limit = 30) {
  const { data } = await http.get('/bot/mentions/pending', {
    headers: botHeaders(),
    params: { limit }
  });
  return Array.isArray(data?.mentions) ? data.mentions : [];
}

/** Extrait un message d'erreur lisible d'une erreur axios. */
export function apiError(err) {
  return (
    err.response?.data?.error ||
    err.response?.data?.message ||
    err.message ||
    'Erreur inconnue'
  );
}
