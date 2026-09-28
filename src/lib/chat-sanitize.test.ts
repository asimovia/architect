/**
 * chat-sanitize.test.ts — T-chat-images-robust.
 *
 * The wall must never lose images it already shows: a text-only
 * `chat.user` echo (daemon absorbed the upload and proceeded text-only)
 * keeps the optimistic data: URLs; an echo that carries attachments
 * replaces them (data: → canonical /chat/uploads/).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepAttachments, stripAnchorMarkers, type ChatAttachment } from './chat-sanitize.ts';

const optimistic: ChatAttachment[] = [
  { kind: 'image', media_type: 'image/png', url: 'data:image/png;base64,AAA' },
];
const canonical: ChatAttachment[] = [
  {
    kind: 'image',
    media_type: 'image/png',
    url: '/chat/uploads/2026-09-21/c-1-0-ab12.png',
    filename: 'c-1-0-ab12.png',
  },
];

test('text-only echo keeps the optimistic attachments', () => {
  assert.deepEqual(keepAttachments(optimistic, undefined), optimistic);
});

test('echo with attachments replaces the optimistic ones', () => {
  assert.deepEqual(keepAttachments(optimistic, canonical), canonical);
});

test('no attachments anywhere stays empty', () => {
  assert.equal(keepAttachments(undefined, undefined), undefined);
});

test('BT-4 — report + anchor on one line, and the bare echo, never reach the chat (mf27)', () => {
  const text = [
    '#VW2 done — commit 52a9521.',
    '{"for":["rq-7d930b"],"status":"done","commit":"52a9521"}',
    '',
    '⟦report⟧ {"for":["rq-7d930b"],"status":"done","commit":"52a9521"}⟦anchor⟧ {"info":true} Nada pendiente',
  ].join('\n');
  const out = stripAnchorMarkers(text);
  assert.ok(!out.includes('⟦') && !out.includes('{'), out);
  assert.ok(out.startsWith('#VW2 done') && out.endsWith('Nada pendiente'), out);
});

test('BT-4 — a brace inside a string does not end the payload', () => {
  assert.equal(stripAnchorMarkers('ok\n⟦report⟧ {"next":"fix } later"}'), 'ok\n');
});
