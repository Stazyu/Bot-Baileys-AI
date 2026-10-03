import type {
  AIToolDefinition,
  ToolExecuteFunction,
  ToolExecuteResult,
} from '../../types/tools.js';
import warningService, {
  MAX_WARNINGS,
  resolveParticipant,
  formatParticipantDisplay,
  getGroupMetadataSafely,
  getParticipantMentions,
} from '../../services/warningService.js';
import sessionManager from '../../session/sessionManager.js';

export const definition: AIToolDefinition = {
  type: 'function',
  function: {
    name: 'group_warning',
    description:
      'Beri peringatan (warning) kepada member grup yang melanggar aturan, kurangi peringatan (unwarn), reset peringatan, atau cek status peringatan. Peringatan otomatis bertambah 1 jika level tidak diisi (1 -> 2 -> 3). Jika peringatan mencapai 3, member akan otomatis dikeluarkan (kick) dari grup. Hanya admin grup atau owner bot yang diperbolehkan memberi atau menghapus peringatan.',
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description:
            'Target member yang ingin diperingatkan/dicek. Bisa berupa mention (@member), nomor telepon (misal "628123456789"), LID, atau nama member di grup.',
        },
        action: {
          type: 'string',
          description:
            'Aksi peringatan: "warn" (beri peringatan, default), "unwarn" (kurangi 1 peringatan), "reset" (hapus semua peringatan), atau "check" (cek jumlah peringatan member).',
          enum: ['warn', 'unwarn', 'reset', 'check'],
        },
        reason: {
          type: 'string',
          description:
            'Alasan peringatan, contoh: "spam", "toxic", "promosi tanpa izin", "mengirim link mencurigakan".',
        },
        level: {
          type: 'number',
          description:
            'Tingkat peringatan yang ditentukan secara eksplisit (1, 2, atau 3). Jika dikosongkan, bot otomatis menaikkan peringatan member dari hitungan saat ini. Jika level mencapai 3, member langsung di-kick.',
        },
      },
      required: ['target'],
    },
  },
};

