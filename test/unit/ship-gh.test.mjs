// ship.mjs against a fake `gh`: Plan rows matched to open issues, stale issues closed,
// Deferred Fixes filed once (re-runs comment instead of duplicating).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyComment } from '../../scripts/lib/issues.mjs';

const S = fileURLToPath(new URL('../../scripts/', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'siteproof-gh-'));
const state = join(dir, 'gh-state.json');
const fakeGh = join(dir, 'fake-gh.mjs');

writeFileSync(fakeGh, `
import { readFileSync, writeFileSync } from 'node:fs';
const f = ${JSON.stringify(state)};
const s = JSON.parse(readFileSync(f, 'utf8'));
const a = process.argv.slice(2);
const opt = (k) => a[a.indexOf(k) + 1];
s.calls.push(a.slice(0, 2).join(' '));
if (a[0] === 'issue' && a[1] === 'list') {
  const want = opt('--state').toUpperCase();
  process.stdout.write(JSON.stringify(s.issues.filter(i => want === 'ALL' || i.state === want)));
} else if (a[0] === 'issue' && a[1] === 'create') {
  const n = 100 + s.issues.length;
  s.issues.push({ number: n, state: 'OPEN', title: opt('--title'), body: readFileSync(opt('--body-file'), 'utf8'), labels: a.filter((x, i) => a[i - 1] === '--label') });
  process.stdout.write('https://github.com/o/r/issues/' + n + '\\n');
} else if (a[0] === 'issue' && a[1] === 'comment') {
  s.comments.push({ number: Number(a[2]), body: opt('--body') });
} else if (a[0] === 'issue' && a[1] === 'close') {
  s.issues.find(i => i.number === Number(a[2])).state = 'CLOSED';
}
writeFileSync(f, JSON.stringify(s));
`);

const project = join(dir, 'site');
mkdirSync(join(project, 'siteproof', 'audit'), { recursive: true });
spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
const env = { ...process.env, SITEPROOF_FORCE_GH: '1', SITEPROOF_GH_BIN: fakeGh };
const ship = (...args) => {
  const r = spawnSync(process.execPath, [join(S, 'ship.mjs'), ...args], { cwd: project, env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};
const fix = (key, area, extra = {}) => ({ key, area, title: `Fix ${key}`, why: 'w', impact: 3, effort: 'S', confidence: 1, risk: 'low', findingIds: ['f'], checkIds: area === 'Speed' ? [] : ['c'], ...(area === 'Speed' ? { targetMetric: 'LCP' } : {}), ...extra });

test('sync marks matching rows and closes stale issues; issues are filed once', () => {
  writeFileSync(state, JSON.stringify({ calls: [], comments: [], issues: [
    { number: 7, state: 'OPEN', title: 'old titles', body: `${keyComment('seo:title')}\nold` },
    { number: 8, state: 'OPEN', title: 'gone', body: `${keyComment('geo:llms-txt')}\nfixed since` },
    { number: 9, state: 'OPEN', title: 'not ours', body: 'no key' },
  ] }));
  const fixes = [fix('seo:title', 'SEO'), fix('speed:hero-image', 'Speed'), fix('geo:answer-first', 'GEO', { content: true, checkIds: [] })];
  writeFileSync(join(project, 'siteproof', 'fixes.json'), JSON.stringify(fixes));

  const sync = ship('sync');
  assert.deepEqual(sync, { matched: { 'seo:title': 7 }, closedStale: [8] });
  const marked = JSON.parse(readFileSync(join(project, 'siteproof', 'fixes.json'), 'utf8'));
  assert.equal(marked.find(f => f.key === 'seo:title').issue, 7);
  let s = JSON.parse(readFileSync(state, 'utf8'));
  assert.equal(s.issues.find(i => i.number === 8).state, 'CLOSED');
  assert.equal(s.issues.find(i => i.number === 9).state, 'OPEN', 'foreign issues untouched');
  assert.match(s.comments[0].body, /no longer finds this problem/);

  // A fix run: seo:title unticked (deferred), speed:hero-image failed its Proof, content suggestion.
  writeFileSync(join(project, 'siteproof', 'plan.md'), '- [ ] 1. **SEO** Fix seo:title — _w_ · `seo:title`\n- [x] 2. **Speed** Fix speed:hero-image — _w_ · `speed:hero-image`\n');
  writeFileSync(join(project, 'siteproof', 'run.json'), JSON.stringify({ date: '2026-09-22', fixes: { 'speed:hero-image': { key: 'speed:hero-image', status: 'failed-proof', detail: 'LCP needed −400ms', numbers: { before: { mobile: { lcp: 4000 } }, after: { mobile: { lcp: 3900 } } } } } }));
  const first = ship('issues');
  assert.equal(first.filed['seo:title'], 7, 'existing open issue reused, not duplicated');
  assert.ok(first.filed['speed:hero-image'] >= 100 && first.filed['geo:answer-first'] >= 100);
  s = JSON.parse(readFileSync(state, 'utf8'));
  const created = s.issues.filter(i => i.number >= 100);
  assert.equal(created.length, 2);
  const hero = created.find(i => i.body.includes(keyComment('speed:hero-image')));
  assert.deepEqual(hero.labels, ['siteproof', 'speed', 'failed-proof']);
  assert.match(hero.body, /4000ms \| 3900ms/);
  assert.deepEqual(created.find(i => i.body.includes(keyComment('geo:answer-first'))).labels, ['siteproof', 'geo', 'content']);

  const second = ship('issues'); // re-run: same keys → comments only
  assert.deepEqual(second.filed, first.filed);
  assert.equal(JSON.parse(readFileSync(state, 'utf8')).issues.length, s.issues.length, 'no duplicates on re-run');
});
