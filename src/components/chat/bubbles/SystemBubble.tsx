/**
 * SystemBubble — in-band notice (dispatch errors, a turn that died,
 * rejected anchors, transient warnings). Distinct from operator and
 * agent bubbles: dimmer chrome, a status-tinted left edge, no byline.
 *
 * Two origins since REL1: the cockpit's own in-memory notices (a POST
 * that failed — these disappear on reload) and the daemon's `chat.error`
 * events (a turn whose process died), which ARE persisted and come back
 * with the history.
 *
 * A bubble carrying `retry_text` is a message that never reached the
 * daemon; it offers to send it again rather than making the operator
 * retype what they wrote.
 */

import { Show, createSignal } from 'solid-js';
import { chatStore, type ChatMsg } from '~/state/chat';
import { daemonStore } from '~/state/daemon';

type Tint = { border: string; dot: string; text: string };

const TINTS: Record<'error' | 'warning' | 'info', Tint> = {
  error: { border: '#ef4444', dot: '#f87171', text: '#fecaca' },
  warning: { border: '#f59e0b', dot: '#fbbf24', text: '#fde68a' },
  info: { border: '#6b7280', dot: '#9ca3af', text: '#d1d5db' },
};

export function SystemBubble(props: { conv?: string; msg: ChatMsg }) {
  const [resending, setResending] = createSignal(false);
  const sev = (): 'error' | 'warning' | 'info' => props.msg.system_kind ?? 'info';
  const resend = async (): Promise<void> => {
    const text = props.msg.retry_text;
    const client = daemonStore.state.client;
    const conv = props.conv;
    if (!text || !client || !conv || resending()) return;
    setResending(true);
    await chatStore.dispatchMessage(client, { conv, text });
    setResending(false);
  };
  const tint = (): Tint => TINTS[sev()];
  const ts = (): string => {
    const v = props.msg.ts;
    if (!v) return '';
    const d = new Date(v);
    return Number.isFinite(d.getTime())
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
  };
  return (
    <div
      role="alert"
      class="flex items-start gap-2 mx-2 my-1 px-3 py-2 rounded text-[12.5px] leading-relaxed"
      style={{
        background: 'rgba(120, 27, 30, 0.08)',
        'border-left': `3px solid ${tint().border}`,
        color: tint().text,
      }}
    >
      <span
        aria-hidden="true"
        class="flex-shrink-0 mt-1"
        style={{
          width: '6px', height: '6px',
          'border-radius': '50%',
          background: tint().dot,
        }}
      />
      <div class="flex-1 min-w-0">
        <div class="font-mono text-[10px] uppercase tracking-wider opacity-60 mb-0.5">
          {sev() === 'error' ? 'error' : sev() === 'warning' ? 'warning' : 'system'}
          <Show when={ts()}><span class="ml-2 normal-case opacity-80">{ts()}</span></Show>
        </div>
        <div style={{ 'white-space': 'pre-wrap', 'word-break': 'break-word' }}>
          {props.msg.text}
        </div>
        <Show when={props.msg.retry_text && props.conv}>
          <button
            type="button"
            onClick={() => { void resend(); }}
            disabled={resending()}
            class="mt-1.5 font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-current/40 opacity-80 hover:opacity-100 disabled:opacity-50"
          >
            {resending() ? 'resending…' : 'resend this message'}
          </button>
        </Show>
      </div>
    </div>
  );
}

export default SystemBubble;
