/**
 * ClaudeSignInDialog — CCA1. Sign Claude Code in without a terminal.
 *
 * Operator, 2026-10-20: the CLI's login expired, every turn answered
 * "Failed to authenticate", and getting back meant an interactive login in a
 * terminal and a pasted code. Here: one button opens the sign-in page, the
 * operator pastes the code the page shows, and the daemon keeps a one-year
 * token for every Claude Code turn on this machine.
 */

import { Show, createSignal, onMount } from 'solid-js';
import { Modal, type ModalButton } from '~/components/Modal';
import { daemonStore } from '~/state/daemon';
import { claudeAuth, refreshClaudeAuth } from '~/state/claude-auth';

type Step = 'idle' | 'opening' | 'code' | 'saving' | 'done';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ClaudeSignInHost() {
  return (
    <Show when={claudeAuth.dialogOpen()}>
      <ClaudeSignInDialog />
    </Show>
  );
}

function ClaudeSignInDialog() {
  const [step, setStep] = createSignal<Step>('idle');
  const [url, setUrl] = createSignal('');
  const [code, setCode] = createSignal('');
  const [error, setError] = createSignal('');
  const [expires, setExpires] = createSignal('');

  onMount(() => { void refreshClaudeAuth(); });

  const start = async (): Promise<void> => {
    const c = daemonStore.state.client;
    if (!c) return;
    // Open the tab inside the click, or the browser blocks it as a popup.
    const tab = window.open('about:blank', '_blank');
    setError('');
    setStep('opening');
    const r = await c.claudeLoginStart();
    if (!r.ok) {
      tab?.close();
      setError(r.error || 'Could not start the sign-in.');
      setStep('idle');
      return;
    }
    setUrl(r.data.url);
    if (tab) tab.location.href = r.data.url;
    setStep('code');
  };

  const finish = async (): Promise<void> => {
    const c = daemonStore.state.client;
    const v = code().trim();
    if (!c || !v) return;
    setError('');
    setStep('saving');
    const r = await c.claudeLoginFinish(v);
    if (!r.ok) {
      setError(r.error || 'Claude Code did not accept the code.');
      setStep(r.status === 410 ? 'idle' : 'code');
      return;
    }
    setExpires(r.data.expires_at);
    setStep('done');
    void refreshClaudeAuth();
  };

  const close = (): void => {
    if (step() === 'code' || step() === 'opening') void daemonStore.state.client?.claudeLoginCancel();
    claudeAuth.close();
  };

  const buttons = (): ModalButton[] => {
    if (step() === 'done') return [{ id: 'close', label: 'Done', primary: true }];
    if (step() === 'code' || step() === 'saving') {
      return [{ id: 'close', label: 'Cancel' }, { id: 'finish', label: step() === 'saving' ? 'Connecting…' : 'Connect', primary: true }];
    }
    return [{ id: 'close', label: 'Cancel' }];
  };

  const onButton = (id: string | null): void => {
    if (id === 'finish') { if (step() === 'code') void finish(); return; }
    close();
  };

  const st = () => claudeAuth.status();

  return (
    <Modal isOpen={true} onClose={onButton} title="Sign in to Claude Code" zIndex={60} buttons={buttons()} closeOnlyExplicitly>
      <div class="flex flex-col gap-4 text-[13px] text-gray-300">
        <Show when={step() === 'done'} fallback={
          <>
            <p>
              Claude Code runs every agent on this computer with your Claude subscription. Signing in here gives it a
              token that lasts a year, so it no longer stops when the terminal login expires. You can revoke it from
              your claude.ai account at any time.
            </p>
            <Show when={st()}>
              {(s) => (
                <p class="text-[12px] text-gray-400">
                  Now:{' '}
                  {s().stored
                    ? <>connected from the Architect · until {fmtDate(s().expires_at)}</>
                    : s().cli?.logged_in
                      ? <>signed in from a terminal ({s().cli?.subscription ?? s().cli?.method}) — it can expire</>
                      : <span class="text-amber-300">not signed in</span>}
                </p>
              )}
            </Show>
            <Show when={step() === 'idle' || step() === 'opening'}>
              <button
                type="button"
                onClick={() => void start()}
                disabled={step() === 'opening'}
                class="self-start px-4 py-2 rounded-lg bg-emerald-500 text-gray-950 font-semibold hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-wait"
              >{step() === 'opening' ? 'Opening the sign-in page…' : '1 · Open the sign-in page'}</button>
            </Show>
            <Show when={step() === 'code' || step() === 'saving'}>
              <div class="flex flex-col gap-2">
                <p>
                  2 · Approve access on the page that opened, then paste the code it shows you here.
                  <Show when={url()}>
                    {' '}<a href={url()} target="_blank" rel="noopener noreferrer" class="text-blue-300 underline">Page didn't open?</a>
                  </Show>
                </p>
                <input
                  type="text"
                  autofocus
                  value={code()}
                  onInput={(e) => setCode(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void finish(); } }}
                  placeholder="Paste the code"
                  autocomplete="off"
                  spellcheck={false}
                  class="w-full bg-[rgba(11,18,32,0.6)] border border-gray-700/50 rounded-lg px-3.5 py-3 text-[13px] font-mono text-gray-100 focus:outline-none focus:border-emerald-500/60"
                />
              </div>
            </Show>
          </>
        }>
          <p class="text-emerald-300">
            Claude Code is connected until {fmtDate(expires())}. Every agent on this computer uses it from the next turn —
            send your message again where it failed.
          </p>
        </Show>
        <Show when={error()}>
          <p class="text-amber-300 text-[12px]">{error()}</p>
        </Show>
      </div>
    </Modal>
  );
}
