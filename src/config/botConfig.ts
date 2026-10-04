import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import { log } from '../utils/logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface BotConfig {
  ownerNumbers: string[];
  prefixes: string[];
  maintenance: boolean;
  maintenanceMessage?: string;
}

let config: BotConfig | null = null;

export function loadConfig(): BotConfig {
  if (config !== null) {
    return config;
  }

  // Default config
  const defaultConfig: BotConfig = {
    ownerNumbers: [],
    prefixes: ['!'],
    maintenance: false,
    maintenanceMessage: '🔧 Bot sedang dalam maintenance. Silakan coba lagi nanti.',
  };

  // Try to load from config.json
  const configPath = join(__dirname, '../../config.json');

  if (existsSync(configPath)) {
    try {
      const configData = JSON.parse(readFileSync(configPath, 'utf-8'));
      config = {
        ownerNumbers: configData.ownerNumbers || defaultConfig.ownerNumbers,
        prefixes: configData.prefixes || defaultConfig.prefixes,
        maintenance: configData.maintenance ?? defaultConfig.maintenance,
        maintenanceMessage: configData.maintenanceMessage || defaultConfig.maintenanceMessage,
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
    maintenance: process.env.MAINTENANCE === 'true',
    maintenanceMessage: process.env.MAINTENANCE_MESSAGE || defaultConfig.maintenanceMessage,
  };

  return config;
}


/**
 * Patch the in-memory config (called by PATCH /api/settings).
 * Persistence to BotConfig is done by the caller; this hot-reloads without restart.
 */
export function patchRuntimeConfig(patch: Partial<BotConfig>): BotConfig {
  const current = loadConfig();
  config = { ...current, ...patch };
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

export function isMaintenance(): boolean {
  return loadConfig().maintenance;
}

export interface CreatorInfo {
  name: string;
  socials?: Record<string, string>;
  note?: string;
}

/**
 * Pembuat bot dibaca dari env BOT_CREATOR (JSON) — contoh:
 * BOT_CREATOR={"name":"Wahyu","socials":{"instagram":"@wahyu"}}
 */
export function getCreatorInfo(): CreatorInfo | null {
  const raw = process.env.BOT_CREATOR;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.name !== 'string' || parsed.name.length === 0) {
      log.warn('[BotConfig] BOT_CREATOR harus punya field "name"');
      return null;
    }
    return parsed as CreatorInfo;
  } catch {
    log.warn('[BotConfig] BOT_CREATOR bukan JSON valid');
    return null;
  }
}

export function getMaintenanceMessage(): string {
  return loadConfig().maintenanceMessage || '🔧 Bot sedang dalam maintenance. Silakan coba lagi nanti.';
}

export default {
  loadConfig,
  patchRuntimeConfig,
  getOwnerNumbers,
  getPrefixes,
  isOwner,
  isMaintenance,
  getMaintenanceMessage,
  getCreatorInfo,
};
