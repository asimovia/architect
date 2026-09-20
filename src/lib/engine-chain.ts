/**
 * engine-chain.ts — ATM19. The engine combos are ONE chain, and this is
 * the only place that knows its shape:
 *
 *     client → (provider, claude-code only) → model      effort ← client
 *
 * Two questions, answered here so the member editor and the chat-wall
 * header can never answer them differently (ATM17 shipped the chain in
 * the editor and ATM18 healed stale ids, but both left each surface
 * building its own option lists — the header and the card drifted again
 * as soon as a provider entered the picture):
 *
 *   1. which OPTIONS a combo offers for the current selection, and
 *   2. what the combos BELOW reset to when one above changes.
 *
 * Rule 2 is the operator-visible contract: change the client and
 * everything downstream goes back to that client's default. Nothing is
 * ever carried across a catalog boundary — that is how an Anthropic
 * model id ended up saved on a Muse member.
 *
 * Pure module: no store, no DOM, no `~/` imports (it is unit-tested by
 * `node --test`, which has neither).
 */

import {
  DEFAULT_EFFORT,
  DEFAULT_PROVIDER,
  EFFORT_CATALOG,
  providerCatalog,
} from './models.ts';

export interface Opt {
  id: string;
  label: string;
}

/** A model list as the combo renders it: one entry per `<optgroup>`
 *  (`group: null` = ungrouped options, what the daemon catalogs are). */
export interface OptGroup {
  group: string | null;
  items: Opt[];
}

/** The four engine dials, as the pickers edit them. */
export interface EngineChoice {
  client: string;
  provider: string;
  model: string;
  effort: string;
}

/** {models, efforts} as `clientsStore.catalogFor()` returns them — the
 *  daemon's live catalog for one CLI client. */
export interface ClientCatalog {
  models: Opt[];
  efforts: Opt[];
}

/** claude-code's model when nothing is pinned. Deliberately NOT
 *  `DEFAULT_MODEL` ('opus', the new-agent policy): this is the value an
 *  editor shows for a member with no model saved, and it has been
 *  `sonnet` since ATM6 — changing it here would silently re-engine every
 *  unpinned member on its next Save. */
export const CLAUDE_FALLBACK_MODEL = 'sonnet';

export function isClaudeCode(client: string | null | undefined): boolean {
  return (client || 'claude-code').toLowerCase() === 'claude-code';
}

/**
 * The model options for one (client, provider) pair.
 *
 * claude-code reads the PROVIDER catalog (Anthropic / Meta / ZAI) — it
 * is the one client whose models depend on something other than the
 * client itself; every other CLI reads the daemon's live catalog for it,
 * which is empty until `GET /clients` answers (callers append the live
 * value so the combo still shows the truth meanwhile).
 */
export function modelOptionsFor(
  client: string | null | undefined,
  provider: string | null | undefined,
  catalog: ClientCatalog,
): OptGroup[] {
  if (!isClaudeCode(client)) {
    return catalog.models.length ? [{ group: null, items: catalog.models.map((m) => ({ id: m.id, label: m.label })) }] : [];
  }
  const out: OptGroup[] = [];
  for (const m of providerCatalog(provider)) {
    const hit = out.find((g) => g.group === m.group);
    if (hit) hit.items.push({ id: m.id, label: m.label });
    else out.push({ group: m.group, items: [{ id: m.id, label: m.label }] });
  }
  return out;
}

/** Flat model ids for a (client, provider) — membership tests. */
export function modelIdsFor(
  client: string | null | undefined,
  provider: string | null | undefined,
  catalog: ClientCatalog,
): string[] {
  return modelOptionsFor(client, provider, catalog).flatMap((g) => g.items.map((o) => o.id));
}

/** The effort options for a client. claude-code's are fixed (the CLI's
 *  own `--effort` levels); every other client reports its own. */
export function effortOptionsFor(client: string | null | undefined, catalog: ClientCatalog): Opt[] {
  if (isClaudeCode(client)) return EFFORT_CATALOG.map((e) => ({ id: e.id, label: e.label }));
  return catalog.efforts.map((e) => ({ id: e.id, label: e.label }));
}

/** The model a fresh (client, provider) selection lands on. */
export function defaultModelFor(
  client: string | null | undefined,
  provider: string | null | undefined,
  catalog: ClientCatalog,
): string {
  const ids = modelIdsFor(client, provider, catalog);
  if (isClaudeCode(client)) return ids.includes(CLAUDE_FALLBACK_MODEL) ? CLAUDE_FALLBACK_MODEL : (ids[0] ?? '');
  // Non-claude clients lead with their own "Default (CLI config)" row —
  // an empty id — which is exactly what an unpinned member should get.
  return ids[0] ?? '';
}

/** The effort a fresh client selection lands on: the CLI default when
 *  the client offers one, else its first level. */
export function defaultEffortFor(client: string | null | undefined, catalog: ClientCatalog): string {
  const opts = effortOptionsFor(client, catalog);
  if (opts.some((e) => e.id === DEFAULT_EFFORT)) return DEFAULT_EFFORT;
  return opts[0]?.id ?? DEFAULT_EFFORT;
}

/**
 * Client combo changed → the whole chain below re-seeds.
 *
 * Provider goes back to Anthropic (it is claude-code's dial; leaving a
 * 'meta' behind meant switching to claude-code offered Muse models under
 * a member the operator had just pointed at Anthropic), and model +
 * effort come from the NEW (client, provider) — never from the old one.
 */
export function selectClient(client: string, catalog: ClientCatalog): EngineChoice {
  return {
    client,
    provider: DEFAULT_PROVIDER,
    model: defaultModelFor(client, DEFAULT_PROVIDER, catalog),
    effort: defaultEffortFor(client, catalog),
  };
}

/** Provider combo changed → the model re-seeds from that provider's
 *  catalog. Effort does not depend on the provider and is kept. */
export function selectProvider(prev: EngineChoice, provider: string, catalog: ClientCatalog): EngineChoice {
  return { ...prev, provider, model: defaultModelFor(prev.client, provider, catalog) };
}

/** Append the live value as its own trailing group when the catalog
 *  doesn't list it (a pinned id, an un-hydrated catalog): a `<select>`
 *  whose value matches no `<option>` renders SOME OTHER row, which is a
 *  lie about what the member will run — see `select-sync.ts`. */
export function withLiveModel(groups: OptGroup[], live: string | null | undefined): OptGroup[] {
  const v = (live ?? '').trim();
  if (!v) return groups;
  if (groups.some((g) => g.items.some((o) => o.id === v))) return groups;
  return [...groups, { group: null, items: [{ id: v, label: `${v} (member)` }] }];
}
