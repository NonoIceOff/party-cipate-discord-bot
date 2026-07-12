import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { resolveUser } from '../api.js';

export const data = new SlashCommandBuilder()
  .setName('recheck')
  .setDescription(
    'Repeuple les comptes party-cipate de tous les membres de tous les serveurs du bot (admin).'
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

// Délai entre deux résolutions de compte, pour rester correct vis-à-vis de l'API
// et des limites Discord (fetch de membres + appels HTTP répétés).
const DELAY_MS = 150;
const PROGRESS_EVERY = 25;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function execute(interaction) {
  // Garde-fou en plus de la restriction Discord (setDefaultMemberPermissions),
  // au cas où un admin de serveur aurait ouvert la commande à d'autres membres.
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ Réservé aux administrateurs du serveur.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await interaction.editReply('🔄 Repeuplement en cours — parcours de tous les serveurs…');

  const client = interaction.client;

  // Dédoublonnage : un même membre présent sur plusieurs serveurs du bot
  // n'est traité qu'une seule fois.
  const membersByDiscordId = new Map();
  let reachedGuilds = 0;

  for (const guild of client.guilds.cache.values()) {
    let members;
    try {
      members = await guild.members.fetch();
    } catch (err) {
      console.error(`Impossible de récupérer les membres de ${guild.name} :`, err.message);
      continue;
    }
    reachedGuilds += 1;
    for (const member of members.values()) {
      if (member.user.bot) continue;
      if (!membersByDiscordId.has(member.id)) membersByDiscordId.set(member.id, member.user);
    }
  }

  const total = membersByDiscordId.size;
  let created = 0;
  let existing = 0;
  let failed = 0;
  let processed = 0;

  for (const user of membersByDiscordId.values()) {
    try {
      const { created: wasCreated } = await resolveUser(user);
      if (wasCreated) created += 1;
      else existing += 1;
    } catch (err) {
      failed += 1;
      console.error(`Échec resolveUser pour ${user.username} (${user.id}) :`, err.message);
    }

    processed += 1;
    if (processed % PROGRESS_EVERY === 0 && processed < total) {
      await interaction
        .editReply(`🔄 Repeuplement en cours… ${processed}/${total} membres traités.`)
        .catch(() => {});
    }
    await sleep(DELAY_MS);
  }

  const summary =
    `✅ Repeuplement terminé.\n` +
    `• Serveurs parcourus : **${reachedGuilds}**\n` +
    `• Membres uniques traités : **${total}**\n` +
    `• Nouveaux comptes créés : **${created}**\n` +
    `• Comptes déjà existants : **${existing}**` +
    (failed ? `\n• Échecs : **${failed}**` : '');

  await interaction.editReply(summary).catch(() => {});
}
