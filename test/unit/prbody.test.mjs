import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPrBody, prTitle } from '../../scripts/lib/prbody.mjs';

const s = (lcp, bytes, score = 50) => ({ score, lcp, tbt: 100, cls: 0.01, bytes });
const fixes = [
  { key: 'speed:hero-image', area: 'Speed', title: 'Hero via next/image', checkIds: [], issue: 12 },
  { key: 'seo:titles', area: 'SEO', title: 'Titles on all routes', checkIds: ['seo.title'] },
  { key: 'geo:robots-ai', area: 'GEO', title: 'Allow GPTBot', checkIds: ['geo.robots-ai'] },
  { key: 'speed:fonts', area: 'Speed', title: 'Drop font weights', checkIds: [] },
  { key: 'geo:home-copy', area: 'GEO', title: 'Answer-first copy', checkIds: [], content: true },
  { key: 'seo:sitemap', area: 'SEO', title: 'Add sitemap', checkIds: ['seo.sitemap'] },
];
const run = {
  date: '2026-09-22', baseBranch: 'main', runtime: 'local Workers runtime (OpenNext + wrangler)', runs: 5,
  baseline: { scores: { mobile: s(18000, 3_400_000), desktop: s(3000, 3_400_000) }, checks: { 'seo.title': { pass: false }, 'geo.robots-ai': { pass: false }, 'seo.sitemap': { pass: false } } },
  final: { scores: { mobile: s(1800, 200_000, 95), desktop: s(600, 200_000, 99) }, checks: { 'seo.title': { pass: true }, 'geo.robots-ai': { pass: false }, 'seo.sitemap': { pass: false, failures: [{ url: '/sitemap.xml', detail: 'HTTP 404' }] } } },
  fixes: {
    'speed:hero-image': { status: 'kept', result: 'LCP mobile 18000ms → 1800ms' },
    'seo:titles': { status: 'kept', result: 'flipped `seo.title` fail → pass' },
    'geo:robots-ai': { status: 'failed-proof', detail: 'checks still failing' },
    'speed:fonts': { status: 'broke-build', detail: 'next build failed' },
    'seo:sitemap': { status: 'deferred' },
  },
  ui: { pages: ['/', '/about'], threshold: 0.005, results: [{ name: 'home@390.png', page: '/', width: 390, ratio: 0.0001 }, { name: 'about@1440.png', page: '/about', width: 1440, ratio: 0 }] },
};

test('PR body is a complete proof document', () => {
  const md = renderPrBody({ run, fixes, prod: { mobile: s(20000, 3_500_000, 40), desktop: s(3500, 3_500_000, 70) }, prodChecks: { 'seo.title': { pass: false } }, filed: { 'geo:robots-ai': 31, 'speed:fonts': 32, 'seo:sitemap': 33, 'geo:home-copy': 34 }, shots: { 'home@390.png': { before: 'b.png', after: 'a.png' } } });
  assert.match(md, /Proven on local Workers runtime/);
  assert.match(md, /\| 1 \| Speed \| Hero via next\/image \| LCP mobile 18000ms → 1800ms \|/);
  assert.match(md, /flipped `seo.title` fail → pass/);
  assert.match(md, /\| mobile \| LCP \| 20000ms \| 18000ms \| 1800ms \(−90%\) \|/);
  assert.match(md, /Checks passing:\*\* Baseline 0\/3 → After 1\/3/);
  assert.match(md, /at most \*\*0\.010%\*\*/);
  assert.match(md, /<img src="b\.png"/);
  assert.match(md, /Allow GPTBot \| failed its Proof: checks still failing \| #31/);
  assert.match(md, /Drop font weights \| broke the build: next build failed \| #32/);
  assert.match(md, /Add sitemap \| unticked in the Plan \| #33/);
  assert.match(md, /Answer-first copy \| content change \(suggestion only\) \| #34/);
  assert.match(md, /Still failing \(not picked\)[\s\S]*`geo.robots-ai`[\s\S]*`seo.sitemap`: \/sitemap.xml HTTP 404 → #33/);
  assert.match(md, /Closes #12/);
  assert.equal(prTitle(run, fixes), 'siteproof: 2 proven SEO/GEO/speed fixes (2026-09-22)');
});

test('a Fix another Fix already did is listed as covered, with no issue link', () => {
  const run2 = { ...run, fixes: { ...run.fixes, 'seo:titles': { status: 'covered', detail: 'the hero Fix added it' } } };
  const md = renderPrBody({ run: run2, fixes, prod: null, prodChecks: null, filed: {} });
  assert.match(md, /Titles on all routes \| already done by another Fix in this PR: the hero Fix added it \| – \|/);
  assert.ok(!/Titles on all routes.*not filed/.test(md));
});
