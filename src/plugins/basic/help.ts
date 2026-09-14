import type { CommandModule, CommandConfig } from '../../types/index.js';
import { getPrefixes, isOwner } from '../../config/botConfig.js';

const categoryIcons: Record<string, string> = {
  basic: '📂',
  ai: '🤖',
  group: '👥',
  media: '🎬',
  owner: '👑',
  session: '🔐',
  general: '📁',
};

const autoFeatureIcons: Record<string, string> = {
  instagram: '📸',
  tiktok: '🎵',
  facebook: '📘',
  twitter: '🐦',
  youtube: '🎥',
};

interface CommandEntry {
  config: CommandConfig;
  plugin: string;
}

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

    const senderJid = context.simplified?.user_id || context.fromJid || '';
    const isOwnerUser = isOwner(senderJid);

    const allCommands = pm.getAllCommands();

    if (args.length > 0) {
      const commandName = args[0].toLowerCase();
      const command = pm.getCommand(commandName);

      if (command && (!command.config.ownerOnly || isOwnerUser)) {
        const aliasesText = command.config.aliases
          ? `\n┃ ✦ *Alias:* ${command.config.aliases.map((a: string) => `\`${matchedPrefix}${a}\``).join(', ')}`
          : '';

        const helpText =
`╭━━━━━「 📖 *${command.config.name.toUpperCase()}* 」━━━━━╮
┃
┃ ${command.config.description}
┃
┃ ✦ *Pakai:* \`${command.config.usage.replace('!', matchedPrefix)}\`${aliasesText}
┃ ✦ *Kategori:* ${categoryIcons[command.config.category || ''] || '📁'} ${command.config.category || 'general'}
┃ ✦ *Admin:* ${command.config.adminOnly ? '✅ Ya' : '❌ Tidak'}
┃ ✦ *Owner:* ${command.config.ownerOnly ? '✅ Ya' : '❌ Tidak'}
┃ ✦ *Premium:* ${command.config.premiumOnly ? '✅ Ya' : '❌ Tidak'}
┃
╰━━━━━━━━━━━━━━━━━━━━╯`;

        await context.socket.sendMessage(context.fromJid, {
          text: helpText,
        });
      } else {
        await context.socket.sendMessage(context.fromJid, {
          text: `❌ Perintah \`${matchedPrefix}${commandName}\` tidak ditemukan.`,
        });
      }
    } else {
      const categories = new Map<string, CommandEntry[]>();

      for (const cmd of allCommands) {
        // Hide owner-only commands from non-owner users.
        if (cmd.config.ownerOnly && !isOwnerUser) {
          continue;
        }

        const category = cmd.config.category || 'general';
        if (!categories.has(category)) {
          categories.set(category, []);
        }
        categories.get(category)!.push(cmd);
      }

      let helpText =
`╭━━━━━━━━━━━━━━━━━━━╮
┃    🤖 *BOT MENU*     
┃   ✦ _Staz AI Bot_ ✦
╰━━━━━━━━━━━━━━━━━━━╯

`;

      helpText +=
`╭━━━「 ⚡ *AUTO FITUR* 」━━━╮
┃
${['Instagram', 'TikTok', 'Facebook', 'Twitter/X', 'YouTube'].map(p => `┃ ${autoFeatureIcons[p.toLowerCase().replace('/', '').replace('x', 'twitter')] || '🔗'} *${p}* — Auto download`).join('\n')}
┃
╰━━━━━━━━━━━━━━━━━━━╯

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
╰━━━━━━━━━━━━━━━━━━━╯

`;
      }

      helpText +=
`╭━━━「 📌 *INFO* 」━━━╮
┃
┃ ✦ *Sesi:* ${context.sessionId}
┃ ✦ *Prefix:* \`${matchedPrefix}\`
┃ ✦ *Gunakan* \`${matchedPrefix}help <cmd>\` *untuk detail*
┃
╰━━━━━━━━━━━━━━━━━━━╯

`;

      helpText +=
`╭━━━「 ⚖️ *SYARAT & KETENTUAN (S&K)* 」━━━╮
┃
┃ 1. Bot ini bersifat _otomatis_ & tanpa jaminan.
┃ 2. Dilarang keras memakai bot untuk hal
┃    _ilegal, spam, ataupun melanggar hukum_.
┃ 3. Penyalahgunaan fitur menjadi tanggung jawab
┃    _pengguna sepenuhnya_.
┃ 4. Pemilik bot berhak _memblokir / membatasi_
┃    akses pengguna tanpa pemberitahuan.
┃ 5. Jangan pernah mengirimkan _data pribadi atau sensitif_
┃    ke bot.
┃ 6. Dengan memakai bot, kamu dianggap
┃    _menyetujui_ seluruh ketentuan ini.
┃
╰━━━━━━━━━━━━━━━━━━━╯`;

      await context.socket.sendMessage(context.fromJid, {
        text: helpText,
      });
    }
  },
};

export default helpCommand;
