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
// Par défaut « * » : AUCUNE restriction, les MP partent à tous les membres des
// serveurs connectés à la production. Pour re-restreindre (ex. phase de test),
// définir NOTIFY_ALLOWLIST=nom_ou_id[,autre…] : seuls ces membres recevront alors
// les MP (identifiant Discord ou nom d'utilisateur, insensible à la casse).
const notifyAllowlist = (process.env.NOTIFY_ALLOWLIST || '*')
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
