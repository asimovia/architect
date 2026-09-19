/**
 * lib/stream-core.ts — pure conv→render-list mapping (leaf module).
 *
 * `buildStream` / `groupAutonomous` lived in `chat-stream.ts`, unreachable
 * from the maintained test harness: `node --test` runs with native TS
 * stripping and no `~` alias, so only leaf modules (relative imports,
 * type-only `~`) can be imported by tests. This module keeps exactly those
 * constraints — the daemon predicates arrive as parameters — so the
 * regression test next to it actually runs. `chat-stream.ts` stays as the
 * thin adapter that wires the real predicates and re-exports this API.
 */

import type { ChatMsg } from '../state/chat/types';
import type { DaemonEvent } from '~/lib/daemon-client';

export type StreamItem =
  | { kind: 'msg'; ts: string; msg: ChatMsg; prepend?: boolean }
  | { kind: 'tool'; ts: string; ev: DaemonEvent }
  | { kind: 'task'; ts: string; ev: DaemonEvent };

/** A render segment for the autonomous (continuous-timeline) layout: a
 *  `run` is consecutive agent finals shown under ONE header; an operator
 *  `msg` (or a tool/task event) breaks the run and renders standalone. */
export type AutoSegment =
  | { kind: 'run'; msgs: ChatMsg[] }
  | { kind: 'msg'; msg: ChatMsg }
  | { kind: 'tool'; ev: DaemonEvent }
  | { kind: 'task'; ev: DaemonEvent };

/**
 * T-chat-images-flicker — STABLE WRAPPER IDENTITIES.
 *
 * ChatThread renders `pre` through Solid's `<For>`, which reconciles rows
 * by item identity (`===`). Minting a fresh wrapper per message on every
 * recompute made EVERY daemon event (each streaming delta, each page
 * prepend) destroy and recreate every row's DOM — each `<img>` refetched
 * its upload and sat blank until the fetch completed ("images disappear
 * when scrolled up, reappear after a while").
 *
 * Wrappers are therefore memoized per message object: unchanged messages
 * keep their wrapper (and their `<img>` node) across recomputes; only
 * genuinely new rows mount fresh nodes. WeakMaps, so entries die with
 * their ChatMsg key — the windowed convMap cap bounds this memory too.
 * `run` segments stay fresh: they only ever hold assistant finals, and no
 * bubble renders attachments for those (AttachmentGrid lives in UserBubble).
 */
const preItems = new WeakMap<ChatMsg, StreamItem>();
const queuedItems = new WeakMap<ChatMsg, StreamItem>();
const singleSegs = new WeakMap<ChatMsg, AutoSegment>();
const evSegs = new WeakMap<DaemonEvent, AutoSegment>();
/** Last merged-queued bubble: its msg is rebuilt per recompute, so it
 *  stabilises on (source msg, merged text) instead of object identity. */
let mergedCache: { src: ChatMsg; text: string; item: StreamItem } | null = null;

function preItem(m: ChatMsg): StreamItem {
  const ts = m.ts ?? '';
  const hit = preItems.get(m);
  if (hit && hit.kind === 'msg' && hit.ts === ts && hit.msg === m && !hit.prepend) return hit;
  const it: StreamItem = { kind: 'msg', ts, msg: m };
  preItems.set(m, it);
  return it;
}

function queuedItem(m: ChatMsg): StreamItem {
  const ts = m.ts ?? '';
  const hit = queuedItems.get(m);
  if (hit && hit.kind === 'msg' && hit.ts === ts && hit.msg === m && hit.prepend) return hit;
  const it: StreamItem = { kind: 'msg', ts, msg: m, prepend: true };
  queuedItems.set(m, it);
  return it;
}

function singleSeg(m: ChatMsg): AutoSegment {
  const hit = singleSegs.get(m);
  if (hit && hit.kind === 'msg' && hit.msg === m) return hit;
  const seg: AutoSegment = { kind: 'msg', msg: m };
  singleSegs.set(m, seg);
  return seg;
}

function evSeg(ev: DaemonEvent, kind: 'tool' | 'task'): AutoSegment {
  const hit = evSegs.get(ev);
  if (hit && hit.kind === kind && (hit.kind === 'tool' || hit.kind === 'task') && hit.ev === ev) return hit;
  const seg: AutoSegment = kind === 'tool' ? { kind: 'tool', ev } : { kind: 'task', ev };
  evSegs.set(ev, seg);
  return seg;
}

