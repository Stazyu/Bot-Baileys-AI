import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../database/prisma.js';
import { parseQuery, stringBool } from '../validate.js';

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

/** Ekstrak teks human-readable dari blob message Baileys. */
function extractText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const m = message as Record<string, unknown>;
  if (typeof m.conversation === 'string') return m.conversation;
  const ext = m.extendedTextMessage as Record<string, unknown> | undefined;
  if (ext && typeof ext.text === 'string') return ext.text;
  for (const key of ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage'] as const) {
    const media = m[key] as Record<string, unknown> | undefined;
    if (media) {
      const caption = typeof media.caption === 'string' && media.caption ? `: ${media.caption}` : '';
      return `[${key.replace('Message', '')}]${caption}`;
    }
  }
  if (m.stickerMessage) return '[sticker]';
  if (m.reactionMessage) return '[reaction]';
  if (m.pollCreationMessage) return '[poll]';
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
          text: extractText(row.message).slice(0, 500),
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

function jidField(key: unknown, field: 'remoteJid' | 'remoteJidAlt' | 'participant' | 'participantAlt'): string | null {
  if (!key || typeof key !== 'object') return null;
  const value = (key as Record<string, unknown>)[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function chatOf(key: unknown): string | null {
  return jidField(key, 'remoteJid');
}

/**
 * Real number for display/send: alt (PN) preferred, raw JID fallback.
 * Groups: participantAlt ?? participant; private: remoteJidAlt ?? remoteJid.
 * Same as simplified() in botHandler (auto-save users path).
 */
function displayJid(key: unknown, remoteJid: string | null): string | null {
  if (remoteJid?.endsWith('@g.us')) {
    return jidField(key, 'participantAlt') ?? jidField(key, 'participant') ?? remoteJid;
  }
  return jidField(key, 'remoteJidAlt') ?? remoteJid?.replace(/:\d+@s\.whatsapp\.net$/, '@s.whatsapp.net') ?? null;
}

/**
 * Conversation grouping key: real number when available (so inbound LID and
 * outbound PN land in the same thread), except groups which stay
 * grouped per group JID.
 */
function groupOf(key: unknown): string | null {
  const remoteJid = jidField(key, 'remoteJid');
  if (!remoteJid) return null;
  if (remoteJid.endsWith('@g.us')) return remoteJid;
  // Alt (PN) preferred; fallback strips the device suffix so legacy rows without alt still merge.
  return jidField(key, 'remoteJidAlt') ?? remoteJid.replace(/:\d+@s\.whatsapp\.net$/, '@s.whatsapp.net');
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
      const groups = new Map<string, typeof rows>();
      for (const row of rows) {
        const chat = groupOf(row.key);
        if (!chat) continue;
        const list = groups.get(chat);
        if (list) list.push(row);
        else groups.set(chat, [row]);
      }
      const conversations = [...groups.entries()]
        .map(([chat, list]) => {
          const newest = list[0];
          const inbound = list.find((r) => !r.fromMe);
          const messages = list
            .slice(-query.messageLimit)
            .reverse()
            .map((row) => ({
              id: row.id,
              fromMe: row.fromMe,
              pushName: row.pushName ?? (row.fromMe ? 'Bot' : '—'),
              body: extractText(row.message).slice(0, 1000),
              timestamp: toIso(Number(row.messageTimestamp)),
              createdAt: row.createdAt.toISOString(),
            }));
          return {
            id: chat,
            sessionId: newest.sessionId,
            userJid: displayJid((inbound ?? newest).key, chat) ?? chat,
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
