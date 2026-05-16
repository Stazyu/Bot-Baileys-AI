import type { CommandModule } from '../../types/index.js';
import type { WASocket } from '@innovatorssoft/baileys';
import { proto } from 'baileys';

const evalCommand: CommandModule = {
    config: {
        name: 'eval',
        aliases: ['ev'],
        description: 'Evaluate JavaScript code with bot context',
        usage: '!eval\n<code>',
        category: 'owner',
        ownerOnly: true,
    },
    handler: async function (context, args: string[]): Promise<void> {
        const code = args.join('\n');

        if (!code.trim()) {
            await context.socket.sendMessage(context.fromJid, {
                text: '❌ Please provide code to evaluate\n\nUsage: `!eval` followed by your code',
            });
            return;
        }

        try {
            const sock: WASocket = context.socket;
            const m: proto.IMessage = context.message.message!;
            const jid: string = context.fromJid;
            const senderJid: string = context.simplified?.user_id || context.fromJid;
            const isGroup: boolean = jid.endsWith('@g.us');
            const groupMetadata = isGroup ? await sock.groupMetadata(jid) : null;

            const send = (text: string) => sock.sendMessage(jid, { text });
            const reply = (text: string) => sock.sendMessage(jid, { text }, { quoted: context.message });

            const fn = new Function('sock', 'm', 'jid', 'sender', 'isGroup', 'groupMetadata', 'send', 'reply', `return (async () => { ${code} })()`);
            const result = await fn(sock, m, jid, senderJid, isGroup, groupMetadata, send, reply);
            const output = result !== undefined ? String(result) : 'undefined';

            await sock.sendMessage(jid, {
                text: `Input:\n\`\`\`\n${code}\n\`\`\`\n\n✅ Output:\n\`\`\`\n${output}\n\`\`\``,
            });
        } catch (error) {
            await context.socket.sendMessage(context.fromJid, {
                text: `❌ Error:\n\`\`\`\n${(error as Error).message}\n\`\`\``,
            });
        }
    },
};

export default evalCommand;