/**
 * state/chat/store.ts — the package's private reactive core.
 *
 * Every other module writes through these two bindings; nothing outside
 * `state/chat/` may import this file (the public surface is the
 * `chatStore` facade in `index.ts`).
 */

import { isCurrentEpoch, type ClusterEpoch } from '~/lib/swap-guard';
import type { TurnProgress } from '~/lib/turn-progress';
import { createStore, produce } from 'solid-js/store';
import { createSignal } from 'solid-js';
import { initialChatState, type ChatStoreState } from './types';

const [state, setState] = createStore<ChatStoreState>(initialChatState);
const [activeClusterId, setActiveClusterId] = createSignal<string | null>(null);

export { state, setState, activeClusterId, setActiveClusterId };

// py-1.11.0 — Set while pre-seeding convMap from a `chatConvMessages`
// pagination fetch, so the ingest reducer treats historical messages as
// rehydration (the work-* auto-unarchive guard stays inert, no window
// capping, no pending-reply bookkeeping).
let hydrating = false;

export function isHydrating(): boolean {
  return hydrating;
}

/**
 * FIN1 — streams this tab has seen END (final / error / cancel). A
 * snapshot requested while a turn was live can land AFTER that turn's
 * final; seeding a bubble from it resurrected a finished turn as a
 * "Working…" bubble nothing would ever close (mf27, 2026-10-02: three
 * stacked "Architect · STOP"). Bounded; plain module state, not reactive.
 */
const endedStreams = new Set<string>();
const ENDED_CAP = 500;

export function markStreamEnded(streamId: unknown): void {
  if (typeof streamId !== 'string' || !streamId) return;
  endedStreams.add(streamId);
  if (endedStreams.size > ENDED_CAP) {
    const first = endedStreams.values().next().value;
    if (first !== undefined) endedStreams.delete(first);
  }
}

export function isStreamEnded(streamId: string | null | undefined): boolean {
  return !!streamId && endedStreams.has(streamId);
}

export function setHydrating(value: boolean): void {
  hydrating = value;
}

/** V86p — drop a conv's "preparing…" flag. Shared by the ingest reducer
 *  (first chunk arrived) and dispatch (the POST failed). */
export function clearPendingReply(conv: string): void {
  if (state.pendingReplyConvs[conv] === undefined) return;
  // SDEL1 — a Solid store MERGES an object returned from a setter, so
  // rebuilding without the key deleted nothing; `produce` + delete does.
  setState('pendingReplyConvs', produce((d) => { delete d[conv]; }));
}

/** V89.2 — drop the streaming-idle marker once a turn is over. */
export function clearLastDelta(conv: string): void {
  if (state.lastDeltaTsByConv[conv] === undefined) return;
  // SDEL1 — a Solid store MERGES an object returned from a setter, so
  // rebuilding without the key deleted nothing; `produce` + delete does.
  setState('lastDeltaTsByConv', produce((d) => { delete d[conv]; }));
}

/** LT-3 — record the daemon's live turn progress for a conv. Dropped
 *  frames (an older daemon, a malformed event) are ignored rather than
 *  stored as zeroes: the UI shows nothing sooner than something untrue. */
export function setTurnProgress(conv: string, p: TurnProgress | null): void {
  if (!p) return;
  setState('turnProgress', conv, p);
}

/** Turn over — stop reporting what it was doing. Paired with
 *  `clearLastDelta` on every terminal event. */
export function clearTurnProgress(conv: string): void {
  if (state.turnProgress[conv] === undefined) return;
  // SDEL1 — a Solid store MERGES an object returned from a setter, so
  // rebuilding without the key deleted nothing; `produce` + delete does.
  setState('turnProgress', produce((d) => { delete d[conv]; }));
}

/**
 * Cross-project guard for history loads (mf27, 2026-09-27). Every project's
 * master chat is `_onboarding_v1`, so a history page fetched for project A
 * and written after the operator switched to B lands in B's thread — a
 * brand-new project opened showing MeshKore's conversation. A load is only
 * written when the client it used belongs to the project that is active
 * NOW, and that is still the project active when it was requested.
 */
export function historyLoadIsCurrent(token: ClusterEpoch, clientProject: string | undefined): boolean {
  if (!isCurrentEpoch(token)) return false; // switched (even A → B → A)
  // The client must belong to the project whose chat slice is bound —
  // mid-switch, `daemonStore.client` can still be the previous project's.
  const now = activeClusterId();
  return !clientProject || !now || clientProject === now;
}
