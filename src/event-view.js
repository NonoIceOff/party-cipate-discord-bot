import { getEvent, getLikesCount, getParticipants } from './api.js';
import { eventEmbed, eventButtons } from './events-ui.js';

// Construit la vue complète d'un événement (embed + boutons).
// Les boutons sont identiques pour tout le monde (jamais grisés selon l'utilisateur) :
// on ne calcule donc plus l'état d'inscription du membre courant.
// Renvoie null si l'événement est introuvable.
export async function buildEventView(eventId, { token, user }) {
  const event = await getEvent(eventId);
  if (!event) return null;

  const isOwner = user && String(event.user_id) === String(user.id);

  const [likes, participants] = await Promise.all([
    getLikesCount(eventId),
    // La liste des participants nécessite un token (route protégée).
    token ? getParticipants(token, eventId).catch(() => []) : Promise.resolve([])
  ]);

  return {
    event,
    isOwner,
    likes,
    embed: eventEmbed(event, { participants }),
    components: eventButtons(event)
  };
}
