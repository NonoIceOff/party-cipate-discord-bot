import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { SITE_URL } from './site.js';

/**
 * Renvoi vers le site pour tout ce qui relève de la gestion d'un évènement.
 *
 * Gérer un tournage demande aujourd'hui bien plus que ce qu'une commande peut
 * porter : jours de disponibilité, émission de rattachement, paramètres de
 * version, image, sélection des candidats. Une commande à neuf options finit
 * par être plus pénible qu'un formulaire, et surtout elle ne connaît pas les
 * champs ajoutés depuis. Le bot garde donc ce qu'il fait de mieux — vérifier
 * les droits et retrouver le bon évènement — puis ouvre la bonne page.
 */

export const pages = {
  creer: () => `${SITE_URL}/create`,
  modifier: (eventId) => `${SITE_URL}/modify/${eventId}`,
  candidats: (eventId) => `${SITE_URL}/candidates/${eventId}`,
  disponibilites: (eventId) => `${SITE_URL}/candidates/${eventId}?onglet=disponibilites`,
  event: (eventId) => `${SITE_URL}/event/${eventId}`,
  tableauDeBord: () => `${SITE_URL}/dashboard`
};

/** Une rangée d'un seul bouton-lien. */
export function boutonLien(label, url) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url)
  );
}

/** Réponse type : une phrase, un bouton, et l'URL en clair pour le copier-coller. */
export function reponseLien(contenu, label, url) {
  return {
    content: `${contenu}\n${url}`,
    components: [boutonLien(label, url)]
  };
}
