import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { resolveUser, getEvent, participate } from './api.js';
import { eventEmbed } from './events-ui.js';
import { canManageEvent } from './permissions.js';
import {
  getGuildsForProduction,
  isNotifyOptedOut,
  optOutNotifyAll,
  optOutNotifyProduction
} from './store.js';
import { config } from './config.js';
import { PERM, formatApiError } from './errors.js';

// Délai entre deux MP pour rester correct vis-à-vis des limites Discord (anti-spam).
// ~1,25 MP/s : volontairement prudent car l'ouverture de nombreux salons privés est
// l'action la plus surveillée côté Discord.
const DM_DELAY_MS = 800;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Garde-fou : « * » autorise l'envoi à tous ; sinon seuls les membres de la liste
// blanche (config.notifyAllowlist) reçoivent réellement les MP.
const ALLOW_EVERYONE = config.notifyAllowlist.includes('*');

// Un membre est-il autorisé à recevoir un MP de notification (liste blanche) ?
function isAllowedRecipient(member) {
  if (ALLOW_EVERYONE) return true;
  const username = (member.user.username || '').toLowerCase();
  return (
    config.notifyAllowlist.includes(String(member.id)) ||
    config.notifyAllowlist.includes(username)
  );
}

// ───────────────────────────── Boutons ─────────────────────────────

/**
 * Rangée de gestion contenant le bouton « Notifier par messages privés ».
 * Affichée dans la réponse (éphémère) de /modifier-event, donc réservée de fait
 * à l'organisateur — le droit est malgré tout revérifié au clic.
 */
export function notifyButtonRow(event) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`notify:ask:${event.id}`)
      .setLabel('Notifier par messages privés')
      .setEmoji('📣')
      .setStyle(ButtonStyle.Primary)
  );
}

// Boutons proposés dans le MP envoyé à chaque membre.
function dmButtonRow(eventId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dm:join:${eventId}`)
      .setLabel("S'inscrire")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`dm:no:${eventId}`)
      .setLabel('Pas intéressé')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`dm:mute:${eventId}`)
      .setLabel('Ne plus me notifier')
      .setStyle(ButtonStyle.Danger)
  );
}

// Sous-menu du bouton « Ne plus me notifier » : production ciblée ou tout Party-cipate.
function dmMuteRow(eventId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dm:muteprod:${eventId}`)
      .setLabel('De cette production')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`dm:muteall:${eventId}`)
      .setLabel('De tout Party-cipate')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`dm:back:${eventId}`)
      .setLabel('Annuler')
      .setStyle(ButtonStyle.Secondary)
  );
}

// Embed du MP : la fiche de l'événement, avec un en-tête d'invitation.
function dmEmbed(event) {
  const embed = eventEmbed(event, {});
  embed.setAuthor({ name: "🎬 Un événement Party-cipate pourrait t'intéresser !" });
  return embed;
}

// ─────────────────────── Collecte + envoi des MP ───────────────────────

/**
 * Rassemble les membres à notifier : tous les membres humains des serveurs
 * connectés (via /setup) à la production de l'événement, dédoublonnés par
 * identifiant Discord (un membre présent sur plusieurs serveurs n'est compté
 * qu'une fois) et hors membres désabonnés.
 */
async function collectRecipients(client, event) {
  const guildIds = getGuildsForProduction(event.production_id);
  const recipients = new Map(); // discordId -> GuildMember (dédoublonnage)
  let reachedGuilds = 0;

  for (const guildId of guildIds) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue; // le bot n'est plus sur ce serveur
    reachedGuilds += 1;

    let members;
    try {
      // Nécessite l'intent privilégié « Server Members Intent ».
      members = await guild.members.fetch();
    } catch (err) {
      console.error(`Membres du serveur ${guildId} illisibles :`, err.message);
      continue;
    }

    for (const member of members.values()) {
      if (member.user.bot) continue;
      if (recipients.has(member.id)) continue; // déjà vu sur un autre serveur
      if (!isAllowedRecipient(member)) continue; // garde-fou liste blanche
      if (isNotifyOptedOut(member.id, event.production_id)) continue;
      recipients.set(member.id, member);
    }
  }

  return { recipients, reachedGuilds };
}

