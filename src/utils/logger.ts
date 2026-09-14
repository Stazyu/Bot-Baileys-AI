const isProduction = process.env.NODE_ENV === 'production';
// In production, default to silent unless LOG_LEVEL is explicitly set
const logLevel = isProduction && !process.env.LOG_LEVEL ? 'silent' : (process.env.LOG_LEVEL || 'info');

// Log level priority: silent < error < warn < info < debug
const levelPriority: Record<string, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

let currentLevel = levelPriority[logLevel] || 3;

function shouldLog(level: string): boolean {
  return currentLevel >= (levelPriority[level] || 0);
}
/** Ring buffer log runtime untuk viewer web (PrintLog). Ephemeral — hilang saat restart. */
export interface RuntimeLogEntry {
  t: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  msg: string;
}
const LOG_RING_SIZE = 500;
const logRing: RuntimeLogEntry[] = [];

function pushLine(level: RuntimeLogEntry['level'], msg: string): void {
  if (msg.length === 0 || msg.length > 2000) {
    if (msg.length === 0) return;
    msg = msg.slice(0, 2000);
  }
  logRing.push({ t: new Date().toISOString(), level, msg });
  if (logRing.length > LOG_RING_SIZE) logRing.splice(0, logRing.length - LOG_RING_SIZE);
}

/** Tebak level dari token umum (emoji wrapperˆ / INFOˆWARNˆERROR pino / Baileys). */
function detectLevel(line: string, fallback: RuntimeLogEntry['level']): RuntimeLogEntry['level'] {
  if (line.includes('🚨') || /(^|[\s[])⁠?(ERROR|ERR)(?=[\s:\]])/i.test(line)) return 'error';
  if (line.includes('⚠️') || /(^|[\s[])⁠?(WARN|WRN|WARNING)(?=[\s:\]])/i.test(line)) return 'warn';
  if (line.includes('🔍') || /(^|[\s[])⁠?(DEBUG|DBG)(?=[\s:\]])/i.test(line)) return 'debug';
  if (/(^|[\s[])⁠?(INFO|INF)(?=[\s:\]])/i.test(line)) return 'info';
  return fallback;
}

function ingestChunk(fallback: RuntimeLogEntry['level'], state: { pending: string }, text: string): void {
  // Kupas escape ANSI (warna pino-pretty dsb.) agar viewer web bersih.
  const clean = text.replace(/\[[0-9;]*[a-zA-Z]/g, '');
  const parts = (state.pending + clean).split(/\r?\n/);
  state.pending = parts.pop() ?? '';
  for (const part of parts) {
    const line = part.trimEnd();
    if (line.length > 0) pushLine(detectLevel(line, fallback), line);
  }
}

/**
 * Sadap stdout/stderr agar viewer web mirror terminal apa adanya —
 * termasuk pino, console.* langsung, dan Baileys yang tidak lewat log.*.
 * Tidak pernah melempar: logging tidak boleh merusak alur utama.
 */
function hookStream(stream: NodeJS.WriteStream, fallback: RuntimeLogEntry['level']): void {
  const original = stream.write.bind(stream) as (...args: unknown[]) => boolean;
  const state = { pending: '' };
  const hooked = (...args: unknown[]): boolean => {
    try {
      const chunk = args[0];
      const text = typeof chunk === 'string' ? chunk : chunk instanceof Uint8Array ? Buffer.from(chunk).toString('utf8') : '';
      if (text) ingestChunk(fallback, state, text);
    } catch {
      // Ignore — the original write still runs below.
    }
    return original(...args);
  };
  stream.write = hooked as typeof stream.write;
}

hookStream(process.stdout, 'info');
hookStream(process.stderr, 'error');

/** Salinan kronologis (tertua dulu) — aman untuk respons API. */
export function recentLogs(limit = 200): RuntimeLogEntry[] {
  return logRing.slice(-Math.max(1, Math.min(limit, LOG_RING_SIZE)));
}
// Simple logger with emoji support
export const log = {
  debug: (msg: string, obj?: object) => {
    if (shouldLog('debug')) {
      if (obj) {
        console.log('🔍', msg, obj);
      } else {
        console.log('🔍', msg);
      }
    }
  },
  info: (msg: string, obj?: object) => {
    if (shouldLog('info')) {
      if (obj) {
        console.log(msg, obj);
      } else {
        console.log(msg);
      }
    }
  },
  warn: (msg: string, obj?: object) => {
    if (shouldLog('warn')) {
      if (obj) {
        console.warn('⚠️', msg, obj);
      } else {
        console.warn('⚠️', msg);
      }
    }
  },
  error: (msg: string, obj?: object) => {
    if (shouldLog('error')) {
      if (obj) {
        console.error('🚨', msg, obj);
      } else {
        console.error('🚨', msg);
      }
    }
  },
  silent: () => {
    // No-op for backward compatibility
  },
  setLevel: (level: string) => {
    if (levelPriority[level] !== undefined) {
      (currentLevel as number) = levelPriority[level];
    }
  },
  getLevel: () => logLevel,
};

export default log;
