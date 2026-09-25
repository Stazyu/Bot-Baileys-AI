import type { CommandModule } from '../../types/index.js';
import type { SimplifiedMessage } from '../../bot/botHandler.js';
import type { WAMessage, WASocket, Sticker as PackSticker, proto } from '@stazyu/baileys';
import { downloadMediaBuffer, safeMediaHost } from '../../utils/mediaDownload.js';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { deflateSync } from 'zlib';
import { log } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Sticker Pack plugin — built for the sticker pack support added in
// WhiskeySockets/Baileys PR #1561 (present in the @stazyu/baileys fork).
//
// Usage:
//   !stickerpack                     → start a new collection (default name)
//   !stickerpack Name|Publisher      → start a new collection with custom name
//   !stickerpack add                 → (reply sticker/image/album) add to pack
//   !stickerpack send                → send active collection as a sticker pack
//   !stickerpack info                → show active collection status
//   !stickerpack cancel              → discard active collection
//   !stickerpack demo                → send a self-contained demo pack
//
// Album (collapsed media) support:
//   - Reply to an already-sent album + `!stickerpack add` → all media
//     in the album are added at once.
//   - Caption `!stickerpack add` on the first media of an album → all
//     member media of the album are added at once.
// ---------------------------------------------------------------------------

const MAX_STICKERS = 60; // WhatsApp hard limit enforced by the fork
const ALBUM_ASSOCIATION = 1; // proto.MessageAssociation.AssociationType.MEDIA_ALBUM

// Reuse Baileys' Sticker type for pack items (data must be a WAMediaUpload)
type PackStickerItem = PackSticker;

interface PackCollection {
  name: string;
  publisher: string;
  stickers: PackStickerItem[];
}

// Per (session + chat) in-memory collection store. Key: `${sessionId}|${fromJid}`
const packCollectionStore = new Map<string, PackCollection>();

// ---------------------------------------------------------------------------
// Album-aware message buffering
// ---------------------------------------------------------------------------
interface BufferEntry {
  msg: WAMessage;
  ts: number;
}

const BUFFER_TTL_MS = 60_000;
const BUFFER_MAX = 200;

// Key: `${sessionId}|${chatJid}`
const mediaBuffer = new Map<string, BufferEntry[]>();
// Guard so we register the upsert listener once per socket
const listenerRegisteredSockets = new WeakSet<object>();

function isMediaMessage(msg: WAMessage): boolean {
  const m = msg.message;
  return !!m?.imageMessage || !!m?.videoMessage || !!m?.stickerMessage;
}

function isAlbumRoot(msg: WAMessage): boolean {
  return !!msg.message?.albumMessage;
}

function isAlbumMember(msg: WAMessage): boolean {
  return msg.message?.messageContextInfo?.messageAssociation?.associationType === ALBUM_ASSOCIATION;
}

function getAlbumParentId(msg: WAMessage): string | undefined {
  return msg.message?.messageContextInfo?.messageAssociation?.parentMessageKey?.id ?? undefined;
}

/**
 * Registers a lightweight `messages.upsert` listener that only buffers
 * media/album messages per chat so the plugin can resolve album members
 * (the main bot handler processes messages one-by-one and never exposes
 * the batch to command handlers).
 */
function registerUpsertListener(socket: WASocket, sessionId: string): void {
  if (listenerRegisteredSockets.has(socket)) return;
  listenerRegisteredSockets.add(socket);

  socket.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      const jid = msg.key?.remoteJid;
      if (!jid) continue;
      if (!isMediaMessage(msg) && !isAlbumRoot(msg) && !isAlbumMember(msg)) continue;

      const key = `${sessionId}|${jid}`;
      let arr = mediaBuffer.get(key);
      if (!arr) {
        arr = [];
        mediaBuffer.set(key, arr);
      }
      arr.push({ msg, ts: Date.now() });

      // Expire old entries (TTL + ring-buffer cap)
      const cutoff = Date.now() - BUFFER_TTL_MS;
      while (arr.length > 0 && arr[0].ts < cutoff) arr.shift();
      if (arr.length > BUFFER_MAX) arr.splice(0, arr.length - BUFFER_MAX);
    }
  });
}

function findBufferedByKeyId(key: string, msgId: string | undefined): WAMessage | undefined {
  if (!msgId) return undefined;
  const arr = mediaBuffer.get(key);
  return arr?.find((b) => b.msg.key?.id === msgId)?.msg;
}

