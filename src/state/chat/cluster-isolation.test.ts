/**
 * QISO1 — conv ids (`_onboarding_v1`) repeat in every project, so any chat
 * state keyed by conv must either travel in the per-project slice or be
 * reset when the project changes. `queues` did neither: two messages queued
 * in mf27 showed up in reddit's queue (2026-10-03). This pins the rule for
 * every conv-keyed field of `ChatStoreState`, including ones added later.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HERE = new URL('.', import.meta.url).pathname;
const types = readFileSync(HERE + 'types.ts', 'utf8');
const slices = readFileSync(HERE + 'cluster-slices.ts', 'utf8');

// Keyed by cluster id, not conv — global on purpose.
const GLOBAL = new Set(['clusterActivity']);

function block(src: string, header: string): string {
  const start = src.indexOf(header);
  assert.ok(start >= 0, `missing ${header}`);
  return src.slice(start, src.indexOf('\n}', start));
}

function recordFields(body: string): string[] {
  return [...body.matchAll(/^\s+(\w+): Record<string,/gm)].map((m) => m[1] ?? "");
}

test('every conv-keyed chat field is per-project', () => {
  const fields = recordFields(block(types, 'export interface ChatStoreState'));
  const slice = new Set(recordFields(block(types, 'export interface ClusterChatSlice')));
  const bind = block(slices, 'export function bindCluster');
  const leaking = fields.filter((f) => {
    if (GLOBAL.has(f) || slice.has(f)) return false;
    // Reset on every switch: up front, or in both the restore and the
    // first-visit branch.
    if (new RegExp(`setState\\('${f}', \\{\\}\\)`).test(bind)) return false;
    return (bind.match(new RegExp(`\\b${f}: \\{\\}`, 'g')) ?? []).length < 2;
  });
  assert.deepEqual(leaking, [], `conv-keyed state not isolated per project: ${leaking.join(', ')}`);
});

test('the slice saves and restores every field it declares', () => {
  const fields = recordFields(block(types, 'export interface ClusterChatSlice'));
  const save = block(slices, 'function snapshotCurrent');
  const bind = block(slices, 'export function bindCluster');
  for (const f of fields) {
    assert.match(save, new RegExp(`${f}: \\{ \\.\\.\\.state\\.${f} \\}`), `${f} not saved`);
    assert.match(bind, new RegExp(`${f}: cached\\.${f}`), `${f} not restored`);
    assert.match(bind, new RegExp(`${f}: \\{\\}`), `${f} not reset on first visit`);
  }
});
