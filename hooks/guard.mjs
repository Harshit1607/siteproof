#!/usr/bin/env node
// PreToolUse guard. Always: no edits to .env*, no `wrangler deploy`, no force push.
// While /siteproof:fix runs (siteproof/.fixing exists, < 24h old): no loosening lint/TypeScript config
// and no error-suppression comments, so a Fix can't pass the build by hiding errors.
// Blocks by exiting 2 with the reason on stderr; exit 0 = no opinion.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ENV_FILE = /(^|[\\/])\.env(\.[^\\/]*)?$/i;
const LINT_TS_CONFIG = /(^|[\\/])(tsconfig[^\\/]*\.json|\.eslintrc(\.[a-z]+)?|eslint\.config\.[cm]?[jt]s|biome\.jsonc?|\.oxlintrc\.json)$/i;
const SUPPRESS = /@ts-(ignore|nocheck|expect-error)|eslint-disable|ignoreBuildErrors|ignoreDuringBuilds/;

export function decide({ tool_name: tool, tool_input: input = {}, cwd = process.cwd() }, fixing) {
  const paths = [input.file_path, input.notebook_path, ...(input.edits ?? []).map(e => e.file_path)].filter(Boolean);
  if (tool === 'Bash') {
    const c = String(input.command ?? '');
    if (/\bwrangler(\.cmd)?\s+(deploy|publish)\b|\bopennextjs-cloudflare\s+deploy\b|\b(npm|pnpm|yarn|bun)\s+(run\s+)?deploy\b/.test(c)) return 'siteproof blocks deploys (wrangler deploy / deploy scripts). Deploying is your call, not an agent\'s.';
    if (/\bgit\s+push\b/.test(c) && /(\s--force(-with-lease|-if-includes)?\b|\s-[a-zA-Z]*f\b|\s\+\S+)/.test(c)) return 'siteproof blocks force pushes: history is never rewritten on the remote.';
    if (/(>|\btee\b|\bcp\b|\bmv\b|\bsed\s+-i)[^|;&]*\.env(\.[\w.-]+)?(\s|$|["'])/.test(c)) return 'siteproof blocks writes to .env files (secrets).';
    return null;
  }
  if (!/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return null;
  if (paths.some(p => ENV_FILE.test(p))) return 'siteproof blocks edits to .env files (secrets).';
  if (fixing) {
    if (paths.some(p => LINT_TS_CONFIG.test(p))) return 'siteproof never changes lint/TypeScript config during a fix run. Fix the code instead; if it can\'t be fixed, the Fix is undone as broke-build.';
    const text = [input.content, input.new_string, ...(input.edits ?? []).map(e => e.new_string)].filter(Boolean).join('\n');
    const old = [input.old_string, ...(input.edits ?? []).map(e => e.old_string)].filter(Boolean).join('\n');
    const m = text.match(SUPPRESS);
    if (m && !old.includes(m[0])) return `siteproof never hides errors (${m[0]}) during a fix run. Fix the cause, or let the Fix be undone as broke-build.`;
  }
  return null;
}

function isFixing(cwd) {
  try { return Date.now() - statSync(join(cwd, 'siteproof', '.fixing')).mtimeMs < 24 * 3600 * 1000; } catch { return false; }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
  const reason = decide(payload, isFixing(payload.cwd ?? process.cwd()));
  if (reason) { process.stderr.write(reason + '\n'); process.exit(2); }
}
