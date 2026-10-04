/**
 * state/chat/reducer.ts — the ONE decision table for `chat.*` events.
 *
 * AX12 (cockpit-excellence). Two ~120-line copies of this logic used to
 * exist: `ingestEvent` wrote the reactive store, `ingestEventForCluster`
 * mutated a cached plain slice for a background project, and they had
 * already drifted. They are now two thin sinks over this function.
 *
 * It returns a PATCH rather than a new array on purpose: the active sink
 * applies `patch` through Solid's fine-grained `setState(..., index,
 * fields)` so a streaming delta touches one message instead of replacing
 * the whole list. The cached sink copies the array. Both make exactly
 * the same decision about WHICH message and WHICH fields.
 *
 * Side effects that belong to the active session only — the pending-reply
 * flag, the streaming-idle marker, window capping, the work-* unarchive
 * safety net — stay in the active sink; they are not part of the list
 * transformation.
 */

import type { DaemonEvent } from '~/lib/daemon-client';
// Relative + .ts so `node --test` can load this leaf (no `~` alias there).
import { cleanChatText, keepAttachments, parseAttachments } from '../../lib/chat-sanitize.ts';
import { applyDelegationEvent, isDelegationEvent, mergeCards, requestIdsOf } from '../../lib/delegation.ts';
import type { ChatMsg } from './types';

export type ChatEventPatch =
  /** Nothing to write (unknown event, missing stream_id, no match). */
  | { op: 'none' }
  /** Merge `fields` into the message at `index`. */
  | { op: 'patch'; index: number; fields: Partial<ChatMsg> }
  /** Append a new message to the end of the list. */
  | { op: 'append'; msg: ChatMsg }
  /** Merge `fields` into `index`, then append `msg` (a turn that died:
   *  close its streaming bubble and say why). */
  | { op: 'patch-append'; index: number; fields: Partial<ChatMsg>; msg: ChatMsg }
  /** Replace the whole list (a final that also sweeps stale bubbles). */
  | { op: 'set'; list: ChatMsg[] };

/** Index of the last assistant bubble still streaming, or -1. */
function lastStreamingIdx(list: readonly ChatMsg[]): number {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const m = list[i]!;
    if (m.kind === 'assistant' && m.streaming) return i;
  }
  return -1;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrUndef = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * Decide what one `chat.*` event does to a conv's message list.
 *
 * Pure: same list + same event ⇒ same patch, no store access.
 */
