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
  /** BT-17 — what the turn is doing, in the daemon's words: the open
   *  tool and its target (`Edit web/src/App.tsx`, `Bash npm test`,
   *  `delegate developer · #SEL1`). Absent on older daemons. */
  current_action?: CurrentAction | null;
  /** BT-20 — this turn's tool calls by tool name. Absent on older daemons. */
  action_counts?: Record<string, number>;
  /** Client clock when this frame was received — used to age the frame
   *  so a stale one is not presented as current. */
  received_at: number;
}

/** BT-17 — `current_action` on `conv.progress` / snapshot `current_turn`. */
export interface CurrentAction {
  tool: string;
  target: string | null;
  /** Seconds this action has been running, as of `received_at`. Derived
   *  from the daemon's `since` when it parses; null otherwise. */
  secs: number | null;
}

/** Compact duration: `8s`, `4m`, `1h12m`. Long turns are the whole point
 *  of this feature, so hours must stay readable. */
export function humanSecs(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  // Seconds stay visible under an hour so the operator can SEE it move
  // (2026-09-28: "no se actualiza en tiempo real").
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`;
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
  // The daemon sends a frame every ~30 s; between frames the clocks keep
  // running, so age every counter by how long ago the frame arrived.
  const age = Math.max(0, (now - p.received_at) / 1000);
  const turn = `turn ${humanSecs(p.elapsed_secs + age)}`;
  // BT-17 — "muse · thinking 54s · turn 3m16s" said nothing. When the
  // daemon names the action, say it in words: `editing web/src/App.tsx
  // · 12s · turn 3m16s`.
  if (p.current_action) {
    const what = describeAction(p.current_action);
    const secs = p.current_action.secs;
    const held = secs !== null ? ` · ${humanSecs(secs + age)}` : '';
    return `${what}${held} · ${turn}`;
  }
  if (p.phase === 'tool' && p.tool) {
    const held = p.tool_secs !== null && p.tool_secs !== undefined ? ` ${humanSecs(p.tool_secs + age)}` : '';
    return `${p.tool}${held} · ${turn}`;
  }
  if (p.phase === 'streaming') return `writing · ${turn}`;
  // `waiting` with a long idle is the one case worth spelling out: it is
  // the shape a genuinely stuck turn has, and the operator deciding
  // whether to press Stop needs to see it rather than read "Thinking…".
  if (p.idle_secs + age >= 60) {
    return `quiet ${humanSecs(p.idle_secs + age)} · ${turn}`;
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
    current_action: parseCurrentAction(ev.current_action, now),
    action_counts: parseCounts(ev.action_counts),
    received_at: now,
  };
}

function parseCounts(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

/**
 * BT-20 — what the turn has done so far, in ONE line: `12 reads ·
 * 5 searches · 9 commands · 2 edits`. A child that only calls tools
 * showed a single "running …" line and the operator could not tell what
 * it had done for three minutes — but listing every call would be the
 * raw CLI noise the chat exists to filter out. Null when there is
 * nothing worth saying (fewer than 2 calls).
 */
export function workSummary(p: TurnProgress | undefined, now: number): string | null {
  if (!p || isStale(p, now)) return null;
  const counts = p.action_counts ?? {};
  const by: Record<string, number> = {};
  let total = 0;
  for (const [tool, n] of Object.entries(counts)) {
    const key = tool.toLowerCase().replace(/^mcp__[^_]+(?:_[^_]+)*__/, '');
    const cat = EDIT_TOOLS.has(key) ? 'edit'
      : READ_TOOLS.has(key) ? 'read'
      : SEARCH_TOOLS.has(key) ? 'search'
      : RUN_TOOLS.has(key) ? 'command'
      : key === 'webfetch' || key === 'websearch' ? 'web lookup'
      : key === 'todowrite' ? null
      : 'other step';
    total += n;
    if (cat) by[cat] = (by[cat] ?? 0) + n;
  }
  if (total < 2) return null;
  const order = ['edit', 'command', 'read', 'search', 'web lookup', 'other step'];
  const plural = (w: string, n: number): string =>
    n === 1 ? w : w === 'search' ? 'searches' : `${w}s`;
  const parts = order.filter((c) => by[c]).map((c) => `${by[c]} ${plural(c, by[c]!)}`);
  return parts.length ? `so far: ${parts.join(' · ')}` : null;
}

/**
 * BT-17 — the line for an IDLE conv that is still doing something
 * between turns (the daemon's `convs[].current_action`, today only
 * "waiting on <member> · <task>"). Null when there is nothing to say.
 */
export function idleActionLabel(raw: unknown, now: number): string | null {
  const a = parseCurrentAction(raw, now);
  if (!a) return null;
  const what = describeAction(a);
  return a.secs !== null ? `${what} · ${humanSecs(a.secs)}` : what;
}

/** Narrow `{tool, target, since}` from the wire. `since` may be an ISO
 *  string or an epoch (seconds or ms); anything else leaves `secs` null
 *  rather than inventing a duration. */
export function parseCurrentAction(raw: unknown, now: number): CurrentAction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const tool = typeof r.tool === 'string' ? r.tool.trim() : '';
  if (!tool) return null;
  const target = typeof r.target === 'string' && r.target.trim() ? r.target.trim() : null;
  let sinceMs: number | null = null;
  if (typeof r.since === 'number' && Number.isFinite(r.since)) {
    sinceMs = r.since < 1e12 ? r.since * 1000 : r.since;
  } else if (typeof r.since === 'string' && r.since) {
    const d = Date.parse(r.since);
    if (!Number.isNaN(d)) sinceMs = d;
  }
  const secs = sinceMs !== null ? Math.max(0, (now - sinceMs) / 1000) : null;
  return { tool, target, secs };
}

