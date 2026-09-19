/**
 * member-shadow.test.ts — ATM14g. The chat header must show the engine the
 * NEXT turn will actually run on, resolved in the same order the daemon uses
 * (`teamsvc._member_dispatch_prep`): conv override → member card → daemon
 * snapshot. A header that resolves it differently is what kept this bug alive
 * for four rounds — the operator saw "Auto / claude-code" on a conv whose card
 * said muse, and neither number was wrong on its own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDisplayEngine, withLiveOption } from './member-shadow.ts';

const MEMBER = { client: 'muse', model: 'muse-spark-1.3-contributor', effort: 'default' };

test('a bound conv with no override shows the member card', () => {
  const e = resolveDisplayEngine({ member: 'architect-master' }, null, MEMBER);
  assert.deepEqual(e, {
    model: 'muse-spark-1.3-contributor',
    effort: 'default',
    client: 'muse',
    provider: 'anthropic',
  });
});

test('follow-values are not overrides', () => {
  const e = resolveDisplayEngine(
    { member: 'architect-master', model: 'auto', effort: 'default' },
    null,
    MEMBER,
  );
  assert.equal(e.model, 'muse-spark-1.3-contributor');
  assert.equal(e.effort, 'default');
});

test('a deliberate header retune wins over the card, per dial', () => {
  const e = resolveDisplayEngine(
    { member: 'architect-master', model: 'opus' },
    null,
    { ...MEMBER, effort: 'high' },
  );
  assert.equal(e.model, 'opus');
  assert.equal(e.effort, 'high');
});

test('the engine the daemon stamped on save is what shows', () => {
  // ATM14g: saving the card writes the card's values into the conv sidecar,
  // which arrives as convMeta. Header and wire therefore cannot disagree.
  const e = resolveDisplayEngine(
    { member: 'architect-master', model: 'muse-spark-1.3-contributor', client: 'muse' },
    { model: 'opus', client: 'claude-code' },
    MEMBER,
  );
  assert.equal(e.model, 'muse-spark-1.3-contributor');
  assert.equal(e.client, 'muse');
});

test('client always follows the card — there is no per-conv client picker', () => {
  const e = resolveDisplayEngine(
    { member: 'architect-master', client: 'claude-code' },
    { client: 'claude-code' },
    MEMBER,
  );
  assert.equal(e.client, 'muse');
});

test('provider follows member → sidecar → snapshot → anthropic', () => {
  const meta = { member: 'm', provider: 'zai' };
  assert.equal(
    resolveDisplayEngine(meta, null, { ...MEMBER, provider: 'meta' }).provider,
    'zai',
  );
  assert.equal(
    resolveDisplayEngine({ member: 'm' }, null, { ...MEMBER, provider: 'meta' }).provider,
    'meta',
  );
  assert.equal(
    resolveDisplayEngine({ member: 'm' }, { provider: 'zai' }, MEMBER).provider,
    'zai',
  );
  assert.equal(resolveDisplayEngine({ member: 'm' }, null, MEMBER).provider, 'anthropic');
});

test('an unbound conv falls back to the daemon snapshot, then the default', () => {
  const e = resolveDisplayEngine({}, { model: 'sonnet', client: 'codex' }, undefined);
  assert.deepEqual(e, { model: 'sonnet', effort: 'default', client: 'codex', provider: 'anthropic' });
  assert.deepEqual(resolveDisplayEngine(undefined, null, undefined), {
    model: 'auto',
    effort: 'default',
    client: 'claude-code',
    provider: 'anthropic',
  });
});

test('a bound member the roster has not hydrated yet does not blank the header', () => {
  const e = resolveDisplayEngine({ member: 'ghost', model: 'opus' }, { client: 'codex' }, undefined);
  assert.equal(e.model, 'opus');
  assert.equal(e.client, 'codex');
});

test('a bound non-claude member with no model pinned defaults to the CLI default, not auto', () => {
  // ATM17 follow-up: `auto` only exists in the claude-code catalog — showing
  // it under Codex painted an Anthropic id on a non-Anthropic engine.
  const e = resolveDisplayEngine(
    { member: 'codex-dev' },
    null,
    { client: 'codex', model: '', effort: 'default' },
  );
  assert.deepEqual(e, { model: '', effort: 'default', client: 'codex', provider: 'anthropic' });
});

test('a bound claude-code member with no model pinned still defaults to auto', () => {
  const e = resolveDisplayEngine(
    { member: 'dev' },
    null,
    { client: 'claude-code', model: '', effort: '' },
  );
  assert.equal(e.model, 'auto');
  assert.equal(e.client, 'claude-code');
});

test('an unbound codex conv with no model anywhere defaults to the CLI default', () => {
  const e = resolveDisplayEngine({}, { model: '', client: 'codex' }, undefined);
  assert.equal(e.model, '');
  assert.equal(e.client, 'codex');
});

test('withLiveOption appends an unlisted live value, and only that', () => {
  const opts = [{ id: 'opus', label: 'Opus' }];
  assert.deepEqual(withLiveOption(opts, 'muse-spark-1.3-contributor'), [
    ...opts,
    { id: 'muse-spark-1.3-contributor', label: 'muse-spark-1.3-contributor (member)' },
  ]);
  assert.deepEqual(withLiveOption(opts, 'opus'), opts);
  assert.deepEqual(withLiveOption(opts, ''), opts);
});
