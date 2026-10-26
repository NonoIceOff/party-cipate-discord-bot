import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import {
  resolveUser,
  getEvent,
  participate,
  listEvents
} from '../api.js';
import { formatApiError } from '../errors.js';
import { isEventJoinable } from '../events-ui.js';
import { autocompleteEvents } from '../autocomplete.js';
import { menuDisponibilites, texteDemande } from '../disponibilites.js';
import { texteConflits } from '../dispo-core.js';

export const data = new SlashCommandBuilder()
  .setName('inscription')
  .setDescription('Inscris-toi à un événement Party-cipate.')
  .addIntegerOption((opt) =>
    opt
      .setName('event')
      .setDescription('L\'événement auquel t\'inscrire.')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction) {
  // On ne propose que les événements ouverts aux inscriptions.
  await autocompleteEvents(interaction, async () =>
    (await listEvents()).filter(isEventJoinable)
  );
}

/**
 * Menu des disponibilités, ou null. Un échec ici ne doit pas faire croire que
 * l'inscription a raté : elle, elle est passée.
 */
async function demanderDisponibilites(token, event) {
  if (!event?.date_undetermined) return null;
  try {
    return await menuDisponibilites(token, event.id);
  } catch (err) {
    console.error('Disponibilités indisponibles :', err.message);
    return null;
  }
}

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const eventId = interaction.options.getInteger('event', true);

  try {
    const event = await getEvent(eventId);
    if (!event) {
      await interaction.editReply(`❌ Événement #${eventId} introuvable.`);
      return;
    }

    const { token } = await resolveUser(interaction.user);
    const result = await participate(token, eventId);

    const deja = result?.message === 'Participation already exists';
    const debut = [
      deja
        ? `ℹ️ Tu es déjà inscrit(e) à **${event.name}**.`
        : `✅ Inscription confirmée à **${event.name}** !`,
      texteConflits(result?.conflits)
    ]
      .filter(Boolean)
      .join('\n');

    // Date pas encore fixée : l'inscription ne dit rien tant qu'on ne sait pas
    // quels jours vont au candidat. On le demande tout de suite, ici — c'est
    // le seul moment où on est sûr de l'avoir sous la main.
    const menu = await demanderDisponibilites(token, event);
    if (menu) {
      await interaction.editReply({
        content: `${debut}\n\n${texteDemande(event.name, menu)}`,
        components: [menu.row]
      });
      return;
    }

    await interaction.editReply(debut);
  } catch (err) {
    await interaction.editReply(formatApiError(err));
  }
}
