/**
 * rail-tree.ts — BT-6 (base-team). Which rows the agent rail shows, and
 * which of them hang under another.
 *
 * Operator, 2026-09-28: *"los child… deberían mostrarse desplazados en unos
 * 20 píxeles a la derecha y con una rayita de dependencia desde el de
 * arriba… a medida que terminan se van cerrando, no necesitamos ni siquiera
 * que queden esos históricos ahí"*.
 *
 * A conv is a CHILD when it is doing work for another conv: a member
 * session holding briefs (`open_requests[].parent_conv`) or a delegated /
 * dispatched conv (`parent_conv`). A child is shown only while it has
 * something to do for its parent — live, coordinating, or still holding a
 * brief — or while the operator has it open; then it sits right under its
 * parent. Its trace lives on in the parent's thread (the wake turn).
 *
 * The master conv is never a child: it is the operator's own row even
 * when the Orchestrator hands it a brief.
 */

export interface RailConv {
  parent_conv?: string | null;
  open_requests?: Array<{ parent_conv?: string | null }> | null;
  live?: boolean;
  coordinating?: boolean;
}

export interface RailRow {
  conv: string;
  /** 0 = top level; 1+ = nested under the row above it. */
  depth: number;
}

export function railParentOf(conv: string, c: RailConv | undefined, root: string): string | null {
  if (!c || conv === root) return null;
  const req = (c.open_requests ?? []).find((r) => r?.parent_conv)?.parent_conv;
  return req || c.parent_conv || null;
}

function busy(c: RailConv | undefined): boolean {
  return !!(c && (c.live || c.coordinating || (c.open_requests?.length ?? 0) > 0));
}

/**
 * @param order  top-level order as the rail already computes it (master first,
 *               operator drag order, then creation order). Children found in
 *               it are pulled out and re-inserted under their parent.
 */
export function railTree(
  order: string[],
  convs: Record<string, RailConv | undefined>,
  opts: { root: string; active: string | null; maxDepth?: number },
): RailRow[] {
  const maxDepth = opts.maxDepth ?? 3;
  const present = new Set(order);
  const parent = new Map<string, string>();
  for (const id of order) {
    const p = railParentOf(id, convs[id], opts.root);
    if (p && p !== id) parent.set(id, p);
  }
  const visible = (id: string): boolean =>
    !parent.has(id) || busy(convs[id]) || id === opts.active;

  const kids = new Map<string, string[]>();
  const top: string[] = [];
  for (const id of order) {
    if (!visible(id)) continue;
    const p = parent.get(id);
    if (p && present.has(p) && visible(p)) {
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p)!.push(id);
    } else {
      top.push(id);
    }
  }

  const out: RailRow[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number): void => {
    if (seen.has(id)) return; // a cycle in stale sidecars must not hang the rail
    seen.add(id);
    out.push({ conv: id, depth: Math.min(depth, maxDepth) });
    for (const k of kids.get(id) ?? []) walk(k, depth + 1);
  };
  for (const id of top) walk(id, 0);
  // Anything only reachable through a cycle still gets a row.
  for (const id of order) if (visible(id) && !seen.has(id)) walk(id, 0);
  return out;
}
