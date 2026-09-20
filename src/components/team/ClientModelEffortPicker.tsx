/**
 * ClientModelEffortPicker — the dial that decides WHICH engine runs a
 * team member: CLI client → provider → model → reasoning effort.
 *
 * AX17 (cockpit-excellence). The same four controls existed twice, ~80%
 * identical, in MemberDetailPanel and NewMemberDialog, and they have to
 * stay identical: the daemon's ClientDrivers (DM-CLI-08) and the
 * multi-provider work (MPV1) both key off these exact four fields, and
 * a member saved with one panel's idea of a valid combination is
 * dispatched by the other's.
 *
 * The chain itself (which options each combo offers, what the combos
 * below reset to) lives in `lib/engine-chain.ts` — the chat-wall header
 * reads the same module, so the card and the header cannot disagree.
 *
 * ATM21 — these are `<Combo>`s, not native `<select>`s. The row a native
 * select displays is the browser's, and on an async catalog it stopped
 * agreeing with the state: a Muse member read "Claude Code" with Muse
 * models under it. Two rounds of patching that (ATM19 re-applying
 * `el.value`, ATM19b `selected` per option) did not end the reports, so
 * the displayed label is now a pure function of the value.
 *
 * Provider is claude-code-only — the other CLIs bring their own auth.
 */

import { For, Show, createMemo, onMount } from 'solid-js';
import { clientsStore } from '~/state/clients';
import { daemonStore } from '~/state/daemon';
import { withLiveOption } from '~/lib/member-shadow';
import { Combo, type ComboOption } from '~/components/ui/Combo';
import { DEFAULT_PROVIDER, PROVIDERS } from '~/lib/models';
import {
  effortOptionsFor,
  isClaudeCode,
  modelOptionsFor,
  selectClient,
  selectProvider,
  withLiveModel,
  type EngineChoice,
} from '~/lib/engine-chain';

const LABEL_CLASS = 'block font-mono text-[10px] uppercase tracking-[0.14em] text-gray-500 mb-1.5';

export type { EngineChoice };

/** Normalise a choice for submission: only claude-code carries a provider. */
export function engineBody(c: EngineChoice): EngineChoice {
  return {
    client: c.client,
    provider: isClaudeCode(c.client) ? c.provider : DEFAULT_PROVIDER,
    model: c.model,
    effort: c.effort,
  };
}

