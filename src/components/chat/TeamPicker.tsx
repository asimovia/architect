/**
 * TeamPicker — BT-5 (base-team). What ＋ opens: the project's team, in the
 * middle of the chat wall.
 *
 * Operator, 2026-09-28: *"arriba ponemos por defecto crea un arquitecto que
 * es capaz de gestionar a todos los demás y si la persona quiere crear a uno
 * de los de abajo específico, que lo haga"*. The simple path is one click on
 * the Architect; the rest are there for whoever wants a second agent working
 * in parallel on a specific profile.
 *
 * Replaces ATM7's "＋ silently creates a developer draft" and the member
 * combo that draft carried in its header until the first message.
 */

import { For, Show, createMemo, onCleanup, onMount } from 'solid-js';
import { chatStore } from '~/state/chat';
import { teamStore } from '~/state/team';
import { teamPicker } from '~/state/team-picker';
import { DEFAULT_EFFORT } from '~/lib/models';
import type { TeamMember } from '~/lib/daemon-client';

const ARCHITECT_IDS = new Set(['a01', 'architect', 'architect-master']);

function start(m: TeamMember, module: string | null): void {
  const conv = chatStore.createConv({
    type: 'custom',
    title: m.title || m.name,
    model: m.model,
    effort: m.effort ?? DEFAULT_EFFORT,
    member: m.id,
    scope: { module },
  });
  // The whole engine travels with the member: a Muse card must open a
  // Muse conv, not claude-code with Muse's model id.
  chatStore.setConvMember(conv, m.id, {
    client: m.client ?? 'claude-code',
    provider: m.provider,
    model: m.model,
    effort: m.effort,
  });
  teamPicker.close();
}

export default function TeamPicker() {
  const lead = createMemo(() => teamStore.state.list.find((m) => ARCHITECT_IDS.has(m.id)));
  const rest = createMemo(() => teamStore.state.list.filter((m) => m.id !== lead()?.id));

  onMount(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') teamPicker.close(); };
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
  });

  const engine = (m: TeamMember): string => [m.client ?? 'claude-code', m.model || 'default'].join(' · ');

  return (
    <div class="flex-1 min-h-0 overflow-y-auto flex justify-center p-6">
      <div class="w-full max-w-xl flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-gray-100">New agent</h2>
          <button
            type="button"
            onClick={() => teamPicker.close()}
            class="text-[11px] text-gray-500 hover:text-gray-200"
            title="Close (Esc)"
          >close ✕</button>
        </div>

        <Show
          when={teamStore.state.list.length > 0}
          fallback={<p class="text-[12px] text-gray-500">{teamStore.state.hydrated ? 'This project has no team members. Add one in the Team tab.' : 'Loading the team…'}</p>}
        >
          <Show when={lead()}>
            {(m) => (
              <button
                type="button"
                autofocus
                onClick={() => start(m(), teamPicker.module())}
                class="text-left rounded-lg border border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/15 px-4 py-3 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
              >
                <div class="flex items-center gap-2">
                  <span aria-hidden="true">{m().emoji}</span>
                  <span class="font-semibold text-gray-100">{m().title || m().name}</span>
                  <span class="ml-auto text-[10px] uppercase tracking-wider text-emerald-300">recommended</span>
                </div>
                <p class="mt-1 text-[12px] text-gray-300 leading-snug">
                  {m().summary || 'Coordinates the rest of the team.'} Give it the goal; it hands each step to the right teammate.
                </p>
                <p class="mt-1 text-[10px] font-mono text-gray-500">{engine(m())}</p>
              </button>
            )}
          </Show>

          <Show when={rest().length > 0}>
            <div class="text-[11px] text-gray-500 mt-2">
              Or work with one profile directly — useful to run two things at once.
            </div>
            <div class="flex flex-col gap-1.5">
              <For each={rest()}>
                {(m) => (
                  <button
                    type="button"
                    onClick={() => start(m, teamPicker.module())}
                    class="text-left rounded-md border border-gray-800 hover:border-gray-600 bg-gray-900/40 px-3 py-2 focus:outline-none focus:border-gray-500"
                  >
                    <div class="flex items-center gap-2">
                      <span aria-hidden="true">{m.emoji}</span>
                      <span class="text-[13px] text-gray-100">{m.title || m.name}</span>
                      <Show when={m.exposure === 'external'}>
                        <span class="text-[10px] px-1 rounded border border-sky-500/40 text-sky-300">public</span>
                      </Show>
                      <span class="ml-auto text-[10px] font-mono text-gray-500">{engine(m)}</span>
                    </div>
                    <Show when={m.summary}>
                      <p class="mt-0.5 text-[11px] text-gray-400 leading-snug">{m.summary}</p>
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
