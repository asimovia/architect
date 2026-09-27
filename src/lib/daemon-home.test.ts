import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAEMON_HOME_KEY,
  agentPromptForHome,
  defaultStartCommand,
  forgetDaemonHome,
  installCommand,
  recallDaemonHome,
  rememberDaemonHome,
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
  rememberDaemonHome({ path: '/x/meshkore-server', start: 'cd "/x/meshkore-server" && make start', resident: true }, now, kv);
  const got = recallDaemonHome(kv);
  assert.deepEqual(got, {
    path: '/x/meshkore-server',
    start: 'cd "/x/meshkore-server" && make start',
    resident: true,
    seen_at: '2026-09-27T09:00:00.000Z',
  });
});

test('a daemon too old to say its home leaves the record alone', () => {
  const kv = mem();
  kv.setItem(DAEMON_HOME_KEY, JSON.stringify({ path: '/old', start: 'x', resident: false, seen_at: '' }));
  assert.equal(rememberDaemonHome(undefined, new Date(), kv), null);
  assert.equal(rememberDaemonHome({}, new Date(), kv), null);
  assert.equal(recallDaemonHome(kv)?.path, '/old');
});

test('a missing start command falls back to the interpreter form', () => {
  const kv = mem();
  rememberDaemonHome({ path: '/h' }, new Date(), kv);
  assert.equal(recallDaemonHome(kv)?.start, defaultStartCommand('/h'));
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
    installCommand({ path: '/h', start: 'cd "/h" && make start', resident: false, seen_at: '' }),
    'cd "/h" && make install',
  );
  const plain = 'cd "/h" && python3 .meshkore/scripts/daemon.py';
  assert.equal(installCommand({ path: '/h', start: plain, resident: false, seen_at: '' }), plain);
});

test('the agent prompt names the folder when known and asks to find it when not', () => {
  const known = agentPromptForHome({ path: '/h', start: 'cd "/h" && make start', resident: false, seen_at: '' });
  assert.match(known, /installed at \/h/);
  assert.match(known, /make install/);
  const unknown = agentPromptForHome(null);
  assert.match(unknown, /Find the folder/);
  assert.doesNotMatch(unknown, /make install/);
});
