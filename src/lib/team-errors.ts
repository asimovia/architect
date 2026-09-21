/**
 * lib/team-errors.ts — what a failed (or successful) roster write tells
 * the operator. TMR4.
 *
 * The Team panel used to render `Save failed (HTTP 400) — reverted.` and
 * `Create failed (HTTP 400)`, which is the one sentence that cannot be
 * acted on: the daemon had already said *why* in the response body
 * (`model is mandatory and must be non-empty`, `id must match …`) and
 * the cockpit threw it away. Same for the other direction — a save that
 * worked gave no sign it had reached the sessions already open under
 * that member, which is exactly what the operator is changing it for.
 *
 * Pure + dependency-free on purpose: `npm test` runs these with node's
 * native TS stripping, so this module imports nothing.
 */

/** The daemon's own explanation, or a sentence about the transport. */
export function teamErrorText(status: number, rawBody?: string): string {
  const detail = daemonMessage(rawBody);
  if (status === 0) {
    return 'The daemon did not answer — nothing was saved. Check the connection and try again.';
  }
  if (status === 401) return 'Unauthorized — the cockpit token was rejected. Re-unlock and retry.';
  if (status === 404) return detail || 'That member no longer exists — the roster moved on.';
  if (status === 409) return detail || 'Refused: this member is protected.';
  if (status >= 500) return detail || 'The daemon failed mid-handling. Check its log.';
  return detail || `Refused (HTTP ${status}).`;
}

/** `{"error": "..."}` → the message; anything else → trimmed raw text. */
function daemonMessage(rawBody?: string): string {
  const raw = (rawBody ?? '').toString().trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    const msg = parsed && typeof parsed.error === 'string' ? parsed.error.trim() : '';
    if (msg) return msg.charAt(0).toUpperCase() + msg.slice(1);
  } catch {
    /* not JSON — fall through to the raw text */
  }
  return raw.length > 240 ? raw.slice(0, 237) + '…' : raw;
}

export interface AppliedLike {
  convs?: string[];
  busy?: string[];
  engine_changed?: boolean;
  profile_changed?: boolean;
}

/**
 * Where the save landed, in one line — or null when there was nothing
 * live to land on (then the panel stays quiet).
 *
 * A mid-turn instance is NOT switched under the running process: the CLI
 * was launched with its argv and killing it would lose the turn. It picks
 * the new config up on its next message, and saying so is the difference
 * between "it didn't work" and "it's queued".
 */
export function appliedText(applied?: AppliedLike | null): string | null {
  if (!applied) return null;
  const total = (applied.convs ?? []).length;
  if (total === 0) return 'Saved. No agent is open under this member right now.';
  const busy = (applied.busy ?? []).length;
  const live = `Saved · applied to ${total} open agent${total === 1 ? '' : 's'}`;
  if (busy === 0) return `${live} — their next message runs the new configuration.`;
  return `${live}; ${busy} ${busy === 1 ? 'is' : 'are'} mid-turn and will switch when that turn ends.`;
}

/** TMR2 — what deleting a member did to the rest of the team. */
export function deletedText(result?: {
  rewired_members?: string[];
  unbound_convs?: string[];
} | null): string | null {
  if (!result) return null;
  const rewired = (result.rewired_members ?? []).length;
  const unbound = (result.unbound_convs ?? []).length;
  const bits: string[] = [];
  if (rewired > 0) {
    bits.push(`${rewired} member${rewired === 1 ? '' : 's'} no longer delegate${rewired === 1 ? 's' : ''} to it`);
  }
  if (unbound > 0) {
    bits.push(`${unbound} open agent${unbound === 1 ? '' : 's'} kept running, now unbound`);
  }
  if (!bits.length) return null;
  return `Deleted — ${bits.join('; ')}.`;
}
