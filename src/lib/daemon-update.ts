/**
 * daemon-update.ts — BT-18. A daemon that is merely BEHIND (meets the
 * minimum, older than what this cockpit ships against) is compatible: it
 * must never lock the operator out. The self-update is refused with 409
 * while a chat turn runs — which is exactly when the operator most needs
 * the project (mf27, 2026-09-28: the Architect's own turn locked the
 * Architect out). So: let them in, say the update is pending, retry when
 * the daemon goes idle and on a timer.
 *
 * Pure: no imports, so `node --test` runs it as is.
 */

/** The manual fallback for the ONE shared machine daemon (standard v28,
 *  W4). Restarting it boots through the self-update, which pulls the
 *  current signed release. Never a per-project `.meshkore/scripts/daemon.py`
 *  download — member projects have no daemon of their own. */
export const SHARED_DAEMON_RESTART_CMD = 'cd meshkore-server && make restart';

/** How often a pending/failed update is retried even without an idle signal. */
export const RETRY_EVERY_MS = 60_000;

/** A refusal because the daemon is busy, not because it can't update. */
export function isBusyRefusal(status: number, body?: string | null): boolean {
  if (status === 409) return true;
  return /turn in progress|busy/i.test(body ?? '');
}

/** "the Architect", "developer", "the Architect and developer", "3 agents". */
export function busyWho(names: readonly string[]): string {
  const uniq = [...new Set(names.filter((n) => n.trim()))];
  if (uniq.length === 0) return 'the running turn';
  if (uniq.length === 1) return uniq[0]!;
  if (uniq.length === 2) return `${uniq[0]} and ${uniq[1]}`;
  return `${uniq.length} agents`;
}

export function pendingLine(names: readonly string[]): string {
  const who = busyWho(names);
  const verb = names.length > 1 && who !== 'the running turn' ? 'finish their turns' : 'finishes its turn';
  return who === 'the running turn'
    ? 'Daemon update pending — it applies automatically when the running turn finishes'
    : `Daemon update pending — it applies automatically when ${who} ${verb}`;
}

export type UpdatePhase = 'idle' | 'updating' | 'pending' | 'failed' | 'disabled';

/** Should the banner fire `/self-update` now? */
export function shouldRetry(s: {
  phase: UpdatePhase;
  liveCount: number;
  lastTryAt: number;
  now: number;
}): boolean {
  if (s.phase === 'disabled' || s.phase === 'idle') return false;
  const since = s.now - s.lastTryAt;
  // Busy: the moment nothing is live is the moment it can apply.
  if (s.phase === 'pending' && s.liveCount === 0 && since >= 2_000) return true;
  // Anything else stuck (failed, an update that never re-attached,
  // pending with a turn that never ends): periodic retry.
  return since >= RETRY_EVERY_MS;
}
