/**
 * Routage des annonces : quelle production s'annonce dans quel salon.
 *
 * C'est la logique qu'il ne faut pas se tromper : une erreur ici n'échoue pas,
 * elle poste l'annonce dans le mauvais salon. D'où des tests qui vérifient la
 * CIBLE, pas seulement que la fonction répond.
 *
 * Le store écrit dans data/config.json : chaque test part d'un dossier neuf.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const racine = mkdtempSync(join(tmpdir(), 'bot-store-'));
const dossierSrc = join(racine, 'src');
const dossierData = join(racine, 'data');
mkdirSync(dossierSrc, { recursive: true });
mkdirSync(dossierData, { recursive: true });

// Le module résout data/ par rapport à son propre emplacement : on le recopie
// dans un dossier jetable plutôt que de toucher à la vraie configuration.
const { copyFileSync } = await import('node:fs');
copyFileSync(new URL('../src/store.js', import.meta.url), join(dossierSrc, 'store.js'));

const ETAT = join(dossierData, 'config.json');
let store;

/** Recharge le store sur un état donné (le module lit le fichier à l'import). */
async function chargerAvec(etat) {
  writeFileSync(ETAT, JSON.stringify(etat));
  // Un suffixe de requête force un nouvel import, donc un nouveau load().
  store = await import(`${join(dossierSrc, 'store.js')}?v=${Math.random()}`);
  return store;
}

after(() => rmSync(racine, { recursive: true, force: true }));

describe('Un salon par production', () => {
  test('deux productions, deux salons distincts', async () => {
    const s = await chargerAvec({
      guilds: {
        G1: {
          productions: [
            { id: 'prod-tournages', name: 'Tournages', channelId: 'salon-tournages' },
            { id: 'prod-lives', name: 'Lives', channelId: 'salon-lives' }
          ]
        }
      }
    });

    const cibles = s.getAnnouncementChannels();
    assert.equal(cibles.length, 2, 'une cible par salon');

    const tournages = cibles.find((c) => c.channelId === 'salon-tournages');
    const lives = cibles.find((c) => c.channelId === 'salon-lives');
    assert.deepEqual(tournages.productionIds, ['prod-tournages']);
    assert.deepEqual(lives.productionIds, ['prod-lives']);
    assert.equal(tournages.guildId, 'G1');
  });

  test('deux productions dans le même salon ne font qu’une cible', async () => {
    const s = await chargerAvec({
      guilds: {
        G1: {
          productions: [
            { id: 'a', name: 'A', channelId: 'commun' },
            { id: 'b', name: 'B', channelId: 'commun' }
          ]
        }
      }
    });

    const cibles = s.getAnnouncementChannels();
    assert.equal(cibles.length, 1, 'le salon ne doit être ouvert qu’une fois');
    assert.deepEqual(cibles[0].productionIds.sort(), ['a', 'b']);
  });

  test('une production sans salon n’annonce nulle part', async () => {
    const s = await chargerAvec({
      guilds: {
        G1: {
          productions: [
            { id: 'a', name: 'A', channelId: 'salon-a' },
            { id: 'b', name: 'B' }
          ]
        }
      }
    });

    const cibles = s.getAnnouncementChannels();
    assert.equal(cibles.length, 1);
    assert.deepEqual(cibles[0].productionIds, ['a']);
  });

  test('plusieurs serveurs restent indépendants', async () => {
    const s = await chargerAvec({
      guilds: {
        G1: { productions: [{ id: 'a', name: 'A', channelId: 'salon-g1' }] },
        G2: { productions: [{ id: 'a', name: 'A', channelId: 'salon-g2' }] }
      }
    });

    const cibles = s.getAnnouncementChannels();
    assert.equal(cibles.length, 2);
    assert.deepEqual(
      cibles.map((c) => `${c.guildId}:${c.channelId}`).sort(),
      ['G1:salon-g1', 'G2:salon-g2']
    );
  });
});

