/**
 * AuthRequiredNotice — CCA1. Replaces a Claude Code "Failed to authenticate"
 * reply with what it means and the one button that fixes it. The raw text
 * stays in a <details> for proof.
 */

import { Show } from 'solid-js';
import { claudeAuth, claudeLoginSupported } from '~/state/claude-auth';

export default function AuthRequiredNotice(props: { text: string }) {
  return (
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
  );
}
