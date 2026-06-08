import type { CommandModule } from '../../types/index.js';
import { getOwnerNumbers, getPrefixes } from '../../config/botConfig.js';
import moment from 'moment';

const reportbugCommand: CommandModule = {
  config: {
    name: 'reportbug',
    aliases: ['bug', 'lapor', 'report'],
    description: 'Laporkan bug atau masalah ke owner bot',
    usage: '!reportbug <deskripsi bug>',
    category: 'basic',
  },
  handler: async function (context, args: string[]): Promise<void> {
    const message = args.join(' ').trim();

    if (!message) {
      await context.socket.sendMessage(context.fromJid, {
        text: `❌ Format: ${context.simplified?.prefix || '!'}reportbug <deskripsi bug>\n\nContoh: ${context.simplified?.prefix || '!'}reportbug Fitur download TikTok tidak bekerja untuk link tertentu`,
      });
      return;
    }

    const userJid = context.simplified?.user_id || context.fromJid;
    const pushName = context.simplified?.pushName || 'Unknown';
    const isGroup = context.simplified?.isGroup;
    const groupName = context.simplified?.groupName || '-';

    const time = moment().utcOffset(7).format('DD/MM/YYYY HH:mm:ss');

    const reportText = `🐛 *LAPORAN BUG*\n\n` +
      `👤 *Dari:* ${pushName} (${userJid.split('@')[0]})\n` +
      `🕐 *Waktu:* ${time}\n` +
      `🏠 *Lokasi:* ${isGroup ? `Grup: ${groupName}` : 'Private Chat'}\n\n` +
      `📝 *Pesan:*\n${message}`;

    const owners: string[] = ['6283104500832@s.whatsapp.net'];

    if (owners.length === 0) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Tidak ada nomor owner yang terdaftar. Laporan tidak dapat dikirim.',
      });
      return;
    }

    let sentCount = 0;
    for (const owner of owners) {
      try {
        await context.socket.sendMessage(owner, { text: reportText });
        sentCount++;
      } catch (error) {
        console.error(`Failed to send bug report to owner ${owner}:`, error);
      }
    }

    if (sentCount > 0) {
      await context.socket.sendMessage(context.fromJid, {
        text: `✅ Laporan bug berhasil dikirim ke ${sentCount} owner. Terima kasih atas laporannya!`,
      });
    } else {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Gagal mengirim laporan ke owner. Silakan coba lagi nanti.',
      });
    }
  },
};

export default reportbugCommand;
