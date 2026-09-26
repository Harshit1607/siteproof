import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeOfFile, uiPages } from '../../scripts/lib/routes.mjs';

test('routeOfFile maps Next.js files to routes', () => {
  assert.deepEqual(routeOfFile('app/page.tsx'), { route: '/', subtree: false });
  assert.deepEqual(routeOfFile('app/layout.js'), { route: '/', subtree: true });
  assert.deepEqual(routeOfFile('src/app/(marketing)/about/page.tsx'), { route: '/about', subtree: false });
  assert.deepEqual(routeOfFile('app/blog/[slug]/page.js'), { route: '/blog/[slug]', subtree: false });
  assert.equal(routeOfFile('app/@modal/(.)photo/page.tsx'), null);
  assert.deepEqual(routeOfFile('pages/index.tsx'), { route: '/', subtree: false });
  assert.deepEqual(routeOfFile('pages/docs/intro.mdx'), { route: '/docs/intro', subtree: false });
  assert.deepEqual(routeOfFile('pages/_app.tsx'), { route: '/', subtree: true });
  assert.equal(routeOfFile('components/Hero.tsx'), null);
  assert.equal(routeOfFile('public/llms.txt'), null);
  assert.equal(routeOfFile('app/sitemap.ts'), null);
});

test('uiPages: homepage + one per route type + touched pages', () => {
  const sample = ['/', '/about', '/blog/first-post', '/blog/second-post', '/work/acme', '/work/globex', '/contact'];
  assert.deepEqual(uiPages(sample), ['/', '/about', '/blog/first-post', '/work/acme', '/contact']);
  const touched = [{ route: '/blog/[slug]', subtree: false }, { route: '/work', subtree: true }];
  assert.deepEqual(uiPages(sample, touched), ['/', '/about', '/blog/first-post', '/work/acme', '/contact']);
  const extra = uiPages(['/', '/a', '/a/b', '/a/c'], [{ route: '/a/c', subtree: false }]);
  assert.deepEqual(extra, ['/', '/a', '/a/c']);
});
