import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { AIService } from '../src/services/aiService.js';
import toolRegistry from '../src/tools/toolRegistry.js';
import type { AIToolDefinition } from '../src/types/tools.js';

function toolDefinition(name: string): AIToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description: `Test tool ${name}`,
      parameters: { type: 'object', properties: {}, required: [] },
    },
  };
}

/** One OpenAI-compatible SSE chunk. */
function sse(choices: unknown): string {
  return `data: ${JSON.stringify({ choices })}\n\n`;
}

function textChunk(content: string): string {
  return sse([{ index: 0, delta: { content }, finish_reason: null }]);
}

function toolCallChunk(id: string, name: string, args: object): string {
  return sse([
    {
      index: 0,
      delta: {
        role: 'assistant',
        tool_calls: [
          { index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } },
        ],
      },
      finish_reason: null,
    },
  ]);
}

function finishChunk(reason: string): string {
  return sse([{ index: 0, delta: {}, finish_reason: reason }]);
}

const DONE = 'data: [DONE]\n\n';

/**
 * Drives `chatWithTools` against a scripted SSE server.
 *
 * This is the guard for the "Udah diproses, cek chat ya." fallback: it must fire
 * ONLY when a tool actually executed, and never when the stream simply failed.
 */
async function withScriptedSse(
  handler: (round: number, res: import('node:http').ServerResponse) => void,
  run: (service: AIService, requests: unknown[]) => Promise<void>,
): Promise<void> {
  const requests: unknown[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      requests.push(JSON.parse(body));
      handler(requests.length, res);
    });
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const prev = {
    p: process.env.AI_PROVIDER,
    b: process.env.OTHER_BASE_URL,
    k: process.env.OTHER_API_KEY,
    m: process.env.OTHER_MODEL,
  };
  process.env.AI_PROVIDER = 'other';
  process.env.OTHER_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.OTHER_API_KEY = 'test-key';
  process.env.OTHER_MODEL = 'test-model';

  try {
    await run(new AIService(), requests);
  } finally {
    for (const [key, value, envKey] of [
      ['p', prev.p, 'AI_PROVIDER'],
      ['b', prev.b, 'OTHER_BASE_URL'],
      ['k', prev.k, 'OTHER_API_KEY'],
      ['m', prev.m, 'OTHER_MODEL'],
    ] as const) {
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('a tool that actually runs yields the "already processed" reply', async () => {
  const ran: string[] = [];
  toolRegistry.register('exec_tool', toolDefinition('exec_tool'), async () => {
    ran.push('exec_tool');
    // Mirrors a media tool that sends its payload directly, then stays silent.
    return { success: true, message: 'sent', data: {} };
  });

  await withScriptedSse(
    (round, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      if (round === 1) {
        res.write(toolCallChunk('call_1', 'exec_tool', {}));
        res.write(finishChunk('tool_calls'));
      } else {
        // Model says nothing after the tool ran.
        res.write(finishChunk('stop'));
      }
      res.write(DONE);
      res.end();
    },
    async (service) => {
      const chunks: string[] = [];
      const out = await service.chatWithTools('tool-exec', 'jalankan', undefined, (c) => {
        if (!c.done && c.content) chunks.push(c.content);
      });
      assert.deepEqual(ran, ['exec_tool'], 'tool must have run');
      assert.equal(out, 'Udah diproses, cek chat ya.');
      assert.equal(chunks.at(-1), out, 'fallback must reach the caller via onChunk');
    },
  );
});

test('an upstream 502 does NOT yield the "already processed" reply', async () => {
  toolRegistry.register('never_tool', toolDefinition('never_tool'), async () => ({
    success: true,
    message: 'should not run',
  }));

  // NOTE: the AI SDK retries 502s internally with exponential backoff, so this
  // test takes ~20s. That is real production behavior being exercised — the
  // fast, network-free classification checks live in
  // `isRetryableProviderError`'s own tests.
  await withScriptedSse(
    (_round, res) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Bad Gateway' } }));
    },
    async (service) => {
      await assert.rejects(
        () => service.chatWithTools('tool-502', 'halo', undefined, () => {}),
        (error: Error) => {
          assert.match(error.message, /ai_upstream_failed/i);
          assert.equal(
            error.message.includes('Udah diproses'),
            false,
            'must never claim success on a 502',
          );
          return true;
        },
      );
    },
  );
});

test('an empty reply with no tool execution does not claim success', async () => {
  toolRegistry.register('unused_tool', toolDefinition('unused_tool'), async () => ({
    success: true,
    message: 'nope',
  }));

  await withScriptedSse(
    (_round, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(finishChunk('stop'));
      res.write(DONE);
      res.end();
    },
    async (service) => {
      await assert.rejects(
        () => service.chatWithTools('tool-empty', 'halo', undefined, () => {}),
        (error: Error) => {
          assert.equal(
            error.message.includes('Udah diproses'),
            false,
            'empty response must not report success',
          );
          return true;
        },
      );
    },
  );
});

test('normal text answer passes through unchanged', async () => {
  await withScriptedSse(
    (_round, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(textChunk('Jawaban '));
      res.write(textChunk('biasa.'));
      res.write(finishChunk('stop'));
      res.write(DONE);
      res.end();
    },
    async (service) => {
      const out = await service.chatWithTools('plain-text', 'halo', undefined, () => {});
      assert.equal(out, 'Jawaban biasa.');
    },
  );
});

// Regression guard: a tool error is NOT fatal — the SDK feeds it back to the
// model, which recovers and answers in a later step. That answer must survive.
test('model recovering from a tool error still returns its answer', async () => {
  toolRegistry.register('recovering_tool', toolDefinition('recovering_tool'), async () => ({
    success: true,
    message: 'data for the model',
    data: { info: 'useful' },
  }));

  await withScriptedSse(
    (round, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      if (round === 1) {
        res.write(toolCallChunk('call_r', 'recovering_tool', {}));
        res.write(finishChunk('tool_calls'));
      } else {
        // The model sees the tool result/error and answers normally.
        res.write(textChunk('Hasilnya sudah saya cek.'));
        res.write(finishChunk('stop'));
      }
      res.write(DONE);
      res.end();
    },
    async (service) => {
      const out = await service.chatWithTools('tool-recover', 'cek dong', undefined, () => {});
      assert.equal(out, 'Hasilnya sudah saya cek.');
      assert.equal(out.includes('Udah diproses'), false);
    },
  );
});
