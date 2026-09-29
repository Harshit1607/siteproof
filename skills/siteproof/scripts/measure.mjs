#!/usr/bin/env node
// Lighthouse on mobile + desktop, N runs each → median per metric. Bytes come from one run.
//   node measure.mjs <url> [--runs 3] [--out scores.json]
// Output: { url, runs, mobile: {score,lcp,tbt,cls,bytes}, desktop: {...}, samples }
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import * as chromeLauncher from 'chrome-launcher';
import { chromium } from 'playwright';
import { median } from './lib/decide.mjs';

function chromePath() {
  try { return chromeLauncher.Launcher.getInstallations()[0] ?? chromium.executablePath(); }
  catch { return chromium.executablePath(); }
}

// Failing performance audits with their top offenders, so the Speed auditor can name concrete Fixes.
function diagnostics(lhr) {
  const ids = lhr.categories.performance.auditRefs.map(r => r.id);
  const out = [];
  for (const id of ids) {
    const a = lhr.audits[id];
    if (!a || a.score === null || a.score >= 0.9 || a.scoreDisplayMode === 'informative' && !a.details) continue;
    const raw = Array.isArray(a.details?.items) ? a.details.items : [];
    const flat = raw.flatMap(i => Array.isArray(i?.items) ? i.items : [i]); // "list" details nest tables
    const items = flat.filter(i => i && typeof i === 'object').slice(0, 5).map(i => Object.fromEntries(Object.entries(i)
      .filter(([k, v]) => ['url', 'wastedBytes', 'totalBytes', 'wastedMs', 'node', 'label', 'value', 'score'].includes(k) && v != null && (typeof v !== 'object' || k === 'node'))
      .map(([k, v]) => [k, k === 'node' ? (v.snippet ?? v.selector) : v])));
    out.push({ id, title: a.title, displayValue: a.displayValue, metricSavings: a.metricSavings, items });
  }
  return out;
}

async function once(url, port, device) {
  const flags = { port, output: 'json', logLevel: 'error', onlyCategories: ['performance'] };
  const { lhr } = await lighthouse(url, flags, device === 'desktop' ? desktopConfig : undefined);
  if (lhr.runtimeError) throw new Error(`lighthouse ${device}: ${lhr.runtimeError.message}`);
  const a = lhr.audits;
  return {
    diagnostics: diagnostics(lhr),
    score: Math.round((lhr.categories.performance.score ?? 0) * 100),
    lcp: a['largest-contentful-paint'].numericValue,
    tbt: a['total-blocking-time'].numericValue,
    cls: a['cumulative-layout-shift'].numericValue,
    bytes: a['total-byte-weight'].numericValue,
  };
}

export async function measure(url, { runs = 3 } = {}) {
  const chrome = await chromeLauncher.launch({ chromePath: chromePath(), chromeFlags: ['--headless=new', '--no-sandbox'] });
  const out = { url, runs, at: new Date().toISOString(), samples: {} };
  try {
    for (const device of ['mobile', 'desktop']) {
      const samples = [];
      for (let i = 0; i < runs; i++) samples.push(await once(url, chrome.port, device));
      out.diagnostics ??= {};
      out.diagnostics[device] = samples[0].diagnostics;
      for (const x of samples) delete x.diagnostics;
      out.samples[device] = samples;
      out[device] = {
        score: median(samples.map(s => s.score)),
        lcp: median(samples.map(s => s.lcp)),
        tbt: median(samples.map(s => s.tbt)),
        cls: median(samples.map(s => s.cls)),
        bytes: samples[0].bytes, // one run is enough: bytes don't vary with CPU/network noise
      };
    }
  } finally {
    await chrome.kill();
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { runs: { type: 'string' }, out: { type: 'string' } } });
  if (!positionals[0]) { console.error('usage: measure.mjs <url> [--runs 3] [--out file]'); process.exit(64); }
  const res = await measure(positionals[0], { runs: Number(values.runs ?? 3) });
  const json = JSON.stringify(res, null, 2);
  if (values.out) { mkdirSync(dirname(values.out), { recursive: true }); writeFileSync(values.out, json); }
  console.log(JSON.stringify({ url: res.url, runs: res.runs, mobile: res.mobile, desktop: res.desktop }, null, 2));
}
