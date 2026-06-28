import { SlashCommandBuilder } from 'discord.js';
import { resolveUser, getEvent } from '../api.js';
import { autocompleteEvents } from '../autocomplete.js';
import { canManageEvent, getManageableEvents } from '../permissions.js';
import { PERM, formatApiError } from '../errors.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('supprimer-event')
  .setDescription('Supprime un de tes événements Party-cipate.')
  .addIntegerOption((o) =>
    o
      .setName('event')
      .setDescription('L\'événement à supprimer.')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction) {
  await autocompleteEvents(interaction, async () => {
    const { token, user } = await resolveUser(interaction.user);
    return getManageableEvents(token, user, 'can_edit_events');
  });
}

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const eventId = interaction.options.getInteger('event', true);

  try {
    const { token, user } = await resolveUser(interaction.user);
    const event = await getEvent(eventId);
    if (!event) {
      await interaction.editReply(`❌ Événement #${eventId} introuvable.`);
      return;
    }
    if (!(await canManageEvent(token, user, event, 'can_edit_events'))) {
      await interaction.editReply(PERM.deleteEvent);
      return;
    }

    // Réutilise le flux de confirmation des boutons (evt:delete-yes).
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`evt:delete-yes:${eventId}`)
        .setLabel('Confirmer la suppression')
        .setStyle(ButtonStyle.Danger)
    );
    await interaction.editReply({
      content: `⚠️ Supprimer définitivement **${event.name}** (#${event.id}) ?`,
      components: [row]
    });
  } catch (err) {
    await interaction.editReply(formatApiError(err, { fallback403: PERM.deleteEvent }));
  }
}
