import type { CommandModule } from '../../types/index.js';
import { disconnectSession } from '../../session/sessionHelper.js';

const disconnectSessionCommand: CommandModule = {
  config: {
    name: 'disconnect_session',
    aliases: ['ds', 'kill_session'],
    description: 'Disconnect a session',
    usage: '!disconnect_session <session-id>',
    category: 'session',
    adminOnly: true,
  },
  handler: async function (context, args: string[]): Promise<void> {
    const targetSessionId = args[0];

    if (!targetSessionId) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Please provide a session ID. Usage: !disconnect_session <session-id>',
      });
      return;
    }

    try {
      await disconnectSession(targetSessionId);
      await context.socket.sendMessage(context.fromJid, {
        text: `✅ Session "${targetSessionId}" disconnected successfully.`,
      });
    } catch (error) {
      await context.socket.sendMessage(context.fromJid, {
        text: `❌ Failed to disconnect session: ${error}`,
      });
    }
  },
};

export default disconnectSessionCommand;
