import type { WASocket, GroupParticipant, GroupMetadata } from '@stazyu/baileys';
import prisma from '../database/prisma.js';
import sessionManager from '../session/sessionManager.js';
import { isOwner } from '../config/botConfig.js';
import { log } from '../utils/logger.js';
import NodeCache from 'node-cache';

const localMetadataCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

export const MAX_WARNINGS = 3;

export interface WarningResult {
  success: boolean;
  message: string;
  targetJid?: string;
  targetNumber?: string;
  targetParticipantId?: string;
  warningCount?: number;
  maxWarnings: number;
  kicked?: boolean;
  reason?: string;
  mentions?: string[];
}

export interface WarnMemberParams {
  socket: WASocket;
  groupId: string;
  targetInput: string;
  adminJid: string;
  adminLid?: string;
  reason?: string;
  level?: number;
  quotedJid?: string;
  fromMe?: boolean;
  sessionId?: string;
}

export interface UnwarnMemberParams {
  socket: WASocket;
  groupId: string;
  targetInput: string;
  adminJid: string;
  adminLid?: string;
  resetAll?: boolean;
  quotedJid?: string;
  fromMe?: boolean;
  sessionId?: string;
}

export interface WarningRecord {
  id: string;
  groupId: string;
  userId: string;
  count: number;
  reasons: string[];
  warnedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Resolve participant from group participants list given mention, phone number, LID, or quoted participant.
 */
export function resolveParticipant(
  participants: GroupParticipant[],
  targetInput: string,
  quotedJid?: string
): GroupParticipant | null {
  const trimmed = targetInput.trim();
  const cleanInput = trimmed.replace(/^@/, '').trim();
  const cleanWithoutDomain = cleanInput.split('@')[0].toLowerCase();
  const inputDigits = cleanInput.replace(/\D/g, '');

  // 1. Match by exact JID / LID / phoneNumber or username before @ (only if input is non-empty)
  if (cleanWithoutDomain.length > 0) {
    for (const p of participants) {
      const pIdUser = p.id.split('@')[0].toLowerCase();
      const pLidUser = p.lid ? p.lid.split('@')[0].toLowerCase() : '';
      const pPhoneUser = p.phoneNumber ? p.phoneNumber.split('@')[0].toLowerCase() : '';

      if (
        p.id.toLowerCase() === cleanInput.toLowerCase() ||
        (p.lid && p.lid.toLowerCase() === cleanInput.toLowerCase()) ||
        (p.phoneNumber && p.phoneNumber.toLowerCase() === cleanInput.toLowerCase()) ||
        pIdUser === cleanWithoutDomain ||
        (pLidUser.length > 0 && pLidUser === cleanWithoutDomain) ||
        (pPhoneUser.length > 0 && pPhoneUser === cleanWithoutDomain)
      ) {
        return p;
      }
    }
  }

  // 2. Match by digits (e.g. 628123456789, 08123456789, or LID digits)
  if (inputDigits.length >= 7) {
    const normalizedDigits = inputDigits.startsWith('0') ? `62${inputDigits.slice(1)}` : inputDigits;
    for (const p of participants) {
      const pIdDigits = p.id.replace(/\D/g, '');
      const pPhoneDigits = p.phoneNumber ? p.phoneNumber.replace(/\D/g, '') : '';
      const pLidDigits = p.lid ? p.lid.replace(/\D/g, '') : '';
      if (
        pIdDigits === normalizedDigits ||
        pPhoneDigits === normalizedDigits ||
        pLidDigits === normalizedDigits ||
        pIdDigits === inputDigits ||
        pPhoneDigits === inputDigits ||
        pLidDigits === inputDigits
      ) {
        return p;
      }
    }
  }

  // 3. Quoted message fallback if input is empty or target was from quote
  if (quotedJid) {
    const quotedClean = quotedJid.trim().toLowerCase();
    const quotedUser = quotedClean.split('@')[0];
    const quotedDigits = quotedClean.replace(/\D/g, '');
    for (const p of participants) {
      const pIdUser = p.id.split('@')[0].toLowerCase();
      const pLidUser = p.lid ? p.lid.split('@')[0].toLowerCase() : '';
      const pPhoneUser = p.phoneNumber ? p.phoneNumber.split('@')[0].toLowerCase() : '';

      if (
        p.id.toLowerCase() === quotedClean ||
        (p.lid && p.lid.toLowerCase() === quotedClean) ||
        (p.phoneNumber && p.phoneNumber.toLowerCase() === quotedClean) ||
        pIdUser === quotedUser ||
        pLidUser === quotedUser ||
        pPhoneUser === quotedUser
      ) {
        return p;
      }
      if (quotedDigits.length >= 7) {
        const pIdDigits = p.id.replace(/\D/g, '');
        const pPhoneDigits = p.phoneNumber ? p.phoneNumber.replace(/\D/g, '') : '';
        const pLidDigits = p.lid ? p.lid.replace(/\D/g, '') : '';
        if (pIdDigits === quotedDigits || pPhoneDigits === quotedDigits || pLidDigits === quotedDigits) {
          return p;
        }
      }
    }
  }

  // 4. Name / notify fallback (case-insensitive substring match)
  if (cleanInput.length >= 3) {
    const lowerInput = cleanInput.toLowerCase();
    for (const p of participants) {
      if (p.name && (p.name.toLowerCase().includes(lowerInput) || lowerInput.includes(p.name.toLowerCase()))) {
        return p;
      }
      if (p.notify && (p.notify.toLowerCase().includes(lowerInput) || lowerInput.includes(p.notify.toLowerCase()))) {
        return p;
      }
    }
  }

  return null;
}

/**
 * Check if the caller has admin permissions in the group.
 */
export function isCallerAdmin(
  participants: GroupParticipant[],
  callerJid: string,
  fromMe = false,
  callerLid?: string
): boolean {
  if (fromMe || isOwner(callerJid) || (callerLid && isOwner(callerLid))) {
    return true;
  }
  const callerDigits = callerJid.replace(/\D/g, '');
  const callerLidDigits = callerLid ? callerLid.replace(/\D/g, '') : '';
  const participant = participants.find((p) => {
    if (
      p.id === callerJid ||
      p.lid === callerJid ||
      p.phoneNumber === callerJid ||
      (callerLid && (p.id === callerLid || p.lid === callerLid || p.phoneNumber === callerLid))
    ) {
      return true;
    }
    const pIdDigits = p.id.replace(/\D/g, '');
    const pPhoneDigits = p.phoneNumber ? p.phoneNumber.replace(/\D/g, '') : '';
    const pLidDigits = p.lid ? p.lid.replace(/\D/g, '') : '';

    if (callerDigits.length >= 7) {
      if (pIdDigits === callerDigits || pPhoneDigits === callerDigits || pLidDigits === callerDigits) {
        return true;
      }
    }
    if (callerLidDigits.length >= 7) {
      if (pIdDigits === callerLidDigits || pPhoneDigits === callerLidDigits || pLidDigits === callerLidDigits) {
        return true;
      }
    }
    return false;
  });

  return participant ? participant.admin === 'admin' || participant.admin === 'superadmin' : false;
}

/**
 * Check if the bot itself is an admin in the group.
 */
export function isBotAdmin(
  participants: GroupParticipant[],
  botUserId?: string,
  botLid?: string
): boolean {
  const botUserNum = botUserId?.split(':')[0]?.replace(/\D/g, '');
  const botLidNum = botLid?.split(':')[0]?.replace(/\D/g, '');

  const botParticipant = participants.find((p) => {
    if (botUserNum && (p.id.replace(/\D/g, '') === botUserNum || p.phoneNumber?.replace(/\D/g, '') === botUserNum)) {
      return true;
    }
    if (botLidNum && (p.id.replace(/\D/g, '') === botLidNum || p.lid?.replace(/\D/g, '') === botLidNum)) {
      return true;
    }
    return false;
  });

  return botParticipant ? botParticipant.admin === 'admin' || botParticipant?.admin === 'superadmin' : false;
}

/**
 * Format participant display number or tag.
 * Returns participant.id without domain so @[display] in message text
 * perfectly matches participant.id in WhatsApp's mentions array.
 */
export function formatParticipantDisplay(participant: GroupParticipant): string {
  return participant.id.split('@')[0];
}

/**
 * Get all matching JID formats for a participant (id, lid, phoneNumber).
 */
export function getParticipantMentions(participant: GroupParticipant): string[] {
  return Array.from(
    new Set(
      [
        participant.id,
        participant.lid,
        participant.phoneNumber,
      ].filter((j): j is string => typeof j === 'string' && j.length > 0)
    )
  );
}

/**
 * Fetch group metadata with caching and reconnection fallback.
 */
export async function getGroupMetadataSafely(
  socket: WASocket,
  groupId: string,
  sessionId?: string
): Promise<GroupMetadata> {
  // 1. Check local cache
  const localCached = localMetadataCache.get<GroupMetadata>(groupId);
  if (localCached && localCached.participants && localCached.participants.length > 0) {
    return localCached;
  }

  // 2. Check sessionManager cache
  const smCached = sessionManager.getGroupMetadata(groupId);
  if (smCached && smCached.participants && smCached.participants.length > 0) {
    localMetadataCache.set(groupId, smCached);
    return smCached;
  }

  // 3. Resolve active live socket
  let liveSocket = socket;
  if (sessionId) {
    const active = await sessionManager.getSession(sessionId);
    if (active) liveSocket = active;
  }

  // 4. Query with retry
  try {
    const metadata = await liveSocket.groupMetadata(groupId);
    if (metadata && metadata.participants) {
      localMetadataCache.set(groupId, metadata);
      sessionManager.setGroupMetadata(groupId, metadata);
      return metadata;
    }
  } catch (err: unknown) {
    log.warn(
      `[WarningService] ⚠️ groupMetadata fetch failed: ${err instanceof Error ? err.message : String(err)}. Falling back to cache...`
    );
    const fallback = sessionManager.getGroupMetadata(groupId) || localMetadataCache.get<GroupMetadata>(groupId);
    if (fallback && fallback.participants) {
      return fallback;
    }
    // Retry once with refreshed socket from sessionManager if available
    if (sessionId) {
      const refreshed = await sessionManager.getSession(sessionId);
      if (refreshed && refreshed !== liveSocket) {
        const metadata = await refreshed.groupMetadata(groupId);
        localMetadataCache.set(groupId, metadata);
        sessionManager.setGroupMetadata(groupId, metadata);
        return metadata;
      }
    }
    throw err;
  }

  throw new Error(`Gagal memuat informasi grup ${groupId}`);
}

class WarningService {
  /**
   * Warn a group member.
   * Auto-increments or sets explicitly to level.
   * Kicks member when warning reaches MAX_WARNINGS (3).
   */
  async warnMember(params: WarnMemberParams): Promise<WarningResult> {
    const { socket, groupId, targetInput, adminJid, adminLid, reason, level, quotedJid, fromMe, sessionId } = params;

    if (!groupId.endsWith('@g.us')) {
      return {
        success: false,
        message: '❌ Fitur warning hanya bisa digunakan di dalam grup.',
        maxWarnings: MAX_WARNINGS,
      };
    }

    try {
      const metadata = await getGroupMetadataSafely(socket, groupId, sessionId);
      const participants = metadata.participants;

      // 1. Check if caller is admin or owner
      const callerHasPermission = isCallerAdmin(participants, adminJid, fromMe, adminLid);
      if (!callerHasPermission) {
        return {
          success: false,
          message: '❌ Hanya admin grup atau owner bot yang dapat memberikan peringatan.',
          maxWarnings: MAX_WARNINGS,
        };
      }

      // 2. Resolve target participant
      const targetParticipant = resolveParticipant(participants, targetInput, quotedJid);
      if (!targetParticipant) {
        return {
          success: false,
          message: `❌ Member "${targetInput}" tidak ditemukan di grup ini. Pastikan mention (@member), ketik nomor teleponnya, atau reply pesannya.`,
          maxWarnings: MAX_WARNINGS,
        };
      }

      const targetId = targetParticipant.id;
      const targetDisplay = formatParticipantDisplay(targetParticipant);
      const targetMentions = getParticipantMentions(targetParticipant);

      // 3. Validation: Cannot warn bot itself
      const botId = socket.user?.id;
      const botLid = socket.user?.lid;
      const botNum = botId?.split(':')[0]?.replace(/\D/g, '');
      const botLidNum = botLid?.split(':')[0]?.replace(/\D/g, '');
      const targetNum = targetDisplay.replace(/\D/g, '');
      const targetIdLower = targetId.toLowerCase();

      const isBotSelf =
        Boolean(
          (botNum && (targetNum === botNum || targetIdLower.includes(botNum))) ||
          (botLidNum && (targetNum === botLidNum || targetIdLower.includes(botLidNum))) ||
          (botId && targetIdLower.includes(botId.split(':')[0].toLowerCase())) ||
          (botLid && targetIdLower.includes(botLid.split(':')[0].toLowerCase()))
        );

      if (isBotSelf) {
        return {
          success: false,
          message: '❌ Bot tidak bisa memberi peringatan kepada dirinya sendiri.',
          maxWarnings: MAX_WARNINGS,
        };
      }

      // 4. Validation: Cannot warn group admin/superadmin
      if (targetParticipant.admin === 'admin' || targetParticipant.admin === 'superadmin') {
        return {
          success: false,
          message: `❌ @${targetDisplay} adalah admin grup, tidak dapat diberikan peringatan.`,
          maxWarnings: MAX_WARNINGS,
          mentions: targetMentions,
        };
      }

      // 5. Validation: Cannot warn bot owner
      if (isOwner(targetId) || isOwner(targetParticipant.phoneNumber || '')) {
        return {
          success: false,
          message: `❌ @${targetDisplay} adalah owner bot, tidak dapat diberikan peringatan.`,
          maxWarnings: MAX_WARNINGS,
          mentions: targetMentions,
        };
      }

      // 6. Calculate new warning count
      const existing = await prisma.groupWarning.findUnique({
        where: {
          groupId_userId: {
            groupId,
            userId: targetId,
          },
        },
      });

      const currentCount = existing?.count || 0;
      let newCount: number;

      if (typeof level === 'number' && Number.isFinite(level) && level > 0) {
        newCount = Math.min(MAX_WARNINGS, Math.floor(level));
      } else {
        newCount = currentCount + 1;
      }

      const reasonText = reason?.trim() || 'Melanggar aturan grup';
      const updatedReasons = existing ? [...existing.reasons, reasonText] : [reasonText];

      // 7. Check if count reaches MAX_WARNINGS (3)
      if (newCount >= MAX_WARNINGS) {
        const botIsAdmin = isBotAdmin(participants, botId, botLid);

        if (!botIsAdmin) {
          // Update DB with max count but inform that bot lacks admin rights to kick
          await prisma.groupWarning.upsert({
            where: {
              groupId_userId: {
                groupId,
                userId: targetId,
              },
            },
            create: {
              groupId,
              userId: targetId,
              count: MAX_WARNINGS,
              reasons: updatedReasons,
              warnedBy: adminJid,
            },
            update: {
              count: MAX_WARNINGS,
              reasons: updatedReasons,
              warnedBy: adminJid,
            },
          });

          return {
            success: true,
            warningCount: MAX_WARNINGS,
            maxWarnings: MAX_WARNINGS,
            targetJid: targetId,
            targetNumber: targetDisplay,
            targetParticipantId: targetId,
            kicked: false,
            reason: reasonText,
            mentions: targetMentions,
            message: `⚠️ *PERINGATAN ${MAX_WARNINGS}/${MAX_WARNINGS}*\n\nMember: @${targetDisplay}\nAlasan: ${reasonText}\n\n⚠️ Member telah mencapai batas peringatan (3/3), namun *bot bukan admin grup* sehingga tidak dapat mengeluarkan member. Mohon admin mengeluarkan member ini secara manual.`,
          };
        }

        // Kick member
        try {
          const liveSocket = (sessionId ? await sessionManager.getSession(sessionId) : null) || socket;
          await liveSocket.groupParticipantsUpdate(groupId, [targetId], 'remove');
          log.info(`[WarningService] 👢 Member @${targetDisplay} kicked from ${groupId} after reaching ${MAX_WARNINGS} warnings.`);

          // Reset warnings after successful kick
          await prisma.groupWarning.deleteMany({
            where: {
              groupId,
              userId: targetId,
            },
          }).catch(() => {});

          return {
            success: true,
            warningCount: MAX_WARNINGS,
            maxWarnings: MAX_WARNINGS,
            targetJid: targetId,
            targetNumber: targetDisplay,
            targetParticipantId: targetId,
            kicked: true,
            reason: reasonText,
            mentions: targetMentions,
            message: `🚨 *PERINGATAN ${MAX_WARNINGS}/${MAX_WARNINGS} (FINAL)* 🚨\n\nMember: @${targetDisplay}\nAlasan: ${reasonText}\n\n⛔ Batas peringatan telah habis (3/3). Member langsung dikeluarkan dari grup.`,
          };
        } catch (kickError: unknown) {
          const errMsg = kickError instanceof Error ? kickError.message : String(kickError);
          log.error(`[WarningService] ❌ Failed to kick @${targetDisplay}:`, kickError as object);

          return {
            success: true,
            warningCount: MAX_WARNINGS,
            maxWarnings: MAX_WARNINGS,
            targetJid: targetId,
            targetNumber: targetDisplay,
            targetParticipantId: targetId,
            kicked: false,
            reason: reasonText,
            mentions: targetMentions,
            message: `⚠️ *PERINGATAN ${MAX_WARNINGS}/${MAX_WARNINGS}*\n\nMember: @${targetDisplay}\nAlasan: ${reasonText}\n\n❌ Gagal mengeluarkan member: ${errMsg}`,
          };
        }
      }

      // 8. Warning 1 or 2: Save to database
      await prisma.groupWarning.upsert({
        where: {
          groupId_userId: {
            groupId,
            userId: targetId,
          },
        },
        create: {
          groupId,
          userId: targetId,
          count: newCount,
          reasons: updatedReasons,
          warnedBy: adminJid,
        },
        update: {
          count: newCount,
          reasons: updatedReasons,
          warnedBy: adminJid,
        },
      });

      log.info(`[WarningService] ⚠️ Member @${targetDisplay} received warning ${newCount}/${MAX_WARNINGS} in ${groupId}`);

      return {
        success: true,
        warningCount: newCount,
        maxWarnings: MAX_WARNINGS,
        targetJid: targetId,
        targetNumber: targetDisplay,
        targetParticipantId: targetId,
        kicked: false,
        reason: reasonText,
        mentions: targetMentions,
        message: `⚠️ *PERINGATAN [${newCount}/${MAX_WARNINGS}]*\n\nMember: @${targetDisplay}\nAlasan: ${reasonText}\n\nIngat, jika mencapai *3 peringatan* kamu akan otomatis dikeluarkan dari grup!`,
      };
    } catch (error: unknown) {
      log.error(`[WarningService] ❌ Error in warnMember:`, error as object);
      return {
        success: false,
        message: `❌ Terjadi kesalahan saat memproses peringatan: ${error instanceof Error ? error.message : 'Unknown error'}`,
        maxWarnings: MAX_WARNINGS,
      };
    }
  }

