/**
 * AgentsPanel — the Team zone (ATM3).
 *
 * The TEAM ROSTER manager: a card grid of team members from `GET /team`
 * (teamStore) — create (ATM4 dialog) / edit (ATM6 detail panel) /
 * delete, with required/kind/exposure badges and a live instance COUNT
 * per card.
 *
 * Instances themselves (the live conversations + active runs) are NOT
 * listed here — they live only in the chat rail's agents column. This
 * page shows the roster and, per member, how many instances are live
 * (the "N live" badge on the card).
 */

import { For, Show, createResource, createSignal } from 'solid-js';
import type { TeamMember } from '~/lib/daemon-client';
import { daemonStore } from '~/state/daemon';
import { teamStore } from '~/state/team';
import { modelLabel } from '~/lib/models';
import { deletedText } from '~/lib/team-errors';
import NewMemberDialog from '~/components/team/NewMemberDialog';
import MemberDetailPanel from '~/components/team/MemberDetailPanel';
import { ConfirmButtons } from '~/components/ui/ConfirmButtons';

/** First paragraph of the init prompt, trimmed to ~120 chars — the
 *  card's one-line mission (ATM3). Strips a leading `# Heading`. */
function missionLine(body: string | null | undefined): string {
  if (!body) return '';
  const paras = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^#{1,6}\s/.test(p) && !/^(##\s*Mission)/i.test(p));
  const first = paras[0] ?? '';
  const flat = first.replace(/\s+/g, ' ').replace(/^#{1,6}\s+/, '');
  return flat.length > 120 ? flat.slice(0, 117) + '…' : flat;
}

export default function AgentsPanel() {
  const [newMemberOpen, setNewMemberOpen] = createSignal(false);
  const [detailId, setDetailId] = createSignal<string | null>(null);
  // TMR4 — what the last roster operation did, in one line. A create, a
  // duplicate or a delete that closed a circle (who stopped delegating to
  // the deleted member, which open agents kept running) has consequences
  // the grid alone cannot show.
  const [notice, setNotice] = createSignal<string | null>(null);
  const [problem, setProblem] = createSignal<string | null>(null);

  const say = (text: string | null): void => {
    setProblem(null);
    if (!text) return;
    setNotice(text);
    setTimeout(() => { if (notice() === text) setNotice(null); }, 8000);
  };

  const duplicate = async (id: string): Promise<void> => {
    const c = daemonStore.state.client;
    if (!c) return;
    const res = await teamStore.duplicate(c, id);
    if (res.ok) { say(`Duplicated as “${res.member.name}”.`); return; }
    setNotice(null);
    setProblem(res.error ?? `Duplicate failed (HTTP ${res.status}).`);
  };

  const remove = async (id: string): Promise<void> => {
    const c = daemonStore.state.client;
    if (!c) return;
    const res = await teamStore.remove(c, id);
    if (res.ok) { say(deletedText(res.result) ?? 'Member deleted.'); return; }
    setNotice(null);
    setProblem(res.error ?? `Delete failed (HTTP ${res.status}).`);
  };

  return (
    <section class="zone-host p-4 overflow-y-auto">
      {/* Roster toolbar */}
      <header class="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-mono uppercase tracking-wider text-gray-400">Team</h2>
          <p class="text-[11px] text-gray-600 mt-0.5">
            The members that make up this cluster's team. Create, edit,
            and see how many instances of each are live. Open a member to
            work with it; running instances appear in the chat rail.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewMemberOpen(true)}
          class="flex-shrink-0 text-[12px] font-mono text-emerald-300 hover:text-emerald-200 border border-emerald-500/40 hover:border-emerald-500/70 bg-emerald-500/5 rounded px-3 py-1.5 transition-colors"
        >+ New member</button>
      </header>

      <Show when={problem()}>
        <div class="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
          {problem()}
        </div>
      </Show>
      <Show when={notice()}>
        <div class="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-200">
          {notice()}
        </div>
      </Show>

      {/* Roster grid */}
      <Show
        when={teamStore.state.list.length > 0}
        fallback={
          <p class="text-[12px] text-gray-600 italic py-4">
            <Show when={teamStore.state.loading} fallback="No team members yet. Click “+ New member” to add one.">
              Loading team…
            </Show>
          </p>
        }
      >
        <div class="grid gap-3" style={{ 'grid-template-columns': 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          <For each={teamStore.state.list}>
            {(m) => (
              <MemberCard
                member={m}
                highlight={teamStore.state.recentlyCreated === m.id}
                onOpen={() => setDetailId(m.id)}
                onDuplicate={() => { void duplicate(m.id); }}
                onDelete={() => { void remove(m.id); }}
              />
            )}
          </For>
        </div>
      </Show>

      {/* Dialogs */}
      <Show when={newMemberOpen()}>
        <NewMemberDialog
          onClose={() => setNewMemberOpen(false)}
          onCreated={(id) => say(`“${teamStore.get(id)?.name ?? id}” created — it is on the roster below.`)}
        />
      </Show>
      <Show when={detailId()}>
        <MemberDetailPanel
          memberId={detailId()!}
          onClose={() => setDetailId(null)}
          onDeleted={(info) => { setDetailId(null); say(info ?? 'Member deleted.'); }}
          onDuplicated={(id) => { setDetailId(null); say(`Duplicated as “${teamStore.get(id)?.name ?? id}”.`); }}
        />
      </Show>
    </section>
  );
}

function MemberCard(props: {
  member: TeamMember;
  highlight: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const m = () => props.member;
  const client = () => daemonStore.state.client;
  // Lazy-load the body for the one-line mission (roster is small).
  const [body] = createResource(
    () => props.member.id,
    async (id) => {
      const c = client();
      if (!c) return '';
      const d = await teamStore.detail(c, id);
      return d?.body ?? '';
    },
  );
  const color = () => m().color || '#34d399';

  return (
    <div
      class="group relative rounded-lg border bg-gray-900/40 hover:bg-gray-800/50 px-3 py-3 cursor-pointer transition-colors"
      classList={{
        'border-emerald-500/60 ring-1 ring-emerald-500/40': props.highlight,
        'border-gray-800/60': !props.highlight,
      }}
      onClick={props.onOpen}
    >
      <div class="flex items-start gap-2.5">
        <span
          class="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-xl"
          style={{ background: `${color()}1a`, border: `1px solid ${color()}55` }}
          aria-hidden="true"
        >{m().emoji || '🤖'}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-[13px] font-semibold text-gray-100 truncate">{m().name}</span>
            <Show when={m().required}>
              <span title="Required member — cannot be deleted" class="text-amber-300 text-[11px]">🔒</span>
            </Show>
          </div>
          <div class="flex flex-wrap items-center gap-1 mt-1">
            <span class="font-mono text-[9px] text-purple-200 bg-purple-500/10 border border-purple-500/30 rounded px-1.5 py-0.5">
              {modelLabel(m().model)}
            </span>
            <span class="font-mono text-[9px] uppercase tracking-wider text-gray-400 bg-gray-800/60 border border-gray-700/60 rounded px-1.5 py-0.5">
              {m().kind}
            </span>
            {/* TEG-3 — externally exposed member (token-reachable by other
                local software). Pulses briefly on team.request.* activity. */}
            <Show when={m().exposure === 'external'}>
              <span
                class="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-sky-200 bg-sky-500/10 border border-sky-500/30 rounded px-1.5 py-0.5"
                title="Externally exposed — other software on this machine can query this member with its token"
              >
                ↗ external
                <Show when={teamStore.state.requestPulse[m().id]}>
                  <span class="inline-block w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" aria-hidden="true" />
                </Show>
              </span>
            </Show>
            <span
              class="font-mono text-[9px] rounded px-1.5 py-0.5 border"
              classList={{
                'text-emerald-300 bg-emerald-500/15 border-emerald-500/40': (m().instances ?? 0) > 0,
                'text-gray-500 bg-gray-800/40 border-gray-700/50': (m().instances ?? 0) === 0,
              }}
              title="Live non-archived instances (shown in the chat rail)"
            >{m().instances ?? 0} live</span>
          </div>
        </div>
      </div>
      <p class="text-[11px] text-gray-500 mt-2 leading-snug min-h-[2.4em]">
        {body.loading ? '' : (missionLine(body()) || 'No mission set.')}
      </p>
      {/* TMR4 — card actions. Duplicate is always available (the copy is
          born a deletable internal profile whatever the original is);
          delete is hidden on a required member and arms in place — no
          native confirm() in this codebase, and no detour through the
          editor just to remove a card. */}
      <div
        class="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); props.onDuplicate(); }}
          title="Duplicate this member — full card under a new name"
          aria-label={`Duplicate ${m().name}`}
          class="inline-flex items-center justify-center w-6 h-6 rounded text-gray-500 hover:text-emerald-300 border border-transparent hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        </button>
        <Show when={!m().required}>
          <ConfirmButtons
            question="Delete?"
            confirmLabel="Yes"
            onConfirm={props.onDelete}
            trigger={(arm) => (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); arm(); }}
                title="Delete this member"
                aria-label={`Delete ${m().name}`}
                class="inline-flex items-center justify-center w-6 h-6 rounded text-gray-500 hover:text-red-300 border border-transparent hover:border-red-500/40 hover:bg-red-500/5 transition-all"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                </svg>
              </button>
            )}
          />
        </Show>
      </div>
    </div>
  );
}
