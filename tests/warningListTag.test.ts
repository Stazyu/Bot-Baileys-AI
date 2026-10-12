import assert from 'node:assert/strict';
import test from 'node:test';
import type { GroupParticipant } from '@stazyu/baileys';
import {
  buildWarningListMessage,
  extractTagDigits,
  resolveTagMentions,
} from '../src/services/warningService.js';

const participants: GroupParticipant[] = [
  {
    id: '628111111111@s.whatsapp.net',
    phoneNumber: '628111111111@s.whatsapp.net',
    admin: null,
    name: 'Dua Member',
    notify: 'Dua Member',
  },
  {
    id: '123456789012345@lid',
    lid: '123456789012345@lid',
    phoneNumber: '628333333333@s.whatsapp.net',
    admin: null,
    name: 'Satu Member',
    notify: 'Satu Member',
  },
];

const makeRecord = (userId: string, count: number) => ({
  id: `rec-${userId}`,
  groupId: '12036@g.us',
  userId,
  count,
  reasons: ['spam'],
  warnedBy: 'admin@s.whatsapp.net',
  createdAt: new Date(),
  updatedAt: new Date(),
});

test('buildWarningListMessage tags members still in group with fresh JIDs', () => {
  const { text, mentions } = buildWarningListMessage(
    [makeRecord('628111111111@s.whatsapp.net', 2), makeRecord('123456789012345@lid', 1)],
    participants,
  );

  assert.ok(text.includes('@628111111111 — [2/3]'));
  assert.ok(text.includes('@123456789012345 — [1/3]'));
  assert.ok(mentions.includes('628111111111@s.whatsapp.net'));
  assert.ok(mentions.includes('123456789012345@lid'));
  assert.ok(mentions.includes('628333333333@s.whatsapp.net'));
});

test('buildWarningListMessage marks members who already left the group', () => {
  const { text, mentions } = buildWarningListMessage(
    [makeRecord('628999999999@s.whatsapp.net', 3)],
    participants,
  );

  assert.ok(text.includes('(sudah keluar grup)'));
  assert.ok(mentions.includes('628999999999@s.whatsapp.net'));
});

test('extractTagDigits picks up only 7+ digit tags', () => {
  assert.deepEqual(extractTagDigits('Nih yang kena: @628111111111, @123456789012345'), [
    '628111111111',
    '123456789012345',
  ]);
  assert.deepEqual(extractTagDigits('halo @bot apa kabar, colek @12345'), []);
});

test('resolveTagMentions resolves digits to participant JIDs', () => {
  const mentions = resolveTagMentions(['628111111111', '123456789012345'], participants);
  assert.ok(mentions.includes('628111111111@s.whatsapp.net'));
  assert.ok(mentions.includes('123456789012345@lid'));
});

test('resolveTagMentions falls back to s.whatsapp.net for unknown digits', () => {
  const mentions = resolveTagMentions(['628000000000'], participants);
  assert.deepEqual(mentions, ['628000000000@s.whatsapp.net']);
});
