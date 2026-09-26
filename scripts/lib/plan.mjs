// Pure Plan helpers: render the Plan markdown, read ticks back, apply chat shortcuts.
import { rank, score, fmt } from './decide.mjs';

export const AREAS = ['SEO', 'GEO', 'Speed'];
export const RISKS = ['none', 'low', 'med', 'high'];
const KEY_RE = /^(seo|geo|speed):[a-z0-9][a-z0-9.-]*$/;

// Returns a list of problems; empty means the fix is well-formed.
export function validateFix(f) {
  const errs = [];
  const need = (cond, msg) => { if (!cond) errs.push(`${f.key ?? '?'}: ${msg}`); };
  need(KEY_RE.test(f.key ?? ''), 'key must be <area>:<slug> (lowercase)');
  need(AREAS.includes(f.area), `area must be one of ${AREAS}`);
  need(f.key?.startsWith(f.area?.toLowerCase() + ':'), 'key prefix must match area');
  need(typeof f.title === 'string' && f.title, 'title required');
  need(typeof f.why === 'string' && f.why, 'why (evidence) required');
  need(Number.isInteger(f.impact) && f.impact >= 1 && f.impact <= 5, 'impact 1–5');
  need(['S', 'M', 'L'].includes(f.effort), 'effort S/M/L');
  need(typeof f.confidence === 'number' && f.confidence >= 0.5 && f.confidence <= 1, 'confidence 0.5–1');
  need(RISKS.includes(f.risk), `risk one of ${RISKS}`);
  need(Array.isArray(f.findingIds) && f.findingIds.length > 0, 'findingIds must list ≥1 Finding');
  need(Array.isArray(f.checkIds), 'checkIds array required');
  if (f.content) return errs; // suggestions only; never applied, no proof needed
  if (f.area === 'Speed') need(['LCP', 'TBT', 'CLS', 'bytes'].includes(f.targetMetric), 'Speed Fix needs targetMetric LCP/TBT/CLS/bytes');
  else need(f.checkIds.length > 0, 'SEO/GEO Fix needs ≥1 proving check ID');
  return errs;
}

function row(f, i, ticked) {
  const bits = [
    `impact ${f.impact}`, `effort ${f.effort}`, `risk ${f.risk}`,
    f.targetMetric && `target ${f.targetMetric}`,
    `score ${score(f).toFixed(2)}`,
    f.issue && `matches open issue #${f.issue}`,
    `\`${f.key}\``,
  ].filter(Boolean);
  return `- [${ticked ? 'x' : ' '}] ${i}. **${f.area}** ${f.title} — _${f.why}_ · ${bits.join(' · ')}`;
}

function prodTable(prod) {
  if (!prod) return '';
  const line = (d) => `| ${d} | ${prod[d].score ?? '–'} | ${fmt('lcp', prod[d].lcp)} | ${fmt('tbt', prod[d].tbt)} | ${fmt('cls', prod[d].cls)} | ${fmt('bytes', prod[d].bytes)} |`;
  return ['## Prod at audit', '', '| Device | Score | LCP | TBT | CLS | Bytes |', '|---|---|---|---|---|---|', line('mobile'), line('desktop'), ''].join('\n');
}

/**
 * fixes: all Fixes (content suggestions included). Returns the Plan markdown with
 * appliable Fixes ranked and ticked, and content Fixes listed without checkboxes.
 */
