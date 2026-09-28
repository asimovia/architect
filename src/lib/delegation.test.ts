/**
 * delegation.test.ts — BT-17. One card per delegated brief, updated in
 * place; the parent thread carries summaries, never the child's detail.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyDelegationEvent,
  cardTitle,
  firstLine,
  isDelegationEvent,
  mergeCards,
  normalizeStatus,
  requestIdsOf,
  shortCommit,
  statusLabel,
} from './delegation.ts';
import { applyChatEvent, applyPatchToList, mergeDelegationCards } from '../state/chat/reducer.ts';
import { buildStream } from './stream-core.ts';
import type { ChatMsg } from '../state/chat/types';

const sent = (rid: string, over: Record<string, unknown> = {}) => ({
  type: 'delegate.sent',
  conv: '_onboarding_v1',
  child_conv: 'mb-developer',
  member: 'developer',
  request_id: rid,
  initiative_id: 'base-team',
  task_id: 'BT-17',
  brief: '\n  Build the delegation cards.\nLong detail the parent never needs.',
  ts: '2026-09-28T10:00:00Z',
  ...over,
});

function fold(events: Array<Record<string, unknown>>, start: ChatMsg[] = []): ChatMsg[] {
  let list = start;
  for (const ev of events) list = applyPatchToList(list, applyChatEvent(list, ev as never));
  return list;
}

describe('pure reduction', () => {
  it('recognises only the four delegate events', () => {
    assert.equal(isDelegationEvent('delegate.sent'), true);
    assert.equal(isDelegationEvent('delegate.report'), true);
    assert.equal(isDelegationEvent('delegate.unknown'), false);
    assert.equal(isDelegationEvent(undefined), false);
  });

  it('collects request ids from request_ids and request_id, deduped', () => {
    assert.deepEqual(requestIdsOf({ request_ids: ['a', 'b', 'a', 3], request_id: 'b' }), ['a', 'b']);
    assert.deepEqual(requestIdsOf({ request_id: ' r1 ' }), ['r1']);
    assert.deepEqual(requestIdsOf({}), []);
  });

  it('maps report statuses; done is success', () => {
    assert.equal(normalizeStatus('done'), 'success');
    assert.equal(normalizeStatus('PARTIAL'), 'partial');
    assert.equal(normalizeStatus('failed'), 'failed');
    assert.equal(normalizeStatus('blocked'), 'blocked');
  });

  it('sent → progress → amended → report walks one card through its life', () => {
    let c = applyDelegationEvent(null, 'r1', sent('r1'))!;
    assert.equal(c.status, 'working');
    assert.equal(c.brief, 'Build the delegation cards.');
    assert.equal(cardTitle(c), 'developer · #BT-17');
    c = applyDelegationEvent(c, 'r1', { type: 'delegate.progress', request_id: 'r1', summary: 'tests green\nmore', ts: '2026-09-28T10:05:00Z' })!;
    assert.equal(c.progress, 'tests green');
    c = applyDelegationEvent(c, 'r1', { type: 'delegate.amended', request_id: 'r1', text: 'also X' })!;
    c = applyDelegationEvent(c, 'r1', { type: 'delegate.amended', request_id: 'r1', text: 'and Y' })!;
    assert.equal(c.amendments, 2);
    c = applyDelegationEvent(c, 'r1', { type: 'delegate.report', request_id: 'r1', status: 'done', summary: 'Cards render.', commit: '52a9521abcdef', ts: '2026-09-28T10:30:00Z' })!;
    assert.equal(c.status, 'success');
    assert.equal(c.summary, 'Cards render.');
    assert.equal(shortCommit(c.commit), '52a9521');
    assert.equal(c.ts, '2026-09-28T10:00:00Z', 'the card keeps its place in the thread');
    assert.equal(c.updated_ts, '2026-09-28T10:30:00Z');
  });

  it('a card born from a report (history cut mid-delegation) still names who', () => {
    const c = applyDelegationEvent(null, 'r9', { type: 'delegate.report', child_conv: 'mb-deployer', request_id: 'r9', status: 'blocked', summary: 'no key' })!;
    assert.equal(c.status, 'blocked');
    assert.equal(cardTitle(c), 'deployer');
  });

  it('firstLine clips long briefs', () => {
    assert.equal(firstLine('x'.repeat(200), 10), 'xxxxxxxxx…');
    assert.equal(firstLine('   \n  '), undefined);
  });

  it('merging an older view into a newer one keeps the older start and the newer outcome', () => {
    const older = applyDelegationEvent(null, 'r1', sent('r1'))!;
    const newer = applyDelegationEvent(null, 'r1', { type: 'delegate.report', request_id: 'r1', status: 'partial', summary: 'half', ts: '2026-09-28T11:00:00Z' })!;
    const m = mergeCards(older, newer);
    assert.equal(m.status, 'partial');
    assert.equal(m.brief, 'Build the delegation cards.');
    assert.equal(m.summary, 'half');
    assert.equal(m.ts, '2026-09-28T10:00:00Z');
  });
});

describe('chat reducer — one card per request_id', () => {
  it('four events for one brief render as ONE card, updated in place', () => {
    const list = fold([
      sent('r1'),
      { type: 'delegate.progress', conv: 'p', request_id: 'r1', summary: 'halfway' },
      { type: 'delegate.amended', conv: 'p', request_id: 'r1', text: 'also' },
      { type: 'delegate.report', conv: 'p', request_id: 'r1', status: 'success', summary: 'ok' },
    ]);
    assert.equal(list.length, 1);
    assert.equal(list[0]!.system_kind, 'delegation');
    assert.equal(list[0]!.delegation!.status, 'success');
    assert.equal(list[0]!.delegation!.amendments, 1);
  });

  it('a merged report closes every brief it answers', () => {
    const list = fold([
      sent('r1'),
      sent('r2', { brief: 'second', ts: '2026-09-28T10:01:00Z' }),
      { type: 'delegate.report', conv: 'p', request_ids: ['r1', 'r2'], status: 'success', summary: 'both' },
    ]);
    assert.equal(list.length, 2);
    assert.ok(list.every((m) => m.delegation!.status === 'success' && m.delegation!.summary === 'both'));
  });

  it('an event with no request id changes nothing', () => {
    assert.deepEqual(applyChatEvent([], { type: 'delegate.sent', conv: 'p' }), { op: 'none' });
  });

  it('a card landing mid-turn does not stop chat.error from closing the live bubble', () => {
    const start: ChatMsg[] = [
      { kind: 'assistant', text: 'delegating', streaming: true, stream_id: 's1', ts: '2026-09-28T09:59:00Z' },
    ];
    const list = fold([sent('r1'), { type: 'chat.error', conv: 'p', text: 'died' }], start);
    assert.equal(list[0]!.streaming, false);
    assert.equal(list.at(-1)!.system_kind, 'error');
  });

  it('a card straddling two history pages is kept once, with both halves', () => {
    const older = fold([sent('r1')]);
    const newer = fold([
      { type: 'delegate.report', conv: 'p', request_id: 'r1', status: 'failed', summary: 'tests red', ts: '2026-09-28T12:00:00Z' },
      { type: 'chat.user', conv: 'p', text: 'next', ts: '2026-09-28T12:01:00Z' },
    ]);
    const merged = mergeDelegationCards(older, newer);
    assert.equal(merged.length, 2);
    assert.equal(merged[0]!.delegation!.status, 'failed');
    assert.equal(merged[0]!.delegation!.brief, 'Build the delegation cards.');
    assert.equal(merged[1]!.kind, 'user');
  });
});

describe('the card is the single place the outcome shows', () => {
  const wake = (ts: string, conv = 'mb-developer'): ChatMsg => ({
    kind: 'user',
    author: 'delegate-wake',
    text: `[delegate-wake] Subagent \`${conv}\` (developer) finished on task \`BT-17\``,
    ts,
  });
  const isWake = (m: ChatMsg): boolean => m.author === 'delegate-wake';
  const texts = (msgs: ChatMsg[]) =>
    buildStream('p', msgs, () => false, isWake).pre.map((it) => (it.kind === 'msg' ? (it.msg.system_kind ?? it.msg.kind) : it.kind));

  it('a finished card hides the matching wake line', () => {
    const msgs = [
      ...fold([sent('r1'), { type: 'delegate.report', conv: 'p', request_id: 'r1', status: 'success', summary: 'ok' }]),
      wake('2026-09-28T10:30:00Z'),
    ];
    assert.deepEqual(texts(msgs), ['delegation']);
  });

  it('with no card (older daemon) the wake line stays', () => {
    assert.deepEqual(texts([wake('2026-09-28T10:30:00Z')]), ['user']);
  });

  it('a still-working card does not hide it, nor does a card for another child', () => {
    const working = [...fold([sent('r1')]), wake('2026-09-28T10:30:00Z')];
    assert.deepEqual(texts(working), ['delegation', 'user']);
    const other = [
      ...fold([sent('r1', { child_conv: 'mb-deployer' }), { type: 'delegate.report', conv: 'p', request_id: 'r1', status: 'success' }]),
      wake('2026-09-28T10:30:00Z'),
    ];
    assert.deepEqual(texts(other), ['delegation', 'user']);
  });

  it('a wake is judged by the delegation it belongs to, not a later one', () => {
    const msgs = [
      ...fold([
        sent('r1'),
        { type: 'delegate.report', conv: 'p', request_id: 'r1', status: 'success' },
        sent('r2', { ts: '2026-09-28T11:00:00Z' }),
      ]),
      wake('2026-09-28T10:30:00Z'),
    ];
    // r1 (finished) covers the 10:30 wake; r2 is later and still working.
    assert.deepEqual(texts(msgs), ['delegation', 'delegation']);
    // A wake after r2 started is judged by r2 — still working, so shown.
    assert.deepEqual(texts([...msgs, wake('2026-09-28T11:30:00Z')]), ['delegation', 'delegation', 'user']);
  });
});

describe('final daemon contract', () => {
  it('a report with request_id null and the full request_ids closes every card', () => {
    const list = fold([
      sent('r1'),
      sent('r2', { ts: '2026-09-28T10:01:00Z' }),
      { type: 'delegate.report', conv: 'p', request_id: null, request_ids: ['r1', 'r2'], status: 'success', summary: 'both' },
    ]);
    assert.equal(list.length, 2);
    assert.ok(list.every((m) => m.delegation!.status === 'success'));
  });

  it('no_report reads "no report", not a failure', () => {
    const [m] = fold([
      sent('r1'),
      { type: 'delegate.report', conv: 'p', request_id: 'r1', request_ids: ['r1'], status: 'failed', no_report: true },
    ]);
    assert.equal(m!.delegation!.no_report, true);
    assert.equal(statusLabel(m!.delegation!.status, !!m!.delegation!.no_report), 'no report');
    assert.equal(statusLabel('failed'), 'failed');
  });
});
