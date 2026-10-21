/**
 * AuthRequiredNotice — CCA1/CCA4. Replaces a Claude Code "Failed to
 * authenticate" reply with what it means and the one button that fixes it.
 * Once Claude Code is signed in again (after that failure), the card turns
 * into one line saying so: the operator can carry on. The raw text stays in
 * a <details> for proof.
 */

import { Show, onMount } from 'solid-js';
import { claudeAuth, claudeLoginSupported, refreshClaudeAuth } from '~/state/claude-auth';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AuthRequiredNotice(props: { text: string; ts?: string }) {
  onMount(() => { if (!claudeAuth.status()) void refreshClaudeAuth(); });
  // Signed in since this reply: a stored token newer than the failure, or a
  // daemon that now reports Claude Code signed in at all.
  const fixed = (): boolean => {
    const s = claudeAuth.status();
    if (!s?.signed_in) return false;
    if (!s.stored || !s.stored_at || !props.ts) return true;
    return s.stored_at >= props.ts;
  };
  return (
    <Show
      when={!fixed()}
      fallback={
        <div class="w-full pl-2 py-1 text-[12.5px] text-emerald-300/90">
          ✓ Claude Code is signed in again
          <Show when={claudeAuth.status()?.stored}> (until {fmtDate(claudeAuth.status()?.expires_at)})</Show>
          {' '}— you can carry on; send your message again to continue where this stopped.
        </div>
      }
    >
      <div class="w-full flex justify-center py-2">
        <div
          role="alert"
          class="max-w-[460px] w-full rounded-xl border border-amber-500/50 px-5 py-4 text-center shadow-lg"
          style={{ background: 'rgba(120, 53, 15, 0.28)' }}
        >
          <p class="font-semibold text-amber-200 text-[15px]">Claude Code is not signed in on this computer</p>
          <p class="mt-1.5 text-[12.5px] text-amber-100/80">
            The agent could not start: its login expired. Sign in once and send your message again.
          </p>
          <Show
            when={claudeLoginSupported()}
            fallback={
              <p class="mt-2 text-[12px] text-amber-100/70">
                Run <code class="font-mono">claude</code> in a terminal and type <code class="font-mono">/login</code>.
              </p>
            }
          >
            <button
              type="button"
              onClick={() => claudeAuth.open()}
              class="mt-3 px-4 py-2 rounded-lg bg-emerald-500 text-gray-950 font-semibold hover:bg-emerald-400"
            >Sign in to Claude Code</button>
          </Show>
          <details class="mt-2 text-left">
            <summary class="text-[11px] text-amber-100/50 cursor-pointer">What Claude Code said</summary>
            <pre class="mt-1 whitespace-pre-wrap font-mono text-[11px] text-amber-100/70">{props.text}</pre>
          </details>
        </div>
      </div>
    </Show>
  );
}
