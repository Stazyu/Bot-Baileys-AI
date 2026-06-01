import type { CommandModule } from '../../types/index.js';

const setGroupCommand: CommandModule = {
  config: {
    name: 'setgroup',
    aliases: ['close', 'open', 'tutup', 'buka'],
    description: 'Open or close group (admin only)',
    usage: '!close or !open',
    category: 'group',
    adminOnly: true,
    groupOnly: true,
  },
  handler: async function (context, args: string[]): Promise<void> {
    const isGroup = context.fromJid.endsWith('@g.us');

    if (!isGroup) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ This command can only be used in groups',
      });
      return;
    }

    const command = context.simplified?.command?.toLowerCase();

    try {
      if (command === 'close' || command === 'tutup') {
        await context.socket.groupSettingUpdate(context.fromJid, 'announcement');
        await context.socket.sendMessage(context.fromJid, {
          text: '🔒 Group has been closed. Only admins can send messages now.',
        });
      } else if (command === 'open' || command === 'buka') {
        await context.socket.groupSettingUpdate(context.fromJid, 'not_announcement');
        await context.socket.sendMessage(context.fromJid, {
          text: '🔓 Group has been opened. All members can send messages now.',
        });
      }
    } catch (error) {
      console.error('❌ [SetGroup] Error:', error);
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Failed to update group settings. Make sure the bot is an admin in the group.',
      });
    }
  },
};

export default setGroupCommand;
