import type { CommandModule } from '../../types/index.js';
import { getAllSessions } from '../../session/sessionHelper.js';

const listSessionsCommand: CommandModule = {
  config: {
    name: 'list_sessions',
    aliases: ['ls', 'sessions'],
    description: 'List all active sessions',
    usage: '!list_sessions',
    category: 'session',
    adminOnly: true,
  },
  handler: async function (context, args: string[]): Promise<void> {
    const sessions = await getAllSessions();
    const sessionList = Array.from(sessions.keys()).join('\n- ');
    const listText = `📱 *Active Sessions*

${sessionList ? '- ' + sessionList : 'No active sessions'}

Current session: ${context.sessionId}`;

    await context.socket.sendMessage(context.fromJid, {
      text: listText,
    });
  },
};

export default listSessionsCommand;
