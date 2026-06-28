import { listEvents } from './api.js';
import {
  getAnnouncementChannels,
  isAnnouncerInitialized,
  seedAnnouncerFromEvents,
  getEventStates,
  setEventStatesBatch
} from './store.js';
import { announcementEmbed, eventButtons } from './events-ui.js';

const POLL_INTERVAL_MS = 30_000;

function registrationsOpen(event) {
  return event.is_open !== false;
}

async function poll(client) {
  let events;
  try {
    events = await listEvents();
  } catch {
    return; // API indisponible : on réessaiera au prochain tick.
  }
  if (!events.length) return;

  // Premier passage : on enregistre l'existant sans rien annoncer.
  if (!isAnnouncerInitialized()) {
    seedAnnouncerFromEvents(events);
    return;
  }

  const states = getEventStates();
  // Filet de sécurité : état initialisé mais vide → seed sans annoncer.
  if (!Object.keys(states).length) {
    seedAnnouncerFromEvents(events);
    return;
  }

  const targets = getAnnouncementChannels();
  if (!targets.length) return;

  const toAnnounce = [];

  // On annonce quand les inscriptions s'ouvrent (et pas encore postées), OU
  // quand une annonce a été forcée manuellement (announce_requested_at récent)
  // — dans ce cas on (re)poste même si l'événement a déjà été annoncé.
  for (const event of events) {
    const id = String(event.id);
    const open = registrationsOpen(event);
    const prev = states[id];
    const reqAt = event.announce_requested_at ? String(event.announce_requested_at) : null;
    const isForced = !!reqAt && reqAt !== (prev?.forcedAt || null);
    if (isForced || (open && !prev?.announced)) {
      toAnnounce.push(event);
    }
  }

  if (!toAnnounce.length) {
    const sync = {};
    for (const event of events) {
      const id = String(event.id);
      const prev = states[id];
      const open = registrationsOpen(event);
      const forcedAt = prev?.forcedAt || null;
      if (!prev) {
        sync[id] = { isOpen: open, announced: false, forcedAt };
      } else if (prev.isOpen !== open) {
        sync[id] = { isOpen: open, announced: prev.announced, forcedAt };
      }
    }
    setEventStatesBatch(sync);
    return;
  }

  toAnnounce.sort((a, b) => Number(a.id) - Number(b.id));
  const announcedOk = new Set();

  for (const { channelId, productionIds } of targets) {
    if (!productionIds?.length) continue;

    const matching = toAnnounce.filter((e) =>
      productionIds.some((pid) => String(e.production_id) === String(pid))
    );
    if (!matching.length) continue;

    let channel;
    try {
      channel = await client.channels.fetch(channelId);
    } catch (err) {
      console.error(`Salon d'annonces ${channelId} introuvable :`, err.message);
      continue;
    }
    if (!channel?.isTextBased()) continue;

    for (const event of matching) {
      const id = String(event.id);
      try {
        await channel.send({
          embeds: [announcementEmbed(event)],
          components: eventButtons(event, {})
        });
        announcedOk.add(id);
      } catch (err) {
        console.error(`Annonce event #${event.id} -> salon ${channelId} échouée :`, err.message);
      }
    }
  }

  const batch = {};
  for (const event of events) {
    const id = String(event.id);
    const open = registrationsOpen(event);
    const prev = states[id];
    const reqAt = event.announce_requested_at ? String(event.announce_requested_at) : null;
    const announced = !!prev?.announced || announcedOk.has(id);
    // forcedAt n'avance que si la demande forcée a effectivement été postée.
    const prevForced = prev?.forcedAt || null;
    const forcedAt = announcedOk.has(id) && reqAt ? reqAt : prevForced;
    if (!prev || prev.isOpen !== open || prev.announced !== announced || prevForced !== forcedAt) {
      batch[id] = { isOpen: open, announced, forcedAt };
    }
  }
  setEventStatesBatch(batch);
}

// Démarre la surveillance des ouvertures d'inscriptions.
export function startAnnouncer(client) {
  void poll(client);
  setInterval(() => {
    void poll(client);
  }, POLL_INTERVAL_MS);
  console.log(
    `📣 Annonceur d'ouvertures d'inscriptions actif (toutes les ${POLL_INTERVAL_MS / 1000}s)`
  );
}
