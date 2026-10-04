/**
 * PathPicker — absolute path input, a Browse… button that opens the OS
 * folder dialog through the daemon (PICK1), and a "how to copy" tip block.
 * `existing` semantics: path is the folder itself. `new` semantics:
 * path is the PARENT directory; the wizard creates ./<projectName>/.
 */
import { Show, createSignal } from 'solid-js';
import WizardStep from './WizardStep';
import { daemonStore } from '~/state/daemon';

export default function PathPicker(props: {
  startKind: 'existing' | 'new';
  projectName: string;
  value: string;
  onInput: (v: string) => void;
  onSubmit: () => void;
}) {
  const isExisting = props.startKind === 'existing';
  const title = isExisting ? 'Where is the folder?' : 'Where do we put the new folder?';
  const placeholder = isExisting ? '/Users/me/projects/my-app' : '/Users/me/projects';
  const subtitle = isExisting
    ? 'Absolute path to the existing project folder. We can pre-fill the project name from its folder name on the next step.'
    : (
      <>
        Absolute path to the PARENT folder. We create{' '}
        <code class="font-mono text-emerald-300">./{props.projectName || 'my-project'}/</code>{' '}
        inside it.
      </>
    );

  // PICK1 — a browser cannot read a folder's absolute path, but the daemon
  // runs on this machine: it opens the OS's own folder dialog for us.
  const canBrowse = () =>
    !!daemonStore.state.client && (daemonStore.state.health?.features ?? []).includes('fs.pick-folder.v1');
  const [browsing, setBrowsing] = createSignal(false);
  const [browseNote, setBrowseNote] = createSignal('');
  const browse = async () => {
    const c = daemonStore.state.client;
    if (!c || browsing()) return;
    setBrowsing(true);
    setBrowseNote('');
    const res = await c.pickFolder(
      isExisting ? 'Choose the project folder' : 'Choose where to create the project',
      props.value.trim() || undefined,
    );
    setBrowsing(false);
    if (res.ok && res.data.path) { props.onInput(res.data.path); return; }
    if (res.ok) return; // cancelled
    setBrowseNote(
      res.status === 409 ? 'A folder window is already open — check behind this one.'
        : res.status === 501 ? 'This machine cannot show a folder window — paste the path instead.'
          : 'Could not open the folder window — paste the path instead.',
    );
  };

  return (
    <WizardStep title={title} subtitle={subtitle}>
      <div class="flex gap-2">
      <input
        type="text"
        autofocus
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); props.onSubmit(); } }}
        placeholder={placeholder}
        autocomplete="off"
        spellcheck={false}
        class="flex-1 min-w-0 bg-[rgba(11,18,32,0.6)] border border-gray-700/50 rounded-lg px-3.5 py-3 text-[14px] font-mono text-gray-100 focus:outline-none focus:border-emerald-500/60 focus:bg-[rgba(11,18,32,0.85)] placeholder:text-gray-500"
      />
      <Show when={canBrowse()}>
        <button
          type="button"
          onClick={() => void browse()}
          disabled={browsing()}
          class="shrink-0 px-4 rounded-lg text-[13px] font-medium text-gray-200 border border-gray-600/60 bg-gray-900/60 hover:border-emerald-500/60 hover:text-white disabled:opacity-60 disabled:cursor-wait transition"
        >{browsing() ? 'Choosing…' : 'Browse…'}</button>
      </Show>
      </div>
      <Show when={browsing()}>
        <div class="text-[12px] text-gray-400">A folder window is open on this computer — pick the folder there.</div>
      </Show>
      <Show when={browseNote()}>
        <div class="text-[12px] text-amber-300">{browseNote()}</div>
      </Show>
      <div class="bg-blue-500/10 border border-blue-500/25 rounded-lg px-3 py-2.5 text-[12px] text-slate-300 leading-relaxed">
        <div class="font-semibold text-gray-200 mb-0.5">How to copy the absolute path</div>
        <div>· macOS: in Finder, ⌘+click the folder → <em class="not-italic text-blue-300">"Copy &lt;name&gt; as Pathname"</em></div>
        <div>· Windows: Shift+right-click the folder → <em class="not-italic text-blue-300">"Copy as path"</em></div>
        <div>· Linux / terminal: <code class="font-mono text-emerald-300">pwd</code> inside the folder</div>
      </div>
    </WizardStep>
  );
}
