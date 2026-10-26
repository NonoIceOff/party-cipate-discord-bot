import { MessageFlags } from 'discord.js';
import { resolveUser, participate, unparticipate, likeEvent } from './api.js';
import { buildEventView } from './event-view.js';
import { formatApiError } from './errors.js';
import { menuDisponibilites, texteDemande } from './disponibilites.js';
import { texteConflits } from './dispo-core.js';

// Met à jour le message d'origine (embed + boutons) après une action.
async function refreshMessage(interaction, eventId, ctx) {
  const view = await buildEventView(eventId, ctx);
  if (view && interaction.message?.editable) {
    await interaction.message
      .edit({ embeds: [view.embed], components: view.components })
      .catch(() => {});
  }
  return view;
}

// Gère les boutons d'événement, qui sont tous ouverts à tous : inscription,
// désinscription, J'aime. Le tirage et la suppression se font sur le site, où
// l'on voit ce qu'on décide — les commandes correspondantes y renvoient.
// customId : evt:<action>:<eventId>
export async function handleEventButton(interaction) {
  const [, action, rawId] = interaction.customId.split(':');
  const eventId = Number(rawId);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const { token, user } = await resolveUser(interaction.user);
    const ctx = { token, user };

    switch (action) {
      case 'join': {
        const inscription = await participate(token, eventId);
        const view = await refreshMessage(interaction, eventId, ctx);
        const nom = view?.event?.name ?? `#${eventId}`;
        const confirmation = [
          `✅ Inscription confirmée à **${nom}** !`,
          texteConflits(inscription?.conflits)
        ]
          .filter(Boolean)
          .join('\n');

        // Date pas encore fixée : s'inscrire ne suffit pas, il faut dire quels
        // jours vont. On le demande dans la foulée, pendant qu'on l'a.
        const menu = view?.event?.date_undetermined
          ? await menuDisponibilites(token, eventId).catch((err) => {
              console.error('Disponibilités indisponibles :', err.message);
              return null;
            })
          : null;

        if (menu) {
          await interaction.editReply({
            content: `${confirmation}\n\n${texteDemande(nom, menu)}`,
            components: [menu.row]
          });
          return;
        }

        await interaction.editReply(confirmation);
        return;
      }
      case 'leave': {
        try {
          await unparticipate(token, user.id, eventId);
        } catch (err) {
          if (err.response?.status !== 404) throw err;
        }
        const view = await refreshMessage(interaction, eventId, ctx);
        await interaction.editReply(`✅ Tu es désinscrit(e) de **${view?.event?.name ?? `#${eventId}`}**.`);
        return;
      }
      case 'like': {
        await likeEvent(token, eventId);
        const view = await refreshMessage(interaction, eventId, ctx);
        await interaction.editReply(`❤️ Merci pour ton J'aime sur **${view?.event?.name ?? `#${eventId}`}** !`);
        return;
      }
      default:
        await interaction.editReply('❌ Action inconnue.');
    }
  } catch (err) {
    await interaction.editReply(formatApiError(err));
  }
}
