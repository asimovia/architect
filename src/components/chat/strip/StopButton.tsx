/**
 * StopButton — V107.20, the persistent STOP for a working agent.
 *
 * ES-9 (2026-09-27) — it lives under the composer now, bottom-right, not
 * in the header: the operator's eyes are on the moving thread and the box
 * they type in, and that is where "stop, now" belongs. It pulses while it
 * is there. And "STOP ALL" now means all: a coordinating agent's turn AND
 * the subagents it is waiting on. It used to cancel only its own turn
 * while the label promised more.
 *
 * The inline ■ stop on a bubble only shows while a streaming assistant
 * bubble is on screen. But the agent stays live through tool calls, file
 * edits and subagent coordination — moments with no bubble where the
 * operator may well want to halt. This button reads the daemon's own
 * `live` / `coordinating` (via `isConvWorking`), so it mirrors ground
 * truth rather than the local streaming flag.
 */

import { createSignal } from 'solid-js';
import { chatStore } from '~/state/chat';
import { daemonStore } from '~/state/daemon';
import { log } from '~/lib/log';

export default function StopButton(props: { conv: string }) {
  const [stopping, setStopping] = createSignal(false);
  const snap = () => chatStore.state.convs[props.conv] ?? null;
  const waitingOn = (): string[] => snap()?.waiting_on ?? [];
  const label = (): string => (waitingOn().length ? 'STOP ALL' : 'STOP');
  const title = (): string => {
    if (waitingOn().length) {
      return `Stops this agent AND the ${waitingOn().length} subagent(s) it is waiting on (${waitingOn().join(', ')})`;
    }
    return 'Stop this turn — sends SIGTERM to the agent process. Any tool call already in flight '
      + '(file write, bash) may finish before the kill lands.';
  };
  const onStop = async (): Promise<void> => {
    const client = daemonStore.state.client;
    if (!client) return;
    setStopping(true);
    try {
      const targets = [props.conv, ...waitingOn()];
      const results = await Promise.all(targets.map((c) => client.chatCancel(c)));
      results.forEach((r, i) => {
        if (!r.ok) log.warn('[stop] /chat/cancel failed', { conv: targets[i], status: r.status });
      });
    } finally {
      // Hold "stopping…" for ~1 s so the operator gets visible feedback
      // before the live signal flips off over WS.
      setTimeout(() => setStopping(false), 1000);
    }
  };
  return (
    <button
      type="button"
      onClick={() => { void onStop(); }}
      disabled={stopping()}
      title={title()}
      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono uppercase tracking-wider text-red-200 bg-red-500/15 border border-red-500/50 hover:bg-red-500/25 hover:border-red-500/70 active:bg-red-500/35 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-wait animate-pulse-soft hover:animate-none"
    >
      <span class="inline-block w-1.5 h-1.5 rounded-sm bg-red-300" aria-hidden="true" />
      {stopping() ? 'stopping…' : label()}
    </button>
  );
}
