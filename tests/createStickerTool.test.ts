import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { StickerTypes } from 'wa-sticker-formatter';
import {
  definition,
  execute,
  extractTargetMedia,
  resolveStickerType,
} from '../src/tools/definitions/createSticker.js';
import type { ToolContext } from '../src/types/tools.js';
import type { proto, WAMessage } from '@stazyu/baileys';

// Helper to create valid 100x100 PNG image buffer
async function createSampleImageBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: { r: 255, g: 100, b: 50, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

test('create_sticker definition has expected name and schema', () => {
  assert.equal(definition.function.name, 'create_sticker');
  assert.ok(definition.function.description.includes('WhatsApp sticker'));
  const props = definition.function.parameters.properties;
  assert.ok(props.pack);
  assert.ok(props.author);
  assert.ok(props.sticker_type);
  assert.ok(props.url);
});

test('resolveStickerType maps layout strings correctly', () => {
  assert.equal(resolveStickerType('full'), StickerTypes.FULL);
  assert.equal(resolveStickerType('FULL'), StickerTypes.FULL);
  assert.equal(resolveStickerType('crop'), StickerTypes.CROPPED);
  assert.equal(resolveStickerType('cropped'), StickerTypes.CROPPED);
  assert.equal(resolveStickerType('circle'), StickerTypes.CIRCLE);
  assert.equal(resolveStickerType('rounded'), StickerTypes.ROUNDED);
  assert.equal(resolveStickerType('default'), StickerTypes.DEFAULT);
  assert.equal(resolveStickerType('unknown'), StickerTypes.FULL);
  assert.equal(resolveStickerType(undefined), StickerTypes.FULL);
});

test('extractTargetMedia identifies direct image from user', () => {
  const context: ToolContext = {
    message: {
      key: { id: 'msg1', remoteJid: '123@s.whatsapp.net', fromMe: false },
      message: {
        imageMessage: {
          mediaKey: new Uint8Array([1, 2, 3]),
          directPath: '/v/image',
          mimetype: 'image/jpeg',
        },
      },
    } as WAMessage,
  };

  const target = extractTargetMedia(context);
  assert.ok(target);
  assert.equal(target.kind, 'image');
  assert.equal(target.source, 'own');
});

test('extractTargetMedia identifies quoted image from reply', () => {
  const context: ToolContext = {
    message: {
      key: { id: 'msg2', remoteJid: '123@s.whatsapp.net', fromMe: false },
      message: {
        extendedTextMessage: {
          text: 'jadikan stiker ini',
          contextInfo: {
            quotedMessage: {
              imageMessage: {
                mediaKey: new Uint8Array([4, 5, 6]),
                directPath: '/v/quoted_image',
                mimetype: 'image/png',
              },
            },
          },
        },
      },
    } as WAMessage,
  };

  const target = extractTargetMedia(context);
  assert.ok(target);
  assert.equal(target.kind, 'image');
  assert.equal(target.source, 'quoted');
});

test('extractTargetMedia unwraps ephemeral container', () => {
  const context: ToolContext = {
    message: {
      key: { id: 'msg3', remoteJid: '123@s.whatsapp.net', fromMe: false },
      message: {
        ephemeralMessage: {
          message: {
            imageMessage: {
              mediaKey: new Uint8Array([7, 8, 9]),
              directPath: '/v/ephemeral_image',
              mimetype: 'image/jpeg',
            },
          },
        },
      },
    } as WAMessage,
  };

  const target = extractTargetMedia(context);
  assert.ok(target);
  assert.equal(target.kind, 'image');
  assert.equal(target.source, 'own');
});

test('extractTargetMedia unwraps quoted viewOnce container', () => {
  const context: ToolContext = {
    message: {
      key: { id: 'msg4', remoteJid: '123@s.whatsapp.net', fromMe: false },
      message: {
        extendedTextMessage: {
          text: 'stikerin dong',
          contextInfo: {
            quotedMessage: {
              viewOnceMessageV2: {
                message: {
                  imageMessage: {
                    mediaKey: new Uint8Array([10, 11, 12]),
                    directPath: '/v/viewonce_image',
                  },
                },
              },
            },
          },
        },
      },
    } as WAMessage,
  };

  const target = extractTargetMedia(context);
  assert.ok(target);
  assert.equal(target.kind, 'image');
  assert.equal(target.source, 'quoted');
});

test('extractTargetMedia identifies sticker message', () => {
  const context: ToolContext = {
    message: {
      key: { id: 'msg5', remoteJid: '123@s.whatsapp.net', fromMe: false },
      message: {
        stickerMessage: {
          mediaKey: new Uint8Array([1, 2, 3]),
          directPath: '/v/sticker',
          mimetype: 'image/webp',
        },
      },
    } as WAMessage,
  };

  const target = extractTargetMedia(context);
  assert.ok(target);
  assert.equal(target.kind, 'sticker');
  assert.equal(target.source, 'own');
});

test('extractTargetMedia identifies document with image mimetype', () => {
  const context: ToolContext = {
    message: {
      key: { id: 'msg6', remoteJid: '123@s.whatsapp.net', fromMe: false },
      message: {
        documentMessage: {
          mediaKey: new Uint8Array([1, 2, 3]),
          directPath: '/v/doc',
          mimetype: 'image/png',
        },
      },
    } as WAMessage,
  };

  const target = extractTargetMedia(context);
  assert.ok(target);
  assert.equal(target.kind, 'document');
  assert.equal(target.source, 'own');
});

test('extractTargetMedia returns null when message has no media', () => {
  const context: ToolContext = {
    message: {
      key: { id: 'msg7', remoteJid: '123@s.whatsapp.net', fromMe: false },
      message: {
        conversation: 'halo bot apa kabar',
      },
    } as WAMessage,
  };

  const target = extractTargetMedia(context);
  assert.equal(target, null);
});

test('execute returns error when socket or fromJid missing', async () => {
  const res1 = await execute({}, {});
  assert.equal(res1.success, false);
  assert.ok(res1.message.includes('Konteks chat tidak tersedia'));

  const res2 = await execute({}, { socket: {} as any });
  assert.equal(res2.success, false);
});

test('execute returns error when no media is sent or quoted', async () => {
  const sentMessages: any[] = [];
  const fakeSocket = {
    sendMessage: async (jid: string, content: any, opts: any) => {
      sentMessages.push({ jid, content, opts });
      return {};
    },
  };

  const context: ToolContext = {
    socket: fakeSocket as any,
    fromJid: 'user@s.whatsapp.net',
    message: {
      key: { id: 'msg', remoteJid: 'user@s.whatsapp.net' },
      message: { conversation: 'bikinin stiker' },
    } as WAMessage,
  };

  const res = await execute({}, context);
  assert.equal(res.success, false);
  assert.ok(res.message.includes('Tidak ada gambar atau video'));
  assert.equal(sentMessages.length, 0);
});

test('execute uses visionImages fallback and sends sticker', async () => {
  const sampleBuf = await createSampleImageBuffer();
  const sentMessages: any[] = [];
  const fakeSocket = {
    sendMessage: async (jid: string, content: any, opts: any) => {
      sentMessages.push({ jid, content, opts });
      return {};
    },
  };

  const context: ToolContext = {
    socket: fakeSocket as any,
    fromJid: 'user@s.whatsapp.net',
    pushName: 'Wahyu',
    visionImages: [
      {
        mediaType: 'image/png',
        data: new Uint8Array(sampleBuf),
      },
    ],
  };

  const res = await execute(
    { pack: 'Kucing Lucu', author: 'Wahyu HP', sticker_type: 'cropped' },
    context,
  );

  assert.equal(res.success, true);
  assert.ok(res.message.includes('Stiker berhasil dibuat'));
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].jid, 'user@s.whatsapp.net');
  assert.ok(Buffer.isBuffer(sentMessages[0].content.sticker));
  assert.ok(sentMessages[0].content.sticker.length > 0);
});

