import { EmbedBuilder } from 'discord.js';
import { getPendingMentions } from './api.js';

// Cadence de poll : les mentions de chat sont plus fréquentes que les demandes
// de notification d'événement, mais un MP n'est jamais urgent à la seconde près.
const POLL_INTERVAL_MS = 20_000;
const DM_DELAY_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function mentionEmbed(mention) {
  return new EmbedBuilder()
    .setColor(0x818cf8)
    .setAuthor({ name: `💬 ${mention.from_username} vous a mentionné dans #${mention.channel_label}` })
    .setDescription(mention.content)
    .setTimestamp(mention.created_at ? new Date(mention.created_at) : new Date());
}

async function notifyOne(client, mention) {
  try {
    const user = await client.users.fetch(mention.discord_id);
    const embed = mentionEmbed(mention);
    if (mention.url) {
      await user.send({ embeds: [embed], content: mention.url });
    } else {
      await user.send({ embeds: [embed] });
    }
  } catch (err) {
    // MP fermés, utilisateur introuvable/parti… : on ignore, la mention est
    // déjà marquée notifiée côté API (pas de nouvelle tentative).
    console.error(`Mention #${mention.id} : MP non envoyé (${err.message}).`);
  }
}

async function pollOnce(client) {
  let mentions;
  try {
    mentions = await getPendingMentions();
  } catch (err) {
    console.error('Poll mentions échoué :', err.message);
    return;
  }
  for (const mention of mentions) {
    await notifyOne(client, mention);
    await sleep(DM_DELAY_MS);
  }
}

export function startMentionNotifier(client) {
  setInterval(() => {
    pollOnce(client).catch((err) => console.error('Poll mentions (interval) échoué :', err.message));
  }, POLL_INTERVAL_MS);
}