/**
 * Given one resolved message (album root, album member, or single media),
 * expand it to the full list of media messages (all album members).
 */
function expandAlbumTarget(msg: WAMessage, key: string): WAMessage[] {
  const arr = mediaBuffer.get(key) ?? [];

  // Album root → all members referencing it
  if (isAlbumRoot(msg)) {
    const parentId = msg.key?.id;
    return arr
      .filter((b) => getAlbumParentId(b.msg) === parentId && isMediaMessage(b.msg))
      .map((b) => b.msg);
  }

  // Album member → all members sharing the same parent + this one
  const parentId = getAlbumParentId(msg);
  if (parentId) {
    const members = arr
      .filter((b) => getAlbumParentId(b.msg) === parentId && isMediaMessage(b.msg))
      .map((b) => b.msg);
    if (!members.some((m) => m.key?.id === msg.key?.id) && isMediaMessage(msg)) {
      members.push(msg);
    }
    return members;
  }

  // Single media message
  if (isMediaMessage(msg)) return [msg];
  return [];
}

/**
 * Wrap an embedded proto.IMessage (e.g. `contextInfo.quotedMessage`) into a
 * WAMessage-like object. The embedded content carries media fields directly
 * (e.g. `.imageMessage`, `.stickerMessage`) — exactly what isMediaMessage and
 * downloadMediaFromMessage inspect.
 *
 * Only `message` is read downstream, but WAMessage requires `key`; the empty
 * cast is confined here because callers never touch it.
 */
function wrapContent(content: proto.IMessage | null | undefined): WAMessage {
  return { key: {}, message: content ?? {} } as WAMessage;
}

/**
 * Resolve which media messages the `add`/start command should consume.
 * Supports:
 *   A. Reply to an album root → all buffered album members
 *   B. Reply to a member → all album members (via buffer) or the single quote
 *   C. Reply to a single sticker/image → the embedded quotedMessage (always present)
 *   D. Caption command on a media message that is part of an album → all members
 *   E. Caption command on a single media message → that one message
 *
 * The embedded `contextInfo.quotedMessage` is the primary source for replies —
 * it is always attached by WhatsApp and does not depend on the plugin's buffer
 * having seen the original message.
 */
