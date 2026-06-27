import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { clearGuildProduction, getGuildProduction } from '../store.js';

export const data = new SlashCommandBuilder()
  .setName('connect')
  .setDescription('Gère la production connectée à ce serveur.')
  // Réservé aux membres pouvant gérer le serveur (admins).
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((s) =>
    s.setName('statut').setDescription('Affiche la production connectée à ce serveur.')
  )
  .addSubcommand((s) =>
    s
      .setName('reset')
      .setDescription('Déconnecte le serveur de sa production (stoppe les annonces).')
  );

export async function execute(interaction) {
  if (!interaction.guildId) {
    await interaction.reply({
      content: '❌ Cette commande s\'utilise sur un serveur.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const sub = interaction.options.getSubcommand();

  if (sub === 'reset') {
    clearGuildProduction(interaction.guildId);
    await interaction.editReply(
      '🔌 Serveur déconnecté de sa production. Plus aucune annonce ne sera postée tant que tu n’as pas relancé `/setup`.'
    );
    return;
  }

  // sub === 'statut'
  const current = getGuildProduction(interaction.guildId);
  if (!current) {
    await interaction.editReply(
      'ℹ️ Ce serveur n\'est connecté à aucune production. Utilise `/setup` pour le configurer.'
    );
    return;
  }
  await interaction.editReply(
    `🔗 Ce serveur est connecté à la production **${current.productionName ?? current.productionId}**.\n_Pour changer : relance \`/setup\`._`
  );
}
