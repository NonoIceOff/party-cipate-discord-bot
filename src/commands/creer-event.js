import { SlashCommandBuilder } from 'discord.js';
import { resolveUser, createEvent } from '../api.js';
import { buildEventView } from '../event-view.js';
import { parseEventDate } from '../events-ui.js';
import { PERM, formatApiError } from '../errors.js';

export const data = new SlashCommandBuilder()
  .setName('creer-event')
  .setDescription('Crée un nouvel événement Party-cipate.')
  .addStringOption((o) =>
    o.setName('nom').setDescription('Nom de l\'événement.').setRequired(true).setMaxLength(120)
  )
  .addStringOption((o) =>
    o.setName('description').setDescription('Description courte.').setMaxLength(255)
  )
  .addStringOption((o) =>
    o
      .setName('description_complete')
      .setDescription('Description détaillée.')
      .setMaxLength(2000)
  )
  .addIntegerOption((o) =>
    o
      .setName('candidats')
      .setDescription('Nombre de candidats à retenir au tirage (défaut : 1).')
      .setMinValue(1)
      .setMaxValue(999)
  )
  .addStringOption((o) =>
    o
      .setName('date')
      .setDescription('Date et heure (ex: 2026-07-15 20:00).')
      .setMaxLength(40)
  )
  .addStringOption((o) =>
    o.setName('image').setDescription('URL d\'une image.').setMaxLength(500)
  )
  .addBooleanOption((o) =>
    o
      .setName('ouvert')
      .setDescription('Inscriptions ouvertes dès la création (défaut : oui).')
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const nom = interaction.options.getString('nom', true);
  const description = interaction.options.getString('description') || undefined;
  const longDescription = interaction.options.getString('description_complete') || undefined;
  const candidats = interaction.options.getInteger('candidats') || 1;
  const dateRaw = interaction.options.getString('date');
  const image = interaction.options.getString('image') || undefined;
  const ouvert = interaction.options.getBoolean('ouvert');

  const startsAt = parseEventDate(dateRaw);
  if (dateRaw && !startsAt) {
    await interaction.editReply(
      '❌ Date invalide. Utilise un format comme `2026-07-15 20:00` ou `2026-07-15`.'
    );
    return;
  }

  try {
    const { token, user } = await resolveUser(interaction.user);
    const event = await createEvent(token, {
      name: nom,
      description,
      long_description: longDescription,
      image_url: image,
      starts_at: startsAt || undefined,
      is_open: ouvert ?? true,
      max_candidates: candidats
    });

    const view = await buildEventView(event.id, { token, user });
    await interaction.editReply({
      content: `✅ Événement **${event.name}** créé (#${event.id}) !`,
      embeds: view ? [view.embed] : [],
      components: view ? view.components : []
    });
  } catch (err) {
    await interaction.editReply(formatApiError(err, { fallback403: PERM.createEvent }));
  }
}
