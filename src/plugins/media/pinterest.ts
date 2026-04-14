import pinterest from '../../utils/pinterest.js';
import { Sticker } from 'wa-sticker-formatter';
import type { CommandModule } from '../../types/index.js';

const pinterestCommand: CommandModule = {
  config: {
    name: 'pinterest',
    aliases: ['pin'],
    description: 'Cari gambar di Pinterest',
    usage: '!pinterest <query> [-sticker]',
    category: 'media',
  },
  handler: async function (context, args: string[]): Promise<void> {
    if (args.length === 0) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Mohon berikan query pencarian. Usage: !pinterest <query> [-sticker]',
      });
      return;
    }

    const query = args.join(' ').replace('-sticker', '').trim();
    const isSticker = args.includes('-sticker');

    await context.socket.sendMessage(context.fromJid, {
      text: '⏳ Sedang mencari gambar di Pinterest...',
    });

    try {
      const results = await pinterest(query);

      if (results.length === 0) {
        await context.socket.sendMessage(context.fromJid, {
          text: `❌ Tidak ditemukan hasil untuk "${query}"`,
        });
        return;
      }

      // Get random image from results
      const randomIndex = Math.floor(Math.random() * results.length);
      const imageUrl = results[randomIndex];

      if (isSticker) {
        await context.socket.sendMessage(context.fromJid, {
          text: '⏳ Sedang membuat sticker...',
        });

        const sticker = new Sticker(imageUrl, {
          pack: 'Bot-Baileys-AI',
          author: 'Pinterest',
          type: 'full',
          quality: 100,
        });

        const stickerBuffer = await sticker.toBuffer();

        await context.socket.sendMessage(context.fromJid, {
          sticker: stickerBuffer,
        });
      } else {
        await context.socket.sendMessage(context.fromJid, {
          image: { url: imageUrl },
          caption: `📌 *Pinterest*\n\nQuery: ${query}\n\n_Gambar dari Pinterest_`,
        });
      }
    } catch (error) {
      console.error('Error searching Pinterest:', error);
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Terjadi kesalahan saat mencari gambar di Pinterest. Silahkan coba lagi nanti.',
      });
    }
  },
};

export default pinterestCommand;
