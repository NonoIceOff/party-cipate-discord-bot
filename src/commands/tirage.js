import { SlashCommandBuilder } from 'discord.js';
import { resolveUser, getEvent } from '../api.js';
import { autocompleteEvents } from '../autocomplete.js';
import { canManageEvent, getManageableEvents } from '../permissions.js';
import { PERM, formatApiError } from '../errors.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('tirage')
  .setDescription('Lance le tirage au sort d\'un de tes événements.')
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
    if (!(await canManageEvent(token, user, event, 'can_draw'))) {
      await interaction.editReply(PERM.draw);
      return;
    }
    if (event.draw_done) {
      await interaction.editReply('ℹ️ Le tirage a déjà été effectué pour cet événement.');
      return;
    }

    const winnerCount = Math.min(
      Number(event.max_candidates) || 1,
      Number(event.participants_count) || 0
    );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`evt:draw-yes:${eventId}`)
        .setLabel('Confirmer le tirage')
        .setStyle(ButtonStyle.Primary)
    );
    await interaction.editReply({
      content: `🎲 Lancer le tirage pour **${event.name}** ? ${winnerCount} candidat(s) retenu(s) parmi ${event.participants_count ?? 0} demande(s) de participation. Les inscriptions seront fermées.`,
      components: [row]
    });
  } catch (err) {
    await interaction.editReply(formatApiError(err, { fallback403: PERM.draw }));
  }
}
