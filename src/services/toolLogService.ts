import prisma from '../database/prisma.js';
import { log } from '../utils/logger.js';

/**
 * Log eksekusi AI tool call. Fire-and-forget — tidak pernah melempar ke AI pipeline.
 * Termasuk duplicate yang di-skip (cached: true) agar perilaku model transparan.
 */
export async function persistToolCall(opts: {
  sessionId?: string;
  userId?: string;
  tool: string;
  args?: string;
  success: boolean;
  latencyMs?: number;
  cached?: boolean;
}): Promise<void> {
  try {
    await prisma.toolCallLog.create({
      data: {
        sessionId: opts.sessionId ?? null,
        userId: opts.userId ?? null,
        tool: opts.tool,
        args: opts.args?.slice(0, 500) ?? null,
        success: opts.success,
        cached: opts.cached ?? false,
        latencyMs: opts.latencyMs ?? null,
      },
    });
  } catch (error) {
    log.debug(`[ToolLog] Non-critical: tool call persist failed: ${(error as Error).message}`);
  }
}
