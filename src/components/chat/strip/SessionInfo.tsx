/**
 * SessionInfo — RUN-2. The ⓘ in the chat header: which project, which
 * agent, which conversation, on which engine, doing what, right now — and
 * one button that copies it as a reference the operator can paste to a
 * debugging agent ("the Architect of MF27 keeps stopping — here it is").
 *
 * Replaces the "Role memory" icon, which the operator no longer used.
 * The text comes from `lib/session-reference` (pure, tested); this file
 * only gathers the live facts and draws the popover.
 */

import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { chatStore } from '~/state/chat';
import { daemonStore } from '~/state/daemon';
import { teamStore } from '~/state/team';
import { resolveDisplayEngine } from '~/lib/member-shadow';
import { COCKPIT_BUILD } from '~/lib/cockpit-version';
import { sessionReference, sessionRows, type SessionFacts } from '~/lib/session-reference';

export default function SessionInfo(props: { conv: string }) {
  const [open, setOpen] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  let root: HTMLDivElement | undefined;

  const facts = (): SessionFacts => {
    const meta = chatStore.state.convMeta[props.conv];
    const snap = chatStore.state.convs[props.conv];
    const health = daemonStore.state.health;
    const engine = resolveDisplayEngine(meta, snap, teamStore.get(meta?.member));
    const state: SessionFacts['state'] = snap?.live ? 'working' : snap?.coordinating ? 'coordinating' : 'idle';
    return {
      projectId: health?.cluster_id ?? '?',
      projectName: health?.cluster_name,
      projectRoot: health?.root,
      conv: props.conv,
      title: meta?.title,
      agentId: meta?.agentId || snap?.agent_id || undefined,
      member: meta?.member ?? snap?.member ?? undefined,
      agentType: snap?.agent_type ?? meta?.type,
      client: engine.client,
      provider: engine.provider,
      model: engine.model,
      effort: engine.effort,
      enginePinned: !!meta?.enginePinned,
      initiative: snap?.initiative_id,
      task: snap?.task_id,
      parentConv: snap?.parent_conv,
      state,
      waitingOn: snap?.waiting_on ?? [],
      daemonVersion: health?.version,
      cockpitBuild: COCKPIT_BUILD,
      now: new Date(),
    };
  };

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(sessionReference(facts()));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the rows are selectable text */
    }
  };

  onMount(() => {
    const onDown = (e: MouseEvent): void => {
      if (open() && root && !root.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    onCleanup(() => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    });
  });

  return (
    <div ref={root} class="relative">
      <button
        type="button"
        onClick={() => setOpen(!open())}
        title="Session — project, agent, engine and what it is doing; copy it as a reference"
        class={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors ${
          open() ? 'border-emerald-500/45 text-emerald-300 bg-emerald-500/10' : 'border-gray-800 text-gray-500 hover:text-gray-200 hover:border-gray-600'
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      <Show when={open()}>
        <div
          role="dialog"
          aria-label="Session reference"
          class="absolute right-0 top-9 z-50 w-[min(34rem,90vw)] rounded-md border border-gray-700/70 bg-[#0b1220] shadow-2xl p-3"
        >
          <div class="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Session</div>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] font-mono select-text">
            <For each={sessionRows(facts())}>
              {([k, v]) => (
                <>
                  <dt class="text-gray-500">{k}</dt>
                  <dd class="text-gray-200 break-all">{v}</dd>
                </>
              )}
            </For>
          </dl>
          <div class="flex items-center justify-between mt-3 pt-2 border-t border-gray-800">
            <span class="text-[11px] text-gray-500">Paste it to Claude to point it at this exact session.</span>
            <button
              type="button"
              onClick={() => { void copy(); }}
              class="px-2.5 py-1 rounded text-[11px] font-mono border border-gray-700 text-gray-200 hover:border-emerald-500/60"
            >
              {copied() ? 'copied ✓' : 'Copy for Claude'}
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
