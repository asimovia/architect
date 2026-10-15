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
// Relative + .ts so `node --test` can load this leaf.
import { parseWake } from './wake-summary.ts';
import { isFinished } from './delegation.ts';

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

/**
 * BT-17 — wake turns whose outcome a FINISHED delegation card already
 * shows. The card is the single place the outcome appears; the
 * "↩ developer finished …" sentence stays only where no card covers it
 * (older daemons emit no `delegate.*`). A wake is covered by the latest
 * card for its child conv that started at or before it — so a later,
 * still-working delegation to the same member never hides an earlier
 * wake it has nothing to do with, and vice versa.
 */
export function wakesCoveredByCards(
  msgs: readonly ChatMsg[],
  isWake: (m: ChatMsg) => boolean,
): Set<ChatMsg> {
  const hidden = new Set<ChatMsg>();
  const cards = msgs.filter((m) => m.delegation?.child_conv);
  if (cards.length === 0) return hidden;
  for (const m of msgs) {
    if (m.kind !== 'user' || !isWake(m)) continue;
    const w = parseWake(m.text);
    if (!w?.conv) continue;
    const wts = m.ts ?? '';
    let best: ChatMsg | null = null;
    for (const c of cards) {
      if (c.delegation!.child_conv !== w.conv) continue;
      const cts = c.delegation!.ts ?? c.ts ?? '';
      if (wts && cts && cts > wts) continue;
      if (!best || (best.delegation!.ts ?? '') <= cts) best = c;
    }
    if (best && isFinished(best.delegation!)) hidden.add(m);
  }
  return hidden;
}

/**
 * WALL1 (mf27, 2026-10-15) — operator messages sent while a turn was running
 * wait for it: the daemon merges them into the NEXT turn. Ordered by send
 * time they landed above the running turn's reply, and the wall showed two
 * Architect headers in a row with the operator's message stranded above
 * both. Returns, for each such message, the ts of the event that closed the
 * turn it waited for; it sorts right after that event. A turn opens on a
 * user message and closes on a final, an error or a cancel.
 */
export function answeredAfter(msgs: readonly ChatMsg[]): Map<ChatMsg, string> {
  const out = new Map<ChatMsg, string>();
  const ordered = msgs.filter((m) => !!m.ts).slice().sort((a, b) => a.ts!.localeCompare(b.ts!));
  let open = false;
  let waiting: ChatMsg[] = [];
  let held: { at: string; msgs: ChatMsg[] } | null = null;
  for (const m of ordered) {
    if (m.kind === 'user') {
      if (open) waiting.push(m);
      else open = true;
      continue;
    }
    // A later reply (or a running turn) is what proves the held messages
    // waited: without one, a turn that left no closing event, or a page cut
    // mid-history, would push the operator's messages down for nothing.
    const replies = m.kind === 'assistant';
    if (held && replies) {
      for (const w of held.msgs) out.set(w, held.at);
      held = null;
    }
    const closes =
      (m.kind === 'assistant' && !m.streaming)
      || (m.kind === 'system' && m.system_kind === 'error');
    if (!closes || !open) continue;
    if (waiting.length) held = { at: m.ts!, msgs: waiting };
    // The waiting messages start the next turn straight away.
    open = waiting.length > 0;
    waiting = [];
  }
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
  // WALL1 — each queued message keeps its own bubble and header: they are
  // merged for the agent, never on the operator's wall.
  const covered = wakesCoveredByCards(msgs, isWake);
  msgs.forEach((m, i) => {
    if (i === liveIdx) return;
    if (covered.has(m)) return;
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

  // WALL1 — a message sent while a turn ran is answered by the NEXT turn,
  // so it reads after the running turn's reply, not before it by send time.
  const waitedFor = answeredAfter(msgs);
  const key = (it: StreamItem): [string, number] => {
    if (it.kind === 'msg') {
      const after = waitedFor.get(it.msg);
      if (after !== undefined) return [after, 1];
    }
    return [it.ts, 0];
  };
  pre.sort((a, b) => {
    const [ta, ra] = key(a);
    const [tb, rb] = key(b);
    return ta === tb ? ra - rb : ta.localeCompare(tb);
  });
  return { pre, queued, live };
}
