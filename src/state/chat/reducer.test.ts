import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyChatEvent, applyPatchToList } from './reducer.ts';
import { buildStream } from '../../lib/stream-core.ts';
import type { ChatMsg } from './types';

describe('chat.error closes the turn it reports (jev-clone 2026-09-27)', () => {
  it('a dead turn stops streaming, so nothing is painted live with STOP afterwards', () => {
    const list: ChatMsg[] = [
      { kind: 'user', text: 'go', ts: '2026-09-27T00:00:00Z' },
      { kind: 'assistant', text: 'working on', streaming: true, stream_id: 's1', ts: '2026-09-27T00:01:00Z' },
    ];
    const patch = applyChatEvent(list, { type: 'chat.error', conv: 'c', text: 'died', ts: '2026-09-27T00:12:00Z' });
    const after = applyPatchToList(list, patch);
    assert.equal(after.length, 3);
    assert.equal(after[1]!.streaming, false);
    assert.equal(after[2]!.kind, 'system');
    const later = [...after, { kind: 'user', text: 'again', ts: '2026-09-27T19:24:00Z' } as ChatMsg];
    assert.equal(buildStream('c', later, () => false, () => false).live, null);
  });

  it('chat.notice is a divider and ends nothing', () => {
    const list: ChatMsg[] = [{ kind: 'assistant', text: 'x', streaming: true, stream_id: 's', ts: 't' }];
    const patch = applyChatEvent(list, { type: 'chat.notice', conv: 'c', text: 'New code client from here: codex', ts: 't2' });
    const after = applyPatchToList(list, patch);
    assert.equal(after[0]!.streaming, true);
    assert.equal(after[1]!.system_kind, 'divider');
  });
});

describe('a final ends the turn (reddit 2026-09-27)', () => {
  it('a streaming bubble whose id never matched is swept, so no ghost STOP remains', () => {
    const list: ChatMsg[] = [
      { kind: 'user', text: 'revisa todo', ts: '2026-09-27T20:46:00Z' },
      { kind: 'assistant', text: '', streaming: true, stream_id: 'seeded-from-snapshot', ts: '2026-09-27T20:46:05Z' },
    ];
    const after = applyPatchToList(list, applyChatEvent(list, {
      type: 'chat.assistant.final', conv: 'c', stream_id: 's_real', text: 'Revisadas las seis', ts: '2026-09-27T20:52:14Z',
    }));
    assert.equal(after.length, 2); // the empty placeholder is gone
    assert.equal(after[1]!.text, 'Revisadas las seis');
    assert.ok(after.every((m) => !m.streaming));
    const later = [...after, { kind: 'user', text: 'so?', ts: '2026-09-27T21:06:17Z' } as ChatMsg];
    assert.equal(buildStream('c', later, () => false, () => false).live, null);
  });

  it('a stale bubble with text is kept, just closed', () => {
    const list: ChatMsg[] = [
      { kind: 'assistant', text: 'half an answer', streaming: true, stream_id: 'old', ts: 't1' },
      { kind: 'assistant', text: '', streaming: true, stream_id: 'new', ts: 't2' },
    ];
    const after = applyPatchToList(list, applyChatEvent(list, {
      type: 'chat.assistant.final', conv: 'c', stream_id: 'new', text: 'done', ts: 't3',
    }));
    assert.deepEqual(after.map((m) => [m.text, !!m.streaming]), [['half an answer', false], ['done', false]]);
  });
});
