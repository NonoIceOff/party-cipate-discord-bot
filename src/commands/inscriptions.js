import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { resolveUser, getEvent } from '../api.js';
import { autocompleteEvents } from '../autocomplete.js';
import { canManageEvent, getManageableEvents } from '../permissions.js';
import { PERM, formatApiError } from '../errors.js';
import { pages, reponseLien } from '../lien-gestion.js';

export const data = new SlashCommandBuilder()
  .setName('inscriptions')
  .setDescription('Ouvre la page où ouvrir ou fermer les inscriptions d\'un événement.')
  .addIntegerOption((o) =>
    o
      .setName('event')
      .setDescription('L\'événement concerné.')
      .setRequired(true)
      .setAutocomplete(true)
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
      await interaction.editReply(PERM.inscriptions);
      return;
    }

    const etat = event.is_open ? 'ouvertes 🟢' : 'fermées 🔒';
    await interaction.editReply(
      reponseLien(
        `**${event.name}** : inscriptions ${etat} (${event.participants_count ?? 0} demande(s)). L'interrupteur est sur la page des candidats :`,
        'Gérer les candidats',
        pages.candidats(event.id)
      )
    );
  } catch (err) {
    await interaction.editReply(formatApiError(err, { fallback403: PERM.inscriptions }));
  }
}
