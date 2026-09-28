import { test } from 'node:test';
import assert from 'node:assert/strict';
import { busyWho, isBusyRefusal, pendingLine, shouldRetry, SHARED_DAEMON_RESTART_CMD } from './daemon-update.ts';

test('a 409 is "busy", not "cannot update"', () => {
  assert.equal(isBusyRefusal(409), true);
  assert.equal(isBusyRefusal(500, 'chat turn in progress'), true);
  assert.equal(isBusyRefusal(500, 'signature mismatch'), false);
});

test('the pending line names who it waits for', () => {
  assert.equal(pendingLine(['the Architect']), 'Daemon update pending — it applies when the Architect finishes its turn');
  assert.equal(busyWho(['the Architect', 'developer']), 'the Architect and developer');
  assert.equal(busyWho(['a', 'b', 'c']), '3 agents');
  assert.equal(pendingLine([]), 'Daemon update pending — it applies when the running turn finishes');
});

test('retries the moment the daemon goes idle, and on a timer otherwise', () => {
  const now = 1_000_000;
  assert.equal(shouldRetry({ phase: 'pending', liveCount: 0, lastTryAt: now - 5_000, now }), true);
  assert.equal(shouldRetry({ phase: 'pending', liveCount: 1, lastTryAt: now - 5_000, now }), false);
  assert.equal(shouldRetry({ phase: 'pending', liveCount: 1, lastTryAt: now - 61_000, now }), true);
  assert.equal(shouldRetry({ phase: 'failed', liveCount: 0, lastTryAt: now - 61_000, now }), true);
  assert.equal(shouldRetry({ phase: 'disabled', liveCount: 0, lastTryAt: 0, now }), false);
});

test('the manual fallback targets the shared daemon, never a per-project copy', () => {
  assert.doesNotMatch(SHARED_DAEMON_RESTART_CMD, /\.meshkore\/scripts\/daemon\.py|pkill/);
  assert.match(SHARED_DAEMON_RESTART_CMD, /make restart/);
});
