import type { CommandModule } from '../../types/index.js';
import { createSession } from '../../session/sessionHelper.js';

const createSessionCommand: CommandModule = {
  config: {
    name: 'create_session',
    aliases: ['cs', 'new_session'],
    description: 'Create a new session',
    usage: '!create_session <session-id>',
    category: 'session',
    adminOnly: true,
  },
  handler: async function (context, args: string[]): Promise<void> {
    const newSessionId = args[0];

    if (!newSessionId) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Please provide a session ID. Usage: !create_session <session-id>',
      });
      return;
    }

    try {
      await createSession(newSessionId);
      await context.socket.sendMessage(context.fromJid, {
        text: `✅ Session "${newSessionId}" created successfully. Check the terminal for QR code.`,
      });
    } catch (error) {
      await context.socket.sendMessage(context.fromJid, {
        text: `❌ Failed to create session: ${error}`,
      });
    }
  },
};

export default createSessionCommand;
