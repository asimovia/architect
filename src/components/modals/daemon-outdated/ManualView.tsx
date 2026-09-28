import { JSX, createSignal } from 'solid-js';
import { log } from '~/lib/log';

export type ManualViewProps = {
  shellCmd: string;
  onBack: () => void;
};

export function ManualView(props: ManualViewProps): JSX.Element {
  const [copied, setCopied] = createSignal(false);
  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.shellCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      log.warn('clipboard write failed', err);
    }
  };
  return (
    <>
      <div class="flex items-center gap-2 mb-3">
        <button
          type="button"
          class="text-[11px] text-gray-500 hover:text-emerald-300"
          onClick={props.onBack}
        >← back</button>
        <span class="text-[12px] text-gray-200 font-semibold">Paste in a terminal</span>
      </div>
      <pre class="bg-gray-950 border border-gray-800 rounded p-3 text-[11px] font-mono text-emerald-200 whitespace-pre-wrap leading-relaxed mb-3">{props.shellCmd}</pre>
      <div class="flex gap-2">
        <button
          type="button"
          class="flex-1 px-3 py-2 rounded bg-gray-900 text-gray-300 border border-gray-800 text-sm hover:text-gray-100 transition"
          onClick={doCopy}
        >{copied() ? 'copied ✓' : 'Copy command'}</button>
      </div>
    </>
  );
}

// BT-18 — ONE shared daemon per machine (standard v28, W4): member
// projects have no `.meshkore/scripts/daemon.py`, so the old
// download-into-the-project + pkill recipe was wrong for everyone.
// Restarting the shared daemon boots through its signed self-update.
export const SHELL_CMD =
  '# in the folder that holds this machine\'s shared daemon (meshkore-server):\n' +
  'make restart && make status';
