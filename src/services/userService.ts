import NodeCache from 'node-cache';
import prisma from '../database/prisma.js';
import { log } from '../utils/logger.js';

export interface UserRecord {
  userId: string;
  pushName: string | null;
  sessionId: string | null;
  tier: string;
  premiumExpiry: Date | null;
  memoryTtlDays: number | null;
  status: string;
  isBlocked: boolean;
  firstSeen: Date;
  lastSeen: Date;
  messageCount: number;
}

export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  free: number;
  premium: number;
  pro: number;
}

class UserService {
  private cache: NodeCache;
  private readonly CACHE_TTL_SEC = 600;
  private readonly INACTIVE_DAYS = 7;

  constructor() {
    this.cache = new NodeCache({ stdTTL: this.CACHE_TTL_SEC, checkperiod: 120 });
    log.info('👤 [UserService] Initialized with cache TTL: 10 min');
  }

  async ensureUser(userId: string, pushName?: string, sessionId?: string): Promise<void> {
    try {
      const now = new Date();
      await prisma.user.upsert({
        where: { userId },
        create: {
          userId,
          pushName: pushName ?? null,
          sessionId: sessionId ?? null,
          status: 'active',
          firstSeen: now,
          lastSeen: now,
          messageCount: 1,
        },
        update: {
          pushName: pushName ?? undefined,
          sessionId: sessionId ?? undefined,
          status: 'active',
          lastSeen: now,
          messageCount: { increment: 1 },
        },
      });
      const cached = this.cache.get<Partial<UserRecord>>(this.cacheKey(userId));
      if (cached) {
        cached.lastSeen = now;
        if (pushName) cached.pushName = pushName;
        this.cache.set(this.cacheKey(userId), cached);
      }
    } catch (error) {
      log.debug(`[UserService] Non-critical: ensureUser failed for ${userId}: ${(error as Error).message}`);
    }
  }

  async getUser(userId: string): Promise<UserRecord | null> {
    const cacheKey = this.cacheKey(userId);
    const cached = this.cache.get<UserRecord>(cacheKey);
    if (cached) return cached;
    try {
      const user = await prisma.user.findUnique({ where: { userId } });
      if (user) {
        const record = this.toRecord(user);
        this.cache.set(cacheKey, record);
        return record;
      }
      return null;
    } catch (error) {
      log.error(`[UserService] Failed to get user ${userId}:`, error as object);
      return null;
    }
  }

  async getUsers(filter?: { status?: 'active' | 'inactive'; limit?: number; offset?: number }): Promise<UserRecord[]> {
    try {
      const sevenDaysAgo = new Date(Date.now() - this.INACTIVE_DAYS * 24 * 60 * 60 * 1000);
      const take = filter?.limit ?? 50;
      const skip = filter?.offset ?? 0;
      let where: Record<string, unknown> = {};
      if (filter?.status === 'active') {
        where = { lastSeen: { gte: sevenDaysAgo } };
      } else if (filter?.status === 'inactive') {
        where = { lastSeen: { lt: sevenDaysAgo } };
      }
      const users = await prisma.user.findMany({ where, orderBy: { lastSeen: 'desc' }, take, skip });
      return users.map(u => this.toRecord(u));
    } catch (error) {
      log.error('[UserService] Failed to get users:', error as object);
      return [];
    }
  }

  async setMemoryTtl(userId: string, days: number | null): Promise<void> {
    try {
      await prisma.user.update({ where: { userId }, data: { memoryTtlDays: days } });
      this.cache.del(this.cacheKey(userId));
      log.info(`[UserService] User ${userId} memory TTL set to ${days === null ? 'default-tier' : `${days}d`}`);
    } catch (error) {
      log.error(`[UserService] Failed to set memory TTL for ${userId}:`, error as object);
    }
  }

  async setTier(userId: string, tier: string, expiry?: Date): Promise<void> {
    try {
      await prisma.user.update({ where: { userId }, data: { tier, premiumExpiry: expiry ?? null } });
      this.cache.del(this.cacheKey(userId));
      log.info(`[UserService] User ${userId} tier set to ${tier}`);
    } catch (error) {
      log.error(`[UserService] Failed to set tier for ${userId}:`, error as object);
    }
  }

  async getStats(): Promise<UserStats> {
    try {
      const sevenDaysAgo = new Date(Date.now() - this.INACTIVE_DAYS * 24 * 60 * 60 * 1000);
      const [total, active, free, premium, pro] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { lastSeen: { gte: sevenDaysAgo } } }),
        prisma.user.count({ where: { tier: 'free' } }),
        prisma.user.count({ where: { tier: 'premium' } }),
        prisma.user.count({ where: { tier: 'pro' } }),
      ]);
      return { total, active, inactive: total - active, free, premium, pro };
    } catch (error) {
      log.error('[UserService] Failed to get stats:', error as object);
      return { total: 0, active: 0, inactive: 0, free: 0, premium: 0, pro: 0 };
    }
  }

  invalidateCache(userId: string): void {
    this.cache.del(this.cacheKey(userId));
  }

  private cacheKey(userId: string): string {
    return `user:${userId}`;
  }

  private toRecord(user: Record<string, any>): UserRecord {
    return {
      userId: user.userId,
      pushName: user.pushName ?? null,
      sessionId: user.sessionId ?? null,
      tier: user.tier ?? 'free',
      premiumExpiry: user.premiumExpiry ?? null,
      memoryTtlDays: user.memoryTtlDays ?? null,
      status: user.status ?? 'active',
      isBlocked: user.isBlocked ?? false,
      firstSeen: user.firstSeen,
      lastSeen: user.lastSeen,
      messageCount: user.messageCount ?? 0,
    };
  }
}

export const userService = new UserService();
export default userService;
