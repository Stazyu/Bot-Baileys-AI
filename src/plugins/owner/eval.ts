import type { CommandModule } from '../../types/index.js';
import type { WASocket } from '@innovatorssoft/baileys';
import { proto } from 'baileys';
import util from 'util';

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
        console.log('Code: ', context);

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

            const botNum = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';

            const AsyncFunction =
                Object.getPrototypeOf(async function () { }).constructor;

            const wrappedCode = code.includes('return')
                ? code
                : `return (${code})`;

            const fn = new AsyncFunction(
                'context',
                'sock',
                'm',
                'jid',
                'sender',
                'isGroup',
                'groupMetadata',
                'send',
                'reply',
                'botNumber',
                wrappedCode
            );
            const result = await fn(context, sock, m, jid, senderJid, isGroup, groupMetadata, send, reply, botNum);
            const output =
                result !== undefined
                    ? util.inspect(result, {
                        depth: 2,
                        colors: false,
                        maxArrayLength: 50,
                    })
                    : 'undefined';

            await sock.sendMessage(jid, {
                text: `Input:\n\`\`\`\n${code}\n\`\`\`\n\n Output:\n\`\`\`\n${output}\n\`\`\``,
            });
        } catch (error) {
            await context.socket.sendMessage(context.fromJid, {
                text: `Input:\n\`\`\`\n${code}\n\`\`\`\n\n Error:\n\`\`\`\n${util.inspect(error, {
                    depth: 2
                })}\n\`\`\``,
            });
        }
    },
};

export default evalCommand;