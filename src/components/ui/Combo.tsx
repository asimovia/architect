/**
 * Combo — the cockpit's dropdown, replacing every native `<select>` that
 * is fed by an async catalog (ATM21).
 *
 * Why not `<select>`: the row a native select shows is the browser's
 * idea of what is selected, and it stops agreeing with the state the
 * moment the option list arrives after the value (every catalog here:
 * GET /clients, the roster, the provider lists). ATM19 re-applied
 * `el.value` on every option change and ATM19b also set `selected` on
 * each option as it was created; the operator still saw `Client: Claude
 * Code` on a Muse member. So the control is now ours end to end: the
 * trigger renders `comboLabel(options, value)` — a pure function of the
 * state — and there is no browser-held selection to drift from it.
 *
 * The popup is `position: fixed`, measured from the trigger, so no
 * ancestor with `overflow` can clip it (the member drawer scrolls, the
 * chat strip is a tight flex row). It closes on outside click, Escape,
 * scroll and resize; ↑/↓ move, Enter/Space open and pick.
 */

import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { comboLabel, comboStep, groupOptions, type ComboOption } from '~/lib/combo-options';

export type { ComboOption };

const PANEL_CLASS =
  'fixed z-[60] max-h-[min(22rem,60vh)] overflow-y-auto rounded-md border border-gray-700/70 '
  + 'bg-[#0b1220] shadow-2xl py-1';

export function Combo(props: {
  value: string;
  options: ComboOption[];
  onChange: (id: string) => void;
  /** Accessible name — also what the tests look the control up by. */
  ariaLabel: string;
  title?: string;
  /** Trigger classes. Defaults to the member-editor field look. */
  class?: string;
  /** Shown when the value is empty and unlisted. */
  placeholder?: string;
  /** Extra line under each option (hints, availability notes). */
  noteFor?: (o: ComboOption) => string | null;
}) {
  const [open, setOpen] = createSignal(false);
  const [rect, setRect] = createSignal<{ top: number; left: number; width: number; below: boolean } | null>(null);
  let trigger: HTMLButtonElement | undefined;
  let panel: HTMLDivElement | undefined;

  const label = () => comboLabel(props.options, props.value, props.placeholder ?? '—');
  const groups = createMemo(() => groupOptions(props.options));

  const place = (): void => {
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const below = window.innerHeight - r.bottom > 220 || r.top < 260;
    setRect({
      top: below ? r.bottom + 4 : Math.max(8, r.top - 4),
      left: r.left,
      width: r.width,
      below,
    });
  };

  const close = (): void => { setOpen(false); };
  const toggle = (): void => {
    if (open()) { close(); return; }
    place();
    setOpen(true);
  };
  const pick = (o: ComboOption): void => {
    if (o.disabled && o.id !== props.value) return;
    close();
    if (o.id !== props.value) props.onChange(o.id);
  };

  // Window-level listeners only while open: an outside click, Escape, or
  // any scroll/resize (the popup is fixed, so it must not float away).
  createEffect(() => {
    if (!open()) return;
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node | null;
      if (t && (trigger?.contains(t) || panel?.contains(t))) return;
      close();
    };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close(); };
    const onMove = (): void => close();
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    onCleanup(() => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    });
  });

  const onTriggerKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = comboStep(props.options, props.value, e.key === 'ArrowDown' ? 1 : -1);
      if (next !== props.value) props.onChange(next);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  };

  return (
    <>
      <button
        type="button"
        ref={trigger}
        onClick={toggle}
        onKeyDown={onTriggerKey}
        aria-label={props.ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open()}
        title={props.title}
        data-combo-value={props.value}
        class={props.class
          ?? 'w-full flex items-center gap-2 bg-[#020617] border border-gray-700/40 rounded px-2.5 py-1.5 text-[13px] font-mono text-gray-100 hover:border-gray-600 focus:outline-none focus:border-emerald-500/55'}
      >
        <span class="flex-1 min-w-0 truncate text-left">{label()}</span>
        <svg class="w-3 h-3 flex-shrink-0 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <Show when={open() && rect()}>
        <div
          ref={panel}
          role="listbox"
          aria-label={props.ariaLabel}
          class={PANEL_CLASS}
          style={{
            top: rect()!.below ? `${rect()!.top}px` : 'auto',
            bottom: rect()!.below ? 'auto' : `${window.innerHeight - rect()!.top}px`,
            left: `${rect()!.left}px`,
            'min-width': `${Math.max(rect()!.width, 180)}px`,
            'max-width': '90vw',
          }}
        >
          <For each={groups()}>
            {(g) => (
              <>
                <Show when={g.group}>
                  <div class="px-2.5 pt-1.5 pb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-gray-500">{g.group}</div>
                </Show>
                <For each={g.items}>
                  {(o) => {
                    const selected = (): boolean => o.id === props.value;
                    const blocked = (): boolean => !!o.disabled && !selected();
                    const note = (): string | null => props.noteFor?.(o) ?? null;
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected()}
                        onClick={() => pick(o)}
                        class="w-full text-left px-2.5 py-1.5 text-[13px] font-mono flex flex-col gap-0.5 transition-colors"
                        classList={{
                          'text-emerald-300 bg-emerald-500/10': selected(),
                          'text-gray-500 cursor-not-allowed': blocked(),
                          'text-gray-200 hover:bg-gray-800/70': !selected() && !blocked(),
                        }}
                      >
                        <span class="truncate">{selected() ? '✓ ' : ''}{o.label}</span>
                        <Show when={note()}>
                          <span class="text-[10px] text-gray-500 truncate">{note()}</span>
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </>
            )}
          </For>
        </div>
      </Show>
    </>
  );
}

export default Combo;
