/**
 * Le bot lit les dates saisies à l'heure de Paris, pas à celle du fuseau dans
 * lequel il se trouve lancé. Avant, `new Date(chaîne)` tombait juste par
 * accident parce que la Pi est à l'heure de Paris : déplacer le bot aurait
 * décalé toutes les heures, sans rien signaler.
 *
 * Les tests fixent TZ=UTC pour que l'accident ne puisse pas les sauver.
 */
process.env.TZ = 'UTC';

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { versInstant, versHeureParis } from '../src/heures.js';
import { parseEventDate } from '../src/events-ui.js';

describe('Heure de Paris', () => {
  test('en hiver, 13h00 à Paris fait 12h00 UTC', () => {
    assert.equal(versInstant('2026-12-01T13:00'), '2026-12-01T12:00:00.000Z');
  });

  test('en été, 13h00 à Paris fait 11h00 UTC', () => {
    assert.equal(versInstant('2026-07-15T13:00'), '2026-07-15T11:00:00.000Z');
  });

  test('les changements d’heure sont gérés', () => {
    assert.equal(versInstant('2026-03-29T03:00'), '2026-03-29T01:00:00.000Z');
    assert.equal(versInstant('2026-10-25T03:00'), '2026-10-25T02:00:00.000Z');
  });

  test('une valeur déjà datée et fuseau-horodatée est respectée', () => {
    assert.equal(versInstant('2026-12-01T13:00:00.000Z'), '2026-12-01T13:00:00.000Z');
  });

  test('l’aller-retour est stable', () => {
    assert.equal(versHeureParis(versInstant('2026-12-01T13:00')), '2026-12-01T13:00');
  });
});

describe('Dates saisies dans /creer-event', () => {
  test('une date et une heure sont lues à l’heure de Paris', () => {
    assert.equal(parseEventDate('2026-12-01 13:00'), '2026-12-01T12:00:00.000Z');
    assert.equal(parseEventDate('2026-07-15 13:00'), '2026-07-15T11:00:00.000Z');
  });

  test('une date seule vaut minuit à Paris', () => {
    assert.equal(parseEventDate('2026-07-15'), '2026-07-14T22:00:00.000Z');
  });

  test('une saisie incompréhensible rend null', () => {
    assert.equal(parseEventDate('demain si possible'), null);
    assert.equal(parseEventDate(''), null);
    assert.equal(parseEventDate(null), null);
  });

  test('une année aberrante est refusée', () => {
    assert.equal(parseEventDate('1200-01-01 12:00'), null);
  });
});
