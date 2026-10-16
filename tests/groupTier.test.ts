import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideEffectiveTier,
  minTier,
  rankTier,
  MAX_GROUPS_PER_USER,
} from '../src/services/groupTierService.js';
import { premiumService } from '../src/services/premiumService.js';

const NOW = Date.parse('2026-10-16T10:00:00.000Z');
const future = new Date(NOW + 7 * 86_400_000);
const past = new Date(NOW - 86_400_000);
const owner = (tier: string, premiumExpiry: Date | null = null) => ({ tier, premiumExpiry });

// ─── Ranking & mirror ("kembar") ─────────────────────────────────

test('rankTier orders free < premium < pro', () => {
  assert.ok(rankTier('free') < rankTier('premium'));
  assert.ok(rankTier('premium') < rankTier('pro'));
  assert.equal(rankTier('unknown-tier'), 0);
});

test('minTier never returns a tier above the owner', () => {
  assert.equal(minTier('pro', 'premium'), 'premium');
  assert.equal(minTier('premium', 'pro'), 'premium');
  assert.equal(minTier('pro', 'pro'), 'pro');
});

test('group tier mirrors the owner tier', () => {
  assert.equal(decideEffectiveTier({ tier: 'premium', expiresAt: null }, owner('premium'), NOW), 'premium');
  assert.equal(decideEffectiveTier({ tier: 'pro', expiresAt: null }, owner('pro'), NOW), 'pro');
});

test('group tier cannot exceed the owner tier after a downgrade', () => {
  // Owner turun ke premium → grup pro ikut turun (kembar, bukan lebih tinggi).
  assert.equal(decideEffectiveTier({ tier: 'pro', expiresAt: null }, owner('premium'), NOW), 'premium');
  // Owner turun ke free → grup mati.
  assert.equal(decideEffectiveTier({ tier: 'pro', expiresAt: null }, owner('free'), NOW), 'free');
  assert.equal(decideEffectiveTier({ tier: 'premium', expiresAt: null }, owner('free'), NOW), 'free');
});

// ─── Expiry ──────────────────────────────────────────────────────

test('expired group expiry downgrades to free', () => {
  assert.equal(decideEffectiveTier({ tier: 'pro', expiresAt: past }, owner('pro', future), NOW), 'free');
});

test('expired owner premiumExpiry downgrades the group even if tier field is stale', () => {
  assert.equal(decideEffectiveTier({ tier: 'premium', expiresAt: future }, owner('premium', past), NOW), 'free');
});

test('future expiries keep the tier active', () => {
  assert.equal(decideEffectiveTier({ tier: 'premium', expiresAt: future }, owner('premium', future), NOW), 'premium');
});

// ─── Fail-safe ───────────────────────────────────────────────────

test('missing owner (deleted user) falls back to free', () => {
  assert.equal(decideEffectiveTier({ tier: 'pro', expiresAt: null }, null, NOW), 'free');
});

test('unknown stored tier degrades to free', () => {
  assert.equal(decideEffectiveTier({ tier: 'legacy_gold', expiresAt: null }, owner('pro'), NOW), 'free');
});

// ─── Slot rule ───────────────────────────────────────────────────

test('only one group per user is allowed', () => {
  assert.equal(MAX_GROUPS_PER_USER, 1);
});

// ─── Pool limit wiring ───────────────────────────────────────────

test('group tier limits mirror the user tier limits (premium 500, pro unlimited)', () => {
  assert.equal(premiumService.getTierConfig('premium').dailyGroupAiLimit, 500);
  assert.equal(premiumService.getTierConfig('pro').dailyGroupAiLimit, Number.MAX_SAFE_INTEGER);
  assert.equal(premiumService.getTierConfig('free').dailyGroupAiLimit, 50);
});

test('pro tier pool check is unlimited without touching the DB', async () => {
  const result = await premiumService.checkGroupPoolLimit('12036@g.us', 'pro');
  assert.equal(result.allowed, true);
  assert.equal(result.limit, Number.MAX_SAFE_INTEGER);
  assert.equal(result.remaining, Infinity);
});
