/**
 * combo-options.ts — the pure half of `<Combo>` (ATM21).
 *
 * The label a combo SHOWS is computed here, from the value and the option
 * list, and nothing else. That is the whole point of the rewrite: a native
 * `<select>` renders whatever row the BROWSER thinks is selected, which is
 * not always the row the state says (async option lists, restored form
 * state, Solid re-applying `value` only when the value itself changes).
 * Four rounds of "the combos are hardcoded / lie" (ATM14f, ATM17, ATM18,
 * ATM19) were all that same gap. A value with no matching option now shows
 * the value itself — never some other option's label.
 */

export interface ComboOption {
  id: string;
  label: string;
  /** Optional `<optgroup>`-style header. Consecutive options sharing a
   *  group are rendered under one header. */
  group?: string | null;
  /** Rendered but not pickable (a CLI that isn't installed, a provider
   *  with no API key). The CURRENT value is never disabled — locking the
   *  operator out of the value already saved is its own bug (DM-CLI-14). */
  disabled?: boolean;
  /** Second line under the option: why it is greyed out, where to fix it.
   *  It used to be concatenated into the `<option>` label itself. */
  note?: string | null;
}

export interface ComboGroup {
  group: string | null;
  items: ComboOption[];
}

/** What the trigger displays for `value`. Falls back to the raw value (so
 *  an unknown id still shows the truth), then to `placeholder`. */
export function comboLabel(
  options: readonly ComboOption[],
  value: string | null | undefined,
  placeholder = '—',
): string {
  const v = (value ?? '').trim();
  const hit = options.find((o) => o.id === (value ?? ''));
  if (hit) return hit.label;
  return v || placeholder;
}

/** Group consecutive options by their `group` field, preserving order. */
export function groupOptions(options: readonly ComboOption[]): ComboGroup[] {
  const out: ComboGroup[] = [];
  for (const o of options) {
    const g = o.group ?? null;
    const last = out[out.length - 1];
    if (last && last.group === g) last.items.push(o);
    else out.push({ group: g, items: [o] });
  }
  return out;
}

/** The option the keyboard moves to from `value`, skipping disabled rows.
 *  Returns the current value when there is nowhere to go. */
export function comboStep(
  options: readonly ComboOption[],
  value: string | null | undefined,
  delta: 1 | -1,
): string {
  const pickable = options.filter((o) => !o.disabled || o.id === value);
  if (!pickable.length) return value ?? '';
  const i = pickable.findIndex((o) => o.id === value);
  if (i === -1) return (delta === 1 ? pickable[0] : pickable[pickable.length - 1])!.id;
  const next = i + delta;
  if (next < 0 || next >= pickable.length) return pickable[i]!.id;
  return pickable[next]!.id;
}
