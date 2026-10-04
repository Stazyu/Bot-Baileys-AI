import type { CommandModule } from '../../types/index.js';
import { getCreatorInfo } from '../../config/botConfig.js';

const ownerCommand: CommandModule = {
  config: {
    name: 'owner',
    aliases: ['creator', 'pembuat', 'dev'],
    description: 'Info pembuat bot + sosial medianya',
    usage: '!owner',
    category: 'basic',
  },
  handler: async function (context): Promise<void> {
    const creator = getCreatorInfo();

    if (!creator) {
      await context.socket.sendMessage(context.fromJid, {
        text: 'ℹ️ Info pembuat bot belum diatur.',
      });
      return;
    }

    const socials = Object.entries(creator.socials ?? {}).filter(([, value]) => Boolean(value));

    const lines = [
      '👤 *Pembuat Bot Ini*',
      '',
      `Bot ini dikembangkan dan dirawat oleh *${creator.name}*.`,
    ];

    if (socials.length > 0) {
      lines.push('', '📱 *Sosmed:*', ...socials.map(([key, value]) => `• ${key}: ${value}`));
    }

    if (creator.note) lines.push('', `_${creator.note}_`);

    await context.socket.sendMessage(context.fromJid, { text: lines.join('\n') });
  },
};

export default ownerCommand;
