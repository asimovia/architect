/**
 * The three in-flight states of an agent turn.
 *
 *   ThinkingPlaceholder — streaming started, no text yet.
 *   StreamingTail       — text arriving; shows the last ~6 lines.
 *   StreamingIdleHint   — text present but nothing new for >1.5 s.
 *
 * The verbs rotate every 1.8 s. V105 widened the pool from 6 to 36 so a
 * long pause looks like progress instead of a 3-state loader: a full lap
 * now takes ~65 s.
 *
 * LT-3 (2026-09-23) — the verbs are now the FALLBACK, not the answer.
 * They were invented text: "Reviewing the roadmap…" appeared under an
 * agent that had been inside one `Bash` call for forty minutes driving a
 * training run, and the operator had no way to tell that from a hang.
 * When the daemon sends `conv.progress` (py-1.36.3+) we show what the
 * turn is actually doing instead, and say plainly when the long wait is
 * expected work rather than trouble. The verbs remain for the first
 * seconds of a turn and for daemons that don't report progress — there,
 * "no data yet" is the honest state and a spinner is the right shape
 * for it.
 */

import { Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { chatStore } from '~/state/chat';
import { isLongRunningWork, progressLabel, workSummary } from '~/lib/turn-progress';
import { ensureMarked } from '~/lib/cdn-loaders';
import { colorizeInlineCodeInHtml } from '~/lib/code-colorize';

/**
 * V86p/2026-06-12 — live streaming window, ~6 lines at 12px/1.55. The
 * operator's rule: "mientras trabaja y genera output dejamos ver de 5 a
 * 6 líneas; cuando tenemos el sumario final, se formatea y se presenta
 * completo." The live render stays light — only the final goes through
 * CollapsibleText.
 */
const STREAM_TAIL_HEIGHT_PX = 112;
const VERB_ROTATE_MS = 1800;
const IDLE_HINT_MS = 1500;

const THINKING_VERBS = [
  'Thinking',
  'Working',
  'Researching',
  'Planning',
  'Generating response',
  'Processing',
  'Reading the briefing',
  'Loading context',
  'Consulting role memory',
  'Cross-referencing',
  'Reviewing the roadmap',
  'Parsing the task',
  'Checking dependencies',
  'Inspecting the cluster state',
  'Reading the code',
  'Composing reply',
  'Mapping the modules',
  'Choosing the right sub-agent',
  'Drafting a plan',
  'Coordinating agents',
  'Calling a tool',
  'Verifying the result',
  'Splitting the work',
  'Identifying the scope',
  'Recapping progress',
  'Resolving references',
  'Cross-checking facts',
  'Stitching the answer',
  'Watching the worker',
  'Asking the daemon',
  'Polling for changes',
  'Reviewing the diff',
  'Picking next step',
  'Drafting a summary',
  'Catching its breath',
  'Almost there',
] as const;

/** Index into THINKING_VERBS, advancing on its own interval. */
function useRotatingVerb(): () => string {
  const [idx, setIdx] = createSignal(0);
  onMount(() => {
    const iv = setInterval(() => setIdx((i) => (i + 1) % THINKING_VERBS.length), VERB_ROTATE_MS);
    onCleanup(() => clearInterval(iv));
  });
  return () => THINKING_VERBS[idx()]!;
}

/**
 * LT-3 — the real activity line, or null when the daemon has told us
 * nothing. Re-reads on its own 1 s tick so `turn 12m` keeps counting
 * between the daemon's 30 s frames.
 */
function useProgressLine(conv: () => string | undefined): () => string | null {
  const [nowMs, setNowMs] = createSignal(Date.now());
  onMount(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 1000);
    onCleanup(() => clearInterval(iv));
  });
  return () => {
    const c = conv();
    if (!c) return null;
    return progressLabel(chatStore.state.turnProgress[c], nowMs());
  };
}

/** BT-20 — one summary line of what the turn has done so far. */
function useWorkSummary(conv: () => string | undefined): () => string | null {
  const [nowMs, setNowMs] = createSignal(Date.now());
  onMount(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 5000);
    onCleanup(() => clearInterval(iv));
  });
  return () => {
    const c = conv();
    if (!c) return null;
    return workSummary(chatStore.state.turnProgress[c], nowMs());
  };
}

/** Is this turn deep in work the operator should be told is NORMAL?
 *  Before LT-1 the daemon killed turns at 30 minutes, so a long wait
 *  genuinely did mean trouble; now it does not, and the UI has to stop
 *  implying otherwise. */
function useLongWork(conv: () => string | undefined): () => boolean {
  const [nowMs, setNowMs] = createSignal(Date.now());
  onMount(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 5000);
    onCleanup(() => clearInterval(iv));
  });
  return () => {
    const c = conv();
    if (!c) return false;
    return isLongRunningWork(chatStore.state.turnProgress[c], nowMs());
  };
}

/** The activity line itself: monospace, muted, sitting where the verb
 *  used to. Plus the "still working" reassurance on a long job. */
