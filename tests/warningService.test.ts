import assert from 'node:assert/strict';
import test from 'node:test';
import type { GroupParticipant } from '@stazyu/baileys';
import {
  resolveParticipant,
  isCallerAdmin,
  isBotAdmin,
  formatParticipantDisplay,
  getParticipantMentions,
  MAX_WARNINGS,
} from '../src/services/warningService.js';

const mockParticipants: GroupParticipant[] = [
  {
    id: '628111111111@s.whatsapp.net',
    phoneNumber: '628111111111@s.whatsapp.net',
    admin: 'superadmin',
    name: 'Admin Group',
    notify: 'AdminGroup',
  },
  {
    id: '628222222222@s.whatsapp.net',
    phoneNumber: '628222222222@s.whatsapp.net',
    admin: 'admin',
    name: 'Co-Admin',
    notify: 'CoAdmin',
  },
  {
    id: '123456789012345@lid',
    lid: '123456789012345@lid',
    phoneNumber: '628333333333@s.whatsapp.net',
    admin: null,
    name: 'Lid User',
    notify: 'LidUser',
  },
  {
    id: '628444444444@s.whatsapp.net',
    phoneNumber: '628444444444@s.whatsapp.net',
    admin: null,
    name: 'Regular Member',
    notify: 'RegularMember',
  },
];

test('MAX_WARNINGS is configured to 3', () => {
  assert.equal(MAX_WARNINGS, 3);
});

test('resolveParticipant matches exact JID', () => {
  const result = resolveParticipant(mockParticipants, '628444444444@s.whatsapp.net');
  assert.ok(result);
  assert.equal(result.id, '628444444444@s.whatsapp.net');
});

test('resolveParticipant matches mention with @ symbol', () => {
  const result = resolveParticipant(mockParticipants, '@628444444444');
  assert.ok(result);
  assert.equal(result.id, '628444444444@s.whatsapp.net');
});

test('resolveParticipant matches LID', () => {
  const result = resolveParticipant(mockParticipants, '123456789012345@lid');
  assert.ok(result);
  assert.equal(result.id, '123456789012345@lid');
});

test('resolveParticipant matches phone number format with 08 prefix', () => {
  const result = resolveParticipant(mockParticipants, '08444444444');
  assert.ok(result);
  assert.equal(result.id, '628444444444@s.whatsapp.net');
});

test('resolveParticipant matches quoted participant when input is empty', () => {
  const result = resolveParticipant(mockParticipants, '', '628444444444@s.whatsapp.net');
  assert.ok(result);
  assert.equal(result.id, '628444444444@s.whatsapp.net');
});

test('resolveParticipant matches name or notify attribute', () => {
  const result = resolveParticipant(mockParticipants, 'Regular');
  assert.ok(result);
  assert.equal(result.id, '628444444444@s.whatsapp.net');
});

test('resolveParticipant returns null when not found', () => {
  const result = resolveParticipant(mockParticipants, '99999999999');
  assert.equal(result, null);
});

test('resolveParticipant matches LID digits without @lid domain', () => {
  const result = resolveParticipant(mockParticipants, '@123456789012345');
  assert.ok(result);
  assert.equal(result.id, '123456789012345@lid');
});

test('isCallerAdmin recognizes admin and superadmin', () => {
  assert.equal(isCallerAdmin(mockParticipants, '628111111111@s.whatsapp.net'), true);
  assert.equal(isCallerAdmin(mockParticipants, '628222222222@s.whatsapp.net'), true);
  assert.equal(isCallerAdmin(mockParticipants, '628444444444@s.whatsapp.net'), false);
  assert.equal(isCallerAdmin(mockParticipants, 'random@s.whatsapp.net', true), true); // fromMe
});

test('isBotAdmin detects if bot is an admin in group', () => {
  const botAdmin = isBotAdmin(mockParticipants, '628222222222:1@s.whatsapp.net');
  assert.equal(botAdmin, true);

  const botNotAdmin = isBotAdmin(mockParticipants, '628444444444:1@s.whatsapp.net');
  assert.equal(botNotAdmin, false);
});

test('formatParticipantDisplay returns user part of id for correct mentions', () => {
  assert.equal(formatParticipantDisplay(mockParticipants[0]), '628111111111');
  assert.equal(formatParticipantDisplay(mockParticipants[2]), '123456789012345');
});

test('getParticipantMentions includes id, lid, and phoneNumber', () => {
  const mentions = getParticipantMentions(mockParticipants[2]);
  assert.ok(mentions.includes('123456789012345@lid'));
  assert.ok(mentions.includes('628333333333@s.whatsapp.net'));
});

test('isCallerAdmin recognizes admin via callerLid', () => {
  const adminWithLid: GroupParticipant[] = [
    {
      id: '888888888888@lid',
      lid: '888888888888@lid',
      phoneNumber: '628999999999@s.whatsapp.net',
      admin: 'admin',
    },
  ];
  assert.equal(isCallerAdmin(adminWithLid, '628999999999@s.whatsapp.net', false, '888888888888@lid'), true);
  assert.equal(isCallerAdmin(adminWithLid, 'unmatched@s.whatsapp.net', false, '888888888888@lid'), true);
});

test('bot does not allow warning itself via phone number or LID', async () => {
  const mockSocket = {
    user: {
      id: '628999999999:1@s.whatsapp.net',
      lid: '35868026892361:0@lid',
    },
    groupMetadata: async () => ({
      id: '120363029871224778@g.us',
      participants: [
        { id: '628111111111@s.whatsapp.net', admin: 'admin' },
        { id: '35868026892361@lid', admin: null },
      ],
    }),
  };

  const warningServiceModule = (await import('../src/services/warningService.js')).default;
  const res = await warningServiceModule.warnMember({
    socket: mockSocket as any,
    groupId: '120363029871224778@g.us',
    targetInput: '35868026892361@lid',
    adminJid: '628111111111@s.whatsapp.net',
  });

  assert.equal(res.success, false);
  assert.ok(res.message.includes('Bot tidak bisa memberi peringatan kepada dirinya sendiri'));
});
