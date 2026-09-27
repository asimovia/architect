/**
 * ModelEffortPickers — the conv's engine, editable for its whole life.
 * Every turn is a fresh CLI process, so a change applies from the NEXT
 * message.
 *
 * Three dials, left to right: code client, model, effort.
 *
 * ES-2 (2026-09-27) — the CLIENT is now editable here too. It used to be
 * a read-only badge ("set it on the roster member"), which meant an agent
 * opened on a CLI with no credit could only be rescued from the team
 * drawer. Picking a client re-seeds model + effort from that client's
 * catalog (engine-chain `selectClient`) and pins it on the conv: the
 * daemon keeps it for every later turn, puts a "new code client from
 * here" divider in the thread, and gives the first turn on it the full
 * briefing. Saving the member card's engine un-pins it.
 * claude-code's backend (Anthropic / ZAI / Meta) is folded into the same
 * dial — to the operator "Claude on ZAI" is a different client.
 *
 * Effort shows as a position on the client's own scale (`3/5`), the
 * list keeps the names. The header has to fit beside the roadmap.
 *
 * History: ATM7 (live model/effort), DM-CLI-08 (catalogs follow the
 * conv's CLI), ATM17 (provider catalogs), ATM19 (one engine chain),
 * ATM21 (`<Combo>`, never a native `<select>`).
 */

import { createMemo } from 'solid-js';
import { chatStore } from '~/state/chat';
import { clientsStore } from '~/state/clients';
import { withLiveOption } from '~/lib/member-shadow';
import { Combo, type ComboOption } from '~/components/ui/Combo';
import {
  effortOptionsFor,
  effortShort,
  engineId,
  engineOptions,
  modelOptionsFor,
  parseEngineId,
  selectClient,
  selectProvider,
  withLiveModel,
} from '~/lib/engine-chain';

const CHIP = 'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono focus:outline-none';
const SELECT_CLIENT = `${CHIP} bg-sky-500/10 border border-sky-500/30 text-sky-200 hover:border-sky-400/60 max-w-[110px]`;
const SELECT_MODEL = `${CHIP} bg-purple-500/10 border border-purple-500/30 text-purple-200 hover:border-purple-400/60 max-w-[120px]`;
const SELECT_EFFORT = `${CHIP} bg-amber-500/10 border border-amber-500/30 text-amber-200/90 hover:border-amber-400/60`;

export default function ModelEffortPickers(props: {
  conv: string;
  model: string;
  effort: string;
  client: string;
  provider: string;
}) {
  const catalog = createMemo(() => clientsStore.catalogFor(props.client));

  const engineOpts = createMemo<ComboOption[]>(() =>
    engineOptions(
      clientsStore.options().map((c) => ({
        ...c,
        providers: c.id === 'claude-code' ? clientsStore.providersFor('claude-code') : undefined,
      })),
    ),
  );
  const pickEngine = (id: string): void => {
    const { client, provider } = parseEngineId(id);
    const cat = clientsStore.catalogFor(client);
    let next = selectClient(client, cat);
    if (provider !== next.provider) next = selectProvider(next, provider, cat);
    chatStore.setConvEngine(props.conv, next);
  };

  // The live value is always offered as its own row: without a matching
  // option the combo would render some other model while the state
  // underneath is already correct (catalog not hydrated, unknown client,
  // a pinned id the catalog doesn't list).
  const modelOptions = createMemo<ComboOption[]>(() =>
    withLiveModel(modelOptionsFor(props.client, props.provider, catalog()), props.model)
      .flatMap((g) => g.items.map((m) => ({ id: m.id, label: m.label, group: g.group }))),
  );
  const effortOpts = createMemo<ComboOption[]>(() => {
    const levels = effortOptionsFor(props.client, catalog());
    return withLiveOption(levels, props.effort).map((o) => ({ ...o, short: effortShort(levels, o.id) }));
  });

  return (
    <div class="flex items-center gap-1 flex-shrink-0">
      <Combo
        ariaLabel="Code client"
        class={SELECT_CLIENT}
        value={engineId(props.client, props.provider)}
        options={engineOpts()}
        onChange={pickEngine}
        title="Code client — applies from the next message (a new client starts a fresh session with the full briefing)"
      />
      <Combo
        ariaLabel="Model"
        class={SELECT_MODEL}
        value={props.model}
        options={modelOptions()}
        onChange={(id) => chatStore.setConvModel(props.conv, id)}
        title="Model — applies from the next message"
        placeholder={modelOptions().length ? '—' : 'loading…'}
      />
      <Combo
        ariaLabel="Effort"
        class={SELECT_EFFORT}
        value={props.effort}
        options={effortOpts()}
        onChange={(id) => chatStore.setConvEffort(props.conv, id)}
        title={`Effort (reasoning depth): ${effortOpts().find((o) => o.id === props.effort)?.label ?? props.effort} — applies from the next message`}
      />
    </div>
  );
}
