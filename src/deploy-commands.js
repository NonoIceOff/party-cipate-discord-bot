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
    // Déploiement global : propagation jusqu'à ~1h.
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log('✅ Commandes globales enregistrées (propagation jusqu\'à 1h).');
  }
} catch (err) {
  console.error('❌ Échec de l\'enregistrement des commandes :', err);
  process.exit(1);
}
