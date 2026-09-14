import prisma from '../database/prisma.js';
import { log } from '../utils/logger.js';

export type ActivityType = 'message' | 'command' | 'ai' | 'session' | 'download' | 'error';

export interface ActivityPayload {
  type: ActivityType;
  sessionId?: string;
  /** pushName snapshot — cheap for listing without a join */
  session?: string;
  detail: string;
}

export interface StoredActivity extends ActivityPayload {
  id: string;
  createdAt: string;
}

export interface LinkPayload {
  sessionId: string;
  /** QR mentah (string konten, bukan dataURL — render di route) */
  qr?: string;
  pairingCode?: string;
  status?: string;
}

const RING_SIZE = 200;
const LATENCY_WINDOW = 2000;

type ActivityListener = (a: StoredActivity) => void;
type LinkListener = (l: LinkPayload) => void;

class EventBus {
  private activitySubs = new Set<ActivityListener>();
  private linkSubs = new Set<LinkListener>();
  private ring: StoredActivity[] = [];
  private latencies: number[] = [];

  subscribeActivity(fn: ActivityListener): () => void {
    this.activitySubs.add(fn);
    return () => {
      this.activitySubs.delete(fn);
    };
  }

  subscribeLink(fn: LinkListener): () => void {
    this.linkSubs.add(fn);
    return () => {
      this.linkSubs.delete(fn);
    };
  }

  /** In-memory buffer for SSE reconnect replay (newest first). */
  recentActivity(limit = 30): StoredActivity[] {
    return this.ring.slice(-Math.max(1, limit)).reverse();
  }

  /** Inbound-to-reply latency, sliding window for the dashboard p50. */
  recordReplyLatency(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.latencies.push(Math.round(ms));
    if (this.latencies.length > LATENCY_WINDOW) {
      this.latencies.splice(0, this.latencies.length - LATENCY_WINDOW);
    }
  }

  replyP50(): number | null {
    if (this.latencies.length === 0) return null;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  emitActivity(p: ActivityPayload): void {
    const item: StoredActivity = {
      ...p,
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
    };
    this.ring.push(item);
    if (this.ring.length > RING_SIZE) {
      this.ring.splice(0, this.ring.length - RING_SIZE);
    }
    for (const fn of this.activitySubs) {
      try {
        fn(item);
      } catch {
        // Subscriber isolation — one broken listener must not kill the bus.
      }
    }
    // Persist fire-and-forget: never block the WA message pipeline.
    void this.persistActivity(p);
  }

  emitLink(l: LinkPayload): void {
    for (const fn of this.linkSubs) {
      try {
        fn(l);
      } catch {
        // Isolasi subscriber.
      }
    }
  }

  async emitCommand(opts: {
    sessionId?: string;
    session?: string;
    userId?: string;
    command: string;
    args?: string;
    success: boolean;
    latencyMs?: number;
  }): Promise<void> {
    this.emitActivity({
      type: 'command',
      sessionId: opts.sessionId,
      session: opts.session,
      detail: `!${opts.command} executed${opts.success ? '' : ' (failed)'}`,
    });
    try {
      await prisma.commandLog.create({
        data: {
          sessionId: opts.sessionId ?? null,
          userId: opts.userId ?? null,
          command: opts.command,
          args: opts.args ?? null,
          success: opts.success,
          latencyMs: opts.latencyMs ?? null,
        },
      });
    } catch (error) {
      log.debug(`[EventBus] Non-critical: command log persist failed: ${(error as Error).message}`);
    }
  }

  private async persistActivity(p: ActivityPayload): Promise<void> {
    try {
      await prisma.activityEvent.create({
        data: {
          type: p.type,
          sessionId: p.sessionId ?? null,
          session: p.session ?? null,
          detail: p.detail,
        },
      });
    } catch (error) {
      log.debug(`[EventBus] Non-critical: activity persist failed: ${(error as Error).message}`);
    }
  }
}

export const bus = new EventBus();
export default bus;

/** Hapus event & command log lebih tua dari retensi. Dipanggil per jam. */
export async function pruneActivity(retentionDays: number): Promise<{ activity: number; commands: number; http: number }> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  try {
    const [activity, commands, http] = await Promise.all([
      prisma.activityEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.commandLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.httpLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    ]);
    if (activity.count + commands.count + http.count > 0) {
      log.info(`🧹 [EventBus] Pruned ${activity.count} activity + ${commands.count} command + ${http.count} http rows older than ${retentionDays}d`);
    }
    return { activity: activity.count, commands: commands.count, http: http.count };
  } catch (error) {
    log.debug(`[EventBus] Non-critical: prune failed: ${(error as Error).message}`);
    return { activity: 0, commands: 0, http: 0 };
  }
}

/** Retention scheduler — unref'd timer, never holds the event loop. */
export function startRetentionLoop(retentionDays: number): void {
  const run = (): void => {
    void pruneActivity(retentionDays);
  };
  run();
  const timer = setInterval(run, 60 * 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
}
