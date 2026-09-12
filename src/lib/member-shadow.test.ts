/**
 * member-shadow.test.ts — ATM14. Pinned conv overrides shadow the member file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findShadowedConvs, isPinnedOverride, stalePins } from './member-shadow.ts';

test('auto/default/empty follow the member — not shadowed', () => {
  assert.equal(isPinnedOverride('auto', 'default'), false);
  assert.equal(isPinnedOverride(undefined, undefined), false);
  assert.equal(isPinnedOverride('', ''), false);
});

test('a pinned model shadows the member file', () => {
  assert.equal(isPinnedOverride('opus', 'default'), true);
});

test('a pinned effort shadows the member file', () => {
  assert.equal(isPinnedOverride('auto', 'high'), true);
});

test('findShadowedConvs only returns bound, live, pinned convs', () => {
  const convMeta = {
    'conv-pinned': { member: 'architect-master', model: 'opus', effort: 'default' },
    'conv-follow': { member: 'architect-master', model: 'auto', effort: 'default' },
    'conv-other': { member: 'developer', model: 'opus', effort: 'default' },
    'conv-archived': { member: 'architect-master', model: 'opus', effort: 'default' },
    'conv-unbound': { model: 'opus', effort: 'default' },
  };
  const found = findShadowedConvs(convMeta, { 'conv-archived': true }, 'architect-master');
  assert.deepEqual(found, ['conv-pinned']);
});

test('stalePins resets a pin that differs from the saved file values', () => {
  const convMeta = {
    'conv-stale': { member: 'm', model: 'opus', effort: 'high' },
  };
  assert.deepEqual(stalePins(convMeta, {}, 'm', 'muse-spark-x', 'low'), [
    { conv: 'conv-stale', resetModel: true, resetEffort: true },
  ]);
});

test('stalePins leaves pins already equal to the file values alone', () => {
  const convMeta = {
    'conv-same': { member: 'm', model: 'opus', effort: 'default' },
  };
  assert.deepEqual(stalePins(convMeta, {}, 'm', 'opus', ''), []);
});

test('stalePins never touches auto/default followers', () => {
  const convMeta = {
    'conv-follow': { member: 'm', model: 'auto', effort: 'default' },
  };
  assert.deepEqual(stalePins(convMeta, {}, 'm', 'other-model', 'high'), []);
});

test('stalePins resets only the stale dimension, effort compared case-insensitively', () => {
  const convMeta = {
    'conv-eff': { member: 'm', model: 'auto', effort: 'medium' },
    'conv-case': { member: 'm', model: 'auto', effort: 'HIGH' },
    'conv-arch': { member: 'm', model: 'opus', effort: 'low' },
    'conv-other': { member: 'x', model: 'opus', effort: 'low' },
  };
  assert.deepEqual(stalePins(convMeta, { 'conv-arch': true }, 'm', 'sonnet', 'high'), [
    { conv: 'conv-eff', resetModel: false, resetEffort: true },
  ]);
});

test('stalePins treats an empty file model as follow-the-default — any pin is stale', () => {
  const convMeta = {
    'conv-pin': { member: 'm', model: 'opus' },
  };
  assert.deepEqual(stalePins(convMeta, {}, 'm', '', ''), [
    { conv: 'conv-pin', resetModel: true, resetEffort: false },
  ]);
});
