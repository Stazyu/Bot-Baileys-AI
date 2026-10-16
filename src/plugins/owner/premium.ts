import type { CommandModule, CommandContext } from '../../types/index.js';
import { isOwner } from '../../config/botConfig.js';
import { premiumService } from '../../services/premiumService.js';
import { userService } from '../../services/userService.js';
import { groupTierService } from '../../services/groupTierService.js';
import {
  computeExpiry,
  daysRemaining,
  describeExpiry,
  isExpired,
  parseDuration,
  resolveEffectiveTier,
} from '../../services/premiumExpiry.js';
import { log } from '../../utils/logger.js';

/** Alias pendek supaya pemakaian di dalam handler tetap ringkas. */
const isPast = (date: Date): boolean => isExpired(date);

/** Alasan kegagalan parse durasi → pesan yang bisa dibaca user. */
const DURATION_ERRORS: Record<string, string> = {
  durasi_kosong: 'Durasi kosong.',
  format_tidak_valid: 'Format durasi tidak valid.',
  satuan_tidak_dikenal: 'Satuan tidak dikenal (pakai d/hari, w/minggu, m/bulan, y/tahun).',
  durasi_terlalu_kecil: 'Durasi minimal 1 hari.',
  durasi_terlalu_besar: 'Durasi maksimal 3650 hari (±10 tahun).',
};

const DURATION_USAGE =
  '📅 Format durasi: `30` (30 hari) · `2w` (2 minggu) · `1m` (30 hari) · `1y` (365 hari) · `off` (tanpa expiry)';

