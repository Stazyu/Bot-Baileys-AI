import type { CommandModule } from '../../types/index.js';

const hidetagCommand: CommandModule = {
  config: {
    name: 'hidetag',
    aliases: ['h', 'ht', 'tagall'],
    description: 'Send a hidden tag message to all group members (admin only)',
    usage: '!hidetag <message>',
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

    const message = args.join(' ');
    if (!message) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Please provide a message to send\n\nUsage: !hidetag <message>',
      });
      return;
    }

    try {
      // Get group metadata to get all participants
      const metadata = await context.socket.groupMetadata(context.fromJid);
      const participants = metadata.participants.map((p: any) => p.id);

      // Send message with hidden mentions
      await context.socket.sendMessage(context.fromJid, {
        text: message,
        mentions: participants,
      });

      console.log(`✅ [Hidetag] Message sent to ${participants.length} participants in group ${context.fromJid}`);
    } catch (error) {
      console.error('❌ [Hidetag] Error:', error);
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Failed to send hidetag message. Make sure the bot is an admin in the group.',
      });
    }
  },
};

export default hidetagCommand;
