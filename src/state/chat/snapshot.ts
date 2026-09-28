/**
 * state/chat/snapshot.ts — `GET /chat/snapshot` hydration (py-1.11.0,
 * chat-state-rearchitecture).
 *
 * Replaces the per-conv summary map with the daemon's view and seeds
 * everything derived from it — the archived set, convMeta, the rail's
 * working set, mid-turn streaming bubbles, and pending queues — so the
 * rest of the cockpit doesn't have to fork by code path.
 *
 * The daemon is authoritative here: whatever AX3's cached switch-back
 * painted is overwritten, and `convsStale` clears.
 */

import type { ChatConvSummary, ChatQueueItem, ChatSnapshotResponse } from '~/lib/daemon-client';
import { log } from '~/lib/log';
import { parseProgress } from '~/lib/turn-progress';
import { cleanChatText } from '~/lib/chat-sanitize';
import { state, setState, activeClusterId,
  setTurnProgress,
} from './store';
import { saveConvMeta } from './persistence';
import { ONBOARDING_CONV_ID, type ConvMeta } from './types';

/** One brief a member session is holding, from the daemon's open-request
 *  ledger (standard §28.6, py-1.35.19). The rail shows how many there are;
 *  the tooltip names who is waiting. */
export type OpenRequest = {
  id?: string;
  parent_conv?: string;
  parent_label?: string;
  task_id?: string;
  brief?: string;
  at?: string;
};

/** Snapshot fields the daemon added after `ChatConvSummary` was typed. */
type SnapshotConv = ChatConvSummary & {
  open_requests?: OpenRequest[];
  current_turn?: {
    started_at?: string;
    stream_id?: string;
    partial_text?: string;
    // LT-3 (py-1.36.3+) — the same live numbers `conv.progress` carries,
    // so a cockpit that opens onto an already-running turn describes it
    // immediately instead of waiting up to 30 s for the next tick.
    elapsed_secs?: number | null;
    idle_secs?: number | null;
    tool?: string | null;
    tool_secs?: number | null;
    tool_calls_count?: number;
    deltas_seen?: number;
    /** BT-17 — `{tool, target, since}`: what the turn is doing now. */
    current_action?: unknown;
  };
  last_final_stream_id?: string;
  queue?: Array<{ id?: string; text: string; queued_at?: string }>;
};

/** Seed convMeta for unknown convs; heal stale entries against the
 *  daemon for the two fields that silently break dispatch when missing.
 *
 *  `member` matters most: a conv bound server-side before the field was
 *  surfaced here never sent `member`, so `_member_dispatch_prep` never
 *  ran and the member's client/model/provider dial had NO EFFECT on its
 *  chat turns (operator field report 2026-07-13). */
function seedOrHealMeta(c: ChatConvSummary): void {
  const existing = state.convMeta[c.conv];
  if (!existing) {
    const agentId = c.agent_id ?? '';
    setState('convMeta', c.conv, {
      agentId,
      model: 'auto',
      client: c.client ?? undefined,
      provider: c.provider ?? undefined,
      member: c.member ?? undefined,
      type: (c.agent_type ?? 'custom') as ConvMeta['type'],
      title: agentId || c.conv,
      location: { type: 'local' },
    });
    return;
  }
  if (c.agent_id && !existing.agentId) setState('convMeta', c.conv, 'agentId', c.agent_id);
  // The daemon holds the frozen binding, so its member WINS, not just fills
  // a gap: GA-9 renamed `architect-master` → `a01` on disk, and a tab that
  // had cached the old id kept sending it — every turn 400'd with "unknown
  // team member" (jev-clone, 2026-09-27).
  if (c.member && existing.member !== c.member) setState('convMeta', c.conv, 'member', c.member);
  if (c.client && !existing.client) setState('convMeta', c.conv, 'client', c.client);
  if (c.provider && !existing.provider) setState('convMeta', c.conv, 'provider', c.provider);
  // CN10 — heal stale localStorage entries saved with an empty title: without
  // this the rail (title → conv) and the header rendered different fallbacks
  // for the same conv. Seed default matches fresh-meta creation above.
  if (!existing.title?.trim()) setState('convMeta', c.conv, 'title', c.agent_id || c.conv);
}