const ACTION_TARGET_MAX = 48;

/** Keep the END of a long path/command — the file name is the part that
 *  tells you something. */
function clip(s: string, max = ACTION_TARGET_MAX): string {
  const one = s.split('\n')[0]!.trim();
  return one.length > max ? `…${one.slice(one.length - max + 1)}` : one;
}

/** A command reads from its START (`npm test …`), unlike a path. */
function clipHead(s: string, max = ACTION_TARGET_MAX): string {
  const one = s.split('\n')[0]!.trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

const EDIT_TOOLS = new Set(['edit', 'write', 'multiedit', 'notebookedit', 'apply_patch', 'str_replace', 'create']);
const READ_TOOLS = new Set(['read', 'view', 'notebookread', 'cat']);
const SEARCH_TOOLS = new Set(['grep', 'glob', 'search', 'find', 'ls']);
const RUN_TOOLS = new Set(['bash', 'shell', 'exec', 'run', 'command', 'terminal']);
const WAIT_TOOLS = new Set(['delegate', 'wait', 'waiting', 'delegate_wait', 'await']);
const SUBAGENT_TOOLS = new Set(['task', 'agent']);

/**
 * Tool name + target → a phrase an operator reads at a glance.
 *   Edit web/src/App.tsx   → `editing web/src/App.tsx`
 *   Bash npm test -- --x   → `running npm test -- --x`
 *   delegate developer · #SEL1 → `waiting on developer · #SEL1`
 */
export function describeAction(a: Pick<CurrentAction, 'tool' | 'target'>): string {
  const key = a.tool.toLowerCase().replace(/^mcp__[^_]+(?:_[^_]+)*__/, '');
  const t = a.target;
  if (EDIT_TOOLS.has(key)) return t ? `editing ${clip(t)}` : 'editing a file';
  if (READ_TOOLS.has(key)) return t ? `reading ${clip(t)}` : 'reading a file';
  if (SEARCH_TOOLS.has(key)) return t ? `searching ${clipHead(t)}` : 'searching the code';
  if (RUN_TOOLS.has(key)) return t ? `running ${clipHead(t)}` : 'running a command';
  if (WAIT_TOOLS.has(key)) return t ? `waiting on ${clipHead(t)}` : 'waiting on a teammate';
  if (SUBAGENT_TOOLS.has(key)) return t ? `subagent: ${clipHead(t)}` : 'running a subagent';
  if (key === 'webfetch') return t ? `fetching ${clipHead(t)}` : 'fetching a page';
  if (key === 'websearch') return t ? `searching the web: ${clipHead(t)}` : 'searching the web';
  if (key === 'todowrite') return 'updating its plan';
  return t ? `${a.tool} ${clipHead(t)}` : a.tool;
}
