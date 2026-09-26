import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureDeps } from '../../skills/siteproof/scripts/setup.mjs';

function dirs(lock = '{"v":1}') {
  const t = mkdtempSync(join(tmpdir(), 'siteproof-deps-'));
  const skill = join(t, 'skill'), cache = join(t, 'cache');
  mkdirSync(skill);
  writeFileSync(join(skill, 'package.json'), '{}');
  writeFileSync(join(skill, 'package-lock.json'), lock);
  return { t, skill, cache };
}
const fakeNpm = (calls) => (dir) => { calls.push(dir); mkdirSync(join(dir, 'node_modules', 'lighthouse'), { recursive: true }); };

test('installs once per lockfile and links the skill to it', () => {
  const { skill, cache } = dirs();
  const calls = [];
  assert.equal(ensureDeps(skill, cache, fakeNpm(calls)), 'installed');
  assert.ok(lstatSync(join(skill, 'node_modules')).isSymbolicLink());
  assert.ok(existsSync(join(skill, 'node_modules', 'lighthouse')));
  assert.equal(ensureDeps(skill, cache, fakeNpm(calls)), 'ok');
  assert.equal(calls.length, 1);
});

test('a second copy of the same version reuses the install; a new lockfile gets its own', () => {
  const a = dirs();
  const calls = [];
  ensureDeps(a.skill, a.cache, fakeNpm(calls));
  const b = join(a.t, 'other-harness-copy');
  mkdirSync(b);
  writeFileSync(join(b, 'package.json'), '{}');
  writeFileSync(join(b, 'package-lock.json'), '{"v":1}');
  assert.equal(ensureDeps(b, a.cache, fakeNpm(calls)), 'linked');
  assert.equal(calls.length, 1);
  writeFileSync(join(b, 'package-lock.json'), '{"v":2}');
  assert.equal(ensureDeps(b, a.cache, fakeNpm(calls)), 'installed');
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0], calls[1]);
  assert.equal(ensureDeps(a.skill, a.cache, fakeNpm(calls)), 'ok', 'the older version still has its own install');
});

test('relinks after the cache is wiped', () => {
  const { skill, cache } = dirs();
  const calls = [];
  ensureDeps(skill, cache, fakeNpm(calls));
  rmSync(cache, { recursive: true, force: true });
  assert.equal(ensureDeps(skill, cache, fakeNpm(calls)), 'installed');
  assert.ok(existsSync(join(skill, 'node_modules', 'lighthouse')));
});

test('leaves a dev checkout with real node_modules alone', () => {
  const { skill, cache } = dirs();
  mkdirSync(join(skill, 'node_modules'));
  assert.equal(ensureDeps(skill, cache, () => assert.fail('ran npm')), 'dev');
});

test('a failed install is retried on the next run', () => {
  const { skill, cache } = dirs();
  assert.throws(() => ensureDeps(skill, cache, () => { throw new Error('offline'); }), /offline/);
  const calls = [];
  assert.equal(ensureDeps(skill, cache, fakeNpm(calls)), 'installed');
});