export function renderPlan({ url, date, prod, fixes, failingChecks = [] }) {
  const errs = fixes.flatMap(validateFix);
  if (errs.length) throw new Error('invalid fixes:\n' + errs.join('\n'));
  const keys = fixes.map(f => f.key);
  const dup = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dup) throw new Error(`duplicate fix key: ${dup}`);
  const appliable = rank(fixes.filter(f => !f.content));
  const content = rank(fixes.filter(f => f.content));
  return [
    `# siteproof Plan`, '',
    `Audited ${url} on ${date}. Untick anything you don't want in this run, then run \`/siteproof:fix\`.`,
    `Unticked Fixes are filed as GitHub issues so nothing is lost. Score = impact × confidence ÷ effort.`, '',
    prodTable(prod),
    `## Fixes (${appliable.length})`, '',
    ...appliable.map((f, i) => row(f, i + 1, true)), '',
    `## Content suggestions (not applied, filed as \`content\` issues)`, '',
    ...(content.length ? content.map(f => `- **${f.area}** ${f.title} — _${f.why}_ · \`${f.key}\`${f.issue ? ` · matches open issue #${f.issue}` : ''}`) : ['_None._']), '',
    ...(failingChecks.length ? ['## Failing checks at audit', '', failingChecks.map(c => `\`${c}\``).join(', '), ''] : []),
  ].join('\n');
}

// { key: ticked } for every checkbox row in the Plan.
export function readTicks(md) {
  const ticks = {};
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^- \[([ xX])\] /);
    if (!m) continue;
    const key = [...line.matchAll(/`([^`]+)`/g)].map(x => x[1]).find(k => KEY_RE.test(k));
    if (key) ticks[key] = m[1] !== ' ';
  }
  return ticks;
}

// Ticked Fixes in Plan order; content suggestions can never be selected.
export function selected(md, fixes) {
  const ticks = readTicks(md);
  const byKey = new Map(fixes.map(f => [f.key, f]));
  return Object.keys(ticks).filter(k => ticks[k] && byKey.get(k) && !byKey.get(k).content).map(k => byKey.get(k));
}

export function unselected(md, fixes) {
  const ticks = readTicks(md);
  return fixes.filter(f => !f.content && ticks[f.key] === false);
}

/**
 * Chat shortcuts. opts: { area, top, lowRisk, all, none }. Filters intersect; the result
 * replaces the current ticks. Returns the new markdown.
 */
export function applyShortcut(md, opts) {
  const keys = Object.keys(readTicks(md)); // Plan order = rank order
  const risk = {};
  for (const line of md.split(/\r?\n/)) {
    const k = [...line.matchAll(/`([^`]+)`/g)].map(x => x[1]).find(x => KEY_RE.test(x));
    const r = line.match(/· risk (\w+) ·/);
    if (k && r) risk[k] = r[1];
  }
  const want = new Set(keys.filter((k, i) => {
    if (opts.none) return false;
    if (opts.all) return true;
    if (opts.area && !k.startsWith(opts.area.toLowerCase() + ':')) return false;
    if (opts.lowRisk && !['none', 'low'].includes(risk[k])) return false;
    return true;
  }).slice(0, opts.top ?? Infinity));
  return md.split(/(\r?\n)/).map(line => {
    const m = line.match(/^- \[([ xX])\] /);
    if (!m) return line;
    const k = [...line.matchAll(/`([^`]+)`/g)].map(x => x[1]).find(x => KEY_RE.test(x));
    return k ? line.replace(/^- \[[ xX]\]/, `- [${want.has(k) ? 'x' : ' '}]`) : line;
  }).join('');
}

// Parse a chat phrase like "Speed only", "top 10", "low-risk only", "all", "none".
export function parseShortcut(text) {
  const t = text.toLowerCase();
  const opts = {};
  const area = t.match(/\b(seo|geo|speed)\b/);
  if (area) opts.area = area[1];
  const top = t.match(/\btop\s*(\d+)/);
  if (top) opts.top = Number(top[1]);
  if (/low[- ]?risk/.test(t)) opts.lowRisk = true;
  if (/^\s*(all|everything|tick all)\s*$/.test(t)) opts.all = true;
  if (/^\s*(none|nothing|untick all)\s*$/.test(t)) opts.none = true;
  if (!Object.keys(opts).length) throw new Error(`unrecognised shortcut: "${text}"`);
  return opts;
}
