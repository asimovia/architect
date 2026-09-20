/**
 * models.ts — the cockpit's LLM model + effort catalog, shared by the
 * team member dialog/editor (pickers), the chat header's live pickers,
 * and AgentCard / ChatScopeStrip (badges).
 *
 * Two knobs map 1:1 onto what the `claude` CLI (claude-code 2.1.267)
 * accepts and what the daemon forwards (MP1/MP3, daemon py-1.13.3+):
 *
 *   --model <id>     alias ('fable'/'opus'/'sonnet'/'haiku' → always-latest)
 *                    OR a pinned full id ('claude-opus-4-8', …).
 *
 * Catalog refresh 2026-09-12 (DM-CLI-12) — see daemon providers.py.
 * Older pins are KEPT while vendors still serve them (members may be
 * pinned to one); the daemon never rejects an unlisted id.
 *   --effort <level> low | medium | high | xhigh | max — the
 *                    "thinking" / reasoning-depth dial. There is NO
 *                    separate thinking flag; effort IS it.
 *
 * `auto` (model) and `default` (effort) are sentinels for "omit the
 * flag → let the CLI / account decide". The daemon skips the flag in
 * those cases.
 */

export interface ModelMeta {
  id: string;
  /** Full label for the picker. */
  label: string;
  /** ≤6-char badge shown in the rail card + chat header. */
  short: string;
  /** One-line hint shown under the picker option. */
  hint: string;
  /** Grouping for the picker's <optgroup>. Provider-relative — Anthropic
   *  uses alias/pinned/auto; ZAI uses 'GLM'. */
  group: string;
}

