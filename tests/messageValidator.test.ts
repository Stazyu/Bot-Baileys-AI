import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMessage } from '../src/utils/messageValidator.js';

const nowSec = () => Math.floor(Date.now() / 1000);

function baseMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: {
      remoteJid: '6281234567890@s.whatsapp.net',
      id: `test-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
      fromMe: false,
    },
    message: { conversation: 'halo bot' },
    messageTimestamp: nowSec(),
    ...overrides,
  };
}

test('accepts a well-formed incoming message', () => {
  assert.deepEqual(validateMessage(baseMessage()), { valid: true });
});

test('rejects a message with no message object', () => {
  const result = validateMessage({ key: { remoteJid: '6281234567890@s.whatsapp.net' } });
  assert.equal(result.valid, false);
  assert.equal(result.code, 'NO_MESSAGE');
});

test('rejects status@broadcast as an invalid JID', () => {
  const result = validateMessage(
    baseMessage({ key: { remoteJid: 'status@broadcast', id: 'x1', fromMe: false } }),
  );
  assert.equal(result.valid, false);
  assert.equal(result.code, 'INVALID_JID');
});

test('ignores self-sent messages by default', () => {
  const msg = baseMessage();
  (msg.key as Record<string, unknown>).fromMe = true;
  const result = validateMessage(msg);
  assert.equal(result.valid, false);
  assert.equal(result.code, 'FROM_ME_IGNORED');
});

test('detects duplicate message IDs within the dedup window', () => {
  const msg = baseMessage();
  assert.equal(validateMessage(msg).valid, true);
  const replay = validateMessage({ ...msg });
  assert.equal(replay.valid, false);
  assert.equal(replay.code, 'DUPLICATE_MESSAGE');
});

test('rejects empty text bodies', () => {
  const result = validateMessage(baseMessage({ message: { conversation: '' } }));
  assert.equal(result.valid, false);
  assert.equal(result.code, 'EMPTY_BODY');
});

test('rejects bodies over maxBodyLength', () => {
  const result = validateMessage(
    baseMessage({ message: { conversation: 'a'.repeat(20) } }),
    { maxBodyLength: 10 },
  );
  assert.equal(result.valid, false);
  assert.equal(result.code, 'BODY_TOO_LONG');
});

test('rejects non-numeric timestamps as invalid', () => {
  const result = validateMessage(baseMessage({ messageTimestamp: 'not-a-time' }));
  assert.equal(result.valid, false);
  assert.equal(result.code, 'TIMESTAMP_INVALID');
});

test('rejects messages older than maxMessageAgeSeconds', () => {
  const result = validateMessage(
    baseMessage({ messageTimestamp: nowSec() - 3600 }),
    { maxMessageAgeSeconds: 300 },
  );
  assert.equal(result.valid, false);
  assert.equal(result.code, 'TIMESTAMP_TOO_OLD');
});

test('rejects messages from the far future', () => {
  const result = validateMessage(
    baseMessage({ messageTimestamp: nowSec() + 3600 }),
    { maxFutureOffsetSeconds: 30 },
  );
  assert.equal(result.valid, false);
  assert.equal(result.code, 'TIMESTAMP_FROM_FUTURE');
});
