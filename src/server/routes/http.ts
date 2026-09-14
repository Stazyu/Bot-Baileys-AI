import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../database/prisma.js';
import { parseQuery, stringBool } from '../validate.js';

const httpQuery = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'DELETE', 'PUT']).optional(),
  path: z.string().max(200).optional(),
  /** success=true → status < 400; false → status >= 400. */
  success: stringBool,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Access log HTTP ala terminal — method, path, status, durasi. */
export async function registerHttpRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/http-logs', (req, reply) => {
    const query = parseQuery(httpQuery, req, reply);
    if (!query) return;
    return (async () => {
      const where: Prisma.HttpLogWhereInput = {};
      if (query.method) where.method = query.method;
      if (query.path) where.path = { contains: query.path };
      if (query.success !== undefined) {
        where.status = query.success ? { lt: 400 } : { gte: 400 };
      }
      const [total, errors, avg, byMethod, rows] = await Promise.all([
        prisma.httpLog.count({ where }),
        prisma.httpLog.count({ where: { ...where, status: { gte: 400 } } }),
        prisma.httpLog.aggregate({ where, _avg: { durationMs: true } }),
        prisma.httpLog.groupBy({ by: ['method'], where, _count: { _all: true }, orderBy: { _count: { method: 'desc' } } }),
        prisma.httpLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      const topRoute = await prisma.httpLog
        .groupBy({ by: ['path'], where, _count: { _all: true }, orderBy: { _count: { path: 'desc' } }, take: 1 })
        .catch(() => []);
      return {
        items: rows.map((row) => ({
          id: row.id,
          method: row.method,
          path: row.path,
          status: row.status,
          durationMs: row.durationMs,
          createdAt: row.createdAt.toISOString(),
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
        summary: {
          total,
          errors,
          avgMs: Math.round(avg._avg.durationMs ?? 0),
          byMethod: byMethod.map((m) => ({ method: m.method, count: m._count._all })),
          topRoute: topRoute[0] ? { path: topRoute[0].path, count: topRoute[0]._count._all } : null,
        },
      };
    })();
  });
}
