import { SlashCommandBuilder } from 'discord.js';
import {
  resolveUser,
  getEvent,
  updateEvent
} from '../api.js';
import { buildEventView } from '../event-view.js';
import { parseEventDate } from '../events-ui.js';
import { autocompleteEvents } from '../autocomplete.js';
import { canManageEvent, getManageableEvents } from '../permissions.js';
import { notifyButtonRow } from '../notifier.js';
import { PERM, formatApiError } from '../errors.js';

export const data = new SlashCommandBuilder()
  .setName('modifier-event')
  .setDescription('Modifie un de tes événements Party-cipate.')
  .addIntegerOption((o) =>
    o
      .setName('event')
      .setDescription('L\'événement à modifier.')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName('nom').setDescription('Nouveau nom.').setMaxLength(120)
  )
  .addStringOption((o) =>
    o.setName('description').setDescription('Nouvelle description courte.').setMaxLength(255)
  )
  .addStringOption((o) =>
    o
      .setName('description_complete')
      .setDescription('Nouvelle description détaillée.')
      .setMaxLength(2000)
  )
  .addIntegerOption((o) =>
    o
      .setName('candidats')
      .setDescription('Nombre de candidats à retenir (impossible après tirage).')
      .setMinValue(1)
      .setMaxValue(999)
  )
  .addStringOption((o) =>
    o.setName('date').setDescription('Nouvelle date (ex: 2026-07-15 20:00).').setMaxLength(40)
  )
  .addStringOption((o) =>
    o.setName('image').setDescription('Nouvelle URL d\'image.').setMaxLength(500)
  )
  .addStringOption((o) =>
    o
      .setName('temps_de_tournage')
      .setDescription('Durée de tournage (ex: 45 minutes).')
      .setMaxLength(100)
  )
  .addBooleanOption((o) =>
    o.setName('ouvert').setDescription('Ouvrir/fermer les inscriptions.')
  );

export async function autocomplete(interaction) {
  // Propose les événements que le membre peut modifier (organisateur ou production).
  await autocompleteEvents(interaction, async () => {
    const { token, user } = await resolveUser(interaction.user);
    return getManageableEvents(token, user, 'can_edit_events');
  });
}

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const eventId = interaction.options.getInteger('event', true);

  const patch = {};
  const nom = interaction.options.getString('nom');
  const description = interaction.options.getString('description');
  const longDescription = interaction.options.getString('description_complete');
  const candidats = interaction.options.getInteger('candidats');
  const dateRaw = interaction.options.getString('date');
  const image = interaction.options.getString('image');
  const duration = interaction.options.getString('temps_de_tournage');
  const ouvert = interaction.options.getBoolean('ouvert');

  if (nom !== null) patch.name = nom;
  if (description !== null) patch.description = description;
  if (longDescription !== null) patch.long_description = longDescription;
  if (candidats !== null) patch.max_candidates = candidats;
  if (image !== null) patch.image_url = image;
  if (duration !== null) patch.duration = duration;
  if (ouvert !== null) patch.is_open = ouvert;
  if (dateRaw !== null) {
    const startsAt = parseEventDate(dateRaw);
    if (!startsAt) {
      await interaction.editReply('❌ Date invalide. Ex: `2026-07-15 20:00`.');
      return;
    }
    patch.starts_at = startsAt;
  }

  try {
    const { token, user } = await resolveUser(interaction.user);

    // Vérifie les droits pour un message clair (l'API renverrait 403 sinon).
    const existing = await getEvent(eventId);
    if (!existing) {
      await interaction.editReply(`❌ Événement #${eventId} introuvable.`);
      return;
    }
    if (!(await canManageEvent(token, user, existing, 'can_edit_events'))) {
      await interaction.editReply(PERM.editEvent);
      return;
    }

    // Sans option : on affiche simplement le menu de gestion (fiche + bouton
    // « Notifier par MP ») sans rien modifier.
    const hasChanges = Object.keys(patch).length > 0;
    if (hasChanges) await updateEvent(token, eventId, patch);

    const view = await buildEventView(eventId, { token, user });
    const components = view ? [...view.components, notifyButtonRow(view.event)] : [];
    await interaction.editReply({
      content: hasChanges
        ? '✅ Événement mis à jour.'
        : 'ℹ️ Gestion de l\'événement. Renseigne des options pour le modifier, ou utilise le bouton ci-dessous.',
      embeds: view ? [view.embed] : [],
      components
    });
  } catch (err) {
    await interaction.editReply(formatApiError(err, { fallback403: PERM.editEvent }));
  }
}
