import type { CommandModule } from '../../types/index.js';
import { getPrefixes } from '../../config/botConfig.js';

const categoryIcons: Record<string, string> = {
  basic: '📂',
  ai: '🤖',
  group: '👥',
  media: '🎬',
  owner: '👑',
  session: '🔐',
};

const autoFeatureIcons: Record<string, string> = {
  instagram: '📸',
  tiktok: '🎵',
  facebook: '📘',
  twitter: '🐦',
  youtube: '🎥',
};

const helpCommand: CommandModule = {
  config: {
    name: 'help',
    aliases: ['h', 'menu'],
    description: 'Tampilkan perintah yang tersedia',
    usage: '!help',
    category: 'basic',
  },
  handler: async function (context, args: string[]): Promise<void> {
    const pm = context.pluginManager;
    if (!pm) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Plugin manager tidak tersedia',
      });
      return;
    }

    const prefixes = getPrefixes();
    const matchedPrefix = context.simplified?.matchedPrefix || prefixes[0] || '!';

    const allCommands = pm.getAllCommands();

    if (args.length > 0) {
      const commandName = args[0].toLowerCase();
      const command = pm.getCommand(commandName);

      if (command) {
        const aliasesText = command.config.aliases
          ? `\n┃ ✦ *Alias:* ${command.config.aliases.map((a: string) => `\`${matchedPrefix}${a}\``).join(', ')}`
          : '';

        const helpText =
`╭━━━「 📖 *${command.config.name}* 」━━━╮
┃
┃ ${command.config.description}
┃
┃ ✦ *Pakai:* \`${command.config.usage.replace('!', matchedPrefix)}\`${aliasesText}
┃ ✦ *Kategori:* ${categoryIcons[command.config.category || ''] || '📁'} ${command.config.category || 'general'}
┃ ✦ *Admin:* ${command.config.adminOnly ? '✅ Ya' : '❌ Tidak'}
┃ ✦ *Owner:* ${command.config.ownerOnly ? '✅ Ya' : '❌ Tidak'}
┃
╰━━━━━━━━━━━━━━━━━━╯`;

        await context.socket.sendMessage(context.fromJid, {
          text: helpText,
        });
      } else {
        await context.socket.sendMessage(context.fromJid, {
          text: `❌ Perintah \`${matchedPrefix}${commandName}\` tidak ditemukan.`,
        });
      }
    } else {
      const categories = new Map<string, Array<{ config: any; plugin: string }>>();

      for (const cmd of allCommands) {
        const category = cmd.config.category || 'general';
        if (!categories.has(category)) {
          categories.set(category, []);
        }
        categories.get(category)!.push(cmd);
      }

      let helpText =
`╭━━━━━━━━━━━━━━━━━━╮
┃      🤖 *BOT MENU*     
┃   _Baileys WhatsApp Bot_
╰━━━━━━━━━━━━━━━━━━╯

`;

      helpText +=
`╭━━━「 ⚡ *AUTO FITUR* 」━━━╮
┃
${['Instagram', 'TikTok', 'Facebook', 'Twitter/X', 'YouTube'].map(p => `┃ ${autoFeatureIcons[p.toLowerCase().replace('/', '').replace('x', 'twitter')] || '🔗'} *${p}* — Auto download`).join('\n')}
┃
╰━━━━━━━━━━━━━━━━━━╯

`;

      for (const [category, commands] of categories.entries()) {
        const icon = categoryIcons[category] || '📁';
        const catName = category.charAt(0).toUpperCase() + category.slice(1);

        helpText +=
`╭━━━「 ${icon} *${catName}* 」━━━╮
┃
${commands.map(cmd => {
  const aliases = cmd.config.aliases?.length ? ` _(${cmd.config.aliases.slice(0, 2).join(', ')}${cmd.config.aliases.length > 2 ? ',...' : ''})_` : '';
  return `┃ ✦ \`${matchedPrefix}${cmd.config.name}\`${aliases}\n┃   ${cmd.config.description}`;
}).join('\n┃\n')}
┃
╰━━━━━━━━━━━━━━━━━━╯

`;
      }

      helpText +=
`╭━━━「 📌 *INFO* 」━━━╮
┃
┃ ✦ *Sesi:* ${context.sessionId}
┃ ✦ *Prefix:* \`${matchedPrefix}\`
┃ ✦ *Gunakan* \`${matchedPrefix}help <cmd>\` *untuk detail*
┃
╰━━━━━━━━━━━━━━━━━━╯`;

      await context.socket.sendMessage(context.fromJid, {
        text: helpText,
      });
    }
  },
};

export default helpCommand;
