import { SlashCommandBuilder } from 'discord.js';
import { resolveUser, postMessage, apiError } from '../api.js';

export const data = new SlashCommandBuilder()
  .setName('dire')
  .setDescription('Poste un message dans le salon #général de Party-cipate.')
  .addStringOption((opt) =>
    opt
      .setName('message')
      .setDescription('Le message à envoyer.')
      .setRequired(true)
      .setMaxLength(2000)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const content = interaction.options.getString('message', true);

  try {
    const { token } = await resolveUser(interaction.user);
    await postMessage(token, 'general', content);
    await interaction.editReply('✅ Message publié dans #général sur Party-cipate.');
  } catch (err) {
    await interaction.editReply(`❌ ${apiError(err)}`);
  }
}