const command: CommandModule = {
  config: {
    name: 'premium',
    aliases: ['upgrade', 'tier'],
    description: 'Manage premium tiers and limit toggles',
    usage: '!premium <set|remove|check|list|toggle|status|memory|expiry|expiring>',
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
          await context.socket.sendMessage(from, {
            text: `❌ Usage: \`!premium set <userId|phone> <free|premium|pro> [durasi]\`\n${DURATION_USAGE}\nContoh: \`!premium set 62812xxxx premium 30d\``,
          });
          return;
        }

        // Durasi hanya relevan untuk tier berbayar. Tier free selalu tanpa expiry.
        let expiry: Date | null = null;
        if (tier === 'free') {
          if (args[3]) {
            await context.socket.sendMessage(from, { text: '❌ Tier *free* tidak punya masa aktif. Hapus argumen durasi.' });
            return;
          }
        } else if (args[3]) {
          const parsed = parseDuration(args[3]);
          if (!parsed.ok) {
            await context.socket.sendMessage(from, {
              text: `❌ ${DURATION_ERRORS[parsed.error ?? ''] ?? 'Durasi tidak valid.'}\n${DURATION_USAGE}`,
            });
            return;
          }
          expiry = parsed.days === null ? null : computeExpiry(parsed.days);
        }

        // Guard: user harus ada di DB — `update` Prisma error kalau userId tak dikenal.
        const existing = await userService.getUser(targetJid);
        if (!existing) {
          await context.socket.sendMessage(from, { text: `❌ User \`${targetJid.split('@')[0]}\` belum terdaftar di database.` });
          return;
        }

        await userService.setTier(targetJid, tier, tier === 'free' ? null : expiry);
        await context.socket.sendMessage(from, {
          text:
            `✅ User *${targetJid.split('@')[0]}* → tier *${tier.toUpperCase()}*\n` +
            `└ Masa aktif: ${tier === 'free' ? '—' : describeExpiry(expiry)}`,
        });
        log.info(`[Premium] ${context.simplified?.user_id} set ${targetJid} → ${tier} (${expiry ? expiry.toISOString() : 'no-expiry'})`);
        break;
      }

      case 'expiry': {
        if (!isOwner(context.simplified?.user_id || from)) {
          await context.socket.sendMessage(from, { text: '❌ Owner only.' });
          return;
        }
        const targetJid = args[1]?.includes('@s.whatsapp.net') ? args[1] : args[1] ? `${args[1]}@s.whatsapp.net` : null;
        if (!targetJid || !args[2]) {
          await context.socket.sendMessage(from, {
            text: `❌ Usage: \`!premium expiry <userId|phone> <durasi>\`\n${DURATION_USAGE}\nContoh: \`!premium expiry 62812xxxx +30\``,
          });
          return;
        }
        const user = await userService.getUser(targetJid);
        if (!user) {
          await context.socket.sendMessage(from, { text: `❌ User \`${targetJid.split('@')[0]}\` tidak ditemukan.` });
          return;
        }

        // Prefiks `+` = perpanjang dari expiry lama (kalau masih aktif),
        // bukan dari sekarang. Ini yang bikin top-up tidak memotong sisa masa.
        const raw = args[2];
        const extend = raw.startsWith('+');
        const parsed = parseDuration(extend ? raw.slice(1) : raw);
        if (!parsed.ok) {
          await context.socket.sendMessage(from, {
            text: `❌ ${DURATION_ERRORS[parsed.error ?? ''] ?? 'Durasi tidak valid.'}\n${DURATION_USAGE}`,
          });
          return;
        }

        let expiry: Date | null;
        if (parsed.days === null) {
          expiry = null;
        } else {
          const base = extend && user.premiumExpiry && !isPast(user.premiumExpiry) ? user.premiumExpiry : new Date();
          expiry = computeExpiry(parsed.days, base);
        }

        await userService.setPremiumExpiry(targetJid, expiry);
        await context.socket.sendMessage(from, {
          text: `✅ Masa aktif *${targetJid.split('@')[0]}* → ${describeExpiry(expiry)}${extend ? ' (diperpanjang)' : ''}`,
        });
        log.info(`[Premium] ${context.simplified?.user_id} set expiry ${targetJid} → ${expiry ? expiry.toISOString() : 'none'}`);
        break;
      }

      case 'expiring': {
        if (!isOwner(context.simplified?.user_id || from)) {
          await context.socket.sendMessage(from, { text: '❌ Owner only.' });
          return;
        }
        const withinDays = Math.min(Math.max(Number(args[1]) || 7, 1), 365);
        const users = await userService.getUsers({ limit: 200 });
        const now = new Date();
        const soon = users
          .filter((u) => resolveEffectiveTier(u, now) !== 'free' && u.premiumExpiry)
          .map((u) => ({ user: u, days: daysRemaining(u.premiumExpiry, now) }))
          .filter((row) => row.days <= withinDays)
          .sort((a, b) => a.days - b.days);

        if (soon.length === 0) {
          await context.socket.sendMessage(from, { text: `📋 Tidak ada premium yang habis dalam ${withinDays} hari.` });
          return;
        }
        const lines = [`⏳ *Premium Habis ≤ ${withinDays} Hari (${soon.length})*`, ''];
        for (const { user, days } of soon.slice(0, 25)) {
          lines.push(`• \`${user.userId.split('@')[0]}\` — *${user.tier.toUpperCase()}* — ${days === 0 ? '*HARI INI*' : `${days} hari lagi`}`);
        }
        await context.socket.sendMessage(from, { text: lines.join('\n') });
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
        await userService.setTier(targetJid, 'free', null);
        await context.socket.sendMessage(from, { text: `✅ User *${targetJid.split('@')[0]}* di-reset ke *free* (masa aktif dihapus)` });
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
        const effective = resolveEffectiveTier(user);
        const expiryLine = user.premiumExpiry
          ? `├ Premium sampai: ${describeExpiry(user.premiumExpiry)}`
          : user.tier === 'free'
            ? '├ Status: Pengguna Gratis'
            : '├ Status: Premium (tanpa expiry)';
        const driftLine = effective !== user.tier
          ? [`├ ⚠️ Tier efektif: *${effective.toUpperCase()}* (masa aktif habis)`]
          : [];
        const lines = [
          `📊 *Status User*`,
          `├ ID: \`${user.userId.split('@')[0]}\``,
          `├ Nama: ${user.pushName || '(tidak diketahui)'}`,
          `├ Tier: *${user.tier.toUpperCase()}*`,
          expiryLine,
          ...driftLine,
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
          const expiryText = u.premiumExpiry
            ? resolveEffectiveTier(u) === 'free'
              ? ' ⚠️ habis'
              : ` — ${daysRemaining(u.premiumExpiry)}h lagi`
            : '';
          lines.push(`• \`${u.userId.split('@')[0]}\` — *${u.tier.toUpperCase()}* (${u.pushName || '-'})${expiryText}`);
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

      case 'group': {
        if (!isOwner(context.simplified?.user_id || from)) {
          await context.socket.sendMessage(from, { text: '❌ Owner only.' });
          return;
        }
        const action = args[1]?.toLowerCase();
        const rawTarget = args[2];
        const groupJid = rawTarget?.includes('@g.us')
          ? rawTarget
          : rawTarget
            ? `${rawTarget}@g.us`
            : null;

        if (action === 'set') {
          const tier = args[3]?.toLowerCase();
          const ownerRaw = args[4];
          const ownerJid = ownerRaw ? (ownerRaw.includes('@') ? ownerRaw : `${ownerRaw}@s.whatsapp.net`) : undefined;
          if (!groupJid || !tier || !['free', 'premium', 'pro'].includes(tier)) {
            await context.socket.sendMessage(from, {
              text: '❌ Usage: `!premium group set <groupId|jid> <free|premium|pro> [ownerPhone]`\nContoh: `!premium group set 12036xxxxx@g.us premium 62812xxxx`',
            });
            return;
          }
          const result = await groupTierService.setGroupTier(groupJid, tier, ownerJid);
          if (!result.ok) {
            await context.socket.sendMessage(from, {
              text: result.error === 'db_error'
                ? '❌ Gagal menyimpan tier grup (DB error). Kalau grup baru, sertakan `[ownerPhone]` sebagai pemilik.'
                : '❌ Tier tidak valid.',
            });
            return;
          }
          await context.socket.sendMessage(from, {
            text: tier === 'free'
              ? `🗑️ Tier grup \`${groupJid.split('@')[0]}\` dicabut → *FREE* (limit per-user).`
              : `✅ Grup \`${groupJid.split('@')[0]}\` → tier *${tier.toUpperCase()}*`,
          });
          log.info(`[Premium] ${context.simplified?.user_id} set group ${groupJid} → ${tier}`);
          return;
        }

        if (action === 'remove' || action === 'off') {
          if (!groupJid) {
            await context.socket.sendMessage(from, { text: '❌ Usage: `!premium group remove <groupId|jid>`' });
            return;
          }
          const ok = await groupTierService.revokeGroup(groupJid);
          await context.socket.sendMessage(from, {
            text: ok ? `🗑️ Tier grup \`${groupJid.split('@')[0]}\` dicabut.` : '❌ Gagal mencabut tier grup.',
          });
          return;
        }

        if (!action || action === 'list') {
          const list = await groupTierService.listGroupTiers();
          if (list.length === 0) {
            await context.socket.sendMessage(from, { text: '📋 Belum ada grup ber-tier.' });
            return;
          }
          const lines = [`📋 *Grup Ber-tier (${list.length})*`, ''];
          for (const rec of list.slice(0, 20)) {
            const usage = await premiumService.getGroupPoolUsage(rec.groupJid);
            const cfg = premiumService.getTierConfig(rec.tier);
            const limitText = cfg.dailyGroupAiLimit === Number.MAX_SAFE_INTEGER ? '∞' : String(cfg.dailyGroupAiLimit);
            lines.push(`• \`${rec.groupJid.split('@')[0]}\` — *${rec.tier.toUpperCase()}* — ${usage}/${limitText} — owner \`${rec.ownerJid.split('@')[0]}\``);
          }
          if (list.length > 20) lines.push(`...dan ${list.length - 20} lainnya`);
          await context.socket.sendMessage(from, { text: lines.join('\n') });
          return;
        }

        await context.socket.sendMessage(from, {
          text: `📋 *Group Tier Commands* (owner)\n\n` +
            `• \`!premium group list\` — daftar grup ber-tier\n` +
            `• \`!premium group set <group> <tier> [ownerPhone]\` — paksa tier grup\n` +
            `• \`!premium group remove <group>\` — cabut tier grup\n\n` +
            `User premium/pro bisa self-service: \`!grouptier on <link>\``,
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
        const groupStats = await groupTierService.getStats();
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
          ``,
          `🏘️ *Tier Grup:*`,
          `├ Premium: ${groupStats.premium}`,
          `└ Pro: ${groupStats.pro}`,
        ];
        await context.socket.sendMessage(from, { text: lines.join('\n') });
        break;
      }

      default:
        await context.socket.sendMessage(from, {
          text: `📋 *Premium Commands*\n\n` +
            `*!premium set* <userId> <tier> [durasi] — Set tier + masa aktif (owner)\n` +
            `*!premium expiry* <userId> <durasi|+durasi|off> — Atur/perpanjang masa aktif (owner)\n` +
            `*!premium expiring* [hari] — Premium yang mau habis (owner)\n` +
            `*!premium remove* <userId> — Reset ke free (owner)\n` +
            `*!premium check* [userId] — Cek tier & usage\n` +
            `*!premium list* — List user premium (owner)\n` +
            `*!premium group* <list|set|remove> — Tier grup (owner)\n` +
            `*!premium toggle* <type> <on|off> — Toggle limit (owner)\n` +
            `*!premium status* — Status sistem (owner)\n` +
            `*!premium memory* <ttl|turns|set|check|clear> — Atur memory AI (owner)\n\n` +
            `${DURATION_USAGE}\n` +
            `Tier: *free* (20/50/20) | *premium* (200/500/200) | *pro* (unlimited)\n` +
            `AI / Group AI / Command`,
        });
    }
  },
};

export default command;
