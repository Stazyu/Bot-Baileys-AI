import type { CommandModule } from '../../types/index.js';
import { isOwner } from '../../config/botConfig.js';
import { groupTierService } from '../../services/groupTierService.js';
import { premiumService } from '../../services/premiumService.js';
import { userService } from '../../services/userService.js';
import { log } from '../../utils/logger.js';

const GROUP_JID_RE = /^\d+@g\.us$/;
const INVITE_RE = /chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/;

/** 'on'/'off'/'status' + target opsional. */
function parseArgs(args: string[]): { action: string; target?: string } {
  const action = (args[0] ?? 'status').toLowerCase();
  return { action, target: args[1] };
}

/**
 * Resolusi grup dari beberapa bentuk input:
 *   - link invite  : https://chat.whatsapp.com/XXXXXXXX
 *   - JID langsung : 12036...@g.us
 *   - tanpa argumen: grup tempat command dikirim (`context.fromJid`)
 */
async function resolveGroupJid(
  context: Parameters<CommandModule['handler']>[0],
  target?: string,
): Promise<{ jid?: string; error?: string; name?: string }> {
  if (!target) {
    if (context.fromJid.endsWith('@g.us')) return { jid: context.fromJid };
    return { error: 'Sertakan link grup. Contoh: `!grouptier on https://chat.whatsapp.com/XXXX`' };
  }

  if (GROUP_JID_RE.test(target.trim())) return { jid: target.trim() };

  const inviteCode = target.match(INVITE_RE)?.[1];
  if (inviteCode) {
    try {
      const info = await context.socket.groupGetInviteInfo(inviteCode);
      if (info?.id) return { jid: info.id, name: info.subject };
      return { error: 'Link grup tidak valid atau sudah kedaluwarsa.' };
    } catch (error) {
      log.debug(`[GroupTier] groupGetInviteInfo failed: ${(error as Error).message}`);
      return { error: 'Gagal membaca link grup. Pastikan link masih aktif.' };
    }
  }

  if (/^\d{6,}$/.test(target.trim())) {
    const jid = `${target.trim()}@g.us`;
    return { jid };
  }

  return { error: 'Format tidak dikenali. Kirim link grup (https://chat.whatsapp.com/...) atau JID grup.' };
}

