/**
 * types/team.ts — agent-team (ATM9 daemon contract) + the CLI-client /
 * LLM-provider catalogs the member editor picks from.
 *
 * The team roster is a set of member profiles under `.meshkore/team/`.
 * Each member is a markdown file: frontmatter (identity + defaults) +
 * an init-prompt body. The daemon serves them at /team; the cockpit's
 * teamStore (state/team.ts) mirrors the list and lazy-loads bodies.
 *
 *   GET    /team           → TeamMember[] (frontmatter + instances count),
 *                            sorted by pinned_order
 *   GET    /team/<id>      → TeamMemberDetail (frontmatter + body)
 *   POST   /team           → create (always kind:'profile'; model required)
 *   PATCH  /team/<id>      → partial update (kind & required immutable)
 *   DELETE /team/<id>      → 409 when required:true
 *   POST   /team/draft     → LLM normaliser: free text → structured draft
 *
 * WS events team.created | team.updated | team.deleted { id, ts }.
 *
 * TEG-3 (team-external-gateway, py-1.30.0) — exposure + tokens:
 *
 *   PATCH  /team/<id> {exposure}       → flip internal|external. Revoke =
 *                                        PATCH {exposure:'internal'} (the
 *                                        daemon destroys the token).
 *   GET    /team/<id> (cockpit auth)   → includes `token` when external.
 *                                        GET /team NEVER includes tokens.
 *   POST   /team/<id>/token/rotate     → {token} — new value, old one dead.
 *
 * External callers use the token (NOT the portal token) against
 * POST /team/<id>/ask + GET /team/requests/<rid>. WS events
 * team.request.created | done | error { member, request_id, ts }.
 */

export type TeamMemberKind = 'singleton' | 'profile';

/** DM-CLI-06 (multi-cli-clients) — one entry from GET /clients. Model/
 *  effort ids are driver-owned (daemon source, see clidrivers/*.py) —
 *  the frontend never hardcodes a non-claude-code catalog. */
export interface ClientInfo {
  id: string;
  label: string;
  /** Whether the CLI binary was found on the DAEMON's machine (not this
   *  browser's) — probed fresh on every request, never cached. */
  installed: boolean;
  /** null = "can't tell" (e.g. claude-code's own login state isn't a
   *  single checkable env var) — never a false positive/negative. */
  authConfigured: boolean | null;
  models: { id: string; label: string }[];
  efforts: { id: string; label: string }[];
  /** MPV1 (multi-provider-agents) — present only on the `claude-code`
   *  entry: which LLM providers this client can run against and whether
   *  each is usable right now (key present + enabled). Absent on a daemon
   *  older than MPV1 → the member UI falls back to Anthropic-only. Carries
   *  NO key material. */
  providers?: ProviderInfo[];
  /** Follow-up (same initiative) — present only on Codex/Gemini: whether a
   *  daemon-managed API key is stored for this client (Config → General
   *  settings). Absent for claude-code (its providers carry their own). */
  keyPresent?: boolean;
}

/** MPV1 — one provider's availability for the member-editor dropdown.
 *  `available` = enabled AND (no key required OR a key is set). */
export interface ProviderInfo {
  id: string;
  label: string;
  requiresKey: boolean;
  available: boolean;
  defaultModel?: string | null;
  models?: { id: string; label: string }[];
}

/** TEG-3 — who can reach this member. `internal` (default): cockpit
 *  only. `external`: any local software holding the member's bearer
 *  token (ask/poll surface on the shared daemon). */
export type TeamMemberExposure = 'internal' | 'external';

