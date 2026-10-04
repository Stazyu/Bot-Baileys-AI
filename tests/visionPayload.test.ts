import assert from 'node:assert/strict';
import test from 'node:test';
import type { proto } from '@stazyu/baileys';
import { extractVisionImagePayload } from '../src/utils/messageHelper.js';
import { hasVisionImage } from '../src/utils/vision.js';

const image = (caption?: string): proto.Message.IImageMessage => ({
  mediaKey: new Uint8Array([1, 2, 3]),
  directPath: '/v/thumbnail',
  ...(caption === undefined ? {} : { caption }),
});

/** Caption of an image payload; `undefined` for a sticker (it never has one). */
const captionOf = (
  payload: proto.Message.IImageMessage | proto.Message.IStickerMessage | null,
): string | undefined => (payload && 'caption' in payload ? payload.caption ?? undefined : undefined);

const sticker = (): proto.Message.IStickerMessage => ({
  mediaKey: new Uint8Array([1, 2, 3]),
  directPath: '/v/t62.7118-24/sticker',
  mimetype: 'image/webp',
});

test('finds an image on the message itself', () => {
  const payload = extractVisionImagePayload({ imageMessage: image('apa ini') });
  assert.equal(captionOf(payload), 'apa ini');
});

test('finds an image on the message it quotes', () => {
  const payload = extractVisionImagePayload({
    extendedTextMessage: {
      text: 'ini apa?',
      contextInfo: { quotedMessage: { imageMessage: image() } },
    },
  });
  assert.ok(payload);
});

test('unwraps a quoted image hidden in a container message', () => {
  const payload = extractVisionImagePayload({
    extendedTextMessage: {
      text: 'apa ini?',
      contextInfo: {
        quotedMessage: { viewOnceMessageV2: { message: { imageMessage: image() } } },
      },
    },
  });
  assert.ok(payload);
});

test('returns null for text-only messages', () => {
  assert.equal(extractVisionImagePayload({ conversation: 'halo' }), null);
  assert.equal(extractVisionImagePayload(undefined), null);
});

test('hasVisionImage mirrors the payload lookup', () => {
  assert.equal(hasVisionImage({ imageMessage: image() }), true);
  assert.equal(hasVisionImage({ conversation: 'halo' }), false);
});

// ── Stickers ────────────────────────────────────────────────────────────────
// A sticker IS an image for vision: WhatsApp encrypts both with the same HKDF
// key, so the payload decrypts to a plain WebP the model can read.

test('finds a sticker on the message itself', () => {
  const payload = extractVisionImagePayload({ stickerMessage: sticker() });
  assert.equal(payload?.mimetype, 'image/webp');
});

test('finds a sticker on the message it quotes', () => {
  const payload = extractVisionImagePayload({
    extendedTextMessage: {
      text: 'ini apa?',
      contextInfo: { quotedMessage: { stickerMessage: sticker() } },
    },
  });
  assert.ok(payload);
});

test('unwraps a quoted sticker hidden in a container message', () => {
  const payload = extractVisionImagePayload({
    extendedTextMessage: {
      text: 'maksudnya?',
      contextInfo: {
        quotedMessage: { viewOnceMessageV2: { message: { stickerMessage: sticker() } } },
      },
    },
  });
  assert.ok(payload);
});

test('hasVisionImage is true for sticker-only messages', () => {
  assert.equal(hasVisionImage({ stickerMessage: sticker() }), true);
  assert.equal(
    hasVisionImage({
      extendedTextMessage: {
        text: 'ini apa?',
        contextInfo: { quotedMessage: { stickerMessage: sticker() } },
      },
    }),
    true,
  );
});

test('an own image wins over a quoted sticker', () => {
  const payload = extractVisionImagePayload({
    imageMessage: image('ini fotoku'),
    extendedTextMessage: {
      text: 'ini apa?',
      contextInfo: { quotedMessage: { stickerMessage: sticker() } },
    },
  });
  assert.equal(captionOf(payload), 'ini fotoku');
});
