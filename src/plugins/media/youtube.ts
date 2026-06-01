import type { CommandModule, CommandContext } from '../../types/index.js';
import { youtubeDl, type Flags } from 'youtube-dl-exec';
import { promises as fs } from 'fs';
import path from 'path';

interface YoutubeDlOutput {
  id?: string;
  _filename?: string;
  title?: string;
  uploader?: string;
  duration?: number;
  view_count?: number;
  upload_date?: string;
  description?: string;
  webpage_url?: string;
}

const formatDuration = (seconds?: number): string => {
  if (!seconds) return 'N/A';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatViews = (views?: number): string => {
  if (!views) return 'N/A';
  if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
  if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
  return views.toString();
};

const createButtonMessage = (caption: string, videoUrl: string) => ({
  text: caption,
  footer: 'YouTube Downloader',
  interactiveButtons: [
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: '🎵 Audio',
        id: `yt_audio_${Buffer.from(videoUrl).toString('base64')}`
      })
    },
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: '📹 360p',
        id: `yt_360p_${Buffer.from(videoUrl).toString('base64')}`
      })
    },
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: '📹 720p',
        id: `yt_720p_${Buffer.from(videoUrl).toString('base64')}`
      })
    },
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: '📹 Best Quality',
        id: `yt_best_${Buffer.from(videoUrl).toString('base64')}`
      })
    }
  ]
});

const formatUploadDate = (date?: string): string => {
  if (!date) return 'N/A';
  const year = date.substring(0, 4);
  const month = date.substring(4, 6);
  const day = date.substring(6, 8);
  return `${day}-${month}-${year}`;
};

interface YtDlOptions {
  cwd: string;
  noWarnings: boolean;
  noCallHome: boolean;
  noCheckCertificate: boolean;
  preferFreeFormats: boolean;
  extractAudio?: boolean;
  audioFormat?: string;
  audioQuality?: number;
  format?: string;
  mergeOutputFormat?: string;
}

const downloadMedia = async (context: CommandContext, url: string, format: 'video' | 'audio', quality: string): Promise<void> => {
  const startTime = Date.now();

  await context.socket.sendMessage(context.fromJid, {
    text: `🔄 Processing YouTube ${format} download...\nURL: ${url}\nQuality: ${quality}`,
  });

  const tempDir = path.join(process.cwd(), 'temp');
  await fs.mkdir(tempDir, { recursive: true });

  // Step 1: Get video info first (no download)
  const infoOptions: Flags = {
    noWarnings: true,
    callHome: false,
    noCheckCertificates: true,
    preferFreeFormats: true,
    dumpJson: true,
  };

  const info = await youtubeDl(url, infoOptions, { cwd: tempDir }) as YoutubeDlOutput;

  if (!info || !info.title) {
    throw new Error('Failed to get video info');
  }

  // Step 2: Download with specific format
  const downloadFlags: Flags = {
    noWarnings: true,
    callHome: false,
    noCheckCertificates: true,
    preferFreeFormats: true,
    output: path.join(tempDir, `${info.id || 'video'}.%(ext)s`),
  };

  if (format === 'audio') {
    downloadFlags.extractAudio = true;
    downloadFlags.audioFormat = 'mp3';
    downloadFlags.audioQuality = 0;
  } else {
    if (quality === 'best') {
      downloadFlags.format = 'bestvideo+bestaudio/best';
    } else {
      const maxHeight = quality.replace('p', '');
      downloadFlags.format = `bestvideo[height<=${maxHeight}]+bestaudio/best[height<=${maxHeight}]`;
    }
    downloadFlags.mergeOutputFormat = 'mp4';
  }

  await youtubeDl(url, downloadFlags, { cwd: tempDir });

  const ext = format === 'audio' ? 'mp3' : 'mp4';
  const filePath = path.join(tempDir, `${info.id || 'video'}.${ext}`);
  const fileStats = await fs.stat(filePath);

  if (fileStats.size > 50 * 1024 * 1024) {
    await context.socket.sendMessage(context.fromJid, {
      text: `⚠️ File size is ${(fileStats.size / 1024 / 1024).toFixed(2)}MB. WhatsApp has a 100MB limit for media files.`,
    });
  }

  const processingTimeMs = Date.now() - startTime;
  const processingTime = processingTimeMs < 1000
    ? `${processingTimeMs}ms`
    : `${(processingTimeMs / 1000).toFixed(1)}s`;

  const caption = `🎥 ${format === 'audio' ? 'Audio' : 'Video'} downloaded successfully!

📌 ${info.title || 'Unknown Title'}
👤 ${info.uploader || 'Unknown Channel'}
⏱️ ${formatDuration(info.duration)}
👁️ ${formatViews(info.view_count)} views
📅 ${formatUploadDate(info.upload_date)}

Quality: ${quality}
Size: ${(fileStats.size / 1024 / 1024).toFixed(2)}MB
⚡ Processing time: ${processingTime}`;

  if (format === 'audio') {
    await context.socket.sendMessage(context.fromJid, {
      audio: { url: filePath },
      mimetype: 'audio/mpeg',
    });
  } else {
    await context.socket.sendMessage(context.fromJid, {
      video: { url: filePath },
      caption,
      mimetype: 'video/mp4',
    });
  }

  setTimeout(async () => {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error('Failed to cleanup file:', error);
    }
  }, 30000);
};