function ActivityLine(props: { label: string; longWork: boolean }) {
  return (
    <span class="inline-flex items-center gap-1.5 min-w-0">
      <span class="font-mono text-[11px] text-emerald-300/80 truncate">{props.label}</span>
      <Show when={props.longWork}>
        <span
          class="text-[10px] text-gray-500 flex-shrink-0"
          title="Long-running work is expected. The daemon only cancels a turn that produces no output AND burns no CPU for 20 minutes — not one that takes a long time."
        >
          · working, not stuck
        </span>
      </Show>
    </span>
  );
}

function Dots(props: { size: string }) {
  return (
    <span class="inline-flex items-center gap-0.5">
      <span class={`${props.size} rounded-full bg-emerald-400 animate-pulse-soft`} />
      <span class={`${props.size} rounded-full bg-emerald-400 animate-pulse-soft [animation-delay:200ms]`} />
      <span class={`${props.size} rounded-full bg-emerald-400 animate-pulse-soft [animation-delay:400ms]`} />
    </span>
  );
}

/**
 * V89.2 — shown UNDER a streaming bubble that has partial text but has
 * received nothing for >1.5 s, so the operator never stares at frozen
 * text while the agent is mid tool-call. Disappears the instant another
 * delta lands (the store's last-delta stamp bumps).
 */
export function StreamingIdleHint(props: { conv: string }) {
  const [nowMs, setNowMs] = createSignal(Date.now());
  const verb = useRotatingVerb();
  onMount(() => {
    // Own 500 ms wall-clock so the threshold check stays reactive
    // without a global ticker.
    const tick = setInterval(() => setNowMs(Date.now()), 500);
    onCleanup(() => clearInterval(tick));
  });
  const idleMs = (): number => {
    const last = chatStore.state.lastDeltaTsByConv[props.conv];
    if (typeof last !== 'number') return 0;
    return nowMs() - last;
  };
  const line = useProgressLine(() => props.conv);
  const longWork = useLongWork(() => props.conv);
  return (
    <Show when={idleMs() > IDLE_HINT_MS}>
      <div class="flex items-center gap-2 text-emerald-300/70 italic text-[12px] mt-1.5 min-w-0">
        <Dots size="w-1 h-1" />
        <Show when={line()} fallback={<span>{verb()}…</span>}>
          {(l) => <ActivityLine label={l()} longWork={longWork()} />}
        </Show>
      </div>
    </Show>
  );
}

/** V86s — the body of a streaming bubble that has no text yet.
 *
 *  LT-3 — this is where a turn spends its long silences (a tool call
 *  produces no assistant text at all), so it is the single most
 *  important place for the real activity line. `conv` is optional: the
 *  PreparingBubble renders before a conv-scoped turn exists. */
export function ThinkingPlaceholder(props: { conv?: string } = {}) {
  const verb = useRotatingVerb();
  const line = useProgressLine(() => props.conv);
  const longWork = useLongWork(() => props.conv);
  const summary = useWorkSummary(() => props.conv);
  return (
    <div class="flex flex-col gap-0.5 min-w-0">
      <div class="flex items-center gap-2 text-emerald-300/90 italic min-w-0">
        <Dots size="w-1.5 h-1.5" />
        <Show
          when={line()}
          fallback={<span class="transition-opacity duration-300">{verb()}…</span>}
        >
          {(l) => <ActivityLine label={l()} longWork={longWork()} />}
        </Show>
      </div>
      {/* BT-20 — what it has done so far, in one faded line. */}
      <Show when={summary()}>
        {(t) => <span class="pl-[18px] font-mono text-[11px] text-gray-500 truncate">{t()}</span>}
      </Show>
    </div>
  );
}

/**
 * Live preview clipped to the last few lines: `column-reverse` plus
 * `overflow:hidden` keeps the BOTTOM of overflowing content visible.
 *
 * V105 — rendered as markdown live, same `.chat-md` styling as the final
 * view, so the streaming → final transition is visually invisible.
 * Unclosed tokens (mid-table, mid-fence) marked treats as plain text, so
 * flicker is minimal. V106.2 — a top mask fades the clip so a half-cut
 * line dissolves instead of being chopped.
 */
export function StreamingTail(props: { text: string }) {
  const [html, setHtml] = createSignal<string>('');
  createEffect(() => {
    const t = props.text;
    void ensureMarked().then((m) => {
      try {
        setHtml(colorizeInlineCodeInHtml(m.parse(t, { gfm: true })));
      } catch {
        // marked does not throw on valid input; if a mid-stream token
        // trips an edge case, fall back to the raw text.
        setHtml(t);
      }
    }).catch(() => setHtml(t));
  });
  const mask = 'linear-gradient(to bottom, transparent 0, rgba(0,0,0,0.4) 12px, #000 28px)';
  return (
    <div
      class="overflow-hidden flex flex-col-reverse"
      style={{
        'max-height': `${STREAM_TAIL_HEIGHT_PX}px`,
        '-webkit-mask-image': mask,
        'mask-image': mask,
      }}
    >
      <div class="chat-md" innerHTML={html() || props.text} />
    </div>
  );
}
