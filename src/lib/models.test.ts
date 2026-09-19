// models.test.ts — the model catalog + badge rules (flagship-models FM-2).
//
// `npm test` is node's native TS runner: models.ts must stay a
// dependency-free leaf for this to run at all (no `~/` alias, no logger).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_CATALOG, GLM_CATALOG, MUSE_CATALOG, modelShort, modelLabel, providerCatalog, isStaleModelForClient } from './models.ts';

test('the Anthropic flagship is selectable and mirrors the daemon catalog', () => {
  const ids = MODEL_CATALOG.map((m) => m.id);
  // Pinned ids must be present (DM-CLI-12: the `fable` alias now exists too,
  // verified in local `claude --help`, but pins stay for reproducibility).
  assert.ok(ids.includes('fable'), 'Fable alias missing from the picker');
  assert.ok(ids.includes('claude-fable-5-1'), 'Fable 5.1 missing from the picker');
  assert.ok(ids.includes('claude-fable-5'), 'Fable 5 missing from the picker');
  assert.ok(ids.includes('claude-opus-5'), 'Opus 5 missing from the picker');
  // Newest first inside the pinned group — the operator scans top-down.
  assert.ok(ids.indexOf('claude-fable-5-1') < ids.indexOf('claude-fable-5'));
  assert.equal(modelLabel('claude-fable-5-1'), 'Fable 5.1');
  assert.equal(modelShort('fable'), 'fab');
  assert.equal(modelShort('claude-opus-5'), 'o5');
});

test('the ZAI catalog tracks the Coding Plan generation (DM-CLI-12)', () => {
  const ids = GLM_CATALOG.map((m) => m.id);
  for (const id of ['glm-5.3', 'glm-5.2', 'glm-5.1', 'glm-5-turbo', 'glm-4.7', 'glm-4.6', 'glm-4.5-air']) {
    assert.ok(ids.includes(id), `${id} missing from the ZAI picker`);
  }
  assert.ok(ids.indexOf('glm-5.3') < ids.indexOf('glm-4.6'), 'newest GLM should come first');
});

test('catalog ids are unique', () => {
  const ids = MODEL_CATALOG.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('badge for a two-number Fable id reads the version forward, not backward', () => {
  // Catalogued ids come from the catalog…
  assert.equal(modelShort('claude-fable-5-1'), 'f5.1');
  assert.equal(modelShort('claude-fable-5'), 'f5');
  // …and the FALLBACK (unlisted future variants) must agree. The old regex
  // took the last number, badging the flagship as 'f1'.
  assert.equal(modelShort('claude-fable-5-1[1m]'), 'f5.1');
  assert.equal(modelShort('claude-fable-6-2'), 'f6.2');
  assert.equal(modelShort('claude-mythos-7'), 'm7');
});

test('opus/sonnet/glm badges are untouched by the Fable fix', () => {
  assert.equal(modelShort('claude-opus-4-8'), 'o4.8');
  assert.equal(modelShort('claude-opus-4-9[1m]'), 'o4.9');
  assert.equal(modelShort('glm-4.6'), 'glm4.6');
  assert.equal(modelShort('opus'), 'opus');
});

test('provider catalogs stay separate', () => {
  assert.ok(providerCatalog('zai').every((m) => m.id.startsWith('glm')));
  assert.ok(providerCatalog('anthropic').some((m) => m.id === 'claude-fable-5-1'));
  assert.ok(providerCatalog('meta').every((m) => m.id.startsWith('muse-spark')));
});

test('stale cross-client ids heal, pins and defaults survive (ATM18)', () => {
  // The reported bug: Codex on top, Anthropic ids below.
  assert.equal(isStaleModelForClient('codex', 'sonnet'), true);
  assert.equal(isStaleModelForClient('codex', 'claude-opus-4-6'), true);
  assert.equal(isStaleModelForClient('codex', 'glm-4.6'), true);
  assert.equal(isStaleModelForClient('codex', 'muse-spark-1.3'), true);
  assert.equal(isStaleModelForClient('codex', 'auto'), true);
  assert.equal(isStaleModelForClient('gemini', 'opus'), true);
  // Same-family and empty ids are feasible, never stale.
  assert.equal(isStaleModelForClient('codex', 'gpt-5'), false);
  assert.equal(isStaleModelForClient('codex', 'gpt-5.4'), false);
  assert.equal(isStaleModelForClient('codex', ''), false);
  assert.equal(isStaleModelForClient('muse', 'muse-spark-1.3'), false);
  assert.equal(isStaleModelForClient('muse', 'sonnet'), true);
  // claude-code accepts its own catalogs by definition.
  assert.equal(isStaleModelForClient('claude-code', 'sonnet'), false);
  assert.equal(isStaleModelForClient('claude-code', 'muse-spark-1.3'), false);
  assert.equal(isStaleModelForClient('claude-code', 'auto'), false);
});

test('Muse ids resolve to labels and short badges (ATM17)', () => {
  assert.ok(MUSE_CATALOG.some((m) => m.id === 'muse-spark-1.3-contributor'));
  assert.equal(modelLabel('muse-spark-1.3-contributor'), 'Muse Spark 1.3 Contributor');
  assert.equal(modelShort('muse-spark-1.3-contributor'), 'muse1.3c');
  assert.equal(modelShort('muse-spark-2.0'), 'muse2.0');
});
