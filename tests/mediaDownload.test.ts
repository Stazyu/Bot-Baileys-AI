import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isUnresolvableMediaHost,
  isTransientMediaError,
  mediaHostCandidates,
  resolveMediaUrl,
} from '../src/utils/mediaDownload.js';

// ── the exact production bug: a.whatsapp.net does not resolve ──────────────
test('flags the hostnames that are not in public DNS', () => {
  assert.equal(isUnresolvableMediaHost('a.whatsapp.net'), true);
  assert.equal(isUnresolvableMediaHost('web.whatsapp.net'), true);
  assert.equal(isUnresolvableMediaHost('media.whatsapp.net'), true);
  assert.equal(isUnresolvableMediaHost('A.WHATSAPP.NET'), true);
  assert.equal(isUnresolvableMediaHost('mmg.whatsapp.net'), false);
  assert.equal(isUnresolvableMediaHost(undefined), false);
});

test('rewrites a dead host in the payload url to a reachable one', () => {
  const media = {
    mediaKey: new Uint8Array(32),
    directPath: '/v/t62.7118-24/abc',
    url: 'https://a.whatsapp.net/v/t62.7118-24/abc?ccb=11-4&oh=xyz',
  };
  const url = resolveMediaUrl(media, 'mmg.whatsapp.net');
  assert.ok(url);
  const parsed = new URL(url);
  assert.equal(parsed.hostname, 'mmg.whatsapp.net');
  // path + query must survive the host swap — WhatsApp signs the whole thing
  assert.equal(parsed.pathname, '/v/t62.7118-24/abc');
  assert.equal(parsed.searchParams.get('oh'), 'xyz');
});

test('keeps a working host untouched', () => {
  const media = {
    url: 'https://mmg.whatsapp.net/v/t62.7118-24/abc?oh=xyz',
  };
  assert.equal(
    resolveMediaUrl(media, 'mmg-fallback.whatsapp.net'),
    'https://mmg.whatsapp.net/v/t62.7118-24/abc?oh=xyz',
  );
});

test('falls back to directPath when no url is present', () => {
  const media = { directPath: '/v/t24/def' };
  assert.equal(resolveMediaUrl(media, 'mmg.whatsapp.net'), 'https://mmg.whatsapp.net/v/t24/def');
});

test('returns undefined when neither url nor directPath exists', () => {
  assert.equal(resolveMediaUrl({}, 'mmg.whatsapp.net'), undefined);
});

test('candidate order: override → socket host → public defaults, deduped', () => {
  const candidates = mediaHostCandidates('mmg-fna.whatsapp.net');
  assert.equal(candidates[0], 'mmg-fna.whatsapp.net');
  assert.ok(candidates.includes('mmg.whatsapp.net'));
  assert.ok(candidates.includes('mmg-fallback.whatsapp.net'));
  assert.equal(new Set(candidates).size, candidates.length);
});

test('candidate list is never empty even with no socket host', () => {
  assert.ok(mediaHostCandidates(undefined).length >= 2);
});

// ── error classification: retry DNS hiccups, not expired media ─────────────
test('treats ENOTFOUND as transient (matches the reported error shape)', () => {
  const err = new TypeError('fetch failed', {
    cause: Object.assign(new Error('getaddrinfo ENOTFOUND a.whatsapp.net'), {
      code: 'ENOTFOUND',
      errno: -3008,
      syscall: 'getaddrinfo',
      hostname: 'a.whatsapp.net',
    }),
  });
  assert.equal(isTransientMediaError(err), true);
});

test('treats socket resets and timeouts as transient', () => {
  assert.equal(isTransientMediaError(Object.assign(new Error('boom'), { code: 'ECONNRESET' })), true);
  assert.equal(isTransientMediaError(Object.assign(new Error('boom'), { code: 'UND_ERR_CONNECT_TIMEOUT' })), true);
  assert.equal(isTransientMediaError(new Error('socket hang up')), true);
});

test('treats HTTP 4xx (expired media) as terminal', () => {
  const forbidden = Object.assign(new Error('Failed to fetch stream'), {
    output: { statusCode: 403 },
  });
  assert.equal(isTransientMediaError(forbidden), false);
  const notFound = Object.assign(new Error('Failed to fetch stream'), { statusCode: 404 });
  assert.equal(isTransientMediaError(notFound), false);
});

test('does not retry an unrelated programming error', () => {
  assert.equal(isTransientMediaError(new Error('No valid media URL or directPath present in message')), false);
});
