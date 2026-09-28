import { test } from 'node:test';
import assert from 'node:assert/strict';
import { railTree, type RailConv } from './rail-tree.ts';

const ROOT = '_onboarding_v1';
const rows = (order: string[], convs: Record<string, RailConv>, active: string | null = null) =>
  railTree(order, convs, { root: ROOT, active }).map((r) => `${'  '.repeat(r.depth)}${r.conv}`);

test('a working teammate hangs under the agent that briefed it', () => {
  const convs: Record<string, RailConv> = {
    [ROOT]: { live: false, coordinating: true },
    'mb-developer': { live: true, open_requests: [{ parent_conv: ROOT }] },
    'general-1': {},
  };
  assert.deepEqual(rows([ROOT, 'general-1', 'mb-developer'], convs), [
    ROOT,
    '  mb-developer',
    'general-1',
  ]);
});

test('a finished teammate leaves the rail', () => {
  const convs: Record<string, RailConv> = {
    [ROOT]: {},
    'mb-developer': { live: false, open_requests: [] , parent_conv: ROOT },
    'work-lc3': { parent_conv: 'roadmap-architect-a' },
  };
  assert.deepEqual(rows([ROOT, 'mb-developer', 'work-lc3'], convs), [ROOT]);
});

test('…unless the operator has it open', () => {
  const convs: Record<string, RailConv> = { [ROOT]: {}, 'mb-deployer': { parent_conv: ROOT } };
  assert.deepEqual(rows([ROOT, 'mb-deployer'], convs, 'mb-deployer'), [ROOT, '  mb-deployer']);
});

test('chains nest, and the master is never a child', () => {
  const convs: Record<string, RailConv> = {
    'roadmap-architect-a': { live: true },
    [ROOT]: { live: true, open_requests: [{ parent_conv: 'roadmap-architect-a' }] },
    'mb-git-manager': { live: true, open_requests: [{ parent_conv: ROOT }] },
  };
  assert.deepEqual(rows([ROOT, 'roadmap-architect-a', 'mb-git-manager'], convs), [
    ROOT,
    '  mb-git-manager',
    'roadmap-architect-a',
  ]);
});

test('a child whose parent is not in the rail shows at the top level', () => {
  const convs: Record<string, RailConv> = { 'work-x': { live: true, parent_conv: 'gone' } };
  assert.deepEqual(rows(['work-x'], convs), ['work-x']);
});
