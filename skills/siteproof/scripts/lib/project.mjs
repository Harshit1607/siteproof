// Project-side helpers: working folder, config, package manager, shell, git, local preview.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const DIR = 'siteproof';
export const wd = (...p) => join(process.cwd(), DIR, ...p);

export function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { if (fallback !== undefined) return fallback; throw e; }
}
export function writeJson(file, data) {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

// Working folder, ignored via .git/info/exclude so the audit never dirties the tree.
export function initWorkdir() {
  mkdirSync(wd('audit'), { recursive: true });
  const gitDir = git(['rev-parse', '--git-dir']);
  if (gitDir.code !== 0) return { ignored: false, note: 'not a git repo' };
  const exclude = join(gitDir.stdout.trim(), 'info', 'exclude');
  mkdirSync(join(exclude, '..'), { recursive: true });
  const cur = existsSync(exclude) ? readFileSync(exclude, 'utf8') : '';
  if (!/^\/?siteproof\/?$/m.test(cur)) appendFileSync(exclude, `${cur && !cur.endsWith('\n') ? '\n' : ''}/${DIR}/\n`);
  return { ignored: true, file: exclude };
}

export function sh(cmd, { quiet = false, cwd, env } = {}) {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', cwd, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout ?? '') + (r.stderr ? (r.stdout ? '\n' : '') + r.stderr : '');
  if (!quiet && r.status !== 0) process.stderr.write(out);
  return { code: r.status ?? 1, out, stdout: r.stdout ?? '' };
}

// git without a shell, so % and quotes survive on Windows. args: array of strings.
export function git(args, { cwd } = {}) {
  const r = spawnSync('git', args, { encoding: 'utf8', cwd, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? ''), stdout: r.stdout ?? '' };
}

export function pkg() {
  return readJson(join(process.cwd(), 'package.json'), {});
}

export function packageManager() {
  if (existsSync('pnpm-lock.yaml')) return 'pnpm';
  if (existsSync('yarn.lock')) return 'yarn';
  if (existsSync('bun.lockb') || existsSync('bun.lock')) return 'bun';
  return 'npm';
}

/**
 * siteproof.config.json in the project root (all optional):
 *   buildCommand, previewCommand, previewUrl, previewBuilds, hideSelectors[], uiThreshold, runs, pages
 */
export function config() {
  const c = readJson(join(process.cwd(), 'siteproof.config.json'), {});
  const scripts = pkg().scripts ?? {};
  const pm = packageManager();
  const run = (s) => `${pm} run ${s}`;
  const previewScript = scripts.preview ? 'preview' : 'start';
  const previewCmd = scripts[previewScript] ?? '';
  const workers = /opennext|wrangler/.test(previewCmd);
  return {
    buildCommand: c.buildCommand ?? (scripts.build ? run('build') : null),
    lintCommand: c.lintCommand ?? (scripts.lint ? run('lint') : null),
    typecheckCommand: c.typecheckCommand ?? (scripts.typecheck ? run('typecheck') : scripts['type-check'] ? run('type-check') : null),
    previewCommand: c.previewCommand ?? run(previewScript),
    previewUrl: c.previewUrl ?? (workers ? 'http://localhost:8787' : 'http://localhost:3000'),
    // Does the preview command build by itself (OpenNext: `opennextjs-cloudflare build && … preview`)?
    previewBuilds: c.previewBuilds ?? /\bbuild\b/.test(previewCmd),
    runtime: workers ? 'local Workers runtime (OpenNext + wrangler)' : 'local Next.js server',
    hideSelectors: c.hideSelectors ?? [],
    uiThreshold: c.uiThreshold ?? 0.005,
    runs: c.runs ?? 3,
    pages: c.pages ?? 15,
  };
}

async function up(url) {
  try { const r = await fetch(url, { redirect: 'manual' }); return r.status > 0; } catch { return false; }
}

function killTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') spawnSync(`taskkill /pid ${child.pid} /T /F`, { shell: true });
  else try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
}

