import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rank, score, speedVerdict, checkFlipVerdict, uiVerdict, bisect, median } from '../../scripts/lib/decide.mjs';

const fix = (key, impact, effort, confidence = 1) => ({ key, area: key.split(':')[0], impact, effort, confidence });

test('scoring ranks across Areas by impact × confidence ÷ effort', () => {
  const fixes = [
    fix('seo:titles', 5, 'S', 1),          // 5
    fix('speed:hero-image', 5, 'M', 0.9),  // 2.25
    fix('geo:llms-txt', 4, 'S', 0.8),      // 3.2
    fix('speed:fonts', 2, 'S', 1),         // 2
    fix('geo:ssr-home', 5, 'L', 1),        // 1.67
  ];
  assert.deepEqual(rank(fixes).map(f => f.key), ['seo:titles', 'geo:llms-txt', 'speed:hero-image', 'speed:fonts', 'geo:ssr-home']);
  assert.equal(score(fixes[1]), 2.25);
});

test('ranking ties break on impact, then effort, then key', () => {
  const fixes = [fix('seo:b', 2, 'S'), fix('geo:a', 4, 'L', 1), fix('speed:z', 4, 'M', 0.75), fix('seo:a', 2, 'S')];
  // scores: 2, 1.33, 1.5, 2
  assert.deepEqual(rank(fixes).map(f => f.key), ['seo:a', 'seo:b', 'speed:z', 'geo:a']);
});

const step = (mobile, desktop = mobile) => ({ mobile: { ...mobile }, desktop: { ...desktop } });
const base = { lcp: 4000, tbt: 300, cls: 0.1, bytes: 2_000_000 };

test('speed: keep at exactly the threshold', () => {
  const v = speedVerdict(step(base), step({ ...base, lcp: 3600 }), 'LCP'); // 10% of 4000 = 400
  assert.equal(v.keep, true);
});

test('speed: undo just below the threshold', () => {
  const v = speedVerdict(step(base), step({ ...base, lcp: 3601 }), 'LCP');
  assert.equal(v.keep, false);
  assert.match(v.reason, /needed/);
});

test('speed: floor applies when 10% is smaller than the floor', () => {
  const small = { ...base, lcp: 800 }; // 10% = 80ms < 100ms floor
  assert.equal(speedVerdict(step(small), step({ ...small, lcp: 710 }), 'LCP').keep, false);
  assert.equal(speedVerdict(step(small), step({ ...small, lcp: 700 }), 'LCP').keep, true);
  const tbt = { ...base, tbt: 200 }; // 10% = 20 < 50 floor
  assert.equal(speedVerdict(step(tbt), step({ ...tbt, tbt: 160 }), 'TBT').keep, false);
  const cls = { ...base, cls: 0.05 }; // floor 0.02
  assert.equal(speedVerdict(step(cls), step({ ...cls, cls: 0.03 }), 'CLS').keep, true);
  assert.equal(speedVerdict(step(cls), step({ ...cls, cls: 0.035 }), 'CLS').keep, false);
});

test('speed: non-target regression on desktop only undoes the Fix', () => {
  const prev = step(base);
  const after = step({ ...base, lcp: 3000 }, { ...base, tbt: 400 }); // desktop TBT +100 >= max(30, 50)
  const v = speedVerdict(prev, after, 'LCP');
  assert.equal(v.keep, false);
  assert.deepEqual(v.regressions.map(r => `${r.device}:${r.metric}`), ['desktop:tbt']);
});

test('speed: small non-target wobble below margin is tolerated', () => {
  const after = step({ ...base, lcp: 3000, tbt: 340 }, { ...base, tbt: 340 });
  assert.equal(speedVerdict(step(base), after, 'LCP').keep, true);
});

