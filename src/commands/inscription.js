import { SlashCommandBuilder } from 'discord.js';
import {
  resolveUser,
  getEvent,
  participate,
  listEvents,
  apiError
} from '../api.js';
import { isEventJoinable } from '../events-ui.js';
import { autocompleteEvents } from '../autocomplete.js';

export const data = new SlashCommandBuilder()
  .setName('inscription')
  .setDescription('Inscris-toi à un événement Party-cipate.')
  .addIntegerOption((opt) =>
    opt
      .setName('event')
      .setDescription('L\'événement auquel t\'inscrire.')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction) {
  // On ne propose que les événements ouverts aux inscriptions.
  await autocompleteEvents(interaction, async () =>
    (await listEvents()).filter(isEventJoinable)
  );
}

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const eventId = interaction.options.getInteger('event', true);

  try {
    const event = await getEvent(eventId);
    if (!event) {
      await interaction.editReply(`❌ Événement #${eventId} introuvable.`);
      return;
    }

    const { token } = await resolveUser(interaction.user);
    const result = await participate(token, eventId);

    // L'API renvoie 200 + message si l'inscription existait déjà.
    if (result?.message === 'Participation already exists') {
      await interaction.editReply(`ℹ️ Tu es déjà inscrit(e) à **${event.name}**.`);
      return;
    }

    await interaction.editReply(`✅ Inscription confirmée à **${event.name}** !`);
  } catch (err) {
    await interaction.editReply(`❌ ${apiError(err)}`);
  }
}
