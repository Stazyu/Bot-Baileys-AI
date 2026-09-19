import type { Prisma } from '@prisma/client';
import type { AnyMessageContent, proto, WAMessageKey } from '@stazyu/baileys';
import prisma from '../database/prisma.js';
import sessionManager from '../session/sessionManager.js';
import { log } from '../utils/logger.js';

/** Cache LID → nomor real (positif maupun negatif). */
const lidCache = new Map<string, string | null>();

/** Tanya Baileys signal store (sumber otoritatif, cepat bila sudah sync). */
async function pnFromStore(sessionId: string, lid: string): Promise<string | null> {
  try {
    const socket = await sessionManager.getSession(sessionId);
    const store = socket?.signalRepository?.lidMapping;
    if (!store || typeof store.getPNForLID !== 'function') return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const pn = await Promise.race([
        store.getPNForLID(lid),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), 3000);
        }),
      ]);
      return typeof pn === 'string' && pn.length > 0 ? pn : null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** Fallback: petakan via alt pada pesan masuk yang tersimpan. */
async function pnFromDb(lid: string): Promise<string | null> {
  try {
    const rows = await prisma.message.findMany({
      where: { fromMe: false },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { key: true },
    });
    for (const row of rows) {
      const k = storedKey(row.key);
      if (!k) continue;
      if (k.remoteJid === lid && typeof k.remoteJidAlt === 'string' && k.remoteJidAlt.length > 0) {
        return k.remoteJidAlt;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * LID → real number so threads don't split. Order: cache → Baileys → DB.
 * Always resolves to a string (falls back to the original JID) — never throws.
 */
export async function resolvePn(sessionId: string, jid: string): Promise<string> {
  // The device suffix (:8@s.whatsapp.net) already contains the number — strip it to a plain PN.
  // This is the form botHandler (user_id) and chat grouping use.
  const plain = jid.replace(/:\d+@s\.whatsapp\.net$/, '@s.whatsapp.net');
  if (!plain.endsWith('@lid')) return plain;
  const cached = lidCache.get(plain);
  if (cached !== undefined) return cached ?? plain;
  const pn = (await pnFromStore(sessionId, plain)) ?? (await pnFromDb(plain));
  lidCache.set(plain, pn);
  return pn ?? plain;
}

/** Session yang sudah dipastikan ada barisnya (hindari upsert per pesan). */
const knownSessions = new Set<string>();
const MAX_BLOB_CHARS = 100_000;

/** Values ever written to the Message table's Json columns. */
type StoredBlob = proto.IMessage | WAMessageKey | AnyMessageContent;

/** Serialisasi aman untuk kolom Json — potong blob raksasa, jangan pernah throw. */
export function toJson(value: StoredBlob): Prisma.InputJsonValue {
  try {
    const text = JSON.stringify(value ?? {}, (_, v: unknown) => {
      if (typeof v === 'bigint') return String(v);
      if (v instanceof Uint8Array) return { __bytes: v.length };
      return v;
    });
    if (text.length > MAX_BLOB_CHARS) return { truncated: true, chars: text.length };
    return JSON.parse(text) as Prisma.InputJsonValue;
  } catch {
    return {};
  }
}

/** Normalisasi timestamp Baileys (detik) ke BigInt. */
function toTimestampSeconds(value: proto.IWebMessageInfo['messageTimestamp']): bigint {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return BigInt(Math.floor(num));
  return BigInt(Math.floor(Date.now() / 1000));
}

async function ensureSession(sessionId: string): Promise<void> {
  if (knownSessions.has(sessionId)) return;
  try {
    await prisma.session.upsert({ where: { sessionId }, update: {}, create: { sessionId } });
    knownSessions.add(sessionId);
  } catch (error) {
    log.debug(`[MessageService] Non-critical: session ensure failed: ${(error as Error).message}`);
  }
}

/** Normalisasi payload kirim ({ text }) ke bentuk blob chat agar extractText bisa baca. */
function normalizeOutbound(content: AnyMessageContent): proto.IMessage | AnyMessageContent {
  if ('text' in content && typeof content.text === 'string') {
    return { conversation: content.text };
  }
  return content;
}

/**
 * The `message` column stores a `proto.IMessage` written by `toJson` — this is the
 * only place that knows the column's shape, so the cast is centralized here.
 */
export function storedMessage(value: Prisma.JsonValue): proto.IMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as unknown as proto.IMessage;
}

/** The `key` column stores a `WAMessageKey` written by `toJson`. */
export function storedKey(value: Prisma.JsonValue): WAMessageKey | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as unknown as WAMessageKey;
}

export async function persistInboundMessage(opts: {
  sessionId: string;
  key: WAMessageKey;
  message: proto.IMessage;
  messageTimestamp: proto.IWebMessageInfo['messageTimestamp'];
  pushName?: string;
}): Promise<void> {
  try {
    await ensureSession(opts.sessionId);
    await prisma.message.create({
      data: {
        sessionId: opts.sessionId,
        key: toJson(opts.key),
        message: toJson(opts.message),
        messageTimestamp: toTimestampSeconds(opts.messageTimestamp),
        fromMe: false,
        pushName: opts.pushName ?? null,
      },
    });
  } catch (error) {
    log.debug(`[MessageService] Non-critical: inbound persist failed: ${(error as Error).message}`);
  }
}

/** Simpan pesan KELUAR (balasan bot). key diisi remoteJid agar grouping chat jalan. */
export async function persistOutboundMessage(opts: {
  sessionId: string;
  to: string;
  content: AnyMessageContent;
}): Promise<void> {
  try {
    await ensureSession(opts.sessionId);
    // Normalize LID → PN to avoid orphan threads (see groupOf).
    const to = await resolvePn(opts.sessionId, opts.to);
    await prisma.message.create({
      data: {
        sessionId: opts.sessionId,
        key: { remoteJid: to, fromMe: true },
        message: toJson(normalizeOutbound(opts.content)),
        messageTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        fromMe: true,
        pushName: 'Bot',
      },
    });
  } catch (error) {
    log.debug(`[MessageService] Non-critical: outbound persist failed: ${(error as Error).message}`);
  }
}
