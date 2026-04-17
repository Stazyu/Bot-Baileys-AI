import type { CommandModule } from '../../types/index.js';
import { downloadContentFromMessage } from '@innovatorssoft/baileys';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { spawn } from 'child_process';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// Helper function to compress media using ffmpeg
async function compressMedia(buffer: Buffer, mediaType: 'image' | 'video'): Promise<Buffer> {
  const tempDir = tmpdir();
  const inputPath = join(tempDir, `input_${Date.now()}.${mediaType === 'image' ? 'png' : 'mp4'}`);
  const outputPath = join(tempDir, `output_${Date.now()}.${mediaType === 'image' ? 'webp' : 'mp4'}`);

  try {
    // Write buffer to temp file
    await writeFile(inputPath, buffer);

    // Compress using ffmpeg
    const args = mediaType === 'video'
      ? [
        '-i', inputPath,
        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '40',
        '-b:v', '150k',
        '-maxrate', '200k',
        '-bufsize', '300k',
        '-t', '5',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ]
      : [
        '-i', inputPath,
        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease',
        '-c:v', 'libwebp',
        '-quality', '60',
        '-method', '4',
        '-y',
        outputPath
      ];

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);
      ffmpeg.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
      ffmpeg.on('error', reject);
    });

    // Read compressed file
    const compressedBuffer = await readFile(outputPath);

    // Clean up temp files
    await unlink(inputPath).catch(() => { });
    await unlink(outputPath).catch(() => { });

    return compressedBuffer;
  } catch (error) {
    // Clean up on error
    await unlink(inputPath).catch(() => { });
    await unlink(outputPath).catch(() => { });
    throw error;
  }
}

const stickerCommand: CommandModule = {
  config: {
    name: 'sticker',
    aliases: ['s', 'stiker', 'stick'],
    description: 'Convert image or video (max 5s) to sticker with custom name',
    usage: '!sticker [pack-name|author-name] [-type] (reply to an image/video)\nTypes: -default, -cropped, -full',
    category: 'media',
  },
  handler: async function (context, args: string[]): Promise<void> {
    const { message, simplified } = context;

    // Check if there's an image or video (direct or quoted)
    const isImage = simplified?.isImage;
    const isQuotedImage = simplified?.isQuotedImage;
    const isVideo = simplified?.isVideo;
    const isQuotedVideo = simplified?.isQuotedVideo;

    if (!isImage && !isQuotedImage && !isVideo && !isQuotedVideo) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Please reply to an image/video or send an image/video with the command.\nUsage: !sticker [pack-name|author-name]',
      });
      return;
    }

    await context.socket.sendMessage(context.fromJid, {
      text: '⏳ Converting to sticker...',
    });

    try {
      // Download the media from the message
      let mediaMessage: any;
      let mediaType: 'image' | 'video' = 'image';

      if (isQuotedVideo) {
        // Get quoted video message
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted || !quoted.videoMessage) {
          throw new Error('No quoted video message found');
        }
        mediaMessage = quoted.videoMessage;
        mediaType = 'video';

        // Check video duration (max 5 seconds)
        const videoDuration = mediaMessage.seconds;
        if (videoDuration && videoDuration > 5) {
          await context.socket.sendMessage(context.fromJid, {
            text: `❌ Video is too long (${videoDuration}s). Maximum duration is 5 seconds.`,
          });
          return;
        }
      } else if (isVideo) {
        // Get direct video message
        mediaMessage = message.message?.videoMessage;
        if (!mediaMessage) {
          throw new Error('No video message found');
        }
        mediaType = 'video';

        // Check video duration (max 5 seconds)
        const videoDuration = mediaMessage.seconds;
        if (videoDuration && videoDuration > 5) {
          await context.socket.sendMessage(context.fromJid, {
            text: `❌ Video is too long (${videoDuration}s). Maximum duration is 5 seconds.`,
          });
          return;
        }
      } else if (isQuotedImage) {
        // Get quoted image message
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted || !quoted.imageMessage) {
          throw new Error('No quoted image message found');
        }
        mediaMessage = quoted.imageMessage;
        mediaType = 'image';
      } else if (isImage) {
        // Get direct image message
        mediaMessage = message.message?.imageMessage;
        if (!mediaMessage) {
          throw new Error('No image message found');
        }
        mediaType = 'image';
      } else {
        throw new Error('No media found in message');
      }

      const stream = await downloadContentFromMessage(
        mediaMessage,
        mediaType
      )

      let buffer = Buffer.from([])
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk])
      }

      if (!buffer) {
        await context.socket.sendMessage(context.fromJid, {
          text: '❌ Failed to download media',
        });
        return;
      }

      // Compress media using ffmpeg (only for videos)
      let compressedBuffer: Buffer;
      if (mediaType === 'video') {
        await context.socket.sendMessage(context.fromJid, {
          text: '⏳ Compressing video...',
        });
        try {
          compressedBuffer = await compressMedia(buffer, mediaType);
        } catch (error) {
          console.error('Error compressing video:', error);
          // If compression fails, use original buffer
          compressedBuffer = buffer;
        }
      } else {
        // For images, use original buffer without ffmpeg compression
        compressedBuffer = buffer;
      }

      // Parse custom sticker name from args
      // Format: !sticker pack-name|author-name -type
      let packName = 'Bot-Baileys';
      let authorName = 'AI Bot';
      let stickerType = mediaType === 'video' ? StickerTypes.FULL : StickerTypes.CROPPED;

      if (args.length > 0) {
        const nameArg = args.join(' ');

        // Extract type parameter (starts with -)
        const typeMatch = nameArg.match(/-(\w+)/);
        if (typeMatch) {
          const typeStr = typeMatch[1].toUpperCase();
          if (StickerTypes[typeStr as keyof typeof StickerTypes]) {
            stickerType = StickerTypes[typeStr as keyof typeof StickerTypes];
          }
          // Remove type from nameArg for pack/author parsing
          nameArg.replace(/-\w+/, '').trim();
        }

        // Parse pack and author (without type)
        const cleanNameArg = nameArg.replace(/-\w+/, '').trim();
        if (cleanNameArg.includes('|')) {
          const [pack, author] = cleanNameArg.split('|');
          packName = pack.trim() || packName;
          authorName = author.trim() || authorName;
        } else if (cleanNameArg) {
          packName = cleanNameArg.trim();
        }
      }

      const sticker = new Sticker(compressedBuffer, {
        pack: packName,
        author: authorName,
        type: stickerType,
        categories: ['❤️'],
        quality: mediaType === 'video' ? 40 : 100,
      });

      const stickerBuffer = await sticker.toBuffer();


      // Send as sticker
      await context.socket.sendMessage(context.fromJid, {
        sticker: stickerBuffer,
      });

    } catch (error) {
      console.error('Error creating sticker:', error);
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Failed to create sticker. Please try again.',
      });
    }
  },
};

export default stickerCommand;
