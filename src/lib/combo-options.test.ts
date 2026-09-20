/**
 * combo-options.test.ts — ATM21. The label a combo shows is a pure
 * function of the value; that is the entire point of dropping the native
 * `<select>`, so it is the thing worth pinning down in tests.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comboLabel, comboStep, groupOptions } from './combo-options.ts';

const CLIENTS = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex', disabled: true },
  { id: 'muse', label: 'Muse Code (Meta)' },
];

test('the label comes from the value, never from the first option', () => {
  assert.equal(comboLabel(CLIENTS, 'muse'), 'Muse Code (Meta)');
  assert.equal(comboLabel(CLIENTS, 'claude-code'), 'Claude Code');
});

test('a value the catalog does not list shows ITSELF, not another row', () => {
  // The bug this control replaces: value 'muse', options not hydrated yet,
  // and the native select rendered "Claude Code".
  assert.equal(comboLabel([{ id: 'claude-code', label: 'Claude Code' }], 'muse'), 'muse');
  assert.equal(comboLabel([], 'gpt-5.4'), 'gpt-5.4');
});

test('an empty value falls back to the placeholder', () => {
  assert.equal(comboLabel(CLIENTS, ''), '—');
  assert.equal(comboLabel(CLIENTS, null, 'Loading catalog…'), 'Loading catalog…');
  // …but an empty id that IS a real option (the CLI-default row) wins.
  assert.equal(comboLabel([{ id: '', label: 'Default (Muse CLI config)' }], ''), 'Default (Muse CLI config)');
});

test('consecutive options group under one header, order preserved', () => {
  const groups = groupOptions([
    { id: 'fable', label: 'Fable', group: 'Latest (alias)' },
    { id: 'opus', label: 'Opus', group: 'Latest (alias)' },
    { id: 'claude-opus-5', label: 'Opus 5', group: 'Pinned version' },
    { id: 'x', label: 'X' },
  ]);
  assert.deepEqual(groups.map((g) => [g.group, g.items.length]), [
    ['Latest (alias)', 2],
    ['Pinned version', 1],
    [null, 1],
  ]);
});

test('arrow stepping skips disabled rows and stops at the ends', () => {
  assert.equal(comboStep(CLIENTS, 'claude-code', 1), 'muse');   // codex disabled
  assert.equal(comboStep(CLIENTS, 'muse', 1), 'muse');          // last
  assert.equal(comboStep(CLIENTS, 'claude-code', -1), 'claude-code'); // first
  // A disabled row that is the CURRENT value stays reachable/steppable.
  assert.equal(comboStep(CLIENTS, 'codex', 1), 'muse');
  // An unknown value enters the list at the near end.
  assert.equal(comboStep(CLIENTS, 'gemini', 1), 'claude-code');
});
