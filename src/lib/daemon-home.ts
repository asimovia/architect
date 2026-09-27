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

/** One-liner that makes the daemon resident (launchd) — offered when the
 *  remembered home says it is not. `make install` is the server home's
 *  Makefile target; a home without one falls back to a plain start. */
export function installCommand(home: DaemonHome): string {
  if (/meshctl\.sh" start$/.test(home.start)) return home.start.replace(/ start$/, ' install');
  return home.start.includes('make ') ? home.start.replace(/make \w+$/, 'make install') : home.start;
}

/** The prompt to paste into a coding CLI when the operator would rather
 *  hand it over. */
export function agentPromptForHome(home: DaemonHome | null): string {
  const where = home ? `It is installed at ${home.path}.` : 'Find the folder that contains .meshkore/scripts/daemon.py (the MeshKore server home).';
  const how = home ? `Run: ${home.start}` : 'From that folder run: python3 .meshkore/scripts/daemon.py';
  return [
    'The MeshKore daemon on this machine is not running. It is ONE process that serves every project here.',
    where,
    how,
    home && !home.resident
      ? `Then make it resident so a reboot does not kill it: ${installCommand(home)}`
      : '',
    'Confirm with: curl -sk https://localhost:5573/health',
  ]
    .filter(Boolean)
    .join('\n');
}
