/** Header — V64 layout: logo + project plate · zone buttons + Config tab · version pill. */

import { Show, createSignal } from 'solid-js';
import { jobsStore, mountJobsFeed } from '~/state/jobs';
import { chatStore } from '~/state/chat';
import { daemonStore } from '~/state/daemon';
import { activeLinkStatus, type LinkStatus } from '~/lib/connection-status';
import { activeProject } from '~/state/projects';
import { uiStore, type Zone } from '~/state/ui';
import { mcModal } from '~/lib/modal';
import { useTlsDaemon, LOOPBACK_HOSTNAME } from '~/lib/transport';
import { isDaemonBehind, EXPECTED_DAEMON_VERSION } from '~/lib/version';
import { cockpitOutdated, latestCockpitBuild, COCKPIT_BUILD, COCKPIT_COMMIT } from '~/lib/cockpit-version';
import ThemePicker from '~/components/ThemePicker';
import GeneralConfigDrawer from '~/components/GeneralConfigDrawer';

const BUILD_VERSION = (import.meta.env.VITE_BUILD_VERSION as string | undefined) ?? 'dev';
const BUILD_COMMIT  = (import.meta.env.VITE_BUILD_COMMIT  as string | undefined) ?? '';
const BUILD_DATE    = (import.meta.env.VITE_BUILD_DATE    as string | undefined) ?? '';

function toggleTlsAndReload(next: boolean): void {
  try { localStorage.setItem('mc-daemon-via-tls', next ? '1' : '0'); } catch { /* quota */ }
  window.location.reload();
}

