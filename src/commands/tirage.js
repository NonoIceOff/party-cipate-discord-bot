import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { resolveUser, getEvent } from '../api.js';
import { autocompleteEvents } from '../autocomplete.js';
import { canManageEvent, getManageableEvents } from '../permissions.js';
import { PERM, formatApiError } from '../errors.js';
import { pages, reponseLien } from '../lien-gestion.js';

export const data = new SlashCommandBuilder()
  .setName('tirage')
  .setDescription('Ouvre la page de tirage au sort d\'un de tes événements.')
  .addIntegerOption((o) =>
    o
      .setName('event')
      .setDescription('L\'événement à tirer.')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction) {
  // Propose les events gérables (organisateur ou droit de tirage) non encore tirés.
  await autocompleteEvents(interaction, async () => {
    const { token, user } = await resolveUser(interaction.user);
    return (await getManageableEvents(token, user, 'can_draw')).filter((e) => !e.draw_done);
  });
}

/**
 * Le tirage se lance depuis la page des candidats.
 *
 * C'est irréversible et ça ferme les inscriptions : on veut voir la liste, les
 * disponibilités et les pseudos en jeu avant d'appuyer — pas un simple bouton
 * de confirmation dans un salon.
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
    if (!(await canManageEvent(token, user, event, 'can_draw'))) {
      await interaction.editReply(PERM.draw);
      return;
    }
    if (event.draw_done) {
      await interaction.editReply('ℹ️ Le tirage a déjà été effectué pour cet événement.');
      return;
    }

    const retenus = Math.min(
      Number(event.max_candidates) || 1,
      Number(event.participants_count) || 0
    );
    await interaction.editReply(
      reponseLien(
        `🎲 **${event.name}** : ${retenus} candidat(s) retenu(s) parmi ${event.participants_count ?? 0} demande(s). Le tirage se lance depuis la page des candidats :`,
        'Gérer les candidats',
        pages.candidats(event.id)
      )
    );
  } catch (err) {
    await interaction.editReply(formatApiError(err, { fallback403: PERM.draw }));
  }
}
