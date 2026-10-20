/**
 * state/claude-auth.ts — CCA1. Is Claude Code signed in on the daemon's
 * machine, and the one sign-in dialog any part of the cockpit can open
 * (the chat's "Failed to authenticate" notice, the General settings row).
 */

import { createSignal } from 'solid-js';
import { daemonStore } from '~/state/daemon';
import type { ClaudeAuthStatus } from '~/lib/daemon/methods/config';

export const CLAUDE_LOGIN_FEATURE = 'clients.claude-login.v1';

const [status, setStatus] = createSignal<ClaudeAuthStatus | null>(null);
const [dialogOpen, setDialogOpen] = createSignal(false);

export function claudeLoginSupported(): boolean {
  return (daemonStore.state.health?.features ?? []).includes(CLAUDE_LOGIN_FEATURE);
}

export async function refreshClaudeAuth(): Promise<ClaudeAuthStatus | null> {
  const c = daemonStore.state.client;
  if (!c || !claudeLoginSupported()) return null;
  const r = await c.claudeAuthStatus();
  if (r.ok) setStatus(r.data);
  return r.ok ? r.data : null;
}

export const claudeAuth = {
  status,
  dialogOpen,
  open: (): void => { setDialogOpen(true); },
  close: (): void => { setDialogOpen(false); },
};
