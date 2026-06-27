import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { resolveUser, listMembers, apiError } from '../api.js';
import { roleLabel } from '../roles.js';

export const data = new SlashCommandBuilder()
  .setName('membres')
  .setDescription('Liste les membres Party-cipate et leurs rôles (admin).');

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const { token } = await resolveUser(interaction.user);
    const members = await listMembers(token);

    const grouped = { admin: [], producteur: [], member: [] };
    for (const m of members) {
      (grouped[m.role] || grouped.member).push(m);
    }

    const embed = new EmbedBuilder()
      .setTitle('Membres Party-cipate')
      .setColor(0x5865f2)
      .setFooter({ text: `${members.length} membre(s)` });

    for (const role of ['admin', 'producteur', 'member']) {
      const list = grouped[role];
      if (!list.length) continue;
      const value = list
        .map((m) => `• ${m.username}${m.isSuperAdmin ? ' *(super-admin)*' : ''}`)
        .join('\n')
        .slice(0, 1024);
      embed.addFields({ name: `${roleLabel(role)} — ${list.length}`, value });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    // 403 = pas admin : message clair plutôt que stack technique.
    const status = err.response?.status;
    if (status === 403) {
      await interaction.editReply('❌ Réservé aux administrateurs Party-cipate.');
      return;
    }
    await interaction.editReply(`❌ ${apiError(err)}`);
  }
}
