// `proof.mjs build` enforces siteproof's rules on the Fix commit itself, so they hold in agents without hooks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const proof = fileURLToPath(new URL('../../skills/siteproof/scripts/proof.mjs', import.meta.url));

test('a Fix commit that loosens TypeScript config fails the build step until the fixer undoes it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'siteproof-rules-'));
  const git = (...a) => { const r = spawnSync('git', a, { cwd: dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const put = (f, s) => writeFileSync(join(dir, f), s);
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  put('package.json', JSON.stringify({ scripts: { build: 'node -e "process.exit(0)"' } }));
  put('tsconfig.json', '{ "compilerOptions": { "strict": true } }\n');
  put('page.tsx', 'export const a = 1;\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  mkdirSync(join(dir, 'siteproof'));
  put('siteproof/run.json', JSON.stringify({ base, fixes: {} }));
  put('siteproof/fixes.json', JSON.stringify([{ key: 'seo:title', area: 'SEO', checkIds: ['seo.title'] }]));
  put('.gitignore', 'siteproof/\n');

  put('tsconfig.json', '{ "compilerOptions": { "strict": false } }\n');
  put('page.tsx', 'export const a = 2;\n');
  git('add', '-A');
  git('commit', '-qm', 'siteproof(seo): title', '-m', 'Siteproof-Fix: seo:title');
  const bad = spawnSync(process.execPath, [proof, 'build', 'seo:title'], { cwd: dir, encoding: 'utf8' });
  assert.equal(bad.status, 1, bad.stderr);
  const out = JSON.parse(bad.stdout);
  assert.equal(out.step, 'rules');
  assert.match(out.tail, /tsconfig\.json/);

  put('tsconfig.json', '{ "compilerOptions": { "strict": true } }\n');
  git('add', '-A');
  git('commit', '-q', '--amend', '--no-edit');
  const good = spawnSync(process.execPath, [proof, 'build', 'seo:title'], { cwd: dir, encoding: 'utf8' });
  assert.equal(good.status, 0, good.stdout + good.stderr);
  assert.deepEqual(JSON.parse(good.stdout).steps, ['rules', 'build']);
});