/**
 * Envoie les MP de notification pour un événement : collecte les destinataires
 * (serveurs connectés à la production, dédoublonnés, liste blanche, opt-outs) puis
 * envoie les MP. Utilisé par le bouton « Envoyer les MP » ET par l'annonceur quand
 * le site pose notify_requested_at. Renvoie un récapitulatif.
 */
export async function runNotify(client, event) {
  const { recipients, reachedGuilds } = await collectRecipients(client, event);
  const { sent, failed } = await sendNotifications(event, recipients);
  return { reachedGuilds, unique: recipients.size, sent, failed };
}

// Envoie le MP à chaque destinataire, séquentiellement et throttlé.
async function sendNotifications(event, recipients) {
  const embed = dmEmbed(event);
  const components = [dmButtonRow(event.id)];
  let sent = 0;
  let failed = 0;

  for (const member of recipients.values()) {
    try {
      await member.send({ embeds: [embed], components });
      sent += 1;
    } catch {
      // MP fermés, membre parti, bot bloqué… : on ignore et on continue.
      failed += 1;
    }
    await sleep(DM_DELAY_MS);
  }

  return { sent, failed };
}

// ───────────────────── Handlers d'interactions boutons ─────────────────────

/**
 * Boutons de déclenchement de la notification (côté organisateur, éphémère).
 * customId : notify:<ask|go|cancel>:<eventId>
 */
export async function handleNotifyButton(interaction) {
  const [, action, rawId] = interaction.customId.split(':');
  const eventId = Number(rawId);

  // Acquittement adapté À L'ACTION avant tout appel API (règle des 3 s Discord) :
  //  - cancel : édition immédiate du message (aucun appel réseau) ;
  //  - ask    : nouvelle réponse éphémère de confirmation → deferReply ;
  //  - go      : on édite le message de confirmation → deferUpdate.
  if (action === 'cancel') {
    await interaction.update({ content: 'Notification annulée.', components: [] }).catch(() => {});
    return;
  }
  if (action === 'ask') {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
  } else if (action === 'go') {
    await interaction.deferUpdate().catch(() => {});
  } else {
    return;
  }

  // Revérification des droits (l'API reste l'autorité finale).
  let ctx;
  let event;
  try {
    ctx = await resolveUser(interaction.user);
    event = await getEvent(eventId);
  } catch (err) {
    await interaction.editReply({ content: formatApiError(err), components: [] }).catch(() => {});
    return;
  }
  if (!event) {
    await interaction
      .editReply({ content: `❌ Événement #${eventId} introuvable.`, components: [] })
      .catch(() => {});
    return;
  }
  if (!(await canManageEvent(ctx.token, ctx.user, event, 'can_edit_events'))) {
    await interaction.editReply({ content: PERM.editEvent, components: [] }).catch(() => {});
    return;
  }

  if (action === 'ask') {
    const guildIds = getGuildsForProduction(event.production_id);
    const present = guildIds.filter((id) => interaction.client.guilds.cache.has(id));
    if (!present.length) {
      await interaction
        .editReply({
          content:
            '⚠️ Aucun serveur Discord n\'est connecté à la production de cet événement ' +
            '(via `/setup`). Personne ne peut être notifié pour le moment.',
          components: []
        })
        .catch(() => {});
      return;
    }

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`notify:go:${eventId}`)
        .setLabel('Envoyer les MP')
        .setEmoji('📤')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('notify:cancel:0')
        .setLabel('Annuler')
        .setStyle(ButtonStyle.Secondary)
    );

    const testNote = ALLOW_EVERYONE
      ? ''
      : `\n\n🧪 **Phase de test** : seuls les destinataires autorisés (${config.notifyAllowlist.join(', ')}) recevront réellement le MP.`;

    await interaction
      .editReply({
        content:
          `📣 Tu vas proposer l'inscription à **${event.name}** par message privé à **tous ` +
          `les membres** de **${present.length} serveur(s)** connecté(s) à cette production.\n` +
          '_Les membres qui ont fermé leurs MP ou qui se sont désabonnés ne seront pas ' +
          'dérangés. Un membre présent sur plusieurs serveurs ne reçoit qu\'un seul MP. ' +
          'L\'envoi peut prendre un moment._' +
          testNote,
        components: [confirmRow]
      })
      .catch(() => {});
    return;
  }

  // action === 'go'
  await interaction
    .editReply({ content: '📤 Envoi des notifications en cours…', components: [] })
    .catch(() => {});

  const { reachedGuilds, unique, sent, failed } = await runNotify(interaction.client, event);

  const summary =
    `✅ Notifications envoyées pour **${event.name}**.\n` +
    `• Serveurs ciblés : **${reachedGuilds}**\n` +
    `• Membres notifiés (uniques) : **${unique}**\n` +
    `• MP délivrés : **${sent}**` +
    (failed ? `\n• Non délivrés (MP fermés/partis) : **${failed}**` : '') +
    (ALLOW_EVERYONE ? '' : `\n🧪 _Phase de test : envois limités à ${config.notifyAllowlist.join(', ')}._`);

  await interaction.editReply({ content: summary, components: [] }).catch(() => {});
}

