#!/usr/bin/env node
// Plan file CLI. Run from the target project's root.
//   node plan.mjs init                         create ./siteproof (git-ignored via .git/info/exclude)
//   node plan.mjs validate                     check siteproof/fixes.json against the Fix schema
//   node plan.mjs render --url <prod url>      siteproof/fixes.json (+ audit/prod-scores.json, audit/checks-*.json) → siteproof/plan.md
//   node plan.mjs shortcut "<phrase>"          "Speed only" | "top 10" | "low-risk only" | "all" | "none" → edits plan.md
//   node plan.mjs selected                     ticked Fixes in apply order (Speed first, then SEO/GEO) as JSON
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { renderPlan, readTicks, selected, unselected, applyShortcut, parseShortcut, validateFix } from './lib/plan.mjs';
import { initWorkdir, wd, readJson, auditChecks } from './lib/project.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { url: { type: 'string' } } });
const [cmd, arg] = positionals;
const fixesFile = wd('fixes.json');
const planFile = wd('plan.md');

const loadFixes = () => {
  const f = readJson(fixesFile);
  return Array.isArray(f) ? f : f.fixes;
};

if (cmd === 'init') {
  console.log(JSON.stringify({ dir: wd(), ...initWorkdir() }));
} else if (cmd === 'validate') {
  const errs = loadFixes().flatMap(validateFix);
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  console.log('fixes.json OK');
} else if (cmd === 'render') {
  const fixes = loadFixes();
  const prodFile = wd('audit', 'prod-scores.json');
  const prod = existsSync(prodFile) ? readJson(prodFile) : null;
  const checks = auditChecks() ?? {};
  const url = values.url ?? readJson(wd('audit', 'meta.json'), {}).url ?? prod?.url ?? '?';
  const md = renderPlan({
    url, date: new Date().toISOString().slice(0, 10), prod,
    fixes, failingChecks: Object.keys(checks).filter(k => !checks[k].pass),
  });
  writeFileSync(planFile, md);
  const ticks = readTicks(md);
  console.log(`Wrote ${planFile}: ${Object.keys(ticks).length} Fixes ticked, ${fixes.filter(f => f.content).length} content suggestions.`);
} else if (cmd === 'shortcut') {
  if (!arg) { console.error('usage: plan.mjs shortcut "<phrase>"'); process.exit(64); }
  const md = applyShortcut(readFileSync(planFile, 'utf8'), parseShortcut(arg));
  writeFileSync(planFile, md);
  const t = readTicks(md);
  console.log(`${Object.values(t).filter(Boolean).length}/${Object.keys(t).length} Fixes ticked: ${Object.keys(t).filter(k => t[k]).join(', ') || 'none'}`);
} else if (cmd === 'selected') {
  const md = readFileSync(planFile, 'utf8');
  const fixes = loadFixes();
  const sel = selected(md, fixes);
  const order = [...sel.filter(f => f.area === 'Speed'), ...sel.filter(f => f.area !== 'Speed')];
  console.log(JSON.stringify({ apply: order, unticked: unselected(md, fixes).map(f => f.key), content: fixes.filter(f => f.content).map(f => f.key) }, null, 2));
} else {
  console.error('usage: plan.mjs init | validate | render --url <url> | shortcut "<phrase>" | selected');
  process.exit(64);
}
