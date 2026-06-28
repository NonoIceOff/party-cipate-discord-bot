/** Messages d'erreur utilisateur pour les refus de permission (éphémères Discord). */

export const PERM = {
  manageGuild:
    '❌ Tu dois avoir la permission **Gérer le serveur** sur ce serveur Discord pour utiliser cette commande.',
  editEvent:
    '❌ Tu n\'as pas le droit de modifier cet événement.\n' +
    '_Il faut en être le créateur, ou avoir le grade **modifier des événements** dans la production._',
  deleteEvent:
    '❌ Tu n\'as pas le droit de supprimer cet événement.\n' +
    '_Il faut en être le créateur, ou avoir le grade **modifier des événements** dans la production._',
  inscriptions:
    '❌ Tu n\'as pas le droit de gérer les inscriptions de cet événement.\n' +
    '_Il faut en être le créateur, ou avoir le grade **modifier des événements** dans la production._',
  draw:
    '❌ Tu n\'as pas le droit de lancer le tirage de cet événement.\n' +
    '_Il faut en être le créateur, ou avoir le grade **tirage au sort** dans la production._',
  createEvent:
    '❌ Tu n\'as pas la permission de créer des événements.\n' +
    '_Il faut être membre d\'une production avec le grade **créer des événements** (demande à un chef de production)._',
  platformAdmin: '❌ Réservé aux **administrateurs Party-cipate**.',
  botSendMessages: (channelId) =>
    `❌ Je n'ai pas la permission d'écrire dans <#${channelId}>.\n` +
    '_Donne-moi **Voir le salon** + **Envoyer des messages** dans ce salon, puis relance `/setup`._'
};

/**
 * Transforme une erreur API en message lisible ; les 403 sont reformulés si besoin.
 * @param {import('axios').AxiosError} err
 * @param {{ fallback403?: string }} [opts]
 */
export function formatApiError(err, opts = {}) {
  const status = err?.response?.status;
  const body = err?.response?.data?.error || err?.response?.data?.message;

  if (status === 403) {
    if (opts.fallback403) return opts.fallback403;
    if (body && typeof body === 'string') return `❌ ${body}`;
    return '❌ Accès refusé : permissions insuffisantes.';
  }
  if (status === 401) return '❌ Session expirée ou non connecté. Réessaie la commande.';
  if (body && typeof body === 'string') return `❌ ${body}`;
  return `❌ ${err?.message || 'Erreur inconnue'}`;
}
