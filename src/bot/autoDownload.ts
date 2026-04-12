import nexo from 'nexo-aio-downloader';
import type { WASocket } from 'baileys';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Tiktok = require('@tobyg74/tiktok-api-dl');

export type SocialMediaPlatform = 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'twitter' | 'unknown';

export interface SocialMediaLink {
  platform: SocialMediaPlatform;
  url: string;
}

export interface DownloadResult {
  success: boolean;
  url?: string;
  type?: 'video' | 'image' | 'audio';
  error?: string;
}

/**
 * Detect social media links from text
 */
export function detectSocialMediaLink(text: string): SocialMediaLink | null {
  if (!text) return null;

  const patterns = {
    instagram: /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:p|reel|tv)\/[\w-]+/i,
    tiktok: /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com|vm\.tiktok\.com)\/@[\w.-]+\/[\w-]+(?:\/[\w-]+)*/i,
    youtube: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/i,
    facebook: /(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.watch)\/[\w.-]+/i,
    twitter: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[\w.-]+\/status\/[\w-]+/i,
  };

  for (const [platform, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    if (match) {
      return {
        platform: platform as SocialMediaPlatform,
        url: match[0],
      };
    }
  }

  return null;
}

/**
 * Download media from social media platform
 */
export async function downloadFromSocialMedia(
  link: SocialMediaLink,
  socket: WASocket,
  fromJid: string
): Promise<DownloadResult> {
  try {
    await socket.sendMessage(fromJid, {
      text: '⏳ Mendeteksi link, mohon tunggu...',
    });

    switch (link.platform) {
      case 'instagram':
        return await downloadInstagram(link.url, socket, fromJid);
      case 'tiktok':
        return await downloadTikTok(link.url, socket, fromJid);
      case 'youtube':
        return await downloadYouTube(link.url, socket, fromJid);
      case 'facebook':
        return await downloadFacebook(link.url, socket, fromJid);
      case 'twitter':
        return await downloadTwitter(link.url, socket, fromJid);
      default:
        return {
          success: false,
          error: 'Platform tidak didukung',
        };
    }
  } catch (error) {
    console.error('Error downloading from social media:', error);
    return {
      success: false,
      error: 'Gagal mendownload media',
    };
  }
}

async function downloadInstagram(url: string, socket: WASocket, fromJid: string): Promise<DownloadResult> {
  try {
    const result = await nexo.instagram(url);

    if (result.data?.url && result.data.url.length > 0) {
      const mediaUrl = result.data.url[0];
      const isVideo = result.data.isVideo;

      if (isVideo) {
        await socket.sendMessage(fromJid, {
          video: { url: mediaUrl },
          caption: '📸 Instagram Video\n\n_Downloaded automatically_',
        });
      } else {
        await socket.sendMessage(fromJid, {
          image: { url: mediaUrl },
          caption: '📸 Instagram Photo\n\n_Downloaded automatically_',
        });
      }

      return {
        success: true,
        url: mediaUrl,
        type: isVideo ? 'video' : 'image',
      };
    }

    return {
      success: false,
      error: 'Gagal mengambil media dari Instagram',
    };
  } catch (error) {
    console.error('Instagram download error:', error);
    return {
      success: false,
      error: 'Gagal mendownload dari Instagram',
    };
  }
}

async function downloadTikTok(url: string, socket: WASocket, fromJid: string): Promise<DownloadResult> {
  try {
    console.log('Downloading TikTok:', url);
    const result = await Tiktok.Downloader(url, {
      version: 'v1',
    });

    console.log('TikTok download result:', result);

    if (result.status !== 'success') {
      return {
        success: false,
        error: 'Gagal mengambil media dari TikTok',
      };
    }

    if (result.status === 'success' && result.result) {
      const data = result.result;
      const caption = `🎵 *TikTok Download*\n\n` +
        `👤 *Author:* ${data.author.nickname} (@${data.author.username})\n` +
        `❤️ *Likes:* ${data.statistics.likeCount}\n` +
        `💬 *Comments:* ${data.statistics.commentCount}\n` +
        `🔗 *Shares:* ${data.statistics.shareCount}\n\n` +
        `_Downloaded automatically_`;

      if (data.type === 'video' && data.video) {
        const videoUrl = data.video.playAddr[0];

        if (!videoUrl) {
          return {
            success: false,
            error: 'Gagal mengambil media dari TikTok: URL tidak ditemukan',
          };
        }

        await socket.sendMessage(fromJid, {
          video: { url: videoUrl },
          caption: caption,
        });

        return {
          success: true,
          url: videoUrl,
          type: 'video',
        };
      } else if (data.type === 'image' && data.images && data.images.length > 0) {
        const imageUrl = data.images[0];
        await socket.sendMessage(fromJid, {
          image: { url: imageUrl },
          caption: caption,
        });

        return {
          success: true,
          url: imageUrl,
          type: 'image',
        };
      }
    }

    return {
      success: false,
      error: 'Gagal mengambil media dari TikTok',
    };
  } catch (error) {
    console.error('TikTok download error:', error);
    return {
      success: false,
      error: 'Gagal mendownload dari TikTok',
    };
  }
}

async function downloadYouTube(url: string, socket: WASocket, fromJid: string): Promise<DownloadResult> {
  try {
    const result = await nexo.youtube(url);

    if (result.data?.result) {
      // YouTube return Buffer, perlu handle berbeda
      await socket.sendMessage(fromJid, {
        text: '🎥 YouTube download belum diimplementasi penuh. Gunakan command !youtube untuk manual download.',
      });
      return {
        success: false,
        error: 'Fitur YouTube auto-download belum tersedia',
      };
    }

    return {
      success: false,
      error: 'Gagal mengambil media dari YouTube',
    };
  } catch (error) {
    console.error('YouTube download error:', error);
    return {
      success: false,
      error: 'Gagal mendownload dari YouTube',
    };
  }
}

async function downloadFacebook(url: string, socket: WASocket, fromJid: string): Promise<DownloadResult> {
  try {
    const result = await nexo.facebook(url);

    if (result.data?.result && result.data.result.length > 0) {
      const mediaUrl = result.data.result[0].url;

      await socket.sendMessage(fromJid, {
        video: { url: mediaUrl },
        caption: '📘 Facebook Video\n\n_Downloaded automatically_',
      });

      return {
        success: true,
        url: mediaUrl,
        type: 'video',
      };
    }

    return {
      success: false,
      error: 'Gagal mengambil media dari Facebook',
    };
  } catch (error) {
    console.error('Facebook download error:', error);
    return {
      success: false,
      error: 'Gagal mendownload dari Facebook',
    };
  }
}

async function downloadTwitter(url: string, socket: WASocket, fromJid: string): Promise<DownloadResult> {
  try {
    const result = await nexo.twitter(url);

    if (result.data?.result && result.data.result.length > 0) {
      const mediaUrl = result.data.result[0].url;

      await socket.sendMessage(fromJid, {
        video: { url: mediaUrl },
        caption: '🐦 Twitter/X Video\n\n_Downloaded automatically_',
      });

      return {
        success: true,
        url: mediaUrl,
        type: 'video',
      };
    }

    return {
      success: false,
      error: 'Gagal mengambil media dari Twitter',
    };
  } catch (error) {
    console.error('Twitter download error:', error);
    return {
      success: false,
      error: 'Gagal mendownload dari Twitter',
    };
  }
}
