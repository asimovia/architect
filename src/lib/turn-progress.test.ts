/**
 * turn-progress.test.ts — the line must be true or absent, never invented.
 *
 * The behaviour this replaces: a pool of 36 decorative verbs rotating
 * every 1.8 s under every working agent, regardless of what the agent
 * was doing. The operator watched "Reviewing the roadmap…" for half an
 * hour while the turn sat inside a Bash call driving a training run, and
 * had no way to tell that from a hang. Anything that lets this module
 * assert a state it does not actually know brings that back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  humanSecs,
  isLongRunningWork,
  isStale,
  parseProgress,
  progressLabel,
  type TurnProgress,
} from './turn-progress.ts';

const NOW = 1_000_000;

function frame(over: Partial<TurnProgress> = {}): TurnProgress {
  return {
    elapsed_secs: 30,
    idle_secs: 1,
    phase: 'streaming',
    tool: null,
    tool_secs: null,
    tool_calls: 0,
    deltas: 10,
    received_at: NOW,
    ...over,
  };
}

test('hours stay readable — long turns are the point of the feature', () => {
  assert.equal(humanSecs(8), '8s');
  assert.equal(humanSecs(59), '59s');
  assert.equal(humanSecs(60), '1m');
  assert.equal(humanSecs(2520), '42m');
  assert.equal(humanSecs(3600), '1h');
  assert.equal(humanSecs(4320), '1h12m');
  assert.equal(humanSecs(-5), '0s');
});

test('a turn inside a tool names the tool and how long it has been there', () => {
  const label = progressLabel(
    frame({ phase: 'tool', tool: 'Bash', tool_secs: 2520, elapsed_secs: 4320 }),
    NOW,
  );
  assert.equal(label, 'Bash 42m · turn 1h12m');
});

test('a long silence is spelled out, not dressed up as thinking', () => {
  // The operator deciding whether to press Stop needs the silence
  // itself; "Thinking…" is exactly what hid it.
  assert.equal(
    progressLabel(frame({ phase: 'waiting', idle_secs: 300, elapsed_secs: 900 }), NOW),
    'quiet 5m · turn 15m',
  );
});

test('a short pause is still just thinking', () => {
  assert.equal(
    progressLabel(frame({ phase: 'waiting', idle_secs: 3, elapsed_secs: 40 }), NOW),
    'thinking · turn 40s',
  );
});

test('no data means no claim — the caller falls back to the spinner', () => {
  assert.equal(progressLabel(undefined, NOW), null);
});

test('a stale frame is never presented as current', () => {
  const old = frame({ received_at: NOW - 120_000 });
  assert.equal(isStale(old, NOW), true);
  assert.equal(progressLabel(old, NOW), null);
  // Three missed ticks is the threshold; two is still trusted.
  assert.equal(isStale(frame({ received_at: NOW - 60_000 }), NOW), false);
});

test('long-running work is recognised so the UI can say "this is normal"', () => {
  assert.equal(
    isLongRunningWork(frame({ phase: 'tool', tool: 'Bash', tool_secs: 1200 }), NOW),
    true,
  );
  assert.equal(
    isLongRunningWork(frame({ phase: 'streaming', elapsed_secs: 3600 }), NOW),
    true,
  );
  assert.equal(isLongRunningWork(frame({ elapsed_secs: 20 }), NOW), false);
  assert.equal(isLongRunningWork(undefined, NOW), false);
});

test('a frame from a daemon older than LT-2 parses to null, not to zeros', () => {
  // Reporting "turn 0s" for a daemon that never sent the field would be
  // the same class of lie as the rotating verbs.
  assert.equal(parseProgress({ type: 'conv.progress', conv: 'c1' }, NOW), null);
});

test('an unknown phase degrades to waiting rather than being trusted', () => {
  const p = parseProgress(
    { elapsed_secs: 10, phase: 'teleporting', tool: 'Bash' },
    NOW,
  );
  assert.equal(p?.phase, 'waiting');
  assert.equal(p?.tool, 'Bash');
});

test('parse keeps the real numbers it is given', () => {
  const p = parseProgress(
    {
      elapsed_secs: 4320,
      idle_secs: 2520,
      phase: 'tool',
      tool: 'Bash',
      tool_secs: 2520,
      tool_calls: 7,
      deltas: 120,
    },
    NOW,
  );
  assert.deepEqual(p, {
    elapsed_secs: 4320,
    idle_secs: 2520,
    phase: 'tool',
    tool: 'Bash',
    tool_secs: 2520,
    tool_calls: 7,
    deltas: 120,
    received_at: NOW,
  });
});
