import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { recentLogs } from '../../utils/logger.js';
import { parseQuery } from '../validate.js';

const logsQuery = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** PrintLog versi web: 500 baris log runtime terakhir (in-memory, hilang saat restart). */
export async function registerLogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/logs', (req, reply) => {
    const query = parseQuery(logsQuery, req, reply);
    if (!query) return;
    const items = recentLogs(query.limit).filter((l) => !query.level || l.level === query.level);
    return { items };
  });
}
