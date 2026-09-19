import assert from 'node:assert/strict';
import test from 'node:test';
import type { proto } from '@stazyu/baileys';
import { validateMessage } from '../src/utils/messageValidator.js';

const nowSec = () => Math.floor(Date.now() / 1000);

function baseMessage(overrides: proto.IWebMessageInfo = {}): proto.IWebMessageInfo {
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
  const result = validateMessage(baseMessage({ key: { remoteJid: '6281234567890@s.whatsapp.net', id: 'self-1', fromMe: true } }));
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
  const result = validateMessage(baseMessage({ messageTimestamp: 'not-a-time' as unknown as number }));
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

test('accepts a group message whose payload sits behind senderKeyDistributionMessage', () => {
  const msg = baseMessage({
    key: { remoteJid: '123456789@g.us', id: 'grp-1', fromMe: false, participant: '62812345678@s.whatsapp.net' },
    message: {
      messageContextInfo: {},
      senderKeyDistributionMessage: { groupId: '123456789@g.us' },
      conversation: 'halo grup',
    },
  });
  assert.deepEqual(validateMessage(msg), { valid: true });
});

test('accepts wrapped ephemeral message with text', () => {
  const msg = baseMessage({
    message: {
      ephemeralMessage: {
        message: { conversation: 'halo ephemeral' },
      },
    },
  });
  assert.deepEqual(validateMessage(msg), { valid: true });
});

test('rejects wrapped ephemeral message with empty text body', () => {
  const msg = baseMessage({
    message: {
      ephemeralMessage: {
        message: { conversation: '' },
      },
    },
  });
  const result = validateMessage(msg);
  assert.equal(result.valid, false);
  assert.equal(result.code, 'EMPTY_BODY');
});

test('accepts wrapped viewOnce message with caption', () => {
  const msg = baseMessage({
    message: {
      viewOnceMessageV2: {
        message: {
          imageMessage: { caption: 'view once text' },
        },
      },
    },
  });
  assert.deepEqual(validateMessage(msg), { valid: true });
});

test('accepts wrapped documentWithCaption message', () => {
  const msg = baseMessage({
    message: {
      documentWithCaptionMessage: {
        message: {
          documentMessage: { caption: 'caption dokumen' },
        },
      },
    },
  });
  assert.deepEqual(validateMessage(msg), { valid: true });
});
