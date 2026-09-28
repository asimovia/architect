/**
 * architect-dispatch.ts — shared entrypoint for running the roadmap.
 *
 * BT-19 (2026-09-29) — the Orchestrator is RETIRED; the Architect is the
 * only coordinator. Run is one call, `POST /roadmap/run {initiatives}`:
 * the daemon stages the queue, writes the kickoff turn itself (it owns
 * the text) and runs it on the Architect's conv, returning which conv
 * that is. The cockpit no longer creates a `roadmap-architect-*` conv,
 * pushes the queue separately, or composes a bootstrap. The history
 * below describes the pre-BT-19 flow.
 *
 * One function (`runArchitectOnScope`) drives both buttons:
 *   • Run All in the header → mode='all', scope = filtered active initiatives
 *   • ▶ on a single InitiativeCard → mode='single', scope = that one initiative
 *
 * Both paths reuse the cluster's existing `roadmap-architect-*` conv when
 * present (single coordinator per cluster by construction); spawn one
 * otherwise. The architect's SOP, validation gate, dispatch wave logic,
 * and depend_on serialisation are the same in both modes — only the
 * bootstrap turn differs.
 *
 * ORC2 (2026-09-22) — the bootstrap no longer PASTES the scope. The
 * queue is server state (`POST /roadmap/queue`), the Orchestrator reads
 * it in its own briefing, and this message is just the operator saying
 * "go" — the same sentence they can type in the chat. Before this the
 * button carried an order that typing did not, so the two entry points
 * were different requests and only one of them worked.
 *
 * The per-initiative variant carries `initiative_id` on the dispatch
 * body so the daemon's linear-init invariant (3) refuses 409 if the
 * architect drifts into other initiatives mid-pass.
 *
 * STOP semantics are uniform: `stopArchitect()` cancels the architect's
 * in-flight turn (chat.cancelled WS event), keeping the conv visible
 * so the operator can read the partial summary. Restart re-dispatches
 * a new bootstrap on the same conv.
 *
 * What this REPLACES
 *   • `InitiativesPanel.onRunAll` inline bootstrap + dispatch (kept as
 *     a 3-liner wrapper).
 *   • `InitiativeCard.startRun` + `storyStore.start` (the per-initiative
 *     play used to spawn its own `story-<initId>` conv via /runs; that
 *     code path is dead post-py-1.12.0-cockpit — we route everything
 *     through the architect, no parallel state machine).
 */

import { chatStore } from '~/state/chat';
import { daemonStore } from '~/state/daemon';
import { uiStore } from '~/state/ui';
import { activeArchitectConv } from '~/state/live-selectors';
import { log } from './log';

/** One initiative in an execution scope. */
export interface ScopeInitiative {
  id: string;
  title: string;
}

/** How the front renders/controls this run — a DISPLAY hint only, NOT an
 *  execution difference. Execution is always "run the ordered list".
 *   • 'all'    → whole-roadmap Run All (Stop = stop the global pass)
 *   • 'single' → one initiative's ▶ (its own spinner)
 *   • 'subset' → an operator-chosen list (future multi-select) */
export type RunDisplay = 'all' | 'single' | 'subset';

/** Unified scope (py-1.21.0): ALWAYS an ordered list (length ≥ 1). Run All =
 *  all active in roadmap order; ▶ = [that one]; future multi-select = the
 *  chosen N in the chosen order. The operator's order is the contract. */
export interface ArchitectScope {
  initiatives: ScopeInitiative[];
  display: RunDisplay;
}

/** BT-19 — the Architect conv: `_onboarding_v1`, else the conv bound to
 *  the `a01` member. Never a retired `roadmap-architect-*` conv. */
function findArchitectConv(): string | null {
  return activeArchitectConv();
}

/** Single entrypoint for Run queue AND per-initiative play: ask the daemon
 *  to run the ordered list on the Architect, then show that conv. The
 *  cockpit's existing state machinery (rail spinners, button states,
 *  conv.activity WS events) reacts from there. */
export async function runArchitectOnScope(scope: ArchitectScope): Promise<void> {
  const client = daemonStore.state.client;
  if (!client) {
    log.warn('[architect-dispatch] no daemon client — abort');
    return;
  }
  if (scope.initiatives.length === 0) {
    log.info('[architect-dispatch] empty scope — nothing to do');
    return;
  }
  const ids = scope.initiatives.map((it) => it.id);
  const res = await client.roadmapRun(ids);
  const conv = res.ok && res.data.conv ? res.data.conv : findArchitectConv();

  uiStore.setActiveZone('architect');
  if (conv) chatStore.setActiveConv(conv);

  void import('./debug-transport').then(({ debugEmit }) => {
    debugEmit(
      'ux.run-architect',
      `Run roadmap (${scope.display}, ${ids.length} initiative(s))`,
      {
        conv: conv ?? undefined,
        data: {
          display: scope.display,
          scope_size: ids.length,
          initiative_ids: ids,
          ok: res.ok,
          started: res.ok ? res.data.started : undefined,
          queued: res.ok ? res.data.queued : undefined,
        },
      },
    );
  });

  if (!res.ok) {
    log.error('[architect-dispatch] /roadmap/run failed', { status: res.status, error: res.error });
  }
}

/** Cancel the Architect's in-flight turn. The conv stays visible
 *  (operator can read the partial summary). Restart by clicking Run
 *  again. Idempotent: no-op if there's no live turn. */
export async function stopArchitect(): Promise<void> {
  const client = daemonStore.state.client;
  if (!client) return;
  const conv = findArchitectConv();
  if (!conv) return;
  const summary = chatStore.state.convs[conv];
  if (!summary || (!summary.live && !summary.coordinating)) return;
  log.info('[architect-dispatch] stop', { conv });
  void import('./debug-transport').then(({ debugEmit }) => {
    debugEmit('ux.stop-architect', 'Stop Architect clicked', { conv });
  });
  try {
    const res = await client.chatCancel(conv);
    if (!res.ok) log.warn('[architect-dispatch] chatCancel non-OK', res.status);
  } catch (e) {
    log.warn('[architect-dispatch] chatCancel threw', e instanceof Error ? e.message : String(e));
  }
}
