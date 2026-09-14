import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Allowed origins — mirrors the cors options in index.ts.
 * Without this the browser blocks the stream: the SSE response is written via hijack,
 * so the @fastify/cors hook never runs for it.
 */
function allowedOrigin(req: FastifyRequest): string | null {
  const raw = process.env.CORS_ORIGIN?.trim() ?? '';
  const origin = req.headers.origin;
  if (!raw) return typeof origin === 'string' && origin ? origin : '*';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return typeof origin === 'string' && list.includes(origin) ? origin : null;
}

/** Take over the socket and open the SSE stream. Must be called before writing. */
export function openSse(reply: FastifyReply, req: FastifyRequest): void {
  reply.hijack();
  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    Vary: 'Origin',
  };
  const origin = allowedOrigin(req);
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  reply.raw.writeHead(200, headers);
}

/** Write a single event. false = connection already dead, call cleanup. */
export function sendSse(reply: FastifyReply, event: string, data: unknown): boolean {
  if (reply.raw.destroyed || reply.raw.writableEnded) return false;
  try {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}
