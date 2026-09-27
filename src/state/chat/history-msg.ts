/**
 * state/chat/history-msg.ts — pure history→message mapper (AX22).
 *
 * `historyMsg` used to live in `paging.ts`, unreachable from the
 * maintained test harness: `node --test` runs with native TS stripping
 * and no `~` alias, so only leaf modules (relative imports, no
 * Solid/store, no bare `import.meta.env`) can be imported by tests.
 * This module keeps exactly those constraints — value-imports are
 * relative, everything else is type-only — so the regression test
 * next to it actually runs.
 */

import type { DaemonEvent } from '~/lib/daemon-client';
import type { ChatMsg } from './types';
// NOTE: explicit `.ts` extension — node's native TS stripping (used by
// `npm test`) cannot resolve extensionless relative imports.
import { cleanChatText, parseAttachments } from '../../lib/chat-sanitize.ts';

export function historyMsg(ev: DaemonEvent): ChatMsg | null {
  const t = typeof ev.type === 'string' ? ev.type : '';
  if (t === 'chat.user') {
    return {
      kind: 'user',
      text: String(ev.text ?? ''),
      author: String(ev.author ?? 'operator'),
      ts: String(ev.ts ?? ''),
      // AX22 — las páginas antiguas también traen attachments; sin esto
      // las imágenes solo se veían en directo y en la primera página.
      attachments: parseAttachments((ev as { attachments?: unknown }).attachments),
    };
  }
  if (t === 'chat.assistant' || t === 'chat.assistant.final') {
    return {
      kind: 'assistant',
      text: cleanChatText(String(ev.text ?? '')),
      streaming: false,
      ts: String(ev.ts ?? ''),
      stream_id: typeof ev.stream_id === 'string' ? ev.stream_id : undefined,
    };
  }
  // REL1 — a turn that died is part of the conversation: the daemon
  // persists `chat.error`, so re-opening the thread must still show why
  // nothing came back instead of an unanswered message.
  if (t === 'chat.error') {
    return {
      kind: 'system',
      system_kind: 'error',
      text: String(ev.text ?? 'The turn ended without a reply.'),
      ts: String(ev.ts ?? ''),
    };
  }
  if (t === 'chat.notice') {
    return { kind: 'system', system_kind: 'divider', text: String(ev.text ?? ''), ts: String(ev.ts ?? '') };
  }
  if (t === 'chat.cancelled') {
    return {
      kind: 'assistant',
      text: String(ev.text ?? ''),
      streaming: false,
      cancelled: true,
      ts: String(ev.ts ?? ''),
    };
  }
  return null;
}
