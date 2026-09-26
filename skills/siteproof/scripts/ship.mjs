#!/usr/bin/env node
// GitHub side of siteproof. Run from the target project's root. Without a GitHub remote (or with
// --dry-run) nothing is sent: issue and PR bodies are written to siteproof/ instead.
//   node ship.mjs keys                 open siteproof issue keys → {key: number} (for the planner)
//   node ship.mjs sync                 audit time: mark fixes.json rows that match open issues; comment + close stale ones
//   node ship.mjs issues [--dry-run]   file one issue per Deferred Fix (deduped by Fix key)
//   node ship.mjs pr [--dry-run]       render the PR body, push the branch, open one PR against main
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { relative, basename } from 'node:path';
import { parseArgs } from 'node:util';
import { wd, readJson, writeJson, git, currentBranch, auditChecks } from './lib/project.mjs';
import { gh, ghBlocker, listSiteproofIssues, ensureLabels } from './lib/gh.mjs';
import { openIssueKeys, staleIssues, issueFor, keyOf, coveredByOthers } from './lib/issues.mjs';
import { renderPrBody, prTitle } from './lib/prbody.mjs';
import { unselected } from './lib/plan.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'dry-run': { type: 'boolean' } } });
const cmd = positionals[0];
const blocker = values['dry-run'] ? '--dry-run' : ghBlocker();
const fixesFile = wd('fixes.json');
const loadFixes = () => { const f = readJson(fixesFile); return Array.isArray(f) ? f : f.fixes; };
const say = (m) => console.error(`[siteproof] ${m}`);

// Upload images to an orphan `siteproof-assets` branch without touching the working tree; return URLs.
// Dry run: return paths relative to the project so the local markdown still renders.
function publishImages(files, dir, relTo = wd()) {
  if (!files.length) return {};
  if (blocker) return Object.fromEntries(files.map(f => [f, relative(relTo, f).replace(/\\/g, '/')]));
  const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim();
  const branch = 'siteproof-assets';
  git(['fetch', 'origin', branch]);
  const parent = git(['rev-parse', '--verify', '--quiet', `origin/${branch}`]).stdout.trim();
  const entries = files.map((f, i) => `100644 blob ${git(['hash-object', '-w', f]).stdout.trim()}\t${String(i).padStart(3, '0')}-${basename(f)}`);
  const subTree = mktree(entries.join('\n') + '\n');
  const existing = parent ? git(['ls-tree', `${parent}^{tree}`]).stdout.trim().split('\n').filter(l => l && !l.endsWith(`\t${dir}`)) : [];
  const root = mktree([...existing, `040000 tree ${subTree}\t${dir}`].join('\n') + '\n');
  const commit = git(['commit-tree', root, ...(parent ? ['-p', parent] : []), '-m', `siteproof assets ${dir}`]).stdout.trim();
  const push = git(['push', 'origin', `${commit}:refs/heads/${branch}`]);
  if (push.code !== 0) throw new Error(`could not push screenshots: ${push.out}`);
  return Object.fromEntries(files.map((f, i) => [f, `https://github.com/${repo}/blob/${branch}/${dir}/${String(i).padStart(3, '0')}-${basename(f)}?raw=true`]));
}

