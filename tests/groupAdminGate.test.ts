import assert from 'node:assert/strict';
import test from 'node:test';
import hidetagCommand from '../src/plugins/group/hidetag.js';
import setgroupCommand from '../src/plugins/group/setgroup.js';
import warnCommand from '../src/plugins/group/warn.js';
import helpCommand from '../src/plugins/basic/help.js';
import type { CommandConfig } from '../src/types/index.js';

const groupAdminCommands = [hidetagCommand, setgroupCommand, warnCommand];

test('group commands use groupAdminOnly, not the ambiguous adminOnly', () => {
  for (const cmd of groupAdminCommands) {
    assert.equal(cmd.config.groupAdminOnly, true, `${cmd.config.name} must be groupAdminOnly`);
    assert.equal('adminOnly' in cmd.config, false, `${cmd.config.name} must not declare adminOnly`);
  }
});

type ExecResult = { executed: boolean; handlerRan: boolean; sent: string[] };

async function executeAs(
  config: CommandConfig,
  ctx: Record<string, unknown>,
): Promise<ExecResult> {
  const { PluginManager } = await import('../src/plugins/pluginManager.js');
  const pm = new PluginManager() as unknown as { commandMap: Map<string, unknown> };

  let handlerRan = false;
  pm.commandMap.set(config.name, {
    plugin: 'test',
    config,
    handler: async () => { handlerRan = true; },
  });

  const sent: string[] = [];
  const context = {
    socket: {
      sendMessage: async (_jid: string, message: { text: string }) => { sent.push(message.text); },
      groupMetadata: async () => ({
        participants: [{ phoneNumber: '6281111111111@s.whatsapp.net', admin: 'admin' }],
      }),
    },
    sessionId: 'test',
    fromJid: '1234567890-123456@g.us',
    fromMe: false,
    message: {},
    ...ctx,
  } as never;

  const executed = await (pm as unknown as {
    executeCommand: (name: string, ctx: unknown, args: string[]) => Promise<boolean>;
  }).executeCommand(config.name, context, []);

  return { executed, handlerRan, sent };
}

test('groupAdminOnly rejects a plain group member', async () => {
  const { executed, handlerRan, sent } = await executeAs(hidetagCommand.config, {
    simplified: { user_id: '6282222222222@s.whatsapp.net' },
  });

  assert.equal(executed, true);
  assert.equal(handlerRan, false);
  assert.match(sent[0], /group admin only/i);
});

test('groupAdminOnly admits a group admin', async () => {
  const { executed, handlerRan } = await executeAs(hidetagCommand.config, {
    simplified: { user_id: '6281111111111@s.whatsapp.net' },
  });

  assert.equal(executed, true);
  assert.equal(handlerRan, true);
});

test('a stale adminOnly key no longer gates anything (rename is not silently ignored)', async () => {
  const legacyConfig = {
    name: 'legacyadmincmd',
    description: 'old style',
    usage: '!legacyadmincmd',
    adminOnly: true,
  } as unknown as CommandConfig;

  const { handlerRan } = await executeAs(legacyConfig, {
    simplified: { user_id: '6282222222222@s.whatsapp.net' },
  });

  // Documents the hard rename: the removed key is inert, so every plugin had to migrate.
  assert.equal(handlerRan, true);
});

test('help detail labels the flag as Group Admin', async () => {
  const sent: string[] = [];
  const stub = [{ config: hidetagCommand.config, plugin: 'hidetag' }];
  const context = {
    socket: { sendMessage: async (_jid: string, m: { text: string }) => { sent.push(m.text); } },
    sessionId: 'test',
    fromJid: '6281578794887@s.whatsapp.net',
    fromMe: true,
    simplified: { user_id: '6281578794887@s.whatsapp.net', matchedPrefix: '!' },
    pluginManager: {
      getAllCommands: () => stub,
      getCommand: (name: string) => stub.find(c => c.config.name === name),
    },
  } as unknown as Parameters<typeof helpCommand.handler>[0];

  await helpCommand.handler(context, ['hidetag']);

  assert.equal(sent.length, 1);
  assert.match(sent[0], /\*Group Admin:\*/);
  assert.match(sent[0], /Group Admin:\* ✅ Ya/);
  assert.doesNotMatch(sent[0], /\*Admin:\*/);
});
