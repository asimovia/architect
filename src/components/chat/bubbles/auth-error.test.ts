import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isClaudeAuthError, isClaudeCodeAuthFailure } from './auth-error.ts';

test('CCA1 — Claude Code failing to authenticate is recognised (reddit 2026-10-20)', () => {
  assert.equal(isClaudeAuthError('Failed to authenticate: OAuth session expired and could not be refreshed'), true);
  assert.equal(isClaudeAuthError('OAuth token has expired. Please run /login'), true);
});

test('an answer that talks about authentication keeps its text', () => {
  assert.equal(isClaudeAuthError('Revisé el login: el middleware ya no devuelve "Failed to authenticate".'), false);
  assert.equal(isClaudeAuthError(''), false);
});

test('CCA4 — the sign-in card is only for replies Claude Code produced', () => {
  const t = 'Failed to authenticate: OAuth session expired and could not be refreshed';
  assert.equal(isClaudeCodeAuthFailure(t, 'claude-code'), true);
  assert.equal(isClaudeCodeAuthFailure(t, 'muse'), false);
  assert.equal(isClaudeCodeAuthFailure(t, 'codex'), false);
  assert.equal(isClaudeCodeAuthFailure(t, undefined), false);
});