const youtubeCommand: CommandModule = {
  config: {
    name: 'youtube',
    aliases: ['yt', 'ytdl', 'play'],
    description: 'Download video/audio from YouTube or play music by song name',
    usage: '!youtube <youtube-url> [format] [quality]\n!play <song name>\nExample: !youtube https://youtube.com/watch?v=xxx audio\nExample: !play shape of you',
    category: 'media',
  },
  handler: async function (context, args: string[]): Promise<void> {

    const firstArg = args[0];
    const format = (args[1] || 'video') as 'video' | 'audio';
    const quality = args[2] || 'best';

    if (!firstArg) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Please provide a YouTube URL or song name.\n\nUsage: !youtube <youtube-url> [format] [quality]\n       !play <song name>\n\nExample: !youtube https://youtube.com/watch?v=xxx audio\nExample: !play shape of you',
      });
      return;
    }

    // Detect if first arg is a URL or a search query
    const isUrl = /^https?:\/\//i.test(firstArg);

    if (!isUrl) {
      // Search mode: treat input as song name, show buttons to choose quality
      const query = args.join(' ');
      try {
        await context.socket.sendMessage(context.fromJid, {
          text: `🔍 Searching for "${query}"...`,
        });

        const tempDir = path.join(process.cwd(), 'temp');
        await fs.mkdir(tempDir, { recursive: true });

        const searchOptions: Flags = {
          noWarnings: true,
          callHome: false,
          noCheckCertificates: true,
          preferFreeFormats: true,
          printJson: true,
          defaultSearch: 'ytsearch1',
        };

        const output = await youtubeDl(query, searchOptions, { cwd: tempDir }) as YoutubeDlOutput;

        if (!output || !output.title) {
          await context.socket.sendMessage(context.fromJid, {
            text: '❌ No results found for your search query.',
          });
          return;
        }

        const videoUrl = output.webpage_url;
        if (!videoUrl) {
          await context.socket.sendMessage(context.fromJid, {
            text: '❌ Failed to get video URL from search results.',
          });
          return;
        }

        const caption = `🎥 Choose download option for:

📌 ${output.title || 'Unknown Title'}
👤 ${output.uploader || 'Unknown Channel'}
⏱️ ${formatDuration(output.duration)}
👁️ ${formatViews(output.view_count)} views
📅 ${formatUploadDate(output.upload_date)}`;

        await context.socket.sendMessage(context.fromJid, createButtonMessage(caption, videoUrl));

      } catch (error: unknown) {
        console.error('YouTube search error:', error);
        await context.socket.sendMessage(context.fromJid, {
          text: '❌ Failed to search for the song. Please try again with a different query.',
        });
      }
      return;
    }

    const url = firstArg;

    // If only URL is provided, check if it's a short video first
    if (args.length === 1) {
      try {
        // Get video info first
        const tempDir = path.join(process.cwd(), 'temp');
        await fs.mkdir(tempDir, { recursive: true });

        const infoOptions: Flags = {
          noWarnings: true,
          callHome: false,
          noCheckCertificates: true,
          preferFreeFormats: true,
          printJson: true,
          simulate: true,
          skipDownload: true,
        };

        const output = await youtubeDl(url, infoOptions, { cwd: tempDir }) as YoutubeDlOutput;

        // Check if it's a YouTube Short (duration <= 60 seconds or URL contains "shorts")
        const isShortVideo = (output.duration && url.includes('/shorts/'));

        if (isShortVideo) {
          // For short videos, download directly without showing buttons
          await downloadMedia(context, url, 'video', 'best');
          return;
        }

        const caption = `🎥 Choose download option for:

📌 ${output.title || 'Unknown Title'}
👤 ${output.uploader || 'Unknown Channel'}
⏱️ ${formatDuration(output.duration)}
👁️ ${formatViews(output.view_count)} views
📅 ${formatUploadDate(output.upload_date)}`;

        await context.socket.sendMessage(context.fromJid, createButtonMessage(caption, url));

      } catch (error) {
        console.error('Error getting video info:', error);
        await context.socket.sendMessage(context.fromJid, {
          text: '❌ Failed to get video info. Please check the URL and try again.',
        });
      }
      return;
    }

    // Manual command with format and quality
    if (!['video', 'audio'].includes(format)) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Invalid format. Use "video" or "audio".',
      });
      return;
    }

    try {
      await downloadMedia(context, url, format, quality);
    } catch (error: unknown) {
      console.error('YouTube download error:', error);

      let errorMessage = '❌ Failed to download YouTube media.';

      if (error && typeof error === 'object' && 'stderr' in error) {
        const stderr = (error as { stderr: string }).stderr;
        if (stderr.includes('Video unavailable')) {
          errorMessage = '❌ This video is unavailable or has been removed.';
        } else if (stderr.includes('Private video')) {
          errorMessage = '❌ This is a private video.';
        } else if (stderr.includes('This video is not available')) {
          errorMessage = '❌ This video is not available in your region.';
        } else if (stderr.includes('Unsupported URL')) {
          errorMessage = '❌ Unsupported YouTube URL format.';
        }
      }

      await context.socket.sendMessage(context.fromJid, {
        text: `${errorMessage}\n\nPlease check the URL and try again.`,
      });
    }
  },
};

export default youtubeCommand;
