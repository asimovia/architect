/**
 * wake-summary.ts — BT-7 (base-team). A child agent's "I'm back" turn, read
 * as one sentence.
 *
 * When a delegated teammate finishes, the daemon posts a `[delegate-wake]`
 * (or, for the Orchestrator's workers, `[architect-wake]`) user turn into
 * the parent's thread. It is written for the parent AGENT: a verdict, the
 * child's report as fenced JSON, an 800-char preview and instructions. The
 * operator saw all of it (mf27, 2026-09-28: *"las comunicaciones tienen que
 * ser legibles para los humanos… el JSON es el que se tiene que usar para
 * comunicarse entre los dos o tres agentes"*).
 *
 * Pure: text in, summary out. The bubble renders `wakeLine()` and keeps the
 * raw text one click away.
 */

export interface WakeSummary {
  /** The child conv (`mb-developer`, `work-…`). */
  conv: string;
  /** Member id or agent id in parentheses after the conv, when present. */
  who?: string;
  task?: string;
  /** success | partial | failed | blocked | no-recipe | no-report | no-commit | error */
  outcome: string;
  commit?: string;
  files: number;
  next?: string;
}

const HEAD = /^\[(?:delegate|architect)-wake\]\s+(?:Subagent\s+)?`([^`]+)`(?:\s+\(([^)]+)\))?([^\n]*)/;

export function isWakeText(text: string | undefined): boolean {
  return !!text && HEAD.test(text.trimStart());
}

function reportOf(text: string): Record<string, unknown> | null {
  const m = /Child report:\s*```json\s*([\s\S]*?)```/.exec(text);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1] ?? '') as unknown;
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const ALIASES: Record<string, string> = { done: 'success', ok: 'success', completed: 'success', error: 'failed' };

export function parseWake(text: string | undefined): WakeSummary | null {
  if (!text) return null;
  const head = HEAD.exec(text.trimStart());
  if (!head) return null;
  const rest = head[3] ?? '';
  const task = /on task `([^`]+)`/.exec(rest)?.[1] ?? /task=([^,)\s]+)/.exec(rest)?.[1];
  const verdict = /VERDICT:\s*\S+\s+([a-z-]+)/.exec(text)?.[1] ?? '';
  const report = reportOf(text);
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const raw = str(report?.outcome) ?? str(report?.status);
  const outcome = verdict || (raw ? ALIASES[raw] ?? raw : 'no-report');
  const files = Array.isArray(report?.files) ? (report!.files as unknown[]).length : 0;
  return {
    conv: head[1] ?? '',
    who: head[2]?.trim() || undefined,
    task,
    outcome,
    commit: str(report?.commit) && report!.commit !== 'null' ? str(report?.commit) : undefined,
    files,
    next: str(report?.next),
  };
}

const LABEL: Record<string, string> = {
  success: '✓ done',
  partial: '◐ partly done',
  failed: '✗ failed',
  error: '✗ failed',
  blocked: '⏸ blocked',
  'no-recipe': '✗ no recipe to follow',
  'no-report': '✗ ended without a report',
  'no-commit': '✗ nothing committed',
};

/** "developer finished #VW2 — ✓ done · commit 52a9521 · 3 files. Next: …" */
export function wakeLine(s: WakeSummary): string {
  const name = s.who ?? s.conv.replace(/^mb-/, '');
  const parts = [LABEL[s.outcome] ?? s.outcome];
  if (s.commit) parts.push(`commit ${s.commit.slice(0, 7)}`);
  if (s.files) parts.push(`${s.files} file${s.files === 1 ? '' : 's'}`);
  const task = s.task ? ` #${s.task}` : '';
  const next = s.next && s.outcome !== 'success' ? ` Next: ${s.next}` : '';
  return `${name} finished${task} — ${parts.join(' · ')}.${next}`;
}
