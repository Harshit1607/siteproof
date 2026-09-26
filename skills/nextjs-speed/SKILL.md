---
name: nextjs-speed
description: Next.js speed fixes judged on one Target Metric (LCP, TBT, CLS or bytes) - next/image with preload/priority and correct sizes, next/font with only used weights, next/script strategies, cutting client JavaScript, and OpenNext/Cloudflare specifics. Use when auditing or fixing Core Web Vitals or page weight in a Next.js project.
---

# Next.js speed conventions

Know-how adapted from addyosmani/web-quality-skills `core-web-vitals/` and `performance/` (MIT). siteproof keeps a Speed Fix only if its Target Metric improves on mobile by ≥ max(10%, floor) — floors: LCP 100ms, TBT 50ms, CLS 0.02, bytes 10KB — and no other metric on mobile or desktop gets worse by that margin. Make the change that actually moves the target.

Check the installed version first (`node_modules/next/package.json`). Next 16+ ships docs in `node_modules/next/dist/docs/`; read `…/01-app/…/image` and `…/font` there before editing.

## LCP: the main image (`targetMetric: LCP`)

- Use `next/image`, not `<img>`. Prefer a static import (`import hero from '@/public/hero.png'` or a local asset) so width/height/blur come for free.
- Mark only the LCP image as high priority: **Next 16+: `preload`** (`priority` is deprecated), Next ≤15: `priority`. Never lazy-load it.
- Give `sizes` that match the layout (`sizes="100vw"` for full-width heroes; `(max-width: 768px) 100vw, 50vw` for half-width) so phones don't download desktop widths.
- Keep the rendered box identical: same CSS classes, `style={{ width: '100%', height: 'auto' }}` if the original was fluid. The UI check compares screenshots.
- Formats: `images: { formats: ['image/avif', 'image/webp'] }` in `next.config` enables AVIF.
- **OpenNext on Cloudflare:** runtime image optimization needs the Cloudflare Images binding (`"images": { "binding": "IMAGES" }` in `wrangler.jsonc`). Without it OpenNext serves the original bytes and the Fix won't prove. Either add the binding (works in local `wrangler dev` preview; mention the Cloudflare Images cost in the commit body), or ship a pre-optimised asset (right-sized AVIF/WebP generated once with `sharp`, committed) and render it with `next/image` `unoptimized` plus explicit `width`/`height`.
- LCP is text? Make sure it's server-rendered (see nextjs-geo) and not waiting on a web font: `display: 'swap'` (the next/font default).

## Fonts (`bytes`, sometimes `LCP`)

- `next/font/google` or `next/font/local` only; no `<link>` to fonts.googleapis.com.
- Load only weights and styles actually used (grep the CSS/Tailwind for `font-weight`, `font-bold`, etc.). Prefer a variable font (`weight` omitted) when many weights are used.
- `subsets: ['latin']` (or what the copy needs). `preload: true` only for fonts used above the fold.

## Third-party scripts (`TBT`)

- `next/script` with `strategy="afterInteractive"` (analytics), `"lazyOnload"` (chat widgets, embeds). Next ≤15 with Partytown: `"worker"`.
- Never put third-party scripts in `<head>` via raw `<script>`.

## Client JavaScript (`TBT`, `bytes`)

- Push `'use client'` down to the leaves: a page that is `'use client'` at the top ships the whole tree. Keep interactive widgets as small client components inside Server Components.
- Heavy, below-the-fold or interaction-only components: `dynamic(() => import('./Heavy'))`.
- Replace heavy client libraries used for trivial work (moment → `Intl`, lodash → native) only when the Fix says so.

## Layout shift (`CLS`)

- Images/iframes/ads with explicit `width`/`height` or `aspect-ratio`.
- Reserve space for content injected after load (banners, consent bars).
- `next/font` removes font-swap shift via size-adjusted fallbacks.

## Out of scope for local proof

Cache headers, compression, CDN/edge settings, TTFB on Cloudflare: they can't be proven on the local preview. Don't make these changes as Speed Fixes.
