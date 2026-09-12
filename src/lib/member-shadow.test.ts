/**
 * member-shadow.test.ts — ATM14. Pinned conv overrides shadow the member file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { effortPinLive, findShadowedConvs, isPinnedOverride, modelPinLive, pinIsLive, resolveDisplayEngine, stalePins } from './member-shadow.ts';

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

test('resolveDisplayEngine shows the live member file for a follower, ignoring a stale daemon snap', () => {
  assert.deepEqual(
    resolveDisplayEngine(
      { member: 'm', model: 'auto', effort: 'default' },
      { model: 'opus', effort: 'high', client: 'claude-code' },
      { model: 'muse-spark-x', effort: 'low', client: 'muse' },
    ),
    { model: 'muse-spark-x', effort: 'low', client: 'muse' },
  );
});

test('resolveDisplayEngine shows a legacy (unstamped) pin as the member file', () => {
  assert.deepEqual(
    resolveDisplayEngine(
      { member: 'm', model: 'opus', effort: 'default' },
      { model: 'opus', effort: 'high', client: 'claude-code' },
      { model: 'muse-spark-x', effort: 'low', client: 'muse' },
      null,
    ),
    { model: 'muse-spark-x', effort: 'low', client: 'muse' },
  );
});

test('resolveDisplayEngine keeps a pin retuned after the member save', () => {
  assert.deepEqual(
    resolveDisplayEngine(
      { member: 'm', model: 'opus', effort: 'default', modelPinAt: 2000 },
      { model: 'opus', effort: 'high', client: 'claude-code' },
      { model: 'muse-spark-x', effort: 'low', client: 'muse' },
      1000,
    ),
    { model: 'opus', effort: 'low', client: 'muse' },
  );
});

test('resolveDisplayEngine drops a pin set before the member save', () => {
  assert.deepEqual(
    resolveDisplayEngine(
      { member: 'm', model: 'opus', effort: 'high', modelPinAt: 1000, effortPinAt: 1000 },
      { model: 'opus', effort: 'high', client: 'claude-code' },
      { model: 'muse-spark-x', effort: 'low', client: 'muse' },
      2000,
    ),
    { model: 'muse-spark-x', effort: 'low', client: 'muse' },
  );
});

test('pinIsLive: stamped pin with no save observed is live; legacy pin is stale', () => {
  assert.equal(pinIsLive(2000, null), true);
  assert.equal(pinIsLive(undefined, null), false);
  assert.equal(pinIsLive(undefined, 1000), false);
  assert.equal(pinIsLive(1000, 2000), false);
  assert.equal(pinIsLive(2000, 2000), true);
  assert.equal(pinIsLive(3000, 2000), true);
});

test('modelPinLive/effortPinLive ignore follow-values and unbound convs', () => {
  assert.equal(modelPinLive({ model: 'auto', modelPinAt: 9999 }, null), false);
  assert.equal(effortPinLive({ effort: 'default', effortPinAt: 9999 }, null), false);
  assert.equal(modelPinLive({ member: 'm', model: 'opus', modelPinAt: 3000 }, 2000), true);
  assert.equal(modelPinLive({ member: 'm', model: 'opus' }, null), false);
  assert.equal(effortPinLive({ member: 'm', effort: 'high', effortPinAt: 1000 }, 2000), false);
  assert.equal(effortPinLive({ member: 'm', effort: 'high', effortPinAt: 3000 }, 2000), true);
});

test('resolveDisplayEngine keeps daemon-snap-first for unbound convs', () => {
  assert.deepEqual(
    resolveDisplayEngine(
      { model: 'auto', effort: 'default' },
      { model: 'opus', effort: 'high', client: 'claude-code' },
      undefined,
    ),
    { model: 'opus', effort: 'high', client: 'claude-code' },
  );
});

test('resolveDisplayEngine falls back to snap when the bound member left the roster', () => {
  assert.deepEqual(
    resolveDisplayEngine(
      { member: 'gone', model: 'auto', effort: 'default' },
      { model: 'opus', effort: 'default', client: 'claude-code' },
      undefined,
    ),
    { model: 'opus', effort: 'default', client: 'claude-code' },
  );
});
