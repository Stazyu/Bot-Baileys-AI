import NodeCache from 'node-cache';
import prisma from '../database/prisma.js';
import userService from './userService.js';
import { log } from '../utils/logger.js';

export interface TierConfig {
  name: string;
  dailyAiChatLimit: number;
  dailyGroupAiLimit: number;
  dailyCommandLimit: number;
}

export interface LimitCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  tier: string;
}

const TIERS: Record<string, TierConfig> = {
  free: { name: 'Free', dailyAiChatLimit: 20, dailyGroupAiLimit: 50, dailyCommandLimit: 20 },
  premium: { name: 'Premium', dailyAiChatLimit: 200, dailyGroupAiLimit: 500, dailyCommandLimit: 200 },
  pro: { name: 'Pro', dailyAiChatLimit: Number.MAX_SAFE_INTEGER, dailyGroupAiLimit: Number.MAX_SAFE_INTEGER, dailyCommandLimit: Number.MAX_SAFE_INTEGER },
};

// Tier limit overrides from BotConfig — key → [tier, field]. Pro is always unlimited.
const TIER_OVERRIDE_KEYS: Record<string, [tier: string, field: 'dailyAiChatLimit' | 'dailyGroupAiLimit' | 'dailyCommandLimit']> = {
  'tier:free:ai': ['free', 'dailyAiChatLimit'],
  'tier:free:group': ['free', 'dailyGroupAiLimit'],
  'tier:free:command': ['free', 'dailyCommandLimit'],
  'tier:premium:ai': ['premium', 'dailyAiChatLimit'],
  'tier:premium:group': ['premium', 'dailyGroupAiLimit'],
  'tier:premium:command': ['premium', 'dailyCommandLimit'],
};

/** Kunci tanggal harian (WIB) — sama dengan yang dipakai UsageLog. */
export function todayKey(): string {
  const now = new Date();
  const jakarta = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return jakarta.toISOString().slice(0, 10);
}

type ToggleKey = 'privateAi' | 'groupAi' | 'command';
const TOGGLE_CONFIG_KEYS: Record<ToggleKey, string> = {
  privateAi: 'premium:enforce_private_ai_limit',
  groupAi: 'premium:enforce_group_ai_limit',
  command: 'premium:enforce_command_limit',
};

class PremiumService {
  private cache: NodeCache;
  private readonly USAGE_CACHE_TTL_SEC = 300;
  private enforcePrivateAiLimit: boolean = true;
  private enforceGroupAiLimit: boolean = true;
  private enforceCommandLimit: boolean = true;
  private initialized: boolean = false;
  private tierOverrides: Record<string, Partial<TierConfig>> = {};