test('execute quotes the incoming message when context.message is provided', async () => {
  const sampleBuf = await createSampleImageBuffer();
  const sentMessages: any[] = [];
  const fakeSocket = {
    sendMessage: async (jid: string, content: any, opts: any) => {
      sentMessages.push({ jid, content, opts });
      return {};
    },
  };

  const incomingMessage = {
    key: { id: 'msg_to_quote', remoteJid: 'user@s.whatsapp.net', fromMe: false },
    message: { conversation: 'tolong buat stiker' },
  } as WAMessage;

  const context: ToolContext = {
    socket: fakeSocket as any,
    fromJid: 'user@s.whatsapp.net',
    message: incomingMessage,
    visionImages: [
      {
        mediaType: 'image/png',
        data: new Uint8Array(sampleBuf),
      },
    ],
  };

  const res = await execute({}, context);
  assert.equal(res.success, true);
  assert.equal(sentMessages.length, 1);
  assert.deepEqual(sentMessages[0].opts, { quoted: incomingMessage });
  assert.equal((res.data as any).author, 'AI Bot');
  assert.equal((res.data as any).pack, 'Bot-Baileys');
});

test('create_sticker and make_sticker are registered in allTools', async () => {
  const { allTools } = await import('../src/tools/definitions/index.js');
  const createStickerTool = allTools.find((t) => t.name === 'create_sticker');
  const makeStickerTool = allTools.find((t) => t.name === 'make_sticker');

  assert.ok(createStickerTool);
  assert.ok(makeStickerTool);
  assert.equal(createStickerTool.execute, execute);
  assert.equal(makeStickerTool.execute, execute);
});

