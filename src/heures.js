/**
 * Heures de tournage, à l'heure de Paris.
 *
 * `new Date('2026-12-01 13:00')` lit la chaîne dans le fuseau du processus.
 * Sur la Pi c'est l'heure de Paris, donc ça tombait juste — par accident.
 * Le jour où le bot tourne ailleurs, ou dans un conteneur en UTC, toutes les
 * heures saisies se décalent sans que rien ne le signale.
 *
 * Les tournages ont lieu à Paris : on le dit, au lieu d'en dépendre.
 */

const FUSEAU = 'Europe/Paris';
const HEURE_LOCALE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

const formateur = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSEAU,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

/** Décalage de Paris, en millisecondes, à un instant donné (gère l'heure d'été). */
function decalage(instant) {
  const parts = {};
  for (const p of formateur.formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const commeUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return commeUtc - instant.getTime();
}

/**
 * Une saisie en instant précis. Une valeur qui porte déjà son fuseau est
 * respectée ; une heure de calendrier est lue comme une heure de Paris.
 * Renvoie une chaîne ISO, ou null si la saisie est inexploitable.
 */
export function versInstant(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const texte = String(valeur).trim();
  const m = HEURE_LOCALE.exec(texte);
  if (!m) {
    const d = new Date(texte);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const suppose = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  // Deux passes : la seconde rattrape les heures juste après un changement
  // d'heure, où le décalage de l'instant supposé n'est pas le bon.
  let instant = suppose - decalage(new Date(suppose));
  instant = suppose - decalage(new Date(instant));
  return new Date(instant).toISOString();
}

/** L'heure de calendrier parisienne d'un instant (« 2026-12-01T13:00 »). */
export function versHeureParis(valeur) {
  if (!valeur) return null;
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + decalage(d)).toISOString().slice(0, 16);
}
