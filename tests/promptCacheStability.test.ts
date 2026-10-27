import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSystemPrompt,
  getGroupSystemPrompt,
  formatPromptNow,
  buildTurnContext,
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
 * Providers cache by exact PREFIX match, and history sits AFTER the system
 * prompt. Two bugs this file locks down, both measured against the live gateway:
 *
 *  1. The prompt used to START with `Hari ini: <date, h:mm:ss a>`. Seconds in
 *     the first byte meant the prefix never matched -> 0% hit every turn.
 *  2. Fixing (1) by moving the clock to the TAIL of the system prompt was only
 *     half a fix: the clock still preceded the history, so every minute tick
 *     invalidated the system prompt AND every history turn behind it. With a
 *     40-turn history that measured 39% hit on *every* turn.
 *
 * The contract now: the system prompt contains NOTHING per-request. Clock and
 * sender name travel in a [KONTEKS TERKINI] block appended to each USER
 * message (buildTurnContext), saved with that message so it stays inside the
 * cacheable prefix on later turns. Measured 84-93% (vs 39%) afterwards.
 *
 * If a future edit puts a timestamp / name back into the system prompt, these
 * tests fail — which is exactly the point. Do not "fix" them by loosening the
 * assertions.
 */

/**
 * Header of the REAL context block (not the prose that merely mentions it).
 * The prompt body legitimately references "[KONTEKS TERKINI]" in instructions,
 * so matching the bare marker would produce false positives.
 */
const CONTEXT_BLOCK_HEADER = 'data sistem, jangan diragukan';

/**
 * The system prompt must be byte-identical between calls AND must not carry the
 * volatile context block at all — that block belongs to the user message.
 */
function cacheablePrompt(prompt: string): string {
  assert.equal(
    prompt.indexOf(CONTEXT_BLOCK_HEADER),
    -1,
    'system prompt tidak boleh memuat blok konteks — blok itu milik pesan user; ' +
      'kalau ditaruh di sini ia menggeser seluruh history -> cache batal tiap menit',
  );
  return prompt;
}

test('private prompt: prefix identik antar panggilan', () => {
  const a = getSystemPrompt('member');
  const b = getSystemPrompt('member');
  assert.equal(a, b, 'prompt private tidak boleh berubah antar panggilan');
});

test('private prompt: prefix stabil walau waktu berubah', () => {
  const prefixes = new Set<string>();
  for (let i = 0; i < 12; i++) prefixes.add(cacheablePrompt(getSystemPrompt('member')));
  assert.equal(prefixes.size, 1, 'prefix berubah-ubah → cache prompt tidak akan pernah hit');
});

test('group prompt: prefix stabil walau jam & nama berbeda (role sama)', () => {
  const prefixes = new Set<string>();
  for (const time of ['00:00', '08:15', '23:59']) {
    for (const name of ['Budi', 'Siti']) {
      prefixes.add(cacheablePrompt(getGroupSystemPrompt(time, name, 'member')));
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
        prefixes.add(cacheablePrompt(getGroupSystemPrompt(time, name, role)));
      }
    }
  }
  assert.ok(
    prefixes.size <= 3,
    `prefix grup harus maksimal 3 varian (per role), dapat ${prefixes.size}`,
  );
});

test('nilai volatil hidup di pesan user, bukan di system prompt', () => {
  const prompt = getGroupSystemPrompt('08:00', 'Budi', 'member');
  const block = buildTurnContext({ senderName: 'Budi', now: new Date('2026-10-27T10:00:00Z') });

  // The values must still be delivered — just through the per-message block.
  assert.match(block, /\[KONTEKS TERKINI/);
  assert.ok(block.includes('Budi'), 'nama pengirim harus tersedia di blok konteks');
  assert.match(block, /17:00 WIB/, 'jam WIB harus tersedia di blok konteks');

  // ...and must NOT be baked into the cacheable system prompt.
  assert.ok(!prompt.includes('Budi'), 'nama pengirim bocor ke system prompt → cache invalid');
  assert.doesNotMatch(prompt, /\d{1,2}:\d{2} WIB/, 'jam bocor ke system prompt → cache invalid');
});

test('blok konteks per turn hanya berbeda di bagian yang memang volatil', () => {
  // Two turns one minute apart must share everything except the clock line, so
  // the cached prefix still covers the older block.
  const a = buildTurnContext({ senderName: 'Budi', now: new Date('2026-10-27T10:00:00Z') });
  const b = buildTurnContext({ senderName: 'Budi', now: new Date('2026-10-27T10:01:00Z') });
  assert.notEqual(a, b, 'blok harus berubah saat menit berganti');
  assert.ok(a.length === b.length, 'perubahan hanya nilai jam, panjang tetap');
});

test('private chat tidak mengirim nama pengirim (tidak ada gunanya)', () => {
  const block = buildTurnContext({ now: new Date('2026-10-27T10:00:00Z') });
  assert.doesNotMatch(block, /Nama pengirim/);
  assert.match(block, /17:00 WIB/);
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

test('tanggal boleh di system prompt, jam TIDAK', () => {
  // Date changes once a day -> one cache miss per day is acceptable.
  // Clock changes every minute -> must live in the per-message block.
  const prompt = getGroupSystemPrompt('08:00', 'Budi', 'member', new Date('2026-10-27T10:00:00Z'));

  assert.match(prompt, /\[TANGGAL\] Selasa, 27 Oktober 2026/, 'tanggal harus tersedia di prompt');
  assert.doesNotMatch(prompt, /\d{2}:\d{2} WIB/, 'jam bocor ke system prompt -> cache batal tiap menit');
});

test('tanggal hanya berubah sekali sehari (bukan per jam)', () => {
  const variants = new Set<string>();
  // UTC hours chosen so the WIB (+7) date stays the SAME day: 07,11,15,19,23 WIB.
  // (UTC 18:00 = 01:00 WIB the NEXT day and would legitimately flip the date.)
  for (const hour of [0, 4, 8, 12, 16]) {
    variants.add(
      getSystemPrompt('member', new Date(`2026-10-27T${String(hour).padStart(2, '0')}:00:00Z`)),
    );
  }
  assert.equal(variants.size, 1, 'system prompt berubah dalam hari yang sama -> cache batal');
});

test('tanggal berganti keesokan hari (satu cache miss per hari, disengaja)', () => {
  const today = getSystemPrompt('member', new Date('2026-10-27T10:00:00Z'));
  const tomorrow = getSystemPrompt('member', new Date('2026-10-28T10:00:00Z'));
  assert.notEqual(today, tomorrow, 'tanggal harus ikut berganti tiap hari');
  assert.match(tomorrow, /\[TANGGAL\] Rabu, 28 Oktober 2026/);
});

test('blok konteks tidak lagi memuat tanggal (hanya jam)', () => {
  const block = buildTurnContext({ senderName: 'Budi', now: new Date('2026-10-27T10:00:00Z') });
  assert.match(block, /Jam sekarang: 17:00 WIB/);
  assert.doesNotMatch(block, /Oktober|2026/, 'tanggal tidak boleh diulang tiap pesan (menumpuk)');
});
