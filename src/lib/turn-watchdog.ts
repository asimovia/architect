/**
 * turn-watchdog.ts — TW1. The cockpit checks the daemon's word on turns
 * it believes are running, instead of trusting the last event it saw.
 *
 * A turn's "finished" can be missed: the tab was on another project
 * (events for inactive projects are dropped), the laptop slept, the
 * socket blipped. The thread then ended in a streaming bubble forever —
 * "muse · thinking … turn 53s" for hours over a turn that had finished
 * in six minutes (mf27, 2026-10-01). Every 20 s, while anything looks
 * live, re-read `/chat/snapshot`; a conv the daemon reports idle is
 * settled and its thread reloaded so the real final shows.
 */

import { chatStore } from '~/state/chat';
import { daemonStore } from '~/state/daemon';
import type { DaemonClient, ChatSnapshotResponse } from '~/lib/daemon-client';
import { log } from '~/lib/log';

export const WATCH_EVERY_MS = 20_000;

/** Apply a fresh snapshot and reload the threads of turns it settled.
 *  `reloadActive` (a project switch-back) also re-reads the open thread:
 *  whatever happened while the project was off screen is on disk, and the
 *  cached copy the switch restored may predate it (FIN1). */
export function applySnapshot(
  client: DaemonClient,
  snap: ChatSnapshotResponse,
  opts: { reloadActive?: boolean } = {},
): void {
  const settled = chatStore.hydrateFromSnapshot(snap);
  const reload = new Set(settled.filter((conv) => chatStore.state.convMap[conv]));
  for (const conv of settled) log.info('turn settled from the daemon snapshot', { conv });
  const active = chatStore.state.activeConv;
  if (opts.reloadActive && active && chatStore.state.convMap[active]) reload.add(active);
  for (const conv of reload) void chatStore.loadConvMessagesPage(client, conv);
}

function anythingLooksLive(): boolean {
  const s = chatStore.state;
  if (Object.values(s.convs).some((c) => c.live)) return true;
  if (Object.keys(s.turnProgress).length > 0) return true;
  return Object.values(s.convMap).some((msgs) => msgs?.some((m) => m.kind === 'assistant' && m.streaming));
}

let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;

async function tick(): Promise<void> {
  if (busy || !anythingLooksLive()) return;
  const client = daemonStore.state.client;
  if (!client) return;
  busy = true;
  try {
    const project = client.transport.projectId;
    const res = await client.chatSnapshot(AbortSignal.timeout(5000));
    // A project switch mid-flight: this snapshot is not the screen's.
    if (daemonStore.state.client?.transport.projectId !== project) return;
    if (res.ok) applySnapshot(client, res.data);
    else log.warn('turn watchdog: snapshot failed', { status: res.status });
  } catch (e) {
    log.warn('turn watchdog: snapshot error', { error: e instanceof Error ? e.message : String(e) });
  } finally {
    busy = false;
  }
}

/** Start the watchdog once for the cockpit's lifetime. */
export function startTurnWatchdog(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), WATCH_EVERY_MS);
}
