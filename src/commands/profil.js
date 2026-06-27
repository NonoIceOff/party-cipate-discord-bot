import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { resolveUser, getProfile, apiError } from '../api.js';
import { roleLabel, roleColor } from '../roles.js';

export const data = new SlashCommandBuilder()
  .setName('profil')
  .setDescription('Affiche ton profil Party-cipate (crée ton compte si besoin).')
  .addUserOption((opt) =>
    opt
      .setName('membre')
      .setDescription('Voir le profil d\'un autre membre (lecture seule).')
      .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const target = interaction.options.getUser('membre');

  try {
    let user;
    let created = false;

    if (target && target.id !== interaction.user.id) {
      // Lecture seule : on ne crée pas de compte pour quelqu'un d'autre ici.
      user = await getProfile(target.id);
      if (!user) {
        await interaction.editReply(
          `${target.username} n'a pas encore de compte Party-cipate (il doit utiliser une commande du bot au moins une fois).`
        );
        return;
      }
    } else {
      const res = await resolveUser(interaction.user);
      user = res.user;
      created = res.created;
    }

    const embed = new EmbedBuilder()
      .setTitle(user.username)
      .setColor(roleColor(user.role))
      .addFields(
        { name: 'Rôle', value: roleLabel(user.role), inline: true },
        { name: 'Membre depuis', value: formatDate(user.createdAt), inline: true }
      );

    if (user.profile_picture) embed.setThumbnail(user.profile_picture);

    const note = created
      ? '✅ Ton compte Party-cipate vient d\'être créé automatiquement.'
      : null;

    await interaction.editReply({ content: note ?? undefined, embeds: [embed] });
  } catch (err) {
    await interaction.editReply(`❌ ${apiError(err)}`);
  }
}

function formatDate(iso) {
  if (!iso) return 'Inconnu';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Inconnu';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}