/**
 * Boutons dans les MP reçus par les membres.
 * customId : dm:<join|no|mute|muteprod|muteall|back>:<eventId>
 */
export async function handleDmButton(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const eventId = Number(parts[2]);

  switch (action) {
    case 'join': {
      // deferUpdate avant les appels API (règle des 3 s), puis on édite le MP.
      await interaction.deferUpdate().catch(() => {});
      try {
        const { token } = await resolveUser(interaction.user);
        await participate(token, eventId);
        await interaction.editReply({
          content: '✅ Inscription confirmée ! Retrouve l\'événement sur le launcher Party-cipate.',
          components: []
        });
      } catch (err) {
        await interaction
          .editReply({ content: formatApiError(err), components: [dmButtonRow(eventId)] })
          .catch(() => {});
      }
      return;
    }
    case 'no': {
      await interaction
        .update({ content: '👍 Pas de souci, on ne t\'embête plus avec cet événement.', components: [] })
        .catch(() => {});
      return;
    }
    case 'mute': {
      await interaction
        .update({ content: 'De quoi veux-tu ne plus être notifié(e) en MP ?', components: [dmMuteRow(eventId)] })
        .catch(() => {});
      return;
    }
    case 'muteprod': {
      // deferUpdate avant l'appel API (résolution de la production).
      await interaction.deferUpdate().catch(() => {});
      let event = null;
      try {
        event = await getEvent(eventId);
      } catch {
        /* événement introuvable : on garde le contexte disponible. */
      }
      const prodName = event?.production_name || 'cette production';
      optOutNotifyProduction(interaction.user.id, event?.production_id ?? null);
      await interaction
        .editReply({
          content: `🔕 C'est noté : tu ne recevras plus de notifications MP pour **${prodName}**.`,
          components: []
        })
        .catch(() => {});
      return;
    }
    case 'muteall': {
      optOutNotifyAll(interaction.user.id);
      await interaction
        .update({
          content: '🔕 C\'est noté : tu ne recevras plus aucune notification MP de Party-cipate.',
          components: []
        })
        .catch(() => {});
      return;
    }
    case 'back': {
      await interaction
        .update({ content: null, components: [dmButtonRow(eventId)] })
        .catch(() => {});
      return;
    }
    default:
      await interaction.update({ content: '❌ Action inconnue.', components: [] }).catch(() => {});
  }
}
