import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { registerAuth } from './auth.js';
import { startRetentionLoop } from './events.js';
import { registerHttpLogHooks } from './httpLog.js';
import { registerActivityRoutes } from './routes/activity.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerMessageRoutes, registerConversationRoutes } from './routes/messages.js';
import { registerSessionRoutes, registerSessionSendRoute } from './routes/sessions.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerToolRoutes } from './routes/tools.js';
import { registerLogRoutes } from './routes/logs.js';
import { registerHttpRoutes } from './routes/http.js';
import { registerUserRoutes, registerUserSummaryRoute } from './routes/users.js';

const VALID_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];

export async function buildServer(): Promise<FastifyInstance> {
  const level = process.env.LOG_LEVEL?.trim() ?? '';
  const logLevel = VALID_LOG_LEVELS.includes(level) ? level : 'warn';
  const isProd = process.env.NODE_ENV === 'production';
  // Jejak HTTP satu-baris ditangani hook httpLog (console.log, bypass level).
  // Logger Fastify: pretty di dev, JSON di prod.
  const app = Fastify({
    logger: {
      level: logLevel,
      ...(!isProd && {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
    },
  });

  await app.register(cors, {
    // The default plugin only allows GET,HEAD,POST — the dashboard also needs PATCH/DELETE.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    origin: (() => {
      const raw = process.env.CORS_ORIGIN?.trim() ?? '';
      if (!raw) return true;
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    })(),
  });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(websocket);
  await registerAuth(app);
  await registerHttpLogHooks(app);

  app.get('/', async () => ({
    name: 'Bot-Baileys-AI API',
    version: process.env.BOT_VERSION ?? '2.0.0',
    health: '/api/health',
  }));

  await registerHealthRoutes(app);
  await registerDashboardRoutes(app);
  await registerSessionRoutes(app);
  await registerSessionSendRoute(app);
  await registerActivityRoutes(app);
  await registerUserRoutes(app);
  await registerUserSummaryRoute(app);
  await registerMessageRoutes(app);
  await registerConversationRoutes(app);
  await registerSettingsRoutes(app);
  await registerToolRoutes(app);
  await registerLogRoutes(app);
  await registerHttpRoutes(app);

  return app;
}

export async function startServer(): Promise<FastifyInstance> {
  const app = await buildServer();
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST?.trim() || '127.0.0.1';
  await app.listen({ port: Number.isFinite(port) ? port : 3001, host });
  const retentionDays = Number(process.env.ACTIVITY_RETENTION_DAYS ?? 30);
  startRetentionLoop(Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 30);
  console.log(`🌐 Dashboard API listening on http://${host}:${Number.isFinite(port) ? port : 3001}`);
  return app;
}

export async function stopServer(app: FastifyInstance): Promise<void> {
  await app.close();
}
