/**
 * delegation.ts — BT-17 (base-team). One card per delegated brief.
 *
 * When an agent hands work to a teammate (`POST /chat/delegate`, §28) the
 * daemon posts `delegate.*` events into the PARENT's thread:
 *
 *   delegate.sent     {child_conv, member, request_id, initiative_id, task_id, brief}
 *   delegate.progress {child_conv, request_id, summary}
 *   delegate.amended  {child_conv, request_id, text}
 *   delegate.report   {child_conv, member, request_ids | request_id, status, summary, commit?}
 *
 * The operator's rule (2026-09-28): detail goes from more to less as you
 * go up. The parent thread shows ONE card per request_id that updates in
 * place — who, which task, a status, the latest short summary. The detail
 * lives in the child's own thread, one click away.
 *
 * Pure: event in, card out. No imports, so `node --test` runs it as is.
 */

export type DelegationStatus = 'working' | 'success' | 'partial' | 'failed' | 'blocked';

export interface DelegationCard {
  request_id: string;
  child_conv: string;
  member: string;
  initiative_id?: string;
  task_id?: string;
  /** First line of the brief — the whole brief belongs to the child. */
  brief?: string;
  status: DelegationStatus;
  /** Latest `delegate.progress` summary. */
  progress?: string;
  /** How many times the parent amended the brief. */
  amendments: number;
  /** The child's final summary (from `delegate.report`). */
  summary?: string;
  commit?: string;
  /** The child ended without a report (`no_report: true`): the daemon
   *  says `failed`, but it is "we don't know", not a failure. */
  no_report?: boolean;
  /** ts of the first event seen for this card — its place in the thread. */
  ts?: string;
  updated_ts?: string;
}

export const DELEGATE_EVENT_PREFIX = 'delegate.';

const KNOWN = new Set(['delegate.sent', 'delegate.progress', 'delegate.report', 'delegate.amended']);

export function isDelegationEvent(type: unknown): boolean {
  return typeof type === 'string' && KNOWN.has(type);
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Every request id an event is about. A report can answer several briefs
 *  the member merged into one piece of work (`request_ids`). */
export function requestIdsOf(ev: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (Array.isArray(ev.request_ids)) {
    for (const r of ev.request_ids) {
      const s = str(r);
      if (s && !out.includes(s)) out.push(s);
    }
  }
  const one = str(ev.request_id);
  if (one && !out.includes(one)) out.push(one);
  return out;
}

const STATUS_ALIASES: Record<string, DelegationStatus> = {
  success: 'success',
  done: 'success',
  ok: 'success',
  completed: 'success',
  partial: 'partial',
  failed: 'failed',
  error: 'failed',
  blocked: 'blocked',
};

export function normalizeStatus(v: unknown): DelegationStatus {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return STATUS_ALIASES[s] ?? 'success';
}

export function firstLine(text: string | undefined, max = 140): string | undefined {
  if (!text) return undefined;
  const line = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
  if (!line) return undefined;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * Fold one `delegate.*` event into the card for `requestId`. `prev` is
 * null for the first event seen (usually `sent`, but a history page can
 * start mid-delegation, so any event may create the card). Returns null
 * when the event is not a delegation event.
 */
export function applyDelegationEvent(
  prev: DelegationCard | null,
  requestId: string,
  ev: Record<string, unknown>,
): DelegationCard | null {
  const t = ev.type;
  if (!isDelegationEvent(t)) return null;
  const ts = str(ev.ts);
  const card: DelegationCard = prev
    ? { ...prev }
    : {
        request_id: requestId,
        child_conv: str(ev.child_conv) ?? '',
        member: str(ev.member) ?? '',
        status: 'working',
        amendments: 0,
        ts,
      };
  // Fill identity from any event that carries it — a card born from a
  // report still learns its child conv and member.
  if (!card.child_conv) card.child_conv = str(ev.child_conv) ?? '';
  if (!card.member) card.member = str(ev.member) ?? '';
  if (!card.ts) card.ts = ts;
  card.updated_ts = ts ?? card.updated_ts;

  if (t === 'delegate.sent') {
    card.brief = firstLine(str(ev.brief)) ?? card.brief;
    card.task_id = str(ev.task_id) ?? card.task_id;
    card.initiative_id = str(ev.initiative_id) ?? card.initiative_id;
    // A sent seen after the report (out-of-order history) must not
    // reopen a finished card, and its ts is the card's true place.
    if (ts) card.ts = ts;
  } else if (t === 'delegate.progress') {
    card.progress = firstLine(str(ev.summary), 200) ?? card.progress;
  } else if (t === 'delegate.amended') {
    card.amendments += 1;
  } else if (t === 'delegate.report') {
    card.status = normalizeStatus(ev.status);
    card.summary = str(ev.summary) ?? card.summary;
    card.commit = str(ev.commit) ?? card.commit;
    card.no_report = ev.no_report === true || undefined;
  }
  return card;
}

/** Merge two views of the same card (an older history page arriving after
 *  a newer one already built it). `newer` wins on everything it knows. */
export function mergeCards(older: DelegationCard, newer: DelegationCard): DelegationCard {
  return {
    ...older,
    ...Object.fromEntries(Object.entries(newer).filter(([, v]) => v !== undefined && v !== '')),
    amendments: older.amendments + newer.amendments,
    ts: older.ts ?? newer.ts,
    status: newer.status === 'working' ? older.status : newer.status,
  } as DelegationCard;
}

export function isFinished(c: DelegationCard): boolean {
  return c.status !== 'working';
}

const STATUS_LABEL: Record<DelegationStatus, string> = {
  working: 'working',
  success: 'done',
  partial: 'partial',
  failed: 'failed',
  blocked: 'blocked',
};

export function statusLabel(s: DelegationStatus, noReport = false): string {
  return noReport ? 'no report' : STATUS_LABEL[s];
}

/** "developer · #BT-17" — the card's title line. */
export function cardTitle(c: DelegationCard): string {
  const who = c.member || c.child_conv.replace(/^mb-/, '') || 'teammate';
  return c.task_id ? `${who} · #${c.task_id}` : who;
}

export function shortCommit(sha: string | undefined): string | undefined {
  if (!sha || sha === 'null') return undefined;
  return sha.slice(0, 7);
}