function mktree(input) {
  const r = spawnSync('git', ['mktree'], { input, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git mktree failed: ${r.stderr}`);
  return r.stdout.trim();
}

if (cmd === 'keys') {
  if (blocker) { console.log('{}'); say(`GitHub skipped: ${blocker}`); process.exit(0); }
  console.log(JSON.stringify(openIssueKeys(listSiteproofIssues('open')), null, 2));
} else if (cmd === 'sync') {
  const raw = readJson(fixesFile);
  const fixes = loadFixes();
  if (blocker) { say(`GitHub skipped (${blocker}): no issue matching or stale-closing this time.`); process.exit(0); }
  const open = listSiteproofIssues('open');
  const keys = openIssueKeys(open);
  for (const f of fixes) { if (keys[f.key]) f.issue = keys[f.key]; else delete f.issue; }
  writeJson(fixesFile, Array.isArray(raw) ? fixes : { ...raw, fixes });
  const stale = staleIssues(open, fixes.map(f => f.key));
  for (const i of stale) {
    gh(['issue', 'comment', String(i.number), '--body', `siteproof re-audited the site on ${new Date().toISOString().slice(0, 10)} and no longer finds this problem (\`${keyOf(i.body)}\`). Closing.`]);
    gh(['issue', 'close', String(i.number), '--reason', 'completed']);
  }
  console.log(JSON.stringify({ matched: Object.fromEntries(fixes.filter(f => f.issue).map(f => [f.key, f.issue])), closedStale: stale.map(i => i.number) }, null, 2));
} else if (cmd === 'issues') {
  const run = readJson(wd('run.json'));
  const fixes = loadFixes();
  // Unticked rows become `deferred`; content suggestions `content`; the rest carry their proof outcome.
  for (const f of unselected(readFileSync(wd('plan.md'), 'utf8'), fixes)) run.fixes[f.key] ??= { key: f.key, status: 'deferred', area: f.area };
  // A dropped Fix whose checks all pass in the end was done by another Fix: mark it, don't file it.
  for (const [k, status] of Object.entries(coveredByOthers(fixes, run.fixes, run.final?.checks))) {
    run.fixes[k] = { ...run.fixes[k], status, detail: run.fixes[k].detail ?? 'another Fix in this run already made this change' };
  }
  writeJson(wd('run.json'), run);
  // `covered` is deliberately absent: another Fix already made that change, so there is nothing to track.
  const deferred = fixes.filter(f => f.content || ['deferred', 'failed-proof', 'broke-build', 'changes-ui'].includes(run.fixes[f.key]?.status));
  const existing = blocker ? {} : openIssueKeys(listSiteproofIssues('open'));
  const filed = {};
  mkdirSync(wd('issues'), { recursive: true });
  if (!blocker) ensureLabels(['siteproof', 'seo', 'geo', 'speed', 'deferred', 'failed-proof', 'broke-build', 'changes-ui', 'content']);
  for (const f of deferred) {
    const o = run.fixes[f.key] ?? {};
    const imgFiles = Object.values(o.images ?? {}).flatMap(im => [im.before, im.after, im.diff]).filter(p => p && existsSync(p));
    const urls = publishImages(imgFiles, `${run.date}/${f.key.replace(/[^a-z0-9.-]+/gi, '_')}`, wd('issues'));
    const images = o.images && Object.fromEntries(Object.entries(o.images).map(([k, im]) => [k, { before: urls[im.before], after: urls[im.after], diff: urls[im.diff] }]));
    const issue = issueFor(f, { reason: f.content ? 'content' : o.status, detail: o.detail, numbers: o.numbers, log: o.log, images });
    const file = wd('issues', `${f.key.replace(/[^a-z0-9.-]+/gi, '_')}.md`);
    writeFileSync(file, `# ${issue.title}\n\nlabels: ${issue.labels.join(', ')}\n\n${issue.body}\n`);
    if (blocker) { filed[f.key] = null; continue; }
    const number = existing[f.key];
    if (number) {
      gh(['issue', 'comment', String(number), '--body', `siteproof run ${run.date}: still deferred (${issue.labels.at(-1)}).\n\n${o.detail ?? ''}`]);
      filed[f.key] = number;
    } else {
      const url = gh(['issue', 'create', '--title', issue.title, '--body-file', file, ...issue.labels.flatMap(l => ['--label', l])]).trim();
      filed[f.key] = Number(url.match(/(\d+)\s*$/)?.[1]);
    }
  }
  run.filed = filed;
  writeJson(wd('run.json'), run);
  if (blocker) say(`GitHub skipped (${blocker}): ${deferred.length} issue bodies written to ${wd('issues')}`);
  console.log(JSON.stringify({ filed, dryRun: !!blocker }, null, 2));
} else if (cmd === 'pr') {
  const run = readJson(wd('run.json'));
  const fixes = loadFixes();
  if (currentBranch() !== run.branch) throw new Error(`expected to be on ${run.branch}, on ${currentBranch()}`);
  const prod = readJson(wd('audit', 'prod-scores.json'), null);
  const prodChecks = auditChecks();
  const shotFiles = (run.ui?.results ?? []).flatMap(r => [wd('shots', 'baseline', r.name), wd('shots', 'final', r.name)]).filter(existsSync);
  const urls = publishImages(shotFiles, `${run.date}/ui`);
  const shots = Object.fromEntries((run.ui?.results ?? []).map(r => [r.name, { before: urls[wd('shots', 'baseline', r.name)], after: urls[wd('shots', 'final', r.name)] }]));
  const body = renderPrBody({ run: { ...run, runs: readJson(wd('proof', 'baseline-scores.json'), {}).runs }, fixes, prod, prodChecks, filed: run.filed ?? {}, shots });
  const bodyFile = wd('pr-body.md');
  writeFileSync(bodyFile, body);
  const title = prTitle(run, fixes);
  if (blocker) {
    say(`GitHub skipped (${blocker}). PR title: "${title}". Body: ${bodyFile}`);
    console.log(JSON.stringify({ dryRun: true, title, body: bodyFile }, null, 2));
    process.exit(0);
  }
  const push = git(['push', '-u', 'origin', run.branch]); // never --force
  if (push.code !== 0) throw new Error(`git push failed:\n${push.out}`);
  const url = gh(['pr', 'create', '--base', run.baseBranch, '--head', run.branch, '--title', title, '--body-file', bodyFile]).trim();
  run.pr = url;
  writeJson(wd('run.json'), run);
  console.log(JSON.stringify({ pr: url, title }, null, 2));
} else {
  console.error('usage: ship.mjs keys | sync | issues [--dry-run] | pr [--dry-run]');
  process.exit(64);
}
