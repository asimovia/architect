/**
 * state/chat/paging.ts — the windowed history loader.
 *
 * A long-lived conv has hundreds of persisted messages. The UI loads the
 * newest INITIAL_PAGE on focus and +PAGE per scroll-up, all the way to the
 * first message (PAGE1); everything loaded stays in memory.
 *
 * The first-page loader lives in `ingest.ts` — it replays history through
 * the same reducer that powers live streaming.
 */

import { captureClusterEpoch } from '~/lib/swap-guard';
import type { DaemonClient, DaemonEvent } from '~/lib/daemon-client';
import { log } from '~/lib/log';
import { state, setState, historyLoadIsCurrent } from './store';
import { historyMsg } from './history-msg';
import { applyChatEvent, applyPatchToList, mergeDelegationCards } from './reducer';
import { isDelegationEvent } from '~/lib/delegation';
import { PAGE, type ChatMsg } from './types';

/** Record the pagination cursor after the first page landed. */
export function setInitialPaging(conv: string, hasMore: boolean, fallbackOldestTs: string): void {
  const list = state.convMap[conv] ?? [];
  const oldest = list[0] ? (list[0].ts ?? '') : fallbackOldestTs;
  setState('paging', conv, {
    hasMore,
    oldestTs: oldest,
    loading: false,
  });
}

/**
 * Load the next older PAGE for `conv` and PREPEND it. No-ops when there
 * is no more history or a fetch is already in flight. Returns how many messages were prepended so the caller can
 * preserve scroll position.
 *
 * The older page is built by hand rather than replayed through the
 * reducer: the reducer appends, and these belong at the front, ahead of
 * a possible live tail.
 */
export async function loadEarlierMessages(client: DaemonClient, conv: string): Promise<number> {
  const p = state.paging[conv];
  if (!p || !p.hasMore || p.loading) return 0;
  const atCluster = captureClusterEpoch();
  if (!historyLoadIsCurrent(atCluster, client.transport.projectId)) return 0;
  setState('paging', conv, 'loading', true);
  const res = await client.chatConvMessages(conv, { before: p.oldestTs, limit: PAGE });
  // Same cross-project guard as the first page (mf27, 2026-09-27).
  if (!historyLoadIsCurrent(atCluster, client.transport.projectId)) {
    setState('paging', conv, 'loading', false);
    return 0;
  }
  if (!res.ok) {
    setState('paging', conv, 'loading', false);
    log.warn('loadEarlierMessages failed', { conv, status: res.status });
    return 0;
  }
  let older: ChatMsg[] = [];
  for (const ev of res.data.messages) {
    const e = ev as DaemonEvent;
    // BT-17 — delegation events fold into cards (one per request_id)
    // through the live reducer instead of mapping one-to-one.
    if (isDelegationEvent(e.type)) {
      older = applyPatchToList(older, applyChatEvent(older, e));
      continue;
    }
    const m = historyMsg(e);
    if (m) older.push(m);
  }
  const next = mergeDelegationCards(older, state.convMap[conv] ?? []);
  setState('convMap', conv, next);
  setState('paging', conv, {
    hasMore: !!res.data.has_more,
    oldestTs: next[0] ? (next[0].ts ?? '') : p.oldestTs,
    loading: false,
  });
  return older.length;
}
