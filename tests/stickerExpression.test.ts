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

test('sticker yang DIKIRIM user dapat hint ekspresi', () => {
  const parts = buildContent('', [jpeg({ isSticker: true, source: 'own' })]) as { type: string; text?: string }[];
  assert.equal(parts[0].type, 'text');
  assert.match(parts[0].text ?? '', /user mengirim sticker/i);
  assert.match(parts[0].text ?? '', /bukan pertanyaan/i);
});

test('sticker yang DI-BALAS user dapat hint subjek pertanyaan, bukan ekspresi', () => {
  const parts = buildContent('ini maksudnya apa', [
    jpeg({ isSticker: true, source: 'quoted' }),
  ]) as { type: string; text?: string }[];

  assert.equal(parts[0].text, 'ini maksudnya apa');

  const hint = parts[1].text ?? '';
  assert.match(hint, /DI-BALAS/i);
  // Regresi: hint lama menyuruh model membacanya sebagai ekspresi user —
  // itu menghapus pertanyaan yang justru sedang ditanyakan.
  assert.doesNotMatch(hint, /User mengirim sticker/i);
  assert.match(hint, /jawab isi stickernya/i);
});

test('tanpa source, hint sticker tetap aman (default = dikirim sendiri)', () => {
  const parts = buildContent('', [jpeg({ isSticker: true })]) as { type: string; text?: string }[];
  assert.match(parts[0].text ?? '', /user mengirim sticker/i);
});
