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

test('a non-claude member with no model pinned seeds the CLI default, not sonnet', () => {
  // ATM17 follow-up: `sonnet` is an Anthropic id — seeding it under Codex is
  // how a cross-client model got saved onto the wrong CLI.
  for (const client of ['codex', 'gemini', 'muse']) {
    const draft = engineFromSaved({ client, model: '' });
    assert.equal(draft.model, '', `client ${client}`);
    assert.equal(isEngineDirty({ client, model: '' }, draft), false);
  }
});

test('a claude-code member with no model pinned keeps the historic sonnet default', () => {
  assert.equal(engineFromSaved({ client: 'claude-code', model: '' }).model, 'sonnet');
});

test('an explicitly pinned model survives regardless of client', () => {
  assert.equal(engineFromSaved({ client: 'codex', model: 'gpt-5' }).model, 'gpt-5');
});

test('a model saved under another client heals to the CLI default (ATM18)', () => {
  // Pre-ATM17 saves persist Anthropic ids under Codex — the draft must not
  // seed them back, or the next Save re-persists the mismatch.
  assert.equal(engineFromSaved({ client: 'codex', model: 'sonnet' }).model, '');
  assert.equal(engineFromSaved({ client: 'codex', model: 'claude-opus-4-6' }).model, '');
  assert.equal(engineFromSaved({ client: 'codex', model: 'auto' }).model, '');
  assert.equal(engineFromSaved({ client: 'gemini', model: 'opus' }).model, '');
  assert.equal(engineFromSaved({ client: 'codex', model: 'muse-spark-1.3' }).model, '');
  // Same-family pins survive, including the muse CLI's own catalog.
  assert.equal(engineFromSaved({ client: 'codex', model: 'gpt-5.6-terra' }).model, 'gpt-5.6-terra');
  assert.equal(engineFromSaved({ client: 'muse', model: 'muse-spark-1.3' }).model, 'muse-spark-1.3');
  assert.equal(engineFromSaved({ client: 'claude-code', model: 'sonnet' }).model, 'sonnet');
});
