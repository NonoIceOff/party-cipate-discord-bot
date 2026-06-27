import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Charge toutes les commandes du dossier (hors ce fichier index).
export async function loadCommands() {
  const files = readdirSync(here).filter(
    (f) => f.endsWith('.js') && f !== 'index.js'
  );

  const commands = new Map();
  for (const file of files) {
    const mod = await import(pathToFileURL(join(here, file)).href);
    if (!mod.data || !mod.execute) {
      console.warn(`⚠️  Commande ignorée (data/execute manquant) : ${file}`);
      continue;
    }
    commands.set(mod.data.name, mod);
  }
  return commands;
}
