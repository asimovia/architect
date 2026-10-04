/**
 * Unread finished work, wired to the live store (pure rules in
 * `~/lib/unread-convs`).
 *
 * A conv becomes unread when one of its turns ends while the operator is
 * not looking at it — another project, another agent, or this tab hidden.
 * It becomes read the moment it is the active conv of the active project
 * in a visible tab. Nothing else touches the set, so the dot cannot light
 * up for presence pings or snapshot seeds again.
 */

import { createEffect, createRoot, createSignal } from 'solid-js';
import {
  dropCluster,
  isFinishedWork,
  isReadableConv,
  loadUnread,
  markRead,
  markUnread,
  saveUnread,
  type UnreadMap,
} from '~/lib/unread-convs';
import type { DaemonEvent } from '~/lib/daemon-client';
import { state, activeClusterId } from './store';

const [unread, setUnreadRaw] = createSignal<UnreadMap>(loadUnread());

function setUnread(next: UnreadMap): void {
  if (next === unread()) return;
  setUnreadRaw(next);
  saveUnread(next);
}

function tabVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

const [visible, setVisible] = createSignal(tabVisible());
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => setVisible(tabVisible()));
}

/** The conv on screen right now, as `[cluster, conv]`, or null. */
function watching(): [string, string] | null {
  const cluster = activeClusterId();
  const conv = state.activeConv;
  if (!cluster || !conv || !visible()) return null;
  return [cluster, conv];
}

createRoot(() => {
  createEffect(() => {
    const w = watching();
    if (w) setUnread(markRead(unread(), w[0], w[1]));
  });
});

/** Called for every live event of every project (see ingestEventForCluster). */
export function noteFinishedWork(
  cluster: string,
  ev: DaemonEvent,
  summary?: { parent_conv?: string | null } | null,
): void {
  const conv = typeof ev.conv === 'string' ? ev.conv : '';
  if (!conv || !isFinishedWork(String(ev.type ?? ''), ev.reason)) return;
  if (!isReadableConv(conv, summary)) return;
  const w = watching();
  if (w && w[0] === cluster && w[1] === conv) return;
  setUnread(markUnread(unread(), cluster, conv));
}

/** Has this agent of the ACTIVE project finished something unread? */
export function isConvUnread(conv: string): boolean {
  const cluster = activeClusterId();
  if (!cluster) return false;
  return (unread()[cluster] ?? []).includes(conv);
}

/** Unread convs of a project, minus the archived ones when it is the active
 *  project (an archived agent is off the rail, so its dot would be a ghost). */
export function unreadCountFor(cluster: string): number {
  // DOT1 — entries stored before the rule existed must not keep the dot on.
  const convs = (unread()[cluster] ?? []).filter((c) => isReadableConv(c));
  if (cluster !== activeClusterId()) return convs.length;
  return convs.filter((c) => !state.archivedConvs[c] && isReadableConv(c, state.convs[c])).length;
}

export function markConvRead(cluster: string | null, conv: string): void {
  if (cluster) setUnread(markRead(unread(), cluster, conv));
}

export function forgetUnreadFor(cluster: string): void {
  setUnread(dropCluster(unread(), cluster));
}
