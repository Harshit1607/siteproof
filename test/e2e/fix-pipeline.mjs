#!/usr/bin/env node
// End-to-end run of the /siteproof:fix pipeline on a git copy of the fixture site, driving the same
// scripts the command uses. The fixer agent is simulated by scripted commits so every path is
// exercised deterministically: kept Speed Fix, no-op Speed Fix undone, broken build undone after one
// repair, unproven SEO Fix undone, regressing Fix found by bisect, UI-changing Fix found by bisect,
// unticked + content Fixes filed as (dry-run) issues, PR body written.
//   node test/e2e/fix-pipeline.mjs      (~30 min; needs `npm run fixture` once; work dir is kept for inspection)
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../../', import.meta.url));
const S = join(root, 'skills', 'siteproof', 'scripts');
const fixture = join(root, 'test', 'fixture-site');
const work = join(mkdtempSync(join(tmpdir(), 'siteproof-e2e-')), 'site');
const log = (...a) => console.log(`\n=== ${a.join(' ')}`);

function sh(cmd, args, { ok = [0], input } = {}) {
  const r = spawnSync(cmd, args, { cwd: work, encoding: 'utf8', shell: cmd !== 'git' && cmd !== process.execPath, input, maxBuffer: 256 * 1024 * 1024 });
  if (!ok.includes(r.status)) throw new Error(`${cmd} ${args.join(' ')} → ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r;
}
const node = (script, ...args) => {
  const r = spawnSync(process.execPath, [join(S, script), ...args], { cwd: work, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
  return { code: r.status, out: r.stdout };
};
const nodeOk = (...a) => { const r = node(...a); if (r.code !== 0) throw new Error(`${a.join(' ')} exited ${r.code}\n${r.out}`); return r.out; };
const git = (...args) => sh('git', args).stdout.trim();
const read = (f) => readFileSync(join(work, f), 'utf8');
const write = (f, s) => { mkdirSync(dirname(join(work, f)), { recursive: true }); writeFileSync(join(work, f), s); };
const edit = (f, from, to) => { const s = read(f); assert.ok(s.includes(from), `${f} lacks ${from}`); write(f, s.replace(from, to)); };
const commit = (key, title) => { git('add', '-A'); git('commit', '-q', '-m', title, '-m', `Siteproof-Fix: ${key}`); };

// --- a git copy of the fixture, with a good llms.txt on main so a regression has something to break ---
log('Copy fixture to', work);
cpSync(fixture, work, { recursive: true, filter: (p) => !/[\\/](node_modules|\.next|\.open-next|\.wrangler|siteproof)([\\/]|$)/.test(p.slice(fixture.length)) });
sh('pnpm', ['install', '--prefer-offline']);
write('siteproof.config.json', JSON.stringify({ hideSelectors: ['#clock'], runs: 3 }, null, 2));
write('public/llms.txt', ['# Fixture Co', '', '> Fixture Co designs, builds and runs fast marketing websites on Next.js and Cloudflare.', '',
  'Fixture Co is a small studio of designers and engineers building websites since 2015.', '',
  '## Key pages', '', '- [About](https://fixture.example/about): who we are', '- [Why speed matters](https://fixture.example/blog/first-post): article',
  '- [Writing for AI search](https://fixture.example/blog/second-post): article', '', '## Contact', '', '- [Home](https://fixture.example/): services and contact', ''].join('\n'));
git('init', '-q', '-b', 'main');
git('add', '-A');
git('-c', 'user.name=siteproof-e2e', '-c', 'user.email=e2e@siteproof.local', 'commit', '-q', '-m', 'fixture');
git('config', 'user.name', 'siteproof-e2e');
git('config', 'user.email', 'e2e@siteproof.local');

// --- what /siteproof:audit leaves behind: meta + planner Fixes → Plan ---
nodeOk('plan.mjs', 'init');
write('siteproof/audit/meta.json', JSON.stringify({ url: 'https://fixture.example' }));
const F = (key, area, title, impact, effort, extra = {}) => ({
  key, area, title, why: `evidence for ${key}`, impact, effort, confidence: 0.9, risk: 'low',
  findingIds: [`${area.toLowerCase()}-${key.split(':')[1]}`], checkIds: [], ...extra,
});
const fixes = [
  F('speed:hero-image', 'Speed', 'Hero as right-sized AVIF', 5, 'S', { targetMetric: 'LCP' }),
  F('speed:noop', 'Speed', 'No-op change', 2, 'S', { targetMetric: 'TBT' }),
  F('speed:font-weights', 'Speed', 'Only load used font weights', 2, 'S', { targetMetric: 'bytes' }),
  F('seo:title', 'SEO', 'Titles and descriptions', 5, 'S', { checkIds: ['seo.title', 'seo.description'] }),
  F('geo:robots-ai', 'GEO', 'Let AI search crawlers in', 5, 'S', { checkIds: ['geo.robots-ai'] }),
  F('geo:js-off-content', 'GEO', 'Server-render homepage copy', 5, 'M', { checkIds: ['geo.js-off-content'] }),
  F('seo:canonical', 'SEO', 'Self canonicals', 4, 'S', { checkIds: ['seo.canonical'] }),
  F('seo:jsonld', 'SEO', 'Valid JSON-LD', 4, 'S', { checkIds: ['seo.jsonld'] }),
  F('seo:og', 'SEO', 'Open Graph tags', 3, 'S', { checkIds: ['seo.og'] }),
  F('seo:img-alt', 'SEO', 'Alt on hero', 2, 'S', { checkIds: ['seo.img-alt'] }),
  F('seo:sitemap', 'SEO', 'Add app/sitemap.ts', 4, 'S', { checkIds: ['seo.sitemap'] }),
  F('geo:answer-first', 'GEO', 'Answer-first homepage summary', 3, 'M', { content: true }),
];
write('siteproof/fixes.json', JSON.stringify(fixes, null, 2));
nodeOk('plan.mjs', 'validate');
nodeOk('plan.mjs', 'render', '--url', 'https://fixture.example');
write('siteproof/plan.md', read('siteproof/plan.md').replace(/- \[x\] (\d+\. \*\*SEO\*\* Add app\/sitemap\.ts)/, '- [ ] $1')); // user unticks
assert.equal(git('status', '--porcelain'), '', 'audit leaves the tree clean');

// --- /siteproof:fix ---
log('Dirty tree is refused');
write('app/scratch.txt', 'wip');
assert.equal(node('git.mjs', 'preflight').code, 2);
rmSync(join(work, 'app/scratch.txt'));

log('Preflight');
const pre = JSON.parse(nodeOk('git.mjs', 'preflight'));
assert.match(pre.branch, /^siteproof\/\d{4}-\d{2}-\d{2}$/);
const sel = JSON.parse(nodeOk('plan.mjs', 'selected'));
assert.deepEqual(sel.unticked, ['seo:sitemap']);
assert.deepEqual(sel.apply.slice(0, 3).map(f => f.area), ['Speed', 'Speed', 'Speed']);

log('Baseline');
const base = JSON.parse(nodeOk('proof.mjs', 'baseline'));
assert.ok(!base.failingChecks.includes('geo.llms-txt'), 'llms.txt passes on the Baseline');

const sharp = createRequire(join(work, 'package.json'))('sharp');
const fixer = {
  'speed:hero-image': async () => {
    await sharp(join(work, 'public/hero.png')).avif({ quality: 60 }).toFile(join(work, 'public/hero.avif'));
    edit('app/page.js', '<img className="hero" src="/hero.png" />', '<img className="hero" src="/hero.avif" width="1600" height="900" fetchPriority="high" />');
  },
  'speed:noop': () => edit('app/page.js', 'export default function Home() {', '// Home page.\nexport default function Home() {'),
  'speed:font-weights': () => edit('app/layout.js', "weight: ['100', '300', '400', '500', '700', '900']", "weight: ['400'"),
  'seo:title': () => {
    edit('app/layout.js', 'export default function RootLayout', "export const metadata = {\n  title: { default: 'Fixture Co builds fast websites', template: '%s | Fixture Co' },\n  description: 'Fixture Co designs, builds and runs fast marketing websites for growing companies.',\n};\n\nexport default function RootLayout");
    edit('app/about/page.js', 'export default function About', "export const metadata = { title: 'About', description: 'Fixture Co is a small studio of designers and engineers building websites since 2015.' };\n\nexport default function About");
  },
  'geo:robots-ai': () => write('public/robots.txt', 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n'),
  'geo:js-off-content': () => {
    write('app/clock.js', "'use client';\nimport { useEffect, useState } from 'react';\n\nexport default function Clock() {\n  const [now, setNow] = useState('');\n  useEffect(() => { setNow(new Date().toISOString()); }, []);\n  return <span id=\"clock\">{now}</span>;\n}\n");
    const src = read('app/client-content.js');
    const copy = src.slice(src.indexOf('  return (\n    <main>'), src.lastIndexOf('}'));
    write('app/client-content.js', `import Clock from './clock';\n\n// Server Component: the copy is in the HTML without JavaScript.\nexport default function ClientContent() {\n${copy.replace('<span id="clock">{now}</span>', '<Clock />')}}\n`);
  },
  'seo:canonical': () => {
    edit('app/layout.js', "  description: 'Fixture Co designs", "  metadataBase: new URL('https://fixture.example'),\n  alternates: { canonical: './' },\n  description: 'Fixture Co designs");
    write('public/llms.txt', 'coming soon\n'); // the regression bisect must find
  },
  'seo:jsonld': () => edit('app/page.js', `'{ "@type": "Organization", "name": "Fixture Co", }'`, `'{ "@type": "Organization", "name": "Fixture Co" }'`), // still no @context → unproven
  'seo:og': () => {
    edit('app/layout.js', "growing companies.',\n};", "growing companies.',\n\n  openGraph: { title: 'Fixture Co', description: 'Fast marketing websites.', images: ['https://fixture.example/hero.png'] },\n};");
    edit('app/layout.js', "import './globals.css';", "import './globals.css';\nimport './og-theme.css';");
    write('app/og-theme.css', 'body { color: #b00020; }\n'); // sneaky visible change the UI check must catch
  },
  'seo:img-alt': () => edit('app/page.js', 'className="hero" src=', 'className="hero" alt="Fixture Co studio" src='),
};