/**
 * V107.24 — prune ghosts. convMeta lives in localStorage and survives
 * daemon archive/wipe cycles; entries the snapshot doesn't know about
 * are dead. ONBOARDING_CONV_ID is exempt (lazy-created on first message,
 * so the daemon may not have surfaced it yet).
 */
function pruneGhosts(seen: Set<string>): { meta: number; archived: number } {
  let meta = 0;
  for (const cid of Object.keys(state.convMeta)) {
    if (cid === ONBOARDING_CONV_ID || seen.has(cid)) continue;
    setState('convMeta', cid, undefined as unknown as ConvMeta);
    meta += 1;
  }
  let archived = 0;
  for (const cid of Object.keys(state.archivedConvs)) {
    if (cid === ONBOARDING_CONV_ID || seen.has(cid)) continue;
    setState('archivedConvs', cid, undefined as unknown as true);
    archived += 1;
  }
  return { meta, archived };
}

/**
 * Seed `clusterActivity.workingConvs` from the snapshot.
 *
 * 2026-06-10 field report: a cluster with a live conv but no recent
 * delta (a stuck `chat_sessions` slot) showed IDLE in the project rail
 * while the conv view said STOP. The operator's rule: "nunca debe
 * existir un instante en el que un agente está trabajando y no se
 * refleja en todas partes." The set is the union of the snapshot's
 * live/coordinating convs and any deltas seen since.
 */
function seedWorkingConvs(convs: readonly ChatConvSummary[]): void {
  const activeId = activeClusterId();
  if (!activeId) return;
  const fromSnapshot = convs.filter((c) => c.live || c.coordinating).map((c) => c.conv);
  setState('clusterActivity', activeId, (prev) => ({
    lastEventAt: prev?.lastEventAt ?? Date.now(),
    lastReadAt: prev?.lastReadAt ?? 0,
    workingConvs: [...new Set([...(prev?.workingConvs ?? []), ...fromSnapshot])],
  }));
}

/**
 * SRL3 (py-1.13.1) — rehydrate a mid-turn bubble from the snapshot so a
 * refresh during a live turn doesn't leave the operator staring at a
 * STOP button with no output. Subsequent deltas match by stream_id and
 * update the SAME bubble.
 *
 * A-LIVEBUBBLE-01 — never seed a turn the daemon already finalized: a
 * snapshot that raced a final is what stranded the "Recapping progress…"
 * loader. Returns true when a bubble was seeded.
 */
function rehydrateTurn(c: SnapshotConv): boolean {
  const ct = c.current_turn;
  if (!ct || !c.live || !ct.stream_id) return false;
  if (ct.stream_id === c.last_final_stream_id) return false;
  // LT-3 — seed the activity line from the snapshot. `phase` is derived
  // the same way the daemon derives it, so the two sources can't
  // disagree about a turn they both describe.
  if (typeof ct.elapsed_secs === 'number') {
    setTurnProgress(
      c.conv,
      parseProgress(
        {
          elapsed_secs: ct.elapsed_secs,
          idle_secs: ct.idle_secs ?? 0,
          phase: ct.tool ? 'tool' : (ct.idle_secs ?? 0) < 5 ? 'streaming' : 'waiting',
          tool: ct.tool ?? null,
          tool_secs: ct.tool_secs ?? null,
          tool_calls: ct.tool_calls_count ?? 0,
          deltas: ct.deltas_seen ?? 0,
          current_action: ct.current_action,
        },
        Date.now(),
      ),
    );
  }
  const existing = state.convMap[c.conv] ?? [];
  // A delta that beat the snapshot fetch already owns the bubble.
  const hasLive = existing.some(
    (m) => m.kind === 'assistant' && m.streaming && m.stream_id === ct.stream_id,
  );
  if (!hasLive) {
    setState('convMap', c.conv, [
      ...existing,
      {
        kind: 'assistant',
        text: cleanChatText(ct.partial_text || ''),
        streaming: true,
        stream_id: ct.stream_id,
        ts: ct.started_at || new Date().toISOString(),
      },
    ]);
  }
  // Keep "preparing…" up until the next delta overwrites the bubble.
  if (ct.started_at) {
    const startedMs = Date.parse(ct.started_at);
    if (!Number.isNaN(startedMs)) setState('pendingReplyConvs', c.conv, startedMs);
  }
  return true;
}