describe('Configurations existantes', () => {
  test('l’ancien salon unique continue de servir pour toutes les productions', async () => {
    // Un serveur configuré AVANT le salon par production : il n'a que
    // announcementChannelId. Rien ne doit changer pour lui.
    const s = await chargerAvec({
      guilds: {
        G1: {
          announcementChannelId: 'ancien-salon',
          productions: [
            { id: 'a', name: 'A' },
            { id: 'b', name: 'B' }
          ]
        }
      }
    });

    const cibles = s.getAnnouncementChannels();
    assert.equal(cibles.length, 1, 'un seul salon, comme avant');
    assert.equal(cibles[0].channelId, 'ancien-salon');
    assert.deepEqual(cibles[0].productionIds.sort(), ['a', 'b']);
  });

  test('un salon propre l’emporte sur l’ancien salon unique', async () => {
    const s = await chargerAvec({
      guilds: {
        G1: {
          announcementChannelId: 'ancien-salon',
          productions: [
            { id: 'a', name: 'A', channelId: 'salon-a' },
            { id: 'b', name: 'B' }
          ]
        }
      }
    });

    const cibles = s.getAnnouncementChannels();
    const a = cibles.find((c) => c.productionIds.includes('a'));
    const b = cibles.find((c) => c.productionIds.includes('b'));
    assert.equal(a.channelId, 'salon-a', 'A suit son propre salon');
    assert.equal(b.channelId, 'ancien-salon', 'B retombe sur l’ancien');
  });

  test('l’ancien format mono-production reste lu', async () => {
    const s = await chargerAvec({
      guilds: {
        G1: {
          announcementChannelId: 'salon',
          productionId: 'vieille-prod',
          productionName: 'Vieille Prod'
        }
      }
    });

    const cibles = s.getAnnouncementChannels();
    assert.equal(cibles.length, 1);
    assert.deepEqual(cibles[0].productionIds, ['vieille-prod']);
    assert.equal(cibles[0].channelId, 'salon');
  });
});

describe('Modification de la configuration', () => {
  beforeEach(async () => {
    await chargerAvec({
      guilds: {
        G1: {
          productions: [
            { id: 'a', name: 'A', channelId: 'salon-a' },
            { id: 'b', name: 'B', channelId: 'salon-b' }
          ]
        }
      }
    });
  });

  test('relancer /setup ne fait pas oublier les salons déjà choisis', async () => {
    // Exactement ce que fait l'étape 1 de l'assistant : réécrire la liste.
    store.setGuildProductions('G1', [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' }
    ]);

    const prods = store.getGuildProductions('G1');
    assert.equal(prods.find((p) => p.productionId === 'a').channelId, 'salon-a');
    assert.equal(prods.find((p) => p.productionId === 'b').channelId, 'salon-b');
    assert.equal(
      prods.find((p) => p.productionId === 'c').channelId,
      null,
      'la nouvelle production attend son salon'
    );
  });

  test('changer le salon d’une production ne touche pas à l’autre', async () => {
    assert.equal(store.setProductionChannel('G1', 'a', 'nouveau-salon'), true);

    const cibles = store.getAnnouncementChannels();
    assert.equal(cibles.find((c) => c.productionIds.includes('a')).channelId, 'nouveau-salon');
    assert.equal(cibles.find((c) => c.productionIds.includes('b')).channelId, 'salon-b');
  });

  test('une production inconnue du serveur est refusée', async () => {
    assert.equal(store.setProductionChannel('G1', 'inexistante', 'salon'), false);
    assert.equal(store.setProductionChannel('G-inconnu', 'a', 'salon'), false);
  });

  test('déconnecter le serveur coupe toutes les annonces', async () => {
    store.clearGuildProductions('G1');
    store.clearAnnouncementChannel('G1');
    assert.deepEqual(store.getAnnouncementChannels(), []);
  });

  test('les notifications ciblent les serveurs de la bonne production', async () => {
    assert.deepEqual(store.getGuildsForProduction('a'), ['G1']);
    assert.deepEqual(store.getGuildsForProduction('inexistante'), []);
  });
});
