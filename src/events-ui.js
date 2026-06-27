import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';

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

// Embed détaillé d'un événement.
// participants : liste optionnelle [{ username, is_selected }]
// likes : nombre de J'aime
export function eventEmbed(event, { registered, likes, participants } = {}) {
  const embed = new EmbedBuilder()
    .setTitle(`#${event.id} — ${event.name}`)
    .setColor(isEventJoinable(event) ? 0x22c55e : 0x6b7280)
    .setDescription(event.long_description || event.description || '*Aucune description.*')
    .addFields(
      { name: 'Statut', value: eventStatus(event), inline: true },
      {
        name: 'Demandes de participations',
        value: `${event.participants_count ?? participants?.length ?? 0}${
          Number(event.max_candidates) > 0 ? ` / ${event.max_candidates}` : ''
        }`,
        inline: true
      },
      { name: '❤️ J\'aime', value: String(likes ?? event.votes_count ?? 0), inline: true },
      { name: '📅 Date', value: formatEventDate(event.starts_at), inline: false }
    );

  if (typeof registered === 'boolean') {
    embed.addFields({
      name: 'Ton inscription',
      value: registered ? '✅ Tu es inscrit(e)' : '➖ Tu n\'es pas inscrit(e)',
      inline: false
    });
  }

  // Liste des demandes / candidats retenus (bornée pour rester sous la limite Discord).
  if (Array.isArray(participants) && participants.length) {
    const lines = participants.slice(0, 15).map((p) => {
      const name = p.username || 'Utilisateur';
      return p.is_selected ? `✅ **${name}** — Candidat` : `• ${name}`;
    });
    if (participants.length > 15) lines.push(`… +${participants.length - 15} autre(s)`);
    embed.addFields({
      name: event.draw_done ? 'Candidats retenus' : 'Demandes de participations',
      value: lines.join('\n').slice(0, 1024),
      inline: false
    });
  }

  if (event.creator_username) {
    embed.setFooter({ text: `Organisé par ${event.creator_username}` });
  }
  if (event.image_url) embed.setImage(event.image_url);
  return embed;
}

// Embed public pour annoncer un nouvel événement (sans données nécessitant un token).
export function announcementEmbed(event) {
  const embed = eventEmbed(event, {});
  embed.setAuthor({ name: '🎉 Nouvel événement Party-cipate !' });
  return embed;
}

// Boutons d'événement, identiques pour tout le monde. customId : evt:<action>:<eventId>.
// L'inscription / désinscription / J'aime sont ouverts à tous les membres,
// y compris l'organisateur. La gestion (ouvrir/fermer, tirage, suppression) se fait
// exclusivement via les commandes (/inscriptions, /tirage, /supprimer-event) avec
// contrôle des droits côté bot et côté API.
export function eventButtons(event, { registered } = {}) {
  const joinable = isEventJoinable(event);

  const memberRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`evt:join:${event.id}`)
      .setLabel('S\'inscrire')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!joinable || registered === true),
    new ButtonBuilder()
      .setCustomId(`evt:leave:${event.id}`)
      .setLabel('Se désinscrire')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(Boolean(event.draw_done) || registered === false),
    new ButtonBuilder()
      .setCustomId(`evt:like:${event.id}`)
      .setLabel('J\'aime')
      .setEmoji('❤️')
      .setStyle(ButtonStyle.Secondary)
  );

  return [memberRow];
}
