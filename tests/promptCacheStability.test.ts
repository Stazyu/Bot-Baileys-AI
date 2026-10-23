import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSystemPrompt,
  getGroupSystemPrompt,
  formatPromptNow,
} from '../src/services/systemPrompt.js';
import {
  buildCacheMetric,
  CacheRateTracker,
  formatHitRate,
  summarizeCacheMetric,
} from '../src/services/promptCacheMetrics.js';

/**
 * Guard for prompt-cache hit rate.
 *
 * Providers cache by exact PREFIX match. The bug this test locks down: the
 * system prompt used to START with `Hari ini: <date, h:mm:ss a>`. Because the
 * seconds changed on every request, the cached prefix never matched and the
 * whole 5-7k token prompt (plus every history turn after it) was re-billed at
 * full price on every single turn — measured 0% hit on turn 2, versus 97% after
 * moving the volatile values to the END of the prompt.
 *
 * If a future edit moves a timestamp / name / role back into the body, these
 * tests fail — which is exactly the point. Do not "fix" them by loosening the
 * assertions.
 */

const MARKER = '[KONTEKS TERKINI';

/** Everything BEFORE the trailing volatile block — this is the cacheable part. */
function cacheablePrefix(prompt: string): string {
  const index = prompt.indexOf(MARKER);
  assert.notEqual(index, -1, 'prompt harus punya blok [KONTEKS TERKINI] di akhir');
  return prompt.slice(0, index);
}

test('private prompt: prefix identik antar panggilan', () => {
  const a = getSystemPrompt('member');
  const b = getSystemPrompt('member');
  assert.equal(a, b, 'prompt private tidak boleh berubah antar panggilan');
});

test('private prompt: prefix stabil walau waktu berubah', () => {
  const prefixes = new Set<string>();
  for (let i = 0; i < 12; i++) prefixes.add(cacheablePrefix(getSystemPrompt('member')));
  assert.equal(prefixes.size, 1, 'prefix berubah-ubah → cache prompt tidak akan pernah hit');
});

test('group prompt: prefix stabil walau jam & nama berbeda (role sama)', () => {
  const prefixes = new Set<string>();
  for (const time of ['00:00', '08:15', '23:59']) {
    for (const name of ['Budi', 'Siti']) {
      prefixes.add(cacheablePrefix(getGroupSystemPrompt(time, name, 'member')));
    }
  }
  assert.equal(
    prefixes.size,
    1,
    'prefix grup ikut berubah karena jam/nama → cache miss tiap pesan',
  );
});

test('group prompt: role menghasilkan paling banyak 3 varian prefix', () => {
  // Role is a verified, locally-resolved label, so it belongs in the cacheable
  // prefix — but that means one cache entry per role. Bounded at 3 by design;
  // if this grows, the role block is carrying per-request data again.
  const prefixes = new Set<string>();
  for (const role of ['member', 'admin', 'owner'] as const) {
    for (const time of ['00:00', '23:59']) {
      for (const name of ['Budi', 'Siti']) {
        prefixes.add(cacheablePrefix(getGroupSystemPrompt(time, name, role)));
      }
    }
  }
  assert.ok(
    prefixes.size <= 3,
    `prefix grup harus maksimal 3 varian (per role), dapat ${prefixes.size}`,
  );
});

test('nilai volatil hanya boleh muncul di blok terakhir', () => {
  const prompt = getGroupSystemPrompt('08:00', 'Budi', 'member');
  const prefix = cacheablePrefix(prompt);
  const tail = prompt.slice(prompt.indexOf(MARKER));

  // The name must be present — but only in the tail, never in the cached prefix.
  assert.ok(tail.includes('Budi'), 'nama pengirim harus tersedia di blok konteks');
  assert.ok(!prefix.includes('Budi'), 'nama pengirim bocor ke prefix → cache invalid');
});

