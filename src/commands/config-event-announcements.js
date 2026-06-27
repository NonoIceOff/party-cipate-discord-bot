import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits
} from 'discord.js';
import {
  setAnnouncementChannel,
  clearAnnouncementChannel,
  getAnnouncementChannel
} from '../store.js';

export const data = new SlashCommandBuilder()
  .setName('config-event-announcements')
  .setDescription('Configure le salon où annoncer les nouveaux événements Party-cipate.')
  .addChannelOption((o) =>
    o
      .setName('salon')
      .setDescription('Salon texte où poster les annonces (défaut : salon courant).')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false)
  )
  .addBooleanOption((o) =>
    o.setName('desactiver').setDescription('Désactiver les annonces sur ce serveur.')
  )
  // Réservé aux membres pouvant gérer le serveur (admins).
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false);

export async function execute(interaction) {
  if (!interaction.guildId) {
    await interaction.reply({
      content: '❌ Cette commande s\'utilise sur un serveur.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Désactivation explicite.
  if (interaction.options.getBoolean('desactiver')) {
    clearAnnouncementChannel(interaction.guildId);
    await interaction.editReply('🔕 Annonces des nouveaux événements désactivées sur ce serveur.');
    return;
  }

  const channel = interaction.options.getChannel('salon') || interaction.channel;
  if (!channel || !channel.isTextBased?.()) {
    await interaction.editReply('❌ Choisis un salon texte valide.');
    return;
  }

  // Vérifie que le bot peut écrire dans ce salon.
  const me = interaction.guild?.members?.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (perms && !perms.has(PermissionFlagsBits.SendMessages)) {
    await interaction.editReply(
      `❌ Je n'ai pas la permission d'écrire dans ${channel}. Donne-moi l'accès puis réessaie.`
    );
    return;
  }

  const previous = getAnnouncementChannel(interaction.guildId);
  setAnnouncementChannel(interaction.guildId, channel.id);

  await interaction.editReply(
    previous
      ? `✅ Salon d'annonces mis à jour : les nouveaux événements seront postés dans ${channel}.`
      : `✅ C'est noté ! Les nouveaux événements Party-cipate seront annoncés dans ${channel}.`
  );
}
