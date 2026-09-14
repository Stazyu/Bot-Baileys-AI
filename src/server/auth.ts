import type { FastifyInstance } from 'fastify';

let warnedNoToken = false;

/**
 * Single token (personal panel). All /api/* require
 * `Authorization: Bearer <DASHBOARD_API_TOKEN>`, except the health probe.
 * Without a configured token (local dev): pass through + warn once.
 */
export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/') && req.url !== '/') return;
    const path = req.url.split('?')[0];
    if (req.method === 'GET' && (path === '/api/health' || path === '/')) return;
    const token = process.env.DASHBOARD_API_TOKEN?.trim() ?? '';
    if (!token) {
      if (!warnedNoToken) {
        warnedNoToken = true;
        app.log.warn('DASHBOARD_API_TOKEN tidak di-set — API tanpa auth (ok dev lokal, JANGAN di prod)');
      }
      return;
    }
    if (req.headers.authorization === `Bearer ${token}`) return;
    // Browser WebSockets can't set headers — accept ?token= for WS upgrades only.
    const isWsUpgrade = req.headers.upgrade?.toLowerCase() === 'websocket';
    if (isWsUpgrade) {
      const q = req.url.split('?')[1] ?? '';
      const fromQuery = new URLSearchParams(q).get('token');
      if (fromQuery === token) return;
    }
    return reply.code(401).send({ error: 'unauthorized' });
  });
}
