import NodeCache from 'node-cache';
import type { Prisma } from '@prisma/client';
import prisma from '../database/prisma.js';
import { log } from '../utils/logger.js';
import { resolveEffectiveTier, normaliseTier, type TierName } from './premiumExpiry.js';

export interface UserRecord {
  userId: string;
  pushName: string | null;
  sessionId: string | null;
  tier: string;
  premiumExpiry: Date | null;
  memoryTtlDays: number | null;
  status: string;
  isBlocked: boolean;
  aiModeEnabled: boolean;
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
    if (cached) return this.downgradeIfExpired(cached);
    try {
      const user = await prisma.user.findUnique({ where: { userId } });
      if (user) {
        const record = await this.downgradeIfExpired(this.toRecord(user));
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
      // Lazy downgrade juga di jalur list — supaya `!premium list` / dashboard
      // tidak menampilkan user yang masa aktifnya sudah lewat. Hasil map HARUS
      // dipakai (bukan array records asli) karena downgrade mengembalikan
      // record baru. Tidak di-cache karena getUsers selalu query DB.
      return await Promise.all(users.map(async (u) => this.downgradeIfExpired(this.toRecord(u))));
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

  /**
   * Set tier user beserta masa aktifnya.
   *
   * `expiry === undefined` berarti "jangan sentuh premiumExpiry" supaya caller
   * lama (yang tidak tahu soal expiry) tidak menghapus expiry yang sudah ada.
   * Kirim `null` eksplisit untuk menghapus masa aktif.
   */
  async setTier(userId: string, tier: string, expiry?: Date | null): Promise<void> {
    try {
      const normalised = normaliseTier(tier);
      const data: Prisma.UserUpdateInput = { tier: normalised };
      if (expiry !== undefined) data.premiumExpiry = expiry;
      await prisma.user.update({ where: { userId }, data });
      this.cache.del(this.cacheKey(userId));
      log.info(`[UserService] User ${userId} tier set to ${normalised}${expiry === undefined ? '' : ` (expiry: ${expiry ? expiry.toISOString() : 'none'})`}`);
    } catch (error) {
      log.error(`[UserService] Failed to set tier for ${userId}:`, error as object);
    }
  }

  /** Set hanya masa aktif, tanpa mengubah tier. null = hapus masa aktif. */
  async setPremiumExpiry(userId: string, expiry: Date | null): Promise<void> {
    try {
      await prisma.user.update({ where: { userId }, data: { premiumExpiry: expiry } });
      this.cache.del(this.cacheKey(userId));
      log.info(`[UserService] User ${userId} premium expiry → ${expiry ? expiry.toISOString() : 'none'}`);
    } catch (error) {
      log.error(`[UserService] Failed to set premium expiry for ${userId}:`, error as object);
    }
  }

  /**
   * Turunkan tier ke free kalau masa aktif sudah lewat — lazy, tanpa cron.
   *
   * Dipanggil setiap kali user dibaca (getUser / getUsers). Field `tier` di DB
   * ikut ditulis supaya query agregat (stats, filter dashboard) tetap akurat.
   * Idempoten: user free / masih aktif dilewatkan tanpa I/O.
   */
  private async downgradeIfExpired(record: UserRecord): Promise<UserRecord> {
    const stored = normaliseTier(record.tier);
    if (stored === 'free' || !record.premiumExpiry) return record;

    const effective: TierName = resolveEffectiveTier(record);
    if (effective === stored) return record;

    const demoted: UserRecord = { ...record, tier: effective };
    this.cache.set(this.cacheKey(record.userId), demoted);
    log.info(`[UserService] 🔻 ${record.userId.split('@')[0]} turun ${stored} → ${effective} (premium habis ${record.premiumExpiry.toISOString()})`);
    try {
      // Jangan hapus premiumExpiry — biar riwayat "habis kapan" tetap terbaca
      // dan tidak perlu tulis DB lagi di request berikutnya (guard di atas
      // sudah menangkap tier yang sudah free).
      await prisma.user.update({ where: { userId: record.userId }, data: { tier: effective } });
    } catch (error) {
      log.debug(`[UserService] Non-critical: downgrade persist failed for ${record.userId}: ${(error as Error).message}`);
    }
    return demoted;
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

  /**
   * Update parsial (dipakai API dashboard). Hanya field yang ada di `patch`
   * yang ditulis. `tier` dan `premiumExpiry` divalidasi/dinormalisasi di sini.
   *
   * Aturan: tier `free` selalu menghapus `premiumExpiry` — supaya tidak ada
   * baris "free tapi punya masa aktif" yang bikin dashboard bingung.
   */
  async updateUser(
    userId: string,
    patch: {
      tier?: string;
      premiumExpiry?: Date | null;
      isBlocked?: boolean;
      aiModeEnabled?: boolean;
      status?: string;
    },
  ): Promise<UserRecord | null> {
    const data: Prisma.UserUpdateInput = {};
    if (patch.tier !== undefined) {
      const tier = normaliseTier(patch.tier);
      data.tier = tier;
      if (tier === 'free') data.premiumExpiry = null;
    }
    if (patch.premiumExpiry !== undefined && data.premiumExpiry === undefined) {
      data.premiumExpiry = patch.premiumExpiry;
    }
    if (patch.isBlocked !== undefined) data.isBlocked = patch.isBlocked;
    if (patch.aiModeEnabled !== undefined) data.aiModeEnabled = patch.aiModeEnabled;
    if (patch.status !== undefined) data.status = patch.status;
    if (Object.keys(data).length === 0) return this.getUser(userId);
    try {
      const updated = await prisma.user.update({ where: { userId }, data });
      this.cache.del(this.cacheKey(userId));
      return this.toRecord(updated);
    } catch (error) {
      log.debug(`[UserService] Non-critical: updateUser failed for ${userId}: ${(error as Error).message}`);
      return null;
    }
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
      aiModeEnabled: user.aiModeEnabled ?? false,
      firstSeen: user.firstSeen,
      lastSeen: user.lastSeen,
      messageCount: user.messageCount ?? 0,
    };
  }
}

export const userService = new UserService();
export default userService;
