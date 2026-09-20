/**
 * JobRow — one job in the Jobs zone list.
 *
 * Shows the five things the operator asked for at a glance — name,
 * command, state, port, uptime — plus the three controls. `stop` and
 * `delete` confirm first: a job is somebody's running server, and the
 * agent that started it is not watching this screen.
 */

import { Show, createSignal } from 'solid-js';
import { mcAlert, mcConfirm } from '~/lib/modal';
import { isJobLive } from '~/state/jobs';
import type { Job } from '~/lib/daemon-client';

/** Seconds → "3d 4h" / "12m" / "48s". Prefers the daemon's own
 *  `uptime_sec`; falls back to `started_at` when it is absent. */
export function formatUptime(job: Job): string | null {
  let sec = typeof job.uptime_sec === 'number' ? job.uptime_sec : NaN;
  if (!Number.isFinite(sec) && job.started_at) {
    const t = Date.parse(job.started_at);
    if (Number.isFinite(t)) sec = (Date.now() - t) / 1000;
  }
  if (!Number.isFinite(sec) || sec < 0) return null;
  const s = Math.floor(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

const DOT: Record<string, string> = {
  running: 'bg-emerald-400',
  stopped: 'bg-gray-600',
  failed: 'bg-red-400',
};

type Action = (id: string) => Promise<{ ok: boolean; message?: string }>;

export default function JobRow(props: {
  job: Job;
  onStart: Action;
  onStop: Action;
  onRestart: Action;
  onDelete: Action;
}) {
  const [busy, setBusy] = createSignal<null | 'stop' | 'restart' | 'delete'>(null);
  const live = () => isJobLive(props.job);
  const uptime = () => formatUptime(props.job);

  async function run(
    kind: 'stop' | 'restart' | 'delete',
    call: () => Promise<{ ok: boolean; message?: string }>,
  ) {
    setBusy(kind);
    const r = await call();
    setBusy(null);
    if (!r.ok) await mcAlert(r.message ?? 'The daemon refused.', { title: `Could not ${kind}`, okLabel: 'OK' });
  }

  async function onStop() {
    const yes = await mcConfirm(
      `Stop "${props.job.name}"? The daemon kills the process tree; the job definition stays so you can restart it.`,
      { title: 'Stop job', okLabel: 'Stop', danger: true },
    );
    if (yes) await run('stop', () => props.onStop(props.job.id));
  }

  async function onDelete() {
    const yes = await mcConfirm(
      `Delete "${props.job.name}"? This stops the process AND removes the job. It cannot be undone from here.`,
      { title: 'Delete job', okLabel: 'Delete', danger: true },
    );
    if (yes) await run('delete', () => props.onDelete(props.job.id));
  }

  return (
    <li class="px-3 py-2.5">
      <div class="flex items-center gap-2 min-w-0">
        <span
          class={`inline-block w-2 h-2 rounded-full shrink-0 ${DOT[props.job.status] ?? 'bg-gray-600'}`}
          title={props.job.status}
        />
        <span class="text-sm text-gray-100 font-medium truncate">{props.job.name}</span>
        <span class="text-[10px] text-gray-500 font-mono shrink-0">{props.job.id}</span>
        <div class="flex-1" />
        <span class="text-[10px] font-mono uppercase tracking-wider shrink-0 text-gray-500">
          {props.job.status}
        </span>
      </div>

      <code
        class="mt-1 block text-[11px] font-mono text-gray-400 truncate"
        title={props.job.command}
      >
        {props.job.command}
      </code>

      <div class="mt-1 flex items-center gap-3 text-[11px] font-mono text-gray-500 flex-wrap">
        <Show when={props.job.port}>
          <span class="text-sky-300/80">:{props.job.port}</span>
        </Show>
        <Show when={live() && uptime()}>
          <span>up {uptime()}</span>
        </Show>
        <Show when={!live() && typeof props.job.exit_code === 'number'}>
          <span class={props.job.exit_code === 0 ? '' : 'text-red-400'}>exit {props.job.exit_code}</span>
        </Show>
        <Show when={props.job.cwd && props.job.cwd !== '.'}>
          <span class="truncate max-w-[280px] text-gray-600" title={props.job.cwd}>{props.job.cwd}</span>
        </Show>
        <Show when={props.job.pid && live()}>
          <span class="text-gray-600">pid {props.job.pid}</span>
        </Show>
      </div>

      <Show when={props.job.status === 'failed' && props.job.reason}>
        <p class="mt-1 text-[11px] text-red-300/90 font-mono truncate" title={props.job.reason!}>
          {props.job.reason}
        </p>
      </Show>

      <div class="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void onStop()}
          disabled={!live() || busy() !== null}
          class="px-2 py-1 rounded-md text-[10px] font-medium bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
        >
          {busy() === 'stop' ? 'Stopping…' : 'Stop'}
        </button>
        <button
          type="button"
          onClick={() =>
            void run('restart', () =>
              live() ? props.onRestart(props.job.id) : props.onStart(props.job.id),
            )
          }
          disabled={busy() !== null}
          class="px-2 py-1 rounded-md text-[10px] font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
        >
          {busy() === 'restart' ? (live() ? 'Restarting…' : 'Starting…') : live() ? 'Restart' : 'Start'}
        </button>
        <button
          type="button"
          onClick={() => void onDelete()}
          disabled={busy() !== null}
          class="px-2 py-1 rounded-md text-[10px] font-medium bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
        >
          {busy() === 'delete' ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </li>
  );
}
