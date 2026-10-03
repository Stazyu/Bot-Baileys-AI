import type { CommandModule, CommandContext } from '../../types/index.js';
import warningService, {
  MAX_WARNINGS,
  resolveParticipant,
  formatParticipantDisplay,
  getGroupMetadataSafely,
  getParticipantMentions,
} from '../../services/warningService.js';

const warnCommand: CommandModule = {
  config: {
    name: 'warn',
    aliases: ['warning', 'peringatan', 'unwarn', 'warnlist', 'warnings'],
    description: 'Beri peringatan (1-3) ke member grup, reset, atau lihat daftar peringatan (admin only)',
    usage: '!warn @user [alasan] | !warn 1 @user | !unwarn @user | !warnlist',
    category: 'group',
    adminOnly: true,
    groupOnly: true,
  },
  handler: async function (context: CommandContext, args: string[]): Promise<void> {
    const isGroup = context.fromJid.endsWith('@g.us');
    if (!isGroup) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Perintah ini hanya bisa digunakan di dalam grup.',
      });
      return;
    }

    const commandName = context.simplified?.command?.toLowerCase() || 'warn';
    const adminJid = context.simplified?.user_id || context.fromJid;
    const mentions = context.simplified?.mentions || [];
    const quotedJid = context.simplified?.quotedInfo?.participant || undefined;
    const prefix = context.simplified?.matchedPrefix || '!';

    // ── 1. Sub-command: List all warnings in this group ───────────────────
    if (commandName === 'warnlist' || commandName === 'warnings' || args[0]?.toLowerCase() === 'list') {
      try {
        const records = await warningService.getGroupWarnings(context.fromJid);
        if (records.length === 0) {
          await context.socket.sendMessage(context.fromJid, {
            text: '✨ Tidak ada member yang memiliki peringatan aktif di grup ini.',
          });
          return;
        }

        const mentionList: string[] = [];
        let listText = `📋 *DAFTAR PERINGATAN MEMBER (${records.length})*\n\n`;

        records.forEach((rec, idx) => {
          const displayNum = rec.userId.replace(/@.+$/, '');
          mentionList.push(rec.userId);
          const lastReason = rec.reasons.length > 0 ? rec.reasons[rec.reasons.length - 1] : 'Tidak ada alasan';
          listText += `${idx + 1}. @${displayNum} — [${rec.count}/${MAX_WARNINGS}]\n   _Alasan: ${lastReason}_\n`;
        });

        listText += `\n💡 Gunakan \`${prefix}unwarn @user\` untuk mengurangi atau menghapus peringatan.`;

        await context.socket.sendMessage(context.fromJid, {
          text: listText,
          mentions: mentionList,
        });
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        await context.socket.sendMessage(context.fromJid, {
          text: `❌ Gagal mengambil daftar peringatan: ${errMsg}`,
        });
      }
      return;
    }

    // ── 2. Sub-command: Unwarn or Reset warnings ──────────────────────────
    if (
      commandName === 'unwarn' ||
      args[0]?.toLowerCase() === 'unwarn' ||
      args[0]?.toLowerCase() === 'reset' ||
      args[0]?.toLowerCase() === 'del'
    ) {
      const isResetAll = args[0]?.toLowerCase() === 'reset' || args[0]?.toLowerCase() === 'del';
      // If args[0] was "unwarn" / "reset" / "del", the target starts from args[1]
      const targetArgs = (args[0]?.toLowerCase() === 'unwarn' || isResetAll) ? args.slice(1) : args;

      let targetInput = targetArgs[0] || '';
      if (!targetInput && mentions.length > 0) {
        targetInput = mentions[0];
      } else if (!targetInput && quotedJid) {
        targetInput = quotedJid;
      }

      if (!targetInput) {
        await context.socket.sendMessage(context.fromJid, {
          text: `❌ Mohon tentukan member yang ingin dihapus peringatannya.\n\nContoh:\n• \`${prefix}unwarn @member\`\n• \`${prefix}warn reset @member\`\n• Atau reply pesan member dengan mengetik \`${prefix}unwarn\``,
        });
        return;
      }

      const result = await warningService.unwarnMember({
        socket: context.socket,
        groupId: context.fromJid,
        targetInput,
        adminJid,
        adminLid: context.simplified?.participant || undefined,
        resetAll: isResetAll,
        quotedJid,
        fromMe: context.fromMe,
        sessionId: context.sessionId,
      });

      await context.socket.sendMessage(context.fromJid, {
        text: result.message,
        mentions: result.mentions || [],
      });
      return;
    }

    // ── 3. Sub-command: Check member warning status ───────────────────────
    if (args[0]?.toLowerCase() === 'check') {
      let targetInput = args[1] || '';
      if (!targetInput && mentions.length > 0) {
        targetInput = mentions[0];
      } else if (!targetInput && quotedJid) {
        targetInput = quotedJid;
      }

      if (!targetInput) {
        await context.socket.sendMessage(context.fromJid, {
          text: `❌ Mohon tentukan member yang ingin dicek.\n\nContoh: \`${prefix}warn check @member\` atau reply pesan member.`,
        });
        return;
      }

      try {
        const metadata = await getGroupMetadataSafely(context.socket, context.fromJid, context.sessionId);
        const found = resolveParticipant(metadata.participants, targetInput, quotedJid);
        if (!found) {
          await context.socket.sendMessage(context.fromJid, {
            text: `❌ Member "${targetInput}" tidak ditemukan di grup ini.`,
          });
          return;
        }

        const display = formatParticipantDisplay(found);
        const mentions = getParticipantMentions(found);
        const record = await warningService.getMemberWarnings(context.fromJid, found.id);
        const count = record?.count || 0;
        const reasons = record?.reasons?.length ? `\nRiwayat alasan:\n• ${record.reasons.join('\n• ')}` : '';

        await context.socket.sendMessage(context.fromJid, {
          text: `📋 *STATUS PERINGATAN MEMBER*\n\nMember: @${display}\nStatus: [${count}/${MAX_WARNINGS}] peringatan${reasons}`,
          mentions,
        });
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        await context.socket.sendMessage(context.fromJid, {
          text: `❌ Gagal memeriksa status peringatan: ${errMsg}`,
        });
      }
      return;
    }

    // ── 4. Main command: Warn member (with auto-increment or explicit level) ─
    let level: number | undefined;
    let targetArgIndex = 0;

    // Check if first argument is a numeric level: "1", "2", "3"
    if (args.length > 0 && /^[123]$/.test(args[0])) {
      level = parseInt(args[0], 10);
      targetArgIndex = 1;
    }

    let targetInput = args[targetArgIndex] || '';
    let reasonParts = args.slice(targetArgIndex + 1);

    // If targetInput is empty, check mentions or quoted message
    if (!targetInput) {
      if (mentions.length > 0) {
        targetInput = mentions[0];
      } else if (quotedJid) {
        targetInput = quotedJid;
      }
    } else if (mentions.length > 0 && targetInput.startsWith('@')) {
      targetInput = mentions[0];
    }

    // If target was found via quote or mention but args was reason:
    // e.g., user replied to someone and typed "!warn spam chat" or "!warn 2 toxic"
    if (quotedJid && targetArgIndex === 0 && args.length > 0 && !args[0].startsWith('@')) {
      // Check if args[0] is not a number and does not match a participant
      const possibleReason = args.join(' ');
      targetInput = quotedJid;
      reasonParts = [possibleReason];
    }

    if (!targetInput) {
      await context.socket.sendMessage(context.fromJid, {
        text: `⚠️ *CARA PENGGUNAAN PERINGATAN (WARN):*\n\n` +
          `• \`${prefix}warn @member [alasan]\` — Peringatan bertahap (1 -> 2 -> 3 kick)\n` +
          `• \`${prefix}warn 1 @member [alasan]\` — Peringatan ke-1\n` +
          `• \`${prefix}warn 2 @member [alasan]\` — Peringatan ke-2\n` +
          `• \`${prefix}warn 3 @member [alasan]\` — Peringatan ke-3 (Langsung kick)\n` +
          `• \`${prefix}unwarn @member\` — Kurangi 1 peringatan\n` +
          `• \`${prefix}warn reset @member\` — Hapus semua peringatan\n` +
          `• \`${prefix}warn check @member\` — Cek status peringatan\n` +
          `• \`${prefix}warnlist\` — Lihat semua member yang terkena peringatan\n\n` +
          `_Tip: Anda juga bisa mereply pesan member yang ingin diperingatkan._`,
      });
      return;
    }

    const reason = reasonParts.join(' ').trim() || undefined;

    const result = await warningService.warnMember({
      socket: context.socket,
      groupId: context.fromJid,
      targetInput,
      adminJid,
      adminLid: context.simplified?.participant || undefined,
      reason,
      level,
      quotedJid,
      fromMe: context.fromMe,
      sessionId: context.sessionId,
    });

    await context.socket.sendMessage(context.fromJid, {
      text: result.message,
      mentions: result.mentions || [],
    });
  },
};

export default warnCommand;
