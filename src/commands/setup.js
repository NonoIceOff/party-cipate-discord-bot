import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder
} from 'discord.js';
import { listProductions } from '../api.js';
import { PERM, formatApiError } from '../errors.js';
import {
  setGuildProductions,
  setProductionChannel,
  clearGuildProductions,
  clearAnnouncementChannel,
  getGuildProductions
} from '../store.js';

// Un salon par production : l'identifiant du composant porte la production
// concernée, ce qui évite de transporter l'avancement de l'assistant ailleurs.
const CHANNEL_PREFIX = 'setup:chan:';
const DISCONNECT_VALUE = '__disconnect__';
const ACCENT = 0xa855f7;

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configure le bot étape par étape (production + salon d’annonces).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false);

function formatProdNames(list) {
  return list
    .map((p) => `**${p.productionName ?? p.name ?? p.productionId ?? p.id}**`)
    .join(', ');
}

function stepProductionEmbed(current) {
  const base =
    'Choisis **une ou plusieurs productions** à connecter à ce serveur.\n' +
    'Seuls les événements de ces productions seront annoncés ici.';
  const status =
    current && current.length
      ? `\n\n🔗 Actuellement connecté à : ${formatProdNames(current)}`
      : '';
  return new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('⚙️ Configuration — Étape 1/2')
    .setDescription(base + status);
}

function disconnectedEmbed() {
  return new EmbedBuilder()
    .setColor(0x6b7280)
    .setTitle('🔌 Serveur déconnecté')
    .setDescription(
      'Ce serveur n’est plus connecté à aucune production. Aucune annonce ne sera postée.\n' +
        '_Relance `/setup` pour le reconfigurer._'
    );
}

/**
 * Étape « salon » pour UNE production. Avec plusieurs productions connectées,
 * l'assistant repasse ici une fois par production : c'est ce qui permet de les
 * annoncer dans des salons différents.
 */
function stepChannelEmbed(prod, rang, total) {
  const etape = 1 + rang + 1; // étape 1 = choix des productions
  const totalEtapes = 1 + total;
  const intro =
    total > 1
      ? `Un salon par production — ${rang + 1}ᵉ sur ${total}.\n\n`
      : '';
  const actuel = prod.channelId ? `\n\n_Actuellement : <#${prod.channelId}>_` : '';
  return new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle(`⚙️ Configuration — Étape ${etape}/${totalEtapes}`)
    .setDescription(
      intro +
        `Dans quel **salon** annoncer les événements de **${prod.productionName ?? prod.productionId}** ?` +
        actuel
    );
}

function doneEmbed(productions) {
  const lignes = productions
    .map((p) => {
      const nom = p.productionName ?? p.productionId;
      return p.channelId
        ? `• **${nom}** → <#${p.channelId}>`
        : `• **${nom}** → _aucun salon, rien ne sera annoncé_`;
    })
    .join('\n');
  return new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle('✅ Configuration terminée')
    .setDescription(
      `${lignes}\n\n` +
        'Les nouveaux événements seront annoncés dans le salon de leur production.\n' +
        '_Pour reconfigurer ou déconnecter : relance `/setup`._'
    );
}

/** Menu de choix du salon pour une production, salon actuel présélectionné. */
function channelRow(prod) {
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId(`${CHANNEL_PREFIX}${prod.productionId}`)
    .setPlaceholder('Sélectionne le salon d’annonces…')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  // Présélectionner l'existant : reconduire un salon ne coûte qu'un clic.
  if (prod.channelId) menu.setDefaultChannels(prod.channelId);
  return new ActionRowBuilder().addComponents(menu);
}

