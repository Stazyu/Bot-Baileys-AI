import NodeCache from 'node-cache';
import type { Prisma } from '@prisma/client';
import prisma from '../database/prisma.js';
import { premiumService } from './premiumService.js';
import userService from './userService.js';
import { log } from '../utils/logger.js';

// ────────────────────────────────────────────────────────────────
//  Persistent AI memory (L2) — MongoDB via Prisma `AiMemory`.
//  L1 tetap NodeCache di AIService; service ini hanya dipakai untuk
//  tier bayar (premium/pro). Free = tidak pernah read/write.
//  Semua kegagalan DB non-fatal: degradasi anggun ke L1 saja.
// ────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

export type StoredRole = 'system' | 'user' | 'assistant' | 'tool';

export interface StoredMessage {
  role: StoredRole;
  content: string | null;
}

/** Bentuk longgar pesan L1 (ChatMessage AIService) yang diterima save(). */
export interface StorableMessage {
  role: string;
  content: unknown;
}

export interface MemoryKeyParts {
  /** JID user pemilik memory (sender). */
  userId: string;
  /** "private" | "group:<groupJid>". */
  scope: string;
  /** true untuk grup (TTL grup yang dipakai di L1). */
  isGroup: boolean;
}

export interface MemoryInfo {
  tier: string;
  ttlDays: number;
  persistent: boolean;
  expiresAt: Date | null;
  /** Jumlah turn (pasangan user+assistant, pembulatan ke atas). */
  turns: number;
}

const ALLOWED_ROLES: ReadonlySet<string> = new Set(['system', 'user', 'assistant', 'tool']);

/** Key L1+scope terpusat: 'mem:private:<userJid>' | 'mem:group:<groupJid>:<senderJid>'. */
export function buildPrivateKey(userJid: string): string {
  return `mem:private:${userJid}`;
}

export function buildGroupKey(groupJid: string, senderJid: string): string {
  return `mem:group:${groupJid}:${senderJid}`;
}

/**
 * Pecah key memory menjadi userId + scope DB.
 * Key lama (JID mentah, tanpa prefix 'mem:') dianggap private milik JID itu —
 * transisi satu arah: history lamaExpire alami, tidak dimigrasi.
 */
export function parseMemoryKey(key: string): MemoryKeyParts {
  if (key.startsWith('mem:group:')) {
    const rest = key.slice('mem:group:'.length);
    const sep = rest.indexOf(':');
    if (sep > 0) {
      const groupJid = rest.slice(0, sep);
      const senderJid = rest.slice(sep + 1);
      if (groupJid && senderJid) {
        return { userId: senderJid, scope: `group:${groupJid}`, isGroup: true };
      }
    }
  }
  if (key.startsWith('mem:private:')) {
    const userId = key.slice('mem:private:'.length);
    if (userId) return { userId, scope: 'private', isGroup: false };
  }
  return { userId: key, scope: 'private', isGroup: false };
}

/**
 * Potong history ke maxTurns terakhir (1 turn = 1 pasang user+assistant).
 * System prompt di index 0 selalu dipertahankan (akan di-refresh saat load).
 *
 * @internal Diekspor untuk unit test.
 */
