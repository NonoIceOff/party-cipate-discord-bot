import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getPendingGameInvites } from './api.js';
import { SITE_URL } from './site.js';

/**
 * Invitations à un salon de jeu, envoyées en message privé.
 *
 * Même rythme et mêmes précautions que les autres notifications : relever un
 * lot le marque comme envoyé côté API, donc on ne relève qu'au moment
 * d'envoyer. Un message privé raté n'est pas réessayé — insister sur
 * quelqu'un dont les MP sont fermés ne sert à rien, et quand ils sont
 * ouverts, c'est du harcèlement.
 */

const POLL_INTERVAL_MS = 15_000;
const DM_DELAY_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Nom lisible d'un jeu, pour ne pas écrire « uno » en minuscules. */
const NOMS_JEUX = { uno: 'Uno' };

function nomJeu(id) {
  return NOMS_JEUX[id] ?? id;
}

function inviteEmbed(invitation) {
  return new EmbedBuilder()
    .setColor(0xe8b21e)
    .setTitle(`🎲 ${invitation.from} t'invite à jouer`)
    .setDescription(
      `Une partie de **${nomJeu(invitation.game)}** t'attend sur Party-cipate.\n\n` +
        `Code du salon : \`${invitation.code}\``
    )
    .setFooter({ text: 'Tu peux entrer avec ton compte, ou juste un pseudo.' });
}

function inviteBouton(invitation) {
  const url = invitation.url || `${SITE_URL}/jeux/${invitation.code}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Rejoindre la partie').setURL(url)
  );
}

async function envoyerUne(client, invitation) {
  try {
    const user = await client.users.fetch(invitation.discordId);
    await user.send({
      embeds: [inviteEmbed(invitation)],
      components: [inviteBouton(invitation)]
    });
  } catch (err) {
    // MP fermés, compte parti… : l'invitation est déjà marquée côté API, on
    // ne réessaiera pas. Celui qui invite verra simplement que personne
    // n'arrive, ce qui est moins pire que d'insister.
    console.error(
      `Invitation au salon ${invitation.code} : MP non envoyé (${err.message}).`
    );
  }
}

async function relever(client) {
  let invitations;
  try {
    invitations = await getPendingGameInvites();
  } catch (err) {
    console.error('Relève des invitations de jeu échouée :', err.message);
    return;
  }
  for (const invitation of invitations) {
    await envoyerUne(client, invitation);
    await sleep(DM_DELAY_MS);
  }
}

export function startGameInviteNotifier(client) {
  setInterval(() => {
    relever(client).catch((err) =>
      console.error('Relève des invitations (interval) échouée :', err.message)
    );
  }, POLL_INTERVAL_MS);
}
