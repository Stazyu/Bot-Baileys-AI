import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../database/prisma.js';
import { todayKey } from '../../services/premiumService.js';
import sessionManager from '../../session/sessionManager.js';
import { parseQuery } from '../validate.js';

const trafficQuery = z.object({
  range: z.enum(['24h', '7d']).default('24h'),
});

interface StatsCache {
  at: number;
  data: unknown;
}
let statsCache: StatsCache | null = null;
const trafficCache = new Map<string, StatsCache>();
const CACHE_MS = 60_000;

function jakartaDayKey(offsetDaysAgo: number): string {
  return new Date(Date.now() - offsetDaysAgo * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
}

function localDayBounds(offsetDaysAgo: number): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - offsetDaysAgo);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/dashboard/stats', async () => {
    if (statsCache && Date.now() - statsCache.at < CACHE_MS) return statsCache.data;
    const mem = sessionManager.getStats();
    const todayStart = localDayBounds(0).start;
    const [activeSessions, registeredUsers, messagesToday, aiRows] = await Promise.all([
      prisma.waSession.count({ where: { status: 'connected' } }).catch(() => mem.inMemory),
      prisma.user.count(),
      prisma.message.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.usageLog.findMany({ where: { date: todayKey() }, select: { aiChatCount: true } }),
    ]);
    const aiCallsToday = aiRows.reduce((sum, row) => sum + row.aiChatCount, 0);

    // Spark 7 hari (terlama → terbaru).
    const sparkSessions: number[] = [];
    const sparkUsers: number[] = [];
    const sparkMessages: number[] = [];
    const sparkAi: number[] = [];
    const usageWeek = await prisma.usageLog
      .findMany({
        where: { date: { in: [0, 1, 2, 3, 4, 5, 6].map((d) => jakartaDayKey(d)) } },
        select: { date: true, aiChatCount: true },
      })
      .catch(() => []);
    const aiByDate = new Map<string, number>();
    for (const row of usageWeek) {
      aiByDate.set(row.date, (aiByDate.get(row.date) ?? 0) + row.aiChatCount);
    }
    for (let back = 6; back >= 0; back--) {
      const { start, end } = localDayBounds(back);
      const [sessions, users, messages] = await Promise.all([
        prisma.waSession.count({ where: { createdAt: { gte: start, lt: end } } }).catch(() => 0),
        prisma.user.count({ where: { firstSeen: { gte: start, lt: end } } }).catch(() => 0),
        prisma.message.count({ where: { createdAt: { gte: start, lt: end } } }).catch(() => 0),
      ]);
      sparkSessions.push(sessions);
      sparkUsers.push(users);
      sparkMessages.push(messages);
      sparkAi.push(aiByDate.get(jakartaDayKey(back)) ?? 0);
    }

    const data = {
      activeSessions,
      registeredUsers,
      messagesToday,
      aiCallsToday,
      sparks: { sessions: sparkSessions, users: sparkUsers, messages: sparkMessages, ai: sparkAi },
    };
    statsCache = { at: Date.now(), data };
    return data;
  });

  app.get('/api/dashboard/traffic', (req, reply) => {
    const query = parseQuery(trafficQuery, req, reply);
    if (!query) return;
    const cached = trafficCache.get(query.range);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

    return (async () => {
      const hours = query.range === '24h' ? 24 : 24 * 7;
      const start = new Date(Date.now() - hours * 3_600_000);
      const rows = await prisma.message.findMany({
        where: { createdAt: { gte: start } },
        select: { createdAt: true, fromMe: true },
        orderBy: { createdAt: 'asc' },
        take: 100_000,
      });
      const buckets = query.range === '24h' ? 24 : 7;
      const incoming = new Array<number>(buckets).fill(0);
      const outgoing = new Array<number>(buckets).fill(0);
      const labels: string[] = [];
      if (query.range === '24h') {
        for (let i = 0; i < 24; i++) {
          const d = new Date(start.getTime() + i * 3_600_000);
          labels.push(`${String(d.getHours()).padStart(2, '0')}:00`);
        }
        for (const row of rows) {
          const idx = Math.min(buckets - 1, Math.max(0, Math.floor((row.createdAt.getTime() - start.getTime()) / 3_600_000)));
          if (row.fromMe) outgoing[idx]++;
          else incoming[idx]++;
        }
      } else {
        for (let i = 0; i < 7; i++) {
          const d = new Date(start.getTime() + i * 86_400_000);
          labels.push(d.toISOString().slice(5, 10));
        }
        for (const row of rows) {
          const idx = Math.min(buckets - 1, Math.max(0, Math.floor((row.createdAt.getTime() - start.getTime()) / 86_400_000)));
          if (row.fromMe) outgoing[idx]++;
          else incoming[idx]++;
        }
      }
      const data = {
        labels,
        incoming,
        outgoing,
        totalIn: incoming.reduce((a, b) => a + b, 0),
        totalOut: outgoing.reduce((a, b) => a + b, 0),
        truncated: rows.length >= 100_000,
      };
      trafficCache.set(query.range, { at: Date.now(), data });
      return data;
    })();
  });
}
