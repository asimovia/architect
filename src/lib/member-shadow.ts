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
  /** ATM14d — epoch ms of the last deliberate header retune per dial.
   *  Absent = legacy pin (set before stamps existed). */
  modelPinAt?: number;
  effortPinAt?: number;
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

/** ATM14d — a header pin applies only when it is NEWER than the member's
 *  last engine save. Legacy pins (no stamp) always lose to the file;
 *  a pin retuned after the save wins until the next save. `saveAt` is
 *  null when this browser never saved the member — then any stamped pin
 *  (retuned this session) is live, any legacy pin is stale. */
export function pinIsLive(
  pinAt: number | undefined | null,
  saveAt: number | undefined | null,
): boolean {
  if (typeof pinAt !== 'number' || !Number.isFinite(pinAt) || pinAt <= 0) return false;
  if (saveAt === undefined || saveAt === null) return true;
  return pinAt >= saveAt;
}

/** Live-pin check per dial for a bound conv's meta (unbound convs keep
 *  their pins — there is no member file to follow). */
export function modelPinLive(
  meta: ShadowConvMeta | undefined,
  saveAt: number | undefined | null,
): boolean {
  const m = (meta?.model ?? '').trim();
  if (m === '' || m === 'auto') return false;
  return pinIsLive(meta?.modelPinAt, saveAt);
}

export function effortPinLive(
  meta: ShadowConvMeta | undefined,
  saveAt: number | undefined | null,
): boolean {
  const e = (meta?.effort ?? '').trim();
  if (e === '' || e === 'default') return false;
  return pinIsLive(meta?.effortPinAt, saveAt);
}

/** What an open chat header shows for its engine (ATM14c realtime sync,
 *  ATM14d pin-stamp rule).
 *
 *  A bound conv that FOLLOWS the member (model 'auto', effort 'default')
 *  displays the LIVE roster values — so saving the member file updates
 *  every open header within ~1s via the team.updated WS hydrate, with no
 *  click and no new turn. A header retune (a pin) displays only while it
 *  is live per {@link pinIsLive} — retuned after the member's last engine
 *  save; legacy pins and pre-save pins read as the roster value, matching
 *  what the next dispatch actually sends. client is never sent per-turn,
 *  so the member file always wins for it. Unbound convs (or a bound
 *  member missing from the roster) keep the daemon-snap-first behaviour. */
export function resolveDisplayEngine(
  meta: ShadowConvMeta | undefined,
  snap: ShadowSnap | null | undefined,
  member: ShadowMemberFile | undefined,
  saveAt?: number | null,
): { model: string; effort: string; client: string } {
  const metaModel = (meta?.model ?? '').trim();
  const metaEffort = (meta?.effort ?? '').trim();
  if (meta?.member && member) {
    // ATM14d — a stale pin (legacy, or set before the last member save)
    // reads as the live roster value, so the header matches the engine
    // the next dispatch will actually use. Only a live pin displays.
    return {
      model: modelPinLive(meta, saveAt)
        ? metaModel
        : (member.model ?? '').trim() || 'auto',
      effort: effortPinLive(meta, saveAt)
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
