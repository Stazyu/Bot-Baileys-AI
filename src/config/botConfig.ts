import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface BotConfig {
  ownerNumbers: string[];
  prefixes: string[];
}

let config: BotConfig | null = null;

export function loadConfig(): BotConfig {
  if (config) {
    return config;
  }

  // Try to load from config.json
  const configPath = join(__dirname, '../../config.json');
  
  if (existsSync(configPath)) {
    try {
      const configData = JSON.parse(readFileSync(configPath, 'utf-8'));
      config = {
        ownerNumbers: configData.ownerNumbers || [],
        prefixes: configData.prefixes || ['!'],
      };
      return config;
    } catch (error) {
      console.error('❌ [BotConfig] Failed to load config.json:', error);
    }
  }

  // Fallback to environment variables
  const ownerNumbersEnv = process.env.OWNER_NUMBERS || '';
  const prefixesEnv = process.env.PREFIXES || '!';

  config = {
    ownerNumbers: ownerNumbersEnv.split(',').map(n => n.trim()).filter(n => n.length > 0),
    prefixes: prefixesEnv.split(',').map(p => p.trim()).filter(p => p.length > 0),
  };

  return config;
}

export function getOwnerNumbers(): string[] {
  return loadConfig().ownerNumbers;
}

export function getPrefixes(): string[] {
  return loadConfig().prefixes;
}

export function isOwner(jid: string): boolean {
  const ownerNumbers = getOwnerNumbers();
  return ownerNumbers.some(owner => jid.includes(owner) || owner.includes(jid));
}

export default {
  loadConfig,
  getOwnerNumbers,
  getPrefixes,
  isOwner,
};
