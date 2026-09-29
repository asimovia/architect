/**
 * AgentRack — DLG2. The status tile of a delegation card: a three-unit
 * server rack. While the member works its LEDs flicker out of step and a
 * faint packet of light runs down the units; once it reports, the LEDs
 * hold steady in the outcome's colour. Styles in `styles/agent-rack.css`.
 */

import { For } from 'solid-js';

export type RackState = 'working' | 'success' | 'partial' | 'failed' | 'unknown';

const LED: Record<RackState, string> = {
  working: 'rgb(52, 211, 153)',
  success: 'rgb(52, 211, 153)',
  partial: 'rgb(245, 158, 11)',
  failed: 'rgb(239, 68, 68)',
  unknown: 'rgb(156, 163, 175)',
};

const UNITS = [4, 10, 16];

export function AgentRack(props: { state: RackState; title?: string }) {
  return (
    <span
      class="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-700/70 bg-gray-950/70"
      title={props.title}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        width="26"
        height="26"
        class={`agent-rack ${props.state === 'working' ? 'agent-rack--working' : ''}`}
        style={{ '--rack-led': LED[props.state] }}
      >
        <For each={UNITS}>
          {(y) => (
            <g>
              <rect class="rack-unit" x="4" y={y} width="16" height="4.5" rx="1" />
              <line class="rack-slot" x1="6.5" y1={y + 2.25} x2="11" y2={y + 2.25} />
              <circle class="rack-led" cx="15" cy={y + 2.25} r="0.9" />
              <circle class="rack-led" cx="17.4" cy={y + 2.25} r="0.9" />
            </g>
          )}
        </For>
        <rect class="rack-scan" x="4.5" y="4.5" width="15" height="1.2" rx="0.6" />
      </svg>
    </span>
  );
}

export default AgentRack;
