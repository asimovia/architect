/**
 * engine-chain.test.ts — ATM19. The chain's contract: what each combo
 * offers, and what the ones below it reset to. Operator report was "the
 * combos are hardcoded and don't follow each other"; these are the rules
 * that make them follow.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultEffortFor,
  defaultModelFor,
  effortOptionsFor,
  modelIdsFor,
  modelOptionsFor,
  selectClient,
  selectProvider,
  withLiveModel,
} from './engine-chain.ts';

const EMPTY = { models: [], efforts: [] };
/** A daemon /clients catalog, as the muse CLI reports it. */
const MUSE_CLI = {
  models: [
    { id: '', label: 'Default (Muse CLI config)' },
    { id: 'muse-spark-1.3', label: 'Muse Spark 1.3' },
  ],
  efforts: [
    { id: 'default', label: 'Default (high)' },
    { id: 'max', label: 'Max' },
  ],
};

test('claude-code model options follow the PROVIDER, not the client', () => {
  assert.ok(modelIdsFor('claude-code', 'anthropic', EMPTY).includes('opus'));
  assert.deepEqual(modelIdsFor('claude-code', 'meta', EMPTY).includes('opus'), false);
  assert.ok(modelIdsFor('claude-code', 'meta', EMPTY).includes('muse-spark-1.3'));
  assert.ok(modelIdsFor('claude-code', 'zai', EMPTY).every((id) => id.startsWith('glm')));
});

test('every other client reads the daemon catalog, never Claude models', () => {
  assert.deepEqual(modelIdsFor('muse', 'anthropic', MUSE_CLI), ['', 'muse-spark-1.3']);
  // Catalog not hydrated yet: no options at all rather than someone else's.
  assert.deepEqual(modelOptionsFor('codex', 'anthropic', EMPTY), []);
});

test('Anthropic models are grouped, daemon catalogs are not', () => {
  const groups = modelOptionsFor('claude-code', 'anthropic', EMPTY);
  assert.ok(groups.length > 1);
  assert.ok(groups.every((g) => typeof g.group === 'string'));
  assert.deepEqual(modelOptionsFor('muse', '', MUSE_CLI).map((g) => g.group), [null]);
});

test('switching CLIENT resets provider, model and effort to the new client', () => {
  const prev = { client: 'claude-code', provider: 'meta', model: 'muse-spark-1.3', effort: 'max' };
  const next = selectClient('muse', MUSE_CLI);
  assert.deepEqual(next, { client: 'muse', provider: 'anthropic', model: '', effort: 'default' });
  // …and nothing of the old selection survives the switch.
  assert.notEqual(next.model, prev.model);
});

test('switching back to claude-code never keeps the old provider', () => {
  const next = selectClient('claude-code', EMPTY);
  assert.equal(next.provider, 'anthropic');
  assert.equal(next.model, 'sonnet');
  assert.equal(next.effort, 'default');
});

test('switching PROVIDER re-seeds the model and keeps the effort', () => {
  const prev = { client: 'claude-code', provider: 'anthropic', model: 'opus', effort: 'max' };
  const next = selectProvider(prev, 'meta', EMPTY);
  assert.equal(next.model, 'muse-spark-1.3');
  assert.equal(next.effort, 'max');
  assert.equal(selectProvider(prev, 'zai', EMPTY).model, 'glm-5.3');
});

test('an un-hydrated catalog seeds the CLI default, never another CLI model', () => {
  assert.equal(defaultModelFor('codex', 'anthropic', EMPTY), '');
  assert.equal(defaultEffortFor('codex', EMPTY), 'default');
});

test('efforts follow the client: claude-code fixed, others from the daemon', () => {
  assert.ok(effortOptionsFor('claude-code', MUSE_CLI).some((e) => e.id === 'xhigh'));
  assert.deepEqual(effortOptionsFor('muse', MUSE_CLI).map((e) => e.id), ['default', 'max']);
});

test('a pinned id the catalog does not list is still offered, as itself', () => {
  const groups = withLiveModel(modelOptionsFor('codex', 'anthropic', EMPTY), 'gpt-5.4');
  assert.deepEqual(groups, [{ group: null, items: [{ id: 'gpt-5.4', label: 'gpt-5.4 (member)' }] }]);
  // A listed id adds nothing — no duplicate row.
  const listed = modelOptionsFor('claude-code', 'anthropic', EMPTY);
  assert.deepEqual(withLiveModel(listed, 'opus'), listed);
  assert.deepEqual(withLiveModel(listed, ''), listed);
});
