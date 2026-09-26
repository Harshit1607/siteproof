# siteproof

A Claude Code plugin that audits a **Next.js** site across **SEO, GEO and speed**, ranks every fix in one list, applies the ones you pick, **proves** each one on a local preview, and opens **one PR**. Anything not shipped becomes a GitHub issue.

*Fixes that are proven to work and proven not to break the UI.*

| Command | What it does |
|---|---|
| `/siteproof:audit <prod url>` | Read-only. Runs the SEO, GEO and speed auditors in parallel and writes a ranked, all-ticked Plan to `siteproof/plan.md`. |
| `/siteproof:fix` | Applies the ticked Fixes on `siteproof/<date>`, one commit each, proves each against a Baseline of unmodified main, opens one PR, and files every Deferred Fix as an issue. |

Terms (Finding, Fix, Plan, Area, Proof, Baseline, Target Metric, Deferred Fix) are defined in [CONTEXT.md](CONTEXT.md). Design: [PLAN.md](PLAN.md), [docs/PRD.md](docs/PRD.md).

## Install

In Claude Code:

```
/plugin marketplace add Harshit1607/siteproof
/plugin install siteproof@siteproof
```

Restart Claude Code. The first session installs siteproof's dependencies (Lighthouse, Playwright and its Chromium, ~1–3 min) into the plugin's data directory; later sessions and plugin updates skip it unless `package.json` changed.

From a clone instead: `npm install && npx playwright install chromium`, then `claude --plugin-dir /path/to/siteproof`.

Needs Node 20+, git, and Chrome/Chromium (Lighthouse uses installed Chrome, falling back to Playwright's). No Python. `gh` (logged in) is only needed to file issues and open the PR; without a GitHub remote siteproof runs dry and writes `siteproof/pr-body.md` and `siteproof/issues/*.md` instead.

## How it proves things

- **Baseline:** the project's own local preview of unmodified main (OpenNext projects: `opennextjs-cloudflare preview`, the local Workers runtime, no Cloudflare credentials). Lighthouse ×5 mobile + desktop (median; bytes from one run), all checks, screenshots. Every Proof compares against this, on the same machine.
- **Speed Fixes** are applied one at a time and measured cumulatively. Kept only if the Target Metric improves on mobile by ≥ max(10%, floor, run-to-run spread) — floors LCP 100ms, TBT 50ms, CLS 0.02, bytes 10KB; the spread is the widest range of the two steps' own runs, so machine jitter never counts as proof — and no other metric on either device gets worse by the same margin. Otherwise undone (`failed-proof`).
- **SEO/GEO Fixes** are proven together: each Fix's check IDs must flip fail → pass, and no passing check may start failing (the culprit is found by bisecting and undone). Pre-existing failures nobody picked are ignored and listed in the PR.
- **UI check:** homepage, one page per route type and every page a Fix touched, at 390px and 1440px, animations off, fonts/images loaded, `hideSelectors` hidden. More than 0.5% of pixels different → bisect to the Fix, undo it (`changes-ui`, with before/after/diff images), ship the rest.
- **Build check** after every Fix (build + lint + typecheck when present): one repair attempt, then undo (`broke-build`, with the log). Lint/TS config is never loosened (a hook blocks it).

All thresholds live in [`scripts/lib/decide.mjs`](scripts/lib/decide.mjs).

## Checks

| ID | Area | Passes when |
|---|---|---|
| `seo.title` / `seo.description` | SEO | every sampled page has a `<title>` / meta description |
| `seo.canonical` | SEO | every page has an absolute canonical |
| `seo.og` | SEO | og:title, og:description, og:image on every page |
| `seo.sitemap` | SEO | `/sitemap.xml` is valid and its URLs answer 200 |
| `seo.jsonld` | SEO | JSON-LD parses, has schema.org `@context`/`@type`, homepage has some, `@id`s agree across pages |
| `seo.broken-links` | SEO | internal links answer < 400 |
| `seo.img-alt` | SEO | every `<img>` has an `alt` attribute |
| `geo.llms-txt` | GEO | `/llms.txt` exists and scores ≥ 70 on llmstxt.org structure, links resolve |
| `geo.robots-ai` | GEO | robots.txt lets AI search crawlers and user fetchers reach `/` (training bots are reported, not failed) |
| `geo.js-off-content` | GEO | text, `<h1>`, JSON-LD and canonical are in the HTML with JavaScript off |

Run them by hand: `node scripts/checks/run.mjs https://example.com [--area seo|geo]`.

## Project config (optional)

`siteproof.config.json` in the target project's root:

```json
{
  "hideSelectors": ["#clock", ".testimonial-carousel"],
  "previewCommand": "pnpm preview",
  "previewUrl": "http://localhost:8787",
  "buildCommand": "pnpm build",
  "runs": 5,
  "uiThreshold": 0.005,
  "pages": 15
}
```

Defaults: `preview` script if present (else `start`), port 8787 when it runs OpenNext/wrangler (else 3000), the `build`/`lint`/`typecheck` scripts when present.

**Windows + OpenNext:** OpenNext's bundler creates symlinks, which fail with `EPERM` under pnpm's default layout. Either enable Windows Developer Mode or add `node-linker=hoisted` to the project's `.npmrc` (the fixture does).

## Safety

- The audit never edits the project; `siteproof/` is ignored through `.git/info/exclude`, so the tree stays clean.
- `/siteproof:fix` refuses to start on a dirty tree and never stashes; old siteproof branches/PRs are warned about, never deleted.
- Only the `fixer` agent has Edit/Write. Hooks block edits to `.env*`, `wrangler deploy`/deploy scripts, and force pushes everywhere, and lint/TS config changes or error-suppression comments during a fix run.

## Development

```bash
npm test                 # pure decision logic, Plan, issues, PR body, routes, hooks
npm run fixture          # install + build the fixture Next.js site (test/fixture-site)
npm run test:int         # checks, measure and screenshots against the fixture on the local Workers runtime
npm run test:e2e         # the whole /siteproof:fix flow on a git copy of the fixture, fixer simulated (~30 min)
```

The e2e run exercises every outcome: a Speed Fix kept (hero LCP 12.5s → 2.5s), a no-op Speed Fix undone, a broken build undone after one repair, an unproven SEO Fix undone, a Fix that breaks a passing check found by bisect, a Fix that changes the UI found by bisect, and unticked/content Fixes filed as issues.

The fixture site has known defects: no llms.txt, AI search crawlers blocked, homepage copy rendered client-only, missing titles, invalid JSON-LD, an unoptimised 3MB hero image without alt, unused font weights, a broken link.

## Credits

siteproof builds on these projects (details and license texts in [LICENSES/](LICENSES/)):

- [metawhisp/amazing-seo-skill](https://github.com/metawhisp/amazing-seo-skill) (Apache-2.0): the SEO and GEO checks are Node ports of its `llms_txt_checker`, `robots_checker`, `js_rendering_diff`, `sitemap_validator`, `schema_graph_checker`, `broken_links_checker` and `images_audit` scripts. See [NOTICE](LICENSES/amazing-seo-skill-NOTICE).
- [Hainrixz/claude-seo-ai](https://github.com/Hainrixz/claude-seo-ai) (MIT): read-only auditors with a single-writer fixer, the Next.js fix map, the Finding schema and JSON-LD templates.
- [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) (MIT): Core Web Vitals and performance know-how.
- [mykpono/ultimate-seo-geo](https://github.com/mykpono/ultimate-seo-geo) (MIT): the audit → plan → execute flow and the AI-search/GEO reference.
- Benchmark to beat: [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo).

## License

MIT
