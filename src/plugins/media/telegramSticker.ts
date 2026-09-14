import type { CommandModule } from '../../types/index.js';
import type { Sticker as PackSticker } from '@stazyu/baileys';
import { log } from '../../utils/logger.js';
import { downloadTelegramStickerPack } from '../../utils/telegramSticker.js';

// ---------------------------------------------------------------------------
// Telegram Sticker Pack plugin — converts a Telegram sticker pack
// (https://t.me/addstickers/<name>) into a WhatsApp sticker pack using the
// TStickers Python CLI (https://github.com/FHPythonUtils/TStickers).
//
// Sticker source priority:
//   1. WebP output (WhatsApp-ready, static & animated) — primary.
//   2. WebM output → converted to animated WebP via ffmpeg (animated stickers).
//
// Requirements:
//   - Python 3.8-3.11 + `python -m pip install tstickers`
//   - A Telegram bot token in TELEGRAM_BOT_TOKEN / TSTICKERS_TOKEN (via @BotFather)
//   - ffmpeg in PATH (or FFMPEG_BIN) for webm → animated webp conversion
//
// Usage:
//   !tgstickerpack <t.me/addstickers url | pack-name> [Nama|Publisher]
//
// Examples:
//   !tgstickerpack https://t.me/addstickers/DonutTheDog
//   !tgstickerpack DonutTheDog MyPack|Bot-Baileys-AI
// ---------------------------------------------------------------------------

const MAX_STICKERS = 60; // WhatsApp hard limit enforced by the Baileys fork

interface ParsedArgs {
  packInput: string;
  packName: string;
  authorName: string;
}

function parseArgs(args: string[]): ParsedArgs | null {
  const positionalParts: string[] = [];
  let packName: string | undefined;
  let authorName: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    const lower = token.toLowerCase();

    if (lower === '--pack') {
      packName = args[i + 1]?.trim() || undefined;
      i += 1;
      continue;
    }
    if (lower === '--author') {
      authorName = args[i + 1]?.trim() || undefined;
      i += 1;
      continue;
    }

    positionalParts.push(token);
  }

  if (positionalParts.length === 0) return null;

  const first = positionalParts[0];

  // Optional "Name|Publisher" suffix after the pack URL/name
  const nameArg = positionalParts.slice(1).join(' ').trim();
  if (nameArg.includes('|')) {
    const [pack, author] = nameArg.split('|');
    packName = pack.trim() || packName;
    authorName = author.trim() || authorName;
  } else if (nameArg) {
    packName = packName || nameArg;
  }

  return {
    packInput: first,
    packName: packName || 'Telegram Pack',
    authorName: authorName || 'Bot-Baileys-AI',
  };
}

const telegramStickerPackCommand: CommandModule = {
  config: {
    name: 'tgstickerpack',
    aliases: ['tgpack', 'tgstickers', 'tgs', 'telegramstickerpack', 'tgstikerpack'],
    description: 'Convert Telegram sticker pack (t.me/addstickers) menjadi WhatsApp sticker pack',
    usage: '!tgstickerpack <url pack t.me/addstickers | nama-pack> [Nama|Publisher] [--pack nama] [--author nama]',
    category: 'media',
    cooldown: 15,
  },
  handler: async function (context, args: string[]): Promise<void> {
    const { socket, fromJid } = context;
    const reply = (text: string) => socket.sendMessage(fromJid, { text });

    const parsed = parseArgs(args);
    if (!parsed) {
      await reply(
        '❌ Mohon berikan URL atau nama pack Telegram.\nUsage: `!tgstickerpack <t.me/addstickers url | nama-pack> [Nama|Publisher]`',
      );
      return;
    }

    await reply(
      `⏳ Mengunduh & mengonversi sticker pack Telegram "${parsed.packInput}"...\n` +
        'Proses ini bisa memakan waktu 1-3 menit untuk pack beranimasi (tgs).',
    );

    // AGENT.md: show typing indicator during long operations.
    await socket.sendPresenceUpdate('composing', fromJid).catch(() => undefined);

    try {
      const result = await downloadTelegramStickerPack({
        packUrl: parsed.packInput,
        packName: parsed.packName,
        authorName: parsed.authorName,
      });

      const { stickerBuffers } = result;

      if (stickerBuffers.length === 0) {
        await reply('❌ Pack Telegram ditemukan, tapi tidak ada sticker yang bisa dikonversi.');
        return;
      }

      // WhatsApp packs cap at 30 stickers; the Baileys fork enforces 60.
      const selected = stickerBuffers.slice(0, MAX_STICKERS);

      const packStickers: PackSticker[] = selected.map((data, i) => ({
        data,
        emojis: ['✨'],
        accessibilityLabel: `Telegram Sticker ${i + 1}`,
      }));

      // Publisher falls back to the original pack name when the user doesn't specify one,
      // so pack info stays meaningful (the pack name is sent for the whole pack,
      // including animated stickers — pack-level, not per-sticker).
      const publisher =
        parsed.authorName === 'Bot-Baileys-AI' ? result.packName : parsed.authorName;

      await socket.sendMessage(fromJid, {
        stickerPack: {
          name: result.packName,
          publisher,
          packId: `tg-${Date.now().toString(36)}`,
          description: `Telegram sticker pack "${result.packName}" (${selected.length} sticker, via !tgstickerpack on Staz AI Bot)`,
          cover: packStickers[0].data,
          stickers: packStickers,
        },
      });

      const animationNote = result.usedWebmFallback
        ? `\n🎞️ ${result.webmConverted} sticker animasi dikonversi dari webm → webp animasi via ffmpeg.`
        : '';
      const oversizeNote =
        result.skippedOversize > 0
          ? `\n⚠️ ${result.skippedOversize} sticker dilewati karena melebihi batas ukuran 1MB WhatsApp.`
          : '';
      const truncatedNote =
        stickerBuffers.length > selected.length
          ? `\n⚠️ Pack asli memiliki ${stickerBuffers.length} sticker; hanya ${selected.length} yang dikirim (batas WhatsApp).`
          : '';
      await reply(
        `✅ Sticker pack Telegram "${result.packName}" (${selected.length} sticker) berhasil dikonversi & terkirim!${animationNote}${oversizeNote}${truncatedNote}`,
      );
    } catch (error) {
      log.error('❌ [Command:tgstickerpack] Error:', error as object);
      const message = error instanceof Error ? error.message : 'Unknown error';
      await reply(`❌ Gagal mengonversi sticker pack Telegram: ${message}`);
    } finally {
      await socket.sendPresenceUpdate('paused', fromJid).catch(() => undefined);
    }
  },
};

export default telegramStickerPackCommand;
