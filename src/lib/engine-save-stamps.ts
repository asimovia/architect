/**
 * engine-save-stamps.ts — ATM14d. Per-cluster record of the last time the
 * operator saved a roster member's engine section (Client/model/effort).
 *
 * Why: a chat-header retune (model/effort pin) beats the member file on
 * every dispatch ("overrides win"). Without ordering info the cockpit
 * cannot tell a deliberate retune from a stale leftover — so saving the
 * member must win going forward. Rule: a pin applies only when it was set
 * AFTER the member's last engine save (see `pinIsLive` in member-shadow).
 * Legacy pins carry no stamp and always lose to the file, which is exactly
 * the "si lo cambio, se cambia" semantic the operator asked for.
 *
 * Storage is localStorage, keyed per cluster — same isolation contract as
 * convMeta. No state imports (dispatch.ts and ChatScopeStrip both use it;
 * importing the stores here would cycle).
 */

import { createSignal } from 'solid-js';

const KEY_PREFIX = 'mc-team-enginesave-v1::';

/** ATM14e — reactive save epoch. `recordEngineSave` bumps it, so every
 *  open chat header re-resolves its engine (model/effort/client) at the
 *  state level the moment the member file is saved — same tab or, via
 *  the `storage` event below, any other open tab. `engineSaveAt` alone
 *  is a plain localStorage read and never notifies Solid. */
const [saveTick, setSaveTick] = createSignal(0);

/** Read in a reactive computation to re-run it on every engine save. */
export function engineSaveTick(): number {
  return saveTick();
}

let storageHooked = false;
function hookStorage(): void {
  if (storageHooked) return;
  storageHooked = true;
  try {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (e) => {
        if (typeof e.key === 'string' && e.key.startsWith(KEY_PREFIX)) setSaveTick((t) => t + 1);
      });
    }
  } catch {
    /* best-effort */
  }
}

hookStorage();

type StampMap = Record<string, number>;

function mapKey(clusterId: string | null | undefined): string {
  return KEY_PREFIX + (clusterId ?? 'unknown');
}

function readAll(clusterId: string | null | undefined): StampMap {
  try {
    const raw = localStorage.getItem(mapKey(clusterId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: StampMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Epoch ms of the last engine save for `memberId`, or null when this
 *  browser never saved it (fresh profile, or a save from another tab). */
export function engineSaveAt(
  clusterId: string | null | undefined,
  memberId: string,
): number | null {
  return readAll(clusterId)[memberId] ?? null;
}

/** Record an engine save for `memberId` now. Call on successful PATCH of
 *  the member's Client/model/effort section. */
export function recordEngineSave(
  clusterId: string | null | undefined,
  memberId: string,
): void {
  try {
    const all = readAll(clusterId);
    all[memberId] = Date.now();
    localStorage.setItem(mapKey(clusterId), JSON.stringify(all));
  } catch {
    /* quota / private mode — stamps are best-effort */
  } finally {
    setSaveTick((t) => t + 1);
  }
}
