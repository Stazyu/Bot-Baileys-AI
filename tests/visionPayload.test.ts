import assert from 'node:assert/strict';
import test from 'node:test';
import type { proto } from '@stazyu/baileys';
import { extractVisionImagePayload } from '../src/utils/messageHelper.js';
import { hasVisionImage } from '../src/utils/vision.js';

const image = (caption?: string): proto.Message.IImageMessage => ({
  mediaKey: new Uint8Array([1, 2, 3]),
  directPath: '/v/thumbnail',
  ...(caption !== undefined ? { caption } : {}),
});

test('finds an image on the message itself', () => {
  const payload = extractVisionImagePayload({ imageMessage: image('apa ini') });
  assert.equal(payload?.caption, 'apa ini');
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