  constructor() {
    this.cache = new NodeCache({ stdTTL: this.USAGE_CACHE_TTL_SEC, checkperiod: 120 });
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const keys = Object.values(TOGGLE_CONFIG_KEYS);
      const configs = await prisma.botConfig.findMany({ where: { key: { in: keys } } });
      for (const cfg of configs) {
        const enabled = cfg.value === 'true';
        if (cfg.key === TOGGLE_CONFIG_KEYS.privateAi) this.enforcePrivateAiLimit = enabled;
        if (cfg.key === TOGGLE_CONFIG_KEYS.groupAi) this.enforceGroupAiLimit = enabled;
        if (cfg.key === TOGGLE_CONFIG_KEYS.command) this.enforceCommandLimit = enabled;
      }
      await this.reloadTiers();
      this.initialized = true;
      log.info(`🔒 [PremiumService] Init — PrivateAI: ${this.enforcePrivateAiLimit}, GroupAI: ${this.enforceGroupAiLimit}, Cmd: ${this.enforceCommandLimit}`);
    } catch (error) {
      log.error('[PremiumService] Failed to load toggle flags, using defaults:', error as object);
      this.initialized = true;
    }
  }

  /** Baca ulang override tier dari BotConfig tanpa restart. */
  async reloadTiers(): Promise<void> {
    try {
      const rows = await prisma.botConfig.findMany({ where: { key: { in: Object.keys(TIER_OVERRIDE_KEYS) } } });
      const overrides: Record<string, Partial<TierConfig>> = {};
      for (const row of rows) {
        const mapping = TIER_OVERRIDE_KEYS[row.key];
        if (!mapping) continue;
        const value = Number(row.value);
        if (!Number.isFinite(value) || value < 0) continue;
        const [tier, field] = mapping;
        overrides[tier] = { ...overrides[tier], [field]: value };
      }
      this.tierOverrides = overrides;
    } catch (error) {
      log.debug(`[PremiumService] Non-critical: tier reload failed: ${(error as Error).message}`);
    }
  }

  getTierConfig(tier: string): TierConfig {
    const base = TIERS[tier] ?? TIERS.free;
    const override = this.tierOverrides[tier];
    return override ? { ...base, ...override } : base;
  }

  getAllTiers(): Record<string, TierConfig> {
    const merged: Record<string, TierConfig> = {};
    for (const [tier, base] of Object.entries(TIERS)) {
      merged[tier] = this.tierOverrides[tier] ? { ...base, ...this.tierOverrides[tier] } : { ...base };
    }
    return merged;
  }

  async checkPrivateAiLimit(userId: string): Promise<LimitCheckResult> {
    return this.checkLimit(userId, 'aiChatCount', 'dailyAiChatLimit');
  }

  async checkGroupAiLimit(userId: string): Promise<LimitCheckResult> {
    return this.checkLimit(userId, 'groupAiCount', 'dailyGroupAiLimit');
  }

  async checkCommandLimit(userId: string): Promise<LimitCheckResult> {
    return this.checkLimit(userId, 'commandCount', 'dailyCommandLimit');
  }

  private async checkLimit(
    userId: string,
    countField: 'aiChatCount' | 'groupAiCount' | 'commandCount',
    limitField: 'dailyAiChatLimit' | 'dailyGroupAiLimit' | 'dailyCommandLimit',
  ): Promise<LimitCheckResult> {
    try {
      const user = await userService.getUser(userId);
      const tier = user?.tier ?? 'free';
      const tierConfig = this.getTierConfig(tier);
      const limit = tierConfig[limitField];
      if (limit === Number.MAX_SAFE_INTEGER) {
        return { allowed: true, remaining: Infinity, limit, tier };
      }
      const today = todayKey();
      const usage = await this.getTodayUsage(userId, today);
      const used = usage[countField] ?? 0;
      if (used >= limit) {
        return { allowed: false, remaining: 0, limit, tier };
      }
      return { allowed: true, remaining: limit - used, limit, tier };
    } catch (error) {
      log.debug(`[PremiumService] Limit check failed, allowing: ${(error as Error).message}`);
      return { allowed: true, remaining: 1, limit: 1, tier: 'free' };
    }
  }

  async incrementPrivateAiUsage(userId: string): Promise<void> {
    await this.incrementUsage(userId, 'aiChatCount');
  }

  async incrementGroupAiUsage(userId: string): Promise<void> {
    await this.incrementUsage(userId, 'groupAiCount');
  }

  async incrementCommandUsage(userId: string): Promise<void> {
    await this.incrementUsage(userId, 'commandCount');
  }

  private async incrementUsage(userId: string, field: 'aiChatCount' | 'groupAiCount' | 'commandCount'): Promise<void> {
    try {
      const today = todayKey();
      await prisma.usageLog.upsert({
        where: { userId_date: { userId, date: today } },
        create: { userId, date: today, [field]: 1 },
        update: { [field]: { increment: 1 } },
      });
      this.cache.del(this.usageCacheKey(userId, today));
    } catch (error) {
      log.debug(`[PremiumService] Non-critical: usage increment failed: ${(error as Error).message}`);
    }
  }

  async getTodayUsage(userId: string, date?: string): Promise<{ aiChatCount: number; groupAiCount: number; commandCount: number }> {
    const today = date ?? todayKey();
    const cacheKey = this.usageCacheKey(userId, today);
    const cached = this.cache.get<{ aiChatCount: number; groupAiCount: number; commandCount: number }>(cacheKey);
    if (cached) return cached;
    try {
      const usage = await prisma.usageLog.findUnique({ where: { userId_date: { userId, date: today } } });
      const result = { aiChatCount: usage?.aiChatCount ?? 0, groupAiCount: usage?.groupAiCount ?? 0, commandCount: usage?.commandCount ?? 0 };
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      log.debug(`[PremiumService] Failed to get usage: ${(error as Error).message}`);
      return { aiChatCount: 0, groupAiCount: 0, commandCount: 0 };
    }
  }

  isPrivateAiLimitEnabled(): boolean { return this.enforcePrivateAiLimit; }
  isGroupAiLimitEnabled(): boolean { return this.enforceGroupAiLimit; }
  isCommandLimitEnabled(): boolean { return this.enforceCommandLimit; }

  async setPrivateAiLimitEnabled(enabled: boolean): Promise<void> {
    this.enforcePrivateAiLimit = enabled;
    await this.saveToggle('privateAi', enabled);
  }
  async setGroupAiLimitEnabled(enabled: boolean): Promise<void> {
    this.enforceGroupAiLimit = enabled;
    await this.saveToggle('groupAi', enabled);
  }
  async setCommandLimitEnabled(enabled: boolean): Promise<void> {
    this.enforceCommandLimit = enabled;
    await this.saveToggle('command', enabled);
  }

  getToggleStatus(): { privateAi: boolean; groupAi: boolean; command: boolean } {
    return { privateAi: this.enforcePrivateAiLimit, groupAi: this.enforceGroupAiLimit, command: this.enforceCommandLimit };
  }

  private async saveToggle(type: ToggleKey, enabled: boolean): Promise<void> {
    try {
      const key = TOGGLE_CONFIG_KEYS[type];
      await prisma.botConfig.upsert({ where: { key }, create: { key, value: String(enabled) }, update: { value: String(enabled) } });
    } catch (error) {
      log.error(`[PremiumService] Failed to save toggle ${type}:`, error as object);
    }
  }


  private usageCacheKey(userId: string, date: string): string {
    return `usage:${userId}:${date}`;
  }
}

export const premiumService = new PremiumService();
export default premiumService;