// Aliases track the newest model of each family automatically — the
// safe default for most agents. Pinned ids let the operator nail a
// specific version (e.g. reproduce a result on opus-4.7). If the
// account can't access a pinned id, the CLI errors at dispatch — the
// chip / chat surfaces it; that's the operator's signal.
export const MODEL_CATALOG: readonly ModelMeta[] = [
  // Latest aliases
  { id: 'fable',  label: 'Fable (latest)',  short: 'fab',  hint: 'Flagship family · always newest Fable',                  group: 'Latest (alias)' },
  { id: 'opus',   label: 'Opus (latest)',   short: 'opus', hint: 'Highest quality · most expensive · always newest Opus', group: 'Latest (alias)' },
  { id: 'sonnet', label: 'Sonnet (latest)', short: 'son',  hint: 'Balanced workhorse · always newest Sonnet',             group: 'Latest (alias)' },
  { id: 'haiku',  label: 'Haiku (latest)',  short: 'hai',  hint: 'Fastest · cheapest · always newest Haiku',              group: 'Latest (alias)' },
  // Pinned versions — Claude 5 family
  { id: 'claude-fable-5-1',  label: 'Fable 5.1',  short: 'f5.1', hint: 'Pinned — Fable 5.1 · the flagship · native 1M context (needs claude-code ≥ 2.1.251)', group: 'Pinned version' },
  { id: 'claude-fable-5',    label: 'Fable 5',    short: 'f5',   hint: 'Pinned — Fable 5 · most capable · native 1M context', group: 'Pinned version' },
  { id: 'claude-opus-5',     label: 'Opus 5',     short: 'o5',   hint: 'Pinned — Opus 5 · SOTA coding at lower cost than 4.8', group: 'Pinned version' },
  { id: 'claude-sonnet-5',   label: 'Sonnet 5',   short: 's5',   hint: 'Pinned — Sonnet 5 · near-Opus quality at Sonnet cost', group: 'Pinned version' },
  // Pinned versions — Opus / Haiku 4.x
  { id: 'claude-opus-4-8',   label: 'Opus 4.8',   short: 'o4.8', hint: 'Pinned — Opus 4.8',   group: 'Pinned version' },
  { id: 'claude-opus-4-7',   label: 'Opus 4.7',   short: 'o4.7', hint: 'Pinned — Opus 4.7',   group: 'Pinned version' },
  { id: 'claude-opus-4-6',   label: 'Opus 4.6',   short: 'o4.6', hint: 'Pinned — Opus 4.6',   group: 'Pinned version' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', short: 's4.6', hint: 'Pinned — Sonnet 4.6', group: 'Pinned version' },
  { id: 'claude-haiku-4-5',  label: 'Haiku 4.5',  short: 'h4.5', hint: 'Pinned — Haiku 4.5',  group: 'Pinned version' },
  // Auto
  { id: 'auto', label: 'Auto', short: 'auto', hint: 'Let the CLI / account decide (≈ latest Sonnet)', group: 'Auto' },
];

// ── multi-provider-agents (MPV1) ─────────────────────────────────────
//
// A `claude-code` team member can run against a PROVIDER (LLM backend):
// Anthropic native (default) or ZAI's GLM models via its Anthropic-
// compatible endpoint. Provider is orthogonal to `client`/`effort`;
// selecting it repopulates the model dropdown from that provider's
// catalog. Catalogs are static here (mirrors daemon providers.py; upstream
// lists aren't fetched live) and the daemon reports per-provider
// availability via GET /clients. Adding a provider = one entry.

/** ZAI's GLM catalog — the model dropdown when Provider = ZAI.
 *  Refresh 2026-09-12 (DM-CLI-12): GLM 5.x (Coding Plan allowlist). */
export const GLM_CATALOG: readonly ModelMeta[] = [
  { id: 'glm-5.3',     label: 'GLM-5.3',      short: 'glm5.3', hint: 'ZAI · GLM-5.3 · newest on the Coding Plan', group: 'GLM' },
  { id: 'glm-5.2',     label: 'GLM-5.2',      short: 'glm5.2', hint: 'ZAI · GLM-5.2', group: 'GLM' },
  { id: 'glm-5.1',     label: 'GLM-5.1',      short: 'glm5.1', hint: 'ZAI · GLM-5.1', group: 'GLM' },
  { id: 'glm-5-turbo', label: 'GLM-5 Turbo',  short: 'glm5t',  hint: 'ZAI · GLM-5 Turbo · faster reasoning', group: 'GLM' },
  { id: 'glm-4.7',     label: 'GLM-4.7',      short: 'glm4.7', hint: 'ZAI · GLM-4.7 · Coding Plan default', group: 'GLM' },
  { id: 'glm-4.6',     label: 'GLM-4.6',      short: 'glm4.6', hint: 'ZAI · GLM-4.6', group: 'GLM' },
  { id: 'glm-4.5-air', label: 'GLM-4.5 Air',  short: 'glmair', hint: 'ZAI · GLM-4.5 Air · light/fast (also the small-model default)', group: 'GLM' },
];

/** Meta's Muse Spark catalog — the model dropdown when Provider = Meta.
 *  DM-CLI-13: Muse arrived here as a CLI, so a machine without the `muse`
 *  binary could not use it at all. Meta's Model API is a plain
 *  Anthropic-compatible endpoint, so the same key also works with no
 *  install. Ids mirror the CLI's own catalog verbatim; "contributor" is
 *  Meta's content-use distinction and must stay visible in the label. */
export const MUSE_CATALOG: readonly ModelMeta[] = [
  { id: 'muse-spark-1.3',             label: 'Muse Spark 1.3',             short: 'muse1.3', hint: 'Meta · Muse Spark 1.3', group: 'Muse' },
  { id: 'muse-spark-1.3-contributor', label: 'Muse Spark 1.3 Contributor', short: 'muse1.3c', hint: 'Meta · 1.3 · content may improve Meta products', group: 'Muse' },
  { id: 'muse-spark-1.2',             label: 'Muse Spark 1.2',             short: 'muse1.2', hint: 'Meta · Muse Spark 1.2 · also the small-model default', group: 'Muse' },
  { id: 'muse-spark-1.2-contributor', label: 'Muse Spark 1.2 Contributor', short: 'muse1.2c', hint: 'Meta · 1.2 · content may improve Meta products', group: 'Muse' },
];

export interface ProviderMeta {
  id: string;
  label: string;
  /** true when the provider needs an API key set in Config → Clients &
   *  providers before it can be selected (ZAI); false for Anthropic
   *  (native login/config). */
  requiresKey: boolean;
}

/** Provider metadata for the member-editor dropdown. Availability
 *  (key present + enabled) is layered on top from the daemon's
 *  GET /clients `providers` list — see state/clients.ts `providersFor`. */
export const PROVIDERS: readonly ProviderMeta[] = [
  { id: 'anthropic', label: 'Anthropic',              requiresKey: false },
  { id: 'meta',      label: 'Meta (Muse Spark API)',  requiresKey: true },
  { id: 'zai',       label: 'ZAI (GLM)',              requiresKey: true },
];

export const DEFAULT_PROVIDER = 'anthropic';

// ── cross-client stale ids (ATM18) ────────────────────────────────────
//
// A model id saved under one client can resurface under another: members
// saved before the chained combos (ATM17) carry Anthropic ids under Codex,
// and the pickers used to offer them back verbatim as "(member)" rows —
// "Codex on top, Anthropic below". The rule below names the ids that are
// only ever feasible under claude-code's provider catalogs, so the editor
// seed (team-engine-draft) and the header resolution (member-shadow) can
// heal them to the CLI default instead of displaying them. Unknown ids
// (a pinned `gpt-5.4`, any future model) are NEVER stale: the daemon
// forwards unlisted ids, and pinning must survive.
//
// The Muse carve-out: `muse-spark-*` ids are the muse CLI's own catalog as
// well as the Meta provider's, so they are only stale under a client that
// is neither claude-code nor muse.

const ANTHROPIC_FAMILY_IDS: ReadonlySet<string> = new Set([
  ...MODEL_CATALOG.map((m) => m.id),
  ...GLM_CATALOG.map((m) => m.id),
]);
const MUSE_IDS: ReadonlySet<string> = new Set(MUSE_CATALOG.map((m) => m.id));

/** True when `model` is a claude-code-catalog id that can never run under
 *  `client` — a stale save from before the chained combos, not a pin.
 *  Empty (CLI default) is always feasible; `claude-code` accepts its own
 *  catalogs by definition; unknown ids are never stale (see above). */
export function isStaleModelForClient(
  client: string | null | undefined,
  model: string | null | undefined,
): boolean {
  const c = (client || 'claude-code').toLowerCase();
  const m = (model || '').trim();
  if (!m || c === 'claude-code') return false;
  if (m === 'auto') return true;
  if (ANTHROPIC_FAMILY_IDS.has(m)) return true;
  if (MUSE_IDS.has(m) && c !== 'muse') return true;
  return false;
}

/** ATM19 — the provider-aware sibling of `isStaleModelForClient`. Under
 *  `claude-code` the feasible catalog is the PROVIDER's, so an Anthropic
 *  id left behind while Provider = Meta is exactly as foreign as one
 *  saved under Codex, and the editor used to seed the draft with it and
 *  render a DIFFERENT row (the select fell back to the provider's first
 *  model) while the save persisted the mismatch. True only for ids that
 *  belong to another provider's catalog — an unknown id is a pin and
 *  survives, same rule as `isStaleModelForClient`. */
export function isStaleModelForEngine(
  client: string | null | undefined,
  provider: string | null | undefined,
  model: string | null | undefined,
): boolean {
  const m = (model || '').trim();
  if (!m) return false;
  if (isStaleModelForClient(client, m)) return true;
  if ((client || 'claude-code').toLowerCase() !== 'claude-code') return false;
  if (providerCatalog(provider).some((x) => x.id === m)) return false;
  // `auto` is claude-code's own sentinel and lives in the Anthropic
  // catalog: under Meta/ZAI it is as foreign as a model id.
  return m === 'auto' || ANTHROPIC_FAMILY_IDS.has(m) || MUSE_IDS.has(m);
}

/** The model catalog for a provider id. Unknown → Anthropic (safe). */
export function providerCatalog(providerId: string | null | undefined): readonly ModelMeta[] {
  switch ((providerId || DEFAULT_PROVIDER).toLowerCase()) {
    case 'zai':
      return GLM_CATALOG;
    case 'meta':
      return MUSE_CATALOG;
    default:
      return MODEL_CATALOG;
  }
}

export interface EffortMeta {
  id: string;
  label: string;
  hint: string;
}

// Maps to `claude --effort <level>`. `default` omits the flag.
export const EFFORT_CATALOG: readonly EffortMeta[] = [
  { id: 'default', label: 'Default',      hint: 'CLI default reasoning depth (no flag)' },
  { id: 'low',     label: 'Low',          hint: 'Minimal thinking — fastest, cheapest' },
  { id: 'medium',  label: 'Medium',       hint: 'Moderate thinking' },
  { id: 'high',    label: 'High',         hint: 'Deeper thinking' },
  { id: 'xhigh',   label: 'Extra high',   hint: 'Very deep thinking' },
  { id: 'max',     label: 'Max',          hint: 'Maximum reasoning — slowest, most expensive' },
];

/** A freshly-created agent's model + effort. Explicit model (not auto)
 *  so the operator always knows what's running. Strongest-model policy
 *  (agent-team): default to `opus` — the operator dials down per-member
 *  or per-conv when a lighter model is enough. Default effort = the CLI
 *  default (no flag) to avoid silently inflating cost. */
export const DEFAULT_MODEL = 'opus';
export const DEFAULT_EFFORT = 'default';

const MODEL_BY_ID = new Map([...MODEL_CATALOG, ...GLM_CATALOG, ...MUSE_CATALOG].map((m) => [m.id, m]));

/** Short badge text for a model id. Known ids use their catalog
 *  `short`; unknown explicit ids fall back to the family word. */
export function modelShort(id: string | null | undefined): string {
  if (!id) return DEFAULT_MODEL_SHORT;
  const hit = MODEL_BY_ID.get(id);
  if (hit) return hit.short;
  // Family fallback for unlisted variants (e.g. a [1m]-suffixed or newer id).
  // Fable/Mythos version as "5" / "5.1"; opus/sonnet/haiku as
  // "<letter><major>.<minor>" from a "4-8"-style id.
  const glm = id.match(/glm/i);
  if (glm) {
    const v = id.match(/glm-?(\d+(?:\.\d+)?)/i);
    return v ? `glm${v[1]}` : 'glm';
  }
  const muse = id.match(/muse/i);
  if (muse) {
    const v = id.match(/muse-spark-?(\d+(?:\.\d+)?)/i);
    return v ? `muse${v[1]}` : 'muse';
  }
  const fm = id.match(/fable|mythos/i);
  if (fm) {
    // Read the version FORWARD from the family word: 'claude-fable-5-1' has
    // two numbers and the old `-(\d+)(?![\d-])` grabbed the LAST one, so the
    // flagship would have been badged 'f1' — a Fable 1 that does not exist.
    // Second group is optional so single-number ids ('claude-fable-5') and
    // suffixed ones ('claude-fable-5-1[1m]') both still work.
    const v = id.match(/(?:fable|mythos)-(\d+)(?:-(\d+))?/i);
    const letter = (fm[0][0] ?? '').toLowerCase();
    if (v) return `${letter}${v[1]}${v[2] ? `.${v[2]}` : ''}`;
    return fm[0].slice(0, 3).toLowerCase();
  }
  const m = id.match(/opus|sonnet|haiku/i);
  if (m) {
    const fam = m[0].slice(0, 3).toLowerCase();
    const v = id.match(/(\d+)-(\d+)/);
    return v ? `${fam[0]}${v[1]}.${v[2]}` : fam;
  }
  return id.slice(0, 6);
}

const DEFAULT_MODEL_SHORT = MODEL_BY_ID.get(DEFAULT_MODEL)?.short ?? 'son';

/** Human label for a model id (for the chat-header badge / tooltip). */
export function modelLabel(id: string | null | undefined): string {
  if (!id || id === 'auto') return 'auto';
  return MODEL_BY_ID.get(id)?.label ?? id;
}

/** True when the model is the `auto` sentinel (or empty). */
export function isAutoModel(id: string | null | undefined): boolean {
  return !id || id === 'auto';
}

/** True when effort is the default sentinel (or empty) — no flag. */
export function isDefaultEffort(id: string | null | undefined): boolean {
  return !id || id === 'default';
}
