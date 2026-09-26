// Seam B: scripts against the fixture site on its own local preview (OpenNext → local Workers runtime).
// Needs `npm run fixture` once. Slow: builds the fixture and runs Lighthouse.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPreview } from '../../skills/siteproof/scripts/lib/project.mjs';
import { runChecks } from '../../skills/siteproof/scripts/checks/run.mjs';
import { measure } from '../../skills/siteproof/scripts/measure.mjs';
import { capture, compare } from '../../skills/siteproof/scripts/screenshot.mjs';

const fixture = fileURLToPath(new URL('../fixture-site/', import.meta.url));
let preview;

before(async () => {
  process.chdir(fixture);
  preview = await startPreview();
}, { timeout: 900_000 });

after(async () => { await preview?.stop(); });

test('checks report every known fixture defect by check ID', { timeout: 300_000 }, async () => {
  const r = await runChecks(preview.url);
  const failing = Object.keys(r.checks).filter(k => !r.checks[k].pass).sort();
  assert.deepEqual(failing, [
    'geo.js-off-content', 'geo.llms-txt', 'geo.robots-ai',
    'seo.broken-links', 'seo.canonical', 'seo.description', 'seo.img-alt', 'seo.jsonld', 'seo.og', 'seo.sitemap', 'seo.title',
  ]);
  const titleFails = r.checks['seo.title'].failures.map(f => f.url);
  assert.deepEqual(titleFails.sort(), ['/', '/about'], 'blog posts have titles and pass');
  assert.match(r.checks['geo.robots-ai'].failures[0].detail, /OAI-SearchBot/);
  assert.ok(!/GPTBot/.test(r.checks['geo.robots-ai'].failures[0].detail), 'training bots do not fail the check');
  assert.deepEqual(r.checks['geo.robots-ai'].info.trainingBlocked, ['GPTBot']);
  assert.match(r.checks['geo.js-off-content'].failures[0].detail, /without JS/);
  assert.match(r.checks['seo.jsonld'].failures[0].detail, /invalid JSON/);
  assert.match(r.checks['seo.broken-links'].failures[0].url, /missing-page/);
  assert.ok(r.pages.includes('/blog/first-post') && !r.pages.includes('/missing-page'));
});

test('measure returns well-formed medians for both devices', { timeout: 300_000 }, async () => {
  const m = await measure(preview.url, { runs: 1 });
  for (const d of ['mobile', 'desktop']) {
    for (const k of ['score', 'lcp', 'tbt', 'cls', 'bytes']) assert.ok(Number.isFinite(m[d][k]), `${d}.${k}`);
    assert.ok(m[d].bytes > 2_000_000, 'the multi-MB hero is counted');
  }
  assert.ok(m.mobile.lcp > m.desktop.lcp, 'mobile throttling makes LCP slower');
  assert.ok(m.diagnostics.mobile.some(d => /image/.test(d.id)), 'image diagnostics present for the Speed auditor');
});

test('screenshots: identical builds ≈ 0 diff; a CSS change gives a positive diff', { timeout: 300_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'siteproof-shots-'));
  const pages = ['/', '/about'];
  await capture(preview.url, pages, join(dir, 'a'), { hideSelectors: ['#clock'] });
  await capture(preview.url, pages, join(dir, 'b'), { hideSelectors: ['#clock'] });
  for (const r of compare(join(dir, 'a'), join(dir, 'b'), join(dir, 'd'))) assert.ok(r.ratio < 0.001, `${r.name} ${r.ratio}`);
  await capture(preview.url, pages, join(dir, 'c'), { hideSelectors: ['#clock', 'h1', 'p'] }); // deliberate CSS change
  const changed = compare(join(dir, 'a'), join(dir, 'c'), join(dir, 'e'));
  assert.ok(changed.every(r => r.ratio > 0.005), JSON.stringify(changed.map(r => [r.name, r.ratio])));
});
