/**
 * engine-save-stamps.test.ts — ATM14e. Every member engine save bumps a
 * reactive epoch so open chat headers re-resolve at the state level.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { engineSaveTick, recordEngineSave } from './engine-save-stamps.ts';

test('recordEngineSave bumps the reactive save epoch', () => {
  const before = engineSaveTick();
  recordEngineSave('test-cluster', 'architect-master');
  recordEngineSave('test-cluster', 'architect-master');
  assert.equal(engineSaveTick(), before + 2);
});
