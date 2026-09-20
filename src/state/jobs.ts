/**
 * state/jobs.ts — reactive mirror of the daemon's job registry
 * (jobs-and-links JL-1/JL-2).
 *
 * A Job is a command the DAEMON runs as its own child process, so it
 * outlives the browser tab and the agent that started it. The operator's
 * root problem: the tester agent spins up local instances (ports,
 * containers) and nothing in the cockpit showed whether anything was
 * running.
 *
 * Why a store and not a panel-local resource: the header's "Jobs (N)"
 * badge must be live in EVERY zone, not only while the Jobs panel is
 * open. The feed is mounted once from `Header` (always mounted) via
 * `mountJobsFeed()`; the panel and the badge both read this store, so
 * they can never disagree and there is only one /jobs poller.
 *
 * Daemon older than JL-1 → every call 404s. That is `unsupported`, not
 * an error: the badge hides itself and the panel explains the version
 * gap instead of showing a red banner.
 */

import { createEffect, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import { daemonStore } from '~/state/daemon';
import { log } from '~/lib/log';
import { captureClusterEpoch, isCurrentEpoch } from '~/lib/swap-guard';
import type { DaemonClient, Job, JobCreateBody, Result } from '~/lib/daemon-client';

interface JobsStoreState {
  list: Job[];
  hydrated: boolean;
  loading: boolean;
  /** Daemon has no /jobs surface (pre-JL-1). Not an error. */
  unsupported: boolean;
  error: string | null;
}

const [state, setState] = createStore<JobsStoreState>({
  list: [],
  hydrated: false,
  loading: false,
  unsupported: false,
  error: null,
});

function reset(): void {
  setState({ list: [], hydrated: false, loading: false, unsupported: false, error: null });
}

/** The daemon may answer `{jobs:[…]}` (the contract) or a bare array.
 *  Normalising here keeps every consumer on one shape. */
function readList(data: unknown): Job[] {
  if (Array.isArray(data)) return data as Job[];
  const jobs = (data as { jobs?: unknown } | null)?.jobs;
  return Array.isArray(jobs) ? (jobs as Job[]) : [];
}

async function refresh(client: DaemonClient): Promise<void> {
  const epoch = captureClusterEpoch();
  setState('loading', true);
  const res = await client.jobs();
  if (!isCurrentEpoch(epoch)) {
    log.debug('[swap-guard] dropping stale /jobs response');
    return;
  }
  if (res.ok) {
    setState({
      list: readList(res.data),
      hydrated: true,
      loading: false,
      unsupported: false,
      error: null,
    });
    return;
  }
  const unsupported = res.status === 404;
  setState({
    list: [],
    hydrated: true,
    loading: false,
    unsupported,
    error: unsupported ? null : `GET /jobs → ${res.status} ${res.body.slice(0, 120)}`,
  });
  if (!unsupported) log.warn('jobsStore.refresh failed', { status: res.status });
}

/**
 * mountJobsFeed — bind the store to the ACTIVE daemon + socket.
 *
 * Call once from a component that is always mounted (Header). Both
 * effects key off `daemonStore.state.client` / `.ws`, which are the
 * project-swap signals: on a swap the store resets and refetches, and
 * the `jobs.updated` subscription re-binds to the NEW socket instead of
 * listening to the dead one (the V107.2 lesson from CronsPanel).
 */
export function mountJobsFeed(): void {
  createEffect(() => {
    const c = daemonStore.state.client;
    reset();
    if (!c) return;
    void refresh(c);
  });

  createEffect(() => {
    const ws = daemonStore.state.ws;
    if (!ws) return;
    const off = ws.on('jobs.updated', () => {
      const c = daemonStore.state.client;
      if (c) void refresh(c);
    });
    onCleanup(off);
  });
}

/** Explicit refetch for panel actions (post-mutation). */
async function reload(): Promise<void> {
  const c = daemonStore.state.client;
  if (c) await refresh(c);
}

/** A job counts as "on the machine" only while the daemon reports it
 *  running. `failed`/`stopped` are both "not there". */
export function isJobLive(j: Job): boolean {
  return j.status === 'running';
}

/** Live count for the header badge. A plain function, not a memo:
 *  the store read tracks inside whatever component calls it, and a
 *  module-level memo would be created outside any reactive root. */
function runningCount(): number {
  return state.list.filter(isJobLive).length;
}

type Mutation = { ok: true } | { ok: false; message: string };

async function mutate(
  label: string,
  call: (c: DaemonClient) => Promise<Result<unknown>>,
): Promise<Mutation> {
  const c = daemonStore.state.client;
  if (!c) return { ok: false, message: 'No daemon connection.' };
  const res = await call(c);
  if (!res.ok) {
    log.warn(`jobs ${label} failed`, res.status, res.body);
    return {
      ok: false,
      message:
        res.status === 404
          ? 'The daemon does not know this job (or has no /jobs surface yet).'
          : res.status === 409
            ? 'A job with that id already exists — pick another name.'
            : `${label} failed (${res.status}). ${res.body.slice(0, 200)}`,
    };
  }
  await reload();
  return { ok: true };
}

const create = (body: JobCreateBody) => mutate('create', (c) => c.jobCreate(body));
const start = (id: string) => mutate('start', (c) => c.jobStart(id));
const stop = (id: string) => mutate('stop', (c) => c.jobStop(id));
const restart = (id: string) => mutate('restart', (c) => c.jobRestart(id));
const remove = (id: string) => mutate('delete', (c) => c.jobDelete(id));

export const jobsStore = {
  state,
  runningCount,
  reload,
  create,
  start,
  stop,
  restart,
  remove,
};

log.debug('state/jobs loaded');
