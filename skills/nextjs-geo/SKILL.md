---
name: nextjs-geo
description: Next.js conventions for GEO (AI search visibility) fixes - llms.txt, AI crawler rules in robots.txt/app/robots.ts, and server-rendering content so it is readable without JavaScript. Use when auditing or fixing how ChatGPT, Perplexity, Claude or Google AI can reach, read and quote a Next.js site.
---

# Next.js GEO conventions

AI search crawlers generally **do not run JavaScript**: they read the server HTML. GEO in siteproof v1 is proven by three checks: `geo.llms-txt`, `geo.robots-ai`, `geo.js-off-content`. Reference adapted from mykpono/ultimate-seo-geo `references/ai-search-geo.md` (MIT) and claude-seo-ai `references/ai-crawlers.md` (MIT).

Check the installed Next version (`node_modules/next/package.json`); Next 16+ ships docs in `node_modules/next/dist/docs/`.

## Content visible without JavaScript (`geo.js-off-content`)

The check compares text, `<h1>`, JSON-LD and canonical with JavaScript on vs off. Typical causes and fixes:

- **Copy set in `useEffect`/state inside a `'use client'` component** (e.g. `if (!mounted) return null`). Move the copy into a Server Component and keep only the interactive part client-side:
  ```tsx
  // app/page.tsx (Server Component): copy renders in HTML
  export default function Home() {
    return (<main><h1>…</h1><p>…</p><LiveClock /></main>);
  }
  // app/live-clock.tsx
  'use client';
  export function LiveClock() { /* only the part that truly needs the browser */ }
  ```
- **Data fetched client-side** (`useEffect(() => fetch(...))`, SWR/React Query on first paint): fetch in the Server Component (`await fetch(...)` / direct data access) and pass props down.
- **`dynamic(() => import(...), { ssr: false })` around content:** remove `ssr: false` for content-bearing components.
- Keep the copy **word-for-word** and the markup/classes identical so the page looks the same (siteproof compares screenshots). Hydration-sensitive values (dates, random) stay client-side.
- JSON-LD and canonical must be in the server HTML (Metadata API / Server Component script tag), never injected by client JS.

## AI crawler rules (`geo.robots-ai`)

Search indexes and user-triggered fetchers must reach `/`: `OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`, `Claude-User`, `PerplexityBot`, `Perplexity-User`, `Googlebot`, `Bingbot`, `Applebot`, `DuckAssistBot`. Blocking one removes the site from that engine's answers.

Training crawlers/tokens (`GPTBot`, `ClaudeBot`, `Google-Extended`, `Applebot-Extended`, `CCBot`, `Bytespider`, `meta-externalagent`) are a **licensing choice**, not a visibility defect: leave existing rules for them alone unless the Fix says otherwise.

```ts
// app/robots.ts (or edit public/robots.txt if that's what the project uses; never both)
export default function robots() {
  return {
    rules: [
      { userAgent: ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User'], allow: '/' },
      { userAgent: 'GPTBot', disallow: '/' }, // kept: existing training opt-out
      { userAgent: '*', allow: '/' },
    ],
    sitemap: 'https://www.example.com/sitemap.xml',
  };
}
```

Remove the specific `Disallow` for search crawlers rather than restructuring the whole file. Keep private paths (`/admin`, `/api`) disallowed as before.

## llms.txt (`geo.llms-txt`)

Serve markdown at `/llms.txt` per llmstxt.org. Simplest: `public/llms.txt` (served as text/plain). If content must come from data, `app/llms.txt/route.ts` returning `new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } })`.

```markdown
# Example Co

> One-line description of what Example Co does and for whom.

Example Co is a … (2–3 factual sentences taken from the site's own copy).

## Key pages

- [About](https://www.example.com/about): who we are
- [Services](https://www.example.com/services): what we offer
- [Blog](https://www.example.com/blog): articles on …

## Contact

- [Contact](https://www.example.com/contact)
```

- One `#` title, a `>` summary, `##` sections, ≥10 non-blank lines, links to real pages (the check follows them; broken links fail it). Use absolute prod URLs.
- Facts only from existing site copy. It's a low-cost hygiene step for non-Google AI engines; Google Search ignores it.
