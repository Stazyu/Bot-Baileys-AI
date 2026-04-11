import type { CommandModule } from '../../types/index.js';
import { getPrefixes } from '../../config/botConfig.js';

const helpCommand: CommandModule = {
  config: {
    name: 'help',
    aliases: ['h', 'menu'],
    description: 'Show available commands',
    usage: '!help',
    category: 'basic',
  },
  handler: async function (context, args: string[]): Promise<void> {
    // Use the pluginManager from context if available
    const pm = context.pluginManager;
    if (!pm) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Plugin manager not available',
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

*Description:* ${command.config.description}
*Usage:* ${command.config.usage.replace('!', matchedPrefix)}${aliasesText}
*Category:* ${command.config.category || 'general'}
*Admin Only:* ${command.config.adminOnly ? 'Yes' : 'No'}`;

        await context.socket.sendMessage(context.fromJid, {
          text: helpText,
        });
      } else {
        await context.socket.sendMessage(context.fromJid, {
          text: `❌ Command "${matchedPrefix}${commandName}" not found.`,
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

      let helpText = `🤖 *Bot Commands*\n\n`;

      for (const [category, commands] of categories.entries()) {
        helpText += `*${category.charAt(0).toUpperCase() + category.slice(1)}:*\n`;
        for (const cmd of commands) {
          const aliases = cmd.config.aliases ? ` (${cmd.config.aliases.join(', ')})` : '';
          helpText += `• ${matchedPrefix}${cmd.config.name}${aliases} - ${cmd.config.description}\n`;
        }
        helpText += '\n';
      }

      helpText += `Use ${matchedPrefix}help <command> for more information about a specific command.\n\nSession: ${context.sessionId}`;

      await context.socket.sendMessage(context.fromJid, {
        text: helpText,
      });
    }
  },
};

export default helpCommand;