function openAboutModal(): void {
  const port = daemonStore.state.health?.port;
  const cluster = daemonStore.state.health?.cluster_name ?? daemonStore.state.health?.cluster_id ?? '—';
  const daemonV = daemonStore.state.health?.version ?? '—';
  const tls = useTlsDaemon();
  void mcModal({
    title: 'MeshKore Architect',
    subtitle: 'Operator cockpit for MeshKore clusters',
    body: () => (
      <div class="flex flex-col gap-3.5 py-2">
        <div class="flex items-center gap-2.5 flex-wrap">
          <span class="font-mono text-[11px] text-gray-500 tracking-widest uppercase">build</span>
          <span class="font-mono text-base text-emerald-400 font-bold">{COCKPIT_BUILD || BUILD_VERSION}</span>
          <span class="font-mono text-[10px] text-gray-600">· {BUILD_VERSION}</span>
          <Show when={BUILD_COMMIT}>
            <span class="font-mono text-[10px] text-gray-600">· {BUILD_COMMIT.slice(0, 7)}</span>
          </Show>
          <Show when={BUILD_DATE}>
            <span class="font-mono text-[10px] text-gray-600">· {BUILD_DATE.slice(0, 10)}</span>
          </Show>
          {/* The pill's amber half, spelled out: is THIS tab the deployed build? */}
          <span class={`font-mono text-[10px] ${cockpitOutdated() ? 'text-amber-300' : 'text-gray-500'}`}>
            {cockpitOutdated() ? `· build ${latestCockpitBuild() ?? '?'} is live — reload` : '· up to date'}
          </span>
        </div>
        <div class="h-px bg-gray-700/30" />
        <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
          <span class="font-mono text-[10px] text-gray-500 uppercase tracking-wider self-center">Cluster</span>
          <span class="text-gray-200">{cluster}</span>
          <span class="font-mono text-[10px] text-gray-500 uppercase tracking-wider self-center">Daemon</span>
          <span class="text-gray-200 font-mono text-[11px]">
            {daemonV}
            <span class={`ml-2 ${isDaemonBehind(daemonV) ? 'text-amber-300' : 'text-gray-500'}`}>
              {isDaemonBehind(daemonV) ? `· behind ${EXPECTED_DAEMON_VERSION}` : '· up to date'}
            </span>
          </span>
          <span class="font-mono text-[10px] text-gray-500 uppercase tracking-wider self-center">Endpoint</span>
          <span class="text-gray-200 font-mono text-[11px]">
            {port ? `${tls ? `https://${LOOPBACK_HOSTNAME}` : 'http://localhost'}:${port}` : '—'}
          </span>
          <span class="font-mono text-[10px] text-gray-500 uppercase tracking-wider self-center">TLS mode</span>
          <div class="flex items-center gap-2">
            <span class={`font-mono text-[11px] ${tls ? 'text-emerald-400' : 'text-gray-400'}`}>{tls ? 'ON · daemon.meshkore.com' : 'off · localhost'}</span>
            <button type="button"
              class="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500"
              onClick={() => toggleTlsAndReload(!tls)}>
              {tls ? 'switch off' : 'switch on'}
            </button>
          </div>
        </div>
        <Show when={tls}>
          <div class="text-[11px] text-amber-400/80 leading-relaxed">
            <strong>Heads-up:</strong> TLS mode points the cockpit at <code class="font-mono">https://{LOOPBACK_HOSTNAME}:&lt;port&gt;</code>. The daemon must serve TLS with a cert for that name. Until that lands in the daemon (task <code class="font-mono">local-tls-subdomain</code>) you'll see TLS-handshake failures instead of mixed-content errors.
          </div>
        </Show>
        <div class="h-px bg-gray-700/30" />
        <div class="text-[12.5px] text-gray-300 leading-relaxed">
          Web cockpit for any MeshKore cluster. Connects to your local Python daemon — your roadmap, docs and credentials stay on your machine.
        </div>
        <div class="flex flex-col gap-1.5 text-[12px]">
          <a href="https://meshkore.com/architect" target="_blank" rel="noopener" class="text-emerald-400 hover:underline">→ meshkore.com/architect</a>
          <a href="https://meshkore.com/standard" target="_blank" rel="noopener" class="text-emerald-400 hover:underline">→ The MeshKore standard</a>
          <a href="https://meshkore.com/docs" target="_blank" rel="noopener" class="text-emerald-400 hover:underline">→ Documentation</a>
          <a href="https://github.com/meshkore" target="_blank" rel="noopener" class="text-emerald-400 hover:underline">→ GitHub</a>
        </div>
      </div>
    ),
    buttons: [{ id: 'ok', label: 'Close', primary: true }],
  });
}

const ZONES: { id: Zone; label: string; title: string }[] = [
  { id: 'architect', label: 'Architect', title: 'Architect — project dashboard (modules · roadmap · chat)' },
  { id: 'agents',    label: 'Team',      title: 'Team — roster of members + who is working on what' },
  { id: 'crons',     label: 'Crons',     title: 'Crons — scheduled jobs' },
  { id: 'jobs',      label: 'Jobs',      title: 'Jobs — processes the daemon is running right now' },
  // JL-3 — Bookmarks is no longer a zone: it is a tab inside Links.
  { id: 'links',     label: 'Links',     title: 'Links — deployment registry + bookmarks' },
  // Protocols moved 2026-06-19 into the Roadmap column's sub-tabs.
  { id: 'diary',     label: 'Diary',     title: 'Diary — chronological activity blog' },
  { id: 'config',    label: 'Config',    title: 'Config — cluster settings' },
];

function ZoneIcon(props: { id: Zone }) {
  return (
    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <Show when={props.id === 'architect'}><path d="M3 7h18M3 12h18M3 17h13" /></Show>
      <Show when={props.id === 'agents'}><><circle cx="9" cy="8" r="3" /><circle cx="17" cy="11" r="2.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M13 20c0-2.2 1.8-4 4-4s4 1.8 4 4" /></></Show>
      <Show when={props.id === 'crons'}><><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></></Show>
      <Show when={props.id === 'jobs'}><><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3" /><path d="M13 15h4" /></></Show>
      <Show when={props.id === 'links'}><><path d="M10 13a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1.5 1.5" /><path d="M14 11a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1.5-1.5" /></></Show>
      <Show when={props.id === 'protocols'}><><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></></Show>
      <Show when={props.id === 'diary'}><><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></></Show>
    </svg>
  );
}

export default function Header() {
  // Machine-level "General settings" right slide-over (daemon · remote
  // control · clients & providers). Distinct from the per-project Config
  // zone tab — see GeneralConfigDrawer.
  const [genOpen, setGenOpen] = createSignal(false);
  // JL-2 — one live /jobs feed for the whole cockpit, owned by the only
  // component that is mounted in every zone. The Jobs badge below and
  // the Jobs panel both read `jobsStore`, so they cannot disagree.
  mountJobsFeed();
  // REL1 — one sweep loop for the whole cockpit: a dispatched turn that
  // never answers and that the daemon does not report as running gets
  // said out loud, in the thread. Mounted here for the same reason the
  // jobs feed is: Header is the only always-mounted component.
  chatStore.mountTurnWatchdog();
  return (
    <header class="sticky top-0 z-40 bg-gray-950/95 backdrop-blur-xl border-b border-gray-800/60 shadow-sm">
      <div class="h-12 flex items-center gap-2 px-3">

        {/* LEFT — logo (V63: click → About modal with build version) */}
        <button type="button" class="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0 hover:bg-emerald-500/25 transition-colors" title="MeshKore Architect — click for build info" onClick={openAboutModal}>
          <svg class="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" aria-hidden="true">
            <g stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none">
              <line x1="12" y1="12" x2="12" y2="3.5" /><line x1="12" y1="12" x2="20.5" y2="12" /><line x1="12" y1="12" x2="12" y2="20.5" /><line x1="12" y1="12" x2="3.5" y2="12" />
            </g>
            <g fill="currentColor">
              <circle cx="12" cy="3.5" r="2" /><circle cx="20.5" cy="12" r="2" /><circle cx="12" cy="20.5" r="2" /><circle cx="3.5" cy="12" r="2" /><circle cx="12" cy="12" r="2.8" />
            </g>
          </svg>
        </button>

        {/* LEFT — project plate (200px). Falls back to identity when no cluster_name. */}
        <div class="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-gray-900/40 border border-gray-800/60 overflow-hidden flex-shrink-0 w-[200px]">
          <ProjectPlate />
        </div>

        {/* CENTER — zone buttons + Config text tab. Hidden on small viewports.
            Separation comes from the row `gap`, NOT from inner side-padding,
            so the selected pill hugs its label with even padding. */}
        <div class="hidden md:flex items-center gap-1 flex-shrink-0 ml-1">
          {ZONES.map((z) => (
            <ZoneButton zone={z} />
          ))}
        </div>

        <div class="flex-1" />

        {/* RIGHT — daemon pill + general-settings gear + theme picker.
            The gear opens the MACHINE-LEVEL settings (daemon · remote
            control · providers) as a right slide-over — deliberately NOT
            in the per-project Config zone tab. Sits beside the theme
            picker because both are cross-project, browser/machine-scoped. */}
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <VersionPill />
          <button
            type="button"
            onClick={() => setGenOpen(true)}
            title="General settings — daemon, remote control, providers (machine-level)"
            aria-label="Open general settings"
            aria-expanded={genOpen()}
            class="inline-flex items-center justify-center w-7 h-7 rounded border border-transparent text-gray-400 hover:text-gray-100 hover:border-gray-700 transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
          <ThemePicker />
        </div>
      </div>
      <ConnectionBanner />
      <GeneralConfigDrawer open={genOpen()} onClose={() => setGenOpen(false)} />
    </header>
  );
}

/**
 * AX1 — the disconnection strip.
 *
 * Sits inside the sticky header, directly above the rail + workspace,
 * so it reads as a workspace-level notice without blanking anything.
 * The whole point: the data on screen STAYS visible and is explicitly
 * marked stale. Before this, `wsState` rendered nowhere but the debug
 * modal — the operator got a green pill over a frozen cockpit and no
 * signal at all until they reloaded.
 */
function ConnectionBanner() {
  const status = () => activeLinkStatus();
  return (
    <Show when={status() === 'reconnecting' || status() === 'paused'}>
      <div
        role="status"
        aria-live="polite"
        class={`flex items-center gap-2 px-3 py-1 border-t text-[11px] leading-none ${
          status() === 'reconnecting'
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
            : 'bg-red-500/10 border-red-500/30 text-red-200'
        }`}
      >
        <span
          class={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            status() === 'reconnecting' ? 'bg-amber-400 animate-pulse-soft' : 'bg-red-400'
          }`}
          aria-hidden="true"
        />
        <span class="font-medium">
          {status() === 'reconnecting' ? 'Reconnecting…' : 'Live updates paused — retrying'}
        </span>
        <span class="opacity-70">
          {status() === 'reconnecting'
            ? 'What you see may be a few seconds behind.'
            : "What you see is the last state we received. It refreshes the moment the daemon answers."}
        </span>
      </div>
    </Show>
  );
}

function ZoneButton(props: { zone: typeof ZONES[number] }) {
  const active = () => uiStore.state.activeZone === props.zone.id;
  // JL-2 — "Jobs (N)": N is the number of processes the daemon has
  // running right now, live over the `jobs.updated` socket event. Hidden
  // at zero so the header stays quiet when nothing is running.
  // REL1 — the Jobs badge reads `running/defined` whenever this project
  // defines any job, and goes amber when at least one of them is down.
  // Hiding at "0 running" is what let a generator that should have been
  // up look identical to a project with nothing to run.
  const badge = (): string | null => {
    if (props.zone.id !== 'jobs') return null;
    const defined = jobsStore.definedCount();
    if (defined === 0) return null;
    return `${jobsStore.runningCount()}/${defined}`;
  };
  const badgeDown = (): boolean => props.zone.id === 'jobs' && jobsStore.downCount() > 0;
  return (
    <button
      type="button"
      onClick={() => uiStore.setActiveZone(props.zone.id)}
      class={`px-2 py-1 text-[12px] leading-none transition flex items-center gap-1.5 rounded-md border ${
        active()
          ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
          : 'text-gray-500 hover:text-gray-200 border-transparent hover:border-gray-800/60'
      }`}
      title={props.zone.title}
    >
      <ZoneIcon id={props.zone.id} />
      <span class="hidden lg:inline">{props.zone.label}</span>
      <Show when={badge() !== null}>
        <span
          class="font-mono text-[10px] leading-none px-1.5 py-0.5 rounded-full border"
          classList={{
            'bg-amber-500/15 border-amber-500/50 text-amber-200': badgeDown(),
            'bg-emerald-500/20 border-emerald-500/40 text-emerald-200': !badgeDown() && active(),
            'bg-emerald-500/10 border-emerald-500/30 text-emerald-300': !badgeDown() && !active(),
          }}
          title={
            badgeDown()
              ? `${jobsStore.downCount()} job(s) defined for this project are NOT running`
              : `${jobsStore.runningCount()} job(s) running`
          }
        >
          {badge()}
        </span>
      </Show>
    </button>
  );
}

// AX1 — one palette for every connection surface (plate dot, pill, dot
// inside the pill). Derived from `lib/connection-status`, so the three
// can never disagree the way `phase`-only and hardcoded-emerald did.
const LINK_DOT: Record<LinkStatus, string> = {
  connected: 'bg-emerald-400',
  reconnecting: 'bg-amber-400 animate-pulse-soft',
  paused: 'bg-red-400',
  offline: 'bg-gray-500',
};

const LINK_PILL: Record<LinkStatus, string> = {
  connected: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
  reconnecting: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
  paused: 'bg-red-500/15 border-red-500/40 text-red-300',
  offline: 'bg-red-500/15 border-red-500/40 text-red-300',
};

const LINK_TITLE: Record<LinkStatus, string> = {
  connected: 'Daemon connected — live updates flowing',
  reconnecting: 'Reconnecting to the daemon…',
  paused: 'Live updates paused — the socket gave up and is being retried',
  offline: 'No daemon connection',
};

function ProjectPlate() {
  const p = activeProject;
  const fallbackName = () => daemonStore.state.health?.cluster_name ?? daemonStore.state.health?.identity ?? '—';
  // Was hardcoded emerald: it stayed green through `reconnecting` AND
  // `fatal`, which is the single most misleading pixel in the cockpit.
  const status = () => activeLinkStatus();
  return (
    <>
      <span
        class={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${LINK_DOT[status()]}`}
        title={LINK_TITLE[status()]}
      />
      <span class="text-[12px] font-semibold text-gray-100 truncate">{p()?.cluster_name ?? fallbackName()}</span>
    </>
  );
}

