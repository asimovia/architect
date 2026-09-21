import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appliedText, deletedText, teamErrorText } from './team-errors.ts';

describe('teamErrorText (TMR4)', () => {
  it('quotes the daemon reason instead of the bare status', () => {
    const t = teamErrorText(400, '{"error": "model is mandatory and must be non-empty"}');
    assert.match(t, /Model is mandatory/);
  });

  it('says nothing was saved when the daemon never answered', () => {
    assert.match(teamErrorText(0, ''), /did not answer/);
  });

  it('falls back to the status when the body carries nothing', () => {
    assert.equal(teamErrorText(418, ''), 'Refused (HTTP 418).');
  });

  it('keeps a non-JSON body as text', () => {
    assert.equal(teamErrorText(500, 'boom'), 'boom');
  });
});

describe('appliedText (TMR3)', () => {
  it('is quiet-but-explicit when no instance is open', () => {
    assert.match(appliedText({ convs: [], busy: [] })!, /No agent is open/);
  });

  it('reports the instances that took it', () => {
    const t = appliedText({ convs: ['a', 'b'], busy: [] })!;
    assert.match(t, /applied to 2 open agents/);
    assert.match(t, /next message/);
  });

  it('separates the ones that are mid-turn', () => {
    const t = appliedText({ convs: ['a', 'b'], busy: ['b'] })!;
    assert.match(t, /1 is mid-turn/);
  });

  it('is null without a report (an older daemon)', () => {
    assert.equal(appliedText(undefined), null);
  });
});

describe('deletedText (TMR2)', () => {
  it('names both halves of the circle it closed', () => {
    const t = deletedText({ rewired_members: ['developer'], unbound_convs: ['c1', 'c2'] })!;
    assert.match(t, /1 member no longer delegates to it/);
    assert.match(t, /2 open agents kept running/);
  });

  it('says nothing when the member had no ties', () => {
    assert.equal(deletedText({ rewired_members: [], unbound_convs: [] }), null);
  });
});
