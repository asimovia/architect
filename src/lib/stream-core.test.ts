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

describe('WALL1 — every operator message keeps its header, in the order it was answered (mf27 2026-10-15)', () => {
  const u = (t: string, ts: string): ChatMsg => ({ kind: 'user', text: t, ts });
  const a = (t: string, ts: string, extra: Partial<ChatMsg> = {}): ChatMsg => ({ kind: 'assistant', text: t, ts, ...extra });
  const order = (s: ReturnType<typeof buildStream>): string[] =>
    s.pre.map((it) => (it.kind === 'msg' ? `${it.msg.kind}:${it.msg.text}` : it.kind));

  it('messages sent during a turn read after its reply, before the reply that answers them', () => {
    const msgs = [
      u('todo lo inventado debe desaparecer', '2026-10-15T10:13:41Z'),
      u('los trayectos en 24 km', '2026-10-15T10:15:30Z'),
      u('todos los datos de trayectos', '2026-10-15T10:16:08Z'),
      u('olvida lo del proyecto', '2026-10-15T10:16:42Z'),
      a('Recibido — DAT10 en marcha', '2026-10-15T10:16:58Z'),
      a('Recibido — olvidado', '2026-10-15T10:17:25Z'),
    ];
    assert.deepEqual(order(buildStream('_onboarding_v1', msgs, () => false, () => false)), [
      'user:todo lo inventado debe desaparecer',
      'assistant:Recibido — DAT10 en marcha',
      'user:los trayectos en 24 km',
      'user:todos los datos de trayectos',
      'user:olvida lo del proyecto',
      'assistant:Recibido — olvidado',
    ]);
  });

  it('while the turn runs, each waiting message is its own queued bubble (never merged)', () => {
    const msgs = [
      u('go', '2026-10-15T10:13:41Z'),
      a('', '2026-10-15T10:13:42Z', { streaming: true, stream_id: 's1' }),
      u('one', '2026-10-15T10:15:30Z'),
      u('two', '2026-10-15T10:16:08Z'),
    ];
    const s = buildStream('_onboarding_v1', msgs, () => false, () => false);
    assert.deepEqual(s.queued.map((it) => (it.kind === 'msg' ? it.msg.text : '')), ['one', 'two']);
  });
});
