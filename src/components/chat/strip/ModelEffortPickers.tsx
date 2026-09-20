/**
 * ModelEffortPickers — ATM7. Model and effort stay editable for the
 * whole life of a conv: every turn is a fresh `claude -p`, so a change
 * applies from the NEXT message. Both are persisted to convMeta and sent
 * on the next dispatch.
 *
 * Precedence is daemon-authoritative-then-local: the value from
 * `chat.snapshot` wins on first paint; once the operator picks, convMeta
 * carries it forward.
 *
 * DM-CLI-08 (multi-cli-clients) — the catalogs follow the CLI this conv
 * actually runs on, not always claude-code's. The client itself is set
 * on the roster member, not per-turn, so it is read-only here.
 * ATM17 — claude-code models follow the conv's PROVIDER (Anthropic /
 * Meta / ZAI), the same catalog the member editor offers: a Muse member
 * shows Muse models in the header, not Anthropic ones with the truth
 * hiding in a "(member)" fallback row.
 * ATM19 — those option lists now come from `lib/engine-chain`, the same
 * module the member editor renders from (one chain, one answer), and
 * both selects go through `bindSelectValue`: the catalog arrives after
 * the first paint, and Solid re-applies a select's value only when the
 * VALUE changes, never when the options do.
 */

import { For, createMemo } from 'solid-js';
import { chatStore } from '~/state/chat';
import { clientsStore } from '~/state/clients';
import { withLiveOption } from '~/lib/member-shadow';
import { bindSelectValue } from '~/lib/select-sync';
import { effortOptionsFor, modelOptionsFor, withLiveModel } from '~/lib/engine-chain';

const SELECT_MODEL =
  'bg-purple-500/10 border border-purple-500/30 rounded px-1.5 py-0.5 text-[10px] font-mono '
  + 'text-purple-200 focus:outline-none focus:border-purple-400/60 max-w-[110px]';
const SELECT_EFFORT =
  'bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 text-[10px] font-mono '
  + 'text-amber-200/90 focus:outline-none focus:border-amber-400/60';

export default function ModelEffortPickers(props: {
  conv: string;
  model: string;
  effort: string;
  client: string;
  provider: string;
}) {
  const catalog = createMemo(() => clientsStore.catalogFor(props.client));
  // The live value is always offered as its own row: without a matching
  // <option> the select would render some other model while the state
  // underneath is already correct (catalog not hydrated, unknown client,
  // a pinned id the catalog doesn't list).
  const modelGroups = createMemo(() =>
    withLiveModel(modelOptionsFor(props.client, props.provider, catalog()), props.model),
  );
  const liveEfforts = createMemo(() => withLiveOption(effortOptionsFor(props.client, catalog()), props.effort));
  const modelTitle = (): string =>
    `Model — applies from the next turn (${props.client === 'claude-code' ? props.provider : props.client})`;

  return (
    <div class="flex items-center gap-1 flex-shrink-0">
      <select
        ref={(el) => bindSelectValue(el, () => props.model, modelGroups)}
        value={props.model}
        onChange={(e) => chatStore.setConvModel(props.conv, e.currentTarget.value)}
        title={modelTitle()}
        class={SELECT_MODEL}
      >
        <For each={modelGroups()}>
          {(g) => (
            g.group
              ? (
                <optgroup label={g.group}>
                  <For each={g.items}>{(m) => <option value={m.id}>{m.label}</option>}</For>
                </optgroup>
              )
              : <For each={g.items}>{(m) => <option value={m.id}>{m.label}</option>}</For>
          )}
        </For>
      </select>
      <select
        ref={(el) => bindSelectValue(el, () => props.effort, liveEfforts)}
        value={props.effort}
        onChange={(e) => chatStore.setConvEffort(props.conv, e.currentTarget.value)}
        title="Effort (reasoning depth) — applies from the next turn"
        class={SELECT_EFFORT}
      >
        <For each={liveEfforts()}>
          {(e) => <option value={e.id}>{e.label}</option>}
        </For>
      </select>
    </div>
  );
}
