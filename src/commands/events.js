import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { listEvents, apiError } from '../api.js';
import { eventLine, isEventJoinable } from '../events-ui.js';

export const data = new SlashCommandBuilder()
  .setName('events')
  .setDescription('Liste les événements Party-cipate.')
  .addBooleanOption((opt) =>
    opt
      .setName('ouverts')
      .setDescription('N\'afficher que les événements ouverts aux inscriptions.')
      .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const onlyOpen = interaction.options.getBoolean('ouverts') ?? false;

  try {
    let events = await listEvents();
    if (onlyOpen) events = events.filter(isEventJoinable);

    if (!events.length) {
      await interaction.editReply(
        onlyOpen
          ? 'Aucun événement ouvert aux inscriptions pour le moment.'
          : 'Aucun événement pour le moment.'
      );
      return;
    }

    // Discord limite un embed à 25 champs / 6000 caractères : on borne à 20 events.
    const shown = events.slice(0, 20);
    const embed = new EmbedBuilder()
      .setTitle(onlyOpen ? 'Événements ouverts' : 'Événements Party-cipate')
      .setColor(0x5865f2)
      .setDescription(shown.map(eventLine).join('\n\n'))
      .setFooter({
        text:
          events.length > shown.length
            ? `${shown.length}/${events.length} affichés • /inscription pour participer`
            : 'Utilise /inscription pour participer'
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply(`❌ ${apiError(err)}`);
  }
}
