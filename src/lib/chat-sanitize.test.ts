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
import { keepAttachments, type ChatAttachment } from './chat-sanitize.ts';

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