export function trimToMaxTurns(messages: StorableMessage[], maxTurns: number): StorableMessage[] {
  const maxMessages = Math.max(2, maxTurns * 2);
  const system = messages.find((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  const kept = rest.slice(-maxMessages);
  return system ? [system, ...kept] : kept;
}

/**
 * Sanitasi sebelum simpan ke Mongo:
 * - Buang SEMUA part `file` (binary image tidak boleh masuk dokumen Json —
 *   Prisma akan menyerialkannya jadi objek raksasa yang rusak saat load).
 * - Gambar terakhir di L1 tetap hidup untuk turn berjalan; L2 menyimpan
 *   teksnya saja (atau penanda [media] bila tanpa teks).
 * - Selalu kembalikan objek BARU — jangan mutasi array L1.
 *
 * @internal Diekspor untuk unit test.
 */
export function sanitizeForStorage(messages: StorableMessage[]): StoredMessage[] {
  const out: StoredMessage[] = [];
  for (const m of messages) {
    if (!ALLOWED_ROLES.has(m.role)) continue;
    const role = m.role as StoredRole;
    if (typeof m.content === 'string' || m.content === null || m.content === undefined) {
      out.push({ role, content: m.content ?? null });
      continue;
    }
    if (Array.isArray(m.content)) {
      const texts: string[] = [];
      for (const part of m.content as Array<{ type?: unknown; text?: unknown }>) {
        if (part && part.type === 'text' && typeof part.text === 'string' && part.text) {
          texts.push(part.text);
        }
      }
      const joined = texts.join('\n');
      out.push({ role, content: joined || '[media]' });
      continue;
    }
    // Bentuk tak dikenal — jangan simpan biner mentah.
    out.push({ role, content: '[media]' });
  }
  return out;
}

/**
 * Validasi dokumen Mongo → StoredMessage[] (data korup = dibuang per pesan).
 *
 * @internal Diekspor untuk unit test.
 */
export function validateStored(raw: unknown): StoredMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredMessage[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    if (!item || typeof item !== 'object') continue;
    const role = item.role;
    if (typeof role !== 'string' || !ALLOWED_ROLES.has(role)) continue;
    const content = item.content;
    if (content !== null && typeof content !== 'string') continue;
    out.push({ role: role as StoredRole, content });
  }
  return out;
}

class MemoryService {
  private ttlCache: NodeCache;
  private readonly TTL_CACHE_SEC = 60;

  constructor() {
    this.ttlCache = new NodeCache({ stdTTL: this.TTL_CACHE_SEC, checkperiod: 30 });
  }

  /**
   * Durasi efektif (hari) untuk user: override per user menang atas tier.
   * <= 0 = tidak persisten (free / dimatikan).
   */
  async resolveTtlDays(userId: string): Promise<number> {
    const cacheKey = `ttl:${userId}`;
    const cached = this.ttlCache.get<number>(cacheKey);
    if (cached !== undefined) return cached;
    try {
      const user = await userService.getUser(userId);
      let days: number;
      if (user?.memoryTtlDays !== null && user?.memoryTtlDays !== undefined) {
        days = user.memoryTtlDays;
      } else {
        days = premiumService.getMemoryTtlDays(user?.tier ?? 'free');
      }
      if (!Number.isFinite(days) || days < 0) days = 0;
      this.ttlCache.set(cacheKey, Math.floor(days));
      return Math.floor(days);
    } catch (error) {
      log.debug(`[MemoryService] Non-critical: TTL resolve failed for ${userId}: ${(error as Error).message}`);
      return 0;
    }
  }

  invalidateTtlCache(userId: string): void {
    this.ttlCache.del(`ttl:${userId}`);
  }

  /** Load history persisten → null bila tidak ada / expired / free. */
  async load(userId: string, scope: string): Promise<StoredMessage[] | null> {
    try {
      const row = await prisma.aiMemory.findUnique({
        where: { userId_scope: { userId, scope } },
      });
      if (!row) return null;
      if (row.expiresAt <= new Date()) {
        // Expired: hapus diam-diam (retention loop juga menyapu berkala).
        void prisma.aiMemory.delete({ where: { userId_scope: { userId, scope } } }).catch(() => {});
        return null;
      }
      const messages = validateStored(row.messages);
      return messages.length > 0 ? messages : null;
    } catch (error) {
      log.debug(`[MemoryService] Non-critical: load failed for ${userId}/${scope}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Simpan history (sliding expiry: tiap save me-refresh expiresAt).
   * No-op untuk free/TTL 0. Fire-and-forget oleh caller.
   */
  async save(userId: string, scope: string, messages: StorableMessage[]): Promise<void> {
    try {
      const ttlDays = await this.resolveTtlDays(userId);
      if (ttlDays <= 0) return;
      if (!messages || messages.length === 0) return;
      const maxTurns = premiumService.getMemoryMaxTurns();
      const stored = sanitizeForStorage(trimToMaxTurns(messages, maxTurns));
      if (stored.length === 0) return;
      const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);
      const jsonMessages = stored as unknown as Prisma.InputJsonValue;
      await prisma.aiMemory.upsert({
        where: { userId_scope: { userId, scope } },
        create: { userId, scope, messages: jsonMessages, expiresAt },
        update: { messages: jsonMessages, expiresAt },
      });
    } catch (error) {
      log.debug(`[MemoryService] Non-critical: save failed for ${userId}/${scope}: ${(error as Error).message}`);
    }
  }

  /** Daftar semua scope memory milik user (untuk `!premium memory check`). */
  async listUserScopes(userId: string): Promise<Array<{ scope: string; expiresAt: Date; turns: number }>> {
    try {
      const rows = await prisma.aiMemory.findMany({ where: { userId } });
      const now = new Date();
      return rows
        .filter((r) => r.expiresAt > now)
        .map((r) => ({
          scope: r.scope,
          expiresAt: r.expiresAt,
          turns: Math.ceil(validateStored(r.messages).filter((m) => m.role !== 'system').length / 2),
        }));
    } catch (error) {
      log.debug(`[MemoryService] Non-critical: list failed for ${userId}: ${(error as Error).message}`);
      return [];
    }
  }

  /** Hapus memory user (scope tertentu atau semua scope miliknya). */
  async clear(userId: string, scope?: string): Promise<number> {
    try {
      const result = scope
        ? await prisma.aiMemory.deleteMany({ where: { userId, scope } })
        : await prisma.aiMemory.deleteMany({ where: { userId } });
      return result.count;
    } catch (error) {
      log.debug(`[MemoryService] Non-critical: clear failed for ${userId}: ${(error as Error).message}`);
      return 0;
    }
  }

  /** Info untuk `!memory status` / `!premium memory check`. */
  async getInfo(userId: string, scope: string): Promise<MemoryInfo> {
    const user = await userService.getUser(userId).catch(() => null);
    const tier = user?.tier ?? 'free';
    const ttlDays = await this.resolveTtlDays(userId);
    try {
      const row = await prisma.aiMemory.findUnique({
        where: { userId_scope: { userId, scope } },
      });
      if (!row || row.expiresAt <= new Date()) {
        return { tier, ttlDays, persistent: ttlDays > 0, expiresAt: null, turns: 0 };
      }
      const nonSystem = validateStored(row.messages).filter((m) => m.role !== 'system');
      return {
        tier,
        ttlDays,
        persistent: ttlDays > 0,
        expiresAt: row.expiresAt,
        turns: Math.ceil(nonSystem.length / 2),
      };
    } catch (error) {
      log.debug(`[MemoryService] Non-critical: getInfo failed for ${userId}: ${(error as Error).message}`);
      return { tier, ttlDays, persistent: ttlDays > 0, expiresAt: null, turns: 0 };
    }
  }

  /** Sapu row expired. Dipanggil per jam oleh retention loop. */
  async pruneExpired(): Promise<number> {
    try {
      const result = await prisma.aiMemory.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (result.count > 0) {
        log.info(`🧹 [MemoryService] Pruned ${result.count} expired AiMemory rows`);
      }
      return result.count;
    } catch (error) {
      log.debug(`[MemoryService] Non-critical: prune failed: ${(error as Error).message}`);
      return 0;
    }
  }
}

export const memoryService = new MemoryService();
export default memoryService;

/** Retention scheduler — unref'd timer, tidak menahan event loop. */
export function startMemoryRetentionLoop(): void {
  const run = (): void => {
    void memoryService.pruneExpired();
  };
  run();
  const timer = setInterval(run, 60 * 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
}