test('prefix tidak boleh memuat timestamp berdetik', () => {
  const prompt = getSystemPrompt('member');
  assert.doesNotMatch(
    prompt,
    /h:mm:ss|\d{1,2}:\d{2}:\d{2}/,
    'format waktu berdetik membuat prefix berubah tiap detik',
  );
});

test('waktu prompt beresolusi menit (bukan detik)', () => {
  const now = new Date('2026-10-23T14:30:45Z');
  const text = formatPromptNow(now);
  assert.match(text, /WIB$/);
  assert.match(text, /21:30/, 'harus WIB (UTC+7) dan tanpa detik');
  assert.ok(!text.includes(':45'), 'detik tidak boleh ikut');
});

test('system prompt cukup besar untuk melewati minimum cache provider', () => {
  // OpenAI & Anthropic both need >=1024 tokens before caching engages.
  const approx = (s: string) => Math.ceil(s.length / 4);
  assert.ok(approx(getSystemPrompt('member')) > 1024, 'prompt private terlalu kecil untuk di-cache');
  assert.ok(approx(getGroupSystemPrompt('08:00', 'Budi')) > 1024, 'prompt grup terlalu kecil');
});

// ── cache metrics ────────────────────────────────────────────────

test('buildCacheMetric menjumlahkan step tool loop dengan benar', () => {
  const metric = buildCacheMetric(
    [
      { inputTokens: 5000, cacheReadTokens: 4800, outputTokens: 20 },
      { inputTokens: 5200, cacheReadTokens: 5000, outputTokens: 30 },
    ],
    'deepseek/deepseek-v4.1-flash',
  );

  assert.equal(metric.steps, 2);
  assert.equal(metric.inputTokens, 10200);
  assert.equal(metric.cacheReadTokens, 9800);
  assert.equal(metric.outputTokens, 50);
  assert.equal(metric.servedBy, 'deepseek/deepseek-v4.1-flash');
  assert.ok(Math.abs(metric.hitRate - 9800 / 10200) < 1e-9);
});

test('buildCacheMetric menurunkan noCacheTokens bila provider tidak melaporkannya', () => {
  const metric = buildCacheMetric([
    { inputTokens: 1000, cacheReadTokens: 750, outputTokens: 10 },
  ]);
  assert.equal(metric.noCacheTokens, 250);
});

test('buildCacheMetric tidak membagi nol saat usage kosong', () => {
  const metric = buildCacheMetric([]);
  assert.equal(metric.hitRate, 0);
  assert.equal(metric.inputTokens, 0);
  assert.equal(metric.steps, 0);
});

test('CacheRateTracker memakai rasio tertimbang, bukan rata-rata rasio', () => {
  const tracker = new CacheRateTracker();
  // One huge fully-cached turn and one tiny cold turn: the cold one must not
  // dominate the average.
  tracker.record(buildCacheMetric([{ inputTokens: 10000, cacheReadTokens: 10000 }]));
  tracker.record(buildCacheMetric([{ inputTokens: 100, cacheReadTokens: 0 }]));

  assert.equal(tracker.stats.turns, 2);
  assert.ok(tracker.hitRate > 0.98, `harus tertimbang token, dapat ${tracker.hitRate}`);
});

test('CacheRateTracker mengabaikan turn tanpa input token', () => {
  const tracker = new CacheRateTracker();
  tracker.record(buildCacheMetric([{ inputTokens: 0, cacheReadTokens: 0 }]));
  assert.equal(tracker.stats.turns, 0);
});

test('log cache bisa di-grep dan tidak menyesatkan', () => {
  const metric = buildCacheMetric([{ inputTokens: 2000, cacheReadTokens: 1800 }]);
  const line = summarizeCacheMetric(metric, 'mem:private:628@s.whatsapp.net');
  assert.ok(line.startsWith('[PromptCache] mem:private:628@s.whatsapp.net'));
  assert.match(line, /hit=90%/);
  assert.match(line, /cached=1800\/2000 tok/);
  assert.equal(formatHitRate(metric), '90%');
});