  /**
   * Remove warning or reset warning for a member.
   */
  async unwarnMember(params: UnwarnMemberParams): Promise<WarningResult> {
    const { socket, groupId, targetInput, adminJid, adminLid, resetAll, quotedJid, fromMe, sessionId } = params;

    if (!groupId.endsWith('@g.us')) {
      return {
        success: false,
        message: '❌ Fitur warning hanya bisa digunakan di dalam grup.',
        maxWarnings: MAX_WARNINGS,
      };
    }

    try {
      const metadata = await getGroupMetadataSafely(socket, groupId, sessionId);
      const participants = metadata.participants;

      const callerHasPermission = isCallerAdmin(participants, adminJid, fromMe, adminLid);
      if (!callerHasPermission) {
        return {
          success: false,
          message: '❌ Hanya admin grup atau owner bot yang dapat menghapus peringatan.',
          maxWarnings: MAX_WARNINGS,
        };
      }

      const targetParticipant = resolveParticipant(participants, targetInput, quotedJid);
      if (!targetParticipant) {
        return {
          success: false,
          message: `❌ Member "${targetInput}" tidak ditemukan di grup ini.`,
          maxWarnings: MAX_WARNINGS,
        };
      }

      const targetId = targetParticipant.id;
      const targetDisplay = formatParticipantDisplay(targetParticipant);
      const targetMentions = getParticipantMentions(targetParticipant);

      const existing = await prisma.groupWarning.findUnique({
        where: {
          groupId_userId: {
            groupId,
            userId: targetId,
          },
        },
      });

      if (!existing || existing.count === 0) {
        return {
          success: true,
          warningCount: 0,
          maxWarnings: MAX_WARNINGS,
          targetJid: targetId,
          targetNumber: targetDisplay,
          mentions: targetMentions,
          message: `ℹ️ Member @${targetDisplay} saat ini tidak memiliki peringatan aktif.`,
        };
      }

      if (resetAll || existing.count <= 1) {
        await prisma.groupWarning.delete({
          where: {
            groupId_userId: {
              groupId,
              userId: targetId,
            },
          },
        });

        return {
          success: true,
          warningCount: 0,
          maxWarnings: MAX_WARNINGS,
          targetJid: targetId,
          targetNumber: targetDisplay,
          mentions: targetMentions,
          message: `✅ Seluruh peringatan untuk @${targetDisplay} telah dihapus (0/${MAX_WARNINGS}).`,
        };
      }

      const newCount = existing.count - 1;
      await prisma.groupWarning.update({
        where: {
          groupId_userId: {
            groupId,
            userId: targetId,
          },
        },
        data: {
          count: newCount,
        },
      });

      return {
        success: true,
        warningCount: newCount,
        maxWarnings: MAX_WARNINGS,
        targetJid: targetId,
        targetNumber: targetDisplay,
        mentions: targetMentions,
        message: `✅ Peringatan untuk @${targetDisplay} dikurangi 1 menjadi [${newCount}/${MAX_WARNINGS}].`,
      };
    } catch (error: unknown) {
      log.error(`[WarningService] ❌ Error in unwarnMember:`, error as object);
      return {
        success: false,
        message: `❌ Terjadi kesalahan saat menghapus peringatan: ${error instanceof Error ? error.message : 'Unknown error'}`,
        maxWarnings: MAX_WARNINGS,
      };
    }
  }

  /**
   * Get all warnings for a specific group.
   */
  async getGroupWarnings(groupId: string): Promise<WarningRecord[]> {
    try {
      return await prisma.groupWarning.findMany({
        where: { groupId },
        orderBy: { updatedAt: 'desc' },
      });
    } catch (error: unknown) {
      log.error(`[WarningService] ❌ Error fetching group warnings:`, error as object);
      return [];
    }
  }

  /**
   * Get warning status of a specific member in a group.
   */
  async getMemberWarnings(groupId: string, userId: string): Promise<WarningRecord | null> {
    try {
      return await prisma.groupWarning.findUnique({
        where: {
          groupId_userId: {
            groupId,
            userId,
          },
        },
      });
    } catch (error: unknown) {
      log.error(`[WarningService] ❌ Error fetching member warnings:`, error as object);
      return null;
    }
  }
}

const warningService = new WarningService();
export default warningService;
