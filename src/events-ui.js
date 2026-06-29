import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';

// URL publique du site (pour le lien "Plus d'informations").
const SITE_URL = (process.env.SITE_URL || 'https://party-cipate-next.vercel.app').replace(
  /\/$/,
  ''
);

// Nombre maximum de candidatures listées dans l'embed (limite Discord 1024 car.).
const MAX_LISTED = 20;

// Une date party-cipate peut être absurde (ex: année +111111) si mal saisie :
// on l'affiche prudemment.
export function formatEventDate(iso) {
  if (!iso) return 'Date non précisée';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Date non précisée';
  const year = d.getFullYear();
  if (year < 2000 || year > 3000) return 'Date non précisée';
  return d.toLocaleString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Parse une date saisie en texte (ex: "2026-07-15 20:00", "2026-07-15").
// Renvoie une chaîne ISO, ou null si invalide. Une date vide renvoie null sans erreur.
export function parseEventDate(raw) {
  if (!raw || !String(raw).trim()) return null;
  let s = String(raw).trim().replace(' ', 'T');
  // "2026-07-15" → ajoute une heure par défaut.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  if (year < 2000 || year > 3000) return null;
  return d.toISOString();
}

export function eventStatus(event) {
  if (event.draw_done) return '🎲 Tirage effectué';
  if (event.is_open === false) return '🔒 Inscriptions fermées';
  return '🟢 Inscriptions ouvertes';
}

export function isEventJoinable(event) {
  return event.is_open !== false && !event.draw_done;
}

// Résumé court pour une liste d'événements.
export function eventLine(event) {
  const places =
    Number(event.max_candidates) > 0 ? ` • ${event.max_candidates} place(s)` : '';
  return [
    `**#${event.id} — ${event.name}**`,
    `${eventStatus(event)} • 👥 ${event.participants_count ?? 0} demande(s) de participation${places}`,
    event.starts_at ? `📅 ${formatEventDate(event.starts_at)}` : null
  ]
    .filter(Boolean)
    .join('\n');
}

// Construit le champ listant les candidatures (demandes ou candidats retenus).
function candidaturesField(event, participants) {
  const list = Array.isArray(participants) ? participants : [];

  if (event.draw_done) {
    const winners = list.filter((p) => p.is_selected || p.is_valid);
    const max = Number(event.max_candidates) > 0 ? `/${event.max_candidates}` : '';
    const value = winners.length
      ? winners
          .slice(0, MAX_LISTED)
          .map((p) => `• ${p.username || 'Utilisateur'}`)
          .join('\n')
      : 'Aucun candidat retenu.';
    return {
      name: `Candidats retenus (${winners.length}${max})`,
      value: value.slice(0, 1024)
    };
  }

  const state = isEventJoinable(event) ? 'ouvertes' : 'fermées';
  let value;
  if (list.length) {
    const lines = list.slice(0, MAX_LISTED).map((p) => `• ${p.username || 'Utilisateur'}`);
    if (list.length > MAX_LISTED) lines.push(`… +${list.length - MAX_LISTED} autre(s)`);
    value = lines.join('\n');
  } else {
    const count = event.participants_count ?? 0;
    value = count > 0 ? `${count} demande(s) de candidature` : 'Aucune demande pour le moment.';
  }
  return { name: `Demandes de candidatures (${state})`, value: value.slice(0, 1024) };
}

// Embed détaillé d'un événement.
// participants : liste optionnelle [{ username, is_selected }]
// likes : nombre de J'aime (conservé pour compat, non affiché dans la maquette)
export function eventEmbed(event, { participants } = {}) {
  const title = event.production_name
    ? `${event.name} (${event.production_name})`
    : event.name;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(isEventJoinable(event) ? 0x22c55e : 0x6b7280)
    .setDescription(event.long_description || event.description || '*Aucune description.*');

  const fields = [];

  // Temps de tournage (optionnel : seulement si l'événement le renseigne).
  if (event.duration) {
    fields.push({ name: 'Temps de tournage', value: String(event.duration), inline: true });
  }

  fields.push({
    name: 'Date de tournage',
    value: formatEventDate(event.starts_at),
    inline: true
  });

  fields.push(candidaturesField(event, participants));

  fields.push({
    name: "Plus d'informations via party-cipate",
    value: `${SITE_URL}/event/${event.id}`
  });

  embed.addFields(fields);

  if (event.image_url) embed.setThumbnail(event.image_url);
  if (event.creator_username) {
    embed.setFooter({
      text: `Organisé par ${event.creator_username}`,
      iconURL: event.profile_picture || undefined
    });
  }
  return embed;
}

// Embed public pour annoncer un nouvel événement (sans données nécessitant un token).
export function announcementEmbed(event) {
  const embed = eventEmbed(event, {});
  embed.setAuthor({ name: '🎉 Nouvel événement Party-cipate !' });
  return embed;
}

// Boutons d'événement, STRICTEMENT IDENTIQUES pour tout le monde.
// customId : evt:<action>:<eventId>.
//
// On ne grise JAMAIS un bouton en fonction de l'utilisateur : le message est public
// et partagé par tous les membres. C'est l'action déclenchée au clic qui gère
// l'inscription/désinscription de la personne (l'API reste l'autorité finale).
// Seul l'état de l'événement compte : quand l'événement est fermé (inscriptions
// fermées ou tirage effectué), on désactive l'inscription et la désinscription.
// Le bouton « J'aime » reste toujours actif.
export function eventButtons(event) {
  const joinable = isEventJoinable(event);

  const memberRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`evt:join:${event.id}`)
      .setLabel('S\'inscrire')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!joinable),
    new ButtonBuilder()
      .setCustomId(`evt:leave:${event.id}`)
      .setLabel('Se désinscrire')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!joinable),
    new ButtonBuilder()
      .setCustomId(`evt:like:${event.id}`)
      .setLabel('J\'aime')
      .setEmoji('❤️')
      .setStyle(ButtonStyle.Secondary)
  );

  return [memberRow];
}
