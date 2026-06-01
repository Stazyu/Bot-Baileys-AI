import type { CommandContext } from '../types/index.js';
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
}

export async function handleYouTubeButton(context: CommandContext, buttonId: string): Promise<void> {
  try {
    const parts = buttonId.split('_');
    if (parts.length < 3) return;

    const format = parts[1]; // audio, 360p, 720p
    const encodedUrl = parts.slice(2).join('_');
    const url = Buffer.from(encodedUrl, 'base64').toString('utf-8');

    if (!url) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Invalid URL from button response.',
      });
      return;
    }

    let downloadFormat: 'video' | 'audio' = 'video';
    let quality = 'best';

    if (format === 'audio') {
      downloadFormat = 'audio';
      quality = 'best';
    } else if (format === '360p') {
      downloadFormat = 'video';
      quality = '360p';
    } else if (format === '720p') {
      downloadFormat = 'video';
      quality = '720p';
    } else {
      downloadFormat = 'video';
      quality = 'best';
    }

    await downloadYouTubeMedia(context, url, downloadFormat, quality);

  } catch (error) {
    console.error('YouTube button handler error:', error);
    await context.socket.sendMessage(context.fromJid, {
      text: '❌ Failed to process button response. Please try again.',
    });
  }
}

async function downloadYouTubeMedia(context: CommandContext, url: string, format: 'video' | 'audio', quality: string): Promise<void> {
  const startTime = Date.now();

  await context.socket.sendMessage(context.fromJid, {
    text: '🔄 Mohon ditunggu, sedang memproses download...',
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
    await fs.unlink(filePath);
    return;
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

  const formatUploadDate = (date?: string): string => {
    if (!date) return 'N/A';
    const year = date.substring(0, 4);
    const month = date.substring(4, 6);
    const day = date.substring(6, 8);
    return `${day}-${month}-${year}`;
  };

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
}
