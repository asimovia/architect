/**
 * state/chat/store.ts — the package's private reactive core.
 *
 * Every other module writes through these two bindings; nothing outside
 * `state/chat/` may import this file (the public surface is the
 * `chatStore` facade in `index.ts`).
 */

import type { TurnProgress } from '~/lib/turn-progress';
import { createStore } from 'solid-js/store';
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

export function setHydrating(value: boolean): void {
  hydrating = value;
}

/** V86p — drop a conv's "preparing…" flag. Shared by the ingest reducer
 *  (first chunk arrived) and dispatch (the POST failed). */
export function clearPendingReply(conv: string): void {
  if (state.pendingReplyConvs[conv] === undefined) return;
  setState('pendingReplyConvs', (xs) => {
    const { [conv]: _drop, ...rest } = xs;
    return rest;
  });
}

/** V89.2 — drop the streaming-idle marker once a turn is over. */
export function clearLastDelta(conv: string): void {
  if (state.lastDeltaTsByConv[conv] === undefined) return;
  setState('lastDeltaTsByConv', (xs) => {
    const { [conv]: _drop, ...rest } = xs;
    return rest;
  });
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
  setState('turnProgress', (xs) => {
    const { [conv]: _drop, ...rest } = xs;
    return rest;
  });
}