test('speed: bytes-only Fix judged on bytes', () => {
  const after = step({ ...base, bytes: 1_800_000 });
  const v = speedVerdict(step(base), after, 'bytes');
  assert.equal(v.keep, true);
  const tiny = speedVerdict(step({ ...base, bytes: 50_000 }), step({ ...base, bytes: 45_000 }), 'bytes'); // 5KB < 10KB floor
  assert.equal(tiny.keep, false);
});

test('speed: a gain inside the run-to-run spread is noise, not proof', () => {
  // Seen on the fixture: a no-op commit "improved" mobile TBT 133 → 83ms while the previous step's own runs spanned 118–187ms.
  const smp = (tbts) => tbts.map(tbt => ({ ...base, tbt }));
  const prev = { ...step({ ...base, tbt: 133 }), samples: { mobile: smp([118, 187, 133]), desktop: smp([0, 0, 0]) } };
  const after = { ...step({ ...base, tbt: 83 }), samples: { mobile: smp([83, 83, 89]), desktop: smp([0, 0, 0]) } };
  const v = speedVerdict(prev, after, 'TBT');
  assert.equal(v.keep, false);
  assert.equal(v.need, 69);
  const real = { ...step({ ...base, tbt: 20 }), samples: { mobile: smp([18, 20, 25]), desktop: smp([0, 0, 0]) } };
  assert.equal(speedVerdict(prev, real, 'TBT').keep, true);
  // A noisy non-target metric doesn't count as a regression either.
  const jitterPrev = { ...step(base), samples: { mobile: [base, base, base], desktop: [{ ...base, tbt: 250 }, { ...base, tbt: 380 }, base] } };
  const jitterAfter = { ...step({ ...base, lcp: 3000 }, { ...base, tbt: 370 }), samples: { mobile: [base], desktop: [{ ...base, tbt: 370 }] } };
  assert.equal(speedVerdict(jitterPrev, jitterAfter, 'LCP').keep, true);
});

test('checks: fail→pass proven, fail→fail not proven, pass→fail regression, unpicked ignored', () => {
  const before = { 'geo.llms-txt': { pass: false }, 'seo.title': false, 'seo.og': true, 'seo.sitemap': false, 'seo.canonical': true };
  const after = { 'geo.llms-txt': { pass: true }, 'seo.title': false, 'seo.og': false, 'seo.sitemap': false, 'seo.canonical': true };
  const v = checkFlipVerdict(before, after, [
    { key: 'geo:llms-txt', checkIds: ['geo.llms-txt'] },
    { key: 'seo:titles', checkIds: ['seo.title'] },
  ]);
  assert.deepEqual(v.results.map(r => [r.key, r.proven]), [['geo:llms-txt', true], ['seo:titles', false]]);
  assert.deepEqual(v.regressions, ['seo.og']);
  assert.deepEqual(v.unpicked, ['seo.og', 'seo.sitemap']);
});

test('checks: a Fix with two checks is proven only when both pass', () => {
  const before = { a: false, b: false };
  const v = checkFlipVerdict(before, { a: true, b: false }, [{ key: 'seo:x', checkIds: ['a', 'b'] }]);
  assert.equal(v.results[0].proven, false);
  assert.equal(checkFlipVerdict(before, { a: true, b: true }, [{ key: 'seo:x', checkIds: ['a', 'b'] }]).results[0].proven, true);
});

test('ui: threshold at and around 0.5%', () => {
  assert.equal(uiVerdict(0).changed, false);
  assert.equal(uiVerdict(0.0049).changed, false);
  assert.equal(uiVerdict(0.005).changed, false);
  assert.equal(uiVerdict(0.0051).changed, true);
});

test('bisect finds the first bad commit with few probes', async () => {
  const commits = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  for (let culprit = 0; culprit < commits.length; culprit++) {
    let probes = 0;
    const idx = await bisect(commits, async (n) => { probes++; return n > culprit; });
    assert.equal(idx, culprit);
    assert.ok(probes <= 3);
  }
});

test('median', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});
