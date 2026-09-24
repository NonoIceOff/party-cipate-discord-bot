import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getPendingConfirmations, answerConfirmation } from './api.js';
import { formatApiError } from './errors.js';

// Un candidat retenu doit confirmer sa venue. On sollicite au même rythme que
// les mentions : ce n'est jamais urgent à la seconde près.
const POLL_INTERVAL_MS = 20_000;
const DM_DELAY_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function confirmEmbed(item) {
  const when = formatDate(item.event_starts_at);
  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle('🎉 Tu es retenu(e) !')
    .setDescription(
      `Tu fais partie des candidats retenus pour **${item.event_name}**.\n\n` +
        'Confirme ta participation pour que l’organisateur sache qu’il peut compter sur toi.'
    );
  if (when) embed.addFields({ name: 'Date du tournage', value: when });
  return embed;
}

function confirmButtons(participationId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm:yes:${participationId}`)
      .setLabel('Je confirme')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`confirm:no:${participationId}`)
      .setLabel('Je ne peux pas')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Secondary)
  );
}

async function askOne(client, item) {
  try {
    const user = await client.users.fetch(item.discord_id);
    const payload = {
      embeds: [confirmEmbed(item)],
      components: [confirmButtons(item.participation_id)]
    };
    if (item.url) payload.content = item.url;
    await user.send(payload);
  } catch (err) {
    // MP fermés, membre parti… : la demande est déjà marquée envoyée côté API,
    // on ne réessaiera pas. L'organisateur voit le candidat rester « sélectionné ».
    console.error(
      `Confirmation #${item.participation_id} : MP non envoyé (${err.message}).`
    );
  }
}

async function pollOnce(client) {
  let items;
  try {
    items = await getPendingConfirmations();
  } catch (err) {
    console.error('Poll confirmations échoué :', err.message);
    return;
  }
  for (const item of items) {
    await askOne(client, item);
    await sleep(DM_DELAY_MS);
  }
}

export function startConfirmationNotifier(client) {
  setInterval(() => {
    pollOnce(client).catch((err) =>
      console.error('Poll confirmations (interval) échoué :', err.message)
    );
  }, POLL_INTERVAL_MS);
}

/**
 * Clic sur « Je confirme » / « Je ne peux pas ».
 * customId : confirm:<yes|no>:<participationId>
 */
export async function handleConfirmButton(interaction) {
  const [, action, rawId] = interaction.customId.split(':');
  const participationId = Number(rawId);
  if (!Number.isFinite(participationId) || (action !== 'yes' && action !== 'no')) return;

  await interaction.deferUpdate().catch(() => {});

  try {
    await answerConfirmation(participationId, action === 'yes' ? 'confirm' : 'decline');
  } catch (err) {
    await interaction
      .editReply({ content: formatApiError(err), components: [] })
      .catch(() => {});
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(action === 'yes' ? 0x22c55e : 0x6b7280)
    .setDescription(
      action === 'yes'
        ? '✅ Participation confirmée. Merci, à très vite sur le tournage !'
        : '✖️ C’est noté, tu ne participeras pas à ce tournage. Merci d’avoir prévenu.'
    );
  // On retire les boutons : la réponse est définitive côté organisateur.
  await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
}
