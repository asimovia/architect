/**
 * select-sync.ts — ATM19. Keep a `<select>`'s RENDERED row equal to the
 * value it is bound to, including after its options change.
 *
 * This is the bug behind "the combos are hardcoded / sometimes they work
 * and sometimes they don't". Solid compiles `<select value={x}>` to an
 * effect that assigns `el.value` and tracks ONLY `x`. Every engine combo
 * in this cockpit is fed by an ASYNC catalog (`GET /clients`, the
 * roster), so the order on a first open is:
 *
 *   1. the panel seeds the draft from the member card  → value = 'muse'
 *   2. the select renders with the options that exist  → claude-code only
 *   3. `el.value = 'muse'` matches no <option>         → the browser
 *      falls back to the first row, "Claude Code"
 *   4. the catalog lands, <For> re-renders the options → nothing ever
 *      re-applies the value: the row stays a lie
 *
 * Hence the intermittency: open the same drawer a second time (catalog
 * now cached per cluster) and step 2 has the full list, so it works.
 * What the operator saw was a Muse member whose Client combo said Claude
 * Code while the models under it were Muse's — the state was correct the
 * whole time, only the rendered row was wrong.
 *
 * `createEffect` (not a render effect) runs after `<For>` has patched the
 * option nodes for the same update, so re-reading the option source here
 * is enough to re-apply the value in the same frame.
 *
 * Belt AND braces: every combo that uses this ALSO sets `selected` on each
 * `<option>` as it is created, so the right row is picked even before this
 * effect runs and regardless of the order Solid flushes things in. Two
 * cheap mechanisms, because this exact class of bug has now been reported
 * four times (ATM14f → ATM17 → ATM18 → ATM19).
 */

import { createEffect } from 'solid-js';

/**
 * @param el       the select element (use it from `ref`)
 * @param value    the bound value
 * @param options  the reactive option source — read, never used, so the
 *                 effect re-runs whenever the list changes
 */
export function bindSelectValue(
  el: HTMLSelectElement,
  value: () => string | null | undefined,
  options: () => unknown,
): void {
  createEffect(() => {
    options();
    const v = value() ?? '';
    if (el.value !== v) el.value = v;
  });
}
