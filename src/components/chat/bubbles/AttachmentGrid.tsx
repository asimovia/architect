/**
 * AttachmentGrid — the persisted attachments of a `chat.user` message.
 * Images become clickable thumbnails; other files render as a chip with
 * the filename.
 *
 * Daemon URLs are daemon-relative and resolved against the active
 * daemon's `httpBase`. FC-2 (daemon-centralized): an `<img>` / `<a>`
 * load cannot send the `X-MeshKore-Project` header, so the centralized
 * daemon would resolve the upload against its default project (→ 404).
 * The project therefore rides in the query string, which the daemon's
 * guard honours.
 *
 * T-chat-images-robust — every case shows the image, never a broken icon:
 * - retry state resets whenever the resolved URL changes, so the
 *   data: → canonical swap on the WS echo gets fresh load attempts
 *   instead of inheriting the optimistic node's outcome;
 * - a load error retries ONCE with a cache-busting query (covers the
 *   daemon mid-restart / slow-disk race at scroll-up and refresh time);
 *   only a second failure renders a neutral placeholder, never a broken
 *   `<img>`;
 * - while the daemon client isn't bound yet (first paint after refresh)
 *   a daemon-relative URL has no base to resolve against — render the
 *   placeholder instead of a relative request that 404s against the
 *   cockpit origin and poisons the browser cache.
 */

import { For, Show, createEffect, createSignal } from 'solid-js';
import type { ChatMsg } from '~/state/chat';
import { daemonStore } from '~/state/daemon';

function resolve(url: string): { href: string; ready: boolean } {
  if (!url) return { href: url, ready: false };
  if (/^https?:\/\//.test(url) || url.startsWith('data:')) return { href: url, ready: true };
  const base = daemonStore.state.client?.transport.httpBase ?? '';
  if (!base) return { href: url, ready: false };
  let out = base.replace(/\/+$/, '') + url;
  const pid = daemonStore.state.client?.transport.projectId;
  if (pid) out += (out.includes('?') ? '&' : '?') + 'project=' + encodeURIComponent(pid);
  return { href: out, ready: true };
}

function Thumb(props: { href: string; alt: string }) {
  const [failed, setFailed] = createSignal(false);
  const [retried, setRetried] = createSignal(false);
  // Fresh URL ( data: → canonical swap on the WS echo) gets fresh
  // attempts: reset the retry state instead of inheriting the old one.
  createEffect(() => {
    void props.href;
    setFailed(false);
    setRetried(false);
  });
  // One retry with a cache-buster: the file is immutable (rand suffix),
  // so a first-load miss is a server-side race, not a wrong URL.
  // `retry=1` is ignored by the daemon's static serve path.
  const src = (): string =>
    retried() ? props.href + (props.href.includes('?') ? '&' : '?') + 'retry=1' : props.href;
  const onError = (): void => {
    if (!retried()) setRetried(true);
    else setFailed(true);
  };
  return (
    <Show
      when={!failed()}
      fallback={
        <span
          class="flex items-center justify-center w-20 h-20 rounded border border-gray-800 bg-gray-900 text-gray-600 text-xl"
          title={props.alt}
          aria-label={`image unavailable: ${props.alt}`}
        >
          🖼
        </span>
      }
    >
      <img
        src={src()}
        alt={props.alt}
        loading="lazy"
        onError={onError}
        style={{ width: '100%', height: '100%', 'object-fit': 'cover' }}
      />
    </Show>
  );
}

export function AttachmentGrid(props: {
  msg?: ChatMsg;
  /** ATT1 — a queued item's attachments (no ChatMsg yet). */
  attachments?: NonNullable<ChatMsg['attachments']>;
  align: 'left' | 'right';
}) {
  const list = (): NonNullable<ChatMsg['attachments']> =>
    props.attachments ?? props.msg?.attachments ?? [];
  return (
    <div
      class={`mt-1 flex flex-wrap gap-1.5 max-w-[85%] ${
        props.align === 'right' ? 'justify-end pr-2' : 'justify-start pl-2'
      }`}
    >
      <For each={list()}>
        {(a) => {
          const r = resolve(a.url);
          const isImg = a.kind === 'image' || a.media_type.startsWith('image/');
          if (isImg) {
            return (
              <Show
                when={r.ready}
                fallback={
                  <span
                    class="block w-20 h-20 rounded border border-gray-800 bg-gray-900 animate-pulse-soft"
                    title={a.filename ?? 'image'}
                  />
                }
              >
                <a
                  href={r.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  class="block w-20 h-20 rounded overflow-hidden border border-gray-800 hover:border-gray-600 transition-colors bg-gray-900"
                  title={a.filename ?? 'image'}
                >
                  <Thumb href={r.href} alt={a.filename ?? 'attached image'} />
                </a>
              </Show>
            );
          }
          return (
            <a
              href={r.href}
              target="_blank"
              rel="noreferrer noopener"
              class="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-gray-800 hover:border-gray-600 bg-gray-900 text-[11px] text-gray-300 transition-colors"
              title={a.filename ?? 'file'}
            >
              <span aria-hidden="true">📎</span>
              <span class="font-mono truncate max-w-[160px]">{a.filename ?? a.media_type}</span>
            </a>
          );
        }}
      </For>
    </div>
  );
}

export default AttachmentGrid;