/** Build (if needed) and serve the current checkout. Returns { url, stop }. Throws with the log tail on failure. */
export async function startPreview(cfg = config(), { logFile = wd('logs', 'preview.log'), timeoutMs = 600000 } = {}) {
  if (await up(cfg.previewUrl)) throw new Error(`${cfg.previewUrl} is already in use. Stop whatever is serving it, then retry.`);
  if (!cfg.previewBuilds && cfg.buildCommand) {
    const b = sh(cfg.buildCommand, { quiet: true });
    if (b.code !== 0) throw new Error(`build failed before preview:\n${b.out.slice(-3000)}`);
  }
  mkdirSync(join(logFile, '..'), { recursive: true });
  writeFileSync(logFile, '');
  const port = new URL(cfg.previewUrl).port;
  const child = spawn(cfg.previewCommand, { shell: true, detached: process.platform !== 'win32', env: { ...process.env, PORT: port, BROWSER: 'none' } });
  let exited = false;
  child.stdout.on('data', d => appendFileSync(logFile, d));
  child.stderr.on('data', d => appendFileSync(logFile, d));
  child.on('exit', () => { exited = true; });
  const stop = async () => {
    killTree(child);
    for (let i = 0; i < 40 && await up(cfg.previewUrl); i++) await new Promise(r => setTimeout(r, 250));
  };
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (exited) throw new Error(`preview exited early:\n${readFileSync(logFile, 'utf8').slice(-3000)}`);
    if (await up(cfg.previewUrl)) {
      await fetch(cfg.previewUrl).catch(() => {}); // warm the first request so it doesn't skew run 1
      return { url: cfg.previewUrl, stop };
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  await stop();
  throw new Error(`preview did not answer on ${cfg.previewUrl} within ${timeoutMs / 1000}s`);
}

export async function withPreview(fn, cfg = config()) {
  const p = await startPreview(cfg);
  try { return await fn(p.url); } finally { await p.stop(); }
}

// --- git ---

export const TRAILER = 'Siteproof-Fix';

export function currentBranch() { return git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim(); }
export function isDirty() { return git(['status', '--porcelain']).stdout.trim() !== ''; }
export function hasRemote() { return git(['remote', 'get-url', 'origin']).code === 0; }

// Kept Fix commits on this branch, oldest first: [{sha, key, files}]
export function fixCommits(base) {
  const r = git(['log', '--reverse', `--format=%H%x09%(trailers:key=${TRAILER},valueonly,separator=%x2C)`, `${base}..HEAD`]);
  return r.stdout.split('\n').filter(Boolean).map(l => {
    const [sha, key] = l.split('\t');
    return { sha, key: key?.trim() || null, files: git(['show', '--name-only', '--format=', sha]).stdout.split('\n').filter(Boolean) };
  }).filter(c => c.key);
}

// Remove one commit from the branch. Rebase drops it cleanly; on conflict fall back to a revert commit.
export function dropCommit(sha) {
  const head = git(['rev-parse', 'HEAD']).stdout.trim();
  if (head === sha) return git(['reset', '--hard', 'HEAD~1']).code === 0 ? 'reset' : 'failed';
  if (git(['rebase', '--onto', `${sha}~1`, sha]).code === 0) return 'rebased';
  git(['rebase', '--abort']);
  if (git(['revert', '--no-edit', sha]).code === 0) return 'reverted';
  git(['revert', '--abort']); // leave the branch exactly as it was; the caller reports it
  return 'failed';
}

// Run fn with the tree at `ref` (detached), then return to the branch.
export async function atRef(ref, fn) {
  const branch = currentBranch();
  if (git(['checkout', '-q', '--detach', ref]).code !== 0) throw new Error(`cannot check out ${ref}`);
  try { return await fn(); } finally { git(['checkout', '-q', branch]); }
}

// Audit-time check results, merged from siteproof/audit/checks-<area>.json (one file per auditor).
export function auditChecks() {
  const dir = wd('audit');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter(f => /^checks(-\w+)?\.json$/.test(f));
  if (!files.length) return null;
  return Object.assign({}, ...files.map(f => readJson(join(dir, f), {}).checks ?? {}));
}
