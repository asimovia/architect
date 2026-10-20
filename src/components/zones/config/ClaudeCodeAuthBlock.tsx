/**
 * ClaudeCodeAuthBlock — CCA1. Machine-level "is Claude Code signed in?" with
 * the sign-in / renew / forget actions. The token itself never reaches the
 * cockpit: the daemon reports only whether one is stored and until when.
 */

import { Show, createEffect } from 'solid-js';
import { daemonStore } from '~/state/daemon';
import { claudeAuth, claudeLoginSupported, refreshClaudeAuth } from '~/state/claude-auth';
import { Block } from './atoms';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ClaudeCodeAuthBlock(props: { active: boolean }) {
  createEffect(() => {
    if (props.active && daemonStore.state.client) void refreshClaudeAuth();
  });
  const forget = async (): Promise<void> => {
    const c = daemonStore.state.client;
    if (!c) return;
    await c.claudeAuthForget();
    void refreshClaudeAuth();
  };
  return (
    <Show when={claudeLoginSupported()}>
      <Block title="Claude Code sign-in" subtitle="The account every Claude Code agent on this computer runs on.">
        <Show when={claudeAuth.status()} fallback={<p class="text-[12px] text-gray-500">Checking…</p>}>
          {(s) => (
            <div class="flex items-center gap-3 flex-wrap text-[12.5px]">
              <span class={s().signed_in ? 'text-emerald-300' : 'text-amber-300'}>
                {s().stored
                  ? `Connected from the Architect · until ${fmtDate(s().expires_at)}`
                  : s().cli?.logged_in
                    ? `Signed in from a terminal (${s().cli?.subscription ?? s().cli?.method ?? 'claude.ai'}) — it can expire`
                    : s().expired ? 'The Architect sign-in expired' : 'Not signed in'}
              </span>
              <button
                type="button"
                onClick={() => claudeAuth.open()}
                class="px-3 py-1.5 rounded text-[12px] bg-emerald-500 text-gray-950 font-semibold hover:bg-emerald-400"
              >{s().stored ? 'Renew' : 'Sign in'}</button>
              <Show when={s().stored}>
                <button
                  type="button"
                  onClick={() => void forget()}
                  class="px-3 py-1.5 rounded text-[12px] bg-gray-900 text-gray-300 border border-gray-800 hover:border-gray-700"
                >Forget</button>
              </Show>
            </div>
          )}
        </Show>
      </Block>
    </Show>
  );
}
