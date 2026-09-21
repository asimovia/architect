/**
 * MemberDetailPanel — ATM6. Right-hand editor sliding over the roster.
 *
 * Per-section save: each section PATCHes only its own fields. `kind` and
 * `required` are shown but never editable (the daemon rejects them).
 * Optimistic store update with rollback + inline error on 4xx (handled
 * inside teamStore.update). A concurrent-edit warning fires when the
 * on-disk `updated:` timestamp moves while the panel is open.
 *
 * AX17 split the sections out to `team/detail/`; what stays here is the
 * shell: the working copies seeded from the member, the `saveSection`
 * plumbing every section shares, and the danger zone.
 */

import { Show, createEffect, createMemo, createResource, createSignal, onMount } from 'solid-js';
import { daemonStore } from '~/state/daemon';
import { teamStore } from '~/state/team';
import { clientsStore } from '~/state/clients';
import { DEFAULT_PROVIDER } from '~/lib/models';
import type { EngineChoice } from '~/components/team/ClientModelEffortPicker';
import { engineFromSaved, isEngineDirty } from '~/lib/team-engine-draft';
import { appliedText, deletedText } from '~/lib/team-errors';
import { ModelSection } from '~/components/team/detail/ModelSection';
import { PromptSection } from '~/components/team/detail/PromptSection';
import { RefsSection } from '~/components/team/detail/RefsSection';
import { ExternalAccessSection } from '~/components/team/detail/ExternalAccessSection';
import { ConfirmButtons } from '~/components/ui/ConfirmButtons';

