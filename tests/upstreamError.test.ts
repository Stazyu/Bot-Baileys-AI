import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractUpstreamError,
  isRetryableProviderError,
  unwrapProviderError,
} from '../src/services/aiService.js';

/**
 * Error classification for upstream failures.
 *
 * Covers the reported bug where a 502 made the bot reply
 * "Udah diproses, cek chat ya." (i.e. reported success) instead of failing:
 * the AI SDK wraps the real error in an `AI_RetryError` whose own `statusCode`
 * is undefined, so the real status must be unwrapped before classification.
 */

test('unwraps AI_RetryError to the real provider error', () => {
  const retryError = {
    name: 'AI_RetryError',
    message: 'Failed after 3 attempts. Last error: AI_APICallError: Bad Gateway',
    lastError: {
      name: 'AI_APICallError',
      message: 'Bad Gateway',
      statusCode: 502,
      isRetryable: true,
    },
  };

  const unwrapped = unwrapProviderError(retryError) as { statusCode?: number };
  assert.equal(unwrapped.statusCode, 502);
  assert.equal(extractUpstreamError(retryError).statusCode, 502);
  assert.equal(extractUpstreamError(retryError).message, 'Bad Gateway');
});

test('classifies gateway/server failures as retryable', () => {
  for (const statusCode of [502, 503, 504, 500, 429, 408]) {
    const error = { name: 'AI_APICallError', message: 'boom', statusCode, isRetryable: true };
    assert.equal(isRetryableProviderError(error), true, `status ${statusCode} should retry`);
  }
});

test('classifies client errors as terminal', () => {
  for (const statusCode of [400, 401, 403, 404, 422]) {
    const error = { name: 'AI_APICallError', message: 'bad', statusCode, isRetryable: false };
    assert.equal(isRetryableProviderError(error), false, `status ${statusCode} should NOT retry`);
  }
});

test('classifies network drops by message when there is no status', () => {
  for (const message of [
    'socket hang up',
    'fetch failed',
    'request timeout',
    'Bad Gateway',
    'Service Unavailable',
    'ECONNRESET',
  ]) {
    assert.equal(isRetryableProviderError(new Error(message)), true, message);
  }
});

test('retryable classification follows the unwrapped status', () => {
  const retryError = {
    name: 'AI_RetryError',
    message: 'Failed after 3 attempts',
    lastError: { name: 'AI_APICallError', message: 'Bad Gateway', statusCode: 502 },
  };
  assert.equal(isRetryableProviderError(retryError), true);

  const terminal = {
    name: 'AI_RetryError',
    message: 'Failed after 3 attempts',
    lastError: { name: 'AI_APICallError', message: 'bad request', statusCode: 400 },
  };
  assert.equal(isRetryableProviderError(terminal), false);
});

test('extracts upstream message from a JSON responseBody', () => {
  const error = Object.assign(new Error('Request failed'), {
    statusCode: 502,
    responseBody: JSON.stringify({ error: { message: 'upstream exploded', code: 'EUPSTREAM' } }),
  });
  const extracted = extractUpstreamError(error);
  assert.equal(extracted.message, 'upstream exploded');
  assert.equal(extracted.code, 'EUPSTREAM');
});

test('extracts upstream message from axios-style response.data', () => {
  const error = Object.assign(new Error('Request failed with status code 400'), {
    response: { data: { error: { message: 'upstream said no', code: 'some_code' } } },
  });
  const extracted = extractUpstreamError(error);
  assert.equal(extracted.message, 'upstream said no');
  assert.equal(extracted.code, 'some_code');
});

test('falls back to the raw message when the body is not JSON', () => {
  const error = Object.assign(new Error('plain failure'), { responseBody: 'not json at all' });
  assert.equal(extractUpstreamError(error).message, 'plain failure');
});

test('unrelated empty-response errors are not treated as retryable network faults', () => {
  assert.equal(
    isRetryableProviderError(
      new Error('AI response empty after all retries (model returned no text content).'),
    ),
    false,
  );
});
