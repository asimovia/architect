/**
 * turn-progress.ts — what a working agent is ACTUALLY doing (LT-2/LT-3).
 *
 * The cockpit used to answer "what is this agent up to?" with a rotating
 * list of 36 invented verbs — "Reviewing the roadmap…", "Catching its
 * breath…" — cycling every 1.8 s. They were added so a long pause would
 * "look like progress instead of a 3-state loader", and for a 20-second
 * pause that is a kind gesture. For a turn that has been inside one
 * `Bash` call for forty minutes it is a lie, and it is the reason the
 * operator could watch an agent for half an hour without ever learning
 * that it was supervising an 11-hour training job.
 *
 * The daemon now broadcasts `conv.progress` once per live turn per tick
 * (LT-2) with the real numbers. This module turns them into the one
 * short line the chat shows. Pure functions, zero imports: `npm test`
 * strips types with node and runs this directly.
 */

/** One `conv.progress` frame from the daemon. */
export interface TurnProgress {
  /** Seconds since the turn was spawned. */
  elapsed_secs: number;
  /** Seconds since the last stream event (delta / tool.use / tool.result). */
  idle_secs: number;
  /** `tool` — blocked inside a tool call; `streaming` — output flowing;
   *  `waiting` — no output right now and no tool open (model thinking,
   *  or an API round-trip). */
  phase: 'tool' | 'streaming' | 'waiting';
  /** The tool it is blocked in, when `phase === 'tool'`. */
  tool: string | null;
  /** How long that tool has been running. */
  tool_secs: number | null;
  tool_calls: number;
  deltas: number;
  /** Client clock when this frame was received — used to age the frame
   *  so a stale one is not presented as current. */
  received_at: number;
}

/** Compact duration: `8s`, `4m`, `1h12m`. Long turns are the whole point
 *  of this feature, so hours must stay readable. */
export function humanSecs(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h${rem}m`;
}

/**
 * A frame older than this is not shown as the current state. The daemon
 * ticks every 30 s; at 90 s we have missed three and something is wrong
 * with the socket, not with the agent — better to fall back to the
 * generic spinner than to assert a stale fact.
 */
export const PROGRESS_STALE_MS = 90_000;

export function isStale(p: TurnProgress, now: number): boolean {
  return now - p.received_at > PROGRESS_STALE_MS;
}

/**
 * The line shown under a working agent. Returns null when we have
 * nothing true to say — the caller then falls back to the plain
 * spinner.
 *
 * Shape: `<what it is doing> · <how long the turn has run>`, e.g.
 *   `Bash · 42m  ·  turn 1h12m`
 *   `writing  ·  turn 8s`
 *   `waiting on the model 2m  ·  turn 15m`
 */
export function progressLabel(
  p: TurnProgress | undefined,
  now: number,
): string | null {
  if (!p || isStale(p, now)) return null;
  const turn = `turn ${humanSecs(p.elapsed_secs)}`;
  if (p.phase === 'tool' && p.tool) {
    const held = p.tool_secs !== null && p.tool_secs !== undefined ? ` ${humanSecs(p.tool_secs)}` : '';
    return `${p.tool}${held} · ${turn}`;
  }
  if (p.phase === 'streaming') return `writing · ${turn}`;
  // `waiting` with a long idle is the one case worth spelling out: it is
  // the shape a genuinely stuck turn has, and the operator deciding
  // whether to press Stop needs to see it rather than read "Thinking…".
  if (p.idle_secs >= 60) {
    return `quiet ${humanSecs(p.idle_secs)} · ${turn}`;
  }
  return `thinking · ${turn}`;
}

/**
 * Does this turn look like it is doing long-running work the operator
 * should know about rather than wait on? Drives the "this is normal"
 * hint: a turn 10+ minutes deep in a tool call is supervising something,
 * not hanging — and since LT-1 the daemon will not kill it for that.
 */
export function isLongRunningWork(
  p: TurnProgress | undefined,
  now: number,
): boolean {
  if (!p || isStale(p, now)) return false;
  if (p.phase === 'tool' && (p.tool_secs ?? 0) >= 600) return true;
  return p.elapsed_secs >= 1800;
}

/** Narrow an arbitrary WS frame into a TurnProgress. Returns null when
 *  the daemon is older than LT-2 and sends nothing usable. */
export function parseProgress(
  ev: Record<string, unknown>,
  now: number,
): TurnProgress | null {
  const num = (k: string): number | null => {
    const v = ev[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const elapsed = num('elapsed_secs');
  if (elapsed === null) return null;
  const rawPhase = ev.phase;
  const phase =
    rawPhase === 'tool' || rawPhase === 'streaming' || rawPhase === 'waiting'
      ? rawPhase
      : 'waiting';
  return {
    elapsed_secs: elapsed,
    idle_secs: num('idle_secs') ?? 0,
    phase,
    tool: typeof ev.tool === 'string' && ev.tool ? ev.tool : null,
    tool_secs: num('tool_secs'),
    tool_calls: num('tool_calls') ?? 0,
    deltas: num('deltas') ?? 0,
    received_at: now,
  };
}
