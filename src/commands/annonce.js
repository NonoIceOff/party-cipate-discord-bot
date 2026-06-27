import { SlashCommandBuilder } from 'discord.js';
import { resolveUser, postMessage, apiError } from '../api.js';

export const data = new SlashCommandBuilder()
  .setName('annonce')
  .setDescription('Publie une annonce dans #annonces (réservé au staff).')
  .addStringOption((opt) =>
    opt
      .setName('message')
      .setDescription('Le contenu de l\'annonce.')
      .setRequired(true)
      .setMaxLength(2000)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const content = interaction.options.getString('message', true);

  try {
    const { token } = await resolveUser(interaction.user);
    // L'autorisation (admin only) est vérifiée côté API : un non-admin reçoit 403.
    await postMessage(token, 'annonces', content);
    await interaction.editReply('✅ Annonce publiée dans #annonces sur Party-cipate.');
  } catch (err) {
    await interaction.editReply(`❌ ${apiError(err)}`);
  }
}
