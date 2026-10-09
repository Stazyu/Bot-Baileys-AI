import assert from 'node:assert/strict';
import test from 'node:test';
import joinCommand, { extractInviteCode } from '../src/plugins/owner/join.js';

type JoinContext = Parameters<typeof joinCommand.handler>[0];

interface SentMessage {
  jid: string;
  text: string;
}

function makeContext(overrides: Partial<JoinContext> & { quotedMessage?: unknown } = {}) {
  const sent: SentMessage[] = [];
  const accepted: string[] = [];
  const acceptedV4: unknown[] = [];

  const socket = {
    sendMessage: async (jid: string, message: { text: string }) => {
      sent.push({ jid, text: message.text });
    },
    groupAcceptInvite: async (code: string) => {
      accepted.push(code);
      return '1234567890-123456@g.us';
    },
    groupAcceptInviteV4: async (key: unknown, inviteMessage: unknown) => {
      acceptedV4.push({ key, inviteMessage });
      return '1234567890-123456@g.us';
    },
    groupMetadata: async () => ({ subject: 'Grup Test' }),
  };

  const context = {
    socket,
    fromJid: 'owner@s.whatsapp.net',
    sessionId: 'test',
    fromMe: true,
    message: {},
    simplified: { body: '', quotedInfo: undefined },
    ...overrides,
  } as unknown as JoinContext;

  return { context, sent, accepted, acceptedV4 };
}

test('extractInviteCode parses invite links, bare links and bare codes', () => {
  assert.equal(extractInviteCode('https://chat.whatsapp.com/AbCdEf1234567890'), 'AbCdEf1234567890');
  assert.equal(extractInviteCode('https://chat.whatsapp.com/invite/HrKq9zXmN2pQ7vB'), 'HrKq9zXmN2pQ7vB');
  assert.equal(extractInviteCode('chat.whatsapp.com/JklMnOpQrStUvWx'), 'JklMnOpQrStUvWx');
  assert.equal(extractInviteCode('!join https://chat.whatsapp.com/AbCdEf1234567890'), 'AbCdEf1234567890');
  assert.equal(extractInviteCode('AbCdEfGhIjKlMnOp'), 'AbCdEfGhIjKlMnOp');
});

test('extractInviteCode rejects non-invite input', () => {
  assert.equal(extractInviteCode(''), null);
  assert.equal(extractInviteCode(undefined), null);
  assert.equal(extractInviteCode(null), null);
  assert.equal(extractInviteCode('-'), null);
  assert.equal(extractInviteCode('hello world'), null);
  assert.equal(extractInviteCode('https://example.com/AbCdEf1234567890'), null);
});

test('join command joins via an invite link argument', async () => {
  const { context, sent, accepted } = makeContext();

  await joinCommand.handler(context, ['https://chat.whatsapp.com/AbCdEf1234567890']);

  assert.deepEqual(accepted, ['AbCdEf1234567890']);
  assert.match(sent[0].text, /Berhasil join/);
  assert.match(sent[0].text, /Grup Test/);
});

test('join command joins via a quoted group invite message', async () => {
  const { context, sent, accepted, acceptedV4 } = makeContext({
    simplified: {
      body: '',
      quotedInfo: {
        participant: 'inviter@s.whatsapp.net',
        quotedMessage: {
          groupInviteMessage: {
            inviteCode: 'QuotedInviteCode12',
            inviteExpiration: 1893456000,
            groupJid: '1234567890-123456@g.us',
            groupName: 'Quoted Group',
          },
        },
      },
    },
  } as Partial<JoinContext>);

  await joinCommand.handler(context, []);

  assert.equal(acceptedV4.length, 1);
  assert.equal(accepted.length, 0, 'should not fall back to groupAcceptInvite when V4 succeeds');
  assert.match(sent[0].text, /Berhasil join/);
});

test('join command reports usage when no invite code is found', async () => {
  const { context, sent, accepted } = makeContext();

  await joinCommand.handler(context, []);

  assert.equal(accepted.length, 0);
  assert.match(sent[0].text, /Link undangan tidak ditemukan/);
});

test('join command surfaces a friendly error when the invite is invalid', async () => {
  const { context, sent } = makeContext();
  (context.socket as unknown as { groupAcceptInvite: () => Promise<never> }).groupAcceptInvite =
    async () => {
      throw new Error('not-authorized');
    };

  await joinCommand.handler(context, ['https://chat.whatsapp.com/AbCdEf1234567890']);

  assert.match(sent[0].text, /Gagal join ke grup/);
});

test('join command is owner-only and rate limited', () => {
  assert.equal(joinCommand.config.ownerOnly, true);
  assert.equal(joinCommand.config.cooldown, 5);
  assert.ok(joinCommand.config.aliases?.length);
});
