import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { loadCommands } from './commands/index.js';

const commands = await loadCommands();
const body = [...commands.values()].map((c) => c.data.toJSON());

const rest = new REST({ version: '10' }).setToken(config.discordToken);

try {
  console.log(`⏳ Enregistrement de ${body.length} commande(s)...`);

  if (config.guildId) {
    // Déploiement sur un serveur précis : instantané (idéal en dev).
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body }
    );
    console.log(`✅ Commandes enregistrées sur le serveur ${config.guildId}.`);
  } else {
    // Déploiement global : persistant mais propagation jusqu'à ~1h.
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log('✅ Commandes globales enregistrées (propagation jusqu\'à 1h).');

    // Pour une visibilité IMMÉDIATE, on enregistre aussi les commandes dans
    // chaque serveur où le bot est présent (les commandes de serveur sont
    // instantanées et masquent leurs équivalents globaux le temps de la propagation).
    try {
      const guilds = await rest.get(Routes.userGuilds());
      for (const g of guilds) {
        await rest.put(Routes.applicationGuildCommands(config.clientId, g.id), { body });
        console.log(`⚡ Commandes instantanées enregistrées sur « ${g.name} » (${g.id}).`);
      }
      console.log(`✅ ${guilds.length} serveur(s) mis à jour immédiatement.`);
    } catch (guildErr) {
      console.warn(
        '⚠️  Enregistrement par serveur ignoré (les commandes globales suffiront) :',
        guildErr?.message || guildErr
      );
    }
  }
} catch (err) {
  console.error('❌ Échec de l\'enregistrement des commandes :', err);
  process.exit(1);
}
