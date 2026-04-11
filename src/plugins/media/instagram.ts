import nexo from 'nexo-aio-downloader';

import type { CommandModule } from '../../types/index.js';

const instagramCommand: CommandModule = {
  config: {
    name: 'instagram',
    aliases: ['ig', 'insta', 'igdl'],
    description: 'Download media from Instagram',
    usage: '!instagram <instagram-url>',
    category: 'media',
  },
  handler: async function (context, args: string[]): Promise<void> {
    const url = args[0];

    if (!url) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Please provide an Instagram URL. Usage: !instagram <instagram-url>',
      });
      return;
    }

    await context.socket.sendMessage(context.fromJid, {
      text: 'Mohon tunggu sebentar...',
    });

    const result = await nexo.instagram(url);

    const processTime = new Date().getTime() - Number(context.simplified?.messageTimeStamp) * 1000;

    // TODO: Implement Instagram download logic
    // This is a placeholder for future implementation
    if (result.data?.url[0]) {
      await context.socket.sendMessage(context.fromJid, {
        video: { url: result.data.url[0] },
        caption: 'Instagram video\n\nProcess Time: ' + (processTime / 1000).toFixed(2) + ' seconds'
      });
    } else {
      await context.socket.sendMessage(context.fromJid, {
        text: 'Gagal mengunduh video dari Instagram, pastikan URL benar\nBila masalah berlanjut, silahkan hubungi Owner'
      });
    }
  },
};

export default instagramCommand;
