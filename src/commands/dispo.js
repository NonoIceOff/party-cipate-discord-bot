import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { resolveUser, myParticipations, listEvents } from '../api.js';
import { formatApiError } from '../errors.js';
import { SITE_URL } from '../site.js';

export const data = new SlashCommandBuilder()
  .setName('dispo')
  .setDescription('Modifie tes disponibilités (jours où tu ne peux pas tourner).');

/**
 * Renvoie vers le site plutôt que d'ouvrir un calendrier en menu déroulant :
 * cocher des dates au clavier dans Discord est pénible, et le profil garde ces
 * jours une fois pour toutes pour tous les évènements à venir.
 *
 * Au passage, la commande rappelle les tournages dont la date reste à fixer :
 * c'est là que la réponse manque vraiment.
 */
export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const { token, user } = await resolveUser(interaction.user);
    const [parts, events] = await Promise.all([
      myParticipations(token, user.id),
      listEvents()
    ]);

    const parId = new Map(events.map((e) => [Number(e.id), e]));
    const aRepondre = parts
      .map((p) => parId.get(Number(p.event_id)))
      .filter((e) => e && e.date_undetermined);

    const embed = new EmbedBuilder()
      .setTitle('Tes disponibilités')
      .setColor(0x5865f2)
      .setDescription(
        [
          'Tes jours d\'indisponibilité se règlent sur ton profil : ils sont',
          'repris automatiquement chaque fois qu\'une production te demande',
          'quand tu peux tourner.',
          '',
          `👉 ${SITE_URL}/profile`
        ].join('\n')
      );

    if (aRepondre.length) {
      embed.addFields({
        name: 'Tournages dont la date reste à fixer',
        value: aRepondre
          .map((e) => `• **${e.name}** — ${SITE_URL}/event/${e.id}`)
          .join('\n')
          .slice(0, 1024)
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply(formatApiError(err));
  }
}
