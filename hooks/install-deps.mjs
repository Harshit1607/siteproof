#!/usr/bin/env node
// SessionStart: install siteproof's npm deps into ${CLAUDE_PLUGIN_DATA} (survives plugin updates) the first
// time, and again whenever package.json changes. The scripts use ESM imports, which ignore NODE_PATH, so
// ROOT/node_modules is linked to DATA/node_modules (a junction on Windows: no admin or Developer Mode).
// A dev checkout with its own real node_modules is left alone. Never blocks the session: always exits 0.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const read = p => { try { return readFileSync(p, 'utf8'); } catch { return null; } };

export function ensureDeps(root, data, run = cmd => execSync(cmd, { cwd: data, stdio: 'ignore', timeout: 540_000 })) {
  const link = join(root, 'node_modules');
  const modules = join(data, 'node_modules');
  if (existsSync(link) && !lstatSync(link).isSymbolicLink()) return 'dev'; // real node_modules: a dev checkout
  let installed = false;
  if (read(join(root, 'package.json')) !== read(join(data, 'package.json')) || !existsSync(modules)) {
    mkdirSync(data, { recursive: true });
    for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(root, f), join(data, f));
    try {
      run('npm ci --omit=dev --no-audit --no-fund');
      run(`node "${join(modules, 'playwright', 'cli.js')}" install chromium`);
    } catch (e) {
      rmSync(join(data, 'package.json'), { force: true }); // retry next session
      throw e;
    }
    installed = true;
  }
  if (!existsSync(link)) {
    rmSync(link, { force: true }); // a dangling link left by a wiped DATA dir
    symlinkSync(modules, link, 'junction');
  }
  return installed ? 'installed' : 'ok';
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { CLAUDE_PLUGIN_ROOT: root, CLAUDE_PLUGIN_DATA: data } = process.env;
  if (root && data) {
    try {
      if (ensureDeps(root, data) === 'installed') console.log('siteproof: installed its dependencies (Lighthouse, Playwright + Chromium).');
    } catch (e) {
      console.log(`siteproof: installing dependencies failed (${e.message.split('\n')[0]}). /siteproof commands won't work until it succeeds; it retries next session. Manual: cd "${data}" && npm ci --omit=dev && npx playwright install chromium`);
    }
  }
}
