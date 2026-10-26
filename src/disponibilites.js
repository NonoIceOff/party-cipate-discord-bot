import {
  getMesDisponibilites,
  repondreDisponibilites,
  resolveUser
} from './api.js';
import { PREFIXE, construireMenu, construireReponses, texteConfirmation } from './dispo-core.js';

/**
 * Disponibilités demandées sur Discord.
 *
 * Quand la date d'un tournage n'est pas arrêtée, s'inscrire ne suffit pas :
 * l'organisateur a besoin de savoir quels jours vont au candidat. On le lui
 * demande dans la foulée de l'inscription, par un menu déroulant — c'est le
 * seul endroit où il est déjà.
 *
 * La logique sans API vit dans dispo-core.js.
 */

export { estMenuDisponibilites, texteDemande } from './dispo-core.js';

/**
 * Menu des jours à proposer après une inscription.
 * Renvoie null quand il n'y a rien à demander (date fixée, aucun jour).
 */
export async function menuDisponibilites(token, eventId) {
  const { date_undetermined: indeterminee, jours } = await getMesDisponibilites(
    token,
    eventId
  );
  if (!indeterminee) return null;
  return construireMenu(eventId, jours);
}

/** Enregistre la réponse donnée au menu. */
export async function handleDisponibilitesSelect(interaction) {
  const eventId = Number(interaction.customId.slice(PREFIXE.length));
  await interaction.deferUpdate();

  const { token } = await resolveUser(interaction.user);
  const { jours } = await getMesDisponibilites(token, eventId);
  const reponses = construireReponses(jours, interaction.values);

  await repondreDisponibilites(token, eventId, reponses);

  await interaction.editReply({
    content: texteConfirmation(Object.values(reponses).filter(Boolean).length),
    components: []
  });
}
