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
 * ATM19 — those option lists come from `lib/engine-chain`, the same
 * module the member editor renders from: one chain, one answer.
 * ATM21 — and they render through `<Combo>`, not a native `<select>`:
 * the catalog arrives after the first paint, and a native select keeps
 * showing whatever row the browser picked meanwhile. The label is now a
 * pure function of the conv's engine.
 */

import { createMemo } from 'solid-js';
import { chatStore } from '~/state/chat';
import { clientsStore } from '~/state/clients';
import { withLiveOption } from '~/lib/member-shadow';
import { Combo, type ComboOption } from '~/components/ui/Combo';
import { effortOptionsFor, modelOptionsFor, withLiveModel } from '~/lib/engine-chain';

const SELECT_MODEL =
  'flex items-center gap-1 bg-purple-500/10 border border-purple-500/30 rounded px-1.5 py-0.5 '
  + 'text-[10px] font-mono text-purple-200 hover:border-purple-400/60 focus:outline-none max-w-[130px]';
const SELECT_EFFORT =
  'flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 '
  + 'text-[10px] font-mono text-amber-200/90 hover:border-amber-400/60 focus:outline-none max-w-[110px]';

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
  const modelOptions = createMemo<ComboOption[]>(() =>
    withLiveModel(modelOptionsFor(props.client, props.provider, catalog()), props.model)
      .flatMap((g) => g.items.map((m) => ({ id: m.id, label: m.label, group: g.group }))),
  );
  const liveEfforts = createMemo<ComboOption[]>(() =>
    withLiveOption(effortOptionsFor(props.client, catalog()), props.effort),
  );
  const modelTitle = (): string =>
    `Model — applies from the next turn (${props.client === 'claude-code' ? props.provider : props.client})`;

  return (
    <div class="flex items-center gap-1 flex-shrink-0">
      <Combo
        ariaLabel="Model"
        class={SELECT_MODEL}
        value={props.model}
        options={modelOptions()}
        onChange={(id) => chatStore.setConvModel(props.conv, id)}
        title={modelTitle()}
        placeholder={modelOptions().length ? '—' : 'loading…'}
      />
      <Combo
        ariaLabel="Effort"
        class={SELECT_EFFORT}
        value={props.effort}
        options={liveEfforts()}
        onChange={(id) => chatStore.setConvEffort(props.conv, id)}
        title="Effort (reasoning depth) — applies from the next turn"
      />
    </div>
  );
}
