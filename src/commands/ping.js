import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Vérifie que le bot répond.');

export async function execute(interaction) {
  await interaction.reply({
    content: `Pong ! Latence : ${Math.round(interaction.client.ws.ping)} ms`,
    ephemeral: true
  });
}
