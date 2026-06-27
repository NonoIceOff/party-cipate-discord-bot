import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder
} from 'discord.js';
import { listProductions, apiError } from '../api.js';
import { setGuildProduction, setAnnouncementChannel } from '../store.js';

const CHANNEL_PREFIX = 'setup:chan:';
const ACCENT = 0xa855f7;

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configure le bot étape par étape (production + salon d’annonces).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false);

function stepProductionEmbed() {
  return new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('⚙️ Configuration — Étape 1/2')
    .setDescription(
      'Choisis la **production** à connecter à ce serveur.\n' +
        'Seuls les événements de cette production seront annoncés ici.'
    );
}

function stepChannelEmbed(productionName) {
  return new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('⚙️ Configuration — Étape 2/2')
    .setDescription(
      `Production : **${productionName}**\n\n` +
        'Choisis maintenant le **salon** où poster les annonces de nouveaux événements.'
    );
}

function doneEmbed(productionName, channelId) {
  return new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle('✅ Configuration terminée')
    .setDescription(
      `Production connectée : **${productionName}**\n` +
        `Salon d’annonces : <#${channelId}>\n\n` +
        'Les nouveaux événements de cette production seront automatiquement annoncés ici.\n' +
        '_Pour reconfigurer : relance `/setup`. Pour déconnecter : `/connect reset`._'
    );
}

export async function execute(interaction) {
  if (!interaction.guildId) {
    await interaction.reply({
      content: '❌ Cette commande s’utilise sur un serveur.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  let productions;
  try {
    productions = await listProductions();
  } catch (err) {
    await interaction.editReply(`❌ Impossible de récupérer les productions : ${apiError(err)}`);
    return;
  }

  if (!productions.length) {
    await interaction.editReply(
      'ℹ️ Aucune production n’est disponible pour le moment. Crée d’abord une production sur Party-cipate.'
    );
    return;
  }

  const options = productions.slice(0, 25).map((p) => {
    const opt = {
      label: String(p.name ?? 'Sans nom').slice(0, 100),
      value: String(p.id)
    };
    if (p.description) {
      opt.description = String(p.description).slice(0, 100);
    }
    return opt;
  });

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup:prod')
      .setPlaceholder('Sélectionne ta production…')
      .addOptions(options)
  );

  await interaction.editReply({
    embeds: [stepProductionEmbed()],
    components: [row]
  });
}

// Gère les sélections du flux /setup (menus déroulants).
export async function handleComponent(interaction) {
  // Étape 1 → l'utilisateur a choisi une production : on propose le salon.
  if (interaction.customId === 'setup:prod') {
    const productionId = interaction.values?.[0];
    if (!productionId) {
      await interaction.update({
        content: '❌ Sélection invalide, relance `/setup`.',
        embeds: [],
        components: []
      });
      return;
    }

    let productionName = productionId;
    try {
      const productions = await listProductions();
      const prod = productions.find((p) => String(p.id) === String(productionId));
      if (prod?.name) productionName = prod.name;
    } catch {
      /* on garde l'id en repli, ce n'est qu'un affichage */
    }

    const row = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`${CHANNEL_PREFIX}${productionId}`)
        .setPlaceholder('Sélectionne le salon d’annonces…')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1)
    );

    await interaction.update({
      embeds: [stepChannelEmbed(productionName)],
      components: [row]
    });
    return;
  }

  // Étape 2 → l'utilisateur a choisi le salon : on enregistre tout.
  if (interaction.customId.startsWith(CHANNEL_PREFIX)) {
    const productionId = interaction.customId.slice(CHANNEL_PREFIX.length);
    const channelId = interaction.values?.[0];

    // On accuse réception tôt : la résolution de la production passe par l'API.
    await interaction.deferUpdate();

    let production;
    try {
      const productions = await listProductions();
      production = productions.find((p) => String(p.id) === String(productionId));
    } catch (err) {
      await interaction.editReply({
        content: `❌ ${apiError(err)}`,
        embeds: [],
        components: []
      });
      return;
    }

    if (!production) {
      await interaction.editReply({
        content: '❌ Production introuvable, relance `/setup`.',
        embeds: [],
        components: []
      });
      return;
    }

    // Vérifie que le bot peut écrire dans le salon choisi.
    const channel = await interaction.guild?.channels?.fetch(channelId).catch(() => null);
    const me = interaction.guild?.members?.me;
    const perms = channel && me ? channel.permissionsFor(me) : null;
    if (perms && !perms.has(PermissionFlagsBits.SendMessages)) {
      await interaction.editReply({
        content: `❌ Je n’ai pas la permission d’écrire dans <#${channelId}>. Donne-moi l’accès puis relance \`/setup\`.`,
        embeds: [],
        components: []
      });
      return;
    }

    setGuildProduction(interaction.guildId, production.id, production.name);
    setAnnouncementChannel(interaction.guildId, channelId);

    await interaction.editReply({
      content: '',
      embeds: [doneEmbed(production.name, channelId)],
      components: []
    });
  }
}