function resolveTargets(
  message: WAMessage,
  simplified: SimplifiedMessage | undefined,
  key: string,
): WAMessage[] {
  const ctxInfo = message.message?.extendedTextMessage?.contextInfo;

  // ── Reply path ──────────────────────────────────────────────────────────
  if (ctxInfo?.stanzaId) {
    // 1a. The quoted message is still in our buffer (album root/member/media).
    //     Expand album members when applicable.
    const buffered = findBufferedByKeyId(key, ctxInfo.stanzaId);
    if (buffered) {
      const expanded = expandAlbumTarget(buffered, key);
      if (expanded.length > 0) return expanded;
    }

    // 1b. Fall back to the embedded quotedMessage (always present on replies).
    const quotedMsg = wrapContent(ctxInfo.quotedMessage);
    if (isAlbumMember(quotedMsg)) {
      const expanded = expandAlbumTarget(quotedMsg, key);
      if (expanded.length > 0) return expanded;
    }
    if (isMediaMessage(quotedMsg)) return [quotedMsg];
  }

  // ── Caption-on-media path (this message itself carries media) ───────────
  if (isMediaMessage(message)) {
    const parentId = getAlbumParentId(message);
    if (parentId) {
      const arr = mediaBuffer.get(key) ?? [];
      const members = arr
        .filter((b) => getAlbumParentId(b.msg) === parentId && isMediaMessage(b.msg))
        .map((b) => b.msg);
      if (!members.some((m) => m.key?.id === message.key?.id)) {
        members.push(message);
      }
      return members;
    }
    return [message];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder (solid color) — used to generate demo stickers without
// adding any new dependency. Node's zlib deflateSync compresses the scanlines.
// ---------------------------------------------------------------------------
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createSolidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace

  const row = Buffer.alloc(1 + width * 3); // 1 filter byte + RGB pixels
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = rgb[0];
    row[2 + x * 3] = rgb[1];
    row[3 + x * 3] = rgb[2];
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const idat = deflateSync(raw);
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// Media helpers
// ---------------------------------------------------------------------------

/** Download media from a raw WAMessage that directly carries image/video/sticker. */
async function downloadMediaFromMessage(msg: WAMessage, socketMediaHost?: string): Promise<{ buffer: Buffer; isSticker: boolean } | null> {
  const m = msg.message;
  if (!m) return null;

  let mediaMessage: proto.Message.IImageMessage | proto.Message.IVideoMessage | proto.Message.IStickerMessage;
  let mediaType: 'sticker' | 'image' | 'video';

  if (m.imageMessage) {
    mediaMessage = m.imageMessage;
    mediaType = 'image';
  } else if (m.videoMessage) {
    mediaMessage = m.videoMessage;
    mediaType = 'video';
  } else if (m.stickerMessage) {
    mediaMessage = m.stickerMessage;
    mediaType = 'sticker';
  } else {
    return null;
  }

  const buffer = await downloadMediaBuffer(mediaMessage, mediaType, socketMediaHost);
  if (!buffer || buffer.length === 0) return null;
  return { buffer, isSticker: mediaType === 'sticker' };
}

/** Convert an image/video to a WebP sticker buffer. Stickers are already WebP → passed through unchanged. */
async function toWebp(buffer: Buffer, isSticker: boolean, pack: string, author: string): Promise<Buffer> {
  if (isSticker) return buffer; // already WebP — fork preserves it as-is
  const sticker = new Sticker(buffer, {
    pack,
    author,
    type: StickerTypes.CROPPED,
    categories: ['✨'],
    quality: 100,
  });
  return await sticker.toBuffer();
}

function parseNameArgs(args: string[]): { name: string; publisher: string } {
  const raw = args.join(' ').trim();
  let name = 'Test Pack';
  let publisher = 'Bot-Baileys-AI';
  if (raw.includes('|')) {
    const [n, p] = raw.split('|');
    name = n.trim() || name;
    publisher = p.trim() || publisher;
  } else if (raw) {
    name = raw;
  }
  return { name, publisher };
}

const stickerPackCommand: CommandModule = {
  config: {
    name: 'stickerpack',
    aliases: ['sp', 'spack', 'stikerpack', 'testpack'],
    description: 'Create and send a WhatsApp sticker pack (Baileys PR #1561 test)',
    usage: '!stickerpack [Name|Publisher] | !stickerpack <add|send|info|cancel|demo>',
    category: 'media',
  },
  handler: async function (context, args: string[]): Promise<void> {
    const { socket, fromJid, message, simplified, sessionId } = context;
    const key = `${sessionId}|${fromJid}`;
    const sub = (args[0] || '').toLowerCase();

    const reply = (text: string) => socket.sendMessage(fromJid, { text });

    // Ensure the album-aware buffering listener is attached for this socket
    registerUpsertListener(socket, sessionId);

    // Add N media messages to the collection; returns how many were added.
    const addMediaMessages = async (targets: WAMessage[], coll: PackCollection): Promise<{ added: number; skipped: number }> => {
      const socketMediaHost = safeMediaHost(socket);
      let added = 0;
      let skipped = 0;
      for (const target of targets) {
        if (coll.stickers.length >= MAX_STICKERS) {
          skipped += 1;
          continue;
        }
        try {
          const media = await downloadMediaFromMessage(target, socketMediaHost);
          if (!media) {
            skipped += 1;
            continue;
          }
          const webp = await toWebp(media.buffer, media.isSticker, coll.name, coll.publisher);
          coll.stickers.push({
            data: webp,
            emojis: ['✨'],
            accessibilityLabel: `Sticker ${coll.stickers.length + 1}`,
          });
          added += 1;
        } catch (error) {
          log.warn('⚠️ Skipping media in sticker pack add:', error as object);
          skipped += 1;
        }
      }
      return { added, skipped };
    };

    try {
      switch (sub) {
        case 'add':
        case 'tambah': {
          const coll = packCollectionStore.get(key);
          if (!coll) {
            await reply('⚠️ Tidak ada pack aktif. Mulai dulu dengan `!stickerpack <Nama|Publisher>`');
            return;
          }
          if (coll.stickers.length >= MAX_STICKERS) {
            await reply(`❌ Pack sudah penuh (maksimal ${MAX_STICKERS} sticker). Kirim dengan \`!stickerpack send\` atau \`!stickerpack cancel\`.`);
            return;
          }

          const targets = resolveTargets(message, simplified, key);
          if (targets.length === 0) {
            await reply('❌ Reply ke sticker/gambar/album dulu untuk menambahkannya ke pack.');
            return;
          }

          const { added, skipped } = await addMediaMessages(targets, coll);
          if (added === 0) {
            await reply(`❌ Tidak ada media valid yang bisa ditambahkan${skipped > 0 ? ` (${skipped} gagal diunduh/dikonversi)` : ''}.`);
            return;
          }
          await reply(
            `✅ ${added} sticker ditambahkan ke pack "${coll.name}" (total ${coll.stickers.length}/${MAX_STICKERS})${skipped > 0 ? `, ${skipped} dilewati` : ''}.\nKirim dengan \`!stickerpack send\`.`,
          );
          return;
        }

        case 'send':
        case 'kirim': {
          const coll = packCollectionStore.get(key);
          if (!coll || coll.stickers.length === 0) {
            await reply('⚠️ Pack kosong. Tambahkan sticker dulu (reply media + `!stickerpack add`) atau mulai baru dengan `!stickerpack <Nama>`.');
            return;
          }
          await socket.sendMessage(fromJid, {
            stickerPack: {
              name: coll.name,
              publisher: coll.publisher,
              packId: `sp-${Date.now().toString(36)}`,
              description: `Test sticker pack via !stickerpack (${coll.stickers.length} sticker)`,
              cover: coll.stickers[0].data,
              stickers: coll.stickers,
            },
          });
          await reply(`✅ Sticker pack "${coll.name}" (${coll.stickers.length} sticker) terkirim!`);
          return;
        }

        case 'info':
        case 'status': {
          const coll = packCollectionStore.get(key);
          if (!coll || coll.stickers.length === 0) {
            await reply('⚠️ Tidak ada pack aktif. Mulai dengan `!stickerpack <Nama|Publisher>`.');
            return;
          }
          await reply(`📦 *Pack aktif*\nNama: ${coll.name}\nPublisher: ${coll.publisher}\nSticker: ${coll.stickers.length}/${MAX_STICKERS}\n\nGunakan \`!stickerpack send\` untuk mengirim, \`!stickerpack cancel\` untuk membatalkan.`);
          return;
        }

        case 'cancel':
        case 'batal':
        case 'clear': {
          const existed = packCollectionStore.delete(key);
          await reply(existed ? '🗑️ Pack aktif dibatalkan.' : '⚠️ Tidak ada pack aktif untuk dibatalkan.');
          return;
        }

        case 'demo':
        case 'test': {
          const { name, publisher } = parseNameArgs(args.slice(1));
          const colors: [number, number, number][] = [
            [255, 82, 82],
            [82, 196, 26],
            [24, 144, 255],
            [250, 173, 20],
          ];
          const webps: Buffer[] = [];
          for (const color of colors) {
            const png = createSolidPng(256, 256, color);
            const sticker = new Sticker(png, {
              pack: name,
              author: publisher,
              type: StickerTypes.CROPPED,
              categories: ['✨'],
              quality: 100,
            });
            webps.push(await sticker.toBuffer());
          }
          await socket.sendMessage(fromJid, {
            stickerPack: {
              name,
              publisher,
              packId: `sp-demo-${Date.now().toString(36)}`,
              description: `Demo sticker pack (${webps.length} sticker) dibuat otomatis`,
              cover: webps[0],
              stickers: webps.map((data, i) => ({
                data,
                emojis: ['✨'],
                accessibilityLabel: `Demo Sticker ${i + 1}`,
              })),
            },
          });
          await reply(`✅ Demo sticker pack "${name}" (${webps.length} sticker) terkirim!`);
          return;
        }

        default: {
          // Start a new collection (optionally seed it with the replied/attached media)
          const { name, publisher } = parseNameArgs(args);
          const coll: PackCollection = { name, publisher, stickers: [] };
          packCollectionStore.set(key, coll);

          const targets = resolveTargets(message, simplified, key);
          if (targets.length > 0) {
            const { added, skipped } = await addMediaMessages(targets, coll);
            if (added > 0) {
              await reply(`✅ Pack "${name}" dibuat dengan ${added} sticker${skipped > 0 ? `, ${skipped} dilewati` : ''}.\nTambahkan lagi dengan reply media + \`!stickerpack add\`, lalu \`!stickerpack send\`.`);
              return;
            }
          }
          await reply(`✅ Pack "${name}" (${publisher}) dibuat.\nReply ke sticker/gambar/album lalu gunakan \`!stickerpack add\` untuk menambah, \`!stickerpack send\` untuk mengirim.`);
          return;
        }
      }
    } catch (error) {
      log.error('❌ Error creating sticker pack:', error as object);
      await reply('❌ Gagal membuat sticker pack. Pastikan gambar/sticker valid dan ukurannya < 1MB.');
    }
  },
};

export default stickerPackCommand;
