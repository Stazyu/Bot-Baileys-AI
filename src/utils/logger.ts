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

const currentLevel = levelPriority[logLevel] || 3;

function shouldLog(level: string): boolean {
  return currentLevel >= (levelPriority[level] || 0);
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
