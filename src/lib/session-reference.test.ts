import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionReference, sessionRows, type SessionFacts } from './session-reference.ts';

const BASE: SessionFacts = {
  projectId: 'mf27', projectName: 'MF27', projectRoot: '/Users/x/Prj/mf27',
  conv: '_onboarding_v1', title: 'Architect', agentId: 'A001', member: 'a01', agentType: 'custom',
  client: 'muse', provider: 'anthropic', model: 'muse-spark-1.3-contributor', effort: 'default',
  enginePinned: true, initiative: 'testing-observabilidad', task: 'QA1',
  state: 'working', waitingOn: [], daemonVersion: 'py-1.38.6', cockpitBuild: 10032,
  now: new Date('2026-09-27T20:30:00Z'),
};

test('the reference names every handle a debugging agent needs', () => {
  const text = sessionReference(BASE);
  for (const needle of [
    'MF27 (mf27)', '/Users/x/Prj/mf27', 'Architect · A001 · member a01', '_onboarding_v1',
    'muse · muse-spark-1.3-contributor · pinned in header', 'testing-observabilidad / QA1',
    'daemon py-1.38.6 · cockpit build 10032',
    '/Users/x/Prj/mf27/.meshkore/timeline/2026-09-27.jsonl', 'X-MeshKore-Project: mf27',
  ]) assert.ok(text.includes(needle), `missing: ${needle}\n${text}`);
});

test('empty facts are left out, not printed as blanks', () => {
  const rows = sessionRows({ ...BASE, projectRoot: undefined, parentConv: null, initiative: null, task: null });
  const keys = rows.map(([k]) => k);
  assert.ok(!keys.includes('folder') && !keys.includes('parent') && !keys.includes('working on'));
});

test('a coordinating agent says who it waits on', () => {
  const rows = sessionRows({ ...BASE, state: 'coordinating', waitingOn: ['work-a', 'work-b'] });
  assert.ok(rows.some(([k, v]) => k === 'state' && v === 'coordinating — waiting on work-a, work-b'));
});
