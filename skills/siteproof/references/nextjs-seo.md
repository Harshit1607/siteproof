# Next.js SEO conventions

Fix map adapted from claude-seo-ai `references/platforms/nextjs.md` (MIT). JSON-LD shapes from claude-seo-ai `schema/jsonld-templates/` (MIT).

**First, check the installed version:** `node_modules/next/package.json`. Next 16+ ships its own docs in `node_modules/next/dist/docs/` — read the relevant page there before using an API; it matches the installed version exactly.

## The head is code

- **App Router:** metadata comes from `export const metadata = {…}` or `export async function generateMetadata()` in `page.*` / `layout.*`. Never hand-write `<title>`/`<meta>` in JSX. Read the route's layouts first: child metadata merges over parents, so you can ship two titles or clobber a parent by accident.
- **Pages Router:** `<Head>` from `next/head` inside the page.
- Detect router: `app/layout.*` (or `src/app`) ⇒ App Router; `pages/_app.*` ⇒ Pages Router.

## Titles and descriptions (`seo.title`, `seo.description`)

Root layout sets site-wide defaults and a template; each route sets its own:

```ts
// app/layout.tsx
export const metadata = {
  metadataBase: new URL('https://www.example.com'), // prod origin; required for absolute OG/canonical URLs
  title: { default: 'Example Co', template: '%s | Example Co' },
  description: 'One sentence that says what the site offers.',
};
// app/about/page.tsx
export const metadata = { title: 'About', description: '…' };
```

- `title.template` applies to child routes only, never to the layout's own title.
- Descriptions: write from copy already on the page (a factual sentence, ~150 chars). Don't invent claims.
- Dynamic routes: `generateMetadata({ params })` (in Next 15+ `params` is a Promise: `const { slug } = await params`).

## Canonical (`seo.canonical`) and Open Graph (`seo.og`)

```ts
export const metadata = {
  alternates: { canonical: '/about' },          // resolved against metadataBase → absolute
  openGraph: { title: 'About', description: '…', url: '/about', images: ['/og.png'], type: 'website' },
};
```

- Set `metadataBase` once in the root layout; then relative canonicals/OG URLs resolve to absolute ones.
- For every route to get a self-canonical, set it per route (or in `generateMetadata`). A canonical on the root layout alone would point every page at `/` — never do that.
- OG image: use an existing brand/hero asset, or add `app/opengraph-image.(png|jpg|tsx)` (file convention, applied automatically). `openGraph` in a child replaces the parent's object entirely (shallow merge), so repeat `images` where you override `openGraph`.

## Sitemap (`seo.sitemap`) and robots

```ts
// app/sitemap.ts
import type { MetadataRoute } from 'next';
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.example.com';
  return [
    { url: `${base}/`, lastModified: new Date() },
    { url: `${base}/about` },
    ...posts.map(p => ({ url: `${base}/blog/${p.slug}` })), // same source generateStaticParams uses
  ];
}
// app/robots.ts
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/' }], sitemap: 'https://www.example.com/sitemap.xml' };
}
```

- List only live, canonical, 200 pages. Build dynamic entries from the same data the routes use.
- `app/robots.ts` and `public/robots.txt` must not both exist (the route file wins; editing the static file then does nothing). Keep whichever the project already uses.
- `next-sitemap` in `package.json`? Configure it instead of adding `app/sitemap.ts`.

## JSON-LD (`seo.jsonld`)

Render in a Server Component so it's in the HTML without JavaScript:

```tsx
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': 'https://www.example.com/#organization',
  name: 'Example Co',
  url: 'https://www.example.com',
  logo: 'https://www.example.com/logo.png',
};
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
```

- Always build it with `JSON.stringify` from an object (never hand-written JSON strings — that's how trailing commas ship).
- Homepage: `Organization` + `WebSite`. Articles: `BlogPosting`/`Article` with `headline`, `datePublished`, `author`. Only facts already on the site.
- Same `@id` → same `name` on every page.

## Image alt (`seo.img-alt`)

- Meaningful images: `alt` describing the image in context, taken from nearby copy. Decorative images: `alt=""`.
- Keep the element and its styling untouched otherwise (the UI check compares pixels).

## Broken links (`seo.broken-links`)

Point the link at the page that exists now (check `app/` routes). If there's no right target, remove the link but keep its visible text/layout unchanged only when that's a pure navigation link; otherwise report `CANNOT_APPLY`.
