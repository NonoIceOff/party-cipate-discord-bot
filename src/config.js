import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`❌ Variable d'environnement manquante : ${name}`);
    console.error('   Copiez .env.example en .env et remplissez les valeurs.');
    process.exit(1);
  }
  return value.trim();
}

// Liste blanche des destinataires autorisés pour les notifications MP.
// Garde-fou anti-spam : tant que la liste ne contient pas « * », SEULS ces membres
// (identifiant Discord ou nom d'utilisateur, insensible à la casse) reçoivent
// réellement les MP de notification. Par défaut : uniquement « nonoice ».
// Mettre NOTIFY_ALLOWLIST=* pour autoriser l'envoi à tous les membres.
const notifyAllowlist = (process.env.NOTIFY_ALLOWLIST || 'nonoice')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const config = {
  discordToken: required('DISCORD_BOT_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  guildId: (process.env.DISCORD_GUILD_ID || '').trim() || null,
  apiUrl: required('PM_API_URL').replace(/\/$/, ''),
  botApiKey: required('BOT_API_KEY'),
  notifyAllowlist
};
