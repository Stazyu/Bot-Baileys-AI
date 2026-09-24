import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import type { proto, WAMessageKey } from '@stazyu/baileys';
import { z } from 'zod';
import prisma from '../../database/prisma.js';
import { parseQuery, stringBool } from '../validate.js';
import { resolvePn, storedKey, storedMessage } from '../../services/messageService.js';
import { extractTextFromMessage, getRealContentType } from '../../utils/messageHelper.js';

const messagesQuery = z.object({
  sessionId: z.string().max(64).optional(),
  // q only searches pushName (the message field is raw Baileys JSON,
  // no server-side full-text search in Mongo).
  q: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const commandsQuery = z.object({
  sessionId: z.string().max(64).optional(),
  command: z.string().max(32).optional(),
  success: stringBool,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Human-readable text of a Baileys message blob (unwrapped). */
function extractText(message: proto.IMessage | null): string {
  const type = getRealContentType(message);
  const text = extractTextFromMessage(message);
  if (text) return text;
  if (type === 'stickerMessage') return '[sticker]';
  if (type === 'reactionMessage') return '[reaction]';
  if (type === 'pollCreationMessage' || type === 'pollCreationMessageV2' || type === 'pollCreationMessageV3') return '[poll]';
  if (type) return `[${type.replace('Message', '')}]`;
  return '[media]';
}

function toIso(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  // Baileys messageTimestamp dalam detik — normalisasi ke ms.
  const normalized = ms < 1e12 ? ms * 1000 : ms;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function registerMessageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/messages', (req, reply) => {
    const query = parseQuery(messagesQuery, req, reply);
    if (!query) return;
    return (async () => {
      const where: Prisma.MessageWhereInput = {};
      if (query.sessionId) where.sessionId = query.sessionId;
      if (query.q) where.pushName = { contains: query.q, mode: 'insensitive' };
      const [total, rows] = await Promise.all([
        prisma.message.count({ where }),
        prisma.message.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return {
        items: rows.map((row) => ({
          id: row.id,
          sessionId: row.sessionId,
          fromMe: row.fromMe,
          pushName: row.pushName,
          text: extractText(storedMessage(row.message)).slice(0, 500),
          timestamp: toIso(Number(row.messageTimestamp)),
          createdAt: row.createdAt.toISOString(),
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
      };
    })();
  });

  app.get('/api/commands', (req, reply) => {
    const query = parseQuery(commandsQuery, req, reply);
    if (!query) return;
    return (async () => {
      const where: Prisma.CommandLogWhereInput = {};
      if (query.sessionId) where.sessionId = query.sessionId;
      if (query.command) where.command = query.command;
      if (query.success !== undefined) where.success = query.success;
      const [total, success, avg, top, rows] = await Promise.all([
        prisma.commandLog.count({ where }),
        where.success === false ? Promise.resolve(0) : prisma.commandLog.count({ where: { ...where, success: true } }),
        prisma.commandLog.aggregate({ where, _avg: { latencyMs: true } }),
        prisma.commandLog.groupBy({ by: ['command'], where, _count: { _all: true }, orderBy: { _count: { command: 'desc' } }, take: 1 }),
        prisma.commandLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return {
        items: rows.map((row) => ({
          id: row.id,
          sessionId: row.sessionId,
          userId: row.userId,
          command: row.command,
          args: row.args,
          success: row.success,
          latencyMs: row.latencyMs,
          createdAt: row.createdAt.toISOString(),
        })),
        total,
        page: query.page,
        summary: {
          total,
          success,
          error: total - success,
          avgLatencyMs: Math.round(avg._avg.latencyMs ?? 0),
          top: top.map((t) => ({ command: t.command, count: t._count._all })),
        },
      };
    })();
  });
}

const conversationsQuery = z.object({
  sessionId: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  messageLimit: z.coerce.number().int().min(1).max(100).default(30),
});

type JidField = 'remoteJid' | 'remoteJidAlt' | 'participant' | 'participantAlt';

function jidField(key: WAMessageKey | null, field: JidField): string | null {
  const value = key?.[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Real number for display/send: alt (PN) preferred, raw JID fallback.
 * Groups: participantAlt ?? participant; private: remoteJidAlt ?? remoteJid.
 * Same as simplified() in botHandler (auto-save users path).
 */
function displayJid(key: WAMessageKey | null, remoteJid: string | null): string | null {
  if (remoteJid?.endsWith('@g.us')) {
    return jidField(key, 'participantAlt') ?? jidField(key, 'participant') ?? remoteJid;
  }
  return jidField(key, 'remoteJidAlt') ?? remoteJid?.replace(/:\d+@s\.whatsapp\.net$/, '@s.whatsapp.net') ?? null;
}

/** Strip the Baileys device suffix (:8@s.whatsapp.net) so PN forms compare equal. */
function normalizeJid(jid: string | null | undefined): string | null {
  if (typeof jid !== 'string' || jid.length === 0) return null;
  return jid.replace(/:\d+@s\.whatsapp\.net$/, '@s.whatsapp.net');
}

/**
 * Every identity one row belongs to: raw remoteJid + PN alt (deduped), so a
 * LID row and a PN row of the same person can be unioned into one thread.
 * Groups only expose the group JID (participants are not part of the key).
 */
function aliasesOf(key: WAMessageKey | null): string[] {
  const remoteJid = normalizeJid(jidField(key, 'remoteJid'));
  if (!remoteJid) return [];
  if (remoteJid.endsWith('@g.us')) return [remoteJid];
  const alt = normalizeJid(jidField(key, 'remoteJidAlt'));
  return alt && alt !== remoteJid ? [remoteJid, alt] : [remoteJid];
}

/**
 * Conversations grouped from Message (personal scale: 1000 latest).
 * unread is always 0 — the backend doesn't track read status.
 */
export async function registerConversationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/conversations', (req, reply) => {
    const query = parseQuery(conversationsQuery, req, reply);
    if (!query) return;
    return (async () => {
      const where: Prisma.MessageWhereInput = {};
      if (query.sessionId) where.sessionId = query.sessionId;
      const rows = await prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });

      // ── Alias union (fix: one user showing up as duplicate threads) ────
      // The same person appears as LID (…@lid), PN with a device suffix, or
      // bare PN depending on the row. Union every alias a row carries, then
      // resolve LIDs through the signal store, so each user maps to ONE thread.
      const parent = new Map<string, string>();
      const find = (x: string): string => {
        const p = parent.get(x);
        if (p === undefined || p === x) return x;
        const root = find(p);
        parent.set(x, root);
        return root;
      };
      const union = (a: string, b: string): void => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
      };

      const lids = new Map<string, string>();
      for (const row of rows) {
        const aliases = aliasesOf(storedKey(row.key));
        if (aliases.length === 2) union(aliases[0], aliases[1]);
        const lid = aliases.find((a) => a.endsWith('@lid'));
        if (lid && !lids.has(lid)) lids.set(lid, row.sessionId);
      }
      // Authoritative LID → PN lookup (cached in messageService; no-op when unknown).
      await Promise.all(
        [...lids.entries()].map(async ([lid, sessionId]) => {
          const pn = await resolvePn(sessionId, lid);
          if (pn !== lid) union(lid, pn);
        }),
      );

      const groups = new Map<string, typeof rows>();
      for (const row of rows) {
        const primary = aliasesOf(storedKey(row.key))[0];
        if (!primary) continue;
        const chat = find(primary);
        const list = groups.get(chat);
        if (list) list.push(row);
        else groups.set(chat, [row]);
      }
      const conversations = [...groups.entries()]
        .map(([chat, list]) => {
          const newest = list[0];
          const inbound = list.find((r) => !r.fromMe);
          const messages = list
            // rows are newest-first → keep the LATEST N, oldest→newest for display.
            .slice(0, query.messageLimit)
            .reverse()
            .map((row) => ({
              id: row.id,
              fromMe: row.fromMe,
              pushName: row.pushName ?? (row.fromMe ? 'Bot' : '—'),
              body: extractText(storedMessage(row.message)).slice(0, 1000),
              timestamp: toIso(Number(row.messageTimestamp)),
              createdAt: row.createdAt.toISOString(),
            }));
          // Display/reply target: prefer the PN form even when the thread's
          // newest row only carries a LID.
          const aliases = new Set<string>();
          for (const r of list) for (const a of aliasesOf(storedKey(r.key))) aliases.add(a);
          const pnAlias = [...aliases].find((a) => a.endsWith('@s.whatsapp.net'));
          const primary = storedKey((inbound ?? newest).key);
          const userJid = chat.endsWith('@g.us')
            ? (displayJid(primary, chat) ?? chat)
            : (pnAlias ?? displayJid(primary, chat) ?? chat);
          return {
            id: chat,
            sessionId: newest.sessionId,
            userJid,
            pushName: inbound?.pushName ?? newest.pushName ?? chat.split('@')[0],
            lastMessage: messages.length > 0 ? messages[messages.length - 1].body : '',
            lastMessageAt: newest.createdAt.toISOString(),
            unread: 0,
            messages,
          };
        })
        .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1))
        .slice(0, query.limit);
      return { items: conversations, total: groups.size };
    })();
  });
}
