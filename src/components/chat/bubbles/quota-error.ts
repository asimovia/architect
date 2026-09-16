/**
 * quota-error — detect provider rate-limit / out-of-credit failures in
 * finished agent text and extract the reset time when present.
 *
 * Pure functions (no Solid) so they are unit-testable with node:test.
 *
 * Covered shapes (provider-agnostic, present + future):
 *   [muse error] API error 429 [request_id=…]: Subscription quota
 *     exhausted. Your usage window resets at 2026-09-12T17:35:09Z. (rate_limit_error)
 *   … "API error 429", rate_limit_error, quota exhausted,
 *   out of credit(s), credits exhausted, "usage limit reached" …
 *
 * What it must NOT match is an agent TALKING about rate limits. "rate
 * limit" and "429" are ordinary vocabulary here — an agent comparing
 * free Bitcoin APIs, tuning the Oracle's backoff or documenting a free
 * tier says both, constantly. Matching bare "rate limit" cost two
 * complete, correct answers on 2026-09-16: the cockpit replaced them
 * with a quota card while /health showed zero paused pools and the CLI
 * was perfectly authenticated. A provider failure is an ERROR ENVELOPE
 * — it leads with the failure and names a code — so that is what we
 * look for, and only in the first ENVELOPE_WINDOW characters.
 */

export interface QuotaInfo {
  /** e.g. "Muse", "Codex", "Anthropic" — from a "[x error]" prefix, else "". */
  provider: string;
  /** Parsed reset instant, when the text carries one. */
  resetsAt: Date | null;
  /** Raw reset fragment as found in the text (for display fallback). */
  rawReset: string | null;
}

/**
 * How far into the text an envelope may start. A provider dump IS the
 * failure — it opens with it, at most behind a short `[muse error]`
 * style prefix — so the window is deliberately tight. Prose reaches the
 * same words one clause later, which is all the separation we need and
 * the only one that does not depend on guessing tone.
 */
const ENVELOPE_WINDOW = 80;

/**
 * Structural evidence that the text IS a provider error envelope.
 * Every entry names a code, a status, or an exhausted resource — none
 * of them is a phrase an agent uses while explaining somebody else's
 * rate limits.
 */
const QUOTA_PATTERNS: RegExp[] = [
  /rate_limit_error/i,
  /\b(?:api error|http(?:\s*status)?|status(?:\s*code)?|error code)\s*:?\s*429\b/i,
  /\b429\b[^\n]{0,80}\brequest_id\b/i,
  /\busage limit (?:reached|exceeded)\b/i,
  /\bquota (?:exhausted|exceeded)\b/i,
  /\bsubscription[\s\w-]*quota[\s\w-]*exhaust/i,
  /\bcredits?[\s\w-]*exhaust/i,
  /\bout of (?:credit|credits|quota)\b/i,
  /\btoo many requests\b/i,
];

const RESET_PATTERNS: RegExp[] = [
  /resets?\s+(?:at|on)\s+([^\s)]+)/i,
  /reset\s*(?:window)?\s*:?\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/i,
  /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/,
];

const PROVIDER_PREFIX = /^\[\s*([a-z0-9_-]+)(?:\s+error)?\s*\]/i;

function parseResetDate(raw: string): Date | null {
  const cleaned = raw.replace(/[.,;)\]]+$/, '');
  const ms = Date.parse(cleaned);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/** Null when the text is NOT a quota/rate-limit failure. */
export function detectQuotaError(text: string): QuotaInfo | null {
  if (!text || text.length > 4000) return null;
  // The envelope has to OPEN the message. An answer that discusses a
  // provider's limits hits the same words halfway down, and swallowing
  // that answer loses work the operator never gets to read.
  if (!QUOTA_PATTERNS.some((p) => p.test(text.slice(0, ENVELOPE_WINDOW)))) return null;

  let rawReset: string | null = null;
  let resetsAt: Date | null = null;
  for (const p of RESET_PATTERNS) {
    const m = text.match(p);
    if (m?.[1]) {
      rawReset = m[1];
      resetsAt = parseResetDate(m[1]);
      break;
    }
  }

  const pm = text.match(PROVIDER_PREFIX);
  const provider = pm?.[1] ? pm[1].charAt(0).toUpperCase() + pm[1].slice(1) : '';

  return { provider, resetsAt, rawReset };
}

/** "en 42 min" / "en 2 h 05 min" — null when unknown or already past. */
export function resetCountdown(resetsAt: Date | null, nowMs = Date.now()): string | null {
  if (!resetsAt) return null;
  const diff = resetsAt.getTime() - nowMs;
  if (!Number.isFinite(diff) || diff <= 0) return null;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'en menos de un minuto';
  if (mins < 60) return `en ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `en ${h} h` : `en ${h} h ${String(m).padStart(2, '0')} min`;
}
