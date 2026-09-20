/**
 * JobCreateForm — the minimal manual path into the job registry.
 *
 * Deliberately three fields (name · command · cwd). The usual way a job
 * is born is an agent POSTing /jobs (JL-1); this form exists so the
 * operator is never blocked on one, not to become a launcher UI.
 */

import { Show, createSignal, type JSX } from 'solid-js';

export default function JobCreateForm(props: {
  onCancel: () => void;
  onSubmit: (body: { name: string; command: string; cwd?: string }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [name, setName] = createSignal('');
  const [command, setCommand] = createSignal('');
  const [cwd, setCwd] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const valid = () => name().trim().length > 0 && command().trim().length > 0;

  async function submit(e: Event) {
    e.preventDefault();
    if (!valid() || busy()) return;
    setBusy(true);
    setError(null);
    const r = await props.onSubmit({
      name: name().trim(),
      command: command().trim(),
      cwd: cwd().trim() || undefined,
    });
    setBusy(false);
    if (r.ok) props.onCancel();
    else setError(r.message ?? 'The daemon refused the job.');
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      class="rounded-lg border border-gray-800/60 bg-gray-900/40 px-3 py-3 flex flex-col gap-2.5"
    >
      <Field label="Name" hint="How it shows in this list">
        <input
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          placeholder="webapp dev server"
          class="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-1.5 text-[12px] text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/40"
        />
      </Field>
      <Field label="Command" hint="Run as a child of the daemon — it keeps running when you close this tab">
        <input
          value={command()}
          onInput={(e) => setCommand(e.currentTarget.value)}
          placeholder="npm run dev"
          class="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-1.5 text-[12px] font-mono text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/40"
        />
      </Field>
      <Field label="Working directory" hint="Optional — defaults to the project root">
        <input
          value={cwd()}
          onInput={(e) => setCwd(e.currentTarget.value)}
          placeholder="webapp"
          class="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-1.5 text-[12px] font-mono text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/40"
        />
      </Field>

      <Show when={error()}>
        <p class="text-[11px] text-red-300 font-mono">{error()}</p>
      </Show>

      <div class="flex items-center gap-2 pt-0.5">
        <button
          type="submit"
          disabled={!valid() || busy()}
          class="px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
        >
          {busy() ? 'Starting…' : 'Create & start'}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          class="px-2.5 py-1 rounded-md text-[11px] text-gray-400 hover:text-gray-200 border border-transparent hover:border-gray-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field(props: { label: string; hint?: string; children: JSX.Element }) {
  return (
    <label class="flex flex-col gap-1">
      <span class="text-[10px] font-mono uppercase tracking-wider text-gray-500">{props.label}</span>
      {props.children}
      <Show when={props.hint}>
        <span class="text-[10px] text-gray-600 leading-snug">{props.hint}</span>
      </Show>
    </label>
  );
}
