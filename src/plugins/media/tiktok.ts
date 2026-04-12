import type { CommandModule } from '../../types/index.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Tiktok = require('@tobyg74/tiktok-api-dl');

const tiktokCommand: CommandModule = {
  config: {
    name: 'tiktok',
    aliases: ['tt', 'tiktokdl'],
    description: 'Download video from TikTok',
    usage: '!tiktok <tiktok-url>',
    category: 'media',
  },
  handler: async function (context, args: string[]): Promise<void> {
    const url = args[0];

    if (!url) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Please provide a TikTok URL. Usage: !tiktok <tiktok-url>',
      });
      return;
    }

    await context.socket.sendMessage(context.fromJid, {
      text: '⏳ Sedang mengunduh video TikTok...',
    });

    try {
      const result = await Tiktok.Downloader(url, {
        version: 'v1',
      });

      const processTime = new Date().getTime() - Number(context.simplified?.messageTimeStamp) * 1000;

      if (result.status === 'success' && result.result) {
        const data = result.result;
        const caption = `🎵 *TikTok Download*\n\n` +
          `👤 *Author:* ${data.author.nickname} (@${data.author.username})\n` +
          `❤️ *Likes:* ${data.statistics.likeCount}\n` +
          `💬 *Comments:* ${data.statistics.commentCount}\n` +
          `🔗 *Shares:* ${data.statistics.shareCount}\n\n` +
          `⏱️ Process Time: ${(processTime / 1000).toFixed(2)} seconds`;

        if (data.type === 'video' && data.video) {
          const videoUrl = data.video.playAddr[0];
          await context.socket.sendMessage(context.fromJid, {
            video: { url: videoUrl },
            caption: caption,
          });
        } else if (data.type === 'image' && data.images) {
          for (const imageUrl of data.images) {
            await context.socket.sendMessage(context.fromJid, {
              image: { url: imageUrl },
              caption: caption,
            });
          }
        }
      } else {
        await context.socket.sendMessage(context.fromJid, {
          text: `❌ Gagal mengunduh video dari TikTok.\n\n${result.message || 'Pastikan URL benar'}\n\nBila masalah berlanjut, silahkan hubungi Owner`,
        });
      }
    } catch (error) {
      console.error('Error downloading TikTok video:', error);
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Terjadi kesalahan saat mengunduh video TikTok. Silahkan coba lagi nanti.',
      });
    }
  },
};

export default tiktokCommand;
