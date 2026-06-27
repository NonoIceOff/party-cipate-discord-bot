import { SlashCommandBuilder } from 'discord.js';
import { resolveUser, getEvent, likeEvent, listEvents, apiError } from '../api.js';
import { autocompleteEvents } from '../autocomplete.js';

export const data = new SlashCommandBuilder()
  .setName('jaime')
  .setDescription('Ajoute un "J\'aime" à un événement Party-cipate.')
  .addIntegerOption((o) =>
    o
      .setName('event')
      .setDescription('L\'événement à aimer.')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction) {
  await autocompleteEvents(interaction, () => listEvents());
}

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const eventId = interaction.options.getInteger('event', true);

  try {
    const { token } = await resolveUser(interaction.user);
    const event = await getEvent(eventId);
    if (!event) {
      await interaction.editReply(`❌ Événement #${eventId} introuvable.`);
      return;
    }
    await likeEvent(token, eventId);
    await interaction.editReply(`❤️ Tu aimes **${event.name}** !`);
  } catch (err) {
    await interaction.editReply(`❌ ${apiError(err)}`);
  }
}