export function applyChatEvent(list: readonly ChatMsg[], ev: DaemonEvent): ChatEventPatch {
  switch (ev.type) {
    case 'chat.user': {
      const text = str(ev.text);
      const author = strOrUndef(ev.author);
      const incoming = parseAttachments(ev.attachments);
      // Replace the optimistic placeholder with the canonical echo so
      // the bubble isn't duplicated (client and daemon timestamps differ).
      const phIdx = list.findIndex(
        (m) => m.kind === 'user' && m._placeholder_user && m.text === text && (!author || m.author === author),
      );
      if (phIdx >= 0) {
        // Never wipe: a text-only echo (upload absorbed daemon-side)
        // must keep the optimistic data: URLs until canonical ones arrive.
        const prev = list[phIdx];
        const attachments = keepAttachments(prev?.attachments, incoming);
        return {
          op: 'patch',
          index: phIdx,
          fields: { author, ts: strOrUndef(ev.ts), attachments, _placeholder_user: undefined },
        };
      }
      const attachments = incoming;
      return {
        op: 'append',
        msg: { kind: 'user', text, author, ts: strOrUndef(ev.ts), attachments },
      };
    }

    case 'chat.assistant.delta': {
      const streamId = strOrUndef(ev.stream_id);
      if (!streamId) return { op: 'none' };
      const cleaned = cleanChatText(str(ev.text));
      const idx = list.findIndex((m) => m.kind === 'assistant' && m.stream_id === streamId);
      if (idx >= 0) return { op: 'patch', index: idx, fields: { text: cleaned, streaming: true } };
      return {
        op: 'append',
        msg: {
          kind: 'assistant',
          text: cleaned,
          author: strOrUndef(ev.author),
          ts: strOrUndef(ev.ts),
          streaming: true,
          stream_id: streamId,
        },
      };
    }

    case 'chat.assistant.final': {
      const streamId = strOrUndef(ev.stream_id);
      const cleaned = cleanChatText(str(ev.text));
      // A final with no stream_id can never match an existing bubble —
      // `streamId !== undefined` in the predicate is what keeps a
      // stream_id-less final from adopting a stream_id-less draft.
      const idx = list.findIndex(
        (m) => m.kind === 'assistant' && streamId !== undefined && m.stream_id === streamId,
      );
      // reddit, 2026-09-27 — a streaming bubble whose stream_id never
      // matched its final (seeded from a snapshot, or a placeholder) stayed
      // "Working…" with a dead STOP forever, and buildStream hoisted every
      // later message above it as "queued". A final ENDS the conv's turn and
      // the daemon never runs two turns on one conv, so any other bubble
      // still streaming here is stale: drop it if empty, close it if not.
      // LIVE1 (mf27, 2026-10-04) — only a bubble that started BEFORE this
      // final can belong to the turn it ends. Reopening a thread replays the
      // history's old finals on top of the current turn's seeded bubble
      // (empty under Muse); without this check the first old final swept it
      // and the running turn vanished from the wall.
      const finalMs = Date.parse(strOrUndef(ev.ts) ?? '');
      const endedBy = (m: ChatMsg): boolean => {
        const startMs = Date.parse(m.ts ?? '');
        return Number.isNaN(finalMs) || Number.isNaN(startMs) || startMs <= finalMs;
      };
      const stale = list.some((m, i) => i !== idx && m.kind === 'assistant' && m.streaming && endedBy(m));
      if (!stale) {
        if (idx >= 0) return { op: 'patch', index: idx, fields: { text: cleaned, streaming: false } };
        return {
          op: 'append',
          msg: {
            kind: 'assistant',
            text: cleaned,
            author: strOrUndef(ev.author),
            ts: strOrUndef(ev.ts),
            streaming: false,
            stream_id: streamId,
          },
        };
      }
      const swept: ChatMsg[] = [];
      list.forEach((m, i) => {
        if (i === idx) {
          swept.push({ ...m, text: cleaned, streaming: false });
          return;
        }
        if (m.kind === 'assistant' && m.streaming && endedBy(m)) {
          if (m.text.trim()) swept.push({ ...m, streaming: false });
          return;
        }
        swept.push(m);
      });
      if (idx < 0) {
        swept.push({
          kind: 'assistant',
          text: cleaned,
          author: strOrUndef(ev.author),
          ts: strOrUndef(ev.ts),
          streaming: false,
          stream_id: streamId,
        });
      }
      return { op: 'set', list: swept };
    }

    // REL1 — the daemon telling us a turn died (subprocess exited without
    // a final, hard timeout). It is a real, persisted chat event, so it
    // renders in the thread and comes back with the history; the streaming
    // bubble it interrupts stops pretending to be alive.
    case 'chat.error': {
      // BT-17 — a delegation card can land after the streaming bubble
      // while the turn is still live, so "the bubble" is the last
      // streaming assistant, not necessarily the last message.
      const lastIdx = lastStreamingIdx(list);
      const last = list[lastIdx];
      const next: ChatMsg = {
        kind: 'system',
        system_kind: 'error',
        text: str(ev.text) || 'The turn ended without a reply.',
        ts: strOrUndef(ev.ts),
      };
      // The turn is dead, so its half-written bubble must stop claiming to
      // be alive. Both branches used to append only; the bubble stayed
      // `streaming` forever and `buildStream` (which takes ANY streaming
      // assistant as the live one) kept painting it at the bottom with a
      // STOP button, over every later message (jev-clone, 2026-09-27).
      if (last && last.kind === 'assistant' && last.streaming) {
        return { op: 'patch-append', index: lastIdx, fields: { streaming: false }, msg: next };
      }
      return { op: 'append', msg: next };
    }

    // ES-1 — "new code client from here": a divider, persisted by the
    // daemon, that does NOT end the turn (the turn it announces is starting).
    case 'chat.notice':
      return {
        op: 'append',
        msg: { kind: 'system', system_kind: 'divider', text: str(ev.text) || '', ts: strOrUndef(ev.ts) },
      };

    case 'chat.cancelled': {
      const lastIdx = lastStreamingIdx(list);
      const last = list[lastIdx];
      if (last && last.kind === 'assistant' && last.streaming) {
        return { op: 'patch', index: lastIdx, fields: { streaming: false, cancelled: true } };
      }
      return { op: 'none' };
    }

    // BT-17 — a delegation: ONE card per request_id in the parent's
    // thread, updated in place by sent / progress / amended / report.
    case 'delegate.sent':
    case 'delegate.progress':
    case 'delegate.amended':
    case 'delegate.report':
      return applyDelegation(list, ev);

    default:
      // py-1.11.0 Phase 2 — legacy `chat.archived` / `chat.unarchived`
      // were removed from the daemon's broadcast set; the snapshot.v1
      // path uses `conv.archived` / `conv.unarchived` instead.
      return { op: 'none' };
  }
}

