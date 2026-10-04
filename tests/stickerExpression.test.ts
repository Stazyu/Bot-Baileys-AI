import assert from 'node:assert/strict';
import test from 'node:test';
import { AIService } from '../src/services/aiService.js';
import type { VisionImage } from '../src/utils/vision.js';

const jpeg = (over: Partial<VisionImage> = {}): VisionImage => ({
  mediaType: 'image/jpeg',
  data: new Uint8Array([1, 2, 3]),
  ...over,
});

function buildContent(message: string, images?: VisionImage[] | null) {
  const service = new AIService();
  return (service as unknown as {
    buildUserContent(m: string, i?: VisionImage[] | null): unknown;
  }).buildUserContent(message, images);
}

test('gambar biasa tanpa teks tidak dapat hint ekspresi', () => {
  const parts = buildContent('', [jpeg()]) as { type: string; text?: string }[];
  assert.equal(parts.length, 1);
  assert.equal(parts[0].type, 'file');
});

test('sticker tanpa teks dapat hint ekspresi, bukan pertanyaan', () => {
  const parts = buildContent('', [jpeg({ isSticker: true })]) as { type: string; text?: string }[];
  assert.equal(parts.length, 2);
  assert.equal(parts[0].type, 'text');
  assert.match(parts[0].text ?? '', /sticker/i);
  assert.match(parts[0].text ?? '', /ekspresi/i);
  assert.match(parts[0].text ?? '', /bukan pertanyaan/i);
  assert.equal(parts[1].type, 'file');
});

test('teks user tetap duluan, hint sticker menyusul', () => {
  const parts = buildContent('lah maksudnya apa', [jpeg({ isSticker: true })]) as { type: string; text?: string }[];
  assert.equal(parts[0].text, 'lah maksudnya apa');
  assert.match(parts[1].text ?? '', /ekspresi/i);
  assert.equal(parts[2].type, 'file');
});

test('teks saja tetap string biasa (fast path)', () => {
  assert.equal(buildContent('halo', null), 'halo');
  assert.equal(buildContent('halo', []), 'halo');
});
