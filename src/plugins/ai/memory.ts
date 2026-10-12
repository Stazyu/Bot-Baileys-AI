import type { CommandModule } from '../../types/index.js';
import aiService from '../../services/aiService.js';
import { memoryService, parseMemoryKey } from '../../services/memoryService.js';

function daysLeft(expiresAt: Date | null): string {
  if (!expiresAt) return '-';
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return 'habis';
  const days = ms / (24 * 60 * 60 * 1000);
  if (days >= 1) return `~${Math.ceil(days)} hari`;
  const hours = ms / (60 * 60 * 1000);
  if (hours >= 1) return `~${Math.floor(hours)} jam`;
  return `~${Math.max(1, Math.floor(ms / 60000))} mnt`;
}

const command: CommandModule = {
  config: {
    name: 'memory',
    aliases: ['memori', 'ingat'],
    description: 'Lihat & hapus memory AI kamu',
    usage: '!memory <status|clear>',
    category: 'ai',
    cooldown: 2,
    limitEnabled: false,
  },
  handler: async (context, args) => {
    const from = context.fromJid;
    const userId = context.simplified?.user_id || from;
    const sub = args[0]?.toLowerCase() ?? 'status';

    // Key yang sama dengan path chat: grup = per (grup, sender), private = per user.
    const isGroup = from.includes('@g.us');
    const key = isGroup ? `mem:group:${from}:${userId}` : `mem:private:${userId}`;
    const { scope } = parseMemoryKey(key);

    if (sub === 'clear' || sub === 'hapus' || sub === 'forget' || sub === 'lupa') {
      aiService.clearConversation(key);
      await context.socket.sendMessage(from, { text: '🧹 Memory AI kamu sudah dihapus. Mulai fresh ya!' });
      return;
    }

    if (sub === 'status' || sub === 'cek' || sub === 'info') {
      const info = await memoryService.getInfo(userId, scope);
      if (!info.persistent) {
        await context.socket.sendMessage(from, {
          text: `🧠 *Memory AI*\n├ Tier: *${info.tier.toUpperCase()}*\n└ Status: tidak persisten (khusus Premium/Pro)\n\n💡 Upgrade ke premium biar bot ingat obrolan sampai ${info.ttlDays > 0 ? `${info.ttlDays} hari` : 'berhari-hari'}: ketik *!premium check*`,
        });
        return;
      }
      const expLine = info.expiresAt
        ? `├ Berlaku sampai: ${info.expiresAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} (${daysLeft(info.expiresAt)})\n`
        : '├ Belum ada memory tersimpan\n';
      await context.socket.sendMessage(from, {
        text: `🧠 *Memory AI*\n├ Tier: *${info.tier.toUpperCase()}*\n├ Durasi: ${info.ttlDays} hari (refresh tiap chat)\n${expLine}└ Turn tersimpan: ±${info.turns}`,
      });
      return;
    }

    await context.socket.sendMessage(from, {
      text: `🧠 *Memory AI*\n\n• *!memory status* — cek status memory\n• *!memory clear* — hapus memory`,
    });
  },
};

export default command;
