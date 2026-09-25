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
      parameters: {
        type: 'object',
        properties: {
          value: { type: 'string', description: 'Test value' },
        },
        required: ['value'],
      },
    },
  };
}

test('chatWithTools supports sequential tool rounds before the final answer', async () => {
  const executed: string[] = [];
  const requests: any[] = [];

  toolRegistry.register('test_search', toolDefinition('test_search'), async (args) => {
    executed.push(`search:${args.value}`);
    return { success: true, message: 'Found URL', data: { url: 'https://example.com/news' } };
  });
  toolRegistry.register('test_fetch', toolDefinition('test_fetch'), async (args) => {
    executed.push(`fetch:${args.value}`);
    return { success: true, message: 'Fetched article', data: { content: 'Verified facts' } };
  });

  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      requests.push(JSON.parse(body));
      const round = requests.length;

      // The provider is asked for `stream: true`, so the mock must speak SSE.
      // (It previously returned plain JSON, which the AI SDK could not parse —
      // the stream yielded no text and the turn failed.)
      const sse = (choices: unknown) => `data: ${JSON.stringify({ choices })}\n\n`;
      const text = (content: string) =>
        sse([{ index: 0, delta: { content }, finish_reason: null }]);
      const toolCall = (id: string, name: string, args: object) =>
        sse([
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
      const finish = (reason: string) => sse([{ index: 0, delta: {}, finish_reason: reason }]);

      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      if (round === 1) {
        res.write(toolCall('call_search', 'test_search', { value: 'latest news' }));
        res.write(finish('tool_calls'));
      } else if (round === 2) {
        res.write(toolCall('call_fetch', 'test_fetch', { value: 'https://example.com/news' }));
        res.write(finish('tool_calls'));
      } else {
        res.write(text('Jawaban berdasarkan artikel terverifikasi.'));
        res.write(finish('stop'));
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const previousEnv = {
    provider: process.env.AI_PROVIDER,
    baseUrl: process.env.OTHER_BASE_URL,
    apiKey: process.env.OTHER_API_KEY,
    model: process.env.OTHER_MODEL,
  };

  process.env.AI_PROVIDER = 'other';
  process.env.OTHER_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.OTHER_API_KEY = 'test-key';
  process.env.OTHER_MODEL = 'test-model';

  try {
    const service = new AIService();
    const snapshots: string[] = [];
    const result = await service.chatWithTools(
      'tool-chain-test',
      'Cari dan baca berita terbaru',
      undefined,
      (chunk) => {
        if (!chunk.done) snapshots.push(chunk.content);
      }
    );

    assert.equal(result, 'Jawaban berdasarkan artikel terverifikasi.');
    assert.equal(snapshots.at(-1), result);
    assert.deepEqual(executed, [
      'search:latest news',
      'fetch:https://example.com/news',
    ]);
    assert.equal(requests.length, 3);
    assert.equal(requests[1].messages.at(-1).role, 'tool');
    assert.equal(requests[2].messages.at(-1).role, 'tool');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    if (previousEnv.provider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previousEnv.provider;
    if (previousEnv.baseUrl === undefined) delete process.env.OTHER_BASE_URL;
    else process.env.OTHER_BASE_URL = previousEnv.baseUrl;
    if (previousEnv.apiKey === undefined) delete process.env.OTHER_API_KEY;
    else process.env.OTHER_API_KEY = previousEnv.apiKey;
    if (previousEnv.model === undefined) delete process.env.OTHER_MODEL;
    else process.env.OTHER_MODEL = previousEnv.model;
  }
});
