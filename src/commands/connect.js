import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { listProductions, apiError } from '../api.js';
import {
  setGuildProduction,
  clearGuildProduction,
  getGuildProduction,
  getAnnouncementChannel
} from '../store.js';

export const data = new SlashCommandBuilder()
  .setName('connect')
  .setDescription('Connecte ce serveur à une production Party-cipate.')
  // Réservé aux membres pouvant gérer le serveur (admins).
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName('production')
      .setDescription('Connecte le serveur à une production (filtre les annonces).')
      .addStringOption((o) =>
        o
          .setName('production')
          .setDescription('La production à connecter.')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName('reset')
      .setDescription('Déconnecte le serveur de sa production (annonce tout à nouveau).')
  )
  .addSubcommand((s) =>
    s.setName('statut').setDescription('Affiche la production connectée à ce serveur.')
  );

export async function autocomplete(interaction) {
  try {
    const focused = String(interaction.options.getFocused() || '').toLowerCase();
    const productions = await listProductions();
    const choices = productions
      .filter((p) => !focused || String(p.name).toLowerCase().includes(focused))
      .slice(0, 25)
      .map((p) => ({ name: String(p.name).slice(0, 100), value: String(p.id) }));
    await interaction.respond(choices);
  } catch {
    try {
      await interaction.respond([]);
    } catch {
      /* interaction expirée */
    }
  }
}

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

  try {
    if (sub === 'reset') {
      clearGuildProduction(interaction.guildId);
      await interaction.editReply(
        '🔌 Serveur déconnecté de sa production. Les annonces ne seront plus filtrées.'
      );
      return;
    }

    if (sub === 'statut') {
      const current = getGuildProduction(interaction.guildId);
      if (!current) {
        await interaction.editReply(
          'ℹ️ Ce serveur n\'est connecté à aucune production. Utilise `/connect production`.'
        );
        return;
      }
      await interaction.editReply(
        `🔗 Ce serveur est connecté à la production **${current.productionName ?? current.productionId}**.`
      );
      return;
    }

    // sub === 'production'
    const productionId = interaction.options.getString('production', true);
    const productions = await listProductions();
    const production = productions.find((p) => String(p.id) === String(productionId));
    if (!production) {
      await interaction.editReply('❌ Production introuvable. Choisis-en une dans la liste proposée.');
      return;
    }

    setGuildProduction(interaction.guildId, production.id, production.name);

    const channel = getAnnouncementChannel(interaction.guildId);
    const reminder = channel
      ? ''
      : '\n\n⚠️ Aucun salon d\'annonces n\'est encore configuré : utilise `/config-event-announcements` pour choisir où poster les annonces.';

    await interaction.editReply(
      `🔗 Serveur connecté à la production **${production.name}**.\nSeules les inscriptions/événements de cette production seront annoncés ici.${reminder}`
    );
  } catch (err) {
    await interaction.editReply(`❌ ${apiError(err)}`);
  }
}
