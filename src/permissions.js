import { getMyProductions, listEvents } from './api.js';

// Construit une table {production_id -> permissions} pour l'utilisateur (token).
// Un chef possède implicitement toutes les permissions (renvoyées telles quelles par l'API).
async function productionPermMap(token) {
  const prods = await getMyProductions(token).catch(() => []);
  const map = new Map();
  for (const p of prods) map.set(String(p.id), p);
  return map;
}

// Vrai si l'event peut être géré par l'utilisateur avec la permission demandée.
// L'organisateur (créateur) peut toujours. perm ∈ 'can_edit_events' | 'can_draw'.
function userCanManage(event, user, prodMap, perm) {
  if (!event) return false;
  if (user && String(event.user_id) === String(user.id)) return true;
  if (!event.production_id) return false;
  const p = prodMap.get(String(event.production_id));
  return Boolean(p && (p.is_chef || p[perm]));
}

/**
 * Contrôle d'accès pour une action de gestion sur un event précis.
 * Aligné sur l'API : organisateur OU membre de la production avec la permission.
 */
export async function canManageEvent(token, user, event, perm) {
  const prodMap = await productionPermMap(token);
  return userCanManage(event, user, prodMap, perm);
}

/**
 * Liste des events que l'utilisateur peut gérer (pour l'autocomplétion des commandes).
 * Combine les events qu'il a créés et ceux de ses productions avec la permission.
 */
export async function getManageableEvents(token, user, perm) {
  const [all, prodMap] = await Promise.all([
    listEvents().catch(() => []),
    productionPermMap(token)
  ]);
  return all.filter((e) => userCanManage(e, user, prodMap, perm));
}
