// The sitemap names the site's public origin. When Proof runs on a local preview those URLs are not
// on the origin being checked, and a www/apex difference does the same on prod: the check must judge
// them by path against the origin most of the sitemap agrees on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seoChecks } from '../../scripts/checks/seo.mjs';

const check = seoChecks.find(c => c.id === 'seo.sitemap');

function ctxFor(locs, { origin = 'http://localhost:8787', missing = [] } = {}) {
  const xml = `<urlset>${locs.map(l => `<url><loc>${l}</loc></url>`).join('')}</urlset>`;
  return {
    origin,
    local: (u) => (u.startsWith(origin) || u.startsWith('/') ? origin + new URL(u, origin).pathname : null),
    get: async (u) => {
      const p = new URL(u, origin).pathname;
      if (p === '/sitemap.xml') return { status: 200, type: 'application/xml', text: xml };
      return { status: missing.includes(p) ? 404 : 200, type: 'text/html', text: '' };
    },
  };
}

test('sitemap URLs on the site\'s own public origin are checked by path', async () => {
  const r = await check.run(ctxFor(['https://fixture.example/', 'https://fixture.example/about', 'https://fixture.example/blog/first-post']));
  assert.equal(r.pass, true, JSON.stringify(r.failures));
  assert.equal(r.info.declaredOrigin, 'https://fixture.example');
});

test('a dead page is still caught, whatever origin the sitemap uses', async () => {
  const r = await check.run(ctxFor(['https://fixture.example/', 'https://fixture.example/gone'], { missing: ['/gone'] }));
  assert.equal(r.pass, false);
  assert.match(r.failures[0].detail, /listed in sitemap but HTTP 404/);
});

test('a URL on a foreign origin still fails', async () => {
  const r = await check.run(ctxFor(['https://fixture.example/', 'https://fixture.example/about', 'https://someone-else.test/spam']));
  assert.equal(r.pass, false);
  assert.match(r.failures[0].detail, /different origin than the rest of the sitemap \(https:\/\/fixture\.example\)/);
});
