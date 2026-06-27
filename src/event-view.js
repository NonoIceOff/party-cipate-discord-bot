import {
  getEvent,
  getLikesCount,
  getParticipants,
  hasParticipated
} from './api.js';
import { eventEmbed, eventButtons } from './events-ui.js';

// Construit la vue complète d'un événement (embed + boutons) pour un membre donné.
// Détermine s'il est propriétaire, inscrit, le nombre de likes et les participants.
// Renvoie null si l'événement est introuvable.
export async function buildEventView(eventId, { token, user }) {
  const event = await getEvent(eventId);
  if (!event) return null;

  const isOwner = user && String(event.user_id) === String(user.id);

  const [likes, registered, participants] = await Promise.all([
    getLikesCount(eventId),
    // Tout le monde peut s'inscrire (organisateur compris) : on calcule l'état pour tous.
    token && user
      ? hasParticipated(token, user.id, eventId).catch(() => undefined)
      : Promise.resolve(undefined),
    // La liste des participants nécessite un token (route protégée).
    token ? getParticipants(token, eventId).catch(() => []) : Promise.resolve([])
  ]);

  return {
    event,
    isOwner,
    embed: eventEmbed(event, { registered, likes, participants }),
    components: eventButtons(event, { registered })
  };
}
