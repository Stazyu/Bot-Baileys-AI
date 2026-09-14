import { cpus, freemem, totalmem } from 'node:os';
import type { FastifyInstance } from 'fastify';
import prisma from '../../database/prisma.js';
import sessionManager from '../../session/sessionManager.js';
import { bus } from '../events.js';
import { openSse, sendSse } from '../sse.js';

interface HealthSnapshot {
  status: 'ok' | 'degraded';
  uptimeSec: number;
  cpuPct: number;
  memPct: number;
  memUsedMB: number;
  queueDepth: number;
  replyP50Ms: number | null;
  sessionsConnected: number;
  sessionsTotal: number;
  time: string;
}

/**
 * CPU % via process.cpuUsage delta. os.loadavg() is always zero on Windows
 * (Unix-only), so it can't be used on this dev machine.
 */
let lastCpuSample = process.cpuUsage();
let lastCpuAt = Date.now();

function sampleCpuPct(): number {
  const now = Date.now();
  const elapsedMs = now - lastCpuAt;
  const diff = process.cpuUsage(lastCpuSample);
  lastCpuSample = process.cpuUsage();
  lastCpuAt = now;
  if (elapsedMs <= 0) return 0;
  const cores = Math.max(1, cpus().length);
  return Math.min(100, Math.round(((diff.user + diff.system) / 1000 / (elapsedMs * cores)) * 100));
}

async function collectHealth(): Promise<HealthSnapshot> {
  const mem = sessionManager.getStats();
  let sessionsConnected = mem.inMemory;
  let sessionsTotal = mem.inMemory;
  let status: 'ok' | 'degraded' = 'ok';
  try {
    [sessionsConnected, sessionsTotal] = await Promise.all([
      prisma.waSession.count({ where: { status: 'connected' } }),
      prisma.waSession.count(),
    ]);
  } catch {
    status = 'degraded';
  }
  const total = totalmem();
  return {
    status,
    uptimeSec: Math.floor(process.uptime()),
    cpuPct: sampleCpuPct(),
    memPct: Math.round(((total - freemem()) / total) * 100),
    memUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    queueDepth: mem.reconnecting,
    replyP50Ms: bus.replyP50(),
    sessionsConnected,
    sessionsTotal,
    time: new Date().toISOString(),
  };
}

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  // Public — for Docker HEALTHCHECK / uptime probes.
  app.get('/api/health', async () => collectHealth());

  app.get('/api/health/stream', (req, reply) => {
    openSse(reply, req);
    const push = (): boolean => {
      let settled = false;
      void collectHealth()
        .then((snap) => {
          settled = true;
          if (!sendSse(reply, 'health', snap)) cleanup();
        })
        .catch(() => {
          if (!settled) cleanup();
        });
      return true;
    };
    const cleanup = (): void => {
      clearInterval(timer);
      req.raw.removeListener('close', cleanup);
      try {
        reply.raw.end();
      } catch {
        // Socket already dead — ignore.
      }
    };
    const timer = setInterval(push, 5000);
    req.raw.on('close', cleanup);
    push();
  });
}
