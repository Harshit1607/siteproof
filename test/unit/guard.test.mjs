import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide } from '../../hooks/guard.mjs';
import { diffViolations } from '../../skills/siteproof/scripts/lib/rules.mjs';

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const edit = (file_path, new_string = 'x', old_string = 'y') => ({ tool_name: 'Edit', tool_input: { file_path, new_string, old_string } });
const patch = (body) => ({ tool_name: 'apply_patch', tool_input: { command: `*** Begin Patch\n${body}\n*** End Patch` } });

test('blocks .env edits and writes', () => {
  for (const p of ['.env', 'C:\\repo\\.env.local', '/a/b/.env.production']) assert.ok(decide(edit(p), false), p);
  assert.ok(decide(bash('echo SECRET=1 > .env'), false));
  assert.ok(decide(bash('cp foo .env.local'), false));
  assert.equal(decide(edit('src/env.ts'), false), null);
  assert.equal(decide(edit('.envrc.md'), false), null);
});

test('blocks deploys and force pushes, allows normal push', () => {
  assert.ok(decide(bash('npx wrangler deploy'), false));
  assert.ok(decide(bash('pnpm run deploy'), false));
  assert.ok(decide(bash('git push --force origin main'), false));
  assert.ok(decide(bash('git push -f'), false));
  assert.ok(decide(bash('git push origin +main'), false));
  assert.ok(decide(bash('git push --force-with-lease'), false));
  assert.equal(decide(bash('git push -u origin siteproof/2026-09-22'), false), null);
  assert.equal(decide(bash('wrangler dev'), false), null);
});

test('during a fix run: no lint/TS config edits, no error suppression', () => {
  assert.ok(decide(edit('tsconfig.json'), true));
  assert.ok(decide(edit('eslint.config.mjs'), true));
  assert.ok(decide(edit('app/page.tsx', '// @ts-ignore\nfoo()'), true));
  assert.ok(decide(edit('next.config.ts', 'typescript: { ignoreBuildErrors: true }'), true));
  assert.equal(decide(edit('app/page.tsx', '// eslint-disable-next-line\nx', '// eslint-disable-next-line\ny'), true), null, 'pre-existing suppression kept');
  assert.equal(decide(edit('tsconfig.json'), false), null, 'outside a fix run the user may edit config');
});

test('Codex apply_patch edits get the same rules', () => {
  assert.ok(decide(patch('*** Update File: .env.local\n@@\n-A=1\n+A=2'), false));
  assert.ok(decide(patch('*** Add File: app/x.tsx\n+// @ts-nocheck\n+export {}'), true));
  assert.ok(decide(patch('*** Update File: tsconfig.json\n@@\n-  "strict": true\n+  "strict": false'), true));
  assert.equal(decide(patch('*** Update File: app/page.tsx\n@@\n-<img src="/a.png">\n+<Image src={a} alt="" />'), true), null);
});

test('hook exits 2 with a reason when blocking', () => {
  const guard = fileURLToPath(new URL('../../hooks/guard.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [guard], { input: JSON.stringify(bash('wrangler deploy')), encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /deploy/);
  assert.equal(spawnSync(process.execPath, [guard], { input: JSON.stringify(bash('ls')), encoding: 'utf8' }).status, 0);
});

test('commit gate: a Fix commit may not touch .env or lint/TS config, or add suppressions', () => {
  const diff = (path, lines) => `diff --git a/${path} b/${path}\nindex 1..2 100644\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n${lines}`;
  assert.deepEqual(diffViolations(diff('app/page.tsx', '-<img src="/a.png">\n+<Image src={a} alt="" />')), []);
  assert.equal(diffViolations(diff('tsconfig.json', '-  "strict": true\n+  "strict": false')).length, 1);
  assert.match(diffViolations(diff('app/page.tsx', '+// @ts-ignore\n+foo()'))[0], /app\/page\.tsx.*@ts-ignore/);
  assert.deepEqual(diffViolations(diff('app/page.tsx', '-// eslint-disable-next-line\n-x\n+// eslint-disable-next-line\n+y')), [], 'moving an existing suppression is not adding one');
  assert.equal(diffViolations(`diff --git a/.env b/.env\nnew file mode 100644\n--- /dev/null\n+++ b/.env\n@@ -0,0 +1 @@\n+KEY=1`).length, 1);
  assert.deepEqual(diffViolations(diff('app/a.tsx', '--- not a header, a removed line starting with --')), [], 'hunk lines are never read as file headers');
});
