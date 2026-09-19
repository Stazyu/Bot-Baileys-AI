import { log } from './logger.js';
import { extractTextFromMessage } from './messageHelper.js';
import type { proto } from '@stazyu/baileys';
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  code?: ValidationCode;
}

export type ValidationCode =
  | 'NO_MESSAGE'
  | 'INVALID_JID'
  | 'EMPTY_BODY'
  | 'BODY_TOO_LONG'
  | 'TIMESTAMP_INVALID'
  | 'TIMESTAMP_TOO_OLD'
  | 'TIMESTAMP_FROM_FUTURE'
  | 'FROM_ME_IGNORED'
  | 'DUPLICATE_MESSAGE';

export interface ValidationOptions {
  /** Maximum allowed message body length (default: 65536) */
  maxBodyLength?: number;
  /** Maximum allowed message age in seconds before rejecting (default: 300 = 5 min) */
  maxMessageAgeSeconds?: number;
  /** Maximum allowed future timestamp offset in seconds (default: 30) */
  maxFutureOffsetSeconds?: number;
  /** Whether to allow self-sent messages (fromMe) through (default: false) */
  allowSelfMessages?: boolean;
}

const DEFAULT_OPTIONS: Required<ValidationOptions> = {
  maxBodyLength: 65536,
  maxMessageAgeSeconds: 300,
  maxFutureOffsetSeconds: 30,
  allowSelfMessages: false,
};

/**
 * Track recently seen message IDs to detect duplicates.
 * Uses a simple in-memory Map with TTL cleanup.
 */
const recentMessageIds = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 5000; // 5 seconds

// Periodic cleanup to prevent memory leaks (unref'd: never keeps process alive)
const duplicateSweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of recentMessageIds) {
    if (now - ts > DUPLICATE_WINDOW_MS * 2) {
      recentMessageIds.delete(id);
    }
  }
}, 60_000);
if (typeof duplicateSweepTimer.unref === 'function') duplicateSweepTimer.unref();

/**
 * Stop the duplicate-ID sweep timer (mainly for tests).
 */
export function stopValidatorCleanup(): void {
  clearInterval(duplicateSweepTimer);
}

/**
 * Human-readable text of a message payload, wrapped containers included.
 */
function extractMessageBody(message: proto.IMessage | null | undefined): string | null {
  return extractTextFromMessage(message);
}

/**
 * Check if a JID string appears to be a valid WhatsApp JID.
 */
function isValidJid(jid: string | null | undefined): boolean {
  if (!jid || typeof jid !== 'string') return false;
  // Basic pattern: numbers@s.whatsapp.net, numbers@g.us, numbers@broadcast, numbers@lid
  // JIDs starting with 'status@broadcast' are internal status messages
  if (jid === 'status@broadcast') return false;
  return /^[\d\w\-]+@(s\.whatsapp\.net|g\.us|broadcast|newsletter|lid)$/.test(jid);
}

/**
 * Validate an incoming WAMessage before processing.
 *
 * @param msg - The raw WAMessage object from Baileys
 * @param options - Optional overrides for validation thresholds
 * @returns ValidationResult with `valid: true` or `valid: false` plus reason
 */
export function validateMessage(
  msg: proto.IWebMessageInfo,
  options?: ValidationOptions,
): ValidationResult {
  const opts: Required<ValidationOptions> = { ...DEFAULT_OPTIONS, ...options };

  // ── 1. Must have a message object ──────────────────────────────────────
  if (!msg.message || typeof msg.message !== 'object') {
    return { valid: false, reason: 'Message object is empty', code: 'NO_MESSAGE' };
  }

  // ── 2. Must have a valid key ──────────────────────────────────────────
  if (!msg.key || typeof msg.key !== 'object') {
    return { valid: false, reason: 'Message key is missing', code: 'NO_MESSAGE' };
  }

  const remoteJid = msg.key.remoteJid;
  if (!isValidJid(remoteJid)) {
    return { valid: false, reason: `Invalid remoteJid: ${remoteJid}`, code: 'INVALID_JID' };
  }

  const participant = msg.key.participant;
  if (participant && !isValidJid(participant)) {
    return { valid: false, reason: `Invalid participant JID: ${participant}`, code: 'INVALID_JID' };
  }

  // ── 3. Ignore self-sent messages unless allowed ───────────────────────
  if (msg.key.fromMe === true && !opts.allowSelfMessages) {
    return { valid: false, reason: 'Self-sent message ignored', code: 'FROM_ME_IGNORED' };
  }

  // ── 4. Duplicate message detection ────────────────────────────────────
  const msgId = msg.key.id;
  if (msgId) {
    const lastSeen = recentMessageIds.get(msgId);
    const now = Date.now();
    if (lastSeen && now - lastSeen < DUPLICATE_WINDOW_MS) {
      return { valid: false, reason: 'Duplicate message ID', code: 'DUPLICATE_MESSAGE' };
    }
    recentMessageIds.set(msgId, now);
  }

  // ── 5. Body content validation ────────────────────────────────────────
  const body = extractMessageBody(msg.message);
  if (body !== null) {
    if (body.length === 0) {
      return { valid: false, reason: 'Message body is empty', code: 'EMPTY_BODY' };
    }
    if (body.length > opts.maxBodyLength) {
      return {
        valid: false,
        reason: `Message body exceeds ${opts.maxBodyLength} characters`,
        code: 'BODY_TOO_LONG',
      };
    }
  }
  // ── 6. Timestamp validation ──────────────────────────────────────────
  const timestamp = msg.messageTimestamp;
  if (timestamp !== undefined && timestamp !== null) {
    const tsMs = Number(timestamp) * 1000;
    if (!Number.isFinite(tsMs)) {
      return { valid: false, reason: 'Message timestamp is not a number', code: 'TIMESTAMP_INVALID' };
    }
    const nowMs = Date.now();
    // Reject messages with timestamps more than `maxMessageAgeSeconds` in the past
    if (nowMs - tsMs > opts.maxMessageAgeSeconds * 1000) {
      return {
        valid: false,
        reason: `Message timestamp is too old (>${opts.maxMessageAgeSeconds}s)`,
        code: 'TIMESTAMP_TOO_OLD',
      };
    }

    // Reject messages with timestamps significantly in the future (clock skew tolerance)
    if (tsMs - nowMs > opts.maxFutureOffsetSeconds * 1000) {
      return {
        valid: false,
        reason: `Message timestamp is from the future (>${opts.maxFutureOffsetSeconds}s ahead)`,
        code: 'TIMESTAMP_FROM_FUTURE',
      };
    }
  }

  return { valid: true };
}

/**
 * Validate a JID string independently.
 */
export function validateJid(jid: string | null | undefined): ValidationResult {
  if (!jid || typeof jid !== 'string') {
    return { valid: false, reason: 'JID is empty', code: 'INVALID_JID' };
  }
  if (!isValidJid(jid)) {
    return { valid: false, reason: `Invalid JID format: ${jid}`, code: 'INVALID_JID' };
  }
  return { valid: true };
}
