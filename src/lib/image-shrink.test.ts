import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitEdge, MAX_EDGE, BYTE_BUDGET } from './image-shrink.ts';

test('IMG1 — the longest edge is capped, aspect kept', () => {
  assert.deepEqual(fitEdge(4000, 2000, 2000), { w: 2000, h: 1000 });
  assert.deepEqual(fitEdge(1200, 3000, 2000), { w: 800, h: 2000 });
  assert.deepEqual(fitEdge(800, 600, 2000), { w: 800, h: 600 });
});

test('IMG1 — six images at budget stay under the daemon 4 MB body cap', () => {
  assert.ok(MAX_EDGE <= 2000);
  assert.ok(Math.ceil((6 * BYTE_BUDGET * 4) / 3) < 4 * 1024 * 1024 - 64 * 1024);
});