function delegationMsg(card: NonNullable<ChatMsg['delegation']>): ChatMsg {
  return { kind: 'system', system_kind: 'delegation', text: '', ts: card.ts, delegation: card };
}

/** Fold a `delegate.*` event into the card(s) it is about. A report that
 *  answers several merged briefs updates every one of their cards. */
function applyDelegation(list: readonly ChatMsg[], ev: DaemonEvent): ChatEventPatch {
  if (!isDelegationEvent(ev.type)) return { op: 'none' };
  const ids = requestIdsOf(ev);
  if (ids.length === 0) return { op: 'none' };
  const hits: Array<{ index: number; msg: ChatMsg }> = [];
  list.forEach((m, index) => {
    const rid = m.delegation?.request_id;
    if (rid && ids.includes(rid)) hits.push({ index, msg: m });
  });
  if (hits.length === 0) {
    const card = applyDelegationEvent(null, ids[0]!, ev);
    return card ? { op: 'append', msg: delegationMsg(card) } : { op: 'none' };
  }
  if (hits.length === 1) {
    const h = hits[0]!;
    const card = applyDelegationEvent(h.msg.delegation!, h.msg.delegation!.request_id, ev);
    return card ? { op: 'patch', index: h.index, fields: { delegation: card, ts: card.ts } } : { op: 'none' };
  }
  const next = list.slice();
  for (const h of hits) {
    const card = applyDelegationEvent(h.msg.delegation!, h.msg.delegation!.request_id, ev);
    if (card) next[h.index] = { ...h.msg, delegation: card, ts: card.ts };
  }
  return { op: 'set', list: next };
}

/**
 * Prepend an older history page to the loaded list. A delegation that
 * straddles the page boundary has a card on BOTH sides (the older page
 * saw `sent`, the newer one `report`): keep one, at the older position
 * (where the delegation started), carrying what both know.
 */
export function mergeDelegationCards(older: ChatMsg[], newer: ChatMsg[]): ChatMsg[] {
  const olderById = new Map<string, number>();
  older.forEach((m, i) => {
    if (m.delegation) olderById.set(m.delegation.request_id, i);
  });
  if (olderById.size === 0) return [...older, ...newer];
  const head = older.slice();
  const tail: ChatMsg[] = [];
  for (const m of newer) {
    const i = m.delegation ? olderById.get(m.delegation.request_id) : undefined;
    if (i === undefined) {
      tail.push(m);
      continue;
    }
    const card = mergeCards(head[i]!.delegation!, m.delegation!);
    head[i] = { ...head[i]!, delegation: card, ts: card.ts };
  }
  return [...head, ...tail];
}

/** Apply a patch to a plain array (the cached-slice sink). Returns the
 *  same reference when the patch is a no-op. */
export function applyPatchToList(list: ChatMsg[], patch: ChatEventPatch): ChatMsg[] {
  if (patch.op === 'append') return [...list, patch.msg];
  if (patch.op === 'patch') {
    const prev = list[patch.index];
    if (!prev) return list;
    const next = list.slice();
    next[patch.index] = { ...prev, ...patch.fields };
    return next;
  }
  if (patch.op === 'set') return patch.list;
  if (patch.op === 'patch-append') {
    const prev = list[patch.index];
    const next = list.slice();
    if (prev) next[patch.index] = { ...prev, ...patch.fields };
    return [...next, patch.msg];
  }
  return list;
}
