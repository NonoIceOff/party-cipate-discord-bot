/**
 * URL publique du site.
 *
 * Isolée de config.js, qui s'arrête faute de token Discord : les modules qui
 * ne font que fabriquer un lien (embeds, /dispo) n'ont pas à exiger une
 * configuration de bot complète — et les tests non plus.
 */
export const SITE_URL = (process.env.SITE_URL || 'https://party-cipate-next.vercel.app')
  .trim()
  .replace(/\/$/, '');
