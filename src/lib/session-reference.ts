/**
 * session-reference.ts — "what am I looking at", as text a human can read
 * and an agent can act on (RUN-2, 2026-09-27).
 *
 * Operator: *"un iconito en el header que me referencie la sesión… este es
 * el proyecto tal, el agente tal, en la sesión tal, trabajando en estas
 * tareas… para decirte: el Architect de MF27 se está quedando parado, y que
 * tú puedas ver el chat, los eventos y los datos y corregirlo"*.
 *
 * The block names every handle a debugging agent needs to find the thing
 * without asking: project id and folder, conv, member, engine, anchor,
 * live state, both versions, and where the timeline / debug stream live.
 * Pure (no store, no DOM) so `node --test` pins its shape.
 */

export interface SessionFacts {
  projectId: string;
  projectName?: string;
  projectRoot?: string;
  conv: string;
  title?: string;
  agentId?: string;
  member?: string;
  agentType?: string;
  client: string;
  provider?: string;
  model: string;
  effort?: string;
  enginePinned?: boolean;
  initiative?: string | null;
  task?: string | null;
  parentConv?: string | null;
  state: 'working' | 'coordinating' | 'idle';
  waitingOn?: string[];
  daemonVersion?: string;
  cockpitBuild?: number;
  now: Date;
}

/** One `key: value` per line; empty values are left out. */
export function sessionRows(f: SessionFacts): Array<[string, string]> {
  const engine = [
    f.client + (f.provider && f.provider !== 'anthropic' ? `/${f.provider}` : ''),
    f.model || 'CLI default',
    f.effort && f.effort !== 'default' ? `effort ${f.effort}` : '',
    f.enginePinned ? 'pinned in header' : '',
  ].filter(Boolean).join(' · ');
  const rows: Array<[string, string | undefined | null | false]> = [
    ['project', `${f.projectName && f.projectName !== f.projectId ? `${f.projectName} ` : ''}(${f.projectId})`],
    ['folder', f.projectRoot],
    ['agent', [f.title, f.agentId, f.member ? `member ${f.member}` : '', f.agentType && f.agentType !== 'custom' ? f.agentType : ''].filter(Boolean).join(' · ')],
    ['conv', f.conv],
    ['parent', f.parentConv],
    ['engine', engine],
    ['working on', [f.initiative, f.task].filter(Boolean).join(' / ') || null],
    ['state', f.state + (f.waitingOn?.length ? ` — waiting on ${f.waitingOn.join(', ')}` : '')],
    ['versions', [f.daemonVersion ? `daemon ${f.daemonVersion}` : '', f.cockpitBuild ? `cockpit build ${f.cockpitBuild}` : ''].filter(Boolean).join(' · ') || null],
    ['at', f.now.toISOString()],
  ];
  return rows.filter((r): r is [string, string] => typeof r[1] === 'string' && r[1].length > 0);
}

/** The text "Copy for Claude" puts on the clipboard. */
export function sessionReference(f: SessionFacts): string {
  const width = Math.max(...sessionRows(f).map(([k]) => k.length));
  const lines = sessionRows(f).map(([k, v]) => `${k.padEnd(width)}  ${v}`);
  const where: string[] = [];
  if (f.projectRoot) {
    const day = f.now.toISOString().slice(0, 10);
    where.push(`timeline  ${f.projectRoot}/.meshkore/timeline/${day}.jsonl  (filter conv=${f.conv})`);
    where.push(`sidecar   ${f.projectRoot}/.meshkore/.runtime/conv_meta.json  ["${f.conv}"]`);
  }
  where.push(`daemon    GET /chat/conv/${f.conv}/messages · GET /debug/tail  (header X-MeshKore-Project: ${f.projectId})`);
  return ['MeshKore session reference', ...lines, '', ...where].join('\n');
}
