/**
 * Disponibilités côté bot.
 *
 * Deux pièges valent un test : perdre les réponses des jours que Discord n'a
 * pas pu afficher, et confondre « n'a pas répondu » avec « a dit non ».
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  construireMenu,
  construireReponses,
  descriptionJour,
  estMenuDisponibilites,
  formatJour,
  precoche,
  texteConflits,
  texteDemande
} from '../src/dispo-core.js';

function jour(id, extra = {}) {
  return { id, day: '2026-03-14', reponse: 'sans_reponse', suggere: true, tournages: [], ...extra };
}

describe('formatJour', () => {
  test('rend un jour lisible en français', () => {
    assert.equal(formatJour('2026-03-14'), 'samedi 14 mars');
  });

  test('laisse passer ce qui n\'est pas une date', () => {
    assert.equal(formatJour('pas-une-date'), 'pas-une-date');
  });
});

describe('precoche', () => {
  test('respecte une réponse déjà donnée', () => {
    assert.equal(precoche(jour(1, { reponse: 'dispo', suggere: null })), true);
    assert.equal(precoche(jour(1, { reponse: 'indispo', suggere: null })), false);
  });

  test('suit la suggestion quand rien n\'a été dit', () => {
    assert.equal(precoche(jour(1, { suggere: false })), false);
    assert.equal(precoche(jour(1, { suggere: true })), true);
  });

  test('coche par défaut faute de suggestion', () => {
    assert.equal(precoche(jour(1, { suggere: null })), true);
  });
});

describe('construireReponses', () => {
  test('coche les jours choisis, décoche les autres', () => {
    const jours = [jour(1), jour(2), jour(3)];
    assert.deepEqual(construireReponses(jours, ['1', '3']), {
      1: true,
      2: false,
      3: true
    });
  });

  test('accepte des identifiants numériques côté Discord', () => {
    assert.deepEqual(construireReponses([jour(7)], [7]), { 7: true });
  });

  test('reconduit les réponses des jours au-delà des 25 affichables', () => {
    // 27 jours : les deux derniers ne tiennent pas dans le menu Discord.
    const jours = Array.from({ length: 27 }, (_, i) =>
      jour(i + 1, i === 25 ? { reponse: 'dispo' } : i === 26 ? { reponse: 'indispo' } : {})
    );
    const reponses = construireReponses(jours, ['1']);

    assert.equal(reponses[1], true);
    assert.equal(reponses[2], false);
    // Ceux-là n'étaient pas au menu : leur réponse survit.
    assert.equal(reponses[26], true);
    assert.equal(reponses[27], false);
  });

  test('ne transforme pas en refus un jour hors menu resté sans réponse', () => {
    const jours = Array.from({ length: 26 }, (_, i) => jour(i + 1));
    const reponses = construireReponses(jours, []);
    assert.equal(Object.hasOwn(reponses, 26), false);
  });

  test('aucun jour choisi veut dire aucun jour disponible', () => {
    assert.deepEqual(construireReponses([jour(1), jour(2)], []), { 1: false, 2: false });
  });
});

describe('estMenuDisponibilites', () => {
  test('reconnaît le menu des disponibilités', () => {
    assert.equal(estMenuDisponibilites('dispo:42'), true);
    assert.equal(estMenuDisponibilites('setup:prod'), false);
    assert.equal(estMenuDisponibilites(undefined), false);
  });
});

describe('descriptionJour', () => {
  test('ne dit rien quand il n\'y a rien à dire', () => {
    assert.equal(descriptionJour(jour(1)), undefined);
  });

  test('rappelle un conflit de tournage', () => {
    const d = descriptionJour(jour(1, { tournages: [{ id: 2, name: 'Les Traîtres' }] }));
    assert.match(d, /Les Traîtres/);
  });

  test('tient dans la limite de Discord', () => {
    const noms = Array.from({ length: 20 }, (_, i) => ({ id: i, name: `Tournage ${i}` }));
    assert.ok(descriptionJour(jour(1, { tournages: noms })).length <= 100);
  });
});

describe('construireMenu', () => {
  test('rend null sans jour proposé', () => {
    assert.equal(construireMenu(1, []), null);
    assert.equal(construireMenu(1, undefined), null);
  });

  test('porte l\'identifiant de l\'évènement', () => {
    const menu = construireMenu(42, [jour(1)]);
    assert.equal(menu.row.components[0].data.custom_id, 'dispo:42');
  });

  test('s\'arrête à 25 options et le signale', () => {
    const jours = Array.from({ length: 31 }, (_, i) => jour(i + 1));
    const menu = construireMenu(1, jours);
    assert.equal(menu.montres, 25);
    assert.equal(menu.total, 31);
    assert.equal(menu.row.components[0].options.length, 25);
    assert.match(texteDemande('Les Traîtres', menu), /25/);
  });

  test('ne parle pas de limite quand tout tient', () => {
    const menu = construireMenu(1, [jour(1), jour(2)]);
    assert.doesNotMatch(texteDemande('Les Traîtres', menu), /Discord n/);
  });

  test('pré-coche selon ce qu\'on sait déjà du candidat', () => {
    const menu = construireMenu(1, [
      jour(1, { suggere: true }),
      jour(2, { suggere: false, declare_indisponible: true })
    ]);
    const [a, b] = menu.row.components[0].options;
    assert.equal(a.data.default, true);
    assert.equal(b.data.default, false);
  });
});

describe('texteConflits', () => {
  test('ne dit rien sans conflit', () => {
    assert.equal(texteConflits([]), null);
    assert.equal(texteConflits(undefined), null);
  });

  test('accorde le verbe au nombre de tournages', () => {
    assert.match(texteConflits([{ id: 1, name: 'A' }]), /tombe sur/);
    assert.match(texteConflits([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]), /tombent sur/);
  });
});
