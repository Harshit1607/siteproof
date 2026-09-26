// siteproof's safety rules, in one place for every enforcement point:
//   - harness hooks that block a tool call before it runs (hooks/guard.mjs for Claude Code / Codex / Copilot,
//     extensions/siteproof.ts for pi / omp), where the harness has hooks;
//   - the pipeline itself: `proof.mjs build` rejects a Fix commit that breaks them, so they hold in every
//     harness, hooks or not.
// Always: no .env* edits, no deploys, no force pushes. During a fix run: no lint/TypeScript config changes
// and no new error-suppression comments, so a Fix can't pass the build by hiding errors.

export const ENV_FILE = /(^|[\\/])\.env(\.[^\\/]*)?$/i;
export const LINT_TS_CONFIG = /(^|[\\/])(tsconfig[^\\/]*\.json|\.eslintrc(\.[a-z]+)?|eslint\.config\.[cm]?[jt]s|biome\.jsonc?|\.oxlintrc\.json)$/i;
export const SUPPRESS = /@ts-(ignore|nocheck|expect-error)|eslint-disable|ignoreBuildErrors|ignoreDuringBuilds/;

const DEPLOY = /\bwrangler(\.cmd)?\s+(deploy|publish)\b|\bopennextjs-cloudflare\s+deploy\b|\b(npm|pnpm|yarn|bun)\s+(run\s+)?deploy\b/;
const FORCE = /(\s--force(-with-lease|-if-includes)?\b|\s-[a-zA-Z]*f\b|\s\+\S+)/;
const ENV_WRITE = /(>|\btee\b|\bcp\b|\bmv\b|\bsed\s+-i)[^|;&]*\.env(\.[\w.-]+)?(\s|$|["'])/;

export const REASONS = {
  deploy: 'siteproof blocks deploys (wrangler deploy / deploy scripts). Deploying is your call, not an agent\'s.',
  force: 'siteproof blocks force pushes: history is never rewritten on the remote.',
  env: 'siteproof blocks edits to .env files (secrets).',
  config: 'siteproof never changes lint/TypeScript config during a fix run. Fix the code instead; if it can\'t be fixed, the Fix is undone as broke-build.',
  suppress: (token) => `siteproof never hides errors (${token}) during a fix run. Fix the cause, or let the Fix be undone as broke-build.`,
};

export function commandReason(command) {
  const c = String(command ?? '');
  if (DEPLOY.test(c)) return REASONS.deploy;
  if (/\bgit\s+push\b/.test(c) && FORCE.test(c)) return REASONS.force;
  if (ENV_WRITE.test(c)) return 'siteproof blocks writes to .env files (secrets).';
  return null;
}

export function suppressionAdded(added, removed) {
  const m = String(added ?? '').match(SUPPRESS);
  return m && !String(removed ?? '').includes(m[0]) ? m[0] : null;
}

/**
 * One tool call, reduced by a harness adapter to: a shell `command`, or an edit's `paths` plus the text it
 * `added` / `removed` (when the harness exposes it). Returns the reason to block, or null.
 */
export function decide({ command, paths = [], added = '', removed = '' }, fixing) {
  if (command !== undefined) return commandReason(command);
  if (paths.some(p => ENV_FILE.test(p))) return REASONS.env;
  if (!fixing) return null;
  if (paths.some(p => LINT_TS_CONFIG.test(p))) return REASONS.config;
  const token = suppressionAdded(added, removed);
  return token ? REASONS.suppress(token) : null;
}

/**
 * Files touched by a patch, with the lines each one adds and removes. Reads both `git diff` / `git show`
 * output and Codex-style apply_patch text (`*** Update File: path`).
 */
export function parsePatch(text) {
  const files = new Map();
  const file = (p) => {
    const path = p.trim().replace(/^"|"$/g, '');
    if (!files.has(path)) files.set(path, { path, added: [], removed: [] });
    return files.get(path);
  };
  let cur = null;
  let inHunk = false;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/))) { cur = file(m[1]); inHunk = true; continue; }
    if ((m = line.match(/^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/))) { file(m[1]); cur = file(m[2]); inHunk = false; continue; }
    if (!inHunk && (m = line.match(/^(?:---|\+\+\+) (.+)$/))) {
      if (m[1] !== '/dev/null') cur = file(m[1].replace(/^"?[ab]\//, ''));
      continue;
    }
    if (line.startsWith('@@')) { inHunk = true; continue; }
    if (!cur || !inHunk) continue;
    if (line.startsWith('+')) cur.added.push(line.slice(1));
    else if (line.startsWith('-')) cur.removed.push(line.slice(1));
  }
  return [...files.values()].map(f => ({ path: f.path, added: f.added.join('\n'), removed: f.removed.join('\n') }));
}

/** Rule breaks in one Fix commit's diff (`git show --format= --unified=0 <sha>`). Empty when clean. */
export function diffViolations(diffText) {
  const out = [];
  for (const f of parsePatch(diffText)) {
    if (ENV_FILE.test(f.path)) out.push(`${f.path}: ${REASONS.env}`);
    else if (LINT_TS_CONFIG.test(f.path)) out.push(`${f.path}: ${REASONS.config}`);
    const token = suppressionAdded(f.added, f.removed);
    if (token) out.push(`${f.path}: ${REASONS.suppress(token)}`);
  }
  return out;
}
