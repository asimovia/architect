import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNREAD_KEY,
  dropCluster,
  isFinishedWork,
  isReadableConv,
  loadUnread,
  markRead,
  markUnread,
  saveUnread,
} from './unread-convs.ts';

function mem() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

test('only a turn that ended counts as finished work', () => {
  assert.equal(isFinishedWork('chat.assistant.final'), true);
  assert.equal(isFinishedWork('chat.error'), true);
  assert.equal(isFinishedWork('chat.error', 'become'), false);
  assert.equal(isFinishedWork('chat.assistant.delta'), false);
  assert.equal(isFinishedWork('conv.meta_updated'), false);
  assert.equal(isFinishedWork('chat.notice'), false);
});

test('mark → read round-trip leaves nothing behind', () => {
  let m = markUnread({}, 'reddit', 'a03');
  m = markUnread(m, 'reddit', 'a03');
  assert.deepEqual(m, { reddit: ['a03'] });
  m = markUnread(m, 'reddit', 'a01');
  assert.deepEqual(m, { reddit: ['a03', 'a01'] });
  m = markRead(m, 'reddit', 'a03');
  m = markRead(m, 'reddit', 'a01');
  assert.deepEqual(m, {});
});

test('reading a conv that was never unread returns the same map', () => {
  const m = { x: ['a'] };
  assert.equal(markRead(m, 'x', 'b'), m);
  assert.equal(markRead(m, 'y', 'a'), m);
});

test('forgetting a project drops its dots', () => {
  assert.deepEqual(dropCluster({ a: ['1'], b: ['2'] }, 'a'), { b: ['2'] });
});

test('persistence survives a reload and ignores garbage', () => {
  const kv = mem();
  saveUnread({ p: ['a01'] }, kv);
  assert.deepEqual(loadUnread(kv), { p: ['a01'] });
  kv.setItem(UNREAD_KEY, '{"p": "nope", "q": [1, "a02", ""]}');
  assert.deepEqual(loadUnread(kv), { q: ['a02'] });
  kv.setItem(UNREAD_KEY, 'not json');
  assert.deepEqual(loadUnread(kv), {});
});

test('DOT1 — background external asks and finished children never light the dot (MeshKore 2026-10-04)', () => {
  assert.equal(isReadableConv('ext-consultant-ext-site-devto-4792828'), false);
  assert.equal(isReadableConv('mb-developer-b2cf', { parent_conv: '_onboarding_v1' }), false);
  assert.equal(isReadableConv('_onboarding_v1', { parent_conv: 'roadmap-architect-e2n8m' }), true);
  assert.equal(isReadableConv('roadmap-architect-e2n8m'), true);
});
