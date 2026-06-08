import type { CommandModule } from '../../types/index.js';
import { isOwner } from '../../config/botConfig.js';
import { isAIGroupEnabled, setAIGroupEnabled } from '../../services/groupToggle.js';

const togglebotCommand: CommandModule = {
  config: {
    name: 'aigroup',
    aliases: ['gai', 'aiGroup'],
    description: 'Aktifkan/nonaktifkan AI di grup ini',
    usage: '!aigroup on / !aigroup off',
    category: 'group',
  },
  handler: async function (context, args: string[]): Promise<void> {
    if (!context.fromJid.endsWith('@g.us')) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Perintah ini hanya bisa digunakan di grup.',
      });
      return;
    }

    const userId = context.simplified?.user_id || context.fromJid;
    const participantJid = userId;

    const isGroupAdmin = await (async () => {
      if (context.fromMe || isOwner(participantJid)) return true;
      try {
        const metadata = await context.socket.groupMetadata(context.fromJid);
        const participant = metadata.participants.find((p: any) =>
          participantJid.includes(p.id.split('@')[0])
        );
        return participant?.admin === 'admin' || participant?.admin === 'superadmin';
      } catch {
        return false;
      }
    })();

    if (!isGroupAdmin) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Hanya admin grup yang bisa menggunakan perintah ini.',
      });
      return;
    }

    const action = args[0]?.toLowerCase();
    const currentStatus = isAIGroupEnabled(context.fromJid);

    if (!action || (action !== 'on' && action !== 'off')) {
      const statusText = currentStatus ? '🟢 *Aktif*' : '🔴 *Nonaktif*';
      await context.socket.sendMessage(context.fromJid, {
        text: `📋 *Status AI di Grup Ini:* ${statusText}\n\nGunakan:\n• \`${context.simplified?.prefix || '!'}aigroup on\` — Aktifkan AI\n• \`${context.simplified?.prefix || '!'}aigroup off\` — Nonaktifkan AI`,
      });
      return;
    }

    if (action === 'on') {
      if (currentStatus) {
        await context.socket.sendMessage(context.fromJid, {
          text: '🟢 AI sudah aktif di grup ini.',
        });
        return;
      }
      await setAIGroupEnabled(context.fromJid, true);
      await context.socket.sendMessage(context.fromJid, {
        text: '🟢 AI telah *diaktifkan* di grup ini.',
      });
    } else {
      if (!currentStatus) {
        await context.socket.sendMessage(context.fromJid, {
          text: '🔴 AI sudah nonaktif di grup ini.',
        });
        return;
      }
      await setAIGroupEnabled(context.fromJid, false);
      await context.socket.sendMessage(context.fromJid, {
        text: '🔴 AI telah *dinonaktifkan* di grup ini.',
      });
    }
  },
};

export default togglebotCommand;
