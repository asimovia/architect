#!/usr/bin/env node
/**
 * sync-daemon-version.mjs
 * ───────────────────────
 * Reads `DAEMON_VERSION` from `.meshkore/scripts/daemon.py` (canonical
 * source of truth) and rewrites the cockpit's `EXPECTED_DAEMON_VERSION`
 * constant in `src/lib/version.ts` to match.
 *
 * Why this exists: the cockpit shows a "daemon ahead — Reload" banner
 * whenever the daemon version is > EXPECTED. Without this script,
 * every daemon bump silently desynced the cockpit constant — and
 * because the build embeds the OLD value into the bundle, hitting
 * Reload re-downloaded the same stale bundle, the banner reappeared,
 * operator stuck in a loop.
 *
 * Wired as the cockpit's `prebuild` step (package.json) so every
 * `npm run build` syncs first. Idempotent: writes only if the value
 * actually changed.
 *
 * Note: this script bumps EXPECTED_DAEMON_VERSION, NOT
 * MIN_DAEMON_VERSION. MIN is the floor the cockpit demands; that
 * needs a human decision (which versions to drop support for) and
 * stays operator-controlled.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

// CVS1 (2026-06-12) — Prefer the canonical daemon source over the
// cluster's auto-updated copy. Operator field report 2026-06-12:
// MeshKore Core cluster was down → its `.meshkore/scripts/daemon.py`
// stayed at py-1.12.24 from yesterday. The prebuild read that file
// and baked an EXPECTED_DAEMON_VERSION two minors behind into the
// production bundle, triggering a false "daemon ahead" banner.
//
// Lookup order:
//   1. daemon/daemon.py — canonical; updated SECONDS before every
//      deploy. Always matches what just shipped.
//   2. .meshkore/scripts/daemon.py — fallback for workspaces that
//      have only the cluster's local copy. Warning emitted because
//      stale risk reappears.
// py-1.19.0 daemon-architecture-v2 moved DAEMON_VERSION out of the daemon.py
// god-file into the leaf daemon/constants.py (the single-line source of truth;
// the bundle's dist/daemon.py keeps an early marker too). Read constants.py.
const canonicalDaemonPath = join(repoRoot, 'daemon', 'constants.py');
const fallbackDaemonPath = join(repoRoot, '.meshkore', 'scripts', 'daemon.py');
const daemonPath = existsSync(canonicalDaemonPath)
  ? canonicalDaemonPath
  : fallbackDaemonPath;
if (daemonPath === fallbackDaemonPath) {
  console.warn(
    '[sync-daemon-version] canonical daemon/daemon.py missing — falling ' +
    "back to the cluster's local copy. EXPECTED_DAEMON_VERSION may be " +
    'stale if that cluster lags the CDN.',
  );
}
const versionPath = join(__dirname, '..', 'src', 'lib', 'version.ts');

function fail(msg) {
  console.error(`[sync-daemon-version] ${msg}`);
  process.exit(1);
}

let daemonSrc;
try {
  daemonSrc = readFileSync(daemonPath, 'utf8');
} catch (e) {
  fail(`cannot read ${daemonPath}: ${e.message}`);
}

const m = daemonSrc.match(/^DAEMON_VERSION\s*=\s*"([^"]+)"/m);
if (!m) fail(`DAEMON_VERSION marker not found in ${daemonPath}`);
let daemonVersion = m[1];

// ── PUBLISH-SURFACE GATE (2026-09-13, operator field report) ──────────────
//
// The loop this prevents, seen on MeshKore Server 2026-09-13:
//
//   daemon/constants.py    py-1.35.10   (source — bumped by the AX23 agent)
//   public/reference/…     py-1.35.9    (CDN bundle — bundle.py never re-run)
//   cockpit EXPECTED       py-1.35.10   (this script, synced from the source)
//
// Every cluster then sat on the "Updating MeshKore Core…" screen forever:
// the cockpit demanded 1.35.10, the CDN handed back 1.35.9 on every retry,
// and the daemon — correctly — refused to "update" to a version that isn't
// newer than the one it already runs. Nothing was broken; the three numbers
// were just published out of order.
//
// The asymmetry that makes this easy to hit: the EXPECTED sync below is
// AUTOMATIC (prebuild), while publishing the bundle is three MANUAL steps
// (`python3 bundle.py`, copy to public/reference/…, commit + deploy — see
// daemon/README.md). So a cockpit deploy that forgets the manual half ships
// an expectation the CDN cannot satisfy. Hence: a cockpit build must never
// expect a daemon the publish surface doesn't serve.
const publishedDaemonPath = join(
  __dirname, '..', 'public', 'reference', 'cluster', 'scripts', 'daemon.py',
);
if (!existsSync(publishedDaemonPath)) {
  fail(`publish surface missing: ${publishedDaemonPath}`);
}
// Only the leading marker is needed — it sits in the first 8 KB precisely so
// the version-watcher can range-fetch it, so don't read 1 MB to find it.
const publishedHead = readFileSync(publishedDaemonPath, 'utf8').slice(0, 8192);
const pm = publishedHead.match(/^DAEMON_VERSION\s*=\s*"([^"]+)"/m);
if (!pm) fail(`DAEMON_VERSION marker not found in ${publishedDaemonPath}`);
const publishedVersion = pm[1];

if (publishedVersion !== daemonVersion) {
  if (!process.env.MESHKORE_ALLOW_VERSION_SKEW) {
    fail(
      `REFUSING TO BUILD — daemon source is ${daemonVersion} but the publish ` +
      `surface still serves ${publishedVersion}.\n` +
      `  Shipping this cockpit would pin EXPECTED_DAEMON_VERSION to ` +
      `${daemonVersion}, which the CDN does not serve: every cluster would ` +
      `loop on "Updating MeshKore Core…" forever.\n` +
      `  Publish the bundle first:\n` +
      `    cd ../daemon && python3 bundle.py \\\n` +
      `      && cp dist/daemon.py dist/daemon.py.sig ` +
      `../architect/public/reference/cluster/scripts/\n` +
      `  Then commit public/reference/cluster/scripts/ and rebuild.\n` +
      `  (Deliberately building a cockpit AHEAD of the CDN — a daemon ` +
      `refactor in flight — set MESHKORE_ALLOW_VERSION_SKEW=1; EXPECTED then ` +
      `pins to the PUBLISHED ${publishedVersion}, not the source.)`,
    );
  }
  // Escape hatch: pin the cockpit to what the CDN actually serves. Pinning
  // BEHIND is safe (the daemon is merely "ahead"); pinning AHEAD is the loop.
  console.warn(
    `[sync-daemon-version] MESHKORE_ALLOW_VERSION_SKEW — source is ` +
    `${daemonVersion} but the CDN serves ${publishedVersion}; pinning ` +
    `EXPECTED to the published ${publishedVersion}.`,
  );
  daemonVersion = publishedVersion;
}

let versionSrc;
try {
  versionSrc = readFileSync(versionPath, 'utf8');
} catch (e) {
  fail(`cannot read ${versionPath}: ${e.message}`);
}

const before = versionSrc.match(/export const EXPECTED_DAEMON_VERSION\s*=\s*'([^']+)';/);
if (!before) fail(`EXPECTED_DAEMON_VERSION line not found in ${versionPath}`);

if (before[1] === daemonVersion) {
  console.log(`[sync-daemon-version] EXPECTED already at ${daemonVersion}, no change`);
  process.exit(0);
}

const next = versionSrc.replace(
  /export const EXPECTED_DAEMON_VERSION\s*=\s*'[^']+';/,
  `export const EXPECTED_DAEMON_VERSION = '${daemonVersion}';`,
);
writeFileSync(versionPath, next, 'utf8');
console.log(`[sync-daemon-version] ${before[1]} → ${daemonVersion}`);
