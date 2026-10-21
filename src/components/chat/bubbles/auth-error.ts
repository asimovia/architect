/**
 * auth-error.ts — CCA1. Is this agent reply really Claude Code saying it
 * cannot authenticate? (2026-10-20: "Failed to authenticate: OAuth session
 * expired and could not be refreshed" rendered as if the Architect had said
 * it.) Only a reply that OPENS with the CLI's envelope counts — an answer
 * that discusses authentication must keep its text.
 */

const ENVELOPE_WINDOW = 200;

const AUTH_PATTERNS: RegExp[] = [
  /^\s*Failed to authenticate\b/i,
  /^\s*(?:\[[^\]]*\]\s*)?(?:API Error:\s*)?401\b.*(?:auth|token|credential)/i,
  /^\s*OAuth (?:session|token) (?:has )?expired/i,
  /^\s*Invalid API key\b.*(?:\/login|log in)/i,
  /^\s*(?:Please run|Run) \/login\b/i,
  /^\s*Not logged in\b/i,
];

/**
 * CCA4 — only a reply Claude Code itself produced. Muse, Codex and the rest
 * have their own logins; their failures must not offer this sign-in. A reply
 * that does not say which client made it (before py-1.42.6) never qualifies.
 */
export function isClaudeCodeAuthFailure(text: string, client: string | undefined): boolean {
  return client === 'claude-code' && isClaudeAuthError(text);
}

export function isClaudeAuthError(text: string): boolean {
  if (!text || text.length > 2000) return false;
  const head = text.slice(0, ENVELOPE_WINDOW);
  return AUTH_PATTERNS.some((p) => p.test(head));
}
