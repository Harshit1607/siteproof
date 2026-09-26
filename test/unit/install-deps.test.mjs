import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureDeps } from '../../hooks/install-deps.mjs';

function dirs() {
  const t = mkdtempSync(join(tmpdir(), 'siteproof-deps-'));
  const root = join(t, 'root'), data = join(t, 'data');
  mkdirSync(root);
  writeFileSync(join(root, 'package.json'), '{"v":1}');
  writeFileSync(join(root, 'package-lock.json'), '{}');
  return { root, data };
}
const fakeNpm = (data, calls) => cmd => { calls.push(cmd); mkdirSync(join(data, 'node_modules', 'x'), { recursive: true }); };

test('installs into DATA once, links ROOT/node_modules, skips when package.json unchanged', () => {
  const { root, data } = dirs();
  const calls = [];
  assert.equal(ensureDeps(root, data, fakeNpm(data, calls)), 'installed');
  assert.equal(calls.length, 2);
  assert.ok(lstatSync(join(root, 'node_modules')).isSymbolicLink());
  assert.ok(existsSync(join(root, 'node_modules', 'x')));
  assert.equal(ensureDeps(root, data, fakeNpm(data, calls)), 'ok');
  assert.equal(calls.length, 2);
  writeFileSync(join(root, 'package.json'), '{"v":2}');
  assert.equal(ensureDeps(root, data, fakeNpm(data, calls)), 'installed');
});

test('leaves a dev checkout with real node_modules alone', () => {
  const { root, data } = dirs();
  mkdirSync(join(root, 'node_modules'));
  assert.equal(ensureDeps(root, data, () => assert.fail('ran npm')), 'dev');
});

test('failed install is retried next session', () => {
  const { root, data } = dirs();
  assert.throws(() => ensureDeps(root, data, () => { throw new Error('offline'); }), /offline/);
  const calls = [];
  assert.equal(ensureDeps(root, data, fakeNpm(data, calls)), 'installed');
});
