// Thin `gh` wrapper. Everything GitHub-side is skipped (dry run) unless origin is a GitHub remote
// and gh is logged in. SITEPROOF_GH_BIN / SITEPROOF_FORCE_GH exist for tests with a fake gh.
import { spawnSync } from 'node:child_process';
import { git } from './project.mjs';

const BIN = process.env.SITEPROOF_GH_BIN ?? 'gh';

export function gh(args, { input } = {}) {
  const isJs = /\.m?js$/.test(BIN);
  const r = spawnSync(isJs ? process.execPath : BIN, isJs ? [BIN, ...args] : args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`gh ${args.join(' ')} failed: ${(r.stderr || r.stdout || r.error?.message || '').trim()}`);
  return r.stdout;
}

export function ghJson(args) {
  return JSON.parse(gh(args) || 'null');
}

// Why GitHub is unavailable, or null when it's ready.
export function ghBlocker() {
  if (process.env.SITEPROOF_FORCE_GH) return null;
  const remote = git(['remote', 'get-url', 'origin']);
  if (remote.code !== 0) return 'no git remote "origin"';
  if (!/github\.com/.test(remote.stdout)) return `origin is not on GitHub (${remote.stdout.trim()})`;
  try { gh(['auth', 'status']); } catch { return 'gh is not installed or not logged in'; }
  return null;
}

export function listSiteproofIssues(state = 'open') {
  return ghJson(['issue', 'list', '--label', 'siteproof', '--state', state, '--limit', '500', '--json', 'number,title,body,state,labels']);
}

export function ensureLabels(labels) {
  for (const l of labels) {
    try { gh(['label', 'create', l, '--force', '--color', l === 'siteproof' ? '5319e7' : 'ededed']); } catch { /* label exists or no rights: issue create will say */ }
  }
}
