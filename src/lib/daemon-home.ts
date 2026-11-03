/**
 * daemon-home.ts — where the ONE daemon on this machine lives, remembered.
 *
 * The daemon is a single process per machine (standard §10), not one per
 * project. The "No daemon detected" screen used to show a start command
 * per known PROJECT — eight rows telling the operator to `cd` into eight
 * folders and start eight daemons that would fight over :5573. Wrong
 * model, and it hid the one useful fact: the folder the daemon is actually
 * installed in.
 *
 * Since py-1.38.2 `/health.home` names that folder and its start command.
 * We remember it here on every successful connection, so the next time the
 * daemon is down (a reboot, mostly) the screen can say exactly where to go
 * and what to type — before any daemon is there to ask.
 *
 * Dependency-free on purpose: `npm test` runs these leaves under node with
 * no DOM, so `localStorage` is reached through the injected store.
 */

export const DAEMON_HOME_KEY = 'mc-daemon-home-v1';

export interface DaemonHome {
  /** The folder holding `.meshkore/scripts/daemon.py` — the server home. */
  path: string;
  /** Absolute command that starts it — pasteable from any directory. */
  start: string;
  /** Absolute command that stops it (and the agents it spawned). */
  stop: string;
  /** True when a launchd agent keeps it alive across logins and reboots. */
  resident: boolean;
  /** ISO timestamp of the connection that recorded this. */
  seen_at: string;
}

/** The shape `/health.home` has on the wire (py-1.38.2+). */
export interface HealthHome {
  path?: string;
  start?: string;
  stop?: string;
  resident?: boolean;
}

interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function store(): KV | null {
  try {
    const g = globalThis as { localStorage?: KV };
    return g.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Persist what a live daemon told us about itself. No-op on a health
 *  payload from a daemon too old to say (pre-1.38.2). */
export function rememberDaemonHome(home: HealthHome | undefined, now = new Date(), kv = store()): DaemonHome | null {
  if (!home || !home.path || !kv) return null;
  const rec: DaemonHome = {
    path: home.path,
    start: home.start || defaultStartCommand(home.path),
    stop: home.stop || defaultStopCommand(home.path),
    resident: !!home.resident,
    seen_at: now.toISOString(),
  };
  try {
    kv.setItem(DAEMON_HOME_KEY, JSON.stringify(rec));
  } catch {
    /* quota / private mode — the screen falls back to the generic guide */
  }
  return rec;
}

export function recallDaemonHome(kv = store()): DaemonHome | null {
  if (!kv) return null;
  try {
    const raw = kv.getItem(DAEMON_HOME_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<DaemonHome>;
    if (typeof v.path !== 'string' || !v.path) return null;
    return {
      path: v.path,
      start: typeof v.start === 'string' && v.start ? v.start : defaultStartCommand(v.path),
      stop: typeof v.stop === 'string' && v.stop ? v.stop : defaultStopCommand(v.path),
      resident: !!v.resident,
      seen_at: typeof v.seen_at === 'string' ? v.seen_at : '',
    };
  } catch {
    return null;
  }
}

export function forgetDaemonHome(kv = store()): void {
  try {
    kv?.removeItem(DAEMON_HOME_KEY);
  } catch {
    /* ignore */
  }
}

/** What to type when the daemon did not say: the plain interpreter form. */
export function defaultStartCommand(path: string): string {
  return `cd "${path}" && python3 .meshkore/scripts/daemon.py`;
}

/** What to type to stop it when the daemon did not say. */
export function defaultStopCommand(path: string): string {
  return `pkill -f "${path}/.meshkore/scripts/daemon.py"`;
}

/** Where the optional control script is published (standard v39 §10.2). */
export const MESHCTL_URL = 'https://architect.meshkore.com/reference/cluster/scripts/meshctl.sh';
const TLS_URL = 'https://architect.meshkore.com/reference/cluster/scripts/tls';

/** True when the remembered start command goes through `meshctl.sh` — the
 *  only start form that survives closing the terminal that ran it. */
export function usesMeshctl(home: DaemonHome | null): boolean {
  return !!home && /meshctl\.sh"? start$/.test(home.start);
}

/** One-liner that makes the daemon resident (launchd / systemd) — offered
 *  when the remembered home says it is not. Only meshctl and the old
 *  Makefile know how; a plain start stays a plain start. */
export function installCommand(home: DaemonHome): string {
  if (/meshctl\.sh" start$/.test(home.start)) return home.start.replace(/ start$/, ' install');
  return home.start.includes('make ') ? home.start.replace(/make \w+$/, 'make install') : home.start;
}

/** Step 1 — is a daemon answering at all? `-k` on purpose: this asks
 *  "is it running", not "is the certificate good". */
export function runningCheckCommand(port = 5573): string {
  return `curl -sk https://localhost:${port}/health`;
}

/** Step 2 — the request the browser makes: same daemon, real certificate
 *  check. Fails while step 1 succeeds = expired or mismatched certificate. */
export function certCheckCommand(port = 5573): string {
  return `curl -s https://daemon.meshkore.com:${port}/health`;
}

/** Fetch a current loopback TLS bundle into the folder the daemon reads it
 *  from (`<home>/.meshkore/scripts/tls/`). Restart the daemon afterwards. */
export function tlsRefreshCommand(home: DaemonHome | null): string {
  const dir = home ? `"${home.path}/.meshkore/scripts/tls"` : '"<meshkore-server folder>/.meshkore/scripts/tls"';
  return [
    `cd ${dir}`,
    `curl -fsSL ${TLS_URL}/fullchain.pem -o fullchain.pem`,
    `curl -fsSL ${TLS_URL}/privkey.pem -o privkey.pem && chmod 600 privkey.pem`,
  ].join('\n');
}

/** Download the control script into the server home. */
export function meshctlDownloadCommand(home: DaemonHome | null): string {
  const dest = home ? `"${home.path}/meshctl.sh"` : '"<meshkore-server folder>/meshctl.sh"';
  return `curl -fsSL ${MESHCTL_URL} -o ${dest} && chmod +x ${dest}`;
}

/** The prompt to paste into a coding CLI when the operator would rather
 *  hand it over. It must not claim the daemon is stopped: from the browser
 *  a running daemon with an expired certificate looks exactly the same. */
export function agentPromptForHome(home: DaemonHome | null): string {
  const where = home
    ? `It is installed at ${home.path} (daemon at .meshkore/scripts/daemon.py, TLS bundle at .meshkore/scripts/tls/).`
    : 'Find the folder that contains .meshkore/scripts/daemon.py (the MeshKore server home, usually ~/meshkore-server).';
  const start = home ? home.start : 'cd <that folder> && python3 .meshkore/scripts/daemon.py';
  return [
    'The MeshKore Architect in my browser cannot reach the MeshKore daemon on this machine. It is ONE process that serves every project here. It may be stopped, or running with an expired TLS certificate.',
    where,
    `1. Is it running? ${runningCheckCommand()} — JSON with "ok": true means yes. Nothing answers on 5570–5589 → start it: ${start}`,
    `2. Is the certificate valid? ${certCheckCommand()} (no -k). A certificate error, or "tls": false in step 1, means the bundle is expired or missing: refresh .meshkore/scripts/tls/ from ${TLS_URL}/{fullchain.pem,privkey.pem}, then restart the daemon.`,
    home && usesMeshctl(home)
      ? home.resident
        ? ''
        : `3. Then make it resident so a reboot does not stop it: ${installCommand(home)}`
      : `3. To keep it running across terminals and reboots, download the control script (${MESHCTL_URL}) into the server home and run "meshctl.sh install" — or follow https://meshkore.com/reference/agents/daemon.md.`,
    `Done when ${certCheckCommand()} answers without -k.`,
  ]
    .filter(Boolean)
    .join('\n');
}
