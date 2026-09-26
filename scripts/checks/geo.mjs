// GEO pass/fail checks, ported from metawhisp/amazing-seo-skill (Apache-2.0): llms_txt_checker.py,
// robots_checker.py, js_rendering_diff.py. See LICENSES/amazing-seo-skill-NOTICE.

// Crawlers whose access decides AI-search visibility (search indexes + user-triggered fetchers; vendor
// docs, Sept 2026). Blocking one of these is a visibility defect.
export const AI_SEARCH_CRAWLERS = [
  'OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User',
  'Googlebot', 'Bingbot', 'Applebot', 'DuckAssistBot', 'meta-webindexer',
];
// Training crawlers / control tokens: blocking them is a licensing choice, reported but never failed.
export const AI_TRAINING_CRAWLERS = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'meta-externalagent', 'CCBot', 'Bytespider'];

/** robots.txt → { groups: {ua: [[directive, path]]}, sitemaps } (RFC 9309 grouping). */
export function parseRobots(text) {
  const groups = {};
  const sitemaps = [];
  let current = [];
  let prevWasUa = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    if (!line || !line.includes(':')) { if (!line) prevWasUa = false; continue; }
    const i = line.indexOf(':');
    const d = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    if (d === 'user-agent') {
      current = prevWasUa ? [...current, v] : [v];
      groups[v] ??= [];
      prevWasUa = true;
    } else if (d === 'sitemap') {
      sitemaps.push(v); prevWasUa = false;
    } else if (['allow', 'disallow'].includes(d)) {
      for (const ua of current.length ? current : ['*']) (groups[ua] ??= []).push([d, v]);
      prevWasUa = false;
    } else prevWasUa = false;
  }
  return { groups, sitemaps };
}

export function rulesFor(groups, ua) {
  const k = Object.keys(groups).find(g => g.toLowerCase() === ua.toLowerCase());
  return k ? groups[k] : groups['*'] ?? [];
}

// Longest match wins; Allow beats Disallow at equal length. Supports * and $.
export function isBlocked(rules, path) {
  let best = null;
  for (const [d, pattern] of rules) {
    if (!pattern) continue; // empty Disallow allows everything
    const re = new RegExp('^' + pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'));
    if (!re.test(path)) continue;
    if (!best || pattern.length > best.len || (pattern.length === best.len && d === 'allow')) best = { len: pattern.length, d };
  }
  return best?.d === 'disallow';
}

// llms.txt quality score, per llmstxt.org structure (port of llms_txt_checker.score_file).
export function scoreLlms(text) {
  const lines = text.split(/\r?\n/);
  const h1 = lines.filter(l => /^# /.test(l)).length;
  const h2 = lines.filter(l => /^## /.test(l)).length;
  const quote = lines.filter(l => /^\s*>/.test(l)).length;
  const nonBlank = lines.filter(l => l.trim()).length;
  const links = [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(m => m[2].trim());
  const issues = [];
  let score = 100;
  if (h1 === 0) { score -= 25; issues.push('missing # Title heading'); }
  if (h1 > 1) { score -= 5; issues.push(`${h1} H1 headings, should be 1`); }
  if (quote === 0) { score -= 15; issues.push('missing > description blockquote'); }
  if (h2 === 0) { score -= 20; issues.push('no ## sections'); }
  if (nonBlank < 10) { score -= 20; issues.push(`too short (${nonBlank} non-blank lines)`); }
  if (links.length === 0) { score -= 10; issues.push('no markdown links to key pages'); }
  return { score: Math.max(0, score), issues, links };
}

export const geoChecks = [
  {
    id: 'geo.llms-txt', title: '/llms.txt exists, follows llmstxt.org structure, links resolve',
    async run(ctx) {
      const r = await ctx.get('/llms.txt');
      if (r.status !== 200) return { pass: false, failures: [{ url: '/llms.txt', detail: `HTTP ${r.status}` }] };
      if (/text\/html/i.test(r.type) || /^\s*<!doctype html/i.test(r.text)) return { pass: false, failures: [{ url: '/llms.txt', detail: 'served as HTML, not plain text/markdown' }] };
      const s = scoreLlms(r.text);
      let score = s.score;
      const broken = [];
      for (const href of [...new Set(s.links)].slice(0, 30)) {
        const l = ctx.local(new URL(href, ctx.origin).href);
        if (!l) continue; // external links are not ours to prove
        const x = await ctx.get(l);
        if (x.status >= 400 || x.status === 0) broken.push(`${new URL(l).pathname} (HTTP ${x.status})`);
      }
      if (broken.length) { score = Math.max(0, score - Math.min(20, broken.length * 3)); s.issues.push(`broken links: ${broken.join(', ')}`); }
      const pass = score >= 70;
      return { pass, failures: pass ? [] : [{ url: '/llms.txt', detail: `score ${score}/100: ${s.issues.join('; ')}` }], info: { score } };
    },
  },
  {
    id: 'geo.robots-ai', title: 'robots.txt lets AI search crawlers and user fetchers reach the site',
    async run(ctx) {
      const r = await ctx.get('/robots.txt');
      if (r.status === 404) return { pass: true, failures: [], info: { note: 'no robots.txt: all crawlers allowed' } };
      if (r.status !== 200) return { pass: false, failures: [{ url: '/robots.txt', detail: `HTTP ${r.status}` }] };
      const { groups } = parseRobots(r.text);
      const blocked = AI_SEARCH_CRAWLERS.filter(bot => isBlocked(rulesFor(groups, bot), '/'));
      const trainingBlocked = AI_TRAINING_CRAWLERS.filter(bot => isBlocked(rulesFor(groups, bot), '/'));
      return {
        pass: blocked.length === 0,
        failures: blocked.length ? [{ url: '/robots.txt', detail: `blocks ${blocked.join(', ')} from /` }] : [],
        info: { trainingBlocked },
      };
    },
  },
  {
    id: 'geo.js-off-content', title: 'Page content, JSON-LD and canonical are in the HTML without JavaScript',
    async run(ctx) {
      const failures = [];
      for (const url of await ctx.pages()) {
        const off = await ctx.snapshot(url, false);
        if (off.status !== 200) continue;
        const on = await ctx.snapshot(url, true);
        const p = new URL(url).pathname;
        const problems = [];
        if (on.words > 0 && off.words / on.words < 0.5) problems.push(`only ${Math.round(100 * off.words / on.words)}% of the text is present without JS (${off.words}/${on.words} words)`);
        if (on.h1.length && !off.h1.length) problems.push('<h1> only appears after JS runs');
        if (on.jsonld.length > off.jsonld.length) problems.push(`${on.jsonld.length - off.jsonld.length} JSON-LD block(s) only after JS`);
        if ((on.canonical ?? null) !== (off.canonical ?? null)) problems.push('canonical differs with JS on vs off');
        if (problems.length) failures.push({ url: p, detail: problems.join('; ') });
      }
      return { pass: failures.length === 0, failures };
    },
  },
];
