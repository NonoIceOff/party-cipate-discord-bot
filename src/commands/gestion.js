import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { resolveUser, apiError } from '../api.js';
import { getManageableEvents } from '../permissions.js';
import { eventStatus } from '../events-ui.js';

export const data = new SlashCommandBuilder()
  .setName('gestion')
  .setDescription('Tableau de bord des événements que tu peux gérer.');

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const { token, user } = await resolveUser(interaction.user);
    const events = await getManageableEvents(token, user, 'can_edit_events');

    if (!events.length) {
      await interaction.editReply(
        'Tu ne peux gérer aucun événement. Utilise `/creer-event` pour en créer un.'
      );
      return;
    }

    const open = events.filter((e) => e.is_open && !e.draw_done).length;
    const ready = events.filter(
      (e) => !e.draw_done && (e.participants_count ?? 0) > 0
    ).length;
    const drawn = events.filter((e) => e.draw_done).length;

    const lines = events.slice(0, 20).map((e) => {
      return `**#${e.id} — ${e.name}**\n${eventStatus(e)} • 👥 ${
        e.participants_count ?? 0
      } demande(s) de participation`;
    });

    const embed = new EmbedBuilder()
      .setTitle('Gestion de mes événements')
      .setColor(0x5865f2)
      .setDescription(lines.join('\n\n'))
      .addFields(
        { name: 'Total', value: String(events.length), inline: true },
        { name: 'Ouverts', value: String(open), inline: true },
        { name: 'Prêts à tirer', value: String(ready), inline: true },
        { name: 'Terminés', value: String(drawn), inline: true }
      )
      .setFooter({
        text: 'Gère un event : /modifier-event, /inscriptions, /tirage, /supprimer-event'
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply(`❌ ${apiError(err)}`);
  }
}
