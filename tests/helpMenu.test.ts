import assert from 'node:assert/strict';
import test from 'node:test';
import helpCommand from '../src/plugins/basic/help.js';
import type { CommandConfig } from '../src/types/index.js';

type HelpContext = Parameters<typeof helpCommand.handler>[0];

const stubCommands: Array<{ config: CommandConfig; plugin: string }> = [
  { config: { name: 'ping', description: 'Ping bot', usage: '!ping', category: 'basic' }, plugin: 'ping' },
  { config: { name: 'premium', description: 'Manage premium tiers', usage: '!premium', category: 'owner', ownerOnly: true }, plugin: 'premium' },
  { config: { name: 'exec', description: 'Run shell', usage: '!exec', category: 'owner', ownerOnly: true }, plugin: 'exec' },
  { config: { name: 'legacyowner', description: 'Legacy owner cmd', usage: '!legacyowner', category: 'owner' }, plugin: 'legacyowner' },
];

function makeContext(userId: string): { context: HelpContext; sent: string[] } {
  const sent: string[] = [];
  const context = {
    socket: {
      sendMessage: async (_jid: string, message: { text: string }) => {
        sent.push(message.text);
      },
    },
    sessionId: 'test-session',
    fromJid: userId,
    fromMe: false,
    simplified: { user_id: userId, matchedPrefix: '!' },
    pluginManager: {
      getAllCommands: () => stubCommands,
      getCommand: (name: string) => stubCommands.find(c => c.config.name === name),
    },
  } as unknown as HelpContext;
  return { context, sent };
}

test('help/menu command is accessible to everyone (not ownerOnly)', () => {
  assert.equal(Boolean(helpCommand.config.ownerOnly), false);
  assert.ok(helpCommand.config.aliases?.includes('menu'));
});

test('regular users see basic commands but no owner commands or owner category', async () => {
  const { context, sent } = makeContext('6289999999999@s.whatsapp.net');
  await helpCommand.handler(context, []);

  assert.equal(sent.length, 1);
  const text = sent[0];
  // Basic commands are visible
  assert.match(text, /ping/);
  // Owner commands must not appear
  assert.doesNotMatch(text, /premium/);
  assert.doesNotMatch(text, /exec/);
  assert.doesNotMatch(text, /legacyowner/);
  // Owner category section must not appear
  assert.doesNotMatch(text, /Owner/i);
  assert.doesNotMatch(text, /👑/);
});

test('owner sees both basic commands and owner category with commands', async () => {
  const { context, sent } = makeContext('6281578794887@s.whatsapp.net');
  await helpCommand.handler(context, []);

  assert.equal(sent.length, 1);
  const text = sent[0];
  assert.match(text, /ping/);
  assert.match(text, /premium/);
  assert.match(text, /exec/);
  assert.match(text, /legacyowner/);
  assert.match(text, /Owner/i);
});

test('non-owner querying owner command detail gets not found', async () => {
  const { context, sent } = makeContext('6289999999999@s.whatsapp.net');
  await helpCommand.handler(context, ['exec']);

  assert.equal(sent.length, 1);
  assert.match(sent[0], /tidak ditemukan/);
});

test('non-owner querying legacy owner command detail without ownerOnly flag also gets not found', async () => {
  const { context, sent } = makeContext('6289999999999@s.whatsapp.net');
  await helpCommand.handler(context, ['legacyowner']);

  assert.equal(sent.length, 1);
  assert.match(sent[0], /tidak ditemukan/);
});

test('owner querying owner command detail gets full help', async () => {
  const { context, sent } = makeContext('6281578794887@s.whatsapp.net');
  await helpCommand.handler(context, ['exec']);

  assert.equal(sent.length, 1);
  assert.match(sent[0], /EXEC/);
  assert.match(sent[0], /Run shell/);
});

test('regular user executing help via PluginManager is allowed', async () => {
  const { PluginManager } = await import('../src/plugins/pluginManager.js');
  const pm = new PluginManager() as unknown as { commandMap: Map<string, unknown> };
  let handlerRan = false;

  pm.commandMap.set('help', {
    plugin: 'help',
    config: helpCommand.config,
    handler: async () => { handlerRan = true; },
  });

  const context = {
    socket: { sendMessage: async () => {} },
    sessionId: 'test',
    fromJid: '6289999999999@s.whatsapp.net',
    fromMe: false,
    simplified: { user_id: '6289999999999@s.whatsapp.net' },
    message: {},
  } as never;

  const executed = await (pm as unknown as {
    executeCommand: (name: string, ctx: unknown, args: string[]) => Promise<boolean>;
  }).executeCommand('help', context, []);

  assert.equal(executed, true);
  assert.equal(handlerRan, true);
});
