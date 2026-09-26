# siteproof: v1 plan

A Claude Code plugin that audits a Next.js site, ranks fixes across **SEO, GEO and speed**, applies the ones the user picks, **proves** each one on a local preview, and opens **one PR**. Everything not shipped becomes a GitHub issue to pick up later.

- **Stack (v1):** Next.js only (primary target: Next.js + OpenNext on Cloudflare)
- **Form:** Claude Code plugin
- **First test site:** a real production Next.js site
- **Name:** `siteproof` (working name)
- **Terms:** see `CONTEXT.md` (Finding, Fix, Plan, Area, Proof, Baseline, Target Metric, Deferred Fix)

---

## Why this beats existing tools

Existing SEO/GEO skills (claude-seo, claude-seo-ai, ultimate-seo-geo, amazing-seo-skill) stop at "here are fixes". None of them:

1. Rank SEO, GEO and speed in one list by impact
2. **Prove** each fix: re-measure and keep a fix only if it helps
3. **Guarantee no UI change** by comparing screenshots before vs after
4. Track everything not shipped as issues, so nothing is lost

Points 2 and 3 are the pitch: *fixes that are proven to work and proven not to break the UI.*

---

## Commands

| Command | What it does |
|---|---|
| `/siteproof:audit <url>` | Read-only. Measures prod and writes the ranked Plan to `siteproof/plan.md`. |
| `/siteproof:fix` | Applies ticked Fixes on one branch, proves each, opens one PR, files Deferred Fix issues. |

---

## Structure

```
siteproof/
├─ skills/siteproof/          the whole product, one Agent Skill (works in any agent that reads skills)
│  ├─ SKILL.md               finds its folder, runs setup, explains roles, routes to a workflow
│  ├─ workflows/             audit.md, fix.md
│  ├─ roles/
│  │  ├─ seo-auditor.md      read-only  ─┐
│  │  ├─ geo-auditor.md      read-only   ├─ run in parallel where the agent has subagents
│  │  ├─ speed-auditor.md    read-only  ─┘
│  │  ├─ planner.md          merges the three audits → one ranked Plan
│  │  └─ fixer.md            the ONLY role allowed to edit files
│  ├─ references/            nextjs-seo.md, nextjs-geo.md, nextjs-speed.md
│  ├─ schema/                Finding and Fix formats
│  ├─ scripts/               all Node, no Python
│  │  ├─ setup.mjs           installs deps once per machine (shared cache), links them here
│  │  ├─ measure.mjs         Lighthouse on mobile and desktop → scores.json
│  │  ├─ screenshot.mjs      Playwright captures at 390px and 1440px, then compare
│  │  ├─ checks/             pass/fail SEO and GEO checks (ported from amazing-seo-skill)
│  │  └─ lib/rules.mjs       .env / deploy / force-push / lint-config / suppression rules
│  └─ package.json           the scripts' npm dependencies
├─ .claude-plugin/           marketplace + plugin manifest (Claude Code, Codex, Copilot, omp)
├─ commands/                 audit.md, fix.md: thin wrappers → the skill's workflows
├─ agents/                   thin wrappers → the skill's role briefs
├─ hooks/                    hooks.json + guard.mjs: Claude-format hooks (Claude Code, Codex, Copilot)
├─ extensions/siteproof.ts   the same guard + setup for pi and omp (root package.json "pi" key)
└─ skills/siteproof/LICENSES/ MIT and Apache notices for borrowed/ported code (inside the skill, so every install carries them)
```

---

## What gets reused from which repo

| Our piece | Taken from | License |
|---|---|---|
| Read-only auditors + single-writer fixer | `Hainrixz/claude-seo-ai`: `agents/technical-auditor.md`, `seo-fixer-writer.md`, `schema-generator.md` | MIT |
| Next.js-specific fix rules | `claude-seo-ai`: `references/platforms/nextjs.md`, `schema/jsonld-templates/*` | MIT |
| Structured findings format | `claude-seo-ai`: `schema/finding.schema.json` (add `impact`, `effort`, `confidence`, `area`, `targetMetric`) | MIT |
| GEO checks (ported to Node) | `metawhisp/amazing-seo-skill`: `llms_txt_checker.py`, `robots_checker.py`, `js_rendering_diff.py` | Apache-2.0 |
| SEO checks (ported to Node) | `amazing-seo-skill`: `sitemap_validator.py`, `schema_graph_checker.py`, `broken_links_checker.py`, `images_audit.py` | Apache-2.0 |
| Speed fixing know-how | `addyosmani/web-quality-skills`: `core-web-vitals/` (LCP, CLS, INP), `performance/` | MIT |
| Audit → plan → execute flow, GEO reference | `mykpono/ultimate-seo-geo`: `SKILL.md`, `references/ai-search-geo.md`, `agents/PARALLEL-AUDIT.md` | MIT |
| Benchmark to beat | `AgriciDaniel/claude-seo` (17k stars) | MIT |

Copied files keep their original license headers. Ported Apache-2.0 code keeps its copyright and NOTICE in `skills/siteproof/LICENSES/`. Every source gets credit in the README.

---

## Step 1: Audit → Plan (`/siteproof:audit`)

- Auditors produce **Findings** (facts). Planner turns them into **Fixes** (changes). One Fix addresses ≥1 Finding and has exactly **one Area**, picked by primary intent (e.g. hero `next/image` → Speed; its missing `alt` is a separate SEO Fix).
- Score = **impact × confidence ÷ effort**:
  - Impact 1–5, same scale for every Area, with a rubric per Area (Speed 5 = main content >1s faster on mobile; SEO 5 = key pages missing titles / not indexable; GEO 5 = AI crawlers blocked or content invisible without JS).
  - Effort S/M/L = 1/2/3. Confidence 0.5–1.
  - Real numbers (e.g. "LCP −2.1s") shown as the reason, not used in the maths.
