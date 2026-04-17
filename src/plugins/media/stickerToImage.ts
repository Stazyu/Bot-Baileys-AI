import type { CommandModule } from '../../types/index.js';
import { downloadContentFromMessage } from '@innovatorssoft/baileys';

const stickerToImageCommand: CommandModule = {
  config: {
    name: 'stickerToImage',
    aliases: ['s2i', 'stickertoimg', 'toimg'],
    description: 'Convert sticker to image',
    usage: '!stickerToImage (reply to a sticker)',
    category: 'media',
  },
  handler: async function (context, args: string[]): Promise<void> {
    const { message, simplified } = context;

    // Check if there's a sticker (direct or quoted)
    const isSticker = simplified?.isSticker;
    const isQuotedSticker = simplified?.isQuotedSticker;

    if (!isSticker && !isQuotedSticker) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Please reply to a sticker or send a sticker with the command.\nUsage: !stickerToImage',
      });
      return;
    }

    await context.socket.sendMessage(context.fromJid, {
      text: '⏳ Converting sticker to image...',
    });

    try {
      // Download the sticker from the message
      let stickerMessage: any;

      if (isQuotedSticker) {
        // Get quoted sticker message
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted || !quoted.stickerMessage) {
          throw new Error('No quoted sticker message found');
        }
        stickerMessage = quoted.stickerMessage;
      } else if (isSticker) {
        // Get direct sticker message
        stickerMessage = message.message?.stickerMessage;
        if (!stickerMessage) {
          throw new Error('No sticker message found');
        }
      } else {
        throw new Error('No sticker found in message');
      }

      const stream = await downloadContentFromMessage(
        stickerMessage,
        'sticker'
      );

      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      if (!buffer) {
        await context.socket.sendMessage(context.fromJid, {
          text: '❌ Failed to download sticker',
        });
        return;
      }

      // Send as image (stickers are WebP format which can be sent as images)
      await context.socket.sendMessage(context.fromJid, {
        image: buffer,
        caption: '✅ Sticker converted to image',
      });

    } catch (error) {
      console.error('Error converting sticker to image:', error);
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Failed to convert sticker to image. Please try again.',
      });
    }
  },
};

export default stickerToImageCommand;
