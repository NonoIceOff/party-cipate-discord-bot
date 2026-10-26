import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { resolveUser } from '../api.js';
import { formatApiError } from '../errors.js';
import { getManageableEvents } from '../permissions.js';
import { eventStatus } from '../events-ui.js';
import { boutonLien, pages } from '../lien-gestion.js';

export const data = new SlashCommandBuilder()
  .setName('gestion')
  .setDescription('Tableau de bord des événements que tu peux gérer.');

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

    // Chaque ligne porte son lien : la gestion se fait sur le site, et sans
    // lien il faudrait retaper une commande avec le bon numéro.
    const lines = events.slice(0, 20).map((e) => {
      return [
        `**#${e.id} — ${e.name}**`,
        `${eventStatus(e)} • 👥 ${e.participants_count ?? 0} demande(s) de participation`,
        `✏️ ${pages.modifier(e.id)} • 👥 ${pages.candidats(e.id)}`
      ].join('\n');
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
        text:
          events.length > 20
            ? `20 évènements sur ${events.length} — la suite est sur le tableau de bord.`
            : 'Tout se gère sur le site : modification, candidats, tirage.'
      });

    await interaction.editReply({
      embeds: [embed],
      components: [boutonLien('Mon tableau de bord', pages.tableauDeBord())]
    });
  } catch (err) {
    await interaction.editReply(formatApiError(err));
  }
}
