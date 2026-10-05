/**
 * L'assistant /setup, étape par étape.
 *
 * Avec deux productions connectées, il doit demander DEUX salons l'un après
 * l'autre — c'est précisément ce qui manquait. On simule les interactions
 * Discord : ce qui compte est ce que l'assistant affiche et ce qu'il enregistre.
 *
 * Le store écrit dans data/config.json (ignoré par git) : on le remet à zéro
 * avant chaque test.
 */
process.env.DISCORD_BOT_TOKEN = 'faux';
process.env.DISCORD_CLIENT_ID = '1';
process.env.PM_API_URL = 'http://127.0.0.1:1/api';
process.env.BOT_API_KEY = 'faux';

import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { PermissionFlagsBits } from 'discord.js';

const store = await import('../src/store.js');
const setup = await import('../src/commands/setup.js');

const G = 'guild-test';

after(() => rmSync(new URL('../data', import.meta.url), { recursive: true, force: true }));

/** Interaction Discord simulée : on garde ce qui est affiché. */
function fausseInteraction(customId, values) {
  const vues = [];
  return {
    customId,
    values,
    guildId: G,
    memberPermissions: { has: () => true },
    guild: {
      channels: { fetch: async () => ({ id: 'salon', permissionsFor: () => null }) },
      members: { me: {} }
    },
    deferUpdate: async () => {},
    update: async (p) => vues.push(p),
    editReply: async (p) => vues.push(p),
    reply: async (p) => vues.push(p),
    vues,
    get derniere() {
      return vues[vues.length - 1];
    }
  };
}

const texte = (vue) => vue?.embeds?.[0]?.data?.description ?? '';
const titre = (vue) => vue?.embeds?.[0]?.data?.title ?? '';
/** Identifiant du menu affiché, ou null si l'assistant a terminé. */
const menu = (vue) => vue?.components?.[0]?.components?.[0]?.data?.custom_id ?? null;

beforeEach(() => {
  store.clearGuildProductions(G);
  store.clearAnnouncementChannel(G);
});

describe('Assistant /setup avec plusieurs productions', () => {
  beforeEach(() => {
    store.setGuildProductions(G, [
      { id: 'prod-tournages', name: 'Tournages' },
      { id: 'prod-lives', name: 'Lives' }
    ]);
  });

  test('il demande un salon par production, dans l’ordre', async () => {
    // 1er salon.
    const i1 = fausseInteraction('setup:chan:prod-tournages', ['salon-tournages']);
    await setup.handleComponent(i1);

    assert.match(titre(i1.derniere), /Étape 3\/3/, 'il reste une production à régler');
    assert.match(texte(i1.derniere), /Lives/, 'et c’est bien celle des lives');
    assert.equal(menu(i1.derniere), 'setup:chan:prod-lives');

    // 2e salon → terminé.
    const i2 = fausseInteraction('setup:chan:prod-lives', ['salon-lives']);
    await setup.handleComponent(i2);

    assert.match(titre(i2.derniere), /Configuration terminée/);
    assert.equal(menu(i2.derniere), null, 'plus de menu : l’assistant est fini');
  });

  test('chaque production garde SON salon', async () => {
    await setup.handleComponent(fausseInteraction('setup:chan:prod-tournages', ['salon-tournages']));
    await setup.handleComponent(fausseInteraction('setup:chan:prod-lives', ['salon-lives']));

    const cibles = store.getAnnouncementChannels();
    assert.equal(cibles.length, 2, 'deux salons distincts');
    assert.equal(
      cibles.find((c) => c.productionIds.includes('prod-tournages')).channelId,
      'salon-tournages'
    );
    assert.equal(
      cibles.find((c) => c.productionIds.includes('prod-lives')).channelId,
      'salon-lives'
    );
  });

  test('le récapitulatif final montre quelle production va où', async () => {
    await setup.handleComponent(fausseInteraction('setup:chan:prod-tournages', ['salon-tournages']));
    const fin = fausseInteraction('setup:chan:prod-lives', ['salon-lives']);
    await setup.handleComponent(fin);

    const recap = texte(fin.derniere);
    assert.match(recap, /Tournages.*salon-tournages/s);
    assert.match(recap, /Lives.*salon-lives/s);
  });

  test('on peut rechoisir le même salon pour les deux', async () => {
    await setup.handleComponent(fausseInteraction('setup:chan:prod-tournages', ['commun']));
    await setup.handleComponent(fausseInteraction('setup:chan:prod-lives', ['commun']));

    const cibles = store.getAnnouncementChannels();
    assert.equal(cibles.length, 1, 'un seul salon ouvert pour les deux');
    assert.deepEqual(cibles[0].productionIds.sort(), ['prod-lives', 'prod-tournages']);
  });
});

describe('Assistant /setup avec une seule production', () => {
  test('rien ne change : une étape, puis terminé', async () => {
    store.setGuildProductions(G, [{ id: 'solo', name: 'Ma Prod' }]);

    const i = fausseInteraction('setup:chan:solo', ['mon-salon']);
    await setup.handleComponent(i);

    assert.match(titre(i.derniere), /Configuration terminée/);
    assert.equal(menu(i.derniere), null);
    assert.equal(store.getAnnouncementChannels()[0].channelId, 'mon-salon');
  });
});

describe('Cas limites', () => {
  test('un salon où le bot ne peut pas écrire est refusé, sans avancer', async () => {
    store.setGuildProductions(G, [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' }
    ]);

    const i = fausseInteraction('setup:chan:a', ['salon-interdit']);
    i.guild.channels.fetch = async () => ({
      id: 'salon-interdit',
      permissionsFor: () => ({ has: (p) => p !== PermissionFlagsBits.SendMessages })
    });
    await setup.handleComponent(i);

    // On reste sur la même production : rien n'a été enregistré.
    assert.equal(menu(i.derniere), 'setup:chan:a', 'on redemande le salon de A');
    assert.equal(store.getGuildProductions(G).find((p) => p.productionId === 'a').channelId, null);
  });

  test('une production retirée entre deux étapes est signalée', async () => {
    store.setGuildProductions(G, [{ id: 'a', name: 'A' }]);
    const i = fausseInteraction('setup:chan:disparue', ['salon']);
    await setup.handleComponent(i);
    assert.match(i.derniere.content, /n’est plus connectée/);
  });

  test('sans production connectée, l’assistant renvoie vers /setup', async () => {
    const i = fausseInteraction('setup:chan:a', ['salon']);
    await setup.handleComponent(i);
    assert.match(i.derniere.content, /Aucune production/);
  });
});