export function ClientModelEffortPicker(props: {
  value: EngineChoice;
  onChange: (next: EngineChoice) => void;
  /** Render field labels above each control (the create dialog does;
   *  the detail panel's section header already names them). */
  labels?: boolean;
}) {
  // DM-CLI-15 — re-probe on every editor open: a CLI installed while the
  // cockpit is up stays "not installed" until something refetches, and a
  // full browser refresh was the only recourse. The picker mounts fresh
  // with each editor, so one cheap GET /clients here keeps every dropdown
  // honest — on demand, no polling.
  onMount(() => {
    const c = daemonStore.state.client;
    if (c) void clientsStore.hydrate(c);
  });
  const isClaude = (): boolean => isClaudeCode(props.value.client);
  const catalog = createMemo(() => clientsStore.catalogFor(props.value.client));

  // Every combo offers the LIVE value even when the catalog does not list
  // it (daemon too old, not yet hydrated, a CLI uninstalled since the
  // member was saved) — and `Combo` shows the raw id rather than another
  // option's label if even that is missing.
  const clientOptions = createMemo<ComboOption[]>(() => {
    const list = clientsStore.options().map((c) => ({
      id: c.id,
      label: c.label,
      // DM-CLI-14 — the value already saved stays pickable even when its
      // probe reads false; on a fresh machine every probe reads false.
      disabled: (c.installed === false || c.authConfigured === false) && c.id !== props.value.client,
      note: c.installed === false
        ? 'not installed on daemon host'
        : c.authConfigured === false
          ? 'authentication required or disabled — see ⚙ General settings'
          : null,
    }));
    const cur = (props.value.client || '').trim();
    if (!cur || list.some((c) => c.id === cur)) return list;
    return [...list, { id: cur, label: cur, disabled: false, note: 'not in the daemon catalog' }];
  });
  const providerOptions = createMemo<ComboOption[]>(() => {
    const list = clientsStore.providersFor('claude-code').map((p) => ({
      id: p.id,
      label: p.label,
      disabled: !p.available && p.id !== props.value.provider,
      note: p.requiresKey && !p.available ? 'needs API key — set in Config' : null,
    }));
    const cur = (props.value.provider || '').trim();
    if (!cur || list.some((p) => p.id === cur)) return list;
    const meta = PROVIDERS.find((p) => p.id === cur);
    return [...list, { id: cur, label: meta?.label ?? cur, disabled: false, note: 'not reported by the daemon' }];
  });
  const modelOptions = createMemo<ComboOption[]>(() =>
    withLiveModel(modelOptionsFor(props.value.client, props.value.provider, catalog()), props.value.model)
      .flatMap((g) => g.items.map((m) => ({ id: m.id, label: m.label, group: g.group }))),
  );
  const liveEfforts = createMemo(() =>
    withLiveOption(effortOptionsFor(props.value.client, catalog()), props.value.effort),
  );
  // The note rows carry the "why is this greyed out" text the old
  // <option> labels used to concatenate into the row itself.
  const noteOf = (o: ComboOption): string | null => o.note ?? null;

  // The combos are one chain driven by a single source (engine-chain):
  // client → provider → model, effort ← client. Changing one above always
  // re-seeds everything below from the NEW selection's catalog, so a
  // leftover id from the old CLI/provider is never submitted for the new
  // one; an empty catalog (daemon not yet hydrated) seeds '' / 'default'
  // — "CLI default" — never another client's model.
  const onClientChange = (id: string): void => {
    props.onChange(selectClient(id, clientsStore.catalogFor(id)));
  };
  const onProviderChange = (id: string): void => {
    props.onChange(selectProvider(props.value, id, catalog()));
  };

  return (
    <>
      <div>
        <Show when={props.labels}>
          <label class={LABEL_CLASS}>Client</label>
        </Show>
        <Combo
          ariaLabel="Client"
          value={props.value.client}
          options={clientOptions()}
          onChange={onClientChange}
          noteFor={noteOf}
        />
      </div>

      {/* Provider (MPV1) — claude-code only. Unavailable providers (no key
          set in Config) are shown but not pickable. */}
      <Show when={isClaude()}>
        <div>
          <label class={props.labels ? LABEL_CLASS : 'block font-mono text-[9px] uppercase tracking-[0.14em] text-gray-600'}>
            Provider
          </label>
          <Combo
            ariaLabel="Provider"
            value={props.value.provider}
            options={providerOptions()}
            onChange={onProviderChange}
            noteFor={noteOf}
          />
        </div>
      </Show>

      <div>
        <Show when={props.labels}>
          <label class={LABEL_CLASS}>
            Model <span class="text-gray-600 normal-case tracking-normal">· required</span>
          </label>
        </Show>
        <Combo
          ariaLabel="Model"
          value={props.value.model}
          options={modelOptions()}
          onChange={(id) => props.onChange({ ...props.value, model: id })}
          placeholder={modelOptions().length ? '—' : 'Loading catalog…'}
        />
      </div>

      <div>
        <Show when={props.labels}>
          <label class={LABEL_CLASS}>
            Effort <span class="text-gray-600 normal-case tracking-normal">· reasoning depth</span>
          </label>
        </Show>
        <div class="flex flex-wrap gap-1">
          <For each={liveEfforts()}>
            {(e) => (
              <button
                type="button"
                onClick={() => props.onChange({ ...props.value, effort: e.id })}
                aria-pressed={props.value.effort === e.id}
                class="px-2.5 py-1.5 text-[12px] font-mono border transition flex-shrink-0"
                classList={{
                  'bg-emerald-500/12 border-emerald-500/60 text-white': props.value.effort === e.id,
                  'bg-[rgba(11,18,32,0.5)] border-gray-700/40 text-gray-300 hover:text-gray-100': props.value.effort !== e.id,
                }}
              >{e.label}</button>
            )}
          </For>
        </div>
      </div>
    </>
  );
}

export default ClientModelEffortPicker;
