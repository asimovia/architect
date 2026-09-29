/**
 * DelegationBubble — BT-17. One compact card per delegated brief in the
 * PARENT's thread: who got it, which task, a live status, the latest
 * short summary. Updated in place by `delegate.*` events (see
 * `lib/delegation.ts`); clicking opens the child's own thread, which is
 * where the detail lives. The parent only ever gets summaries.
 */

import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { chatStore, type ChatMsg } from '~/state/chat';
import {
  cardTitle,
  isFinished,
  shortCommit,
  statusLabel,
  type DelegationCard,
  type DelegationStatus,
} from '~/lib/delegation';
import { progressLabel } from '~/lib/turn-progress';
import { formatBubbleTs } from './format';
import { AgentRack, type RackState } from './AgentRack';

const PILL: Record<DelegationStatus, string> = {
  working: 'text-emerald-200 border-emerald-500/40 bg-emerald-500/10',
  success: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/5',
  partial: 'text-amber-200 border-amber-500/40 bg-amber-500/10',
  failed: 'text-red-200 border-red-500/40 bg-red-500/10',
  blocked: 'text-amber-200 border-amber-500/40 bg-amber-500/10',
};

/** `no_report` — neutral, not red: the outcome is unknown, not a failure. */
const NO_REPORT_PILL = 'text-gray-300 border-gray-500/40 bg-gray-500/10';

function rackState(c: DelegationCard): RackState {
  if (c.no_report) return 'unknown';
  if (c.status === 'working') return 'working';
  if (c.status === 'success') return 'success';
  if (c.status === 'failed') return 'failed';
  return 'partial';
}

/** The child's own live activity line, while its turn runs. 1 s tick so
 *  the durations keep moving between the daemon's frames. */
function useChildAction(card: () => DelegationCard): () => string | null {
  const [nowMs, setNowMs] = createSignal(Date.now());
  onMount(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 1000);
    onCleanup(() => clearInterval(iv));
  });
  return () => {
    const c = card();
    if (isFinished(c) || !c.child_conv) return null;
    return progressLabel(chatStore.state.turnProgress[c.child_conv], nowMs());
  };
}

export function DelegationBubble(props: { msg: ChatMsg }) {
  const card = (): DelegationCard => props.msg.delegation!;
  const action = useChildAction(card);
  const open = (): void => {
    const child = card().child_conv;
    if (child) chatStore.setActiveConv(child);
  };
  const commit = (): string | undefined => shortCommit(card().commit);
  return (
    <div class="pl-2 pr-2" style={{ 'font-size': 'var(--fs-chat)' }}>
      <button
        type="button"
        onClick={open}
        disabled={!card().child_conv}
        title={card().child_conv ? `Open ${card().child_conv}` : undefined}
        class="w-full max-w-[85%] text-left rounded-lg px-2.5 py-2 border border-gray-800 bg-gray-800/25 hover:bg-gray-800/50 hover:border-gray-700 transition-colors disabled:cursor-default flex items-start gap-2.5"
      >
        {/* DLG2 — a status tile instead of a coloured left bar. */}
        <AgentRack state={rackState(card())} title={statusLabel(card().status, !!card().no_report)} />
        <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 min-w-0 text-[12px]">
          <span class="text-gray-500 flex-shrink-0">→ Delegated to</span>
          <span class="font-semibold text-gray-200 truncate">{cardTitle(card())}</span>
          <span
            class={`font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 ${card().no_report ? NO_REPORT_PILL : PILL[card().status]}`}
          >
            {statusLabel(card().status, !!card().no_report)}
          </span>
          <Show when={card().amendments > 0}>
            <span class="text-[10px] text-gray-500 flex-shrink-0">
              amended ×{card().amendments}
            </span>
          </Show>
          <Show when={card().ts}>
            <span class="ml-auto font-mono text-[10px] text-gray-600 flex-shrink-0">
              <time dateTime={card().ts}>{formatBubbleTs(card().ts!)}</time>
            </span>
          </Show>
        </div>
        <Show when={card().brief}>
          <div class="mt-0.5 text-[12px] text-gray-400 truncate">{card().brief}</div>
        </Show>
        <Show
          when={isFinished(card())}
          fallback={
            <Show when={action() ?? card().progress}>
              {(line) => (
                <div class="mt-1 font-mono text-[11px] text-emerald-300/80 truncate">{line()}</div>
              )}
            </Show>
          }
        >
          <Show when={card().summary}>
            <div
              class="mt-1 text-[12.5px] text-gray-300 leading-snug overflow-hidden"
              style={{
                display: '-webkit-box',
                '-webkit-line-clamp': '3',
                '-webkit-box-orient': 'vertical',
                'white-space': 'pre-wrap',
                'word-break': 'break-word',
              }}
            >
              {card().summary}
            </div>
          </Show>
          <Show when={commit()}>
            <div class="mt-1 font-mono text-[10.5px] text-gray-500">commit {commit()}</div>
          </Show>
        </Show>
        </div>
      </button>
    </div>
  );
}

export default DelegationBubble;
