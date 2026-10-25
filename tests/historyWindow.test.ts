import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { AIService } from '../src/services/aiService.js';

/**
 * Guard for the L1 history window.
 *
 * Prompt cache is prefix-based: history may only ever be APPENDED, never
 * shifted. The original code let L1 grow without any bound; adding a naive
 * per-turn cap would instead invalidate the cached prefix on every turn
 * (measured 0% hit when history is dropped from the front).
 *
 * This test pins the chosen contract: grow up to a threshold, then cut once
 * down to a smaller size — so the miss cost is paid rarely, not every turn.
 *
 * NOTE: these numbers mirror AIService.MAX_HISTORY_TURNS / TRIM_TO_TURNS.
 * If the implementation changes them, update this test deliberately.
 */

const MAX_HISTORY_TURNS = 64;
const TRIM_TO_TURNS = 32;

/** Mock provider that records every request body and always answers plainly. */
async function withMockProvider<T>(run: (getBodies: () => any[]) => Promise<T>): Promise<T> {
  const bodies: any[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      bodies.push(JSON.parse(raw));
      const sse = (choices: unknown) => `data: ${JSON.stringify({ choices })}\n\n`;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(sse([{ index: 0, delta: { content: 'ok.' }, finish_reason: null }]));
      res.write(sse([{ index: 0, delta: {}, finish_reason: 'stop' }]));
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const saved = {
    provider: process.env.AI_PROVIDER,
    baseUrl: process.env.OTHER_BASE_URL,
    apiKey: process.env.OTHER_API_KEY,
    model: process.env.OTHER_MODEL,
    openaiKey: process.env.OPENAI_API_KEY,
  };
  process.env.AI_PROVIDER = 'other';
  process.env.OTHER_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.OTHER_API_KEY = 'test-key';
  process.env.OTHER_MODEL = 'test-model';

  try {
    return await run(() => bodies);
  } finally {
    process.env.AI_PROVIDER = saved.provider;
    process.env.OTHER_BASE_URL = saved.baseUrl;
    process.env.OTHER_API_KEY = saved.apiKey;
    process.env.OTHER_MODEL = saved.model;
    if (saved.openaiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved.openaiKey;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** Serialized non-system messages of a request body — the cacheable tail. */
function historyOf(body: any): string[] {
  return (body.messages ?? [])
    .filter((m: any) => m.role !== 'system')
    .map((m: any) => `${m.role}:${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`);
}

test('history tumbuh append-only: prefix selalu sama, tidak pernah digeser', async () => {
  await withMockProvider(async (getBodies) => {
    const service = new AIService();

    for (let turn = 1; turn <= 8; turn++) {
      await service.chatStream('window-append', `pesan ke-${turn}`, 'system prompt');
    }

    const bodies = getBodies();
    let previous: string[] = [];
    for (let i = 0; i < bodies.length; i++) {
      const current = historyOf(bodies[i]);
      // Everything from the previous turn must still be the PREFIX of this one.
      assert.deepEqual(
        current.slice(0, previous.length),
        previous,
        `turn ${i + 1}: history bergeser — prefix berubah → cache prompt batal`,
      );
      assert.ok(current.length > previous.length, `turn ${i + 1}: history tidak bertambah`);
      previous = current;
    }
  });
});

test('system prompt selalu di index 0 dan hanya ada satu', async () => {
  await withMockProvider(async (getBodies) => {
    const service = new AIService();

    for (let turn = 1; turn <= 4; turn++) {
      await service.chatStream('window-system', `pesan ke-${turn}`, 'system prompt');
    }

    for (const body of getBodies()) {
      const roles = (body.messages ?? []).map((m: any) => m.role);
      assert.equal(roles[0], 'system', 'system prompt harus di awal (bagian cache paling bernilai)');
      assert.equal(roles.filter((r: string) => r === 'system').length, 1);
    }
  });
});

test('history dipangkas HANYA sekali saat melewati batas, bukan tiap turn', async () => {
  await withMockProvider(async (getBodies) => {
    const service = new AIService();
    const limit = MAX_HISTORY_TURNS * 2;

    // Drive well past the threshold: 40 turns → 80 messages on a naive cap.
    const turns = MAX_HISTORY_TURNS + 8;
    let trimEvents = 0;
    let previousLength = 0;

    for (let turn = 1; turn <= turns; turn++) {
      await service.chatStream('window-trim', `pesan ke-${turn}`, 'system prompt');
      const length = service.getConversationHistory('window-trim').filter(
        (m) => m.role !== 'system',
      ).length;
      if (length < previousLength) trimEvents += 1;
      if (length > 0) previousLength = length;
    }

    // Growth up to the cap is append-only, so no trim until the threshold.
    assert.equal(
      trimEvents,
      1,
      `harus tepat 1 pemangkasan dalam ${turns} turn (dapat ${trimEvents}) — ` +
        'pemangkasan per-turn akan membunuh cache prompt',
    );

    const finalLength = service.getConversationHistory('window-trim').filter(
      (m) => m.role !== 'system',
    ).length;
    assert.ok(
      finalLength <= limit,
      `history harus dibatasi (${finalLength} > ${limit} pesan)`,
    );
    assert.ok(
      finalLength >= TRIM_TO_TURNS * 2 - 2,
      `setelah dipangkas harus menyisakan ~${TRIM_TO_TURNS} turn (dapat ${finalLength / 2})`,
    );
  });
});
