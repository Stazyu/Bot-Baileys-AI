import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGroupKey,
  buildPrivateKey,
  parseMemoryKey,
  sanitizeForStorage,
  trimToMaxTurns,
  validateStored,
} from '../src/services/memoryService.js';
import { premiumService } from '../src/services/premiumService.js';

// ─── Key namespacing ─────────────────────────────────────────────

test('buildPrivateKey namespaces private history', () => {
  assert.equal(buildPrivateKey('62812@s.whatsapp.net'), 'mem:private:62812@s.whatsapp.net');
});

test('buildGroupKey namespaces per (group, sender)', () => {
  assert.equal(
    buildGroupKey('12036@g.us', '62812@s.whatsapp.net'),
    'mem:group:12036@g.us:62812@s.whatsapp.net',
  );
});

test('parseMemoryKey splits group key into sender + group scope', () => {
  const parts = parseMemoryKey('mem:group:12036@g.us:62812@s.whatsapp.net');
  assert.equal(parts.userId, '62812@s.whatsapp.net');
  assert.equal(parts.scope, 'group:12036@g.us');
  assert.equal(parts.isGroup, true);
});

test('parseMemoryKey splits private key', () => {
  const parts = parseMemoryKey('mem:private:62812@s.whatsapp.net');
  assert.equal(parts.userId, '62812@s.whatsapp.net');
  assert.equal(parts.scope, 'private');
  assert.equal(parts.isGroup, false);
});

test('parseMemoryKey treats legacy raw JID as private (transitional)', () => {
  const parts = parseMemoryKey('62812@s.whatsapp.net');
  assert.equal(parts.userId, '62812@s.whatsapp.net');
  assert.equal(parts.scope, 'private');
  assert.equal(parts.isGroup, false);
});

test('two groups do not share scope', () => {
  const a = parseMemoryKey(buildGroupKey('g1@g.us', 'u@s.whatsapp.net'));
  const b = parseMemoryKey(buildGroupKey('g2@g.us', 'u@s.whatsapp.net'));
  assert.notEqual(a.scope, b.scope);
  assert.equal(a.userId, b.userId);
});

test('private and group do not share scope', () => {
  const priv = parseMemoryKey(buildPrivateKey('u@s.whatsapp.net'));
  const grp = parseMemoryKey(buildGroupKey('g1@g.us', 'u@s.whatsapp.net'));
  assert.notEqual(priv.scope, grp.scope);
});

// ─── Trimming (token guard) ──────────────────────────────────────

function makeTurn(i: number): Array<{ role: string; content: string }> {
  return [
    { role: 'user', content: `q${i}` },
    { role: 'assistant', content: `a${i}` },
  ];
}

test('trimToMaxTurns keeps the newest N turns', () => {
  const messages = Array.from({ length: 30 }, (_, i) => makeTurn(i)).flat();
  const trimmed = trimToMaxTurns(messages, 24);
  // 24 turn * 2 pesan = 48, tanpa system prompt.
  assert.equal(trimmed.length, 48);
  assert.equal(trimmed[0]?.content, 'q6');
  assert.equal(trimmed.at(-1)?.content, 'a29');
});

test('trimToMaxTurns preserves the system prompt', () => {
  const messages = [
    { role: 'system', content: 'sys' },
    ...Array.from({ length: 30 }, (_, i) => makeTurn(i)).flat(),
  ];
  const trimmed = trimToMaxTurns(messages, 24);
  assert.equal(trimmed.length, 49);
  assert.equal(trimmed[0]?.role, 'system');
  assert.equal(trimmed[0]?.content, 'sys');
});

test('trimToMaxTurns leaves short history untouched', () => {
  const messages = [...makeTurn(1), ...makeTurn(2)];
  assert.equal(trimToMaxTurns(messages, 24).length, 4);
});

// ─── Sanitization (no binary in Mongo) ───────────────────────────

test('sanitizeForStorage strips file parts, keeps surrounding text', () => {
  const messages = [
    { role: 'user', content: 'lihat ini' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'foto kucing' },
        { type: 'file', mediaType: 'image/jpeg', data: { type: 'data', data: new Uint8Array([1, 2, 3]) } },
      ],
    },
    {
      role: 'user',
      content: [
        { type: 'file', mediaType: 'image/jpeg', data: { type: 'data', data: new Uint8Array([9]) } },
      ],
    },
    { role: 'assistant', content: 'lucu!' },
    { role: 'tool', content: 'payload' },
  ];
  const stored = sanitizeForStorage(messages);
  assert.equal(stored.length, 5);
  assert.equal(stored[1]?.content, 'foto kucing');
  // Gambar tanpa teks → penanda, bukan biner.
  assert.equal(stored[2]?.content, '[media]');
  const json = JSON.stringify(stored);
  assert.ok(!json.includes('Uint8Array'));
});

test('sanitizeForStorage does not mutate the L1 array', () => {
  const original = { type: 'file', mediaType: 'image/jpeg', data: { a: 1 } };
  const messages = [{ role: 'user', content: ['teks', original] as unknown }];
  sanitizeForStorage(messages);
  assert.equal((messages[0].content as unknown[])[1], original);
});

test('sanitizeForStorage drops unknown roles, keeps tool role', () => {
  const messages = [
    { role: 'developer', content: 'x' },
    { role: 'tool', content: 'ok' },
  ];
  const stored = sanitizeForStorage(messages);
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.role, 'tool');
});

// ─── Stored validation ───────────────────────────────────────────

test('validateStored drops corrupt entries per-message', () => {
  const raw = [
    { role: 'user', content: 'halo' },
    { role: 'hacker', content: 'x' },
    { role: 'assistant', content: { nested: true } },
    null,
    'string',
    { role: 'assistant', content: null },
  ];
  const valid = validateStored(raw);
  assert.equal(valid.length, 2);
  assert.deepEqual(valid[0], { role: 'user', content: 'halo' });
  assert.deepEqual(valid[1], { role: 'assistant', content: null });
});

test('validateStored rejects non-array documents', () => {
  assert.deepEqual(validateStored(null), []);
  assert.deepEqual(validateStored({}), []);
  assert.deepEqual(validateStored('x'), []);
});

// ─── Tier defaults (no DB needed — pure in-memory until overridden) ──

test('memory TTL defaults: free=0, premium=7, pro=30', () => {
  assert.equal(premiumService.getMemoryTtlDays('free'), 0);
  assert.equal(premiumService.getMemoryTtlDays('premium'), 7);
  assert.equal(premiumService.getMemoryTtlDays('pro'), 30);
  assert.equal(premiumService.getMemoryTtlDays('unknown-tier'), 0);
});

test('memory max turns default is 24', () => {
  assert.equal(premiumService.getMemoryMaxTurns(), 24);
});
