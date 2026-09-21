/**
 * state/chat/turn-watchdog.ts — REL1. "Le he dicho arranca y no contesta."
 *
 * The cockpit marks a conv as awaiting a reply the moment it dispatches
 * (`pendingReplyConvs`), and something has to clear it: a delta, a final,
 * a cancel. If none of those ever comes — the CLI process died, the
 * daemon restarted mid-turn, the spawn failed somewhere that never
 * reached a final — the flag stayed set forever and the thread just sat
 * there "preparing…". From the operator's chair that is indistinguishable
 * from an agent ignoring them, which is exactly the report.
 *
 * The daemon now emits `chat.error` for the cases IT can see (py-1.35.27,
 * the reaper). This watchdog covers what the daemon cannot: an old
 * daemon, a daemon that went away mid-turn, or a broadcast that never
 * arrived. Its evidence is the daemon's own liveness answer — a conv
 * that is NOT live with no delta cannot be working on anything — so it
 * never contradicts a turn that is merely slow.
 */

import { state, setState, clearPendingReply } from './store';
import type { ChatMsg } from './types';
import { log } from '~/lib/log';

/** How long a pending turn may look dead before we say so. Long enough
 *  that a spawn + first-token latency never trips it (a cold claude-code
 *  start is a few seconds; muse can take tens), short enough that the
 *  operator is still looking at the screen. */
export const SILENT_TURN_MS = 45_000;
const TICK_MS = 10_000;

let timer: ReturnType<typeof setInterval> | null = null;

function convIsLive(conv: string): boolean {
  const c = state.convs[conv];
  return c?.live === true || c?.coordinating === true;
}

/** One sweep. Exported for tests and for an immediate check on demand. */
export function sweepStalledTurns(now = Date.now()): string[] {
  const stalled: string[] = [];
  for (const [conv, startedAt] of Object.entries(state.pendingReplyConvs)) {
    if (typeof startedAt !== 'number') continue;
    const age = now - startedAt;
    if (age < SILENT_TURN_MS) continue;
    // Any token at all means the turn IS running — leave it alone.
    if (state.lastDeltaTsByConv[conv]) continue;
    // The daemon says something is running for this conv: also leave it.
    if (convIsLive(conv)) continue;
    stalled.push(conv);
    const secs = Math.round(age / 1000);
    const bubble: ChatMsg = {
      kind: 'system',
      system_kind: 'error',
      text:
        `No reply after ${secs}s, and the daemon reports no running turn for this agent — `
        + 'the process died or never started. Nothing was saved on the daemon side: resend to try again.',
      ts: new Date().toISOString(),
    };
    const list = state.convMap[conv] ?? [];
    const last = list[list.length - 1];
    // The daemon's own `chat.error` may have landed first (py-1.35.27+);
    // don't say the same thing twice.
    const alreadyExplained =
      last?.kind === 'system'
      && last?.system_kind === 'error'
      && Date.now() - (last.ts ? Date.parse(last.ts) : 0) < SILENT_TURN_MS;
    if (!alreadyExplained) setState('convMap', conv, [...list, bubble]);
    clearPendingReply(conv);
    log.warn('turn watchdog: no reply and conv not live', { conv, age_ms: age });
  }
  return stalled;
}

/** Start the sweep loop. Idempotent — call it from one always-mounted
 *  component (Header), like the jobs feed. */
export function mountTurnWatchdog(): void {
  if (timer !== null) return;
  timer = setInterval(() => { sweepStalledTurns(); }, TICK_MS);
}

export function stopTurnWatchdog(): void {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}