for (const f of sel.apply) {
  log('Apply', f.key);
  await fixer[f.key]();
  commit(f.key, `siteproof(${f.area.toLowerCase()}): ${f.title}`);
  let b = node('proof.mjs', 'build', f.key);
  if (b.code === 1) {
    log('Repair attempt (still broken)', f.key);
    edit('app/layout.js', "weight: ['400'", "weight: ['400' /* repaired? */");
    git('add', '-A'); git('commit', '-q', '--amend', '--no-edit');
    b = node('proof.mjs', 'build', f.key);
    if (b.code === 1) nodeOk('proof.mjs', 'undo', f.key, '--reason', 'broke-build', '--log', JSON.parse(b.out).log);
    continue;
  }
  assert.equal(b.code, 0, b.out);
  if (f.area === 'Speed') console.log(nodeOk('proof.mjs', 'speed', f.key));
}

log('SEO/GEO check flips');
console.log(nodeOk('proof.mjs', 'checks'));
log('UI check');
console.log(nodeOk('proof.mjs', 'ui'));
log('Ship (dry run: no GitHub remote)');
console.log(nodeOk('ship.mjs', 'issues'));
console.log(nodeOk('ship.mjs', 'pr'));
nodeOk('git.mjs', 'done');
console.log(nodeOk('proof.mjs', 'status'));

