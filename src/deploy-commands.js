import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { loadCommands } from './commands/index.js';

/**
 * Enregistrement des commandes slash.
 *
 * Un point à ne pas se tromper : Discord ne déduplique PAS. Une commande
 * enregistrée à la fois globalement et sur un serveur apparaît DEUX FOIS dans
 * la liste, la version serveur ne masquant pas la version globale. C'est ce
 * que faisait l'ancien script — déploiement global « plus » un déploiement par
 * serveur pour la rapidité — et c'est ce qui laissait des doublons.
 *
 * On choisit donc l'un ou l'autre, jamais les deux :
 *  - DISCORD_GUILD_ID défini : un seul serveur, instantané (pour le dev) ;
 *  - sinon : global, et on VIDE les commandes de chaque serveur, pour effacer
 *    les doublons que les anciens déploiements y ont laissés.
 */

const commands = await loadCommands();
const body = [...commands.values()].map((c) => c.data.toJSON());

const rest = new REST({ version: '10' }).setToken(config.discordToken);

/** Retire les commandes propres à chaque serveur (celles qui font doublon). */
async function viderCommandesDeServeur() {
  let guilds;
  try {
    guilds = await rest.get(Routes.userGuilds());
  } catch (err) {
    console.warn(
      '⚠️  Impossible de lister les serveurs : d\'anciens doublons peuvent subsister.',
      err?.message || err
    );
    return;
  }

  let nettoyes = 0;
  for (const g of guilds) {
    try {
      const existantes = await rest.get(
        Routes.applicationGuildCommands(config.clientId, g.id)
      );
      if (!existantes.length) continue;
      await rest.put(Routes.applicationGuildCommands(config.clientId, g.id), { body: [] });
      nettoyes++;
      console.log(`🧹 ${existantes.length} commande(s) en double retirée(s) de « ${g.name} ».`);
    } catch (err) {
      console.warn(`⚠️  Nettoyage ignoré sur « ${g.name} » :`, err?.message || err);
    }
  }

  if (nettoyes === 0) console.log('✨ Aucun doublon à retirer.');
}

try {
  console.log(`⏳ Enregistrement de ${body.length} commande(s)...`);

  if (config.guildId) {
    // Déploiement sur un serveur précis : instantané (idéal en dev).
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    console.log(`✅ Commandes enregistrées sur le serveur ${config.guildId}.`);
    console.log(
      'ℹ️  DISCORD_GUILD_ID est défini : les commandes globales ne sont pas touchées.\n' +
        '   Si des commandes globales existent, elles s\'ajouteront à celles-ci dans la liste.'
    );
  } else {
    // Déploiement global : persistant, propagation jusqu'à ~1 h.
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log('✅ Commandes globales enregistrées (propagation jusqu\'à 1h).');
    await viderCommandesDeServeur();
  }
} catch (err) {
  console.error('❌ Échec de l\'enregistrement des commandes :', err);
  process.exit(1);
}
