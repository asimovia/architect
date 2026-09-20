/**
 * MemberPicker — ATM7. Which roster member's init prompt this instance
 * receives. Editable only while the conv is a DRAFT (no messages yet);
 * after the first dispatch the strip renders a read-only badge instead.
 *
 * Singletons that already have a live instance are not pickable, but the
 * currently-bound member is always listed so the select never shows a
 * value that isn't among its options.
 *
 * ATM21 — a `<Combo>`, not a native `<select>`: the roster is async, and
 * a select that gets its options after its value shows whatever row the
 * browser picked meanwhile (it showed the first member instead of the
 * bound one). The label is now computed from `props.current`.
 */

import { createMemo } from 'solid-js';
import { teamStore } from '~/state/team';
import { Combo, type ComboOption } from '~/components/ui/Combo';
import type { TeamMember } from '~/lib/daemon-client';

export default function MemberPicker(props: { current: string; onPick: (id: string) => void }) {
  const options = createMemo<TeamMember[]>(() => {
    const list = teamStore.pickable();
    const cur = teamStore.get(props.current);
    if (cur && !list.some((m) => m.id === cur.id)) return [cur, ...list];
    return list;
  });
  const comboOptions = createMemo<ComboOption[]>(() =>
    options().map((m) => ({ id: m.id, label: `${m.emoji} ${m.name}` })),
  );
  return (
    <Combo
      ariaLabel="Member"
      value={props.current}
      options={comboOptions()}
      onChange={props.onPick}
      title="Member — the init prompt this instance receives (editable until the first message)"
      class="flex items-center gap-1 bg-gray-800/60 border border-gray-700/60 rounded px-1.5 py-0.5 text-[11px] text-gray-100 hover:border-emerald-500/55 focus:outline-none flex-shrink-0 max-w-[150px]"
    />
  );
}
