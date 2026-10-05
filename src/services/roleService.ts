/**
 * ──────────────────────────────────────────────
 *  ROLE SERVICE — local sender role verification
 * ──────────────────────────────────────────────
 *
 * Roles (owner / group admin / member) are verified bot-side using real
 * WhatsApp metadata (owner config + group metadata), NEVER from chat text claims.
 *
 * Privacy principle: real identities (phone number / LID / JID) are NEVER sent
 * to the AI. Only the role label ("OWNER", "ADMIN GRUP", "MEMBER") is injected
 * into the prompt — sufficient for appropriate AI behavior without leaking PII.
 */

import type { WASocket, GroupParticipant } from '@stazyu/baileys';
import { getOwnerNumbers } from '../config/botConfig.js';
import { resolveParticipant } from './warningService.js';

export type SenderRole = 'owner' | 'admin' | 'member';

/**
 * Match identities EXACTLY (not substring) — full JID format
 * ("628xx@s.whatsapp.net" / "123@lid") or user-part digits only.
 */
function identityMatches(configured: string, jid: string): boolean {
  const a = configured.toLowerCase();
  const b = jid.toLowerCase();
  if (a === b) return true;
  const aDigits = a.split('@')[0].replace(/\D/g, '');
  const bDigits = b.split('@')[0].replace(/\D/g, '');
  return aDigits.length > 0 && aDigits === bDigits;
}

function isVerifiedOwner(...jids: Array<string | undefined | null>): boolean {
  const owners = getOwnerNumbers();
  return jids.some((j) => {
    if (!j) return false;
    return owners.some((o) => identityMatches(o, j));
  });
}

/**
 * Role for private chats: owner | member (no group metadata lookup needed).
 * callerLid covers accounts hiding their phone number (@lid addressing).
 */
export function resolvePrivateRole(userId: string, callerLid?: string): SenderRole {
  return isVerifiedOwner(userId, callerLid) ? 'owner' : 'member';
}

// Short group metadata cache to avoid spamming calls on rapid messages.
const metaCache = new Map<string, { participants: GroupParticipant[]; at: number }>();
const META_TTL_MS = 60_000;

async function getParticipants(socket: WASocket, groupJid: string): Promise<GroupParticipant[]> {
  const cached = metaCache.get(groupJid);
  if (cached && Date.now() - cached.at < META_TTL_MS) return cached.participants;
  const meta = await socket.groupMetadata(groupJid);
  metaCache.set(groupJid, { participants: meta.participants, at: Date.now() });
  return meta.participants;
}

/**
 * Verify sender role: owner (config) > group admin (group metadata) > member.
 * All failure modes fall back to 'member' (fail-safe: nobody gets elevated).
 */
export async function resolveSenderRole(
  socket: WASocket | undefined,
  opts: {
    userId: string;
    callerLid?: string;
    groupJid?: string;
    fromMe?: boolean;
  }
): Promise<SenderRole> {
  const { userId, callerLid, groupJid, fromMe } = opts;

  // fromMe = sent from the bot/owner's own account (any device) -> definitely owner.
  if (fromMe || isVerifiedOwner(userId, callerLid)) return 'owner';
  if (!groupJid || !socket) return 'member';

  try {
    const participants = await getParticipants(socket, groupJid);
    const p =
      resolveParticipant(participants, userId) ??
      (callerLid ? resolveParticipant(participants, callerLid) : null);
    return p?.admin === 'admin' || p?.admin === 'superadmin' ? 'admin' : 'member';
  } catch {
    return 'member';
  }
}