/** One roster member's frontmatter + live instance count. */
export interface TeamMember {
  id: string;
  /** GA-1 — the member's display name. The daemon serves `title` as the
   *  authored field and keeps `name` as an alias of it, so both are
   *  always present and always equal. */
  name: string;
  title?: string;
  /** GA-1 — DERIVED from the id by the daemon, not stored on the card:
   *  choosing a glyph and a hex code is not part of describing an agent. */
  emoji: string;
  color?: string;
  /** @deprecated GA-1 — `singleton`/`profile` no longer exists; the daemon
   *  stopped serving it. Kept so an older build reading a newer daemon
   *  type-checks. */
  kind?: TeamMemberKind;
  /** @deprecated GA-1 — no member is undeletable any more. */
  required?: boolean;
  /** @deprecated GA-2 — the eight agent types collapsed into one generic
   *  role; what specialises a member is its prompt and its context. */
  agent_type?: string;
  /** DM-CLI-02 (multi-cli-clients) — which CLI dispatches this member's
   *  turns. Absent (every member from before this field existed) means
   *  `claude-code`. */
  client?: string;
  /** MPV1 — which LLM provider (backend) instances run against, for the
   *  claude-code client. Absent means `anthropic` (the default). */
  provider?: string;
  /** Default model for instances of this member (required by the schema). */
  model: string;
  effort?: string;
  /** GA-4 — the knowledge-tree branches pinned into this member's
   *  briefing in full (`context/_index.yaml` node ids). Empty/absent means
   *  the project's default pinned set. THIS is what specialises a member. */
  context?: string[];
  /** @deprecated GA-1 — replaced by `context`. */
  pinned_order?: number;
  /** @deprecated GA-1 — replaced by `context`. */
  refs?: string[];
  /** @deprecated GA-1 — dropped from the schema. */
  credentials_hint?: string;
  created?: string;
  updated?: string;
  /** TEG-3 — internal (default) or external (token-reachable). */
  exposure?: TeamMemberExposure;
  /** BT-5 — the card's opening sentence (derived by the daemon from the
   *  prompt; py-1.39.0+). Absent on older daemons. */
  summary?: string;
  /** Non-archived live convs currently bound to this member (from GET /team). */
  instances?: number;
}

/** TMR3 — where a save landed. The daemon answers every PATCH with the
 *  live instances of the member: `convs` took the change already (their
 *  sidecar was re-stamped), `busy` are mid-turn and will run it on their
 *  next message — the process in flight keeps the argv it launched with. */
export interface TeamApplied {
  convs: string[];
  busy: string[];
  engine_changed: boolean;
  profile_changed: boolean;
}

/** TMR2 — DELETE /team/<id>. Deleting a member is a change to the TEAM:
 *  `rewired_members` had the deleted id in their `delegates_to` and were
 *  rewritten; `unbound_convs` were instances of it and now run unbound
 *  (dials intact) instead of 400-ing on every turn. */
export interface TeamDeleteResult {
  ok: boolean;
  deleted: string;
  rewired_members?: string[];
  unbound_convs?: string[];
}

/** Full member incl. the init-prompt markdown body (GET /team/<id>). */
export interface TeamMemberDetail extends TeamMember {
  body: string;
  /** TEG-3 — the member's bearer token. Present ONLY when the member is
   *  external AND the GET was cockpit-authed. Kept in memory only —
   *  never persisted to localStorage. */
  token?: string;
  /** TMR3 — present on the response to a PATCH, never on a GET. */
  applied?: TeamApplied;
}

/** POST /team — the final shape the operator confirms in the dialog.
 *  `kind` is always `profile` for operator-created members; the daemon
 *  rejects anything else. `model` is mandatory (no auto). */
export interface TeamCreateBody {
  name: string;
  /** @deprecated GA-1 — derived from the id by the daemon. */
  emoji?: string;
  /** DM-CLI-02 — omit for claude-code (the default). */
  client?: string;
  /** MPV1 — omit for anthropic (the default provider). */
  provider?: string;
  model: string;
  effort?: string;
  /** GA-4 — knowledge-tree branches pinned for this member. */
  context?: string[];
  /** @deprecated GA-1 */
  kind?: 'profile';
  /** @deprecated GA-1 — replaced by `context`. */
  refs?: string[];
  /** The init-prompt markdown body. */
  prompt: string;
  color?: string;
}

/** PATCH /team/<id> — only the editable fields. `kind`/`required` are
 *  immutable (daemon rejects them). Each caller sends only the section
 *  it edited (ATM6 per-section save). */
export interface TeamPatchBody {
  name?: string;
  emoji?: string;
  color?: string;
  /** DM-CLI-02 — switch which CLI dispatches this member's turns. */
  client?: string;
  /** MPV1 — switch which LLM provider (backend) this member runs against. */
  provider?: string;
  model?: string;
  effort?: string;
  refs?: string[];
  prompt?: string;
  /** TEG-3 — flip exposure. `internal` revokes: the daemon destroys the
   *  member's token server-side, cutting external callers off instantly. */
  exposure?: TeamMemberExposure;
}

/** POST /team/draft — LLM normaliser input + output. */
export interface TeamDraftBody {
  name: string;
  /** @deprecated GA-1 — the daemon derives the glyph; still accepted. */
  emoji?: string;
  raw_text: string;
}
export interface TeamDraftResponse {
  id?: string;
  name: string;
  emoji: string;
  model: string;
  effort: string;
  kind?: string;
  /** GA-4 — branches the normaliser suggests for this member. */
  context?: string[];
  /** @deprecated GA-1 — replaced by `context`. */
  refs?: string[];
  prompt: string;
}
