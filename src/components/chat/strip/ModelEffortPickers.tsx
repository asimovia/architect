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
 */

import { For, Show } from 'solid-js';
import { chatStore } from '~/state/chat';
import { clientsStore } from '~/state/clients';
import { withLiveOption } from '~/lib/member-shadow';
import { EFFORT_CATALOG, providerCatalog } from '~/lib/models';

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
  const isClaudeCode = (): boolean => props.client === 'claude-code';
  const catalog = () => clientsStore.catalogFor(props.client);
  // claude-code models come from the conv's PROVIDER catalog (Anthropic /
  // Meta / ZAI) — the same source the member editor uses — never from a
  // hardcoded Anthropic-only list. Other clients use the daemon's live
  // /clients catalog for that client (possibly still empty → the live
  // value below keeps the combo honest instead of showing Claude models).
  const claudeModels = () => providerCatalog(props.provider);
  const claudeGroups = () => [...new Set(claudeModels().map((m) => m.group))];
  // ATM14f — the combos always offer the LIVE value, even when the
  // catalog hasn't caught up (not yet hydrated, unknown client, new
  // model id): without a matching <option> the select would render the
  // wrong row while the state underneath is already correct.
  const liveModels = () => withLiveOption(catalog().models, props.model);
  const liveEfforts = () =>
    withLiveOption(
      (isClaudeCode() ? EFFORT_CATALOG : catalog().efforts).map((e) => ({ id: e.id, label: e.label })),
      props.effort,
    );
  const claudeModelKnown = (): boolean => claudeModels().some((m) => m.id === props.model);
  return (
    <div class="flex items-center gap-1 flex-shrink-0">
      <Show
        when={isClaudeCode()}
        fallback={
          <select
            value={props.model}
            onChange={(e) => chatStore.setConvModel(props.conv, e.currentTarget.value)}
            title={`Model — applies from the next turn (${props.client})`}
            class={SELECT_MODEL}
          >
            <For each={liveModels()}>{(m) => <option value={m.id}>{m.label}</option>}</For>
          </select>
        }
      >
        <select
          value={props.model}
          onChange={(e) => chatStore.setConvModel(props.conv, e.currentTarget.value)}
          title={`Model — applies from the next turn (${props.provider})`}
          class={SELECT_MODEL}
        >
          <For each={claudeGroups()}>{(grp) => (
            <optgroup label={grp}>
              <For each={claudeModels().filter((m) => m.group === grp)}>
                {(m) => <option value={m.id}>{m.label}</option>}
              </For>
            </optgroup>
          )}</For>
          <Show when={!claudeModelKnown()}>
            <option value={props.model}>{`${props.model} (member)`}</option>
          </Show>
        </select>
      </Show>
      <select
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
