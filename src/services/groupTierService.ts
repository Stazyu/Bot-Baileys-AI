/**
 * ──────────────────────────────────────────────
 *  GROUP TIER SERVICE
 * ──────────────────────────────────────────────
 *
 * User premium/pro boleh mengaktifkan SATU grup agar grup itu memakai
 * tier yang sama dengan dirinya ("kembar"):
 *
 *   user premium  → grup premium  → kuota AI grup 500/hari (pool se-grup)
 *   user pro      → grup pro      → unlimited
 *
 * Perbedaan penting dari limit user biasa:
 *   - Counter-nya milik GRUP (pool bersama), bukan per member.
 *   - Tier-nya berlaku untuk SEMUA member grup, termasuk yang free.
 *   - Masa aktifnya mengikuti premiumExpiry owner. Kalau owner turun ke
 *     free / expired, grup otomatis turun ke free (dicek lazy saat dipakai,
 *     tanpa cron).
 *
 * Slot: 1 grup aktif per user. User pro/premium dengan 2 grup harus pilih.
 */

import NodeCache from 'node-cache';
import prisma from '../database/prisma.js';
import userService from './userService.js';
import { log } from '../utils/logger.js';

export interface GroupTierRecord {
  groupJid: string;
  ownerJid: string;
  tier: string;
  activatedAt: Date;
  expiresAt: Date | null;
}

export type GroupTierActivationError =
  | 'not_premium'
  | 'already_active'
  | 'slot_taken'
  | 'group_has_owner'
  | 'db_error';

export interface GroupTierActivationResult {
  ok: boolean;
  error?: GroupTierActivationError;
  record?: GroupTierRecord;
  /** Grup lain yang menempati slot user (kalau error = 'slot_taken'). */
  conflictingGroupJid?: string;
}

/** Tier yang boleh mengaktifkan grup. */
const ACTIVATABLE_TIERS = new Set(['premium', 'pro']);

/** Batas 1 grup aktif per user. */
export const MAX_GROUPS_PER_USER = 1;

/** premium < pro. Tier tak dikenal → free. */
export function rankTier(tier: string): number {
  return tier === 'pro' ? 2 : tier === 'premium' ? 1 : 0;
}

/** Ambil tier terendah dari dua kandidat (tier grup tidak boleh melampaui owner). */
export function minTier(a: string, b: string): string {
  return rankTier(a) <= rankTier(b) ? a : b;
}

/**
 * Keputusan tier efektif — murni (tanpa I/O) supaya bisa diuji terpisah.
 * "Kembar" berarti: tier grup = turunan dari tier owner, tidak pernah lebih tinggi.
 */
export function decideEffectiveTier(
  record: { tier: string; expiresAt: Date | null },
  owner: { tier: string; premiumExpiry: Date | null } | null,
  now: number = Date.now(),
): string {
  if (record.expiresAt && record.expiresAt.getTime() <= now) return 'free';
  if (!owner) return 'free';
  if (owner.premiumExpiry && owner.premiumExpiry.getTime() <= now) return 'free';
  if (!ACTIVATABLE_TIERS.has(record.tier)) return 'free';
  const ownerTier = ACTIVATABLE_TIERS.has(owner.tier) ? owner.tier : 'free';
  return minTier(record.tier, ownerTier);
}

class GroupTierService {
  private cache: NodeCache;
  private readonly CACHE_TTL_SEC = 300;

  constructor() {
    this.cache = new NodeCache({ stdTTL: this.CACHE_TTL_SEC, checkperiod: 120 });
  }

  /**
   * Tier EFEKTIF sebuah grup. `null` = grup tidak punya tier (perilaku free
   * per-user seperti sebelumnya).
   *
   * Fail-safe: error DB → return null (grup diperlakukan free), TIDAK pernah
   * mengembalikan tier tinggi saat data tidak pasti.
   */
  async getGroupTier(groupJid: string): Promise<string | null> {
    const record = await this.getGroupTierRecord(groupJid);
    return record?.tier ?? null;
  }

