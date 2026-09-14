import { log } from './logger.js';

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining cooldown in milliseconds (0 if allowed) */
  remainingMs: number;
  /** When the cooldown expires (epoch ms, 0 if allowed) */
  expiresAt: number;
}

export interface RateLimitConfig {
  /** Default cooldown in seconds for commands without explicit cooldown (default: 3) */
  defaultCooldownSec: number;
  /** Cooldown for non-command messages (AI mode, auto-reply, etc.) in seconds (default: 2) */
  messageCooldownSec: number;
  /** Whether to apply cooldown globally (by user across all commands) or per-command (default: false) */
  globalCooldown: boolean;
  /** Max number of unique command entries per user before pruning (default: 50) */
  maxEntriesPerUser: number;
}

const DEFAULT_CONFIG: Required<RateLimitConfig> = {
  defaultCooldownSec: 3,
  messageCooldownSec: 2,
  globalCooldown: false,
  maxEntriesPerUser: 50,
};

/**
 * In-memory rate limiter that tracks per-user (and optionally per-command) cooldowns.
 *
 * Storage structure:
 *   Map<userId, Map<actionKey, expiresAt>>
 *
 * Where actionKey is either 'GLOBAL' (for global cooldown) or the command name.
 */
class RateLimiter {
  private store: Map<string, Map<string, number>> = new Map();
  private config: Required<RateLimitConfig>;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // NOTE: periodic sweep is opt-in via startAutoCleanup() (unref'd timer).
    // The constructor must not start a ref'd interval — it would hold the
    // event loop open and prevent clean exit / hang test runners.
  }

  /**
   * Check if an action is allowed for a user.
   *
   * @param userId - The user's JID (or any unique identifier)
   * @param actionKey - 'GLOBAL' for global rate limit, or a command name for per-command
   * @param cooldownSec - Optional override cooldown in seconds
   * @returns RateLimitResult indicating whether the action is allowed
   */
  check(userId: string, actionKey: string, cooldownSec?: number): RateLimitResult {
    const now = Date.now();
    const key = this.config.globalCooldown ? 'GLOBAL' : actionKey;
    const cooldown = cooldownSec ?? this.config.defaultCooldownSec;
    const cooldownMs = cooldown * 1000;

    // Get or create per-user store
    let userEntries = this.store.get(userId);
    if (!userEntries) {
      userEntries = new Map<string, number>();
      this.store.set(userId, userEntries);
    }

    const expiresAt = userEntries.get(key);

    // If there's an active cooldown
    if (expiresAt !== undefined) {
      const remaining = expiresAt - now;
      if (remaining > 0) {
        return {
          allowed: false,
          remainingMs: remaining,
          expiresAt,
        };
      }
    }

    // Allow the action and set cooldown
    userEntries.set(key, now + cooldownMs);

    // Prune old entries if over limit
    if (userEntries.size > this.config.maxEntriesPerUser) {
      this.pruneUserEntries(userId, userEntries);
    }

    return {
      allowed: true,
      remainingMs: 0,
      expiresAt: now + cooldownMs,
    };
  }

  /**
   * Start periodic sweep of expired entries. Idempotent — safe to call twice.
   * Timer is unref'd so it never keeps the process alive on its own.
   */
  startAutoCleanup(intervalMs = 60_000): void {
    if (this.cleanupTimer) return;
    const timer = setInterval(() => {
      try {
        this.cleanup();
      } catch (error) {
        log.debug(`🧹 [RateLimiter] Cleanup sweep failed: ${(error as Error).message}`);
      }
    }, intervalMs);
    // Don't hold the event loop open for a housekeeping timer
    if (typeof timer.unref === 'function') timer.unref();
    this.cleanupTimer = timer;
  }

  /**
   * Stop the periodic sweep (mainly for tests).
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /** Ubah cooldown runtime (dipanggil PATCH /api/settings). */
  configure(patch: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /**
   * Check if a non-command message action is allowed for a user (e.g., AI mode, auto-reply).
   */

  checkMessage(userId: string): RateLimitResult {
    return this.check(userId, '__MESSAGE__', this.config.messageCooldownSec);
  }

  /**
   * Reset the cooldown for a specific user+action combination.
   */
  reset(userId: string, actionKey?: string): void {
    const userEntries = this.store.get(userId);
    if (!userEntries) return;

    if (actionKey) {
      const key = this.config.globalCooldown ? 'GLOBAL' : actionKey;
      userEntries.delete(key);
    } else {
      userEntries.clear();
    }

    if (userEntries.size === 0) {
      this.store.delete(userId);
    }
  }

  /**
   * Get remaining cooldown for a user+action (in ms). Returns 0 if no cooldown active.
   */
  getRemaining(userId: string, actionKey: string): number {
    const key = this.config.globalCooldown ? 'GLOBAL' : actionKey;
    const userEntries = this.store.get(userId);
    if (!userEntries) return 0;

    const expiresAt = userEntries.get(key);
    if (!expiresAt) return 0;

    const remaining = expiresAt - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Update configuration at runtime.
   */
  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
    log.info(`🔄 [RateLimiter] Configuration updated`);
  }

  /**
   * Get current count of tracked users (for monitoring).
   */
  getStats(): { userCount: number; totalEntries: number } {
    let totalEntries = 0;
    for (const [, entries] of this.store) {
      totalEntries += entries.size;
    }
    return {
      userCount: this.store.size,
      totalEntries,
    };
  }

  /**
   * Remove expired entries to prevent unbounded memory growth.
   */
  private cleanup(): void {
    const now = Date.now();
    let removedUsers = 0;
    let removedEntries = 0;

    for (const [userId, entries] of this.store) {
      for (const [key, expiresAt] of entries) {
        if (now >= expiresAt) {
          entries.delete(key);
          removedEntries++;
        }
      }
      if (entries.size === 0) {
        this.store.delete(userId);
        removedUsers++;
      }
    }

    if (removedEntries > 0 || removedUsers > 0) {
      log.debug(`🧹 [RateLimiter] Cleaned up ${removedEntries} expired entries and ${removedUsers} users`);
    }
  }

  /**
   * Prune the oldest entries when a user exceeds maxEntriesPerUser.
   */
  private pruneUserEntries(userId: string, entries: Map<string, number>): void {
    const sorted = [...entries.entries()].sort((a, b) => a[1] - b[1]);
    const toRemove = sorted.slice(0, sorted.length - this.config.maxEntriesPerUser);

    for (const [key] of toRemove) {
      entries.delete(key);
    }
  }
}

// Singleton instance (auto-cleanup keeps memory bounded across many users)
export const rateLimiter = new RateLimiter();
rateLimiter.startAutoCleanup();

export default rateLimiter;
