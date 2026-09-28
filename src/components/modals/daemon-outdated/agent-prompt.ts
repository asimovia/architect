/**
 * Paste-ready prompt for the "Use a local agent" path of the V47
 * daemon-outdated modal. Lives in the cockpit's modal so we can iterate
 * on copy without re-deploying the daemon.
 *
 * V96 — Rewrite after the operator reported the prompt failing in
 * practice. Lessons applied:
 *  - The canonical URL was stale (webapp/reference/cluster/scripts
 *    out of sync with the live daemon). Fixed separately by syncing
 *    every bump into webapp on deploy. The prompt now assumes the
 *    URL serves the freshest daemon.
 *  - The token filename in the prompt was wrong (`architect-token`
 *    when the daemon writes `portal-token`). Fixed.
 *  - The fallback chain (options 1/2/3) was long and the agent often
 *    gave up. Simplified: one primary path, one fallback, one
 *    nuclear option, with a verification gate at the end so the
 *    agent never claims success without confirming the daemon is up.
 */
// BT-18 — rewritten for the shared-daemon topology (standard v28, W4):
// one daemon per machine, no per-project daemon.py to download.
export const AGENT_PROMPT = (required: string, running: string): string => [
  'The MeshKore daemon on this machine is too old for the cockpit.',
  'Cockpit at https://architect.meshkore.com needs ' + required + '; the',
  'daemon reports ' + running + '. There is ONE shared daemon per machine',
  '(it serves every project) — do NOT download a daemon.py into this',
  'project and do NOT pkill anything by hand. Steps:',
  '',
  '  1. Find the shared daemon folder (usually `meshkore-server/`, next',
  '     to the projects) and run, from it:',
  '       make restart',
  '     The restart boots through the signed self-update and pulls the',
  '     current release.',
  '  2. Verify: `make status` must report ' + required + ' or newer.',
  '  3. If it stays on ' + running + ', show the last 40 lines of `make logs`',
  '     (look for "self-update: REFUSED") and stop — follow workflow W4',
  '     (.meshkore/workflows/W4-daemon-upgrade.md) rather than improvising.',
].join('\n');
