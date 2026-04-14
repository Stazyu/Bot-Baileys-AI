import type { CommandModule } from '../../types/index.js';
import { downloadContentFromMessage } from '@innovatorssoft/baileys';
import { Sticker } from 'wa-sticker-formatter';

const stickerCommand: CommandModule = {
  config: {
    name: 'sticker',
    aliases: ['s', 'stiker', 'stick'],
    description: 'Convert image to sticker with custom name',
    usage: '!sticker [pack-name|author-name] (reply to an image)',
    category: 'media',
  },
  handler: async function (context, args: string[]): Promise<void> {
    const { message, simplified } = context;

    // Check if there's an image (direct or quoted)
    const isImage = simplified?.isImage;
    const isQuotedImage = simplified?.isQuotedImage;

    if (!isImage && !isQuotedImage) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Please reply to an image or send an image with the command.\nUsage: !sticker [pack-name|author-name]',
      });
      return;
    }

    await context.socket.sendMessage(context.fromJid, {
      text: '⏳ Converting image to sticker...',
    });

    try {
      // Download the image from the message
      let imageMessage: any;

      if (isQuotedImage) {
        // Get quoted image message
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted || !quoted.imageMessage) {
          throw new Error('No quoted image message found');
        }
        imageMessage = quoted.imageMessage;
      } else if (isImage) {
        // Get direct image message
        imageMessage = message.message?.imageMessage;
        if (!imageMessage) {
          throw new Error('No image message found');
        }
      } else {
        throw new Error('No image found in message');
      }

      const stream = await downloadContentFromMessage(
        imageMessage,
        'image'
      )

      let buffer = Buffer.from([])
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk])
      }

      if (!buffer) {
        await context.socket.sendMessage(context.fromJid, {
          text: '❌ Failed to download image',
        });
        return;
      }

      // Parse custom sticker name from args
      // Format: !sticker pack-name|author-name
      let packName = 'Bot-Baileys';
      let authorName = 'AI Bot';

      if (args.length > 0) {
        const nameArg = args.join(' ');
        if (nameArg.includes('|')) {
          const [pack, author] = nameArg.split('|');
          packName = pack.trim() || packName;
          authorName = author.trim() || authorName;
        } else {
          packName = nameArg.trim();
        }
      }

      const sticker = new Sticker(buffer, {
        pack: packName,
        author: authorName,
        type: 'default',
        categories: ['❤️'],
        quality: 100,
      });

      // Send as sticker
      await context.socket.sendMessage(context.fromJid, {
        sticker: await sticker.toBuffer(),
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
