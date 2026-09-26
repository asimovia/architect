/**
 * ContextSection — which slice of the project this member knows (GA-4).
 *
 * Replaces RefsSection, which asked the operator to type file paths
 * (`.meshkore/context/stack.md`) into a list of free-text rows. That was
 * the wrong unit twice over: a path is a fact about the filesystem, not
 * about what an agent should know, and nothing checked that the file
 * existed — a typo produced a member that silently knew less than its
 * card claimed.
 *
 * The project already maintains the right vocabulary: the knowledge tree
 * (`context/_index.yaml`), whose top-level branches ARE the categories an
 * operator thinks in — the idea, the architecture, deploy, credentials,
 * the modules. So this is a checklist of real branches, and picking one
 * pins that whole subtree into the member's briefing.
 *
 * Nothing selected is a valid, common answer: the member gets the
 * project's default pinned set, which is what every agent got before this
 * field existed.
 */

import { For, Show, createMemo, createResource } from 'solid-js';
import { daemonStore } from '~/state/daemon';
import { SectionSaveButton } from '~/components/ui/SectionSaveButton';
import type { KnowledgeNode } from '~/lib/daemon-client';

interface Branch {
  id: string;
  title: string;
  desc: string;
  /** How many descendants come with it — the cost of ticking the box. */
  size: number;
}

function countNodes(n: KnowledgeNode): number {
  return 1 + (n.children ?? []).reduce((a, c) => a + countNodes(c), 0);
}

export function ContextSection(props: {
  context: string[];
  onContext: (next: string[]) => void;
  saving: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  // Reactive source, not a bare read: the client is null during boot and
  // an always-mounted panel would otherwise cache the empty result.
  const client = () => daemonStore.state.client;
  const [tree] = createResource(client, async (c) => {
    const res = await c.knowledgeTree();
    return res.ok ? (res.data?.tree ?? []) : [];
  });

  const branches = createMemo<Branch[]>(() =>
    (tree() ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      desc: n.desc,
      size: countNodes(n),
    })),
  );

  const has = (id: string) => props.context.includes(id);
  const toggle = (id: string) =>
    props.onContext(
      has(id) ? props.context.filter((x) => x !== id) : [...props.context, id],
    );

  // A branch the member names that the tree no longer has: shown so the
  // operator can see and clear it, rather than it vanishing from the form
  // while staying in the file.
  const orphans = createMemo(() => {
    const known = new Set(branches().map((b) => b.id));
    return props.context.filter((id) => !known.has(id));
  });

  return (
    <section class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-500">
          Context
        </h3>
        <SectionSaveButton
          saving={props.saving}
          onClick={() => props.onSave({ context: props.context })}
        />
      </div>
      <p class="text-[11px] text-gray-500 leading-snug">
        Which branches of the project's knowledge this agent gets in full, on every
        turn. Everything else stays visible to it as a one-line map it can fetch from.
        Pick nothing and it gets the project default.
      </p>

      <Show
        when={!tree.loading}
        fallback={<p class="text-[11px] text-gray-600 italic">Loading the knowledge tree…</p>}
      >
        <Show
          when={branches().length > 0}
          fallback={
            <p class="text-[11px] text-gray-600 italic">
              This project has no knowledge tree yet (<code class="font-mono">context/_index.yaml</code>),
              so there is nothing to slice.
            </p>
          }
        >
          <div class="space-y-1">
            <For each={branches()}>
              {(b) => (
                <label
                  class="flex items-start gap-2 px-2 py-1.5 rounded border cursor-pointer transition-colors"
                  classList={{
                    'border-emerald-500/45 bg-emerald-500/10': has(b.id),
                    'border-gray-700/40 hover:border-gray-600/60': !has(b.id),
                  }}
                >
                  <input
                    type="checkbox"
                    checked={has(b.id)}
                    onChange={() => toggle(b.id)}
                    class="mt-0.5 accent-emerald-500"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="flex items-baseline gap-1.5">
                      <span class="font-mono text-[11px] text-gray-100">{b.id}</span>
                      <span class="text-[11px] text-gray-400 truncate">{b.title}</span>
                      <Show when={b.size > 1}>
                        <span class="font-mono text-[9px] text-gray-600 flex-shrink-0">
                          +{b.size - 1}
                        </span>
                      </Show>
                    </span>
                    <Show when={b.desc}>
                      <span class="block text-[10px] text-gray-600 leading-snug truncate">
                        {b.desc}
                      </span>
                    </Show>
                  </span>
                </label>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={orphans().length > 0}>
        <p class="text-[11px] text-amber-300/80 leading-snug">
          Not in this project's tree (any more):{' '}
          <For each={orphans()}>
            {(id) => (
              <button
                type="button"
                onClick={() => toggle(id)}
                class="font-mono underline decoration-dotted hover:text-amber-200 mr-1.5"
                title="Remove"
              >
                {id} ✕
              </button>
            )}
          </For>
        </p>
      </Show>
    </section>
  );
}
