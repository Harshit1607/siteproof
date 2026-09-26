import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyComment, keyOf, openIssueKeys, staleIssues, issueFor, coveredByOthers } from '../../scripts/lib/issues.mjs';

const fix = { key: 'speed:hero-image', area: 'Speed', title: 'Hero image via next/image', why: 'LCP −2.1s', impact: 5, effort: 'S', confidence: 0.9, risk: 'low', targetMetric: 'LCP', checkIds: [] };

test('key comment round-trips and survives surrounding text', () => {
  assert.equal(keyOf(`hello\n${keyComment('geo:llms-txt')}\nmore`), 'geo:llms-txt');
  assert.equal(keyOf('<!--siteproof:seo:titles-->'), 'seo:titles');
  assert.equal(keyOf('no key here'), null);
  assert.equal(keyOf('<!-- siteproof:other:x -->'), null);
});

test('dedup: open issues map by key; closed and foreign issues ignored; first wins', () => {
  const issues = [
    { number: 3, state: 'OPEN', body: keyComment('seo:titles') },
    { number: 4, state: 'CLOSED', body: keyComment('geo:llms-txt') },
    { number: 5, state: 'OPEN', body: 'unrelated' },
    { number: 6, state: 'OPEN', body: keyComment('seo:titles') },
  ];
  assert.deepEqual(openIssueKeys(issues), { 'seo:titles': 3 });
});

test('stale: open issues whose key is gone from the audit', () => {
  const issues = [
    { number: 1, state: 'OPEN', body: keyComment('seo:titles') },
    { number: 2, state: 'OPEN', body: keyComment('geo:llms-txt') },
    { number: 7, state: 'CLOSED', body: keyComment('speed:fonts') },
    { number: 8, state: 'OPEN', body: 'not ours' },
  ];
  assert.deepEqual(staleIssues(issues, ['seo:titles']).map(i => i.number), [2]);
});

test('issue body carries key, labels, numbers and images', () => {
  const numbers = { before: { mobile: { lcp: 4000 }, desktop: { lcp: 1500 } }, after: { mobile: { lcp: 3900 }, desktop: { lcp: 1500 } } };
  const i = issueFor(fix, { reason: 'failed-proof', detail: 'LCP needed −400ms', numbers, images: { '/ @390': { before: 'b.png', after: 'a.png', diff: 'd.png' } } });
  assert.equal(keyOf(i.body), 'speed:hero-image');
  assert.deepEqual(i.labels, ['siteproof', 'speed', 'failed-proof']);
  assert.match(i.body, /\| mobile \| LCP \| 4000ms \| 3900ms \|/);
  assert.match(i.body, /!\[\]\(d\.png\)/);
  assert.throws(() => issueFor(fix, { reason: 'nope' }));
});

test('a dropped Fix whose checks all pass at the end is covered, not filed', () => {
  const fixes = [
    { key: 'seo:img-alt', area: 'SEO', checkIds: ['seo.img-alt'] },      // the hero Fix added the alt
    { key: 'seo:sitemap', area: 'SEO', checkIds: ['seo.sitemap'] },      // genuinely still broken
    { key: 'speed:fonts', area: 'Speed', checkIds: [] },                 // Speed has no checks: never covered
    { key: 'geo:copy', area: 'GEO', checkIds: ['geo.llms-txt'], content: true },
    { key: 'seo:og', area: 'SEO', checkIds: ['seo.og'] },                // kept: not a candidate
  ];
  const runFixes = {
    'seo:img-alt': { status: 'deferred' }, 'seo:sitemap': { status: 'failed-proof' },
    'speed:fonts': { status: 'failed-proof' }, 'geo:copy': { status: 'deferred' }, 'seo:og': { status: 'kept' },
  };
  const final = { 'seo.img-alt': { pass: true }, 'seo.sitemap': { pass: false }, 'geo.llms-txt': { pass: true }, 'seo.og': { pass: true } };
  assert.deepEqual(coveredByOthers(fixes, runFixes, final), { 'seo:img-alt': 'covered' });
  assert.deepEqual(coveredByOthers(fixes, runFixes, {}), {}, 'no final checks yet → nothing reclassified');
});
