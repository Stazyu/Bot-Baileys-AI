import type { CommandModule } from '../../types/index.js';

const testOwnerCommand: CommandModule = {
    config: {
        name: 'test_owner',
        aliases: ['to'],
        description: 'Test owner command',
        usage: '!test_owner',
        category: 'owner',
        ownerOnly: true,
    },
    handler: async function (context, args: string[]): Promise<void> {
        await context.socket.sendMessage(context.fromJid, {
            text: '✅ Owner command test successful!',
        });
    },
};

export default testOwnerCommand;