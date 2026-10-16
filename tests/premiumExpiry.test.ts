import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeExpiry,
  daysRemaining,
  describeExpiry,
  isExpired,
  normaliseTier,
  parseDuration,
  resolveEffectiveTier,
  tierRank,
  MAX_DURATION_DAYS,
} from '../src/services/premiumExpiry.js';

const NOW = new Date('2026-10-16T10:00:00.000Z');
const future = new Date(NOW.getTime() + 7 * 86_400_000);
const past = new Date(NOW.getTime() - 86_400_000);

// ─── resolveEffectiveTier — inti lazy downgrade ──────────────────

test('premium tanpa expiry tetap premium', () => {
  assert.equal(resolveEffectiveTier({ tier: 'premium', premiumExpiry: null }, NOW), 'premium');
});

test('expiry yang sudah lewat menurunkan tier ke free walau field tier masih premium', () => {
  // Ini kasus basi: DB bilang premium, tapi masa aktifnya habis kemarin.
  assert.equal(resolveEffectiveTier({ tier: 'premium', premiumExpiry: past }, NOW), 'free');
  assert.equal(resolveEffectiveTier({ tier: 'pro', premiumExpiry: past }, NOW), 'free');
});

test('expiry yang masih berjalan mempertahankan tier tersimpan', () => {
  assert.equal(resolveEffectiveTier({ tier: 'premium', premiumExpiry: future }, NOW), 'premium');
  assert.equal(resolveEffectiveTier({ tier: 'pro', premiumExpiry: future }, NOW), 'pro');
});

test('expiry tepat di detik sekarang dianggap sudah habis (batas inklusif)', () => {
  assert.equal(resolveEffectiveTier({ tier: 'premium', premiumExpiry: NOW }, NOW), 'free');
});

test('user free tidak pernah naik walau punya premiumExpiry di masa depan', () => {
  assert.equal(resolveEffectiveTier({ tier: 'free', premiumExpiry: future }, NOW), 'free');
});

test('tier tak dikenal diperlakukan free', () => {
  assert.equal(resolveEffectiveTier({ tier: 'vip', premiumExpiry: future }, NOW), 'free');
  assert.equal(resolveEffectiveTier({}, NOW), 'free');
});

// ─── isExpired / daysRemaining ───────────────────────────────────

test('isExpired false untuk null dan tanggal masa depan', () => {
  assert.equal(isExpired(null, NOW), false);
  assert.equal(isExpired(undefined, NOW), false);
  assert.equal(isExpired(future, NOW), false);
  assert.equal(isExpired(past, NOW), true);
});

test('daysRemaining dibulatkan ke atas dan 0 saat sudah lewat', () => {
  assert.equal(daysRemaining(past, NOW), 0);
  assert.equal(daysRemaining(null, NOW), 0);
  // 7 hari pas → 7; kurang sedikit (6.5 hari) → dibulatkan ke atas jadi 7.
  assert.equal(daysRemaining(future, NOW), 7);
  assert.equal(daysRemaining(new Date(NOW.getTime() + 6.5 * 86_400_000), NOW), 7);
});

// ─── computeExpiry ───────────────────────────────────────────────

test('computeExpiry menambah hari dari base yang diberikan (deterministik)', () => {
  assert.equal(computeExpiry(30, NOW).getTime(), NOW.getTime() + 30 * 86_400_000);
  assert.equal(computeExpiry(1, NOW).toISOString(), '2026-10-17T10:00:00.000Z');
});

test('computeExpiry round-trip dengan daysRemaining', () => {
  assert.equal(daysRemaining(computeExpiry(14, NOW), NOW), 14);
});

// ─── parseDuration ───────────────────────────────────────────────

test('angka tanpa satuan dianggap hari', () => {
  assert.deepEqual(parseDuration('30'), { ok: true, days: 30 });
  assert.deepEqual(parseDuration(' 7 '), { ok: true, days: 7 });
});

test('satuan d/w/m/y diterjemahkan konsisten (m = 30 hari)', () => {
  assert.deepEqual(parseDuration('1d'), { ok: true, days: 1 });
  assert.deepEqual(parseDuration('2w'), { ok: true, days: 14 });
  assert.deepEqual(parseDuration('1m'), { ok: true, days: 30 });
  assert.deepEqual(parseDuration('1y'), { ok: true, days: 365 });
  assert.deepEqual(parseDuration('3M'), { ok: true, days: 90 });
});

test('kata kunci tanpa expiry', () => {
  for (const word of ['off', 'none', 'forever', 'lifetime', 'selamanya', '-']) {
    assert.deepEqual(parseDuration(word), { ok: true, days: null }, `gagal untuk "${word}"`);
  }
});

test('durasi tidak valid ditolak dengan alasan', () => {
  assert.equal(parseDuration('').error, 'durasi_kosong');
  assert.equal(parseDuration('abc').error, 'format_tidak_valid');
  assert.equal(parseDuration('5x').error, 'format_tidak_valid');
  assert.equal(parseDuration('0').error, 'durasi_terlalu_kecil');
  assert.equal(parseDuration('0.4').error, 'durasi_terlalu_kecil');
  assert.equal(parseDuration(String(MAX_DURATION_DAYS + 1)).error, 'durasi_terlalu_besar');
});

test('durasi maksimum diterima tepat di batas', () => {
  assert.deepEqual(parseDuration(String(MAX_DURATION_DAYS)), { ok: true, days: MAX_DURATION_DAYS });
});

test('durasi pecahan dibulatkan ke hari terdekat', () => {
  assert.deepEqual(parseDuration('1.5'), { ok: true, days: 2 });
  assert.deepEqual(parseDuration('2.4'), { ok: true, days: 2 });
});

// ─── helper tampilan & normalisasi ───────────────────────────────

test('normaliseTier hanya meloloskan 3 tier yang dikenal', () => {
  assert.equal(normaliseTier('premium'), 'premium');
  assert.equal(normaliseTier('pro'), 'pro');
  assert.equal(normaliseTier('bogus'), 'free');
  assert.equal(normaliseTier(null), 'free');
});

test('tierRank mempertahankan urutan free < premium < pro', () => {
  assert.ok(tierRank('free') < tierRank('premium'));
  assert.ok(tierRank('premium') < tierRank('pro'));
});

test('describeExpiry membedakan aktif / habis / tanpa expiry', () => {
  assert.equal(describeExpiry(null, NOW), 'tanpa expiry');
  assert.match(describeExpiry(past, NOW), /SUDAH EXPIRED/);
  const desc = describeExpiry(future, NOW);
  assert.match(desc, /7 hari lagi/);
  assert.doesNotMatch(desc, /EXPIRED/);
});
