import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { resolveUser, getEvent } from '../api.js';
import { autocompleteEvents } from '../autocomplete.js';
import { canManageEvent, getManageableEvents } from '../permissions.js';
import { PERM, formatApiError } from '../errors.js';
import { pages, reponseLien } from '../lien-gestion.js';

export const data = new SlashCommandBuilder()
  .setName('supprimer-event')
  .setDescription('Ouvre la page où supprimer un de tes événements.')
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

/**
 * La suppression se confirme sur le site, dans la zone dangereuse de la page
 * de modification : un geste définitif mérite d'être fait là où l'on voit ce
 * qu'on supprime — nom, candidats inscrits, date — et non derrière un bouton
 * Discord perdu dans un fil.
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
      await interaction.editReply(PERM.deleteEvent);
      return;
    }

    await interaction.editReply(
      reponseLien(
        `🗑️ Pour supprimer **${event.name}** (#${event.id}), ouvre sa page et descends jusqu'à la zone dangereuse :`,
        'Ouvrir la page',
        pages.modifier(event.id)
      )
    );
  } catch (err) {
    await interaction.editReply(formatApiError(err, { fallback403: PERM.deleteEvent }));
  }
}
