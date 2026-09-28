/**
 * team-picker.ts — BT-5. Whether the chat wall is showing the team picker
 * instead of a thread. Opened by the Agents column's ＋, closed by picking
 * a member, by Escape, or by selecting any conv in the rail.
 */

import { createSignal } from 'solid-js';

const [open, setOpen] = createSignal(false);
/** The module selected when ＋ was pressed — the new conv is scoped to it. */
const [module, setModule] = createSignal<string | null>(null);

export const teamPicker = {
  isOpen: open,
  module,
  open: (mod: string | null): void => { setModule(mod); setOpen(true); },
  close: (): void => { setOpen(false); },
};
