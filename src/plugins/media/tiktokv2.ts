import type { CommandModule } from '../../types/index.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Tiktok = require('@tobyg74/tiktok-api-dl');

function normalizeResult(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (data.video && typeof data.video.playAddr === 'string') {
    return {
      ...data,
      author: {
        ...data.author,
        username: data.author?.nickname || '',
      },
      statistics: {
        likeCount: String(data.statistics?.likeCount || '0'),
        commentCount: String(data.statistics?.commentCount || '0'),
        shareCount: String(data.statistics?.shareCount || '0'),
      },
      video: {
        playAddr: [data.video.playAddr],
      },
    };
  }
  return data;
}

const tiktokv2Command: CommandModule = {
  config: {
    name: 'tiktokv2',
    aliases: ['ttv2'],
    description: 'Download video from TikTok (v2)',
    usage: '!tiktokv2 <tiktok-url>',
    category: 'media',
  },
  handler: async function (context, args: string[]): Promise<void> {
    const url = args[0];

    if (!url) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Please provide a TikTok URL. Usage: !tiktokv2 <tiktok-url>',
      });
      return;
    }

    await context.socket.sendMessage(context.fromJid, {
      text: '⏳ Sedang mengunduh video TikTok (v2)...',
    });

    try {
      const result = await Tiktok.Downloader(url, {
        version: 'v2',
      });

      
      if (result.status === 'success' && result.result) {
        result.result = normalizeResult(result.result);
      }
      
      const processTime = new Date().getTime() - Number(context.simplified?.messageTimeStamp) * 1000;

      if (result.status === 'success' && result.result) {
        const data = result.result;
        const caption = `🎵 *TikTok Download (v2)*\n\n` +
          `👤 *Author:* ${data.author.nickname}${data.author.username ? ` (@${data.author.username})` : ''}\n` +
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
        } else {
          await context.socket.sendMessage(context.fromJid, {
            text: `❌ Tipe media tidak didukung: ${data.type}`,
          });
        }
      } else {
        await context.socket.sendMessage(context.fromJid, {
          text: `❌ Gagal mengunduh video dari TikTok.\n\n${result.message || 'Pastikan URL benar'}\n\nBila masalah berlanjut, silahkan hubungi Owner`,
        });
      }
    } catch (error) {
      console.error('Error downloading TikTok v2:', error);
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Terjadi kesalahan saat mengunduh video TikTok. Silahkan coba lagi nanti.',
      });
    }
  },
};

export default tiktokv2Command;
