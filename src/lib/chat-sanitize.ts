/**
 * chat-sanitize.ts — pure text/payload scrubbers for the chat layer.
 *
 * AX12 (cockpit-excellence). These three helpers were buried inside the
 * chat store; they touch no store state, so they live here where they
 * can be unit-tested and reused by any renderer.
 *
 * Both strippers are belt-and-braces: the daemon already scrubs its own
 * output server-side, but a `delta` from an older daemon (or a message
 * persisted by one) can still carry the wire markers, and the operator
 * must never see them.
 */

import { log } from './log.ts';

/** Chat attachment served by the daemon. The `url` is daemon-relative
 *  (e.g. `/chat/uploads/2026-06-10/abc.png`); resolve against the
 *  active daemon's httpBase to display. */
export interface ChatAttachment {
  kind: 'image' | 'file';
  media_type: string;
  url: string;
  size_bytes?: number;
  filename?: string;
}

/** Drop `REMEMBER: …` lines an agent emitted for the role-memory
 *  sidecar — they are instructions to the daemon, not operator prose. */
export function stripRememberLines(text: string): string {
  if (!text) return text;
  return text
    .split('\n')
    .filter((ln) => !/^\s*(?:[-*]\s+)?REMEMBER:\s/i.test(ln))
    .join('\n')
    .trimEnd();
}

/**
 * Strip the daemon↔frontend `⟦anchor⟧ {...}` /
 * `⟦anchor-progress⟧ {...}` wire markers.
 *
 * Daemon py-1.13.2 strips them before persisting, but messages written
 * by py-1.13.0/1.13.1 — and any older daemon on the other end — still
 * carry them.
 */
export function stripAnchorMarkers(text: string): string {
  if (!text || !text.includes('⟦')) return text;
  let out = text;
  for (const name of ['report', 'anchor-progress', 'anchor']) out = sweepMarker(out, name);
  out = out.replace(/^[ \t]*⟦become⟧[ \t]*`?[a-z][a-z0-9-]{1,31}`?[ \t]*\n?/gm, '');
  // LIVE2 — a streaming text can stop mid-marker (`…despliegue.⟦anchor`);
  // the rest arrives with the next delta. Never paint the fragment.
  return out.replace(/⟦[a-z-]{0,24}⟧?[ \t]*$/, '');
}

/**
 * BT-4 — remove every `⟦<name>⟧ {json}`, wherever it sits on its line. The
 * payload ends at its own closing brace (balanced, string-aware), not at the
 * LAST `}` of the line: `⟦report⟧ {..}⟦anchor⟧ {..} prose` (mf27) matched
 * nothing under the old pattern and showed up whole. A reported payload's
 * bare echo on its own line goes too.
 */
function sweepMarker(text: string, name: string): string {
  const tag = `⟦${name}⟧`;
  let out = '';
  let pos = 0;
  const echoes: string[] = [];
  for (;;) {
    const at = text.indexOf(tag, pos);
    if (at < 0) break;
    let i = at + tag.length;
    while (text[i] === ' ' || text[i] === '\t') i += 1;
    if (text[i] !== '{') { out += text.slice(pos, i); pos = i; continue; }
    const end = jsonEnd(text, i);
    let stop = end < 0 ? (text.indexOf('\n', i) < 0 ? text.length : text.indexOf('\n', i)) : end;
    if (end >= 0 && name === 'report') echoes.push(text.slice(i, end));
    out += text.slice(pos, at);
    while (text[stop] === ' ' || text[stop] === '\t') stop += 1;
    if (text[stop] === '\n' && (out === '' || out.endsWith('\n'))) stop += 1;
    pos = stop;
  }
  out += text.slice(pos);
  if (!echoes.length) return out;
  const same = (a: string, b: string): boolean => {
    try { return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b)); } catch { return false; }
  };
  return out.split('\n').filter((ln) => !echoes.some((e) => same(ln.trim(), e))).join('\n');
}

/** Index just past the JSON object starting at `i`, or -1 if it never closes. */
function jsonEnd(text: string, i: number): number {
  let depth = 0;
  let inStr = false;
  for (let j = i; j < text.length; j += 1) {
    const ch = text[j];
    if (inStr) {
      if (ch === '\\') j += 1;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return j + 1;
    } else if (ch === '\n') return -1;
  }
  return -1;
}

/** Both scrubbers in the order the ingest path applies them. */
export function cleanChatText(text: string): string {
  return stripAnchorMarkers(stripRememberLines(text));
}

/**
 * Validate + normalise the daemon's `chat.user.attachments` field.
 * Returns undefined when nothing valid survives; the caller treats that
 * the same as "no attachments".
 *
 * A-UPLOAD-URL-01 (2026-06-16) — only a real served upload
 * (`/chat/uploads/…`), an absolute http(s) url, or a local `data:` URL
 * (optimistic bubble) may be rendered. A conv slug once leaked into
 * `url` and painted a broken `<img>`; anything else is malformed.
 */
/**
 * Merge incoming attachments over the ones already on the bubble.
 *
 * The daemon absorbs upload failures silently and still emits the
 * `chat.user` echo text-only (daemon/chatsvc.py: "the dispatch still
 * proceeds with text-only"). Letting that echo land verbatim would wipe
 * the optimistic `data:` URLs that are already painting — the images
 * vanish exactly when the turn starts. So: an echo that carries NO
 * attachments keeps what the bubble already shows; an echo that carries
 * some replaces them (data: URLs → canonical /chat/uploads/ URLs).
 */
export function keepAttachments(
  prev: ChatAttachment[] | undefined,
  incoming: ChatAttachment[] | undefined,
): ChatAttachment[] | undefined {
  return incoming ?? prev;
}

export function parseAttachments(raw: unknown): ChatAttachment[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: ChatAttachment[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const rec = e as Record<string, unknown>;
    const url = typeof rec.url === 'string' ? rec.url : '';
    const media_type = typeof rec.media_type === 'string' ? rec.media_type : '';
    if (!url || !media_type) continue;
    const validUrl =
      url.startsWith('/chat/uploads/') ||
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('data:');
    if (!validUrl) {
      log.warn('parseAttachments dropped malformed url', { url: url.slice(0, 80) });
      continue;
    }
    out.push({
      kind: rec.kind === 'image' ? 'image' : 'file',
      media_type,
      url,
      size_bytes: typeof rec.size_bytes === 'number' ? rec.size_bytes : undefined,
      filename: typeof rec.filename === 'string' ? rec.filename : undefined,
    });
  }
  return out.length ? out : undefined;
}
