/**
 * JobsHeader — title row of the Jobs zone. Mirrors CronsHeader's shape
 * (title + one-line explanation + counters + back to Architect) so the
 * two process zones read as siblings.
 */

import { Show } from 'solid-js';
import { uiStore } from '~/state/ui';

export default function JobsHeader(props: {
  total: number;
  running: number;
  onNew: () => void;
  newOpen: boolean;
  disabled: boolean;
}) {
  return (
    <header class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-lg font-bold text-gray-100">Jobs</h1>
        <p class="text-xs text-gray-500 mt-0.5">
          Long-lived processes the daemon owns — they survive this browser.
          Any agent can start one; <span class="font-mono text-gray-400">Crons</span> are
          schedules, jobs are processes.
        </p>
      </div>
      <div class="flex items-center gap-2 text-[11px] font-mono flex-shrink-0 whitespace-nowrap">
        <Show when={props.total > 0}>
          <span class="px-2 py-1 rounded-md bg-gray-900/60 border border-gray-800 text-gray-400">
            {props.running} / {props.total} running
          </span>
        </Show>
        <button
          type="button"
          onClick={props.onNew}
          disabled={props.disabled}
          class="px-2 py-1 rounded-md bg-gray-900/60 border border-gray-800 text-gray-300 hover:text-gray-100 hover:border-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {props.newOpen ? '× cancel' : '+ new job'}
        </button>
        <button
          type="button"
          onClick={() => uiStore.setActiveZone('architect')}
          class="px-2 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
        >
          ← Architect
        </button>
      </div>
    </header>
  );
}
