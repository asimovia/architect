/**
 * UserBubble — an operator turn (right-aligned), or a daemon-synthesised
 * `chat.user` mirrored to the agent side (left-aligned, agent tone).
 *
 * `prepend` marks a message the operator sent while a turn was already
 * running: it renders above the live output with a "queued · merges into
 * next turn" suffix.
 */

import { Show } from 'solid-js';
import type { ChatMsg } from '~/state/chat';
import { CollapsibleText } from '~/components/ui/CollapsibleText';
import BubbleHeader from './BubbleHeader';
import AttachmentGrid from './AttachmentGrid';
import { isSystemAuthored } from './agent-identity';
import { parseWake, wakeLine } from '~/lib/wake-summary';

export function UserBubble(props: { msg: ChatMsg; prepend?: boolean }) {
  // UI strings are English-only. The legacy "architect"/"operator"/"user"
  // author tags normalise to "USER"; any other author is verbatim.
  const label = (): string => {
    const a = props.msg.author?.trim();
    if (a && a !== 'architect' && a !== 'operator' && a !== 'user') return a;
    return 'USER';
  };
  const sys = (): boolean => isSystemAuthored(props.msg);
  // BT-7 — a child's "I'm back" turn is written for the parent AGENT
  // (verdict, report JSON, preview, instructions). The operator gets one
  // sentence; the raw text stays one click away.
  const wake = () => (sys() ? parseWake(props.msg.text) : null);
  return (
    <Show when={!wake()} fallback={
      <div class="flex flex-col gap-0.5 w-full items-start pl-2" style={{ 'font-size': 'var(--fs-chat)' }}>
        <details class="max-w-[85%] text-gray-400">
          <summary class="cursor-pointer list-none text-gray-300">↩ {wakeLine(wake()!)}</summary>
          <pre class="mt-1 whitespace-pre-wrap text-[11px] text-gray-500 font-mono">{props.msg.text}</pre>
        </details>
      </div>
    }>
    <div class={`flex flex-col gap-1.5 w-full ${sys() ? 'items-start' : 'items-end'}`}>
      <BubbleHeader
        primary={label()}
        ts={props.msg.ts}
        align={sys() ? 'left' : 'right'}
        tone={sys() ? 'agent' : 'operator'}
        suffix={props.prepend ? 'queued · merges into next turn' : undefined}
      />
      <div
        class={`max-w-[85%] leading-relaxed ${
          sys() ? 'text-left pl-2' : 'text-right pr-2'
        } ${props.prepend ? 'text-amber-200/95' : 'text-gray-200'}`}
        style={{ 'font-size': 'var(--fs-chat)' }}
      >
        <CollapsibleText text={props.msg.text} />
      </div>
      <Show when={props.msg.attachments && props.msg.attachments.length > 0}>
        <AttachmentGrid msg={props.msg} align={sys() ? 'left' : 'right'} />
      </Show>
    </div>
    </Show>
  );
}

export default UserBubble;
