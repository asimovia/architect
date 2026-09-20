/**
 * team-engine-draft.ts — ATM16. The member editor's engine section keeps a
 * local draft: ClientModelEffortPicker edits don't reach the daemon until
 * the section's Save PATCHes them. Two rules keep that draft honest:
 *
 * 1. The panel must SHOW when the draft differs from what the daemon saved
 *    (`isEngineDirty`). Without it the card reads "Muse" while every open
 *    header still — correctly — shows the saved "Opus", and the operator
 *    files it as a sync bug. It isn't one: the save never left the browser.
 * 2. A background roster refresh (another tab, another agent saving) must
 *    not silently clobber an unsaved draft — the panel re-seeds only into
 *    a clean draft, or when a different member is opened.
 */

import { DEFAULT_PROVIDER, isStaleModelForEngine } from './models.ts';
import { defaultModelFor } from './engine-chain.ts';

/** The four engine dials, as the picker edits them (all plain strings). */
export interface EngineDraft {
  client: string;
  provider: string;
  model: string;
  effort: string;
}

/** What the roster knows about a member (subset of TeamMember frontmatter). */
export interface EngineSaved {
  client?: string | null;
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
}

/**
 * The draft a fresh editor opens with for one member. Defaults mirror the
 * panel's seeding exactly — the draft and the dirty check must agree on
 * what "empty" means or a member with no engine pinned reads dirty on open.
 */
export function engineFromSaved(m: EngineSaved | undefined): EngineDraft {
  const client = (m?.client || '').trim() || 'claude-code';
  const provider = (m?.provider || '').trim() || DEFAULT_PROVIDER;
  const rawModel = (m?.model || '').trim();
  // The empty-model default is client-aware: claude-code keeps its historic
  // `sonnet`, every other driver uses the empty id — "Default (CLI config)",
  // the first row of its daemon catalog. Seeding `sonnet` under Codex is how
  // an Anthropic id got saved onto the wrong CLI.
  // ATM18: a model saved under another client (pre-ATM17 Anthropic id under
  // Codex) heals to the CLI default instead of seeding the draft with it —
  // otherwise the picker shows it back as a "(member)" row and the next
  // Save re-persists the mismatch.
  // ATM19: the heal is PROVIDER-aware too — under claude-code the feasible
  // catalog is the provider's, so an Anthropic id left on a member now set
  // to Meta is as foreign as one saved under Codex, and `defaultModelFor`
  // (the same function the combos reset to) decides what replaces it.
  const model =
    !rawModel || isStaleModelForEngine(client, provider, rawModel)
      ? defaultModelFor(client, provider, { models: [], efforts: [] })
      : rawModel;
  return {
    client,
    provider,
    model,
    effort: (m?.effort || '').trim() || 'default',
  };
}

/** True when the picker draft says something the daemon hasn't saved. */
export function isEngineDirty(saved: EngineSaved | undefined, draft: EngineDraft): boolean {
  const base = engineFromSaved(saved);
  return (
    base.client !== draft.client ||
    base.provider !== draft.provider ||
    base.model !== draft.model ||
    base.effort !== draft.effort
  );
}
