import type { CommandModule } from '../../types/index.js';

const pingCommand: CommandModule = {
  config: {
    name: 'ping',
    aliases: ['p'],
    description: 'Test bot response',
    usage: '!ping',
    category: 'basic',
  },
  handler: async function (context, args: string[]): Promise<void> {
    const startTime = context.simplified?.timeStampHandler!;

    // await context.socket.sendMessage(context.fromJid, {
    //   text: 'Pong! 🏓',
    // });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    await context.socket.sendMessage(context.fromJid, {
      text: `Pong! 🏓\n\n⏱️ Response time: ${responseTime}ms`,
    });
  },
};

export default pingCommand;
