import { listEvents } from './api.js';
import {
  getAnnouncementChannels,
  isAnnouncerInitialized,
  seedAnnouncerFromEvents,
  getEventStates,
  setEventStatesBatch,
  recordEventMessage,
  getEventMessages,
  getAllEventMessages,
  forgetEventMessage
} from './store.js';
import { announcementEmbed, eventButtons } from './events-ui.js';

const POLL_INTERVAL_MS = 30_000;

// Codes d'erreur Discord pour lesquels une référence de message est définitivement
// invalide (on peut alors l'oublier sans risque).
const GONE_CODES = new Set([10008 /* Unknown Message */, 10003 /* Unknown Channel */]);

// Profondeur du scan rétroactif des salons d'annonces (Discord limite chaque page
// à 100 messages : on pagine pour rattraper d'anciens embeds postés automatiquement).
const REPAIR_SCAN_PAGES = 5; // jusqu'à ~500 messages par salon

function registrationsOpen(event) {
  return event.is_open !== false;
}

// Extrait l'eventId d'un message du bot à partir de ses boutons (customId evt:<a>:<id>).
function eventIdFromMessage(message) {
  for (const row of message.components ?? []) {
    for (const comp of row.components ?? []) {
      const id = comp.customId ?? comp.custom_id ?? null;
      if (id && id.startsWith('evt:')) {
        const n = Number(id.split(':')[2]);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return null;
}

// Resynchronise UNIQUEMENT les boutons des messages déjà postés pour un événement.
// On ne touche pas à l'embed : on corrige seulement l'état grisé/actif des boutons
// (jamais grisés sauf événement fermé).
async function syncEventButtons(client, event) {
  const refs = getEventMessages(event.id);
  if (!refs.length) return;
  const components = eventButtons(event);
  for (const { channelId, messageId } of refs) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased()) continue;
      const msg = await channel.messages.fetch(messageId);
      if (msg?.editable) await msg.edit({ components });
    } catch (err) {
      if (GONE_CODES.has(err?.code)) forgetEventMessage(event.id, channelId, messageId);
    }
  }
}

// Réparation au démarrage : recorrige les boutons de TOUS les messages d'inscription.
// 1) Messages déjà mémorisés (persistés) → on resynchronise leurs boutons.
// 2) Rattrapage : on scanne les salons d'annonces pour retrouver d'anciens messages
//    du bot non encore mémorisés, on les enregistre et on corrige leurs boutons.
// Objectif : aucun bouton grisé à tort après un redéploiement, sans rien réannoncer.
export async function repairEventMessages(client) {
  let events;
  try {
    events = await listEvents();
  } catch {
    return;
  }
  const eventMap = new Map(events.map((e) => [String(e.id), e]));

  // 1) Messages déjà connus.
  const trackedIds = new Set(getAllEventMessages().map((m) => String(m.eventId)));
  for (const eid of trackedIds) {
    const event = eventMap.get(eid);
    if (event) await syncEventButtons(client, event);
  }

  // 2) Rattrapage des anciens messages d'inscription postés automatiquement :
  //    on scanne (avec pagination) les salons d'annonces pour retrouver les embeds
  //    du bot, les mémoriser et corriger leurs boutons — de façon rétroactive.
  for (const { channelId } of getAnnouncementChannels()) {
    let channel;
    try {
      channel = await client.channels.fetch(channelId);
    } catch {
      continue;
    }
    if (!channel?.isTextBased()) continue;

    let before;
    for (let page = 0; page < REPAIR_SCAN_PAGES; page += 1) {
      let messages;
      try {
        messages = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      } catch {
        break;
      }
      if (!messages.size) break;

      for (const msg of messages.values()) {
        before = msg.id; // plus ancien id vu → page suivante
        if (msg.author?.id !== client.user?.id) continue;
        const eventId = eventIdFromMessage(msg);
        if (eventId == null) continue;
        const event = eventMap.get(String(eventId));
        if (!event) continue;
        recordEventMessage(eventId, channelId, msg.id);
        if (msg.editable) {
          await msg.edit({ components: eventButtons(event) }).catch(() => {});
        }
      }

      if (messages.size < 100) break; // dernière page atteinte
    }
  }
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

  // Événements dont l'état ouvert/fermé a changé → resynchroniser les boutons
  // des messages déjà postés (sans attendre un clic).
  for (const event of events) {
    const prev = states[String(event.id)];
    if (prev && prev.isOpen !== registrationsOpen(event)) {
      await syncEventButtons(client, event);
    }
  }

  const targets = getAnnouncementChannels();

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

  // Rien à annoncer (ou aucun salon configuré) : on se contente de mettre à jour l'état.
  if (!toAnnounce.length || !targets.length) {
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
        const sent = await channel.send({
          embeds: [announcementEmbed(event)],
          components: eventButtons(event)
        });
        // On mémorise le message pour pouvoir resynchroniser ses boutons plus tard
        // (ouverture/fermeture, réparation au redémarrage…).
        recordEventMessage(event.id, channelId, sent.id);
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
  // Au démarrage : on répare d'abord les boutons des messages existants,
  // puis on lance le premier passage de l'annonceur.
  void (async () => {
    await repairEventMessages(client);
    await poll(client);
  })();
  setInterval(() => {
    void poll(client);
  }, POLL_INTERVAL_MS);
  console.log(
    `📣 Annonceur d'ouvertures d'inscriptions actif (toutes les ${POLL_INTERVAL_MS / 1000}s)`
  );
}
