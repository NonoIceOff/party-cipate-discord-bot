import { SlashCommandBuilder } from 'discord.js';
import { resolveUser, setMemberRole } from '../api.js';
import { roleLabel } from '../roles.js';
import { PERM, formatApiError } from '../errors.js';

export const data = new SlashCommandBuilder()
  .setName('role')
  .setDescription('Change le rôle Party-cipate d\'un membre (admin).')
  .addUserOption((opt) =>
    opt.setName('membre').setDescription('Le membre Discord ciblé.').setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName('role')
      .setDescription('Le nouveau rôle.')
      .setRequired(true)
      .addChoices(
        { name: 'Admin', value: 'admin' },
        { name: 'Producteur', value: 'producteur' },
        { name: 'Membre', value: 'member' }
      )
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const targetUser = interaction.options.getUser('membre', true);
  const role = interaction.options.getString('role', true);

  try {
    // Token de l'appelant (l'API vérifie qu'il est admin).
    const { token } = await resolveUser(interaction.user);

    // On résout le compte de la cible (création auto si elle n'a jamais utilisé le bot).
    const target = await resolveUser(targetUser);
    const targetId = target.user.id;

    const result = await setMemberRole(token, targetId, role);
    if (result.protected) {
      await interaction.editReply('❌ Ce compte est super-admin : son rôle ne peut pas être modifié.');
      return;
    }

    await interaction.editReply(
      `✅ ${targetUser.username} est maintenant **${roleLabel(role)}** sur Party-cipate.`
    );
  } catch (err) {
    await interaction.editReply(formatApiError(err, { fallback403: PERM.platformAdmin }));
  }
}
