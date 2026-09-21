import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { historyMsg } from './history-msg.ts';

describe('historyMsg (AX22)', () => {
  it('keeps attachments on chat.user history events', () => {
    const m = historyMsg({
      type: 'chat.user',
      conv: 'c',
      text: 'mira esto',
      author: 'operator',
      ts: '2026-09-12T10:00:00.000Z',
      attachments: [
        {
          kind: 'image',
          media_type: 'image/png',
          url: '/chat/uploads/2026-09-12/c-123-0-ab12.png',
          filename: 'c-123-0-ab12.png',
        },
      ],
    } as never);
    assert.ok(m);
    assert.equal(m.kind, 'user');
    assert.equal(m.attachments?.length, 1);
    assert.equal(m.attachments?.[0]?.url, '/chat/uploads/2026-09-12/c-123-0-ab12.png');
  });

  it('yields no attachments field when the event has none', () => {
    const m = historyMsg({
      type: 'chat.user',
      conv: 'c',
      text: 'solo texto',
      author: 'operator',
      ts: '2026-09-12T10:00:00.000Z',
    } as never);
    assert.ok(m);
    assert.equal(m.attachments, undefined);
  });
});

describe('historyMsg (REL1)', () => {
  it('brings a persisted chat.error back as a system error bubble', () => {
    const m = historyMsg({
      type: 'chat.error',
      conv: 'c1',
      reason: 'subprocess-exited',
      text: 'The turn ended without a reply — the CLI process exited before answering.',
      ts: '2026-09-21T08:00:00.000Z',
    } as unknown as Parameters<typeof historyMsg>[0]);
    assert.equal(m?.kind, 'system');
    assert.equal(m?.system_kind, 'error');
    assert.match(String(m?.text), /ended without a reply/);
  });
});