/** Group an autonomous conv's ordered stream into a continuous timeline:
 *  consecutive assistant finals coalesce into one `run`; the live bubble
 *  tails the final run; an operator message / tool / task flushes the run
 *  and renders on its own (so the next agent output starts a fresh run). */
export function groupAutonomous(pre: StreamItem[], live: ChatMsg | null): AutoSegment[] {
  const out: AutoSegment[] = [];
  let run: ChatMsg[] | null = null;
  const flush = (): void => {
    if (run && run.length) out.push({ kind: 'run', msgs: run });
    run = null;
  };
  for (const it of pre) {
    if (it.kind === 'msg') {
      if (it.msg.kind === 'assistant') {
        (run ??= []).push(it.msg);
      } else {
        flush();
        out.push(singleSeg(it.msg));
      }
    } else if (it.kind === 'tool') {
      flush();
      out.push(evSeg(it.ev, 'tool'));
    } else {
      flush();
      out.push(evSeg(it.ev, 'task'));
    }
  }
  if (live) (run ??= []).push(live);
  flush();
  return out;
}

export function buildStream(
  conv: string,
  msgs: ChatMsg[],
  isAutonomous: (c: string) => boolean,
  isWake: (m: ChatMsg) => boolean,
): {
  pre: StreamItem[]; queued: StreamItem[]; live: ChatMsg | null;
} {
  const autonomous = isAutonomous(conv);
  const liveIdx = msgs.findIndex((m) => m.kind === 'assistant' && m.streaming);
  const live: ChatMsg | null = liveIdx >= 0 ? msgs[liveIdx]! : null;

  const pre: StreamItem[] = [];
  let queued: StreamItem[] = [];

  // A-QUEUE-ORDER-01 (revised 2026-06-17) — a user message is "queued ·
  // merges into next turn" ONLY when there is an ACTUAL live streaming
  // bubble AND the message sits AFTER it in convMap order (a trailing,
  // not-yet-answered message). Using array position (`i > liveIdx`) — not
  // a ts comparison, and NOT the daemon's sticky convs[].live / pendingReply
  // flags. The earlier daemon-authoritative version regressed: those flags
  // linger after a turn finalizes (py-1.17.0 finalizes promptly), so an
  // ALREADY-ANSWERED message kept the "queued" badge and rendered BELOW its
  // own response (operator field 2026-06-17). No live bubble ⇒ nothing is
  // queued; trailing messages just flow in sequence and trigger the next turn.
  msgs.forEach((m, i) => {
    if (i === liveIdx) return;
    // Autonomous convs: hide the daemon→agent wake plumbing entirely
    // (the agent summarises the outcome in its own terse event line).
    if (autonomous && isWake(m)) return;
    // Autonomous convs never HOIST an operator message above the live
    // output ("queued · merges into next turn"). The operator's co-direction
    // message renders INLINE in chronological order — it's the natural break
    // that ends the current run and starts a fresh agent header after it.
    if (!autonomous && live && m.kind === 'user' && i > liveIdx) {
      queued.push(queuedItem(m));
    } else {
      pre.push(preItem(m));
    }
  });

  // 2026-06-10 case 1 — collapse multiple QUEUED user bubbles into a
  // single growing bubble whose text is the concatenation (`\n\n` separator).
  // Mirrors the daemon-side merge-on-arrival in `ChatSessions.queue`
  // (py-1.12.20): the agent sees one continuous message, the operator
  // sees one growing bubble. Operator: "Si mandamos otro mientras hay
  // uno en espera, añadimos el texto, con una linea en medio, para que
  // se vea que es otro párrafo."
  if (queued.length > 1 && queued.every((x) => x.kind === 'msg' && x.msg.kind === 'user')) {
    const first = queued[0]!;
    if (first.kind === 'msg') {
      const mergedText = queued
        .map((x) => (x.kind === 'msg' ? (x.msg.text ?? '') : ''))
        .filter((t) => t.length > 0)
        .join('\n\n');
      // The merged msg is rebuilt per recompute, so its wrapper stabilises
      // on (source msg, merged text): same inputs ⇒ same node, no <img> blink.
      if (!mergedCache || mergedCache.src !== first.msg || mergedCache.text !== mergedText) {
        mergedCache = {
          src: first.msg,
          text: mergedText,
          item: {
            kind: 'msg',
            ts: first.ts,
            prepend: true,
            msg: { ...first.msg, text: mergedText },
          },
        };
      }
      queued = [mergedCache.item];
    }
  }

  pre.sort((a, b) => a.ts.localeCompare(b.ts));
  return { pre, queued, live };
}
