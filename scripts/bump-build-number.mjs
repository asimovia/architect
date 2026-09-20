#!/usr/bin/env node
/**
 * bump-build-number.mjs — ATM22.
 *
 * The cockpit had no number that moved. `package.json` version has read
 * `0.2.0-alpha` for months and the only per-deploy identity was a git
 * SHA, which tells the operator nothing about ORDER: "is 8e6db5b newer
 * than 70563be?" is unanswerable at a glance, so "did my tab actually
 * update?" was too.
 *
 * So every build increments an integer. It is written to
 * `build-number.json`, baked into the bundle (VITE_BUILD_NUMBER) and
 * into `dist/health.json`, and the running tab compares the two: server
 * build > mine ⇒ the blue "reload" bar. Bigger number = newer cockpit,
 * no exceptions.
 *
 * Wired as part of `prebuild`, so `npm run build` (and therefore
 * `deploy:prod`) always moves it. COMMIT the bumped file with the
 * deploy — the number is the release identity, not a local scratch.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const file = resolve(here, '..', 'build-number.json');

let current = 10000;
try {
  const parsed = JSON.parse(readFileSync(file, 'utf-8'));
  if (Number.isFinite(parsed?.build)) current = Math.floor(parsed.build);
} catch {
  // Missing or corrupt — start the series rather than fail the build.
}

const next = current + 1;
writeFileSync(file, `${JSON.stringify({ build: next }, null, 2)}\n`, 'utf-8');
console.log(`[build-number] ${current} → ${next}`);
