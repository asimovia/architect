/**
 * team-engine-draft.test.ts — ATM16. The editor must know when its engine
 * draft differs from the daemon's saved card: that gap is exactly the
 * "right panel says Muse, header says Opus" report, and it means the save
 * never left the browser — not that sync is broken.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineFromSaved, isEngineDirty } from './team-engine-draft.ts';

test('a freshly seeded draft is clean', () => {
  const saved = { client: 'claude-code', provider: 'meta', model: 'muse-spark', effort: 'default' };
  assert.equal(isEngineDirty(saved, engineFromSaved(saved)), false);
});

test('changing the model reads dirty', () => {
  const saved = { client: 'claude-code', provider: 'anthropic', model: 'opus', effort: 'default' };
  const draft = { ...engineFromSaved(saved), model: 'muse-spark' };
  assert.equal(isEngineDirty(saved, draft), true);
});

test('changing the client reads dirty', () => {
  const saved = { client: 'muse', provider: 'anthropic', model: 'muse-spark-1.3', effort: 'default' };
  const draft = { ...engineFromSaved(saved), client: 'claude-code' };
  assert.equal(isEngineDirty(saved, draft), true);
});

test('a member with no engine pinned seeds to the same defaults both sides use', () => {
  const draft = engineFromSaved(undefined);
  assert.deepEqual(draft, { client: 'claude-code', provider: 'anthropic', model: 'sonnet', effort: 'default' });
  assert.equal(isEngineDirty(undefined, draft), false);
  assert.equal(isEngineDirty({}, draft), false);
});

test('whitespace and empty strings count as unpinned, not as edits', () => {
  const saved = { client: '  ', provider: '', model: '', effort: '' };
  assert.equal(isEngineDirty(saved, engineFromSaved(saved)), false);
});