  async getGroupTierRecord(groupJid: string): Promise<GroupTierRecord | null> {
    const cacheKey = `gtier:${groupJid}`;
    const cached = this.cache.get<GroupTierRecord | null>(cacheKey);
    if (cached !== undefined) return cached;

    let record: GroupTierRecord | null = null;
    try {
      const row = await prisma.groupTier.findUnique({ where: { groupJid } });
      if (!row) {
        this.cache.set(cacheKey, null);
        return null;
      }
      record = this.toRecord(row);
    } catch (error) {
      log.debug(`[GroupTierService] Non-critical: lookup failed for ${groupJid}: ${(error as Error).message}`);
      return null;
    }

    // Lazy expiry / downgrade — cermin dari tier + expiry owner.
    const effective = await this.resolveEffectiveTier(record);
    if (effective !== record.tier) {
      log.info(`[GroupTierService] 🔻 Grup ${groupJid.split('@')[0]} turun ${record.tier} → ${effective} (owner ${record.ownerJid.split('@')[0]} tidak lagi memenuhi syarat)`);
      await this.persistTier(record.groupJid, effective);
      record = { ...record, tier: effective };
    }

    this.cache.set(cacheKey, record);
    return record;
  }

  /**
   * Tier yang benar-benar berlaku sekarang: min(tier grup, tier owner sekarang)
   * dan harus masih dalam masa aktif. Owner hilang dari DB → free.
   */
  private async resolveEffectiveTier(record: GroupTierRecord): Promise<string> {
    const owner = await userService.getUser(record.ownerJid);
    return decideEffectiveTier(record, owner);
  }

  /**
   * Aktifkan grup untuk user premium/pro.
   * Semua aturan bisnis ada di sini supaya command & owner path konsisten.
   */
  async activateGroup(groupJid: string, ownerJid: string): Promise<GroupTierActivationResult> {
    try {
      const owner = await userService.getUser(ownerJid);
      const ownerTier = owner?.tier ?? 'free';
      const ownerExpired = Boolean(owner?.premiumExpiry && owner.premiumExpiry.getTime() <= Date.now());
      if (!ACTIVATABLE_TIERS.has(ownerTier) || ownerExpired) {
        return { ok: false, error: 'not_premium' };
      }

      // Sudah punya tier sendiri (bukan sisa downgrade)?
      const existing = await this.getGroupTierRecord(groupJid);
      if (existing && ACTIVATABLE_TIERS.has(existing.tier)) {
        return { ok: false, error: 'already_active', record: existing };
      }

      // Grup ini masih dipegang user lain yang aktif?
      if (existing && existing.ownerJid !== ownerJid && ACTIVATABLE_TIERS.has(existing.tier)) {
        return { ok: false, error: 'group_has_owner', record: existing };
      }

      // Slot: 1 grup AKTIF per user. Baris sisa (sudah turun ke free karena
      // owner downgrade/expired) dibersihkan di sini — bukan dihitung sebagai
      // pemakai slot, supaya user tidak terkunci selamanya.
      const mine = await prisma.groupTier.findMany({ where: { ownerJid } });
      const activeOthers: string[] = [];
      for (const row of mine) {
        if (row.groupJid === groupJid) continue;
        const stillActive = ACTIVATABLE_TIERS.has(await this.resolveEffectiveTier(this.toRecord(row)));
        if (stillActive) {
          activeOthers.push(row.groupJid);
          continue;
        }
        await prisma.groupTier.deleteMany({ where: { groupJid: row.groupJid } });
        this.invalidate(row.groupJid);
        log.info(`[GroupTierService] 🧹 Slot stale dibersihkan: ${row.groupJid.split('@')[0]} (owner ${ownerJid.split('@')[0]})`);
      }
      if (activeOthers.length >= MAX_GROUPS_PER_USER) {
        return { ok: false, error: 'slot_taken', conflictingGroupJid: activeOthers[0] };
      }

      const expiresAt = owner?.premiumExpiry ?? null;
      const saved = await prisma.groupTier.upsert({
        where: { groupJid },
        create: { groupJid, ownerJid, tier: ownerTier, expiresAt },
        update: { ownerJid, tier: ownerTier, expiresAt },
      });

      this.invalidate(groupJid);
      log.info(`[GroupTierService] ✅ Grup ${groupJid.split('@')[0]} → ${ownerTier} (owner ${ownerJid.split('@')[0]})`);
      return { ok: true, record: this.toRecord(saved) };
    } catch (error) {
      log.error('[GroupTierService] Failed to activate group tier:', error as object);
      return { ok: false, error: 'db_error' };
    }
  }

