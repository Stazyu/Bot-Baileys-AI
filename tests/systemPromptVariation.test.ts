import assert from 'node:assert/strict';
import test from 'node:test';
import { getSystemPrompt, getGroupSystemPrompt } from '../src/services/systemPrompt.js';

/**
 * Guard for the "balasannya itu-itu saja" problem.
 *
 * Root cause: contoh balasan yang ditulis sebagai kalimat lengkap di prompt
 * dihafal model sebagai stok kalimat, lalu dipakai ulang tiap kali topiknya
 * muncul (kata kasar, salam, ack tool). Prompt sekarang hanya boleh memuat
 * POLA/inti, bukan kalimat siap pakai.
 */

const base = getSystemPrompt();
const group = getGroupSystemPrompt('08:00', 'Budi');

test('kedua prompt memuat aturan anti-ulang kalimat', () => {
  for (const prompt of [base, group]) {
    assert.match(prompt, /ANTI-ULANG KALIMAT/);
  }
});

test('prompt tidak lagi memuat kalimat kalengan siap pakai', () => {
  const canned = [
    'EXAMPLES TO MEMORIZE',
    'Mulutnya dijaga bos',
    'Siap, ditunggu ya',
    'Siap, tunggu ya',
    'Nih sosmednya',
    'Cosplay doang',
  ];
  for (const prompt of [base, group]) {
    for (const phrase of canned) {
      assert.ok(!prompt.includes(phrase), `frasa kalengan masih ada: "${phrase}"`);
    }
  }
});

test('prompt dasar punya blok kata kasar + aturan variasi wajib', () => {
  assert.match(base, /KATA KASAR \/ JOROK/);
  assert.match(base, /DILARANG memakai sindiran\/kalimat yang sama dua kali/);
});

test('prompt grup punya rubrik variasi berbasis pola, bukan kalimat contoh', () => {
  assert.match(group, /RUBRIK VARIASI/);
  assert.match(group, /POLA, bukan kalimat siap pakai/);
  assert.match(group, /EXAMPLES — BELAJAR POLANYA/);
});

test('salam wajib bervariasi di kedua prompt', () => {
  assert.match(base, /VARIASI SALAM/);
  assert.match(group, /VARY the opener across the conversation/);
});
