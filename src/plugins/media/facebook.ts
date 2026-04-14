import nexo from 'nexo-aio-downloader';
import type { CommandModule } from '../../types/index.js';

const facebookCommand: CommandModule = {
  config: {
    name: 'facebook',
    aliases: ['fb', 'fbdl'],
    description: 'Download video from Facebook',
    usage: '!facebook <facebook-url>',
    category: 'media',
  },
  handler: async function (context, args: string[]): Promise<void> {
    const url = args[0];

    if (!url) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Please provide a Facebook URL. Usage: !facebook <facebook-url>',
      });
      return;
    }

    await context.socket.sendMessage(context.fromJid, {
      text: '⏳ Sedang mengunduh video Facebook...',
    });

    try {
      const result = await nexo.facebook(url);

      const processTime = new Date().getTime() - Number(context.simplified?.messageTimeStamp) * 1000;

      if (result.data?.result && result.data.result.length > 0) {
        const mediaUrl = result.data.result[0].url;
        const caption = `📘 *Facebook Download*\n\n` +
          `⏱️ Process Time: ${(processTime / 1000).toFixed(2)} seconds\n\n` +
          `_Downloaded manually_`;

        await context.socket.sendMessage(context.fromJid, {
          video: { url: mediaUrl },
          caption: caption,
        });
      } else {
        await context.socket.sendMessage(context.fromJid, {
          text: `❌ Gagal mengunduh video dari Facebook.\n\nPastikan URL benar dan video bersifat publik.\n\nBila masalah berlanjut, silahkan hubungi Owner`,
        });
      }
    } catch (error) {
      console.error('Error downloading Facebook video:', error);
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Terjadi kesalahan saat mengunduh video Facebook. Silahkan coba lagi nanti.',
      });
    }
  },
};

export default facebookCommand;
