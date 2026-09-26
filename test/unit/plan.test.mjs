import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPlan, readTicks, selected, unselected, applyShortcut, parseShortcut, validateFix } from '../../scripts/lib/plan.mjs';

const F = (key, area, impact, effort, extra = {}) => ({
  key, area, title: `Fix ${key}`, why: `evidence for ${key}`, impact, effort, confidence: 1, risk: 'low',
  findingIds: [`f-${key}`], checkIds: area === 'Speed' ? [] : [key.replace(':', '.')],
  ...(area === 'Speed' ? { targetMetric: 'LCP' } : {}), ...extra,
});

const fixes = [
  F('speed:hero-image', 'Speed', 5, 'S'),
  F('seo:image-alt', 'SEO', 2, 'S'),
  F('seo:titles', 'SEO', 5, 'S', { risk: 'none' }),
  F('geo:ssr-home', 'GEO', 5, 'M', { risk: 'med' }),
  F('speed:font-weights', 'Speed', 2, 'S', { targetMetric: 'bytes' }),
  F('geo:home-copy', 'GEO', 3, 'M', { content: true, checkIds: [] }),
];
const prod = { mobile: { score: 41, lcp: 5200, tbt: 420, cls: 0.12, bytes: 2_400_000 }, desktop: { score: 77, lcp: 1500, tbt: 90, cls: 0.02, bytes: 2_400_000 } };
const md = renderPlan({ url: 'https://x.test', date: '2026-09-22', prod, fixes });

test('plan: ranked checkbox list, all ticked, evidence shown, content not tickable', () => {
  const ticks = readTicks(md);
  assert.deepEqual(Object.keys(ticks), ['seo:titles', 'speed:hero-image', 'geo:ssr-home', 'seo:image-alt', 'speed:font-weights']);
  assert.ok(Object.values(ticks).every(Boolean));
  assert.match(md, /_evidence for speed:hero-image_/);
  assert.match(md, /target LCP/);
  assert.match(md, /## Prod at audit/);
  assert.match(md, /\| mobile \| 41 \| 5200ms/);
  assert.ok(!('geo:home-copy' in ticks));
  assert.match(md, /Content suggestions[\s\S]*geo:home-copy/);
});

test('plan: cross-Area problem stays two Fixes with one Area each', () => {
  const keys = fixes.map(f => f.key);
  assert.ok(keys.includes('speed:hero-image') && keys.includes('seo:image-alt'));
  assert.throws(() => renderPlan({ url: 'u', date: 'd', fixes: [{ ...fixes[0], area: 'SEO' }] }), /key prefix/);
});

test('plan: content suggestions are never selected even if someone ticks them', () => {
  const hacked = md.replace('- **GEO** Fix geo:home-copy', '- [x] 9. **GEO** Fix geo:home-copy');
  assert.ok(!selected(hacked, fixes).some(f => f.key === 'geo:home-copy'));
});

test('plan: user unticks in the file → selected/unselected follow the file', () => {
  const edited = md.replace(/- \[x\] (\d+\. \*\*SEO\*\* Fix seo:image-alt)/, '- [ ] $1');
  assert.deepEqual(selected(edited, fixes).map(f => f.key), ['seo:titles', 'speed:hero-image', 'geo:ssr-home', 'speed:font-weights']);
  assert.deepEqual(unselected(edited, fixes).map(f => f.key), ['seo:image-alt']);
});

test('plan: shortcuts edit the file', () => {
  const speedOnly = applyShortcut(md, parseShortcut('Speed only'));
  assert.deepEqual(selected(speedOnly, fixes).map(f => f.key), ['speed:hero-image', 'speed:font-weights']);
  const top2 = applyShortcut(md, parseShortcut('top 2'));
  assert.deepEqual(selected(top2, fixes).map(f => f.key), ['seo:titles', 'speed:hero-image']);
  const low = applyShortcut(md, parseShortcut('low-risk only'));
  assert.ok(!selected(low, fixes).some(f => f.key === 'geo:ssr-home'));
  const none = applyShortcut(md, parseShortcut('none'));
  assert.equal(selected(none, fixes).length, 0);
  assert.equal(selected(applyShortcut(none, parseShortcut('all')), fixes).length, 5);
  assert.throws(() => parseShortcut('make it pretty'));
});

test('plan: open issue matches are marked on the row', () => {
  const m = renderPlan({ url: 'u', date: 'd', fixes: [{ ...fixes[2], issue: 42 }] });
  assert.match(m, /matches open issue #42/);
  assert.deepEqual(Object.keys(readTicks(m)), ['seo:titles']);
});

test('schema: validation catches missing pieces', () => {
  assert.deepEqual(validateFix(fixes[0]), []);
  assert.ok(validateFix({ ...fixes[0], targetMetric: undefined }).some(e => /targetMetric/.test(e)));
  assert.ok(validateFix({ ...fixes[1], checkIds: [] }).some(e => /check ID/.test(e)));
  assert.ok(validateFix({ ...fixes[1], impact: 7 }).some(e => /impact/.test(e)));
  assert.ok(validateFix({ ...fixes[1], key: 'SEO:Bad Key' }).some(e => /key/.test(e)));
});
