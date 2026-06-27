import { listEvents } from './api.js';
import {
  getAnnouncementChannels,
  getLastEventId,
  setLastEventId
} from './store.js';
import { announcementEmbed, eventButtons } from './events-ui.js';

const POLL_INTERVAL_MS = 30_000;

function maxEventId(events) {
  return events.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0);
}

async function poll(client) {
  let events;
  try {
    events = await listEvents();
  } catch {
    return; // API indisponible : on réessaiera au prochain tick.
  }
  if (!events.length) return;

  const last = getLastEventId();

  // Première exécution (ou état neuf) : on fixe la référence sans rien annoncer
  // pour ne pas spammer avec les événements déjà existants.
  if (last === 0) {
    setLastEventId(maxEventId(events));
    return;
  }

  const fresh = events
    .filter((e) => Number(e.id) > last)
    .sort((a, b) => Number(a.id) - Number(b.id));
  if (!fresh.length) return;

  const targets = getAnnouncementChannels();

  // On parcourt salon par salon. Tant qu'un serveur n'a pas été connecté à une
  // production via /connect, il n'annonce RIEN (même si un salon est configuré).
  // Une fois connecté, il ne reçoit que les événements de cette production.
  for (const { channelId, productionId } of targets) {
    if (!productionId) continue;

    const toAnnounce = fresh.filter(
      (e) => String(e.production_id) === String(productionId)
    );
    if (!toAnnounce.length) continue;

    let channel;
    try {
      channel = await client.channels.fetch(channelId);
    } catch (err) {
      console.error(`Salon d'annonces ${channelId} introuvable :`, err.message);
      continue;
    }
    if (!channel?.isTextBased()) continue;

    for (const event of toAnnounce) {
      try {
        await channel.send({
          embeds: [announcementEmbed(event)],
          components: eventButtons(event, {})
        });
      } catch (err) {
        console.error(`Annonce event #${event.id} -> salon ${channelId} échouée :`, err.message);
      }
    }
  }

  setLastEventId(Math.max(last, maxEventId(events)));
}

// Démarre la surveillance des nouveaux événements.
export function startAnnouncer(client) {
  // Initialise la référence au démarrage (sans annoncer l'existant).
  void poll(client);
  setInterval(() => {
    void poll(client);
  }, POLL_INTERVAL_MS);
  console.log(`📣 Annonceur d'événements actif (toutes les ${POLL_INTERVAL_MS / 1000}s)`);
}
