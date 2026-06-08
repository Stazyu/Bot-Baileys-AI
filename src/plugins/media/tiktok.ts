import type { CommandModule } from '../../types/index.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Tiktok = require('@tobyg74/tiktok-api-dl');

function normalizeResult(data: any, version: string): any {
  if (!data || typeof data !== 'object') return data;

  if (version === 'v3' && (data.videoHD || data.videoWatermark)) {
    return {
      ...data,
      author: {
        nickname: data.author?.nickname || 'Unknown',
        username: data.author?.nickname || '',
      },
      statistics: {
        likeCount: '',
        commentCount: '',
        shareCount: '',
      },
      video: {
        playAddr: [data.videoHD || data.videoWatermark],
      },
    };
  }

  if (version === 'v2' && data.video && typeof data.video.playAddr === 'string') {
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

function buildCaption(data: any, processTime: number, version: string): string {
  const authorText = data.author.username
    ? `${data.author.nickname} (@${data.author.username})`
    : data.author.nickname;

  const statsPart = [
    data.statistics.likeCount ? `❤️ *Likes:* ${data.statistics.likeCount}` : '',
    data.statistics.commentCount ? `💬 *Comments:* ${data.statistics.commentCount}` : '',
    data.statistics.shareCount ? `🔗 *Shares:* ${data.statistics.shareCount}` : '',
  ].filter(Boolean).join('\n');

  const versionTag = version !== 'v1' ? ` (${version.toUpperCase()})` : '';

  return `🎵 *TikTok Download${versionTag}*\n\n` +
    `👤 *Author:* ${authorText}\n` +
    (statsPart ? `${statsPart}\n\n` : '\n') +
    `⏱️ Process Time: ${(processTime / 1000).toFixed(2)} seconds`;
}

const tiktokCommand: CommandModule = {
  config: {
    name: 'tiktok',
    aliases: ['tt', 'tiktokdl'],
    description: 'Download video from TikTok. Gunakan --v2 atau --v3 untuk versi lain',
    usage: '!tiktok <url> [--v2|--v3]',
    category: 'media',
  },
  handler: async function (context, args: string[]): Promise<void> {
    const url = args.find(a => !a.startsWith('--'));
    const flags = args.filter(a => a.startsWith('--'));
    const version = flags.includes('--v3') ? 'v3' : flags.includes('--v2') ? 'v2' : 'v1';

    if (!url) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Please provide a TikTok URL. Usage: !tiktok <url> [--v2|--v3]',
      });
      return;
    }

    await context.socket.sendMessage(context.fromJid, {
      text: `⏳ Sedang mengunduh video TikTok${version !== 'v1' ? ` (${version.toUpperCase()})` : ''}...`,
    });

    try {
      const result = await Tiktok.Downloader(url, { version });

      if (result.status === 'success' && result.result) {
        result.result = normalizeResult(result.result, version);
      }

      const processTime = new Date().getTime() - Number(context.simplified?.messageTimeStamp) * 1000;

      if (result.status === 'success' && result.result) {
        const data = result.result;
        const caption = buildCaption(data, processTime, version);

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
      console.error('Error downloading TikTok:', error);
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Terjadi kesalahan saat mengunduh video TikTok. Silahkan coba lagi nanti.',
      });
    }
  },
};

export default tiktokCommand;
