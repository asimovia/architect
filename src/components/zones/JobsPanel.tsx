/**
 * JobsPanel — jobs-and-links JL-2.
 *
 * The zone that answers "is anything actually running?". A Job is a
 * command the DAEMON runs as its own child (JL-1), so it survives the
 * browser and the agent that started it — which is exactly why the
 * cockpit needed a window onto it.
 *
 * Sibling of CronsPanel by design (same header shape, same list frame,
 * same WS-refresh reflex) but a different contract: crons are
 * schedules, jobs are processes.
 *
 * The data lives in `state/jobs.ts`, NOT here: the header's "Jobs (N)"
 * badge needs the same list while this panel is closed, and two
 * independent pollers would drift.
 */

import { For, Show, createSignal } from 'solid-js';
import { jobsStore, isJobLive } from '~/state/jobs';
import JobsHeader from './jobs/JobsHeader';
import JobRow from './jobs/JobRow';
import JobCreateForm from './jobs/JobCreateForm';

export default function JobsPanel() {
  const [creating, setCreating] = createSignal(false);
  const s = jobsStore.state;
  const jobs = () => s.list;
  const running = () => jobs().filter(isJobLive).length;

  return (
    <div class="flex-1 flex flex-col min-h-0 max-w-[1600px] mx-auto w-full px-5 py-6 gap-4">
      <JobsHeader
        total={jobs().length}
        running={running()}
        newOpen={creating()}
        disabled={s.unsupported}
        onNew={() => setCreating((v) => !v)}
      />

      <Show when={s.error}>
        <div class="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300 font-mono">
          {s.error}
        </div>
      </Show>

      <Show when={creating()}>
        <JobCreateForm onCancel={() => setCreating(false)} onSubmit={jobsStore.create} />
      </Show>

      <Show when={s.unsupported}>
        <UnsupportedNotice />
      </Show>

      <Show when={!s.unsupported}>
        <Show
          when={s.hydrated}
          fallback={
            <div class="flex-1 flex items-center justify-center text-xs text-gray-500">
              Loading <span class="font-mono ml-1">/jobs</span>…
            </div>
          }
        >
          <div class="flex-1 min-h-0 overflow-y-auto">
            <div class="rounded-lg border border-gray-800/60 bg-gray-900/30 overflow-hidden max-w-3xl">
              <div class="px-3 py-2 border-b border-gray-800/60 flex items-center justify-between text-[11px] font-mono">
                <span class="text-gray-400">{jobs().length} job(s)</span>
                <span class={running() > 0 ? 'text-emerald-400' : 'text-gray-500'}>
                  {running()} running
                </span>
              </div>
              <Show when={jobs().length > 0} fallback={<EmptyNotice />}>
                <ul class="divide-y divide-gray-800/40">
                  <For each={jobs()}>
                    {(job) => (
                      <JobRow
                        job={job}
                        onStart={jobsStore.start}
                        onStop={jobsStore.stop}
                        onRestart={jobsStore.restart}
                        onDelete={jobsStore.remove}
                      />
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function EmptyNotice() {
  return (
    <div class="px-4 py-6 text-center text-xs text-gray-500 leading-relaxed">
      Nothing running.
      <br />
      Agents start jobs with <span class="font-mono text-gray-400">POST /jobs</span>; use
      <span class="font-mono text-gray-400"> + new job</span> to start one yourself.
    </div>
  );
}

function UnsupportedNotice() {
  return (
    <div class="rounded-lg border border-gray-800/70 bg-gray-900/40 px-5 py-6 text-sm text-gray-400 max-w-3xl">
      <p class="mb-2">This daemon has no jobs registry yet.</p>
      <p class="text-[12px] text-gray-500">
        <span class="font-mono text-gray-400">GET /jobs</span> answers 404. The zone lights up on
        its own once the daemon self-updates to a build that serves the jobs surface — nothing to
        configure here.
      </p>
    </div>
  );
}
