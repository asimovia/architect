/**
 * member-shadow.ts — ATM14. What an open chat header shows for its engine.
 *
 * History worth keeping, because it explains why this file is now small:
 * ATM14b/c/d/f tried to make a member-card edit reach the already-open convs
 * from the BROWSER — pin timestamps, a localStorage "last engine save" epoch,
 * cross-tab storage events. It could not work. The authority is the daemon's
 * conv sidecar (`.meshkore/.runtime/conv_meta.json`), and a second tab, a
 * chained turn, or any other client never saw the browser's bookkeeping.
 *
 * ATM14g moved the job to where the state lives: saving a member's engine
 * makes the daemon stamp it onto every live conv bound to that member and
 * broadcast `conv.meta_updated` per conv. So the rule here is now the plain
 * one: the conv's own engine wins when it has one, the member card fills the
 * gaps. A header retune is an ordinary pin that lasts until the next save of
 * the card — no stamps, no epochs, no tab-local memory.
 */

import { isStaleModelForClient } from './models.ts';

export interface ShadowConvMeta {
  member?: string;
  model?: string;
  effort?: string;
  client?: string;
  provider?: string;
}

/** Live roster values for one member (subset of TeamMember frontmatter). */
export interface ShadowMemberFile {
  model?: string;
  effort?: string;
  client?: string;
  provider?: string;
}

/** Daemon-side snapshot values for one conv (subset of the conv snapshot —
 *  its fields are `string | null`, hence the wider types). */
export interface ShadowSnap {
  model?: string | null;
  effort?: string | null;
  client?: string | null;
  provider?: string | null;
}

/** 'auto' / 'default' / empty all mean "no override — follow the member". */
function override(value: string | null | undefined, follow: string): string {
  const v = (value ?? '').trim();
  return v === '' || v === follow ? '' : v;
}

/**
 * The engine a conv will actually run on its next turn.
 *
 * Resolution order matches `teamsvc._member_dispatch_prep` exactly, which is
 * the point — a header that disagrees with the daemon is how ATM14 stayed open
 * for four rounds: conv override → member card → daemon snapshot → default.
 * `client`/`provider` have no per-conv picker, so they read member-first.
 * Provider defaults to the concrete 'anthropic' (never ''): it mirrors the
 * daemon, where moving a member back to Anthropic must overwrite a stale
 * non-Anthropic value in the sidecar rather than leave it.
 */
/** The "no override" model sentinel depends on the client: claude-code
 *  offers an explicit `auto` entry, every other driver (codex / gemini /
 *  muse) uses the empty id — "Default (CLI config)", the first row of its
 *  daemon catalog. Defaulting a codeless member to `auto` under Codex is
 *  how an Anthropic id ended up displayed on a non-Anthropic engine. */
function defaultModelFor(client: string): string {
  return client === 'claude-code' ? 'auto' : '';
}

export function resolveDisplayEngine(
  meta: ShadowConvMeta | undefined,
  snap: ShadowSnap | null | undefined,
  member: ShadowMemberFile | undefined,
): { model: string; effort: string; client: string; provider: string } {
  const pinnedModel = override(meta?.model, 'auto');
  const pinnedEffort = override(meta?.effort, 'default');
  const pinnedProvider = (meta?.provider ?? '').trim().toLowerCase();
  const snapProvider = (snap?.provider ?? '').trim().toLowerCase();
  const memberProvider = (member?.provider ?? '').trim().toLowerCase();
  if (meta?.member && member) {
    const client =
      (member.client ?? '').trim()
      || (meta?.client ?? '').trim()
      || (snap?.client ?? '').trim()
      || 'claude-code';
    // ATM18: a resolved id from another client's catalog (pre-ATM17 Anthropic
    // id under Codex, from any of the three sources) heals to the CLI default
    // instead of painting a foreign model on this client's header — the combo
    // then offers only that client's feasible models.
    const rawModel = pinnedModel || (member.model ?? '').trim() || defaultModelFor(client);
    const model = isStaleModelForClient(client, rawModel) ? defaultModelFor(client) : rawModel;
    return {
      model,
      effort: pinnedEffort || (member.effort ?? '').trim() || 'default',
      client,
      provider: pinnedProvider || memberProvider || snapProvider || 'anthropic',
    };
  }
  // Unbound conv (or a member the roster hasn't hydrated yet): the daemon
  // snapshot is the best truth available.
  const fallbackClient = (meta?.client ?? '').trim() || (snap?.client ?? '').trim() || 'claude-code';
  const rawFallback = pinnedModel || (snap?.model ?? '').trim() || defaultModelFor(fallbackClient);
  const fallbackModel = isStaleModelForClient(fallbackClient, rawFallback)
    ? defaultModelFor(fallbackClient)
    : rawFallback;
  return {
    model: fallbackModel,
    effort: pinnedEffort || (snap?.effort ?? '').trim() || 'default',
    client: fallbackClient,
    provider: pinnedProvider || snapProvider || 'anthropic',
  };
}

/** ATM14f — a `<select value={live}>` whose `live` id matches NO option
 *  renders the wrong row (first option / blank), so the header combo
 *  would show a lie while the state underneath is already correct
 *  (catalog not yet hydrated, unknown client id, brand-new model id).
 *  Append the live value as its own trailing option so the combo ALWAYS
 *  displays the true engine value; a no-op when already listed. */
export function withLiveOption(
  options: { id: string; label: string }[],
  live: string | null | undefined,
): { id: string; label: string }[] {
  const v = (live ?? '').trim();
  if (!v) return options;
  if (options.some((o) => o.id === v)) return options;
  return [...options, { id: v, label: `${v} (member)` }];
}
