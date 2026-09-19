import assert from 'node:assert/strict';
import test from 'node:test';
import type { WASocket, WAMessage } from '@stazyu/baileys';
import { BotHandler } from '../src/bot/botHandler.js';

function createMockSocket(): WASocket {
  return {
    ev: {
      on: () => {},
      off: () => {},
      emit: () => false,
      process: () => {},
      removeAllListeners: () => {},
    },
    user: {
      id: '62899999999:1@s.whatsapp.net',
      lid: '62899999999:1@lid',
    },
  } as unknown as WASocket;
}

test('simplified extracts message and command from ephemeral message in group with senderKeyDistributionMessage', () => {
  const handler = new BotHandler(createMockSocket(), 'test-session');

  const incomingMessage: WAMessage = {
    key: {
      remoteJid: '123456789@g.us',
      id: 'MSG-001',
      fromMe: false,
      participant: '62812345678@s.whatsapp.net',
    },
    message: {
      messageContextInfo: { deviceListMetadata: {} },
      senderKeyDistributionMessage: { groupId: '123456789@g.us' },
      ephemeralMessage: {
        message: {
          extendedTextMessage: {
            text: '!ping',
          },
        },
      },
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
  };

  const simplified = handler.simplified(incomingMessage);

  assert.equal(simplified.type, 'extendedTextMessage');
  assert.equal(simplified.isCmd, true);
  assert.equal(simplified.command, 'ping');
  assert.equal(simplified.user_id, '62812345678@s.whatsapp.net');
  assert.equal(simplified.message, '!ping');
  assert.equal(simplified.body, '!ping');
  assert.notEqual(simplified.message, null);
});

test('simplified extracts media and command from viewOnceMessageV2 with caption', () => {
  const handler = new BotHandler(createMockSocket(), 'test-session');

  const incomingMessage: WAMessage = {
    key: {
      remoteJid: '62812345678@s.whatsapp.net',
      id: 'MSG-002',
      fromMe: false,
    },
    message: {
      viewOnceMessageV2: {
        message: {
          imageMessage: {
            caption: '!sticker pack1',
            mimetype: 'image/jpeg',
          },
        },
      },
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
  };

  const simplified = handler.simplified(incomingMessage);

  assert.equal(simplified.type, 'imageMessage');
  assert.equal(simplified.isImage, true);
  assert.equal(simplified.isMedia, true);
  assert.equal(simplified.isCmd, true);
  assert.equal(simplified.command, 'sticker');
  assert.deepEqual(simplified.args, ['pack1']);
  assert.equal(simplified.message, '!sticker pack1');
  assert.equal(simplified.body, '!sticker pack1');
  assert.notEqual(simplified.message, null);
});

test('simplified handles normal text message without prefix (not detected as null)', () => {
  const handler = new BotHandler(createMockSocket(), 'test-session');

  const incomingMessage: WAMessage = {
    key: {
      remoteJid: '62812345678@s.whatsapp.net',
      id: 'MSG-003',
      fromMe: false,
    },
    message: {
      conversation: 'halo bot apa kabar',
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
  };

  const simplified = handler.simplified(incomingMessage);

  assert.equal(simplified.type, 'conversation');
  assert.equal(simplified.isCmd, false);
  assert.equal(simplified.command, null);
  assert.equal(simplified.message, 'halo bot apa kabar');
  assert.equal(simplified.body, 'halo bot apa kabar');
});

test('simplified unwraps quoted ephemeral image message', () => {
  const handler = new BotHandler(createMockSocket(), 'test-session');

  const incomingMessage: WAMessage = {
    key: {
      remoteJid: '123456789@g.us',
      id: 'MSG-004',
      fromMe: false,
      participant: '62812345678@s.whatsapp.net',
    },
    message: {
      extendedTextMessage: {
        text: '!sticker',
        contextInfo: {
          participant: '62898765432@s.whatsapp.net',
          quotedMessage: {
            ephemeralMessage: {
              message: {
                imageMessage: {
                  caption: 'foto di ephemeral',
                },
              },
            },
          },
        },
      },
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
  };

  const simplified = handler.simplified(incomingMessage);

  assert.equal(simplified.isQuotedImage, true);
  assert.equal(simplified.quotedMessageType, 'imageMessage');
  assert.equal(simplified.quotedInfo?.quotedMessage?.imageMessage?.caption, 'foto di ephemeral');
});

// `botNumber` and `message_prefix` have no in-repo consumer yet, but they are part of
// the payload exposed to plugins/inline scripts — keep them populated.
test('simplified exposes botNumber and message_prefix for command messages', () => {
  const handler = new BotHandler(createMockSocket(), 'test-session');

  const simplified = handler.simplified({
    key: {
      remoteJid: '123456789@g.us',
      id: 'MSG-005',
      fromMe: false,
      participant: '62812345678@s.whatsapp.net',
    },
    message: {
      senderKeyDistributionMessage: { groupId: '123456789@g.us' },
      extendedTextMessage: { text: '!ping arg1' },
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
  });

  assert.equal(simplified.botNumber, '62899999999@s.whatsapp.net');
  assert.equal(simplified.message_prefix, '!ping arg1');
  assert.equal(simplified.command, 'ping');
});

test('simplified leaves message_prefix null when no prefix matched', () => {
  const handler = new BotHandler(createMockSocket(), 'test-session');

  const simplified = handler.simplified({
    key: {
      remoteJid: '62812345678@s.whatsapp.net',
      id: 'MSG-006',
      fromMe: false,
    },
    message: {
      audioMessage: { mimetype: 'audio/ogg' },
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
  });

  assert.equal(simplified.message_prefix, null);
  assert.equal(simplified.message, null);
  // Still exposed even though this payload carries no text at all.
  assert.equal(simplified.botNumber, '62899999999@s.whatsapp.net');
});
