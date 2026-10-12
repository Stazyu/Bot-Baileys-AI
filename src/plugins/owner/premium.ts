import type { CommandModule, CommandContext } from '../../types/index.js';
import { isOwner } from '../../config/botConfig.js';
import { premiumService } from '../../services/premiumService.js';
import { userService } from '../../services/userService.js';
import { log } from '../../utils/logger.js';

const command: CommandModule = {
  config: {
    name: 'premium',
    aliases: ['upgrade', 'tier'],
    description: 'Manage premium tiers and limit toggles',
    usage: '!premium <set|remove|check|list|toggle|status|memory>',
    category: 'owner',
    ownerOnly: true,
    cooldown: 2,
    limitEnabled: false,
  },
  handler: async (context: CommandContext, args: string[]) => {
    const sub = args[0]?.toLowerCase();
    const from = context.fromJid;

    switch (sub) {
      case 'set': {
        if (!isOwner(context.simplified?.user_id || from)) {
          await context.socket.sendMessage(from, { text: '❌ Owner only.' });
          return;
        }
        const targetJid = args[1]?.includes('@s.whatsapp.net') ? args[1] : `${args[1]}@s.whatsapp.net`;
        const tier = args[2]?.toLowerCase();
        if (!targetJid || !tier || !['free', 'premium', 'pro'].includes(tier)) {
          await context.socket.sendMessage(from, { text: '❌ Usage: !premium set <userId|phone> <free|premium|pro>' });
          return;
        }
        await userService.setTier(targetJid, tier);
        await context.socket.sendMessage(from, { text: `✅ User *${targetJid.split('@')[0]}* di-set ke tier *${tier}*` });
        log.info(`[Premium] ${context.simplified?.user_id} set ${targetJid} → ${tier}`);
        break;
      }

      case 'remove': {
        if (!isOwner(context.simplified?.user_id || from)) {
          await context.socket.sendMessage(from, { text: '❌ Owner only.' });
          return;
        }
        const targetJid = args[1]?.includes('@s.whatsapp.net') ? args[1] : `${args[1]}@s.whatsapp.net`;
        if (!targetJid) {
          await context.socket.sendMessage(from, { text: '❌ Usage: !premium remove <userId|phone>' });
          return;
        }
        await userService.setTier(targetJid, 'free');
        await context.socket.sendMessage(from, { text: `✅ User *${targetJid.split('@')[0]}* di-reset ke *free*` });
        break;
      }

      case 'check': {
        let checkJid = context.simplified?.user_id || from;
        if (args[1]) {
          checkJid = args[1].includes('@s.whatsapp.net') ? args[1] : `${args[1]}@s.whatsapp.net`;
        }
        const user = await userService.getUser(checkJid);
        if (!user) {
          await context.socket.sendMessage(from, { text: '❌ User tidak ditemukan di database.' });
          return;
        }
        const tierConfig = premiumService.getTierConfig(user.tier);
        const usage = await premiumService.getTodayUsage(checkJid);
        const statusDetail = user.tier === 'free' ? 'Pengguna Gratis' : 'Premium (no expiry)';
        const expiryLine = user.premiumExpiry
          ? `├ Premium sampai: ${user.premiumExpiry.toLocaleDateString('id-ID')}`
          : `├ Status: ${statusDetail}`;
        const lines = [
          `📊 *Status User*`,
          `├ ID: \`${user.userId.split('@')[0]}\``,
          `├ Nama: ${user.pushName || '(tidak diketahui)'}`,
          `├ Tier: *${user.tier.toUpperCase()}*`,
          expiryLine,
          `├ Status: ${user.status}`,
          ``,
          `📈 *Pemakaian Hari Ini*`,
          `├ Private AI: ${usage.aiChatCount}/${tierConfig.dailyAiChatLimit === Number.MAX_SAFE_INTEGER ? '∞' : tierConfig.dailyAiChatLimit}`,
          `├ Group AI: ${usage.groupAiCount}/${tierConfig.dailyGroupAiLimit === Number.MAX_SAFE_INTEGER ? '∞' : tierConfig.dailyGroupAiLimit}`,
          `└ Command: ${usage.commandCount}/${tierConfig.dailyCommandLimit === Number.MAX_SAFE_INTEGER ? '∞' : tierConfig.dailyCommandLimit}`,
        ];
        await context.socket.sendMessage(from, { text: lines.join('\n') });
        break;
      }

      case 'list': {
        if (!isOwner(context.simplified?.user_id || from)) {
          await context.socket.sendMessage(from, { text: '❌ Owner only.' });
          return;
        }
        const users = await userService.getUsers({ status: 'active', limit: 100 });
        const premiumUsers = users.filter(u => u.tier !== 'free');
        if (premiumUsers.length === 0) {
          await context.socket.sendMessage(from, { text: '📋 Tidak ada user premium saat ini.' });
          return;
        }
        const lines = [`📋 *User Premium (${premiumUsers.length})*`, ''];
        for (const u of premiumUsers.slice(0, 20)) {
          lines.push(`• \`${u.userId.split('@')[0]}\` — *${u.tier.toUpperCase()}* (${u.pushName || '-'})`);
        }
        if (premiumUsers.length > 20) lines.push(`...dan ${premiumUsers.length - 20} lainnya`);
        await context.socket.sendMessage(from, { text: lines.join('\n') });
        break;
      }

      case 'toggle': {
        if (!isOwner(context.simplified?.user_id || from)) {
          await context.socket.sendMessage(from, { text: '❌ Owner only.' });
          return;
        }
        const type = args[1]?.toLowerCase();
        const state = args[2]?.toLowerCase();
        if (!type || !state || !['on', 'off'].includes(state)) {
          await context.socket.sendMessage(from, {
            text: '❌ Usage:\n• `!premium toggle privateAi <on|off>`\n• `!premium toggle groupAi <on|off>`\n• `!premium toggle cmd <on|off>`',
          });
          return;
        }
        const enabled = state === 'on';
        switch (type) {
          case 'privateai':
            await premiumService.setPrivateAiLimitEnabled(enabled);
            break;
          case 'groupai':
            await premiumService.setGroupAiLimitEnabled(enabled);
            break;
          case 'cmd':
          case 'command':
            await premiumService.setCommandLimitEnabled(enabled);
            break;
          default:
            await context.socket.sendMessage(from, { text: '❌ Invalid type. Use: privateAi, groupAi, cmd' });
            return;
        }
        await context.socket.sendMessage(from, { text: `✅ Limit *${type}* di-${enabled ? 'AKTIFKAN' : 'MATIKAN'}` });
        break;
      }

      case 'memory': {
        if (!isOwner(context.simplified?.user_id || from)) {
          await context.socket.sendMessage(from, { text: '❌ Owner only.' });
          return;
        }
        const action = args[1]?.toLowerCase();
        const { memoryService } = await import('../../services/memoryService.js');
        const toJid = (raw?: string): string | null => {
          if (!raw) return null;
          const digits = raw.replace(/\D/g, '');
          if (!digits) return null;
          return raw.includes('@s.whatsapp.net') ? raw : `${digits}@s.whatsapp.net`;
        };
        if (action === 'ttl') {
          const tier = args[2]?.toLowerCase();
          const days = Number(args[3]);
          if (!tier || !['free', 'premium', 'pro'].includes(tier) || !Number.isFinite(days) || days < 0) {
            await context.socket.sendMessage(from, { text: '❌ Usage: `!premium memory ttl <free|premium|pro> <hari>`\nContoh: `!premium memory ttl premium 14`\n`0` = tidak persisten.' });
            return;
          }
          await premiumService.setMemoryTtlDays(tier, days);
          await context.socket.sendMessage(from, { text: `✅ Default memory *${tier}* → *${Math.floor(days)} hari*` });
          log.info(`[Premium] ${context.simplified?.user_id} set memory TTL ${tier} → ${Math.floor(days)}d`);
          return;
        }
        if (action === 'turns') {
          const n = Number(args[2]);
          if (!Number.isFinite(n) || n < 1) {
            await context.socket.sendMessage(from, { text: '❌ Usage: `!premium memory turns <jumlah>`\nContoh: `!premium memory turns 24`' });
            return;
          }
          await premiumService.setMemoryMaxTurns(n);
          await context.socket.sendMessage(from, { text: `✅ Max turn memory → *${Math.floor(n)}*` });
          return;
        }
        if (action === 'set') {
          const targetJid = toJid(args[2]);
          const rawDays = args[3]?.toLowerCase();
          if (!targetJid || !rawDays) {
            await context.socket.sendMessage(from, { text: '❌ Usage: `!premium memory set <userId|phone> <hari|off>`\nContoh: `!premium memory set 62812xxxx 90` / `!premium memory set 62812xxxx off`' });
            return;
          }
          if (rawDays === 'off' || rawDays === 'default') {
            await userService.setMemoryTtl(targetJid, null);
            memoryService.invalidateTtlCache(targetJid);
            await context.socket.sendMessage(from, { text: `✅ Memory *${targetJid.split('@')[0]}* dikembalikan ke default tier` });
            return;
          }
          const days = Number(rawDays);
          if (!Number.isFinite(days) || days <= 0) {
            await context.socket.sendMessage(from, { text: '❌ Hari harus angka > 0, atau `off`.' });
            return;
          }
          await userService.setMemoryTtl(targetJid, Math.floor(days));
          memoryService.invalidateTtlCache(targetJid);
          await context.socket.sendMessage(from, { text: `✅ Memory *${targetJid.split('@')[0]}* → *${Math.floor(days)} hari*` });
          log.info(`[Premium] ${context.simplified?.user_id} set memory ${targetJid} → ${Math.floor(days)}d`);
          return;
        }
        if (action === 'check') {
          const targetJid = toJid(args[2]) ?? context.simplified?.user_id ?? from;
          const user = await userService.getUser(targetJid);
          if (!user) {
            await context.socket.sendMessage(from, { text: '❌ User tidak ditemukan di database.' });
            return;
          }
          const ttlDays = user.memoryTtlDays ?? premiumService.getMemoryTtlDays(user.tier);
          const scopes = await memoryService.listUserScopes(targetJid);
          const lines = [
            `🧠 *Memory ${targetJid.split('@')[0]}*`,
            `├ Tier: *${user.tier.toUpperCase()}*`,
            `├ Durasi: ${ttlDays} hari${user.memoryTtlDays !== null && user.memoryTtlDays !== undefined ? ' (override)' : ' (default tier)'}`,
            `└ Scope aktif: ${scopes.length}`,
          ];
          for (const s of scopes.slice(0, 10)) {
            lines.push(`  • ${s.scope} — ±${s.turns} turn, sampai ${s.expiresAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`);
          }
          await context.socket.sendMessage(from, { text: lines.join('\n') });
          return;
        }
        if (action === 'clear') {
          const targetJid = toJid(args[2]);
          if (!targetJid) {
            await context.socket.sendMessage(from, { text: '❌ Usage: `!premium memory clear <userId|phone>`' });
            return;
          }
          const count = await memoryService.clear(targetJid);
          await context.socket.sendMessage(from, { text: `✅ Memory *${targetJid.split('@')[0]}* dihapus (${count} scope)` });
          return;
        }
        await context.socket.sendMessage(from, {
          text: `🧠 *Premium Memory*\n\n` +
            `• \`!premium memory ttl <tier> <hari>\` — default durasi tier\n` +
            `• \`!premium memory turns <n>\` — max turn tersimpan\n` +
            `• \`!premium memory set <user> <hari|off>\` — override per user\n` +
            `• \`!premium memory check [user]\` — cek memory user\n` +
            `• \`!premium memory clear <user>\` — hapus paksa`,
        });
        break;
      }

      case 'status': {
        if (!isOwner(context.simplified?.user_id || from)) {
          await context.socket.sendMessage(from, { text: '❌ Owner only.' });
          return;
        }
        const toggles = premiumService.getToggleStatus();
        const stats = await userService.getStats();
        const lines = [
          `⚙️ *Status Sistem Premium*`,
          ``,
          `🔒 *Toggle Limit:*`,
          `├ Private AI: ${toggles.privateAi ? '✅ ON' : '❌ OFF'}`,
          `├ Group AI: ${toggles.groupAi ? '✅ ON' : '❌ OFF'}`,
          `└ Command: ${toggles.command ? '✅ ON' : '❌ OFF'}`,
          ``,
          `👥 *Statistik User:*`,
          `├ Total: ${stats.total}`,
          `├ Aktif (7 hari): ${stats.active}`,
          `├ Free: ${stats.free}`,
          `├ Premium: ${stats.premium}`,
          `└ Pro: ${stats.pro}`,
        ];
        await context.socket.sendMessage(from, { text: lines.join('\n') });
        break;
      }

      default:
        await context.socket.sendMessage(from, {
          text: `📋 *Premium Commands*\n\n` +
            `*!premium set* <userId> <tier> — Set tier user (owner)\n` +
            `*!premium remove* <userId> — Reset ke free (owner)\n` +
            `*!premium check* [userId] — Cek tier & usage\n` +
            `*!premium list* — List user premium (owner)\n` +
            `*!premium toggle* <type> <on|off> — Toggle limit (owner)\n` +
            `*!premium status* — Status sistem (owner)\n` +
            `*!premium memory* <ttl|turns|set|check|clear> — Atur memory AI (owner)\n\n` +
            `Tier: *free* (20/50/20) | *premium* (200/500/200) | *pro* (unlimited)\n` +
            `AI / Group AI / Command`,
        });
    }
  },
};

export default command;
