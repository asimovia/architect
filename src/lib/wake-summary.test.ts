import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWakeText, parseWake, wakeLine } from './wake-summary.ts';

const DELEGATE = [
  '[delegate-wake] `mb-developer` (developer) answering your request `rq-7d930b` on task `VW2` finished.',
  '',
  'VERDICT: ✓ success — apply the report and continue your task.',
  '',
  'Child report:',
  '```json',
  '{',
  '  "commit": null,',
  '  "files": ["web/src/a.ts", "web/src/b.ts"],',
  '  "outcome": "success",',
  '  "next": ""',
  '}',
  '```',
  '',
  'Result preview:',
  'Built the director.',
].join('\n');

test('a delegate wake reads as one sentence', () => {
  const s = parseWake(DELEGATE);
  assert.ok(s);
  assert.equal(wakeLine(s!), 'developer finished #VW2 — ✓ done · 2 files.');
});

test('an orchestrator wake with a no-commit verdict and a commit-less report', () => {
  const text = [
    '[architect-wake] Subagent `work-lc3-x` (A002) (init=motor, task=LC3) finished.',
    '',
    "VERDICT: ✗ no-commit (subagent didn't ship) — task `LC3` fail #1. One retry allowed.",
    '',
    'Result preview:',
    'nothing',
  ].join('\n');
  const s = parseWake(text)!;
  assert.equal(s.task, 'LC3');
  assert.equal(wakeLine(s), 'A002 finished #LC3 — ✗ nothing committed.');
});

test('a report with status done and a commit', () => {
  const text = '[delegate-wake] `mb-git-manager` finished.\n\nChild report:\n```json\n{"status":"done","commit":"52a9521abcdef"}\n```\n';
  assert.equal(wakeLine(parseWake(text)!), 'git-manager finished — ✓ done · commit 52a9521.');
});

test('plain operator text is not a wake', () => {
  assert.equal(isWakeText('hello [delegate-wake]'), false);
  assert.equal(parseWake('hello'), null);
});
