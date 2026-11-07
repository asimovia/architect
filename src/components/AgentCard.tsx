/**
 * AgentCard — single row in the ChatRail.
 *
 * 2026-06-10 operator rewrite ("los quiero más limpios, menos
 * bordes, menos datos, al final me suelo guiar por el nombre"):
 *
 *   - Three responsive layouts based on the rail's chatRailWidth:
 *       wide   (≥160 px): name + status spinner on row 1,
 *                         metadata `type · A001 · • local` on row 2
 *       medium (80-159 px): name + status, metadata `type · A001`
 *       narrow (<80 px):    first 5 chars of the NAME only, big
 *   - Borders are dropped for idle cards. State signalling now uses
 *     a coloured left edge (3 px) + a faint background tint when
 *     selected / review / working — never an outline that competes
 *     with the column's own panel border.
 *   - Type compresses to a single char (the emoji `agentVisualInfo`
 *     already supplies — Coder 🧠, Master 👑, Deploy 🚀, etc.).
 *   - Local vs remote becomes a single character (• filled = local,
 *     ○ open = remote) inline in the metadata row.
 *   - ID `A001` lives only in the metadata row, dim and tiny — the
 *     operator's primary handle is the name.
 *
 * Selection wins over working; an unread finish adds an amber dot;
 * drag-over wins over everything (transient).
 */

import { Show } from 'solid-js';
import type { ConvMeta, AgentStatusKind } from '~/state/chat';
import { chatStore, isFixedAgentConv } from '~/state/chat';
import { teamStore } from '~/state/team';
import { clientsStore } from '~/state/clients';
import { agentVisualInfo } from '~/lib/agent-types';
import { resolveDisplayEngine } from '~/lib/member-shadow';
import { modelLabelFor } from '~/lib/engine-chain';

export interface AgentCardProps {
  conv: string;
  meta: ConvMeta;
  active: boolean;
  status: AgentStatusKind;
  pendingReview: boolean;
  stripe: string;
  /** When true (rail < 60 px wide), render the name-letters-only layout. */
  compact?: boolean;
  /** When true (rail < 160 px but ≥ 60 px), drop the location chip and
   *  use a tighter metadata row. */
  medium?: boolean;
  /** HD-12 — briefs this member session is holding, from the daemon's
   *  open-request ledger. Empty for an ordinary conv. */
  waiting?: Array<{ parent_label?: string; parent_conv?: string; brief?: string }>;
  /** 2026-06-13 — raw rail width, so the metadata row can shed pills
   *  progressively (type → +model → +L/R) instead of clipping. */
  railWidth?: number;
  onSelect: (conv: string) => void;
  onDragStart: (conv: string) => void;
  onDragEnd: () => void;
  onDragOver: (conv: string, e: DragEvent) => void;
  onDragLeave: (conv: string) => void;
  onDrop: (conv: string, e: DragEvent) => void;
  dragOver: boolean;
  dragging: boolean;
}

