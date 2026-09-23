/**
 * TurnActivityChip — what the working agent is doing, in the header.
 *
 * LT-3 (initiative `long-turns`). The chat bubble shows the same line,
 * but the bubble scrolls away and the header does not: an operator
 * checking on a long job wants the answer without hunting for the
 * bottom of a thread. It sits immediately left of STOP on purpose —
 * "here is what it is doing" and "here is how to end it" are one
 * decision.
 *
 * Renders nothing when the daemon has not reported progress (older than
 * py-1.36.3, or the first seconds of a turn). Showing a guess here would
 * defeat the point of the whole change.
 */

import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { chatStore } from '~/state/chat';
import { isLongRunningWork, progressLabel } from '~/lib/turn-progress';

export default function TurnActivityChip(props: { conv: string }) {
  // Own 1 s clock so the elapsed counter advances between the daemon's
  // 30 s frames instead of stepping half a minute at a time.
  const [nowMs, setNowMs] = createSignal(Date.now());
  onMount(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 1000);
    onCleanup(() => clearInterval(iv));
  });

  const progress = () => chatStore.state.turnProgress[props.conv];
  const label = () => progressLabel(progress(), nowMs());
  const longWork = () => isLongRunningWork(progress(), nowMs());

  return (
    <Show when={label()}>
      {(l) => (
        <span
          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono flex-shrink-0 max-w-[220px]"
          style={{
            color: 'var(--theme-accent-bright, #34d399)',
            background: 'rgba(17,24,39,0.7)',
            border: '1px solid color-mix(in srgb, var(--theme-accent-bright, #34d399) 28%, transparent)',
          }}
          title={
            longWork()
              ? 'Long-running work. Since py-1.36.3 the daemon only cancels a turn that produces no output AND burns no CPU for 20 minutes — taking a long time is not a reason.'
              : 'What this turn is doing right now, reported by the daemon every 30s.'
          }
        >
          <span class="truncate">{l()}</span>
        </span>
      )}
    </Show>
  );
}
