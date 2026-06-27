import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { resolveUser, myParticipations, listEvents, apiError } from '../api.js';
import { eventStatus } from '../events-ui.js';

export const data = new SlashCommandBuilder()
  .setName('mesevents')
  .setDescription('Liste les événements auxquels tu es inscrit(e).');

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const { token, user } = await resolveUser(interaction.user);
    const [parts, events] = await Promise.all([
      myParticipations(token, user.id),
      listEvents()
    ]);

    if (!parts.length) {
      await interaction.editReply(
        'Tu n\'es inscrit(e) à aucun événement. Utilise `/events` pour en découvrir.'
      );
      return;
    }

    const byId = new Map(events.map((e) => [Number(e.id), e]));
    const lines = parts.map((p) => {
      const e = byId.get(Number(p.event_id));
      const won = p.is_selected ? ' • ✅ Candidat retenu' : '';
      if (!e) return `**#${p.event_id}** (événement supprimé)${won}`;
      return `**#${e.id} — ${e.name}**\n${eventStatus(e)}${won}`;
    });

    const embed = new EmbedBuilder()
      .setTitle('Mes inscriptions')
      .setColor(0x5865f2)
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: `${parts.length} inscription(s)` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply(`❌ ${apiError(err)}`);
  }
}
