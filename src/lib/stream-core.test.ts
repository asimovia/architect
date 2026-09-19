import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildStream, groupAutonomous } from './stream-core.ts';
import type { ChatMsg } from '../state/chat/types';

const noAuto = (): boolean => false;
const noWake = (): boolean => false;

function user(ts: string, text = 'mira esto'): ChatMsg {
  return {
    kind: 'user',
    text,
    author: 'operator',
    ts,
    attachments: [
      {
        kind: 'image',
        media_type: 'image/png',
        url: `/chat/uploads/2026-09-19/c-${ts}.png`,
        filename: `c-${ts}.png`,
      },
    ],
  };
}

function assistant(ts: string, text = 'ok'): ChatMsg {
  return { kind: 'assistant', text, streaming: false, ts };
}

describe('stream-core wrapper identity (T-chat-images-flicker)', () => {
  it('keeps the same pre wrapper when a new message appends', () => {
    const m1 = user('2026-09-19T10:00:00.000Z');
    const m2 = assistant('2026-09-19T10:00:01.000Z');
    const first = buildStream('c', [m1, m2], noAuto, noWake);
    const m3 = user('2026-09-19T10:00:02.000Z');
    const second = buildStream('c', [m1, m2, m3], noAuto, noWake);
    // Solid's <For> reconciles rows by item identity: unchanged messages
    // must keep their wrapper or every <img> is destroyed + refetched.
    assert.equal(second.pre[0], first.pre[0]);
    assert.equal(second.pre[1], first.pre[1]);
  });

  it('keeps existing wrappers when an older page prepends', () => {
    const m2 = user('2026-09-19T10:00:02.000Z');
    const m3 = assistant('2026-09-19T10:00:03.000Z');
    const first = buildStream('c', [m2, m3], noAuto, noWake);
    const m1 = user('2026-09-19T10:00:00.000Z');
    const second = buildStream('c', [m1, m2, m3], noAuto, noWake);
    assert.equal(second.pre[1], first.pre[0]);
    assert.equal(second.pre[2], first.pre[1]);
  });

  it('keeps the same queued wrapper across recomputes while streaming', () => {
    const live: ChatMsg = { kind: 'assistant', text: '…', streaming: true, ts: '2026-09-19T10:00:01.000Z', stream_id: 's1' };
    const trailing = user('2026-09-19T10:00:02.000Z');
    const msgs = [assistant('2026-09-19T10:00:00.000Z'), live, trailing];
    const first = buildStream('c', msgs, noAuto, noWake);
    assert.equal(first.queued.length, 1);
    const second = buildStream('c', msgs, noAuto, noWake);
    assert.equal(second.queued[0], first.queued[0]);
    assert.equal(second.pre[0], first.pre[0]);
  });

  it('keeps single-msg autonomous segments stable across recomputes', () => {
    const m1 = user('2026-09-19T10:00:00.000Z');
    const m2 = assistant('2026-09-19T10:00:01.000Z');
    const pre1 = buildStream('c', [m1, m2], noAuto, noWake).pre;
    const pre2 = buildStream('c', [m1, m2], noAuto, noWake).pre;
    const segs1 = groupAutonomous(pre1, null);
    const segs2 = groupAutonomous(pre2, null);
    assert.equal(segs1.length, 2);
    assert.equal(segs2[0], segs1[0]);
  });
});
