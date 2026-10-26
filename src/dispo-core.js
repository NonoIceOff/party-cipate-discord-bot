import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { SITE_URL } from './site.js';

/**
 * Disponibilités : tout ce qui se décide sans appeler l'API.
 *
 * Séparé de disponibilites.js, qui parle à pm-api et exige donc une
 * configuration de bot complète : la logique testable n'a pas à en dépendre.
 */

// Discord n'accepte pas plus de 25 options par menu. Au-delà, le site prend
// le relais — mais les réponses déjà données sur les jours non montrés sont
// reconduites, sinon valider le menu les effacerait.
export const MAX_OPTIONS = 25;

export const PREFIXE = 'dispo:';

/** « 2026-03-14 » → « samedi 14 mars ». */
export function formatJour(day) {
  const [a, m, j] = String(day).split('-').map(Number);
  if (!a || !m || !j) return String(day);
  return new Date(Date.UTC(a, m - 1, j)).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  });
}

/** Ce qu'on sait déjà de ce jour-là, en une ligne (limite Discord : 100 car.). */
export function descriptionJour(jour) {
  const bouts = [];
  if (jour.declare_indisponible) bouts.push('déclaré indisponible dans ton profil');
  if (jour.tournages?.length) {
    bouts.push(`déjà inscrit à ${jour.tournages.map((t) => t.name).join(', ')}`);
  }
  if (!bouts.length) return undefined;
  const texte = bouts.join(' · ');
  return texte.length > 100 ? `${texte.slice(0, 97)}…` : texte;
}

/**
 * Le candidat est-il réputé disponible ce jour-là, avant toute correction ?
 *
 * Une réponse déjà donnée prime ; sinon on suit la suggestion de l'API, qui
 * tient compte des jours déclarés indisponibles et des tournages concurrents.
 * Pré-cocher n'est pas répondre : tant que rien n'est validé, l'organisateur
 * voit « n'a pas répondu ».
 */
export function precoche(jour) {
  if (jour.reponse === 'dispo') return true;
  if (jour.reponse === 'indispo') return false;
  return jour.suggere !== false;
}

/** Menu déroulant des jours proposés. Null s'il n'y a rien à demander. */
export function construireMenu(eventId, jours) {
  if (!jours?.length) return null;

  const montres = jours.slice(0, MAX_OPTIONS);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${PREFIXE}${eventId}`)
    .setPlaceholder('Coche les jours où tu es disponible')
    .setMinValues(0)
    .setMaxValues(montres.length)
    .addOptions(
      montres.map((j) => ({
        label: formatJour(j.day),
        value: String(j.id),
        description: descriptionJour(j),
        default: precoche(j)
      }))
    );

  return {
    row: new ActionRowBuilder().addComponents(menu),
    total: jours.length,
    montres: montres.length
  };
}

/** Texte d'accompagnement du menu. */
export function texteDemande(eventName, menu) {
  const lignes = [
    `📅 La date de **${eventName}** n'est pas encore fixée.`,
    'Choisis ci-dessous les jours où tu es disponible, puis valide.'
  ];
  if (menu.montres < menu.total) {
    lignes.push(
      `⚠️ ${menu.total} jours sont proposés, Discord n'en affiche que ${menu.montres}.`,
      `Pour tous les voir : ${SITE_URL}/profile`
    );
  }
  return lignes.join('\n');
}

/**
 * Réponses à envoyer après une validation du menu.
 *
 * Les jours que Discord n'a pas pu afficher gardent leur réponse : l'API
 * efface tout ce qui n'est pas cité, et valider le menu les perdrait sans que
 * personne ne s'en aperçoive. Ceux qui n'avaient pas de réponse restent sans
 * réponse — on ne transforme pas un silence en refus.
 */
export function construireReponses(jours, valeursChoisies) {
  const choisis = new Set((valeursChoisies || []).map(String));
  const reponses = {};
  jours.forEach((j, index) => {
    if (index < MAX_OPTIONS) {
      reponses[j.id] = choisis.has(String(j.id));
    } else if (j.reponse !== 'sans_reponse') {
      reponses[j.id] = j.reponse === 'dispo';
    }
  });
  return reponses;
}

export function estMenuDisponibilites(customId) {
  return typeof customId === 'string' && customId.startsWith(PREFIXE);
}

/**
 * Avertissement quand d'autres tournages tombent sur le même créneau.
 *
 * L'API signale sans bloquer : c'est au candidat de savoir s'il peut
 * enchaîner. Le taire reviendrait à le laisser découvrir le conflit le jour J.
 */
export function texteConflits(conflits) {
  if (!conflits?.length) return null;
  const noms = conflits.map((c) => `**${c.name}**`).join(', ');
  return conflits.length === 1
    ? `⚠️ Attention : ${noms} tombe sur le même créneau.`
    : `⚠️ Attention : ${noms} tombent sur le même créneau.`;
}

/** Accusé de réception affiché après l'enregistrement. */
export function texteConfirmation(nbDispo) {
  if (nbDispo === 0) return '✅ C\'est noté : aucun des jours proposés ne te convient.';
  return `✅ Disponibilités enregistrées : ${nbDispo} jour${nbDispo > 1 ? 's' : ''}. Tu peux les modifier à tout moment avec \`/dispo\`.`;
}
