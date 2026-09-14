import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../database/prisma.js';
import { parseQuery, stringBool } from '../validate.js';

const toolsQuery = z.object({
  sessionId: z.string().max(64).optional(),
  tool: z.string().max(64).optional(),
  success: stringBool,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** AI tool execution feed — kept separate from commands so stats don't mix. */
export async function registerToolRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tools', (req, reply) => {
    const query = parseQuery(toolsQuery, req, reply);
    if (!query) return;
    return (async () => {
      const where: Prisma.ToolCallLogWhereInput = {};
      if (query.sessionId) where.sessionId = query.sessionId;
      if (query.tool) where.tool = query.tool;
      if (query.success !== undefined) where.success = query.success;
      const [total, success, avg, top, rows] = await Promise.all([
        prisma.toolCallLog.count({ where }),
        where.success === false ? Promise.resolve(0) : prisma.toolCallLog.count({ where: { ...where, success: true } }),
        prisma.toolCallLog.aggregate({ where, _avg: { latencyMs: true } }),
        prisma.toolCallLog.groupBy({ by: ['tool'], where, _count: { _all: true }, orderBy: { _count: { tool: 'desc' } }, take: 5 }),
        prisma.toolCallLog.findMany({
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
          tool: row.tool,
          args: row.args,
          success: row.success,
          cached: row.cached,
          latencyMs: row.latencyMs,
          createdAt: row.createdAt.toISOString(),
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
        summary: {
          total,
          success,
          error: total - success,
          avgLatencyMs: Math.round(avg._avg.latencyMs ?? 0),
          top: top.map((t) => ({ tool: t.tool, count: t._count._all })),
        },
      };
    })();
  });
}
