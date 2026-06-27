import {
  resolveUser,
  participate,
  unparticipate,
  likeEvent,
  deleteEvent,
  drawLottery,
  apiError
} from './api.js';
import { buildEventView } from './event-view.js';

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

// Gère les boutons d'événement ouverts à tous : inscription, désinscription, J'aime.
// Les confirmations de gestion (draw-yes / delete-yes) sont émises par les commandes
// /tirage et /supprimer-event après contrôle des droits — l'API reste l'autorité finale.
// customId : evt:<action>:<eventId>
export async function handleEventButton(interaction) {
  const [, action, rawId] = interaction.customId.split(':');
  const eventId = Number(rawId);

  // Les confirmations destructives répondent par une mise à jour du message éphémère.
  const isConfirm = action === 'draw-yes' || action === 'delete-yes';
  await interaction.deferReply({ ephemeral: true });

  try {
    const { token, user } = await resolveUser(interaction.user);
    const ctx = { token, user };

    switch (action) {
      case 'join': {
        await participate(token, eventId);
        const view = await refreshMessage(interaction, eventId, ctx);
        await interaction.editReply(`✅ Inscription confirmée à **${view?.event?.name ?? `#${eventId}`}** !`);
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
      case 'draw-yes': {
        const result = await drawLottery(token, eventId);
        await refreshMessage(interaction, eventId, ctx);
        await interaction.editReply({
          content: `🎬 Tirage effectué : ${result.winners_count ?? 0} candidat(s) retenu(s) !`,
          components: []
        });
        return;
      }
      case 'delete-yes': {
        await deleteEvent(token, eventId);
        // L'événement n'existe plus : on retire l'embed d'origine.
        if (interaction.message?.editable) {
          await interaction.message
            .edit({ content: '🗑️ Événement supprimé.', embeds: [], components: [] })
            .catch(() => {});
        }
        await interaction.editReply({ content: '🗑️ Événement supprimé.', components: [] });
        return;
      }
      default:
        await interaction.editReply('❌ Action inconnue.');
    }
  } catch (err) {
    const msg = `❌ ${apiError(err)}`;
    if (isConfirm) {
      await interaction.editReply({ content: msg, components: [] });
    } else {
      await interaction.editReply(msg);
    }
  }
}