export async function execute(interaction) {
  if (!interaction.guildId) {
    await interaction.reply({
      content: '❌ Cette commande s’utilise sur un serveur.',
      ephemeral: true
    });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: PERM.manageGuild, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  let productions;
  try {
    productions = await listProductions();
  } catch (err) {
    await interaction.editReply(
      `Impossible de récupérer les productions.\n${formatApiError(err)}`
    );
    return;
  }

  if (!productions.length) {
    await interaction.editReply(
      'ℹ️ Aucune production n’est disponible pour le moment. Crée d’abord une production sur Party-cipate.'
    );
    return;
  }

  const current = getGuildProductions(interaction.guildId);
  const currentIds = new Set(current.map((c) => String(c.productionId)));

  const options = productions.slice(0, 24).map((p) => {
    const opt = {
      label: String(p.name ?? 'Sans nom').slice(0, 100),
      value: String(p.id),
      default: currentIds.has(String(p.id))
    };
    if (p.description) {
      opt.description = String(p.description).slice(0, 100);
    }
    return opt;
  });

  // Si déjà configuré, on propose de se déconnecter directement depuis le menu.
  if (current.length) {
    options.push({
      label: '🔌 Déconnecter ce serveur',
      value: DISCONNECT_VALUE,
      description: 'Ne plus annoncer d’événements ici.'
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup:prod')
      .setPlaceholder('Sélectionne une ou plusieurs productions…')
      .setMinValues(1)
      .setMaxValues(options.length)
      .addOptions(options)
  );

  await interaction.editReply({
    embeds: [stepProductionEmbed(current)],
    components: [row]
  });
}

// Gère les sélections du flux /setup (menus déroulants).
export async function handleComponent(interaction) {
  if (
    interaction.guildId &&
    !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    await interaction.reply({ content: PERM.manageGuild, ephemeral: true });
    return;
  }

  // Étape 1 → l'utilisateur a choisi ses productions : on propose le salon.
  if (interaction.customId === 'setup:prod') {
    const values = interaction.values || [];
    if (!values.length) {
      await interaction.update({
        content: '❌ Sélection invalide, relance `/setup`.',
        embeds: [],
        components: []
      });
      return;
    }

    // Déconnexion demandée depuis le menu (prioritaire sur le reste).
    if (values.includes(DISCONNECT_VALUE)) {
      clearGuildProductions(interaction.guildId);
      clearAnnouncementChannel(interaction.guildId);
      await interaction.update({ embeds: [disconnectedEmbed()], components: [] });
      return;
    }

    // Résout les noms des productions sélectionnées (repli sur l'id).
    let selected = values.map((id) => ({ id, name: id }));
    try {
      const productions = await listProductions();
      selected = values.map((id) => {
        const prod = productions.find((p) => String(p.id) === String(id));
        return { id, name: prod?.name || id };
      });
    } catch {
      /* on garde les ids en repli, ce n'est qu'un affichage */
    }

    // On enregistre tout de suite les productions ; l'étape 2 ne fait
    // qu'ajouter le salon (évite de transporter les ids dans le customId).
    setGuildProductions(interaction.guildId, selected);

    // On redemande le salon de CHAQUE production, l'actuel présélectionné :
    // c'est aussi comme ça qu'on en change un sans tout refaire.
    const prods = getGuildProductions(interaction.guildId);
    await interaction.update({
      embeds: [stepChannelEmbed(prods[0], 0, prods.length)],
      components: [channelRow(prods[0])]
    });
    return;
  }

  // Étapes suivantes → un salon choisi pour une production donnée.
  if (interaction.customId.startsWith(CHANNEL_PREFIX)) {
    const productionId = interaction.customId.slice(CHANNEL_PREFIX.length);
    const channelId = interaction.values?.[0];

    await interaction.deferUpdate();

    const productions = getGuildProductions(interaction.guildId);
    if (!productions.length) {
      await interaction.editReply({
        content: '❌ Aucune production sélectionnée, relance `/setup`.',
        embeds: [],
        components: []
      });
      return;
    }

    const rang = productions.findIndex((p) => String(p.productionId) === productionId);
    if (rang === -1) {
      await interaction.editReply({
        content: '❌ Cette production n’est plus connectée au serveur, relance `/setup`.',
        embeds: [],
        components: []
      });
      return;
    }

    // Vérifie que le bot peut écrire dans le salon choisi. Sans ce contrôle,
    // la configuration paraîtrait réussie et aucune annonce n'arriverait.
    const channel = await interaction.guild?.channels?.fetch(channelId).catch(() => null);
    const me = interaction.guild?.members?.me;
    const perms = channel && me ? channel.permissionsFor(me) : null;
    if (perms && !perms.has(PermissionFlagsBits.SendMessages)) {
      await interaction.editReply({
        content: PERM.botSendMessages(channelId),
        embeds: [stepChannelEmbed(productions[rang], rang, productions.length)],
        components: [channelRow(productions[rang])]
      });
      return;
    }

    setProductionChannel(interaction.guildId, productionId, channelId);

    // Production suivante, s'il en reste une.
    const suivante = productions[rang + 1];
    if (suivante) {
      await interaction.editReply({
        content: '',
        embeds: [stepChannelEmbed(suivante, rang + 1, productions.length)],
        components: [channelRow(suivante)]
      });
      return;
    }

    await interaction.editReply({
      content: '',
      embeds: [doneEmbed(getGuildProductions(interaction.guildId))],
      components: []
    });
  }
}