export default function AgentCard(props: AgentCardProps) {
  const isRemote = () => props.meta.location?.type === 'remote';
  // CN10 — canonical display name (title → conv slug), mirrored in
  // ChatScopeStrip. The A00N agentId stays in the tooltip only.
  const title = () => props.meta.title?.trim() || props.conv;
  // Resolve the visual info (emoji + colour + label) from the conv
  // slug + meta; for `_onboarding_v1` this resolves to Architect
  // regardless of stored agent_type.
  const typeInfo = () => agentVisualInfo(props.conv, props.meta);
  // The two fixed system agents (Architect + Orchestrator) —
  // pinned at the rail's head, never draggable, coloured by their type
  // so the operator can tell them apart from the project's own agents
  // at a glance.
  const fixed = () => isFixedAgentConv(props.conv);
  // The model this agent actually runs, named the way the header names it
  // (same resolver: conv override → member card → snapshot). Which CLI
  // carries it does not matter here — Spark 1.3 vs Opus 5 does.
  const engine = () =>
    resolveDisplayEngine(props.meta, chatStore.state.convs[props.conv], teamStore.get(props.meta.member));
  const modelLabel = (): string => {
    const e = engine();
    return modelLabelFor(e.client, e.provider, clientsStore.catalogFor(e.client), e.model);
  };

  // Rail width — drives the "idle" hint visibility (the metadata row now
  // shows model + L/R always; no per-pill width gating).
  const w = (): number => props.railWidth ?? (props.medium ? 130 : 200);

  const cardClasses = (): string => {
    if (props.compact) {
      const base = [
        'group relative w-full text-left',
        `transition-colors ${fixed() ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`,
        'flex items-center justify-start',
        'tracking-tight select-none',
        'border-l-[3px]',
        'py-1 px-2',
      ];
      if (props.dragging) base.push('opacity-35');
      if (props.dragOver) base.push('border-l-cyan-400 bg-cyan-500/5');
      else if (props.active) base.push('border-l-emerald-400 text-gray-50 font-semibold');
      else if (props.status === 'working') base.push('border-l-emerald-500/70 text-emerald-100 animate-pulse-soft');
      else base.push('border-l-transparent text-gray-200 hover:text-gray-50');
      return base.join(' ');
    }
    const base = [
      'group relative w-full text-left px-2.5 py-1.5',
      `transition-colors flex flex-col gap-1 ${fixed() ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`,
      'border-l-[3px]',
    ];
    if (props.dragging) base.push('opacity-35');
    if (props.dragOver) {
      base.push('border-l-cyan-400 bg-cyan-500/5');
    } else if (props.active) {
      /* Operator 2026-06-10: selected row has NO background, NO
       * roundness. Just a bright left bar + brighter text/borders
       * (handled in the inline styles below). Elegant, clean. */
      base.push('border-l-emerald-400');
    } else if (props.status === 'working') {
      base.push('border-l-emerald-500/70 animate-pulse-soft');
    } else {
      /* Subtle hover — text lift only, no full-width bg wash.
       * Operator: "no dejar huecos hacia derecha izquierda". */
      base.push('border-l-transparent');
    }
    return base.join(' ');
  };

  const onClickRow = (): void => props.onSelect(props.conv);
  const onDragStartRow = (e: DragEvent): void => {
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    props.onDragStart(props.conv);
  };
  const onDragOverRow = (e: DragEvent): void => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    props.onDragOver(props.conv, e);
  };
  const onDropRow = (e: DragEvent): void => {
    e.preventDefault();
    props.onDrop(props.conv, e);
  };

  return (
    <button
      type="button"
      draggable={!fixed()}
      data-conv={props.conv}
      onClick={onClickRow}
      onDragStart={onDragStartRow}
      onDragEnd={() => props.onDragEnd()}
      onDragOver={onDragOverRow}
      onDragLeave={() => props.onDragLeave(props.conv)}
      onDrop={onDropRow}
      title={`${title()} · ${props.meta.agentId} · ${typeInfo().label} · ${
        isRemote() ? 'remote' : 'local'
      }${props.pendingReview ? ' · finished, not read yet' : ''}${fixed() ? ' · fixed system agent' : ''}`}
      class={cardClasses()}
    >
      {/* 2026-09-27 — unread finished work: the same amber dot the project
          row carries, so "which project" and "which agent in it" read as
          one signal. Clears the moment this agent is on screen. */}
      <Show when={props.pendingReview}>
        <span class="agent-unread-dot" aria-label="finished — not read yet" />
      </Show>
      <Show
        when={!props.compact}
        fallback={
          /* Narrow: show AS MUCH of the name as fits, clipped at the edge
           * with NO ellipsis (operator 2026-06-19: "una letra y tres
           * puntos es absurdo — quita los puntos y aprovecha el espacio").
           * Same font-size as the expanded body. */
          <span
            aria-label={`${title()} ${props.status}`}
            style={{
              'font-size': 'var(--fs-body, 13px)',
              'text-overflow': 'clip',
              // 2nd correction (2026-07-07) — fixed agents no longer get a
              // unique text colour (operator: "este rojo no pega ni con
              // cola"). They stand out via a soft ACCENT background pill
              // instead, text stays the normal white/gray. Same accent
              // the rest of the theme already uses, so it never clashes.
              ...(fixed() ? {
                background: 'var(--theme-accent-soft-bg)',
                border: '1px solid var(--theme-accent-soft-border)',
                'border-radius': '4px',
                padding: '0 4px',
              } : {}),
            }}
            class="w-full leading-tight overflow-hidden whitespace-nowrap"
          >
            {title()}
          </span>
        }
      >
        {/* ROW 1 — name (primary anchor) + status indicator */}
        <span class="flex items-center gap-2 min-w-0">
          <span
            class={`flex-1 min-w-0 leading-tight overflow-hidden whitespace-nowrap ${
              props.active ? 'text-gray-50 font-semibold' : 'text-gray-200'
            }`}
            style={{
              'font-size': 'var(--fs-body, 13px)',
              'text-overflow': 'clip',
              // See the compact-layout span above for why this is a
              // background pill, not a text colour.
              ...(fixed() ? {
                background: 'var(--theme-accent-soft-bg)',
                border: '1px solid var(--theme-accent-soft-border)',
                'border-radius': '4px',
                padding: '0 4px',
              } : {}),
            }}
          >
            {title()}
          </span>
          <Show
            when={props.status === 'working'}
            fallback={
              /* 2026-06-13 — "idle" text only when there's room (≥150px);
                 below that it steals the name's width → "M..." */
              <Show when={props.active && w() >= 150}>
                <span class="font-mono text-gray-600 flex-shrink-0" style={{ 'font-size': 'calc(9px * var(--fs-scale, 1))' }}>idle</span>
              </Show>
            }
          >
            <span
              class="inline-flex items-center flex-shrink-0"
              aria-label="working"
              title="working"
            >
              {/* A hollow ring, not a dot: the filled amber dot means "finished, unread". */}
              <span class="w-2 h-2 rounded-full border-[1.5px] border-emerald-400 animate-pulse-soft" />
            </span>
          </Show>
        </span>

        {/* ROW 2 — the model, named (2026-09-27: client and L/R badges
         *  removed — the operator wants to see Spark 1.3 vs Opus 5 at a
         *  glance). The ⇠N queue badge still appears when briefs wait. */}
        {(() => {
          const pillBorder = props.active
            ? 'rgba(170, 180, 200, 0.65)'
            : 'rgba(75, 85, 99, 0.45)';
          const dimColor = props.active ? '#cbd5e1' : '#9ca3af';
          return (
            <span class="flex items-center gap-1 font-mono overflow-hidden flex-nowrap"
              style={{ 'font-size': 'var(--fs-meta, 10px)' }}
            >
              {/* The model — the only thing this row says (operator,
                  2026-09-27): no client, no local/remote badge. */}
              <span
                class="inline-flex items-center px-1.5 py-px rounded border min-w-0 truncate"
                style={{ 'border-color': pillBorder, color: dimColor }}
                title={`Model: ${modelLabel()} · ${engine().client}${engine().provider !== 'anthropic' ? ` · ${engine().provider}` : ''}`}
              >
                <span class="truncate">{modelLabel()}</span>
              </span>
              {/* HD-12 — how many agents are waiting on this member. It
                  goes in the metadata row, not beside the name: names vary
                  wildly in length and this must never squeeze one. Amber,
                  because it is a queue, not an error. */}
              <Show when={(props.waiting?.length ?? 0) > 0}>
                <span
                  class="inline-flex items-center px-1.5 py-px rounded border flex-shrink-0"
                  style={{
                    color: 'var(--theme-warn-bright, #fbbf24)',
                    'border-color': 'rgba(251, 191, 36, 0.45)',
                  }}
                  title={
                    `Holding ${props.waiting!.length} brief(s):\n` +
                    props.waiting!
                      .map((r) => `· ${r.parent_label || r.parent_conv || '?'} — ${(r.brief || '').slice(0, 80)}`)
                      .join('\n')
                  }
                >
                  ⇠{props.waiting!.length}
                </span>
              </Show>
            </span>
          );
        })()}
      </Show>
    </button>
  );
}
