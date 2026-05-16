import { exec } from 'child_process';
import { promisify } from 'util';
import type { CommandModule } from '../../types/index.js';

const execAsync = promisify(exec);

const execCommand: CommandModule = {
    config: {
        name: 'exec',
        aliases: ['ex'],
        description: 'Execute shell commands',
        usage: '!exec <command>',
        category: 'owner',
        ownerOnly: true,
    },
    handler: async function (context, args: string[]): Promise<void> {
        const command = args.join(' ');
        
        if (!command) {
            await context.socket.sendMessage(context.fromJid, {
                text: '❌ Please provide a command to execute',
            });
            return;
        }

        try {
            const { stdout, stderr } = await execAsync(command, { timeout: 60000 });
            
            let output = '';
            if (stdout) output += `📤 stdout:\n\`\`\`\n${stdout}\n\`\`\``;
            if (stderr) output += `\n📛 stderr:\n\`\`\`\n${stderr}\n\`\`\``;
            if (!output) output = '✅ Command executed with no output';
            
            await context.socket.sendMessage(context.fromJid, {
                text: output,
            });
        } catch (error) {
            const err = error as { message?: string; stderr?: string };
            await context.socket.sendMessage(context.fromJid, {
                text: `❌ Error:\n\`\`\`\n${err.stderr || err.message}\n\`\`\``,
            });
        }
    },
};

export default execCommand;