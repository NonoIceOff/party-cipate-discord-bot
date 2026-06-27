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

export const config = {
  discordToken: required('DISCORD_BOT_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  guildId: (process.env.DISCORD_GUILD_ID || '').trim() || null,
  apiUrl: required('PM_API_URL').replace(/\/$/, ''),
  botApiKey: required('BOT_API_KEY')
};
