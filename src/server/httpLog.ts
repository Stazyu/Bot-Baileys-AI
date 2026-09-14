import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import prisma from '../database/prisma.js';
import { log } from '../utils/logger.js';

const startTimes = new WeakMap<FastifyRequest, number>();

function shouldSkip(req: FastifyRequest): boolean {
  // Preflights carry no signal; the 30s health probe would only be noise.
  if (req.method === 'OPTIONS') return true;
  const path = req.url.split('?')[0];
  return req.method === 'GET' && path === '/api/health';
}

const RESET = '\x1b[0m';
// Modern terminals (VS Code, Windows Terminal, Coolify) render ANSI even when
// output is piped through a task runner — so default ON, off only via NO_COLOR.
function colorsOn(): boolean {
  if (process.env.FORCE_COLOR === '1') return true;
  if (process.env.NO_COLOR || process.env.FORCE_COLOR === '0') return false;
  return true;
}

const METHOD_COLORS: Record<string, string> = {
  GET: '\x1b[32m',
  POST: '\x1b[36m',
  PATCH: '\x1b[33m',
  PUT: '\x1b[35m',
  DELETE: '\x1b[31m',
};

function statusColor(status: number): string {
  if (status < 300) return '\x1b[32m';
  if (status < 400) return '\x1b[36m';
  if (status < 500) return '\x1b[33m';
  return '\x1b[31m';
}
function paint(value: string | number, code: string): string {
  if (!colorsOn() || !code) return String(value);
  return `${code}${value}${RESET}`;
}

/** Persist the request to HttpLog + one colored terminal line (bypasses LOG_LEVEL). */
export async function registerHttpLogHooks(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req) => {
    startTimes.set(req, Date.now());
  });

  app.addHook('onResponse', (req, reply: FastifyReply, done: () => void) => {
    if (!shouldSkip(req)) {
      const startedAt = startTimes.get(req);
      const durationMs = startedAt === undefined ? null : Date.now() - startedAt;
      console.log(`${paint(req.method, METHOD_COLORS[req.method] ?? '')} ${req.url.slice(0, 120)} ${paint(reply.statusCode, statusColor(reply.statusCode))} ${durationMs === null ? '-' : `${durationMs}ms`}`);
      const entry = {
        method: req.method,
        path: req.url.slice(0, 500),
        status: reply.statusCode,
        durationMs,
        ip: req.ip ?? null,
      };
      // Background — don't hold the response for the log write.
      void prisma.httpLog
        .create({ data: entry })
        .catch((error: Error) => {
          log.debug(`[HttpLog] Non-critical: persist failed: ${error.message}`);
        })
        .finally(() => {
          startTimes.delete(req);
        });
    } else {
      startTimes.delete(req);
    }
    done();
  });
}
