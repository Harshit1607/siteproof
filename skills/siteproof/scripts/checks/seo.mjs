// SEO pass/fail checks. Sitemap, JSON-LD graph, broken links and image checks are ported from
// metawhisp/amazing-seo-skill (Apache-2.0): sitemap_validator.py, schema_graph_checker.py,
// broken_links_checker.py, images_audit.py. See LICENSES/amazing-seo-skill-NOTICE.
import { sitemapUrls } from './lib.mjs';

const path = (u) => new URL(u).pathname;

// Run fn(url, snapshot) on every page with JS off (what crawlers read first); collect failures.
async function perPage(ctx, fn) {
  const failures = [];
  for (const url of await ctx.pages()) {
    const s = await ctx.snapshot(url, false);
    if (s.status !== 200) continue; // broken pages are seo.broken-links' job
    const detail = fn(s, url);
    if (detail) failures.push({ url: path(url), detail });
  }
  return { pass: failures.length === 0, failures };
}

const LASTMOD_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

export const seoChecks = [
  {
    id: 'seo.title', title: 'Every page has a <title>',
    run: (ctx) => perPage(ctx, (s) => !s.title ? 'missing <title>' : null),
  },
  {
    id: 'seo.description', title: 'Every page has a meta description',
    run: (ctx) => perPage(ctx, (s) => !s.description ? 'missing meta description' : null),
  },
  {
    id: 'seo.canonical', title: 'Every page has an absolute canonical URL',
    run: (ctx) => perPage(ctx, (s) => !s.canonical ? 'missing <link rel="canonical">'
      : !/^https?:\/\//.test(s.canonical) ? `canonical is relative: ${s.canonical}` : null),
  },
  {
    id: 'seo.og', title: 'Every page has og:title, og:description and og:image',
    run: (ctx) => perPage(ctx, (s) => {
      const missing = ['title', 'description', 'image'].filter(k => !s.og?.[k]);
      return missing.length ? `missing og:${missing.join(', og:')}` : null;
    }),
  },
  {
    id: 'seo.sitemap', title: '/sitemap.xml exists, is valid and lists live pages',
    async run(ctx) {
      const sm = await sitemapUrls(ctx.get);
      if (sm.status !== 200) return { pass: false, failures: [{ url: '/sitemap.xml', detail: `HTTP ${sm.status}` }] };
      if (sm.error) return { pass: false, failures: [{ url: '/sitemap.xml', detail: sm.error }] };
      if (!sm.urls.length) return { pass: false, failures: [{ url: '/sitemap.xml', detail: 'no <loc> entries' }] };
      const failures = [];
      const text = (await ctx.get('/sitemap.xml')).text;
      const lastmods = [...text.matchAll(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/g)].map(m => m[1]);
      const bad = lastmods.filter(l => !LASTMOD_RE.test(l));
      if (bad.length) failures.push({ url: '/sitemap.xml', detail: `malformed lastmod: ${bad.slice(0, 3).join(', ')}` });
      // A sitemap names the site's public origin, which is not the origin we're checking when proof
      // runs on a local preview (and may be www vs apex even on prod). The origin most of the entries
      // agree on IS the site; only entries that disagree with it are suspect.
      const origins = sm.urls.map(u => { try { return new URL(u).origin; } catch { return '?'; } });
      const counts = origins.reduce((m, o) => m.set(o, (m.get(o) ?? 0) + 1), new Map());
      const declared = [...counts].sort((a, b) => b[1] - a[1])[0][0];
      for (const u of sm.urls.slice(0, 20)) {
        let l = ctx.local(u);
        if (!l) {
          const sameSite = (() => { try { return new URL(u).origin === declared; } catch { return false; } })();
          if (!sameSite) { failures.push({ url: u, detail: `URL on a different origin than the rest of the sitemap (${declared})` }); continue; }
          l = ctx.origin + new URL(u).pathname + new URL(u).search; // check the path on whatever we're proving
        }
        const r = await ctx.get(l);
        if (r.status !== 200) failures.push({ url: path(l), detail: `listed in sitemap but HTTP ${r.status}` });
      }
      return { pass: failures.length === 0, failures, info: { urls: sm.urls.length, kind: sm.kind, declaredOrigin: declared } };
    },
  },
  {
    id: 'seo.jsonld', title: 'JSON-LD parses, has @context/@type, homepage has structured data, @id entities agree across pages',
    async run(ctx) {
      const failures = [];
      const byId = new Map(); // @id -> {name, url(page)}
      const pages = await ctx.pages();
      for (const url of pages) {
        const s = await ctx.snapshot(url, false);
        if (s.status !== 200) continue;
        if (url === pages[0] && s.jsonld.length === 0) failures.push({ url: path(url), detail: 'homepage has no JSON-LD (Organization/WebSite expected)' });
        s.jsonld.forEach((raw, i) => {
          let data;
          try { data = JSON.parse(raw); } catch (e) { failures.push({ url: path(url), detail: `block ${i + 1}: invalid JSON (${e.message})` }); return; }
          for (const doc of Array.isArray(data) ? data : [data]) {
            if (!doc || typeof doc !== 'object') continue;
            if (!/schema\.org/.test(JSON.stringify(doc['@context'] ?? ''))) failures.push({ url: path(url), detail: `block ${i + 1}: missing schema.org @context` });
            const ents = Array.isArray(doc['@graph']) ? doc['@graph'] : [doc];
            for (const e of ents) {
              if (!e || typeof e !== 'object') continue;
              if (!e['@type']) failures.push({ url: path(url), detail: `block ${i + 1}: entity without @type` });
              if (e['@id'] && e.name) {
                const prev = byId.get(e['@id']);
                if (prev && prev.name !== e.name) failures.push({ url: path(url), detail: `@id ${e['@id']} named "${e.name}" here but "${prev.name}" on ${prev.page}` });
                else if (!prev) byId.set(e['@id'], { name: e.name, page: path(url) });
              }
            }
          }
        });
      }
      return { pass: failures.length === 0, failures };
    },
  },
  {
    id: 'seo.broken-links', title: 'Internal links resolve (no 4xx/5xx)',
    async run(ctx) {
      const targets = new Map(); // local url -> first page linking to it
      for (const url of await ctx.pages()) {
        const s = await ctx.snapshot(url, false);
        for (const h of s.links) {
          if (/^(mailto:|tel:|javascript:|#)/i.test(h)) continue;
          const l = ctx.local(new URL(h, url).href);
          if (l && !targets.has(l.split('#')[0])) targets.set(l.split('#')[0], path(url));
        }
      }
      const failures = [];
      for (const [t, from] of [...targets].slice(0, 100)) {
        const r = await ctx.get(t);
        if (r.status === 0 || r.status >= 400) failures.push({ url: path(t), detail: `HTTP ${r.status || 'unreachable'} (linked from ${from})` });
      }
      return { pass: failures.length === 0, failures, info: { checked: Math.min(targets.size, 100) } };
    },
  },
  {
    id: 'seo.img-alt', title: 'Every <img> has an alt attribute (alt="" for decorative)',
    run: (ctx) => perPage(ctx, (s) => {
      const missing = s.images.filter(i => !i.hasAlt);
      return missing.length ? `${missing.length}/${s.images.length} images missing alt: ${missing.slice(0, 3).map(i => i.src).join(', ')}` : null;
    }),
  },
];
