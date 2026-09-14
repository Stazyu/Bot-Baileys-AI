import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import QRCode from 'qrcode';
import prisma from '../../database/prisma.js';
import sessionManager from '../../session/sessionManager.js';
import { createSession, deleteSession, disconnectSession } from '../../session/sessionHelper.js';
import { bus } from '../events.js';
import { persistOutboundMessage } from '../../services/messageService.js';
import { validateJid } from '../../utils/messageValidator.js';
import { parseBody } from '../validate.js';

type SessionStatus = 'connected' | 'connecting' | 'disconnected' | 'pairing';

const WA_STATUS: Record<string, SessionStatus> = {
  connected: 'connected',
  qr: 'pairing',
  disconnected: 'disconnected',
  logged_out: 'disconnected',
};

const createBody = z.object({
  id: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/),
  phone: z
    .string()
    .regex(/^[0-9+]{8,16}$/)
    .optional(),
});

const pairingMessage = z.object({
  action: z.literal('pairing'),
  phone: z.string().regex(/^[0-9+]{8,16}$/),
});

interface LinkSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', cb: (data: unknown) => void): void;
  on(event: 'close' | 'error', cb: () => void): void;
  readonly readyState: number;
}

function formatUptime(since: Date | null): string {
  if (!since) return '—';
  const mins = Math.max(0, Math.floor((Date.now() - since.getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

async function currentStatus(sessionId: string): Promise<SessionStatus> {
  try {
    const row = await prisma.waSession.findUnique({ where: { sessionId } });
    if (row) return WA_STATUS[row.status] ?? 'disconnected';
  } catch {
    // DB down — fall back to memory.
  }
  return (await sessionManager.getSession(sessionId)) ? 'connected' : 'disconnected';
}

async function renderQrDataUrl(qr: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(qr, { margin: 1, width: 256 });
  } catch {
    return null;
  }
}

const activeLinks = new Set<string>();

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/sessions', async () => {
    const [sessions, inRows, outRows, lastRows] = await Promise.all([
      prisma.waSession.findMany({ orderBy: { updatedAt: 'desc' } }),
      prisma.message.groupBy({ by: ['sessionId'], where: { fromMe: false }, _count: { _all: true } }),
      prisma.message.groupBy({ by: ['sessionId'], where: { fromMe: true }, _count: { _all: true } }),
      prisma.message.groupBy({ by: ['sessionId'], _max: { createdAt: true } }),
    ]);
    const messagesIn: Record<string, number> = {};
    for (const row of inRows) messagesIn[row.sessionId] = row._count._all;
    const messagesOut: Record<string, number> = {};
    for (const row of outRows) messagesOut[row.sessionId] = row._count._all;
    const lastActive: Record<string, string> = {};
    for (const row of lastRows) {
      if (row._max.createdAt) lastActive[row.sessionId] = row._max.createdAt.toISOString();
    }
    return sessions.map((s) => ({
      id: s.sessionId,
      phoneNumber: s.phoneNumber,
      status: WA_STATUS[s.status] ?? 'disconnected',
      isActive: s.isActive,
      uptime: s.status === 'connected' && s.lastConnectedAt ? formatUptime(s.lastConnectedAt) : '—',
      lastActive: lastActive[s.sessionId] ?? null,
      lastConnectedAt: s.lastConnectedAt?.toISOString() ?? null,
      lastDisconnectedAt: s.lastDisconnectedAt?.toISOString() ?? null,
      messagesIn: messagesIn[s.sessionId] ?? 0,
      messagesOut: messagesOut[s.sessionId] ?? 0,
    }));
  });

  app.get('/api/sessions/:id', (req, reply) => {
    const { id } = req.params as { id: string };
    if (!id || id.length > 64) {
      void reply.code(400).send({ error: 'invalid_id' });
      return;
    }
    return (async () => {
      const row = await prisma.waSession.findUnique({ where: { sessionId: id } });
      if (!row) {
        await reply.code(404).send({ error: 'session_not_found' });
        return;
      }
      return {
        id: row.sessionId,
        phoneNumber: row.phoneNumber,
        status: WA_STATUS[row.status] ?? 'disconnected',
        isActive: row.isActive,
        uptime: row.status === 'connected' && row.lastConnectedAt ? formatUptime(row.lastConnectedAt) : '—',
        lastConnectedAt: row.lastConnectedAt?.toISOString() ?? null,
        lastDisconnectedAt: row.lastDisconnectedAt?.toISOString() ?? null,
        lastQrAt: row.lastQrAt?.toISOString() ?? null,
      };
    })();
  });

  app.post('/api/sessions', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, (req, reply) => {
    const body = parseBody(createBody, req.body, reply);
    if (!body) return;
    return (async () => {
      if (await sessionManager.getSession(body.id)) {
        await reply.code(409).send({ error: 'session_already_connected' });
        return;
      }
      try {
        await createSession(body.id);
        if (body.phone) {
          await prisma.waSession
            .upsert({
              where: { sessionId: body.id },
              update: { phoneNumber: body.phone },
              create: { sessionId: body.id, phoneNumber: body.phone },
            })
            .catch(() => undefined);
        }
        bus.emitActivity({ type: 'session', sessionId: body.id, detail: `Session "${body.id}" created — waiting for link` });
        await reply.code(202).send({ id: body.id, status: 'connecting' satisfies SessionStatus });
      } catch (error) {
        await reply.code(500).send({ error: 'create_failed', message: (error as Error).message });
      }
    })();
  });

  app.post('/api/sessions/:id/disconnect', (req, reply) => {
    return (async () => {
      const { id } = req.params as { id: string };
      const known = (await sessionManager.getSession(id)) ?? (await prisma.waSession.findUnique({ where: { sessionId: id } }).catch(() => null));
      if (!known) {
        await reply.code(404).send({ error: 'session_not_found' });
        return;
      }
      await disconnectSession(id);
      bus.emitActivity({ type: 'session', sessionId: id, detail: `Session "${id}" disconnected via dashboard` });
      return { id, status: 'disconnected' satisfies SessionStatus };
    })();
  });

  app.post('/api/sessions/:id/reconnect', (req, reply) => {
    return (async () => {
      const { id } = req.params as { id: string };
      if (await sessionManager.getSession(id)) {
        await reply.code(409).send({ error: 'session_already_connected' });
        return;
      }
      try {
        // Creds of a logged-out session were revoked by WA — wipe first so
        // pairing starts fresh and a new QR is issued instead of another 401.
        const row = await prisma.waSession.findUnique({ where: { sessionId: id } }).catch(() => null);
        await createSession(id, row?.status === 'logged_out');
        bus.emitActivity({ type: 'session', sessionId: id, detail: `Session "${id}" reconnecting via dashboard` });
        await reply.code(202).send({ id, status: 'connecting' satisfies SessionStatus });
      } catch (error) {
        await reply.code(500).send({ error: 'reconnect_failed', message: (error as Error).message });
      }
    })();
  });

  app.delete('/api/sessions/:id', (req, reply) => {
    return (async () => {
      const { id } = req.params as { id: string };
      const known = (await sessionManager.getSession(id)) ?? (await prisma.waSession.findUnique({ where: { sessionId: id } }).catch(() => null));
      if (!known) {
        await reply.code(404).send({ error: 'session_not_found' });
        return;
      }
      await deleteSession(id);
      bus.emitActivity({ type: 'session', sessionId: id, detail: `Session "${id}" removed via dashboard` });
      return { id, deleted: true };
    })();
  });

  app.get('/api/sessions/:id/qr', (req, reply) => {
    return (async () => {
      const { id } = req.params as { id: string };
      const last = sessionManager.getLastQr(id);
      return {
        sessionId: id,
        status: await currentStatus(id),
        dataUrl: last ? await renderQrDataUrl(last.qr) : null,
        lastQrAt: last ? last.at.toISOString() : null,
      };
    })();
  });

  // Stream QR + pairing code + status. Satu koneksi aktif per sesi
  // (QR Baileys single-consumer).
  app.get<{ Params: { id: string } }>('/api/sessions/:id/link', { websocket: true }, (socket, req) => {
    const ws = socket as unknown as LinkSocket;
    const { id } = req.params;
    const send = (msg: unknown): void => {
      try {
        if (ws.readyState === 1) ws.send(JSON.stringify(msg));
      } catch {
        // Client already gone — ignore.
      }
    };
    if (activeLinks.has(id)) {
      send({ type: 'error', message: 'link stream already active for this session' });
      ws.close(4409, 'already active');
      return;
    }
    activeLinks.add(id);

    void (async () => {
      send({ type: 'status', sessionId: id, status: await currentStatus(id) });
      const last = sessionManager.getLastQr(id);
      if (last) send({ type: 'qr', sessionId: id, dataUrl: await renderQrDataUrl(last.qr), at: last.at.toISOString() });
    })();

    const unsub = bus.subscribeLink((link) => {
      if (link.sessionId !== id) return;
      if (link.qr) {
        void renderQrDataUrl(link.qr).then((dataUrl) => send({ type: 'qr', sessionId: id, dataUrl }));
      }
      if (link.pairingCode) send({ type: 'pairingCode', sessionId: id, code: link.pairingCode });
      if (link.status) send({ type: 'status', sessionId: id, status: link.status });
    });

    ws.on('message', (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        return;
      }
      const msg = pairingMessage.safeParse(parsed);
      if (!msg.success) return;
      void sessionManager
        .requestPairingCode(id, msg.data.phone)
        .then((code) => send({ type: 'pairingCode', sessionId: id, code }))
        .catch((error: Error) => send({ type: 'error', message: error.message }));
    });

    const cleanup = (): void => {
      activeLinks.delete(id);
      unsub();
    };
    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });
}

const sendBody = z.object({
  to: z.string().min(3).max(64),
  text: z.string().min(1).max(4000),
});

/** Balas chat dari dashboard (dipakai ChatLogs reply box). */
export async function registerSessionSendRoute(app: FastifyInstance): Promise<void> {
  app.post('/api/sessions/:id/send', (req, reply) => {
    const body = parseBody(sendBody, req.body, reply);
    if (!body) return;
    return (async () => {
      const { id } = req.params as { id: string };
      const socket = await sessionManager.getSession(id);
      if (!socket) {
        await reply.code(404).send({ error: 'session_not_connected' });
        return;
      }
      if (!validateJid(body.to).valid) {
        await reply.code(400).send({ error: 'invalid_jid' });
        return;
      }
      try {
        const sent = await socket.sendMessage(body.to, { text: body.text });
        bus.emitActivity({ type: 'message', sessionId: id, detail: `Dashboard reply → ${body.to.split('@')[0]}` });
        void persistOutboundMessage({ sessionId: id, to: body.to, content: { text: body.text } });
        return { sent: true, id: sent?.key?.id ?? null };
      } catch (error) {
        await reply.code(502).send({ error: 'send_failed', message: (error as Error).message });
      }
    })();
  });
}
