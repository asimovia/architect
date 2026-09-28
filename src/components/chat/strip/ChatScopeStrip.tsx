/**
 * ChatScopeStrip — the row above the chat thread.
 *
 * Left to right: one identity box (member emoji + name › conv title;
 * type and the internal A001-style id in its tooltip — ES-3), the live
 * client/model/effort pickers, the usage chip, the context gauge, a
 * debug-drop badge and the action icons. STOP lives under the composer (ES-9).
 *
 * AX17 (cockpit-excellence) split the 453-line component: each chip
 * above is its own file under `chat/strip/`. Several were inline
 * `{(() => {…})()}` subtrees, which create untracked scopes — a real
 * Solid reactivity trap.
 */

import { Show, createSignal } from 'solid-js';
import { chatStore, ONBOARDING_CONV_ID, type ConvMeta } from '~/state/chat';
import { resolveDisplayEngine } from '~/lib/member-shadow';
import { teamStore } from '~/state/team';
import { agentVisualInfo } from '~/lib/agent-types';
import { debugDropCount } from '~/lib/debug-transport';
import ContextGauge from './ContextGauge';
import ModelEffortPickers from './ModelEffortPickers';
import StripActions from './StripActions';
import TitleEditor from './TitleEditor';
import UsageChip from './UsageChip';

interface Props {
  conv: string;
  meta: ConvMeta | undefined;
  historyOpen: boolean;
  onToggleHistory: () => void;
  onRename: (next: string) => void;
  onArchive: () => void;
}

export default function ChatScopeStrip(props: Props) {
  const [editing, setEditing] = createSignal(false);

  // CN10 — display name resolves exactly like AgentCard (title → conv
  // slug). The A00N agentId stays internal (pill/tooltip metadata), never
  // the primary name — otherwise rail and header show two names for one conv.
  const title = () => props.meta?.title?.trim() || props.conv;
  // py-1.10.24 — conv-aware lookup, so the onboarding conv shows as
  // Architect and roadmap-architect slugs keep the cyan cap even
  // when conv_meta has drifted.
  const typeInfo = () => agentVisualInfo(props.conv, props.meta);

  const snap = () => chatStore.state.convs[props.conv] ?? null;
  // ATM14g — the header reads the same three sources the daemon resolves a
  // turn from, in the same order (conv override → member card → snapshot), so
  // what it shows is what the next turn runs. Saving the member card updates
  // it within ~1s without a click: the daemon writes the new engine into the
  // conv's sidecar and broadcasts `conv.meta_updated`, and the roster
  // re-hydrates on `team.updated` — both are reactive stores, both feed here.
  const engine = () =>
    resolveDisplayEngine(props.meta, snap(), teamStore.get(props.meta?.member));
  const modelId = (): string => engine().model;
  const effortId = (): string => engine().effort;
  const clientId = (): string => engine().client;
  const providerId = (): string => engine().provider;

  // ATM12 follow-up (2026-07-07) — the fixed-agent explainer. ES-8
  // (2026-09-27) moved it from a second header line into the title box's
  // tooltip: the operator wants the title on screen and the profile on hover.
  //
  // ORC3 (2026-09-22) — it now states the ROLE, not just a warning. The
  // cluster has exactly two system agents and the split between them is
  // the product: one owns the plan, the other runs it, and neither writes
  // code. An operator who cannot see that from the header ends up asking
  // the wrong one for the wrong thing.
  const systemRole = (): { name: string; scope: string } | null => {
    if (props.conv === ONBOARDING_CONV_ID) {
      return {
        name: 'Project architect',
        scope: 'context · roadmap · priorities — plans the work, never writes code',
      };
    }
    return null;
  };

  // ATM7 — a conv is a DRAFT until it has any message: member and name
  // are editable until then, frozen to a read-only badge afterwards. The
  // onboarding conv is never a draft (it is the always-on master).
  const boundMember = () => teamStore.get(props.meta?.member);
  const memberName = (): string => boundMember()?.name ?? props.meta?.member ?? '';
  // ES-8 — the box shows the TITLE and nothing else, so it looks the same
  // on every visit. Who the agent is (member profile, type, system role)
  // is one hover away. Showing "member › title" only when the two
  // differed made the header change shape between visits as the title
  // hydrated — it read as two different headers.
  const identityTooltip = (): string => {
    const role = systemRole();
    return [
      props.meta?.member ? `Profile: ${memberName()} (frozen after the first message)` : null,
      role ? `System agent — ${role.name}: ${role.scope}` : null,
      `Type: ${typeInfo().label}${props.meta?.agentId ? ` · ${props.meta.agentId}` : ''}`,
    ].filter(Boolean).join('\n');
  };
  const commitRename = (next: string): void => {
    setEditing(false);
    if (next !== (props.meta?.title ?? '')) props.onRename(next);
  };

  /** Chat is the default view; the only way to leave the thread today is
   *  the history toggle, so the chat icon closes it. */
  const goChat = (): void => { if (props.historyOpen) props.onToggleHistory(); };

  return (
    <div class="flex flex-col border-b border-gray-800/60">
      <div class="flex items-center gap-2 px-2 py-1.5">
        <Show
          when={!editing()}
          fallback={
            <TitleEditor
              initial={props.meta?.title ?? ''}
              agentId={props.meta?.agentId}
              onCommit={commitRename}
              onCancel={() => setEditing(false)}
            />
          }
        >
          {/* ES-3/ES-8 — ONE box with the title; the profile is its tooltip. */}
          <div class="flex-1 min-w-0 flex items-center">
            <span
              class="inline-flex items-center gap-1.5 min-w-0 max-w-full px-2 py-0.5 rounded text-[12px] text-gray-100 bg-gray-800/60 border border-gray-700/60"
              title={identityTooltip()}
            >
              <span aria-hidden="true" class="flex-shrink-0">{boundMember()?.emoji ?? '🤖'}</span>
              <span class="font-semibold truncate">{title()}</span>
            </span>
          </div>
          <ModelEffortPickers
            conv={props.conv}
            model={modelId()}
            effort={effortId()}
            client={clientId()}
            provider={providerId()}
          />
          <Show when={snap()?.usage}>
            {(usage) => <UsageChip usage={usage()} />}
          </Show>
          <Show when={typeof snap()?.context?.fill_ratio === 'number'}>
            <ContextGauge context={snap()!.context!} />
          </Show>
          {/* V50 — the cockpit's `/debug/log` buffer dropped events
              (daemon unreachable or rejecting), so the interleaved
              daemon+cockpit tail has gaps until it drains. */}
          <Show when={debugDropCount() > 0}>
            <span
              class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-amber-200 bg-amber-500/10 border border-amber-500/30 flex-shrink-0"
              title={`Debug stream: ${debugDropCount()} event(s) dropped (buffer overflow). The daemon is unreachable or rejecting — /debug/tail will have gaps until the buffer drains.`}
            >
              ⚠ debug-drops {debugDropCount()}
            </span>
          </Show>
        </Show>
        <Show when={!editing()}>
          <StripActions
            conv={props.conv}
            chatActive={!props.historyOpen}
            historyOpen={props.historyOpen}
            onGoChat={goChat}
            onRename={() => setEditing(true)}
            onToggleHistory={props.onToggleHistory}
            onArchive={props.onArchive}
          />
        </Show>
      </div>
    </div>
  );
}
