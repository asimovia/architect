/**
 * NewMemberDialog — single-form member creator (ATM13 supersedes the ATM4
 * two-step input → draft → review wizard).
 *
 * One screen, everything editable: name + emoji, plain-language mission,
 * engine picker, references, init prompt. "Draft with AI" is an optional
 * assist that fills prompt/refs/engine from the daemon normaliser — never
 * a gate. Create POSTs /team, the roster picks it up optimistically, the
 * dialog closes on success.
 *
 * The modal is persistent: backdrop click, Escape and the header ✕ are
 * disabled — the ONLY way out is Cancel or Create, so a stray click never
 * eats half-written text.
 *
 * Each member's init prompt lives in `.meshkore/team/<id>.md` (daemon
 * TeamStore, frontmatter + body) — readable from any client (VS Code…).
 * Name/model config also lives there as frontmatter; the daemon is the
 * source of truth, the cockpit only renders it.
 */

import { For, Show, createMemo, createSignal } from 'solid-js';
import { Modal } from '~/components/Modal';
import { daemonStore } from '~/state/daemon';
import { teamStore } from '~/state/team';
import { DEFAULT_PROVIDER } from '~/lib/models';
import { ClientModelEffortPicker, engineBody, type EngineChoice } from '~/components/team/ClientModelEffortPicker';
import type { TeamCreateBody } from '~/lib/daemon-client';

const INPUT_CLASS =
  'w-full bg-[#020617] border border-gray-700/40 rounded px-2.5 py-1.5 text-[13px] text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500/55';
const LABEL_CLASS = 'block font-mono text-[10px] uppercase tracking-[0.14em] text-gray-500 mb-1.5';

