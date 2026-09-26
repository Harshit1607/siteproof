#!/usr/bin/env node
// Run SEO + GEO pass/fail checks against a URL. Prints JSON keyed by check ID.
//   node run.mjs <url> [--only id,id] [--area seo|geo] [--site-origin https://prod.example] [--pages 15] [--out file.json]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createContext } from './lib.mjs';
import { seoChecks } from './seo.mjs';
import { geoChecks } from './geo.mjs';

export const ALL_CHECKS = [...seoChecks, ...geoChecks];

export async function runChecks(url, { only, area, siteOrigin, pages = 15 } = {}) {
  const ctx = await createContext(url, { siteOrigin, maxPages: pages });
  const checks = {};
  try {
    for (const c of ALL_CHECKS) {
      if (only && !only.includes(c.id)) continue;
      if (area && !c.id.startsWith(area + '.')) continue;
      try {
        checks[c.id] = { title: c.title, ...(await c.run(ctx)) };
      } catch (e) {
        checks[c.id] = { title: c.title, pass: false, failures: [{ url: '-', detail: `check crashed: ${e.message}` }] };
      }
    }
    const pages = [];
    for (const u of await ctx.pages()) if ((await ctx.snapshot(u, false)).status === 200) pages.push(new URL(u).pathname);
    return { url, at: new Date().toISOString(), pages, checks };
  } finally {
    await ctx.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { only: { type: 'string' }, area: { type: 'string' }, 'site-origin': { type: 'string' }, pages: { type: 'string' }, out: { type: 'string' } },
  });
  if (!positionals[0]) { console.error('usage: run.mjs <url> [--only ids] [--area seo|geo] [--site-origin url] [--pages n] [--out file]'); process.exit(64); }
  const res = await runChecks(positionals[0], {
    only: values.only?.split(','), area: values.area, siteOrigin: values['site-origin'], pages: Number(values.pages ?? 15),
  });
  const json = JSON.stringify(res, null, 2);
  if (values.out) { mkdirSync(dirname(values.out), { recursive: true }); writeFileSync(values.out, json); }
  console.log(json);
}