/** The snapshot carries only PENDING queue items — the head, mid-flight,
 *  is the streaming bubble itself, not a queue entry. */
function rehydrateQueue(c: SnapshotConv): boolean {
  const items = c.queue;
  if (!items || items.length === 0) return false;
  const mapped: ChatQueueItem[] = items.map((q, i) => ({
    id: q.id ?? `q_${i}`,
    text: q.text,
    created_at: q.queued_at || new Date().toISOString(),
    position: i,
    status: 'queued' as const,
  }));
  setState('queues', c.conv, mapped);
  return true;
}

export interface HydrateSnapshotOpts {
  /**
   * AX7 — this payload came from the persistent boot cache
   * (`lib/snapshot-cache`), not the daemon. It paints, but it reuses
   * AX3's `convsStale` flag so the boot gate keeps the "refreshing…"
   * marker up and the real snapshot overwrites it on arrival.
   */
  stale?: boolean;
}

export function hydrateFromSnapshot(
  snap: ChatSnapshotResponse,
  opts: HydrateSnapshotOpts = {},
): void {
  const stale = !!opts.stale;
  const nextConvs: Record<string, ChatConvSummary> = {};
  const nextArchived: Record<string, true> = {};
  const seen = new Set<string>();
  for (const c of snap.convs) {
    nextConvs[c.conv] = c;
    seen.add(c.conv);
    if (c.archived) nextArchived[c.conv] = true;
    seedOrHealMeta(c);
  }
  // Pruning is a DELETION keyed on "the daemon doesn't know this conv",
  // which a cached list cannot establish — a conv created after the last
  // write is simply absent from it. Only the daemon's own view prunes.
  const pruned = stale ? { meta: 0, archived: 0 } : pruneGhosts(seen);

  setState('convs', nextConvs);
  setState('archivedConvs', nextArchived);
  setState('convsHydratedAt', snap.generated_at ?? new Date().toISOString());
  // AX3 — fresh daemon data has landed; the cached copy is no longer
  // what the workspace is painting from.
  setState('convsStale', stale);
  if (!stale) saveConvMeta();

  let rehydratedTurns = 0;
  let rehydratedQueues = 0;
  // A cached payload describes a PREVIOUS session: a turn it calls live
  // has no daemon feeding it, so seeding the working set or a streaming
  // bubble from it would strand a spinner. (The trim drops `current_turn`
  // and `queue` anyway; this is the rule, not just the consequence.)
  if (!stale) {
    seedWorkingConvs(snap.convs);
    for (const c of snap.convs as SnapshotConv[]) {
      if (rehydrateTurn(c)) rehydratedTurns += 1;
      if (rehydrateQueue(c)) rehydratedQueues += 1;
    }
  }

  log.debug('chat.snapshot.v1 hydrated', {
    convs: snap.convs.length,
    live: snap.convs.filter((c) => c.live).length,
    archived: Object.keys(nextArchived).length,
    pruned_meta: pruned.meta,
    pruned_archived: pruned.archived,
    rehydrated_turns: rehydratedTurns,
    rehydrated_queues: rehydratedQueues,
    stale,
  });
}
