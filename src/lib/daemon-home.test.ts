import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAEMON_HOME_KEY,
  agentPromptForHome,
  certCheckCommand,
  defaultStartCommand,
  forgetDaemonHome,
  installCommand,
  recallDaemonHome,
  rememberDaemonHome,
  tlsRefreshCommand,
  usesMeshctl,
} from './daemon-home.ts';

function mem() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

test('remember → recall round-trips what the daemon said', () => {
  const kv = mem();
  const now = new Date('2026-09-27T09:00:00Z');
  rememberDaemonHome({ path: '/x/meshkore-server', start: '"/x/meshkore-server/meshctl.sh" start', stop: '"/x/meshkore-server/meshctl.sh" stop', resident: true }, now, kv);
  const got = recallDaemonHome(kv);
  assert.deepEqual(got, {
    path: '/x/meshkore-server',
    start: '"/x/meshkore-server/meshctl.sh" start',
    stop: '"/x/meshkore-server/meshctl.sh" stop',
    resident: true,
    seen_at: '2026-09-27T09:00:00.000Z',
  });
});

test('a daemon too old to say its home leaves the record alone', () => {
  const kv = mem();
  kv.setItem(DAEMON_HOME_KEY, JSON.stringify({ path: '/old', start: 'x', stop: 'y', resident: false, seen_at: '' }));
  assert.equal(rememberDaemonHome(undefined, new Date(), kv), null);
  assert.equal(rememberDaemonHome({}, new Date(), kv), null);
  assert.equal(recallDaemonHome(kv)?.path, '/old');
});

test('a missing start command falls back to the interpreter form', () => {
  const kv = mem();
  rememberDaemonHome({ path: '/h' }, new Date(), kv);
  assert.equal(recallDaemonHome(kv)?.start, defaultStartCommand('/h'));
  assert.equal(recallDaemonHome(kv)?.stop, 'pkill -f "/h/.meshkore/scripts/daemon.py"');
  assert.equal(defaultStartCommand('/h'), 'cd "/h" && python3 .meshkore/scripts/daemon.py');
});

test('garbage in storage reads as nothing', () => {
  const kv = mem();
  kv.setItem(DAEMON_HOME_KEY, '{not json');
  assert.equal(recallDaemonHome(kv), null);
  kv.setItem(DAEMON_HOME_KEY, JSON.stringify({ start: 'no path' }));
  assert.equal(recallDaemonHome(kv), null);
  forgetDaemonHome(kv);
  assert.equal(kv.getItem(DAEMON_HOME_KEY), null);
});

test('install command swaps the make target; a plain start stays as is', () => {
  assert.equal(
    installCommand({ path: '/h', start: 'cd "/h" && make start', stop: '', resident: false, seen_at: '' }),
    'cd "/h" && make install',
  );
  const plain = 'cd "/h" && python3 .meshkore/scripts/daemon.py';
  assert.equal(installCommand({ path: '/h', start: plain, stop: '', resident: false, seen_at: '' }), plain);
});

test('the agent prompt names the folder when known and asks to find it when not', () => {
  const known = agentPromptForHome({ path: '/h', start: '"/h/meshctl.sh" start', stop: '', resident: false, seen_at: '' });
  assert.match(known, /installed at \/h/);
  assert.match(known, /meshctl\.sh" install/);
  const unknown = agentPromptForHome(null);
  assert.match(unknown, /Find the folder/);
  assert.doesNotMatch(unknown, /meshctl\.sh" install/);
});

test('the agent prompt says "cannot reach", never "not running", and checks the certificate', () => {
  for (const home of [null, { path: '/h', start: 'cd "/h" && python3 .meshkore/scripts/daemon.py', stop: '', resident: false, seen_at: '' }]) {
    const p = agentPromptForHome(home);
    assert.match(p, /cannot reach/);
    assert.doesNotMatch(p, /is not running/);
    assert.ok(p.includes(certCheckCommand()));
    // No meshctl on this machine → point at the download, not at a script it does not have.
    assert.match(p, /reference\/cluster\/scripts\/meshctl\.sh/);
  }
});

test('a resident meshctl home gets no install step; meshctl detection', () => {
  const h = { path: '/h', start: '"/h/meshctl.sh" start', stop: '"/h/meshctl.sh" stop', resident: true, seen_at: '' };
  assert.ok(usesMeshctl(h));
  assert.doesNotMatch(agentPromptForHome(h), /meshctl\.sh" install/);
  assert.ok(!usesMeshctl({ ...h, start: 'cd "/h" && python3 .meshkore/scripts/daemon.py' }));
  assert.ok(!usesMeshctl(null));
});

test('the TLS refresh writes into the folder the daemon reads (.meshkore/scripts/tls)', () => {
  const cmd = tlsRefreshCommand({ path: '/h', start: '', stop: '', resident: false, seen_at: '' });
  assert.match(cmd, /^cd "\/h\/\.meshkore\/scripts\/tls"/);
  assert.match(cmd, /fullchain\.pem -o fullchain\.pem/);
  assert.match(cmd, /chmod 600 privkey\.pem/);
});

test('the meshctl form maps start → install and survives a round trip', () => {
  const h = { path: '/h', start: '"/h/meshctl.sh" start', stop: '"/h/meshctl.sh" stop', resident: false, seen_at: '' };
  assert.equal(installCommand(h), '"/h/meshctl.sh" install');
});
