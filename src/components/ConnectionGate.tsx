/**
 * ConnectionGate — pre-connect UI.
 *
 * Renders one of five mutually-exclusive states based on the
 * connection probe outcome: probing, no-daemon, unauthorized,
 * cloud-pending, error. Each state is a small private sub-component
 * below; the gate itself just dispatches on `status.kind`.
 */

import { Match, Show, Switch, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import type { ConnectionStatus } from '~/lib/connection';
import CommandBlock from '~/components/CommandBlock';
import {
  agentPromptForHome,
  certCheckCommand,
  meshctlDownloadCommand,
  recallDaemonHome,
  runningCheckCommand,
  tlsRefreshCommand,
  usesMeshctl,
  type DaemonHome,
} from '~/lib/daemon-home';
import { watchDaemonHealth } from '~/lib/health-watch';
import { log } from '~/lib/log';

export default function ConnectionGate(props: {
  status: ConnectionStatus;
  token: string;
  onTokenInput: (v: string) => void;
  onRetry: () => void;
  onSubmitToken: () => void;
}) {
  return (
    <main class="h-full flex items-center justify-center px-6 py-10 overflow-auto">
      <div class="max-w-xl w-full">
        <header class="mb-8">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-5">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
            MeshKore Architect
          </div>
          <h1 class="text-3xl md:text-4xl font-bold tracking-tight mb-2">
            One cockpit for your <span class="grad">AI agents</span>
          </h1>
          <p class="text-gray-400 leading-relaxed text-sm">
            This page connects to the MeshKore daemon on this machine and unlocks the cockpit. New here? Follow the setup at <a class="text-emerald-400 hover:underline" href="https://meshkore.com/architect" target="_blank" rel="noopener">meshkore.com/architect</a>.
          </p>
        </header>

        <section class="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 md:p-8">
          <Switch>
            <Match when={props.status.kind === 'probing'}>
              <Probing message={(props.status as Extract<ConnectionStatus, { kind: 'probing' }>).message} />
            </Match>
            <Match when={props.status.kind === 'no-daemon'}>
              <NoDaemon
                ports={(props.status as Extract<ConnectionStatus, { kind: 'no-daemon' }>).portsTried}
                onRetry={props.onRetry}
              />
            </Match>
            <Match when={props.status.kind === 'unauthorized'}>
              <Unauthorized
                token={props.token}
                onTokenInput={props.onTokenInput}
                onSubmit={props.onSubmitToken}
              />
            </Match>
            <Match when={props.status.kind === 'cloud-pending'}>
              <CloudPending token={(props.status as Extract<ConnectionStatus, { kind: 'cloud-pending' }>).token} />
            </Match>
            <Match when={props.status.kind === 'error'}>
              <ErrorView
                message={(props.status as Extract<ConnectionStatus, { kind: 'error' }>).message}
                onRetry={props.onRetry}
              />
            </Match>
          </Switch>
        </section>
      </div>
    </main>
  );
}

function Probing(props: { message: string }) {
  return (
    <div class="text-center py-4">
      <div class="inline-block w-7 h-7 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin mb-3" />
      <p class="text-gray-300 text-sm">{props.message}</p>
    </div>
  );
}

/** Relative "x ago" for a known project's last_seen ISO timestamp. */
function relativeLastSeen(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function NoDaemon(props: { ports: number[]; onRetry: () => void }) {
  // 2026-09-27 — ONE screen, because it is ONE daemon. This used to render a
  // "start me" row per known PROJECT, each with its own `cd <project> &&
  // python3 .meshkore/scripts/daemon.py --port 5573`: eight rows telling the
  // operator to start eight daemons that would fight over one port, and not
  // one of them naming the folder the daemon is actually installed in.
  // Operator: "es un proceso único en la máquina… una sola pantalla que me
  // indique en qué carpeta debería estar instalado y el comando para
  // arrancarlo".
  //
  // The folder comes from the last successful connection (`/health.home`,
  // remembered by lib/daemon-home) — the daemon tells us where it lives
  // while it is up, so we can say so while it is down.
  const home = createMemo(() => recallDaemonHome());
  const [showAgent, setShowAgent] = createSignal(false);

  // AX7 (UX-F6) — auto-connect once a daemon appears. `connect()` is
  // one-shot from App.onMount, so before this the operator could start
  // their daemon and watch nothing happen until they clicked Retry.
  // `repeatAfterUp` because onUp only ATTEMPTS the connection: if it
  // comes back no-daemon again this panel stays mounted and must keep
  // looking. Stops on unmount, i.e. as soon as the cockpit connects.
  onMount(() => {
    const stop = watchDaemonHealth({
      ports: () => props.ports,
      onUp: (port) => {
        log.info('[ConnectionGate] daemon appeared — reconnecting', { port });
        props.onRetry();
      },
      repeatAfterUp: true,
    });
    onCleanup(stop);
  });

  const probedRange = (): string => {
    const lo = props.ports[0];
    const hi = props.ports[props.ports.length - 1];
    return lo === hi ? `localhost:${lo}` : `localhost:${lo}–${hi}`;
  };
  const port = (): number => (props.ports.includes(5573) ? 5573 : props.ports[0] ?? 5573);
  const startCmd = (h: DaemonHome | null): string =>
    h ? h.start : 'cd "<meshkore-server folder>" && python3 .meshkore/scripts/daemon.py';

  // 2026-11-03 (DOC-DAEMON3) — "can't reach", not "not running". The browser
  // cannot tell a stopped daemon from a running one whose loopback
  // certificate expired (it happened), so the screen no longer asserts
  // either: it walks the checks in the order that tells them apart.
  return (
    <div>
      <h2 class="text-lg font-bold mb-2">Can&rsquo;t reach the MeshKore daemon</h2>
      <p class="text-gray-400 text-sm leading-relaxed mb-4">
        MeshKore runs <span class="text-gray-200">one daemon per machine</span> that serves every project.
        This page looked for it at <span class="font-mono text-emerald-300">{probedRange()}</span> and got no answer.
        It may be stopped{home() ? ' (a restart of the computer is the usual reason)' : ''}, or running with an
        expired certificate &mdash; from the browser both look the same. Check in this order:
      </p>

      <Show when={home()}>
        {(h) => (
          <div class="flex items-center gap-2.5 mb-3">
            <div class="flex-1 min-w-0">
              <div class="text-[12px] text-gray-500">Installed at</div>
              <div class="text-[12px] text-gray-300 font-mono break-all">{h().path}</div>
              <div class="text-[11px] text-gray-500 mt-0.5">last connected {relativeLastSeen(h().seen_at)}</div>
            </div>
          </div>
        )}
      </Show>

      <ol class="space-y-3 mb-4">
        <li class="bg-[rgba(11,18,32,0.6)] border border-gray-700/35 rounded-lg p-3.5">
          <div class="text-[13.5px] font-semibold text-gray-200 mb-1">1. Is it running?</div>
          <CommandBlock>{runningCheckCommand(port())}</CommandBlock>
          <p class="text-[12px] text-gray-500 leading-relaxed mt-2">
            JSON with <span class="font-mono text-gray-400">"ok": true</span> means it is running &mdash; go to step 2.
            No answer means it is stopped; start it:
          </p>
          <div class="mt-2">
            <CommandBlock>{startCmd(home())}</CommandBlock>
          </div>
          <Show
            when={usesMeshctl(home())}
            fallback={
              <p class="text-[11.5px] text-gray-500 leading-relaxed mt-2">
                This form stops when you close the terminal that runs it. To keep it running, and to make it
                start with the computer, get the control script and use{' '}
                <span class="font-mono text-gray-400">meshctl.sh start</span> /{' '}
                <span class="font-mono text-gray-400">install</span> (macOS and Linux):
                <span class="block mt-1.5">
                  <CommandBlock>{meshctlDownloadCommand(home())}</CommandBlock>
                </span>
              </p>
            }
          >
            <p class="text-[11.5px] text-gray-500 leading-relaxed mt-2">
              It keeps running after you close that terminal; stop it with{' '}
              <span class="font-mono text-gray-400">{home()!.stop}</span>.
            </p>
          </Show>
        </li>

        <li class="bg-[rgba(11,18,32,0.6)] border border-gray-700/35 rounded-lg p-3.5">
          <div class="text-[13.5px] font-semibold text-gray-200 mb-1">2. Is its certificate valid?</div>
          <p class="text-[12px] text-gray-500 leading-relaxed mb-2">
            The same check, without <span class="font-mono text-gray-400">-k</span> &mdash; this is the request the browser makes:
          </p>
          <CommandBlock>{certCheckCommand(port())}</CommandBlock>
          <p class="text-[12px] text-gray-500 leading-relaxed mt-2">
            A certificate error here (while step 1 answered), or <span class="font-mono text-gray-400">"tls": false</span> in
            step 1, means the TLS bundle next to the daemon is expired or missing. Fetch a current one, then restart the daemon:
          </p>
          <div class="mt-2">
            <CommandBlock multiline>{tlsRefreshCommand(home())}</CommandBlock>
          </div>
        </li>
      </ol>

      <p class="text-[12px] text-gray-500 leading-relaxed mb-4">
        Both fine and still nothing? Your router may block <span class="font-mono text-gray-400">daemon.meshkore.com</span> (it
        must resolve to 127.0.0.1). The full guide:{' '}
        <a class="text-emerald-300 hover:underline" href="https://meshkore.com/architect#daemon" target="_blank" rel="noreferrer">meshkore.com/architect#daemon</a>.
        This page reconnects on its own as soon as the daemon answers.
      </p>

      <div class="flex items-center gap-2">
        <button type="button" onClick={props.onRetry} class="px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-semibold text-xs transition-colors">
          Retry detection
        </button>
        <button
          type="button"
          onClick={() => setShowAgent((v) => !v)}
          class="text-[10px] uppercase tracking-wider px-2 py-1.5 rounded border border-gray-700 hover:border-emerald-500/50 text-gray-400 hover:text-emerald-200 transition-colors"
        >
          {showAgent() ? 'hide prompt' : 'Hand it to Claude Code'}
        </button>
      </div>
      <Show when={showAgent()}>
        <div class="mt-3">
          <CommandBlock multiline label="Paste this into Claude Code / Cursor / Cline">
            {agentPromptForHome(home())}
          </CommandBlock>
        </div>
      </Show>
    </div>
  );
}

function Unauthorized(props: { token: string; onTokenInput: (v: string) => void; onSubmit: () => void }) {
  return (
    <div>
      <h2 class="text-lg font-bold mb-2">Daemon found — needs a token</h2>
      <p class="text-gray-400 text-sm leading-relaxed mb-3">
        {/* AX9 (OB-F11) — the file is `portal-token`. `architect-token`
            never existed; operators pasted nothing and retried forever. */}
        Paste the contents of <span class="font-mono text-emerald-300">.meshkore/credentials/portal-token</span> below. Stored only in this browser.
      </p>
      <input
        type="password"
        value={props.token}
        onInput={(e) => props.onTokenInput((e.currentTarget as HTMLInputElement).value)}
        placeholder="Bearer token"
        class="w-full bg-gray-950 border border-gray-800 rounded-md px-3 py-2 text-sm font-mono text-gray-100 focus:outline-none focus:border-emerald-500/50 mb-3"
      />
      <button type="button" onClick={props.onSubmit} class="px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-semibold text-xs transition-colors">
        Save &amp; connect
      </button>
    </div>
  );
}

function CloudPending(props: { token: string }) {
  return (
    <div>
      <h2 class="text-lg font-bold mb-2">Cluster Cloud — coming soon</h2>
      <p class="text-gray-400 text-sm leading-relaxed mb-2">
        Cloud mode (<span class="font-mono">?cluster=…</span>) is wired in the client but the backend is not deployed yet (Cluster Cloud P1).
      </p>
      <p class="text-gray-400 text-sm leading-relaxed">
        Open this page without the <span class="font-mono">?cluster</span> parameter to connect to a local daemon.
      </p>
      <p class="text-[11px] text-gray-600 font-mono mt-3 break-all">token: {props.token.slice(0, 12)}…</p>
    </div>
  );
}

function ErrorView(props: { message: string; onRetry: () => void }) {
  return (
    <div>
      <h2 class="text-lg font-bold mb-2 text-red-400">Connection error</h2>
      <p class="text-gray-300 text-xs font-mono break-words mb-3">{props.message}</p>
      <button type="button" onClick={props.onRetry} class="px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-semibold text-xs transition-colors">
        Retry
      </button>
    </div>
  );
}
