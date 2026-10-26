import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { resolveUser, getEvent } from '../api.js';
import { autocompleteEvents } from '../autocomplete.js';
import { canManageEvent, getManageableEvents } from '../permissions.js';
import { PERM, formatApiError } from '../errors.js';
import { pages, reponseLien } from '../lien-gestion.js';

export const data = new SlashCommandBuilder()
  .setName('modifier-event')
  .setDescription('Ouvre la page de modification d\'un de tes événements.')
  .addIntegerOption((o) =>
    o
      .setName('event')
      .setDescription('L\'événement à modifier.')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction) {
  // Propose les événements que le membre peut modifier (organisateur ou production).
  await autocompleteEvents(interaction, async () => {
    const { token, user } = await resolveUser(interaction.user);
    return getManageableEvents(token, user, 'can_edit_events');
  });
}

/**
 * La modification se fait sur le site. Le bot garde ce qu'il fait de mieux :
 * retrouver le bon évènement et dire tout de suite si le droit manque — plutôt
 * que d'ouvrir une page qui refusera l'enregistrement.
 */
export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const eventId = interaction.options.getInteger('event', true);

  try {
    const { token, user } = await resolveUser(interaction.user);
    const event = await getEvent(eventId);
    if (!event) {
      await interaction.editReply(`❌ Événement #${eventId} introuvable.`);
      return;
    }
    if (!(await canManageEvent(token, user, event, 'can_edit_events'))) {
      await interaction.editReply(PERM.editEvent);
      return;
    }

    await interaction.editReply(
      reponseLien(
        `✏️ Modifier **${event.name}** (#${event.id}) :`,
        'Modifier l\'évènement',
        pages.modifier(event.id)
      )
    );
  } catch (err) {
    await interaction.editReply(formatApiError(err, { fallback403: PERM.editEvent }));
  }
}
