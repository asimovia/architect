/**
 * SDEL1 — a Solid store MERGES an object returned from a path setter, so
 * `setState('map', (xs) => { const { [k]: _, ...rest } = xs; return rest; })`
 * (or `{ ...prev }` + `delete next[k]`) deletes NOTHING. Ten helpers did
 * exactly that: "esperando respuesta" and the live progress line never
 * cleared, unarchive never unarchived, Forget never forgot (mf27,
 * 2026-10-02: "No reply after 434s" re-fired every minute for a turn
 * that had answered). Deleting a key is `produce((d) => { delete d[k]; })`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'node_modules' && name !== '_parked') yield* files(p);
    } else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) yield p;
  }
}

const BAD = /set\w*\(\s*'[\w]+'\s*,\s*\(\s*(\w+)\s*\)\s*=>\s*\{\s*const\s+(?:\{\s*\[[^\]]+\]\s*:\s*\w+\s*,\s*\.\.\.\w+\s*\}\s*=\s*\1|\w+\s*=\s*\{\s*\.\.\.\1\s*\};\s*delete\s)/;

test('SDEL1 — no store setter deletes a key by rebuilding the object', () => {
  const offenders: string[] = [];
  for (const f of files(ROOT)) {
    if (BAD.test(readFileSync(f, 'utf8'))) offenders.push(f.slice(ROOT.length));
  }
  assert.deepEqual(offenders, []);
});
