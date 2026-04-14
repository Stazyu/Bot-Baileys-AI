import type { CommandModule } from '../../types/index.js';
import { getPrefixes } from '../../config/botConfig.js';

const helpCommand: CommandModule = {
  config: {
    name: 'help',
    aliases: ['h', 'menu'],
    description: 'Tampilkan perintah yang tersedia',
    usage: '!help',
    category: 'basic',
  },
  handler: async function (context, args: string[]): Promise<void> {
    // Use the pluginManager from context if available
    const pm = context.pluginManager;
    if (!pm) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Plugin manager tidak tersedia',
      });
      return;
    }

    // Get the matched prefix from the message
    const prefixes = getPrefixes();
    const matchedPrefix = context.simplified?.matchedPrefix || prefixes[0] || '!';

    const allCommands = pm.getAllCommands();

    if (args.length > 0) {
      // Show help for specific command
      const commandName = args[0].toLowerCase();
      const command = pm.getCommand(commandName);

      if (command) {
        const aliasesText = command.config.aliases
          ? `\n*Aliases:* ${command.config.aliases.map((a: string) => `${matchedPrefix}${a}`).join(', ')}`
          : '';

        const helpText = `📖 *${command.config.name}*

*Deskripsi:* ${command.config.description}
*Penggunaan:* ${command.config.usage.replace('!', matchedPrefix)}${aliasesText}
*Kategori:* ${command.config.category || 'general'}
*Hanya Admin:* ${command.config.adminOnly ? 'Ya' : 'Tidak'}`;

        await context.socket.sendMessage(context.fromJid, {
          text: helpText,
        });
      } else {
        await context.socket.sendMessage(context.fromJid, {
          text: `❌ Perintah "${matchedPrefix}${commandName}" tidak ditemukan.`,
        });
      }
    } else {
      // Show all commands grouped by category
      const categories = new Map<string, Array<{ config: any; plugin: string }>>();

      for (const cmd of allCommands) {
        const category = cmd.config.category || 'general';
        if (!categories.has(category)) {
          categories.set(category, []);
        }
        categories.get(category)!.push(cmd);
      }

      let helpText = `🤖 *Perintah Bot*\n\n`;

      // Add automatic features section
      helpText += `⚡ *Fitur Otomatis:*\n`;
      helpText += `• Instagram - Auto download foto/video\n`;
      helpText += `• TikTok - Auto download video/foto\n`;
      helpText += `• Facebook - Auto download video\n`;
      helpText += `• Twitter/X - Auto download video\n\n`;

      for (const [category, commands] of categories.entries()) {
        helpText += `*${category.charAt(0).toUpperCase() + category.slice(1)}:*\n`;
        for (const cmd of commands) {
          const aliases = cmd.config.aliases ? ` (${cmd.config.aliases.join(', ')})` : '';
          helpText += `• ${matchedPrefix}${cmd.config.name}${aliases} - ${cmd.config.description}\n`;
        }
        helpText += '\n';
      }

      helpText += `Gunakan ${matchedPrefix}help <perintah> untuk informasi lebih lanjut tentang perintah tertentu.\n\nSesi: ${context.sessionId}`;

      await context.socket.sendMessage(context.fromJid, {
        text: helpText,
      });
    }
  },
};

export default helpCommand;