export default function NewMemberDialog(props: { onClose: () => void; onCreated?: (id: string) => void }) {
  const client = () => daemonStore.state.client;

  const [name, setName] = createSignal('');
  const [emoji, setEmoji] = createSignal('🤖');
  const [mission, setMission] = createSignal('');
  const [engine, setEngine] = createSignal<EngineChoice>({
    client: 'claude-code',
    provider: DEFAULT_PROVIDER,
    model: 'sonnet',
    effort: 'default',
  });
  const [refs, setRefs] = createSignal<string[]>([]);
  const [prompt, setPrompt] = createSignal('');

  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [drafting, setDrafting] = createSignal(false);
  // TMR4 — the form is taller than the modal, so the operator presses
  // Create at the BOTTOM while the error renders at the top: a refused
  // create looked exactly like a dead button ("le doy a crear y no hace
  // nada"). Scroll the reason into view instead of hoping they find it.
  let bodyEl: HTMLDivElement | undefined;
  const fail = (msg: string): void => {
    setError(msg);
    bodyEl?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const canCreate = createMemo(
    () => name().trim().length > 0 && (prompt().trim().length > 0 || mission().trim().length > 0) && !saving(),
  );

  /** Optional assist: ask the daemon normaliser to draft prompt/refs/engine
   *  from name + mission. Fills the fields in place; everything stays
   *  editable. Failure just shows a hint — never blocks manual creation. */
  const runDraft = async (): Promise<void> => {
    const c = client();
    if (!c || !mission().trim()) return;
    setDrafting(true);
    setError(null);
    try {
      const res = await c.teamDraft({ name: name().trim() || 'member', emoji: emoji().trim() || '🤖', raw_text: mission().trim() });
      if (res.ok) {
        const d = res.data;
        setEngine((e) => ({ ...e, model: d.model || e.model, effort: d.effort || e.effort }));
        setRefs(Array.isArray(d.refs) ? d.refs : []);
        if (d.prompt) setPrompt(d.prompt);
        if (d.name && !name().trim()) setName(d.name);
        if (d.emoji && emoji().trim() === '🤖') setEmoji(d.emoji);
      } else {
        setError('Auto-draft unavailable — fill the init prompt manually.');
      }
    } catch {
      setError('Auto-draft unavailable — fill the init prompt manually.');
    }
    setDrafting(false);
  };

  const create = async (): Promise<void> => {
    const c = client();
    if (!c || !canCreate()) return;
    setSaving(true);
    setError(null);
    // The init prompt IS the member file body (daemon team_create stores
    // body/prompt verbatim in `.meshkore/team/<id>.md`); mission text is
    // the fallback so Create never needs the draft step.
    const body: TeamCreateBody = {
      name: name().trim(),
      emoji: emoji().trim() || '🤖',
      ...engineBody(engine()),
      kind: 'profile',
      refs: refs().map((r) => r.trim()).filter(Boolean),
      prompt: prompt().trim() || mission().trim(),
    };
    const res = await teamStore.create(c, body);
    setSaving(false);
    if (res.ok) {
      props.onCreated?.(res.member.id);
      props.onClose();
      return;
    }
    if (res.status === 409) {
      setName((n) => (/-\d+$/.test(n) ? n.replace(/-(\d+)$/, (_, d) => `-${Number(d) + 1}`) : `${n}-2`));
      fail('A member with that name already exists — a suffix was suggested. Adjust and Create again.');
      return;
    }
    fail(res.error ?? `Create failed (HTTP ${res.status}). Adjust and try again.`);
  };

  const onModalClose = (id: string | null) => {
    if (id === 'create') { void create(); return; }
    if (saving()) return; // don't let Cancel slip while the POST is in flight
    props.onClose();
  };

  const setRefAt = (i: number, v: string) => setRefs(refs().map((r, j) => (j === i ? v : r)));
  const removeRef = (i: number) => setRefs(refs().filter((_, j) => j !== i));

  return (
    <Modal
      isOpen={true}
      onClose={onModalClose}
      title="New team member"
      subtitle="Everything on one screen — describe, optionally draft with AI, Create."
      zIndex={60}
      persistent
      bodyRef={(el) => { bodyEl = el; }}
      buttons={[
        { id: 'cancel', label: 'Cancel' },
        { id: 'create', label: saving() ? 'Creating…' : 'Create', primary: true },
      ]}
    >
      <Show when={error()}>
        <div class="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
          {error()}
        </div>
      </Show>

      <div class="space-y-4">
        <div class="flex gap-3">
          <div class="flex-1">
            <label class={LABEL_CLASS}>Name</label>
            <input
              type="text"
              autofocus
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="e.g. SEO writer"
              class={INPUT_CLASS}
            />
          </div>
          <div class="w-24">
            <label class={LABEL_CLASS}>Emoji</label>
            <input
              type="text"
              value={emoji()}
              onInput={(e) => setEmoji(e.currentTarget.value)}
              maxLength={4}
              class="w-full bg-[#020617] border border-gray-700/40 rounded px-2.5 py-1.5 text-[16px] text-center text-gray-100 focus:outline-none focus:border-emerald-500/55"
            />
          </div>
        </div>

        <div>
          <label class={LABEL_CLASS}>What does this member do (plain language)</label>
          <textarea
            rows={4}
            value={mission()}
            onInput={(e) => setMission(e.currentTarget.value)}
            placeholder="Its mission, the docs it should know, the credentials it can access, its limits."
            class="w-full bg-[#020617] border border-gray-700/40 rounded px-2.5 py-2 text-[13px] leading-relaxed text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500/55 resize-y"
          />
        </div>

        <ClientModelEffortPicker value={engine()} onChange={setEngine} labels />

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-500">References</label>
            <button
              type="button"
              onClick={() => setRefs([...refs(), ''])}
              class="text-[11px] font-mono text-emerald-300/80 hover:text-emerald-200"
            >+ add</button>
          </div>
          <div class="space-y-1.5">
            <For each={refs()}>
              {(r, i) => (
                <div class="flex gap-1.5">
                  <input
                    type="text"
                    value={r}
                    onInput={(e) => setRefAt(i(), e.currentTarget.value)}
                    placeholder=".meshkore/context/stack.md"
                    class="flex-1 bg-[#020617] border border-gray-700/40 rounded px-2 py-1 text-[12px] font-mono text-gray-100 focus:outline-none focus:border-emerald-500/55"
                  />
                  <button
                    type="button"
                    onClick={() => removeRef(i())}
                    class="px-2 text-gray-500 hover:text-red-300"
                    title="Remove"
                    aria-label="Remove reference"
                  >✕</button>
                </div>
              )}
            </For>
            <Show when={refs().length === 0}>
              <p class="text-[11px] text-gray-600 italic">No references. Add paths/URLs the member should consult.</p>
            </Show>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-500">Init prompt</label>
            <button
              type="button"
              disabled={!mission().trim() || drafting()}
              onClick={() => void runDraft()}
              class="text-[11px] font-mono text-emerald-300/80 hover:text-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Fill from the mission text via the daemon normaliser"
            >{drafting() ? 'Drafting…' : 'Draft with AI'}</button>
          </div>
          <textarea
            rows={10}
            value={prompt()}
            onInput={(e) => setPrompt(e.currentTarget.value)}
            placeholder="The member's initialisation text — saved verbatim to .meshkore/team/<id>.md. If left empty, the mission text above is used."
            class="w-full bg-[#020617] border border-gray-700/40 rounded px-2.5 py-2 text-[12px] font-mono leading-relaxed text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500/55 resize-y"
          />
        </div>

        <Show when={!canCreate() && !saving()}>
          <p class="text-[11px] text-gray-500">A name plus a mission or an init prompt are required.</p>
        </Show>
      </div>
    </Modal>
  );
}