  /** Cabut tier grup (oleh owner grup atau owner bot). */
  async revokeGroup(groupJid: string): Promise<boolean> {
    try {
      await prisma.groupTier.deleteMany({ where: { groupJid } });
      this.invalidate(groupJid);
      log.info(`[GroupTierService] 🗑️ Tier grup ${groupJid.split('@')[0]} dicabut`);
      return true;
    } catch (error) {
      log.error('[GroupTierService] Failed to revoke group tier:', error as object);
      return false;
    }
  }

  /** Ganti tier grup secara paksa (owner bot). */
  async setGroupTier(groupJid: string, tier: string, ownerJid?: string): Promise<GroupTierActivationResult> {
    const normalised = ['free', 'premium', 'pro'].includes(tier) ? tier : null;
    if (!normalised) return { ok: false, error: 'not_premium' };
    if (normalised === 'free') {
      await this.revokeGroup(groupJid);
      return { ok: true };
    }
    try {
      const existing = await prisma.groupTier.findUnique({ where: { groupJid } });
      const resolvedOwner = ownerJid ?? existing?.ownerJid;
      if (!resolvedOwner) return { ok: false, error: 'db_error' };
      const owner = await userService.getUser(resolvedOwner);
      const saved = await prisma.groupTier.upsert({
        where: { groupJid },
        create: { groupJid, ownerJid: resolvedOwner, tier: normalised, expiresAt: owner?.premiumExpiry ?? null },
        update: { tier: normalised, expiresAt: owner?.premiumExpiry ?? null },
      });
      this.invalidate(groupJid);
      return { ok: true, record: this.toRecord(saved) };
    } catch (error) {
      log.error('[GroupTierService] Failed to set group tier:', error as object);
      return { ok: false, error: 'db_error' };
    }
  }

  /** Semua grup ber-tier aktif — dipakai dashboard/owner list. */
  async listGroupTiers(limit = 200): Promise<GroupTierRecord[]> {
    try {
      const rows = await prisma.groupTier.findMany({
        where: { tier: { in: [...ACTIVATABLE_TIERS] } },
        orderBy: { activatedAt: 'desc' },
        take: limit,
      });
      return rows.map((row) => this.toRecord(row));
    } catch (error) {
      log.error('[GroupTierService] Failed to list group tiers:', error as object);
      return [];
    }
  }

  /** Grup aktif milik seorang user (untuk validasi slot di UI). */
  async getGroupsOwnedBy(ownerJid: string): Promise<GroupTierRecord[]> {
    try {
      const rows = await prisma.groupTier.findMany({ where: { ownerJid } });
      return rows
        .map((row) => this.toRecord(row))
        .filter((row) => ACTIVATABLE_TIERS.has(row.tier));
    } catch (error) {
      log.debug(`[GroupTierService] Non-critical: owned lookup failed: ${(error as Error).message}`);
      return [];
    }
  }

  async getStats(): Promise<{ total: number; premium: number; pro: number }> {
    try {
      const [total, premium, pro] = await Promise.all([
        prisma.groupTier.count(),
        prisma.groupTier.count({ where: { tier: 'premium' } }),
        prisma.groupTier.count({ where: { tier: 'pro' } }),
      ]);
      return { total, premium, pro };
    } catch (error) {
      log.error('[GroupTierService] Failed to get stats:', error as object);
      return { total: 0, premium: 0, pro: 0 };
    }
  }

  invalidate(groupJid: string): void {
    this.cache.del(`gtier:${groupJid}`);
  }

  /** Dipakai test — bersihkan cache tanpa akses privat. */
  clearCache(): void {
    this.cache.flushAll();
  }

  private async persistTier(groupJid: string, tier: string): Promise<void> {
    try {
      await prisma.groupTier.update({ where: { groupJid }, data: { tier } });
      this.invalidate(groupJid);
    } catch (error) {
      log.debug(`[GroupTierService] Non-critical: tier persist failed: ${(error as Error).message}`);
    }
  }

  private toRecord(row: {
    groupJid: string;
    ownerJid: string;
    tier: string;
    activatedAt: Date;
    expiresAt: Date | null;
  }): GroupTierRecord {
    return {
      groupJid: row.groupJid,
      ownerJid: row.ownerJid,
      tier: row.tier ?? 'free',
      activatedAt: row.activatedAt,
      expiresAt: row.expiresAt ?? null,
    };
  }
}

export const groupTierService = new GroupTierService();
export default groupTierService;
