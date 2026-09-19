/**
 * lib/chat-stream.ts — thin adapter over `./stream-core`.
 *
 * The pure mapping lives in `stream-core.ts` (leaf module, covered by
 * `stream-core.test.ts` under `node --test`). This file wires the real
 * daemon predicates and keeps the historical import path stable, so
 * `ChatPanel` / `ChatThread` are untouched.
 */

import { isAutonomousConv, isWakeAuthored, type ChatMsg } from '~/state/chat';
import {
  buildStream as coreBuildStream,
  groupAutonomous as coreGroupAutonomous,
  type AutoSegment,
  type StreamItem,
} from './stream-core';

export type { AutoSegment, StreamItem };

export function buildStream(conv: string, msgs: ChatMsg[]): {
  pre: StreamItem[]; queued: StreamItem[]; live: ChatMsg | null;
} {
  return coreBuildStream(conv, msgs, isAutonomousConv, isWakeAuthored);
}

export function groupAutonomous(pre: StreamItem[], live: ChatMsg | null): AutoSegment[] {
  return coreGroupAutonomous(pre, live);
}
