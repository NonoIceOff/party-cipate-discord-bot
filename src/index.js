import { Client, GatewayIntentBits, Events, Partials } from 'discord.js';
import { config } from './config.js';
import { loadCommands } from './commands/index.js';
import { handleEventButton } from './buttons.js';
import { handleNotifyButton, handleDmButton } from './notifier.js';
import { startAnnouncer } from './announcer.js';

const client = new Client({
  // GuildMembers (intent PRIVILÉGIÉ) est requis pour énumérer les membres d'un
  // serveur et leur proposer l'inscription par MP (bouton « Notifier par MP »).
  // ⚠️ À activer dans le Developer Portal (Bot > Server Members Intent), sinon la
  // connexion échoue au démarrage.
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  // Partials.Channel permet de recevoir les interactions (clics de boutons) dans
  // les MP même si le salon privé n'est pas encore en cache.
  partials: [Partials.Channel]
});

const commands = await loadCommands();
console.log(`🔌 ${commands.size} commande(s) chargée(s) : ${[...commands.keys()].join(', ')}`);

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Connecté en tant que ${c.user.tag}`);
  console.log(`🌐 API Party-cipate : ${config.apiUrl}`);
  startAnnouncer(c);
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Menus déroulants (flux guidé /setup : production + salon).
  if (interaction.isAnySelectMenu()) {
    if (interaction.customId.startsWith('setup:')) {
      const command = commands.get('setup');
      try {
        await command?.handleComponent?.(interaction);
      } catch (err) {
        console.error('Erreur composant /setup :', err);
        await safeReply(interaction, '❌ Une erreur est survenue.');
      }
    }
    return;
  }

  // Boutons.
  if (interaction.isButton()) {
    const id = interaction.customId;
    try {
      if (id.startsWith('evt:')) {
        // Inscription/désinscription/J'aime sur les embeds d'événement.
        await handleEventButton(interaction);
      } else if (id.startsWith('notify:')) {
        // Déclenchement des notifications MP (côté organisateur).
        await handleNotifyButton(interaction);
      } else if (id.startsWith('dm:')) {
        // Boutons présents dans les MP de notification (côté membre).
        await handleDmButton(interaction);
      }
    } catch (err) {
      console.error('Erreur bouton :', err);
      await safeReply(interaction, '❌ Une erreur est survenue.');
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
