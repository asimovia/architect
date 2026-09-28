/**
 * DaemonUpdateBanner — BT-18. The daemon is BEHIND what this cockpit ships
 * against but still meets the minimum: it is compatible, so the project
 * stays usable and this is a strip across the top, never a wall.
 *
 * Replaces the full-body DaemonBehindPanel. That panel fired
 * `/self-update`, got `409 chat turn in progress` whenever any agent was
 * working, and then blocked the whole project — including the very
 * Architect whose turn was the reason (mf27, 2026-09-28, cockpit 10037
 * vs py-1.40.0). Hard blocks remain only for real incompatibility
 * (`outdated`: below MIN or missing feature flags → DaemonOutdatedPanel;
 * `ahead` → DaemonAheadPanel).
 *
 * Flow: mount → follow a moved daemon, else fire `/self-update` (when
 * cluster.yaml allows it). 409 → "pending", retried the moment no conv
 * is live (from the chat store the WS already keeps current) and every
 * minute regardless. The banner unmounts when the version matches
 * (Cockpit only renders it while `isDaemonBehind`).
 */

import { Show, createEffect, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { daemonStore } from '~/state/daemon';
import { chatStore, ONBOARDING_CONV_ID } from '~/state/chat';
import { EXPECTED_DAEMON_VERSION } from '~/lib/version';
import {
  SHARED_DAEMON_RESTART_CMD,
  isBusyRefusal,
  pendingLine,
  shouldRetry,
  type UpdatePhase,
} from '~/lib/daemon-update';
import { log } from '~/lib/log';

function liveConvNames(): string[] {
  const out: string[] = [];
  for (const c of Object.values(chatStore.state.convs)) {
    if (!c?.live) continue;
    if (c.conv === ONBOARDING_CONV_ID) out.push('the Architect');
    else out.push(chatStore.state.convMeta[c.conv]?.title || c.member || c.agent_id || c.conv);
  }
  return out;
}

export default function DaemonUpdateBanner(): JSX.Element {
  const current = (): string => daemonStore.state.version?.raw ?? '?';
  const [phase, setPhase] = createSignal<UpdatePhase>('idle');
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [showManual, setShowManual] = createSignal(false);
  const [lastTryAt, setLastTryAt] = createSignal(0);
  const [nowMs, setNowMs] = createSignal(Date.now());
  let inFlight = false;

  // A pre-1.14.3 self-update re-execs on a NEW port; follow it rather
  // than firing into a dead one. Kept from DaemonBehindPanel.
  const followMovedDaemon = async (): Promise<boolean> => {
    const cid = daemonStore.state.health?.cluster_id;
    if (!cid) return false;
    try {
      const { findClusterPort } = await import('~/components/projects-rail/discovery');
      const found = await findClusterPort(cid);
      const curPort = daemonStore.state.instances[daemonStore.state.activeId ?? '']?.port;
      if (found && found.port !== curPort) {
        log.info('daemon-update: cluster moved, following', { cid, from: curPort, to: found.port });
        try { localStorage.setItem('meshcore-last-port', String(found.port)); } catch { /* quota */ }
        await daemonStore.switchToPortDetailed(found.port);
        return true;
      }
    } catch (e) {
      log.warn('daemon-update: followMovedDaemon failed', e instanceof Error ? e.message : String(e));
    }
    return false;
  };

  const fireUpdate = async (): Promise<void> => {
    const c = daemonStore.state.client;
    if (!c || inFlight) return;
    inFlight = true;
    setLastTryAt(Date.now());
    setPhase('updating');
    setErrorMsg(null);
    log.info('daemon-update: firing /self-update', { from: current(), to: EXPECTED_DAEMON_VERSION });
    try {
      const r = await c.selfUpdate({});
      if (r.status === 0) {
        // Transport closed: the daemon re-exec'd (or had already moved).
        setTimeout(() => { void followMovedDaemon(); }, 1500);
        return;
      }
      if (!r.ok) {
        if (isBusyRefusal(r.status, r.error ?? r.body)) {
          setPhase('pending');
          return;
        }
        setPhase('failed');
        setErrorMsg(`${r.status}: ${r.error ?? r.body ?? 'unknown'}`);
      }
      // 2xx: re-exec under way; the periodic check catches a hang.
    } catch (e) {
      if (!(await followMovedDaemon())) {
        setPhase('failed');
        setErrorMsg(e instanceof Error ? e.message : String(e));
      }
    } finally {
      inFlight = false;
    }
  };

  onMount(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 5_000);
    onCleanup(() => clearInterval(tick));
    void followMovedDaemon().then((moved) => {
      if (moved) return;
      if (daemonStore.state.autoUpdateEnabled) void fireUpdate();
      else setPhase('disabled');
    });
  });

  // Retry when the daemon goes idle (the chat store's live flags come
  // from the WS turn-end events) and on the periodic tick.
  createEffect(() => {
    const live = liveConvNames().length;
    if (shouldRetry({ phase: phase(), liveCount: live, lastTryAt: lastTryAt(), now: nowMs() })) {
      void fireUpdate();
    }
  });

  const copy = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(SHARED_DAEMON_RESTART_CMD); } catch { /* denied */ }
  };

  const text = (): string => {
    switch (phase()) {
      case 'pending': return pendingLine(liveConvNames());
      case 'failed': return `Daemon update failed (${errorMsg() ?? 'unknown'}) — retrying every minute`;
      case 'disabled': return 'Daemon update available — auto-update is off in cluster.yaml';
      default: return 'Updating the daemon…';
    }
  };

  return (
    <div
      role="status"
      class="border-b border-amber-500/40 bg-amber-500/10 text-amber-100 text-[12px] px-4 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1"
    >
      <span class="font-mono text-amber-300/90 flex-shrink-0">
        ⟳ {current()} → {EXPECTED_DAEMON_VERSION}
      </span>
      <span class="flex-1 min-w-0 truncate">{text()}</span>
      {/* The manual route is a fallback, not a step: offer it only when the
          automatic path cannot finish on its own (operator, 2026-09-28:
          "todos los procesos deberían ser automáticos"). */}
      <Show when={phase() === 'failed' || phase() === 'disabled'}>
      <button
        type="button"
        onClick={() => setShowManual((v) => !v)}
        class="font-mono text-[10px] uppercase tracking-wider text-amber-300 hover:text-amber-100 flex-shrink-0"
      >
        {showManual() ? 'hide' : 'manual'}
      </button>
      </Show>
      <Show when={showManual() && (phase() === 'failed' || phase() === 'disabled')}>
        <div class="w-full flex items-center gap-2 text-[11px] text-gray-300">
          <span class="text-gray-400">In the folder that holds the machine's shared daemon:</span>
          <code class="font-mono text-amber-200 select-all">{SHARED_DAEMON_RESTART_CMD}</code>
          <button
            type="button"
            onClick={() => { void copy(); }}
            class="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200"
          >
            copy
          </button>
          <span class="text-gray-500">(restarting boots through the self-update — see workflow W4)</span>
        </div>
      </Show>
    </div>
  );
}
