import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config } from './config.js';
import { loadCommands } from './commands/index.js';
import { handleEventButton } from './buttons.js';
import { startAnnouncer } from './announcer.js';

const client = new Client({
  // Les slash commands ne nécessitent pas d'intents privilégiés.
  intents: [GatewayIntentBits.Guilds]
});

const commands = await loadCommands();
console.log(`🔌 ${commands.size} commande(s) chargée(s) : ${[...commands.keys()].join(', ')}`);

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Connecté en tant que ${c.user.tag}`);
  console.log(`🌐 API Party-cipate : ${config.apiUrl}`);
  startAnnouncer(c);
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Boutons (inscription/désinscription sur les embeds d'événement).
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('evt:')) {
      try {
        await handleEventButton(interaction);
      } catch (err) {
        console.error('Erreur bouton événement :', err);
        await safeReply(interaction, '❌ Une erreur est survenue.');
      }
    }
    return;
  }

  // Autocomplétion des options.
  if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        console.error(`Erreur autocomplete /${interaction.commandName} :`, err);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    await safeReply(interaction, '❌ Commande inconnue.');
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Erreur commande /${interaction.commandName} :`, err);
    await safeReply(interaction, '❌ Une erreur est survenue lors de l\'exécution.');
  }
});

// Répond proprement que l'interaction ait déjà été différée ou non.
async function safeReply(interaction, content) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(content);
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  } catch {
    /* l'interaction a peut-être expiré : on ignore. */
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('Rejet non géré :', reason);
});

client.login(config.discordToken);