export default function MemberDetailPanel(props: {
  memberId: string;
  onClose: () => void;
  onDeleted?: (info: string | null) => void;
  onDuplicated?: (id: string) => void;
}) {
  const client = () => daemonStore.state.client;
  const member = () => teamStore.get(props.memberId);

  // Lazy-load the init-prompt body.
  const [detail] = createResource(
    () => props.memberId,
    async (id) => {
      const c = client();
      if (!c) return null;
      return teamStore.detail(c, id);
    },
  );

  // Editable working copies (seeded from the member / detail once loaded).
  const [engine, setEngine] = createSignal<EngineChoice>({
    client: 'claude-code',
    provider: DEFAULT_PROVIDER,
    model: 'sonnet',
    effort: 'default',
  });
  const [prompt, setPrompt] = createSignal<string>('');
  const [refs, setRefs] = createSignal<string[]>([]);
  const [promptTab, setPromptTab] = createSignal<'edit' | 'preview'>('edit');

  const [savingSection, setSavingSection] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  // TMR3 — one line saying where the last save actually landed (which
  // open instances took it, which are mid-turn). Cleared on the next edit.
  const [applied, setApplied] = createSignal<string | null>(null);
  const [duplicating, setDuplicating] = createSignal(false);
  // ATM16 — which member the engine draft was seeded from. A background
  // roster refresh must not silently discard an unsaved draft.
  const [engineSeededFor, setEngineSeededFor] = createSignal<string | null>(null);
  // ATM16 — the draft left the browser only via the section Save. While it
  // differs from the saved card, open headers (correctly) keep showing the
  // saved engine — the badge says so instead of looking like a sync bug.
  const engineDirty = (): boolean => isEngineDirty(member() ?? undefined, engine());

  // Capture the on-disk `updated:` at mount; warn if it moves (another
  // cockpit tab edited the same member) — ATM6 concurrent-edit warning.
  const mountedUpdated = member()?.updated ?? null;
  const diskMoved = createMemo(() => {
    const cur = member()?.updated ?? null;
    return mountedUpdated !== null && cur !== null && cur !== mountedUpdated;
  });

  // DM-CLI-13 — re-probe the client/provider catalog whenever this panel
  // opens. It is one cheap GET (the daemon probes `which` + key presence
  // fresh per request) and it is the difference between "I set the Meta key
  // in ⚙ General and the dropdown still won't offer it" and it being there.
  // The catalog is otherwise fetched once per cluster, so a key saved in
  // ANOTHER cockpit tab — or in the config screen of a tab you then left —
  // would never reach this dropdown until a reload.
  onMount(() => {
    const c = daemonStore.state.client;
    if (c) void clientsStore.hydrate(c);
  });

  // Seed working copies once the frontmatter + body are available.
  // ATM16 — the engine draft is re-seeded only into a clean draft (or for a
  // different member): a background re-hydrate while the operator is picking
  // a model must not silently eat the pick. Refs/prompt keep the old
  // always-reseed behaviour (separate sections, separate concern).
  createEffect(() => {
    const m = member();
    if (m && (engineSeededFor() !== props.memberId || !engineDirty())) {
      setEngine(engineFromSaved(m));
      setEngineSeededFor(props.memberId);
    }
  });
  createEffect(() => {
    const m = member();
    if (m) setRefs(Array.isArray(m.refs) ? [...m.refs] : []);
    const d = detail();
    if (d) setPrompt(d.body ?? '');
  });

  const required = () => member()?.required === true;
  const exposure = () => member()?.exposure ?? 'internal';

  const saveSection = async (section: string, body: Record<string, unknown>): Promise<void> => {
    const c = client();
    if (!c) {
      setError('Not connected to the daemon — reconnect (reload the page) and try again.');
      return;
    }
    setSavingSection(section);
    setError(null);
    setApplied(null);
    const res = await teamStore.update(c, props.memberId, body);
    setSavingSection(null);
    if (!res.ok) {
      // TMR4 — the daemon's own reason, not just the number: "model is
      // mandatory", "effort must be one of …". Without it a refused save
      // reads as "the panel won't let me change it".
      setError(res.error ?? `Save failed (HTTP ${res.status}) — reverted.`);
      return;
    }
    setApplied(appliedText(res.applied));
    // ATM14g — nothing else to do here. The daemon applies an engine change
    // to every conv bound to this member as part of the save (permanently, on
    // disk) and broadcasts it, so open headers follow within ~1s and the next
    // turn — in this tab or any other — already runs the new CLI + LLM.
  };

  const del = async (): Promise<void> => {
    const c = client();
    if (!c) {
      setError('Not connected to the daemon — reconnect (reload the page) and try again.');
      return;
    }
    const res = await teamStore.remove(c, props.memberId);
    if (res.ok) {
      // TMR2 — the delete closed a circle: say what else moved (who
      // stopped delegating to it, which open agents kept running).
      props.onDeleted?.(deletedText(res.result));
      props.onClose();
    } else if (res.status === 409) {
      setError(res.error ?? 'This member is required and cannot be deleted.');
    } else {
      setError(res.error ?? `Delete failed (HTTP ${res.status}).`);
    }
  };

  /** TMR3 — the whole card under a new id, for the operator who wants a
   *  variant of a member instead of writing one from scratch. */
  const duplicate = async (): Promise<void> => {
    const c = client();
    if (!c || duplicating()) return;
    setDuplicating(true);
    setError(null);
    const res = await teamStore.duplicate(c, props.memberId);
    setDuplicating(false);
    if (!res.ok) {
      setError(res.error ?? `Duplicate failed (HTTP ${res.status}).`);
      return;
    }
    props.onDuplicated?.(res.member.id);
  };

  return (
    <div class="fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div class="absolute inset-0 bg-[rgba(2,4,12,0.6)] backdrop-blur-sm" aria-hidden="true" />
      <aside class="relative w-full max-w-xl h-full bg-[#0b1220] border-l border-gray-700/40 shadow-2xl flex flex-col">
        <header class="flex items-center gap-2.5 px-4 py-3 border-b border-gray-800/60">
          <span class="text-2xl leading-none" aria-hidden="true">{member()?.emoji ?? '🤖'}</span>
          <div class="flex-1 min-w-0">
            <h2 class="text-[15px] font-semibold text-gray-100 truncate">{member()?.name ?? props.memberId}</h2>
            <div class="flex items-center gap-1.5 mt-0.5">
              <span class="font-mono text-[9px] uppercase tracking-wider text-gray-400 bg-gray-800/60 border border-gray-700/60 rounded px-1.5 py-0.5">
                {member()?.kind ?? 'profile'}
              </span>
              <Show when={required()}>
                <span class="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5" title="Required member — kind/required immutable, cannot be deleted">
                  🔒 required
                </span>
              </Show>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { void duplicate(); }}
            disabled={duplicating()}
            class="text-[11px] font-mono uppercase tracking-wider text-gray-300 hover:text-emerald-200 border border-gray-700/60 hover:border-emerald-500/50 rounded px-2 py-1 disabled:opacity-50"
            title="Create a copy of this member — engine, references and init prompt included"
          >{duplicating() ? '…' : 'Duplicate'}</button>
          <button type="button" onClick={props.onClose} class="text-gray-400 hover:text-gray-100 px-2 py-1" aria-label="Close">✕</button>
        </header>

        <div class="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          <Show when={diskMoved()}>
            <div class="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
              This member was changed elsewhere since you opened it. Saving here overwrites those changes (last-write-wins).
            </div>
          </Show>
          <Show when={error()}>
            <div class="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">{error()}</div>
          </Show>
          <Show when={applied()}>
            <div class="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-200">
              {applied()}
            </div>
          </Show>
          <ModelSection
            value={engine()}
            onChange={setEngine}
            saving={savingSection() === 'model'}
            dirty={engineDirty()}
            onSave={(body) => { void saveSection('model', body); }}
          />

          <PromptSection
            prompt={prompt()}
            onPrompt={setPrompt}
            tab={promptTab()}
            onTab={setPromptTab}
            saving={savingSection() === 'prompt'}
            onSave={(body) => { void saveSection('prompt', body); }}
          />

          <RefsSection
            refs={refs()}
            onRefs={setRefs}
            saving={savingSection() === 'refs'}
            onSave={(body) => { void saveSection('refs', body); }}
          />

          <ExternalAccessSection
            memberId={props.memberId}
            exposure={exposure()}
            savingSection={savingSection()}
            onError={setError}
            onSave={saveSection}
            onSavingSection={setSavingSection}
          />

          {/* Danger zone — hidden when the member is required. */}
          <Show when={!required()}>
            <section class="space-y-2 pt-2 border-t border-gray-800/60">
              <h3 class="font-mono text-[10px] uppercase tracking-[0.14em] text-red-400/80">Danger zone</h3>
              <ConfirmButtons
                question={`Delete "${member()?.name ?? props.memberId}"? This cannot be undone.`}
                confirmLabel="Delete"
                onConfirm={() => { void del(); }}
                trigger={(arm) => (
                  <button
                    type="button"
                    onClick={arm}
                    class="text-[12px] font-mono text-red-300 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 rounded px-3 py-1.5"
                  >Delete member</button>
                )}
              />
            </section>
          </Show>
        </div>
      </aside>
    </div>
  );
}
