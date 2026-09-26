#!/usr/bin/env node
// Makes siteproof's npm dependencies (Lighthouse, Playwright + Chromium, pixelmatch, …) importable from this
// skill folder. Harness-neutral: the skill runs it as step 0 of every workflow; Claude-format SessionStart
// hooks and the pi/omp extension run it with --hook to warm up before the first request.
//
// Dependencies are installed once per lockfile into <cache>/deps-<lockfile hash>/, where <cache> is
// $SITEPROOF_CACHE or the OS cache folder, and <skill>/node_modules is linked there (a junction on Windows:
// no admin or Developer Mode). So every harness that installed this version shares one copy, updates don't
// reinstall unless the lockfile changed, and two versions side by side never fight over one folder.
// A real <skill>/node_modules (a dev checkout) is left alone.
//
// Exit 0 = ready (one line on stdout). Exit 1 = install failed (the line says how to retry).
// --hook: always exits 0 and prints nothing when already ready.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_STALE_MS = 20 * 60 * 1000;

export function cacheDir(env = process.env, platform = process.platform) {
  if (env.SITEPROOF_CACHE) return env.SITEPROOF_CACHE;
  if (platform === 'win32') return join(env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'siteproof');
  if (platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'siteproof');
  return join(env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'siteproof');
}

const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const isLink = (p) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };
const real = (p) => { try { return realpathSync(p); } catch { return null; } };

function npmInstall(dir) {
  const opts = { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'], timeout: 540_000 };
  execSync('npm ci --omit=dev --no-audit --no-fund', opts);
  execSync(`node "${join(dir, 'node_modules', 'playwright', 'cli.js')}" install chromium`, opts);
}

/**
 * Returns 'dev' (real node_modules left alone), 'ok' (already linked to a ready install),
 * 'linked' (a ready install existed, now linked) or 'installed'. Throws when npm fails.
 */
export function ensureDeps(skill = SKILL_DIR, cache = cacheDir(), install = npmInstall) {
  const link = join(skill, 'node_modules');
  if (existsSync(link) && !isLink(link)) return 'dev';
  const lock = read(join(skill, 'package-lock.json')) ?? read(join(skill, 'package.json'));
  const deps = join(cache, `deps-${createHash('sha256').update(lock).digest('hex').slice(0, 12)}`);
  const ready = join(deps, '.ready');
  const modules = join(deps, 'node_modules');
  if (existsSync(ready) && real(link) === real(modules)) return 'ok';

  let installed = false;
  const mutex = `${deps}.lock`;
  mkdirSync(cache, { recursive: true });
  for (;;) {
    if (existsSync(ready)) break;
    try {
      mkdirSync(mutex);
    } catch {
      // Another session is installing this exact lockfile: wait for it, unless it died mid-way.
      try { if (Date.now() - statSync(mutex).mtimeMs > LOCK_STALE_MS) rmSync(mutex, { recursive: true, force: true }); } catch {}
      sleep(2000);
      continue;
    }
    try {
      if (existsSync(ready)) break;
      rmSync(deps, { recursive: true, force: true });
      mkdirSync(deps, { recursive: true });
      for (const f of ['package.json', 'package-lock.json']) if (existsSync(join(skill, f))) copyFileSync(join(skill, f), join(deps, f));
      install(deps);
      writeFileSync(ready, new Date().toISOString());
      installed = true;
    } finally {
      rmSync(mutex, { recursive: true, force: true });
    }
    break;
  }

  if (isLink(link)) unlinkSync(link); // points at an older install, or dangles after the cache was wiped
  symlinkSync(modules, link, 'junction');
  return installed ? 'installed' : 'linked';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const hook = process.argv.includes('--hook');
  const cache = cacheDir();
  try {
    const r = ensureDeps(SKILL_DIR, cache);
    if (r === 'installed') console.log('siteproof: installed its dependencies (Lighthouse, Playwright + Chromium). Ready.');
    else if (!hook) console.log(`siteproof: ready (${r === 'dev' ? 'dev checkout' : `dependencies in ${cache}`}).`);
  } catch (e) {
    const why = String(e.stderr || e.message).trim().split('\n').slice(-3).join(' | ');
    console.log(`siteproof: installing dependencies failed (${why}). Retry: node "${fileURLToPath(import.meta.url)}". Needs Node 20+ and npm on PATH, and network access to the npm registry and Playwright's browser CDN.`);
    process.exit(hook ? 0 : 1);
  }
}
