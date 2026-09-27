/**
 * Unread finished work — the amber dot on a project row and on an agent card.
 *
 * Operator, 2026-09-27: the dot is on when an agent of that project FINISHED
 * something the operator has not looked at yet, and off when nothing is
 * running or everything has been read. Before this the project dot lit on any
 * WebSocket event after the last visit (presence, meta, a snapshot seed), so
 * every project carried one permanently and it meant nothing.
 *
 * The record is `{cluster → [conv, …]}`: a conv enters when a turn of it ends
 * (final or error) while the operator is not watching it, and leaves the
 * moment it is on screen. Kept in localStorage so a reload does not forget
 * what is still unread. Dependency-free so `node --test` can run it.
 */

export const UNREAD_KEY = 'mc-unread-convs-v1';

export type UnreadMap = Record<string, string[]>;

type KV = Pick<Storage, 'getItem' | 'setItem'>;

/** Event types that mean "a turn of this conv ended with something to read". */
export function isFinishedWork(evType: string, reason?: unknown): boolean {
  if (evType === 'chat.assistant.final') return true;
  // A `chat.error` carrying `reason: 'become'` is a notice, not an ending.
  return evType === 'chat.error' && reason !== 'become';
}

export function markUnread(map: UnreadMap, cluster: string, conv: string): UnreadMap {
  const cur = map[cluster] ?? [];
  if (cur.includes(conv)) return map;
  return { ...map, [cluster]: [...cur, conv] };
}

export function markRead(map: UnreadMap, cluster: string, conv: string): UnreadMap {
  const cur = map[cluster];
  if (!cur || !cur.includes(conv)) return map;
  const rest = cur.filter((c) => c !== conv);
  const next = { ...map };
  if (rest.length) next[cluster] = rest;
  else delete next[cluster];
  return next;
}

export function dropCluster(map: UnreadMap, cluster: string): UnreadMap {
  if (!(cluster in map)) return map;
  const next = { ...map };
  delete next[cluster];
  return next;
}

export function loadUnread(kv: KV | undefined = globalThis.localStorage): UnreadMap {
  try {
    const raw = kv?.getItem(UNREAD_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: UnreadMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(v)) continue;
      const convs = v.filter((c): c is string => typeof c === 'string' && c.length > 0);
      if (convs.length) out[k] = convs;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveUnread(map: UnreadMap, kv: KV | undefined = globalThis.localStorage): void {
  try {
    kv?.setItem(UNREAD_KEY, JSON.stringify(map));
  } catch {
    /* private mode / quota — the dot just won't survive a reload */
  }
}
