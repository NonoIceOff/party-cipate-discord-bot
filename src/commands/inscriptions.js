import { SlashCommandBuilder } from 'discord.js';
import { resolveUser, getEvent, updateEvent, apiError } from '../api.js';
import { buildEventView } from '../event-view.js';
import { autocompleteEvents } from '../autocomplete.js';
import { canManageEvent, getManageableEvents } from '../permissions.js';

export const data = new SlashCommandBuilder()
  .setName('inscriptions')
  .setDescription('Ouvre ou ferme les inscriptions d\'un de tes événements.')
  .addIntegerOption((o) =>
    o
      .setName('event')
      .setDescription('L\'événement concerné.')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((o) =>
    o
      .setName('etat')
      .setDescription('Ouvrir ou fermer les inscriptions.')
      .setRequired(true)
      .addChoices(
        { name: 'Ouvrir', value: 'open' },
        { name: 'Fermer', value: 'close' }
      )
  );

export async function autocomplete(interaction) {
  // Propose les événements gérables non encore tirés.
  await autocompleteEvents(interaction, async () => {
    const { token, user } = await resolveUser(interaction.user);
    return (await getManageableEvents(token, user, 'can_edit_events')).filter(
      (e) => !e.draw_done
    );
  });
}

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const eventId = interaction.options.getInteger('event', true);
  const open = interaction.options.getString('etat', true) === 'open';

  try {
    const { token, user } = await resolveUser(interaction.user);
    const event = await getEvent(eventId);
    if (!event) {
      await interaction.editReply(`❌ Événement #${eventId} introuvable.`);
      return;
    }
    if (!(await canManageEvent(token, user, event, 'can_edit_events'))) {
      await interaction.editReply(
        '❌ Tu n\'as pas le droit de gérer les inscriptions de cet événement.'
      );
      return;
    }
    if (event.draw_done) {
      await interaction.editReply(
        'ℹ️ Le tirage a déjà été effectué : les inscriptions ne peuvent plus changer.'
      );
      return;
    }

    await updateEvent(token, eventId, { is_open: open });
    const view = await buildEventView(eventId, { token, user });
    await interaction.editReply({
      content: open ? '🟢 Inscriptions ouvertes.' : '🔒 Inscriptions fermées.',
      embeds: view ? [view.embed] : [],
      components: view ? view.components : []
    });
  } catch (err) {
    await interaction.editReply(`❌ ${apiError(err)}`);
  }
}