- Each Speed Fix declares its **Target Metric** (LCP, TBT, CLS or bytes).
- Plan written to `siteproof/plan.md` as a ranked checkbox list, all ticked by default. User unticks in the file, or uses chat shortcuts ("Speed only", "top 10", "low-risk only") that tick the file for them.
- Rows matching an open siteproof issue are marked, so selecting them closes it.
- `siteproof/` is added to `.gitignore`, never committed.

```
#  Area   Fix                                        Why            Impact Effort Risk
1  Speed  Hero image → next/image priority + AVIF    LCP −2.1s      5      S      low
2  SEO    Missing <title>/description on 6 routes    6 key pages    5      S      none
3  GEO    Home page content only renders client-side invisible w/o JS 5    M      med
4  Speed  3 unused font weights                      −180KB         2      S      low
```

## Step 2: Fix + Prove (`/siteproof:fix`)

**Git setup**
- Uncommitted changes → stop, ask the user to commit/stash. Never stash for them.
- `git pull` main, branch `siteproof/<YYYY-MM-DD>`.
- Existing unmerged `siteproof/*` branch or PR → warn, don't delete.

**Baseline**
- Build and run the local preview (`pnpm preview`, local Workers runtime) of unmodified main.
- Measure: Lighthouse mobile + desktop, 5 runs → median (bytes: 1 run). Run SEO/GEO checks. Take screenshots.
- All Proof compares against this Baseline, never prod. Before/after are on the same machine, so machine speed cancels out.

**Per Fix (one commit each)**
1. Fixer applies the Fix and commits.
2. Run the project's `build` (+ `lint`/typecheck if present). Fails → one repair attempt → still failing → undo commit, Deferred Fix (`broke-build`, with error log). Never edit lint/TS config to hide errors.
3. **Speed Fix:** re-measure cumulatively (compared with the previous kept step). Keep only if the Target Metric median on mobile improves by ≥ max(10%, floor) — floors: LCP 100ms, TBT 50ms, CLS 0.02, bytes 10KB — and no other metric gets worse by the same margin on either device. Otherwise undo, Deferred Fix (`failed-proof`, with numbers).
4. **SEO/GEO Fixes:** proven together after all are applied. A Fix is proven if checks tied to its Findings flip fail → pass and no other check flips pass → fail. Pre-existing failures nobody picked are ignored and listed in the PR.

**UI check** (after all Fixes)
- Pages: homepage + one page per route type (from sitemap) + every page a Fix touched. 390px and 1440px.
- Before capture: disable animations, wait for fonts/images, hide user-listed changing elements (selectors in config).
- >~0.5% pixels differ → find the Fix responsible (bisect only on failure), undo it, Deferred Fix (`changes-ui`, with before/after/diff images).

## Step 3: Ship (end of `/siteproof:fix`)

**One PR against main.** Body contains:
- Each Fix with its measured result
- Before/after table: Baseline vs after (Lighthouse mobile + desktop, LCP, CLS, TBT, pass/fail checks), plus prod-at-audit for context
- "Proven on local Workers runtime"
- What was dropped and why (links to issues)
- Still-failing checks nobody picked
- Screenshot proof the UI didn't change

**Deferred Fix issues** (GitHub Issues via `gh`), one per Fix, labelled `siteproof` + Area + reason (`deferred` / `failed-proof` / `broke-build` / `changes-ui` / `content`). Body includes a stable key (`<!-- siteproof:<area>:<slug> -->`) for dedup, plus measured numbers where relevant. On each audit, open siteproof issues whose Finding no longer exists get a comment and are closed.

---

## Build order

| Phase | Deliverable | Time |
|---|---|---|
| 1 | Plugin skeleton + `measure.mjs` + `/audit` producing the ranked Plan (no fixes) | 1–2 days |
| 2 | `fixer` + three Next.js skills + Node checks + `/fix` applying on one branch with build check | 2 days |
| 3 | Proof: Baseline, per-Fix Speed measurement, SEO/GEO check flips, screenshot compare, auto-undo | 2 days |
| 4 | PR body + Deferred Fix issues + dedup/close | 1 day |
| 5 | Run on a real production site, record before/after for the demo | 1 day |

Phase 1 alone is demo-able: "here's what's wrong with our site, ranked."

---

## Risks

| Risk | Mitigation |
|---|---|
| Lighthouse scores vary between runs | 5 runs, median, per-metric threshold before a Fix counts |
| Local preview isn't Cloudflare's edge | Proof compares before vs after on the same machine; edge-only fixes (cache headers) are out of scope for v1 |
| Screenshot false alarms (carousels, dates, font rendering) | Disable animations, wait for load, user-configured hidden selectors, 0.5% threshold |
| GEO results only show up in weeks, once AI crawlers revisit | v1 proves GEO with pass/fail checks; LLM-citation tracking comes later |
| Content rewrites can change the brand voice | v1 only fixes structure and metadata; content changes become `content` issues, never applied |

---

## Later (not v1)

- Proof on a real Cloudflare preview URL (`wrangler versions upload`) for edge-level fixes
- `/siteproof:fix #42 #57`: apply straight from issues
- `/siteproof:watch`: weekly re-audit, alert when scores drop
- Tracking whether ChatGPT / Perplexity / Claude cite the site (from `amazing-seo-skill`)
- Frameworks beyond Next.js
- Run across many sites with a scoreboard
