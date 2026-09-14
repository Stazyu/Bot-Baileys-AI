import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../database/prisma.js';
import { bus } from '../events.js';
import { openSse, sendSse } from '../sse.js';
import { parseQuery } from '../validate.js';

const activityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['message', 'command', 'ai', 'session', 'download', 'error']).optional(),
  cursor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T.*\|[a-f0-9]{24}$/)
    .optional(),
});

export async function registerActivityRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/activity', (req, reply) => {
    const query = parseQuery(activityQuery, req, reply);
    if (!query) return;
    return (async () => {
      const where: Prisma.ActivityEventWhereInput = {};
      if (query.type) where.type = query.type;
      if (query.cursor) {
        const sep = query.cursor.lastIndexOf('|');
        const at = new Date(query.cursor.slice(0, sep));
        const id = query.cursor.slice(sep + 1);
        where.OR = [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }];
      }
      const rows = await prisma.activityEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      });
      const hasMore = rows.length > query.limit;
      const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) => ({
        id: row.id,
        type: row.type,
        sessionId: row.sessionId,
        session: row.session,
        detail: row.detail,
        createdAt: row.createdAt.toISOString(),
      }));
      const last = hasMore ? rows[query.limit - 1] : null;
      return {
        items,
        nextCursor: last ? `${last.createdAt.toISOString()}|${last.id}` : null,
      };
    })();
  });

  app.get('/api/activity/stream', (req, reply) => {
    openSse(reply, req);
    for (const item of bus.recentActivity(30)) {
      if (!sendSse(reply, 'activity', item)) return;
    }
    const unsub = bus.subscribeActivity((item) => {
      if (!sendSse(reply, 'activity', item)) cleanup();
    });
    const heartbeat = setInterval(() => {
      if (!sendSse(reply, 'ping', { t: Date.now() })) cleanup();
    }, 25_000);
    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsub();
      req.raw.removeListener('close', cleanup);
      try {
        reply.raw.end();
      } catch {
        // Socket already dead — ignore.
      }
    };
    req.raw.on('close', cleanup);
  });
}