// --- expectations ---
const run = JSON.parse(read('siteproof/run.json'));
const status = Object.fromEntries(Object.values(run.fixes).map(f => [f.key, f.status]));
const expected = {
  'speed:hero-image': 'kept', 'speed:noop': 'failed-proof', 'speed:font-weights': 'broke-build',
  'seo:title': 'kept', 'geo:robots-ai': 'kept', 'geo:js-off-content': 'kept', 'seo:img-alt': 'kept',
  'seo:jsonld': 'failed-proof', 'seo:canonical': 'failed-proof', 'seo:og': 'changes-ui', 'seo:sitemap': 'deferred',
};
assert.deepEqual(status, expected);
assert.match(run.fixes['seo:canonical'].detail, /geo\.llms-txt/);
assert.ok(existsSync(join(work, 'siteproof/ui/seo_og')), 'UI change images kept');
const keys = git('log', '--format=%(trailers:key=Siteproof-Fix,valueonly)', `${run.base}..HEAD`).split('\n').filter(Boolean).sort();
assert.deepEqual(keys, ['geo:js-off-content', 'geo:robots-ai', 'seo:img-alt', 'seo:title', 'speed:hero-image'], 'branch holds exactly the kept Fixes, one commit each');
const body = read('siteproof/pr-body.md');
for (const re of [/Proven on local Workers runtime/, /Hero as right-sized AVIF/, /flipped `seo.title`, `seo.description`/, /Only load used font weights \| broke the build/, /Open Graph tags \| changed the UI/, /Add app\/sitemap.ts \| unticked in the Plan/, /Answer-first homepage summary \| content change/, /`seo.sitemap`/]) assert.match(body, re);
assert.ok(existsSync(join(work, 'siteproof/issues/deferred-fixes.md')));
const deferredBody = read('siteproof/issues/deferred-fixes.md');
for (const k of ['speed:noop', 'speed:font-weights', 'seo:jsonld', 'seo:canonical', 'seo:og', 'seo:sitemap', 'geo:answer-first']) {
  assert.match(deferredBody, new RegExp(`<!--\\s*siteproof:${k}\\s*-->`), k);
}
assert.ok(run.final.scores.mobile.lcp < run.baseline.scores.mobile.lcp);
console.log(`\nE2E OK. Work dir: ${work}\nPR body: ${join(work, 'siteproof/pr-body.md')}`);
