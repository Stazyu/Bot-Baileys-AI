import assert from 'node:assert/strict';
import test from 'node:test';
import { rateLimiter } from '../src/utils/rateLimiter.js';

const uid = (tag: string) => `test-user-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test('allows the first call and blocks an immediate repeat with remainingMs', () => {
  const user = uid('cooldown');
  const first = rateLimiter.check(user, 'ping', 60);
  assert.equal(first.allowed, true);
  assert.equal(first.remainingMs, 0);

  const second = rateLimiter.check(user, 'ping', 60);
  assert.equal(second.allowed, false);
  assert.ok(second.remainingMs > 0);
  assert.ok(second.expiresAt > Date.now());
  rateLimiter.reset(user);
});

test('tracks cooldowns per command, not globally', () => {
  const user = uid('isolation');
  assert.equal(rateLimiter.check(user, 'cmd-a', 60).allowed, true);
  // Different command for the same user must still be allowed
  assert.equal(rateLimiter.check(user, 'cmd-b', 60).allowed, true);
  rateLimiter.reset(user);
});

test('reset() clears the cooldown so the command is allowed again', () => {
  const user = uid('reset');
  assert.equal(rateLimiter.check(user, 'ping', 60).allowed, true);
  assert.equal(rateLimiter.check(user, 'ping', 60).allowed, false);
  rateLimiter.reset(user, 'ping');
  assert.equal(rateLimiter.check(user, 'ping', 60).allowed, true);
  rateLimiter.reset(user);
});

test('checkMessage() rate-limits chat spam per user', () => {
  const user = uid('message');
  assert.equal(rateLimiter.checkMessage(user).allowed, true);
  assert.equal(rateLimiter.checkMessage(user).allowed, false);
  rateLimiter.reset(user);
});

test('startAutoCleanup() is idempotent and stoppable', () => {
  // Must not throw when called twice; leaves the singleton usable
  rateLimiter.startAutoCleanup(1000);
  rateLimiter.startAutoCleanup(1000);
  const user = uid('cleanup');
  assert.equal(rateLimiter.check(user, 'ping', 60).allowed, true);
  rateLimiter.reset(user);
  rateLimiter.stopAutoCleanup();
  // Restart with default interval so the singleton keeps sweeping in prod
  rateLimiter.startAutoCleanup();
});

test('getStats() reflects tracked users', () => {
  const user = uid('stats');
  rateLimiter.check(user, 'ping', 60);
  const stats = rateLimiter.getStats();
  assert.ok(stats.userCount >= 1);
  assert.ok(stats.totalEntries >= 1);
  rateLimiter.reset(user);
});
