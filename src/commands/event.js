import { SlashCommandBuilder } from 'discord.js';
import { resolveUser, listEvents, apiError } from '../api.js';
import { buildEventView } from '../event-view.js';
import { autocompleteEvents } from '../autocomplete.js';

export const data = new SlashCommandBuilder()
  .setName('event')
  .setDescription('Affiche le détail d\'un événement Party-cipate.')
  .addIntegerOption((opt) =>
    opt
      .setName('event')
      .setDescription('L\'événement à afficher.')
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
    const { token, user } = await resolveUser(interaction.user);
    const view = await buildEventView(eventId, { token, user });
    if (!view) {
      await interaction.editReply(`❌ Événement #${eventId} introuvable.`);
      return;
    }
    await interaction.editReply({ embeds: [view.embed], components: view.components });
  } catch (err) {
    await interaction.editReply(`❌ ${apiError(err)}`);
  }
}
