import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { resolveUser, getMyProductions } from '../api.js';
import { PERM, formatApiError } from '../errors.js';
import { pages, reponseLien } from '../lien-gestion.js';

export const data = new SlashCommandBuilder()
  .setName('creer-event')
  .setDescription('Ouvre le formulaire de création d\'un événement Party-cipate.');

/**
 * La création se fait sur le site : un évènement se choisit une émission, une
 * image, des jours de disponibilité, des paramètres de version — rien de tout
 * cela ne tient dans des options de commande.
 *
 * Le bot vérifie quand même le droit de créer : mieux vaut le dire ici que
 * laisser quelqu'un remplir un formulaire qu'il ne pourra pas envoyer.
 */
export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const { token } = await resolveUser(interaction.user);
    const productions = await getMyProductions(token);
    const autorisees = productions.filter((p) => p.can_create_events || p.is_chef);

    if (!autorisees.length) {
      await interaction.editReply(PERM.createEvent);
      return;
    }

    await interaction.editReply(
      reponseLien(
        '🎬 La création se passe sur le site, où tu as tous les réglages sous la main :',
        'Créer un évènement',
        pages.creer()
      )
    );
  } catch (err) {
    await interaction.editReply(formatApiError(err, { fallback403: PERM.createEvent }));
  }
}
