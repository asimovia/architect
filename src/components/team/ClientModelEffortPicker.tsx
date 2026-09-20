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
 * ATM19 — every combo here also goes through `bindSelectValue`. Its
 * options arrive from an async catalog, and Solid re-applies a select's
 * value only when the VALUE changes, never when the options do: without
 * it the Client combo read "Claude Code" on a Muse member (first row
 * wins when the value matches nothing) while the models below it were
 * correctly Muse's. See `lib/select-sync.ts`.
 *
 * Provider is claude-code-only — the other CLIs bring their own auth.
 */

import { For, Show, createMemo, onMount } from 'solid-js';
import { clientsStore } from '~/state/clients';
import { daemonStore } from '~/state/daemon';
import { withLiveOption } from '~/lib/member-shadow';
import { bindSelectValue } from '~/lib/select-sync';
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
import type { ClientInfo, ProviderInfo } from '~/lib/daemon-client';

const SELECT_CLASS =
  'w-full bg-[#020617] border border-gray-700/40 rounded px-2.5 py-1.5 text-[13px] font-mono text-gray-100 focus:outline-none focus:border-emerald-500/55';
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

  // Every combo below offers the LIVE value even when the catalog does
  // not list it (daemon too old, not yet hydrated, a client uninstalled
  // since the member was saved). A select whose value matches no option
  // renders a different row — a lie about what this member runs.
  const clientOptions = createMemo<ClientInfo[]>(() => {
    const list = clientsStore.options();
    const cur = (props.value.client || '').trim();
    if (!cur || list.some((c) => c.id === cur)) return list;
    return [...list, { id: cur, label: cur, installed: true, authConfigured: null, models: [], efforts: [] }];
  });
  const providerOptions = createMemo<ProviderInfo[]>(() => {
    const list = clientsStore.providersFor('claude-code');
    const cur = (props.value.provider || '').trim();
    if (!cur || list.some((p) => p.id === cur)) return list;
    const meta = PROVIDERS.find((p) => p.id === cur);
    return [...list, { id: cur, label: meta?.label ?? cur, requiresKey: meta?.requiresKey ?? true, available: false }];
  });
  const modelGroups = createMemo(() =>
    withLiveModel(modelOptionsFor(props.value.client, props.value.provider, catalog()), props.value.model),
  );
  const liveEfforts = createMemo(() =>
    withLiveOption(effortOptionsFor(props.value.client, catalog()), props.value.effort),
  );

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
        <select
          ref={(el) => bindSelectValue(el, () => props.value.client, clientOptions)}
          value={props.value.client}
          onChange={(e) => onClientChange(e.currentTarget.value)}
          class={SELECT_CLASS}
          aria-label="Client"
        >
          {/* DM-CLI-14 — the current client stays selectable even when its
              probe reads false (same rule the Provider dropdown already
              uses): on a fresh machine every probe reads false and the old
              code locked the operator out of even the value saved. */}
          <For each={clientOptions()}>
            {(c) => (
              <option value={c.id} disabled={(c.installed === false || c.authConfigured === false) && c.id !== props.value.client}>
                {c.label}
                {c.installed === false
                  ? ' (not installed on daemon host)'
                  : c.authConfigured === false
                    ? ' (authentication required or disabled — see ⚙ General settings)'
                    : ''}
              </option>
            )}
          </For>
        </select>
      </div>

      {/* Provider (MPV1) — claude-code only. Unavailable providers (no key
          set in Config) are shown but not selectable. */}
      <Show when={isClaude()}>
        <div>
          <label class={props.labels ? LABEL_CLASS : 'block font-mono text-[9px] uppercase tracking-[0.14em] text-gray-600'}>
            Provider
          </label>
          <select
            ref={(el) => bindSelectValue(el, () => props.value.provider, providerOptions)}
            value={props.value.provider}
            onChange={(e) => onProviderChange(e.currentTarget.value)}
            class={SELECT_CLASS}
            aria-label="Provider"
          >
            <For each={providerOptions()}>
              {(pr) => (
                <option value={pr.id} disabled={!pr.available && pr.id !== props.value.provider}>
                  {pr.label}
                  {pr.requiresKey && !pr.available ? ' (needs API key — set in Config)' : ''}
                </option>
              )}
            </For>
          </select>
        </div>
      </Show>

      <div>
        <Show when={props.labels}>
          <label class={LABEL_CLASS}>
            Model <span class="text-gray-600 normal-case tracking-normal">· required</span>
          </label>
        </Show>
        <select
          ref={(el) => bindSelectValue(el, () => props.value.model, modelGroups)}
          value={props.value.model}
          onChange={(e) => props.onChange({ ...props.value, model: e.currentTarget.value })}
          class={SELECT_CLASS}
          aria-label="Model"
        >
          <Show
            when={modelGroups().length > 0}
            fallback={<option value={props.value.model}>Loading catalog…</option>}
          >
            <For each={modelGroups()}>
              {(g) => (
                <Show
                  when={g.group}
                  fallback={<For each={g.items}>{(m) => <option value={m.id}>{m.label}</option>}</For>}
                >
                  <optgroup label={g.group as string}>
                    <For each={g.items}>{(m) => <option value={m.id}>{m.label}</option>}</For>
                  </optgroup>
                </Show>
              )}
            </For>
          </Show>
        </select>
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