const command: CommandModule = {
  config: {
    name: 'grouptier',
    aliases: ['gtier', 'grouppremium'],
    description: 'Aktifkan tier premium/pro untuk sebuah grup (kembar dengan tier kamu)',
    usage: '!grouptier <on|off|status> [link-grup]',
    category: 'group',
    cooldown: 5,
    limitEnabled: false,
  },
  handler: async (context, args: string[]) => {
    const from = context.fromJid;
    const senderJid = context.simplified?.user_id || from;
    const prefix = context.simplified?.prefix || '!';
    const { action, target } = parseArgs(args);
    const reply = (text: string): Promise<unknown> => context.socket.sendMessage(from, { text });

    switch (action) {
      // ── Aktifkan ────────────────────────────────────────────────────
      case 'on':
      case 'aktif':
      case 'enable': {
        const resolved = await resolveGroupJid(context, target);
        if (!resolved.jid) {
          await reply(`❌ ${resolved.error}`);
          return;
        }
        const groupJid = resolved.jid;

        const user = await userService.getUser(senderJid);
        if (!user || !['premium', 'pro'].includes(user.tier)) {
          await reply(
            `⭐ *Fitur Premium*\n\n` +
            `Hanya user *Premium* / *Pro* yang bisa mengaktifkan tier untuk sebuah grup.\n\n` +
            `💡 Cek status kamu: \`${prefix}premium check\``,
          );
          return;
        }

        const result = await groupTierService.activateGroup(groupJid, senderJid);
        if (!result.ok) {
          switch (result.error) {
            case 'not_premium':
              await reply('❌ Tier kamu tidak lagi memenuhi syarat (expired atau turun ke free).');
              return;
            case 'already_active':
              await reply(`ℹ️ Grup ini sudah aktif di tier *${result.record?.tier.toUpperCase()}*.`);
              return;
            case 'group_has_owner':
              await reply(
                `❌ Grup ini sudah diaktifkan oleh user lain.\n\n` +
                `Owner grup tersebut harus mencabutnya dulu: \`${prefix}grouptier off\``,
              );
              return;
            case 'slot_taken': {
              const other = result.conflictingGroupJid?.split('@')[0] ?? '-';
              await reply(
                `❌ Kamu sudah memakai slot grup kamu untuk grup lain (\`${other}\`).\n\n` +
                `Setiap user hanya bisa mengaktifkan *1 grup*. Cabut dulu grup lama:\n` +
                `\`${prefix}grouptier off ${result.conflictingGroupJid}\``,
              );
              return;
            }
            default:
              await reply('❌ Gagal mengaktifkan tier grup karena kesalahan database. Coba lagi nanti.');
              return;
          }
        }

        const tierConfig = premiumService.getTierConfig(result.record?.tier ?? 'premium');
        const limitText = tierConfig.dailyGroupAiLimit === Number.MAX_SAFE_INTEGER
          ? '∞ (unlimited)'
          : `${tierConfig.dailyGroupAiLimit}/hari`;
        await reply(
          `✅ *Grup berhasil diaktifkan!*\n\n` +
          `├ Grup: ${resolved.name ? `*${resolved.name}*` : `\`${groupJid.split('@')[0]}\``}\n` +
          `├ Tier: *${(result.record?.tier ?? 'premium').toUpperCase()}*\n` +
          `├ Kuota AI grup: ${limitText}\n` +
          `└ Masa aktif: ${result.record?.expiresAt ? result.record.expiresAt.toLocaleDateString('id-ID') : 'selama tier kamu aktif'}\n\n` +
          `Kuota ini dipakai *bersama semua member* grup, dan berlaku untuk siapa pun di grup itu — termasuk member free.`,
        );
        log.info(`[GroupTier] ${senderJid.split('@')[0]} activated ${groupJid.split('@')[0]}`);
        return;
      }

      // ── Cabut ───────────────────────────────────────────────────────
      case 'off':
      case 'nonaktif':
      case 'disable': {
        const resolved = await resolveGroupJid(context, target);
        if (!resolved.jid) {
          await reply(`❌ ${resolved.error}`);
          return;
        }
        const groupJid = resolved.jid;
        const record = await groupTierService.getGroupTierRecord(groupJid);
        if (!record) {
          await reply('ℹ️ Grup ini belum punya tier aktif.');
          return;
        }
        if (record.ownerJid !== senderJid && !isOwner(senderJid)) {
          await reply('❌ Hanya pengaktif grup ini atau owner bot yang bisa mencabut tier grup.');
          return;
        }
        const ok = await groupTierService.revokeGroup(groupJid);
        await reply(ok
          ? `🗑️ Tier grup \`${groupJid.split('@')[0]}\` dicabut. Grup kembali ke limit free per-user.`
          : '❌ Gagal mencabut tier grup. Coba lagi nanti.');
        return;
      }

      // ── Status ──────────────────────────────────────────────────────
      case 'status':
      case 'cek':
      case 'check': {
        // Di grup: status grup itu. Di private: semua grup milik user.
        if (!target && from.endsWith('@g.us')) {
          const record = await groupTierService.getGroupTierRecord(from);
          if (!record || record.tier === 'free') {
            await reply(
              `📋 *Status Tier Grup*\n├ Grup: \`${from.split('@')[0]}\`\n└ Tier: *FREE* (limit per-user)\n\n💡 User premium/pro bisa mengaktifkan: \`${prefix}grouptier on ${from}\``,
            );
            return;
          }
          const usage = await premiumService.getGroupPoolUsage(from);
          const cfg = premiumService.getTierConfig(record.tier);
          const limitText = cfg.dailyGroupAiLimit === Number.MAX_SAFE_INTEGER ? '∞' : String(cfg.dailyGroupAiLimit);
          await reply(
            `📋 *Status Tier Grup*\n` +
            `├ Grup: \`${from.split('@')[0]}\`\n` +
            `├ Tier: *${record.tier.toUpperCase()}*\n` +
            `├ Pengaktif: \`${record.ownerJid.split('@')[0]}\`\n` +
            `├ Kuota AI hari ini: ${usage}/${limitText}\n` +
            `└ Masa aktif: ${record.expiresAt ? record.expiresAt.toLocaleDateString('id-ID') : 'selama tier pengaktif aktif'}`,
          );
          return;
        }

        const owned = await groupTierService.getGroupsOwnedBy(senderJid);
        if (owned.length === 0) {
          await reply(
            `📋 Kamu belum mengaktifkan tier untuk grup mana pun.\n\n` +
            `Cara pakai:\n\`${prefix}grouptier on https://chat.whatsapp.com/XXXX\``,
          );
          return;
        }
        const lines = [`📋 *Grup Ber-tier Kamu (${owned.length})*`, ''];
        for (const rec of owned) {
          const usage = await premiumService.getGroupPoolUsage(rec.groupJid);
          const cfg = premiumService.getTierConfig(rec.tier);
          const limitText = cfg.dailyGroupAiLimit === Number.MAX_SAFE_INTEGER ? '∞' : String(cfg.dailyGroupAiLimit);
          lines.push(`• \`${rec.groupJid.split('@')[0]}\` — *${rec.tier.toUpperCase()}* (${usage}/${limitText} hari ini)`);
        }
        await reply(lines.join('\n'));
        return;
      }

      default:
        await reply(
          `📋 *Group Tier — Premium/Pro untuk Grup*\n\n` +
          `User *Premium* / *Pro* bisa mengaktifkan *1 grup* agar memakai tier yang sama dengan kamu. Kuotanya dipakai bersama semua member grup.\n\n` +
          `• \`${prefix}grouptier on <link-grup>\` — aktifkan grup\n` +
          `• \`${prefix}grouptier off <link-grup>\` — cabut tier grup\n` +
          `• \`${prefix}grouptier status\` — cek grup ber-tier kamu\n\n` +
          `Di dalam grup, \`<link-grup>\` boleh dikosongkan (otomatis grup itu).\n` +
          `Kuota mengikuti tier kamu: premium 500/hari, pro unlimited.`,
        );
    }
  },
};

export default command;
