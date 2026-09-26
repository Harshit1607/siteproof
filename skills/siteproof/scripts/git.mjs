#!/usr/bin/env node
// Git safety for the siteproof fix workflow. Run from the target project's root.
//   node git.mjs preflight    refuse on a dirty tree, update main, warn about old siteproof work, create siteproof/<date>
//   node git.mjs done         clear the "fix in progress" marker the hooks look at
import { writeFileSync, existsSync, rmSync } from 'node:fs';
import { git, isDirty, hasRemote, wd, writeJson, readJson } from './lib/project.mjs';
import { ghBlocker, ghJson } from './lib/gh.mjs';

const cmd = process.argv[2];
const fail = (msg) => { console.error(msg); process.exit(2); };

function baseBranch() {
  const head = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (head.code === 0) return head.stdout.trim().replace(/^origin\//, '');
  for (const b of ['main', 'master']) if (git(['rev-parse', '--verify', '--quiet', b]).code === 0) return b;
  fail('Could not find a main branch (tried origin/HEAD, main, master).');
}

if (cmd === 'preflight') {
  if (git(['rev-parse', '--is-inside-work-tree']).code !== 0) fail('Not a git repository. siteproof needs git to commit each Fix.');
  if (isDirty()) {
    fail(`You have uncommitted changes:\n${git(['status', '--short']).stdout}\nCommit or stash them yourself, then run the siteproof fix again. siteproof never stashes or discards your work.`);
  }
  if (!existsSync(wd('plan.md'))) fail('No Plan found at siteproof/plan.md. Run the siteproof audit (with the prod URL) first.');
  if (git(['rev-parse', '--verify', '--quiet', 'HEAD']).code !== 0) fail('The repository has no commits yet.');

  const base = baseBranch();
  const warnings = [];
  if (git(['checkout', '-q', base]).code !== 0) fail(`Could not check out ${base}.`);
  if (hasRemote()) {
    const pull = git(['pull', '--ff-only', 'origin', base]);
    if (pull.code !== 0) fail(`git pull --ff-only origin ${base} failed:\n${pull.out}`);
  } else warnings.push(`No remote "origin": using local ${base} as is.`);

  const old = git(['branch', '--list', 'siteproof/*', '--no-merged', base]).stdout.split('\n').map(s => s.replace(/^[*+ ]+/, '').trim()).filter(Boolean);
  if (old.length) warnings.push(`Unmerged siteproof branches exist: ${old.join(', ')}. Left untouched; merge or delete them yourself.`);
  if (!ghBlocker()) {
    try {
      const prs = ghJson(['pr', 'list', '--state', 'open', '--search', 'head:siteproof/', '--json', 'number,headRefName,url']);
      for (const p of prs ?? []) warnings.push(`Open siteproof PR #${p.number} (${p.headRefName}): ${p.url}. Left untouched.`);
    } catch (e) { warnings.push(`Could not list PRs: ${e.message}`); }
  }

  const date = new Date().toISOString().slice(0, 10);
  let branch = `siteproof/${date}`;
  for (let i = 2; git(['rev-parse', '--verify', '--quiet', branch]).code === 0; i++) branch = `siteproof/${date}-${i}`;
  if (git(['checkout', '-q', '-b', branch]).code !== 0) fail(`Could not create branch ${branch}.`);

  const run = {
    date, branch, baseBranch: base, base: git(['rev-parse', 'HEAD']).stdout.trim(),
    auditUrl: readJson(wd('audit', 'meta.json'), {}).url ?? null,
    startedAt: new Date().toISOString(), fixes: {},
  };
  writeJson(wd('run.json'), run);
  writeFileSync(wd('.fixing'), new Date().toISOString());
  console.log(JSON.stringify({ branch, base, baseSha: run.base, warnings }, null, 2));
} else if (cmd === 'done') {
  rmSync(wd('.fixing'), { force: true });
  console.log('fix marker cleared');
} else {
  console.error('usage: git.mjs preflight | done');
  process.exit(64);
}
