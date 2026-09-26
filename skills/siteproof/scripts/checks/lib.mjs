// Shared page access for the checks. One Chromium, JS on and JS off contexts, snapshots cached per URL.
import { chromium } from 'playwright';

export const UA = 'Mozilla/5.0 (compatible; siteproof/0.1)';

/**
 * base: the URL being checked (prod or local preview). siteOrigin: the prod origin, so absolute
 * prod links found in sitemaps/llms.txt are checked against `base` instead (proof runs on localhost).
 */
export async function createContext(base, { siteOrigin, maxPages = 15 } = {}) {
  const origin = new URL(base).origin;
  const origins = new Set([origin, siteOrigin && new URL(siteOrigin).origin].filter(Boolean));
  const browser = await chromium.launch();
  const ctxOn = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 } });
  const ctxOff = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 }, javaScriptEnabled: false });
  const cache = new Map();

  // Map any URL on the site's own origin(s) onto the base origin; null for external URLs.
  const local = (u) => {
    try {
      const x = new URL(u, origin);
      if (!origins.has(x.origin)) return null;
      return origin + x.pathname + x.search;
    } catch { return null; }
  };

  async function get(path) {
    const url = local(path) ?? path;
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
      return { status: r.status, type: r.headers.get('content-type') ?? '', text: await r.text(), url: r.url };
    } catch (e) {
      return { status: 0, type: '', text: String(e), url };
    }
  }

  async function snapshot(url, js) {
    const k = `${js ? 'on' : 'off'} ${url}`;
    if (!cache.has(k)) cache.set(k, (async () => {
      const page = await (js ? ctxOn : ctxOff).newPage();
      try {
        const resp = await page.goto(url, { waitUntil: js ? 'networkidle' : 'domcontentloaded', timeout: 45000 });
        if (js) await page.waitForTimeout(500);
        const facts = await page.evaluate(() => {
          const meta = (sel) => document.querySelector(sel)?.getAttribute('content')?.trim() ?? null;
          const text = (document.body?.innerText ?? '').trim();
          return {
            title: document.querySelector('head > title, title')?.textContent?.trim() ?? null,
            description: meta('meta[name="description"]'),
            robots: meta('meta[name="robots"]'),
            canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
            og: {
              title: meta('meta[property="og:title"]'),
              description: meta('meta[property="og:description"]'),
              image: meta('meta[property="og:image"]'),
            },
            jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent),
            links: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')),
            images: [...document.querySelectorAll('img')].map(i => ({
              src: i.getAttribute('src'), hasAlt: i.hasAttribute('alt'), alt: i.getAttribute('alt'),
            })),
            h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim()).filter(Boolean),
            words: text ? text.split(/\s+/).length : 0,
          };
        });
        return { status: resp?.status() ?? 0, ...facts };
      } catch (e) {
        return { status: 0, error: String(e.message ?? e), jsonld: [], links: [], images: [], h1: [], words: 0, og: {} };
      } finally {
        await page.close();
      }
    })());
    return cache.get(k);
  }

  // Homepage + sitemap URLs + homepage links, same origin, capped. Sitemap first so route types are covered.
  let pagesPromise;
  function pages() {
    return pagesPromise ??= (async () => {
      const seen = new Set([origin + '/']);
      const sm = await sitemapUrls(get);
      const home = await snapshot(origin + '/', false);
      for (const u of [...sm.urls, ...home.links]) {
        const l = local(u);
        if (l && !/\.(xml|txt|pdf|png|jpe?g|webp|avif|svg)$/i.test(l)) seen.add(l.split('#')[0]);
      }
      return spread([...seen], maxPages);
    })();
  }

  return { base, origin, local, get, snapshot, pages, close: () => browser.close() };
}

// Keep the homepage, then round-robin across first path segments so every route type is sampled.
export function spread(urls, n) {
  const [home, ...rest] = urls;
  const groups = new Map();
  for (const u of rest) {
    const seg = new URL(u).pathname.split('/')[1] ?? '';
    if (!groups.has(seg)) groups.set(seg, []);
    groups.get(seg).push(u);
  }
  const out = [home];
  const lists = [...groups.values()];
  for (let i = 0; out.length < n && lists.some(l => l.length); i++) {
    const l = lists[i % lists.length];
    if (l.length) out.push(l.shift());
  }
  return out;
}

// Parse /sitemap.xml (following one level of sitemap index). Returns {status, kind, urls, error}.
export async function sitemapUrls(get) {
  const r = await get('/sitemap.xml');
  if (r.status !== 200) return { status: r.status, kind: null, urls: [] };
  const locs = (t) => [...t.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
  if (/<sitemapindex/i.test(r.text)) {
    const urls = [];
    for (const child of locs(r.text).slice(0, 10)) {
      const c = await get(child);
      if (c.status === 200) urls.push(...locs(c.text));
    }
    return { status: 200, kind: 'index', urls };
  }
  if (/<urlset/i.test(r.text)) return { status: 200, kind: 'urlset', urls: locs(r.text) };
  return { status: 200, kind: 'unknown', urls: [], error: 'root element is neither <urlset> nor <sitemapindex>' };
}