export const execute: ToolExecuteFunction = async (args, context): Promise<ToolExecuteResult> => {
  let socket = context.socket;
  const groupId = context.fromJid;

  // Resolve live socket from sessionManager if available
  if (context.waSessionId) {
    const live = await sessionManager.getSession(context.waSessionId);
    if (live) {
      socket = live;
    }
  }

  if (!socket || !groupId || !groupId.endsWith('@g.us')) {
    return {
      success: false,
      message: 'Perintah warning hanya dapat dijalankan di dalam grup WhatsApp.',
    };
  }

  const rawTarget = typeof args.target === 'string' ? args.target.trim() : '';
  const action = typeof args.action === 'string' ? args.action.toLowerCase() : 'warn';
  const reason = typeof args.reason === 'string' ? args.reason.trim() : undefined;
  const level = typeof args.level === 'number' && Number.isFinite(args.level) ? args.level : undefined;

  const botId = socket.user?.id?.split(':')[0]?.replace(/\D/g, '');
  const botLid = socket.user?.lid?.split(':')[0]?.replace(/\D/g, '');

  const isBotJid = (jid?: string): boolean => {
    if (!jid) return false;
    const cleanDigits = jid.split(':')[0].replace(/\D/g, '');
    const jidLower = jid.toLowerCase();
    return Boolean(
      (botId && (cleanDigits === botId || jidLower.includes(botId))) ||
      (botLid && (cleanDigits === botLid || jidLower.includes(botLid)))
    );
  };

  let targetInput = rawTarget;
  let finalReason = reason;

  // If targetInput is empty or refers to the bot, check if reason contains a mention (@181277718237417)
  if ((!targetInput || isBotJid(targetInput)) && finalReason) {
    const mentionInReason = finalReason.match(/@(\d+)/);
    if (mentionInReason) {
      targetInput = `@${mentionInReason[1]}`;
      finalReason = finalReason.replace(/^.*?@\d+\s*(?:karena\s*)?/i, '').trim() || finalReason;
    }
  }

  // Resolve target input with fallback to non-bot mentions or quoted participant
  if (!targetInput || targetInput === '@' || targetInput === 'user' || targetInput === 'member' || isBotJid(targetInput)) {
    if (context.mentions && context.mentions.length > 0) {
      const nonBotMention = context.mentions.find((m) => !isBotJid(m));
      if (nonBotMention) {
        targetInput = nonBotMention;
      }
    } else if (context.quotedParticipant && !isBotJid(context.quotedParticipant)) {
      targetInput = context.quotedParticipant;
    }
  }

  if (!targetInput || isBotJid(targetInput)) {
    return {
      success: false,
      message: 'Target member tidak jelas atau berupa bot itu sendiri. Mohon sebutkan atau mention member yang ingin diperingatkan.',
    };
  }

  const adminJid = context.userId || context.fromJid || '';
  const adminLid = context.callerLid;

  try {
    if (action === 'check') {
      const metadata = await getGroupMetadataSafely(socket, groupId, context.waSessionId);
      const found = resolveParticipant(metadata.participants, targetInput, context.quotedParticipant);

      if (!found) {
        return {
          success: false,
          message: `Member "${targetInput}" tidak ditemukan di grup ini.`,
        };
      }

      const display = formatParticipantDisplay(found);
      const mentions = getParticipantMentions(found);
      const record = await warningService.getMemberWarnings(groupId, found.id);
      const count = record?.count || 0;
      const reasonsList = record?.reasons?.length ? `\nRiwayat alasan:\n• ${record.reasons.join('\n• ')}` : '';

      const checkMessage = `📋 *STATUS PERINGATAN MEMBER*\n\nMember: @${display}\nStatus: [${count}/${MAX_WARNINGS}] peringatan${reasonsList}`;
      await socket.sendMessage(groupId, {
        text: checkMessage,
        mentions,
      });

      return {
        success: true,
        message: checkMessage,
        data: { target: found.id, count, maxWarnings: MAX_WARNINGS },
      };
    }

    if (action === 'unwarn' || action === 'reset') {
      const resetAll = action === 'reset';
      let result = await warningService.unwarnMember({
        socket,
        groupId,
        targetInput,
        adminJid,
        adminLid,
        resetAll,
        quotedJid: context.quotedParticipant,
        sessionId: context.waSessionId,
      });

      if (!result.success && context.mentions && context.mentions.length > 0 && targetInput !== context.mentions[0]) {
        result = await warningService.unwarnMember({
          socket,
          groupId,
          targetInput: context.mentions[0],
          adminJid,
          adminLid,
          resetAll,
          quotedJid: context.quotedParticipant,
          sessionId: context.waSessionId,
        });
      }

      if (result.success && result.message) {
        await socket.sendMessage(groupId, {
          text: result.message,
          mentions: result.mentions || [],
        });
      }

      return {
        success: result.success,
        message: result.message,
        data: result,
      };
    }

    // Default: warn member
    let result = await warningService.warnMember({
      socket,
      groupId,
      targetInput,
      adminJid,
      adminLid,
      reason: finalReason,
      level,
      quotedJid: context.quotedParticipant,
      sessionId: context.waSessionId,
    });

    if (!result.success && context.mentions && context.mentions.length > 0 && targetInput !== context.mentions[0]) {
      const nonBotMention = context.mentions.find((m) => !isBotJid(m));
      if (nonBotMention) {
        result = await warningService.warnMember({
          socket,
          groupId,
          targetInput: nonBotMention,
          adminJid,
          adminLid,
          reason: finalReason,
          level,
          quotedJid: context.quotedParticipant,
          sessionId: context.waSessionId,
        });
      }
    }

    if (result.success && result.message) {
      await socket.sendMessage(groupId, {
        text: result.message,
        mentions: result.mentions || [],
      });
    }

    return {
      success: result.success,
      message: result.message,
      data: result,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Gagal memproses warning: ${errMsg}`,
    };
  }
};
