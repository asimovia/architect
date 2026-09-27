import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bumpClusterEpoch, captureClusterEpoch, isCurrentEpoch } from '../../lib/swap-guard.ts';

// The store-bound `historyLoadIsCurrent` composes exactly these two rules;
// they are pinned here where node --test can reach them (no Solid store).
function current(token: ReturnType<typeof captureClusterEpoch>, clientProject: string | undefined, active: string | null): boolean {
  if (!isCurrentEpoch(token)) return false;
  return !clientProject || !active || clientProject === active;
}

test('mf27 2026-09-27 — MeshKore history requested, operator lands on mf27: dropped', () => {
  bumpClusterEpoch('meshkore-main');
  const t = captureClusterEpoch();
  bumpClusterEpoch('mf27'); // the add flow switches while the fetch is in flight
  assert.equal(current(t, 'meshkore-main', 'mf27'), false);
});

test('a client of another project is refused even without a switch', () => {
  bumpClusterEpoch('mf27');
  const t = captureClusterEpoch();
  assert.equal(current(t, 'meshkore-main', 'mf27'), false);
  assert.equal(current(t, 'mf27', 'mf27'), true);
  assert.equal(current(t, undefined, 'mf27'), true); // legacy client, no project header
});
