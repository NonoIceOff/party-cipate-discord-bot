import { SlashCommandBuilder } from 'discord.js';
import {
  resolveUser,
  getEvent,
  unparticipate,
  listEvents,
  myParticipations,
  apiError
} from '../api.js';
import { autocompleteEvents } from '../autocomplete.js';

export const data = new SlashCommandBuilder()
  .setName('desinscription')
  .setDescription('Désinscris-toi d\'un événement Party-cipate.')
  .addIntegerOption((opt) =>
    opt
      .setName('event')
      .setDescription('L\'événement à quitter.')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction) {
  // Propose uniquement les événements auxquels le membre est inscrit.
  await autocompleteEvents(interaction, async () => {
    const { token, user } = await resolveUser(interaction.user);
    const [parts, events] = await Promise.all([
      myParticipations(token, user.id),
      listEvents()
    ]);
    const ids = new Set(parts.map((p) => Number(p.event_id)));
    return events.filter((e) => ids.has(Number(e.id)));
  });
}

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const eventId = interaction.options.getInteger('event', true);

  try {
    const { token, user } = await resolveUser(interaction.user);
    const event = await getEvent(eventId);
    const label = event ? `**${event.name}**` : `l'événement #${eventId}`;

    await unparticipate(token, user.id, eventId);
    await interaction.editReply(`✅ Tu es désinscrit(e) de ${label}.`);
  } catch (err) {
    const status = err.response?.status;
    if (status === 404) {
      await interaction.editReply('ℹ️ Tu n\'étais pas inscrit(e) à cet événement.');
      return;
    }
    await interaction.editReply(`❌ ${apiError(err)}`);
  }
}
