/**
 * member-shadow.ts — ATM14. A conv bound to a roster member still sends its
 * own model/effort on every dispatch when the operator once retuned them in
 * the chat header (anything but 'auto' / 'default'). The daemon's
 * "overrides win on any turn" rule (`teamsvc._member_dispatch_prep`) then
 * shadows the member file forever: editing the member's engine changes
 * nothing for that conv. client/provider are NOT shadowed — the cockpit
 * never sends them (`dispatch.ts` builds no `client`/`provider` fields),
 * so the member file wins for those on the next idle turn.
 */

export interface ShadowConvMeta {
  member?: string;
  model?: string;
  effort?: string;
}

/** Live roster values for one member (subset of TeamMember frontmatter). */
export interface ShadowMemberFile {
  model?: string;
  effort?: string;
  client?: string;
}

/** Daemon-side snapshot values for one conv (subset of the conv snapshot —
 *  its fields are `string | null`, hence the wider types). */
export interface ShadowSnap {
  model?: string | null;
  effort?: string | null;
  client?: string | null;
}

/** True when the conv carries its own engine override that beats the member
 *  file on every dispatch. 'auto' / 'default' / empty mean "follow the member". */
export function isPinnedOverride(model?: string, effort?: string): boolean {
  return (
    (model !== undefined && model !== '' && model !== 'auto') ||
    (effort !== undefined && effort !== '' && effort !== 'default')
  );
}

/** Bound, non-archived convs whose pinned model/effort shadow `memberId`'s
 *  engine settings. Sorted for stable rendering. */
export function findShadowedConvs(
  convMeta: Record<string, ShadowConvMeta>,
  archivedConvs: Record<string, true>,
  memberId: string,
): string[] {
  return Object.entries(convMeta)
    .filter(
      ([conv, meta]) =>
        meta?.member === memberId &&
        !archivedConvs[conv] &&
        isPinnedOverride(meta.model, meta.effort),
    )
    .map(([conv]) => conv)
    .sort();
}

/** One bound conv whose pin no longer matches the saved member file. */
export interface StalePin {
  conv: string;
  resetModel: boolean;
  resetEffort: boolean;
}

/** Subset of {@link findShadowedConvs} whose pin actually DIFFERS from the
 *  just-saved `fileModel` / `fileEffort`. Pins already equal to the file
 *  are harmless duplicates of it and are left alone, so a deliberate
 *  chat-header retune that happens to match the file survives a save.
 *  Model compares exact (ids are case-sensitive); effort compares
 *  lowercased (the daemon normalises it); an empty file value means
 *  follow-the-default, so any concrete pin is stale. Sorted by conv. */
export function stalePins(
  convMeta: Record<string, ShadowConvMeta>,
  archivedConvs: Record<string, true>,
  memberId: string,
  fileModel: string = '',
  fileEffort: string = '',
): StalePin[] {
  const fileM = (fileModel ?? '').trim();
  const fileE = ((fileEffort ?? '').trim().toLowerCase()) || 'default';
  return findShadowedConvs(convMeta, archivedConvs, memberId)
    .map((conv) => {
      const meta = convMeta[conv] ?? {};
      const pinM = (meta.model ?? '').trim();
      const pinE = (meta.effort ?? '').trim().toLowerCase();
      return {
        conv,
        resetModel: pinM !== '' && pinM !== 'auto' && pinM !== fileM,
        resetEffort: pinE !== '' && pinE !== 'default' && pinE !== fileE,
      };
    })
    .filter((s) => s.resetModel || s.resetEffort);
}

/** What an open chat header shows for its engine (ATM14c realtime sync).
 *
 *  A bound conv that FOLLOWS the member (model 'auto', effort 'default')
 *  displays the LIVE roster values — so saving the member file updates
 *  every open header within ~1s via the team.updated WS hydrate, with no
 *  click and no new turn. A deliberate header retune (a pin) keeps
 *  winning until the next member save releases it via {@link stalePins}.
 *  client is never sent per-turn, so the member file always wins for it.
 *  Unbound convs (or a bound member missing from the roster) keep the
 *  previous daemon-snap-first behaviour. */
export function resolveDisplayEngine(
  meta: ShadowConvMeta | undefined,
  snap: ShadowSnap | null | undefined,
  member: ShadowMemberFile | undefined,
): { model: string; effort: string; client: string } {
  const metaModel = (meta?.model ?? '').trim();
  const metaEffort = (meta?.effort ?? '').trim();
  if (meta?.member && member) {
    return {
      model: metaModel !== '' && metaModel !== 'auto'
        ? metaModel
        : (member.model ?? '').trim() || 'auto',
      effort: metaEffort !== '' && metaEffort !== 'default'
        ? metaEffort
        : (member.effort ?? '').trim() || 'default',
      client: (member.client ?? '').trim()
        || (snap?.client ?? '').trim()
        || (meta as ShadowConvMeta & { client?: string })?.client
        || 'claude-code',
    };
  }
  return {
    model: (snap?.model ?? '').trim() || metaModel || 'auto',
    effort: (snap?.effort ?? '').trim() || metaEffort || 'default',
    client: (snap?.client ?? '').trim()
      || (meta as ShadowConvMeta & { client?: string })?.client
      || 'claude-code',
  };
}