/**
 * VersionPill — the header's "are we up to date?" box.
 *
 * One line, two versions: the DAEMON this cockpit talks to and the
 * COCKPIT bundle this tab is running. Operator ask (2026-09-21): the pill
 * read `daemon · py-1.35.26` and said nothing about the cockpit itself,
 * so a tab left open for a day looked identical to a freshly deployed one.
 *
 * Each half turns amber when it is the stale one — the daemon when it is
 * behind the version this bundle expects, the cockpit when /health.json
 * reports a newer commit than the one we were built with. Both already
 * raise their own banner; this is the at-a-glance version of the same
 * two facts. The DOT keeps meaning connection state and nothing else —
 * conflating the two is what made this pill lie before.
 *
 * Everything else (cluster, endpoint, TLS, build date) lives in the About
 * modal, one click away on the pill itself.
 */
function VersionPill() {
  const status = () => activeLinkStatus();
  const phase = () => daemonStore.state.phase;
  const daemonV = () => daemonStore.state.health?.version ?? '';
  const daemonStale = () => isDaemonBehind(daemonV());
  const cockpitStale = () => cockpitOutdated();
  // ATM22 — the build NUMBER is the operator-facing identity: it only
  // ever goes up, so "did my tab update?" is answerable at a glance. The
  // commit stays in the About modal for the agent-facing question.
  const cockpitV = () => (COCKPIT_BUILD > 0 ? String(COCKPIT_BUILD) : (COCKPIT_COMMIT || 'dev').slice(0, 7));
  // Degraded states say what is wrong instead of a version — reading only
  // `phase` (which stays `connected` through reconnecting and fatal) is
  // what made the pill lie in the first place.
  const degraded = (): string | null => {
    switch (status()) {
      case 'connected': return null;
      case 'reconnecting': return phase() === 'connected' ? 'reconnecting' : phase();
      case 'paused': return 'paused';
      default: return phase();
    }
  };
  const title = () => [
    LINK_TITLE[status()],
    `daemon ${daemonV() || '—'}${daemonStale() ? ` — behind ${EXPECTED_DAEMON_VERSION}, update it` : ' — up to date'}`,
    `cockpit ${cockpitV()}${cockpitStale() ? ` — build ${latestCockpitBuild() ?? '?'} is live, reload` : ' — up to date'}`,
    'click for build details',
  ].join('\n');
  return (
    <button
      type="button"
      onClick={openAboutModal}
      class={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-mono tracking-wide ${LINK_PILL[status()]}`}
      title={title()}
    >
      <span class={`w-1.5 h-1.5 rounded-full ${LINK_DOT[status()]}`} />
      {/* The cockpit half is ALWAYS shown: a disconnected tab is exactly
          when the operator needs to know which build they are on. */}
      <Show when={!degraded()} fallback={<span class="uppercase">{degraded()}</span>}>
        <span classList={{ 'text-amber-300': daemonStale() }}>{daemonV() || 'daemon'}</span>
      </Show>
      <span class="text-gray-600">·</span>
      <span classList={{ 'text-amber-300': cockpitStale() }}>arch {cockpitV()}</span>
    </button>
  );
}
