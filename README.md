# siteproof

An agent skill (plus a plugin for agents that support plugins) that audits a **Next.js** site across **SEO, GEO and speed**, ranks every fix in one list, applies the ones you pick, **proves** each one on a local preview, and opens **one PR**. Anything not shipped becomes a GitHub issue. It works in Claude Code, Codex, GitHub Copilot, omp, pi, and any agent that reads [Agent Skills](https://agentskills.io).

*Fixes that are proven to work and proven not to break the UI.*

| Workflow | Ask for it | What it does |
|---|---|---|
| **audit** | `/siteproof:audit <prod url>`, or "siteproof audit https://…" | Read-only. Runs the SEO, GEO and speed auditors and writes a ranked, all-ticked Plan to `siteproof/plan.md`. |
| **fix** | `/siteproof:fix`, or "siteproof fix" | Applies the ticked Fixes on `siteproof/<date>`, one commit each, proves each against a Baseline of unmodified main, opens one PR, and files every Deferred Fix as an issue. |

The slash commands exist where the agent has plugin commands (Claude Code, Copilot, omp). Everywhere else, ask in plain words or invoke the `siteproof` skill.

Terms (Finding, Fix, Plan, Area, Proof, Baseline, Target Metric, Deferred Fix) are defined in [CONTEXT.md](CONTEXT.md). Design: [PLAN.md](PLAN.md), [docs/PRD.md](docs/PRD.md).

## Install

| Agent | Install | You get |
|---|---|---|
| Claude Code | `/plugin marketplace add Harshit1607/siteproof`<br>`/plugin install siteproof@siteproof` | commands, agents, skill, hooks |
| Codex | `codex plugin marketplace add Harshit1607/siteproof`<br>`codex plugin add siteproof@siteproof`<br>then trust its hooks in `/hooks` | skill (`$siteproof:siteproof`), hooks |
| GitHub Copilot CLI | `copilot plugin install Harshit1607/siteproof` | commands, agents, skill, hooks |
| omp | `omp plugin marketplace add Harshit1607/siteproof`<br>`omp plugin install siteproof@siteproof` | commands, agents, skill, guard extension |
| pi | `pi install git:github.com/Harshit1607/siteproof` | skill (`/skill:siteproof`), guard extension |
| Any agent that reads Agent Skills: Cursor, OpenCode, Gemini CLI, Antigravity, Windsurf, Copilot in VS Code, … | `npx skills add Harshit1607/siteproof`<br>(`-g` for every project, `-a <agent>` to choose agents) | skill |

Restart the agent after installing. The skill is self-contained (`skills/siteproof/`: workflows, role briefs, Next.js references, Node scripts), so every route gets the same audit and fix. The first run on a machine installs Lighthouse, Playwright and Chromium (~1–3 min) into your OS cache folder (`%LOCALAPPDATA%\siteproof`, `~/Library/Caches/siteproof` or `~/.cache/siteproof`; override with `SITEPROOF_CACHE`). Every agent on the machine shares that copy, and it's only reinstalled when siteproof's lockfile changes.

Agents that can run subagents get one per role (auditors, planner, fixer). Agents that can't run them play each role in turn from the same briefs.

From a clone: `claude --plugin-dir /path/to/siteproof`, `omp plugin marketplace add /path/to/siteproof`, or `npx skills add /path/to/siteproof`.

Needs Node 20+, npm, git, and Chrome/Chromium (Lighthouse uses installed Chrome, falling back to Playwright's). No Python. `gh` (logged in) is only needed to file issues and open the PR; without a GitHub remote siteproof runs dry and writes `siteproof/pr-body.md` and `siteproof/issues/*.md` instead.

## How it proves things

- **Baseline:** the project's own local preview of unmodified main (OpenNext projects: `opennextjs-cloudflare preview`, the local Workers runtime, no Cloudflare credentials). Lighthouse ×5 mobile + desktop (median; bytes from one run), all checks, screenshots. Every Proof compares against this, on the same machine.
- **Speed Fixes** are applied one at a time and measured cumulatively. Kept only if the Target Metric improves on mobile by ≥ max(10%, floor, run-to-run spread) — floors LCP 100ms, TBT 50ms, CLS 0.02, bytes 10KB; the spread is the widest range of the two steps' own runs, so machine jitter never counts as proof — and no other metric on either device gets worse by the same margin. Otherwise undone (`failed-proof`).
- **SEO/GEO Fixes** are proven together: each Fix's check IDs must flip fail → pass, and no passing check may start failing (the culprit is found by bisecting and undone). Pre-existing failures nobody picked are ignored and listed in the PR.
- **UI check:** homepage, one page per route type and every page a Fix touched, at 390px and 1440px, animations off, fonts/images loaded, `hideSelectors` hidden. More than 0.5% of pixels different → bisect to the Fix, undo it (`changes-ui`, with before/after/diff images), ship the rest.
- **Build check** after every Fix (siteproof's rules on the commit, then build + lint + typecheck when present): one repair attempt, then undo (`broke-build`, with the log). Lint/TS config is never loosened (see Safety).

All thresholds live in [`skills/siteproof/scripts/lib/decide.mjs`](skills/siteproof/scripts/lib/decide.mjs).

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

Run them by hand: `node skills/siteproof/scripts/checks/run.mjs https://example.com [--area seo|geo]` (after `npm run setup`).

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
- The fix refuses to start on a dirty tree and never stashes; old siteproof branches/PRs are warned about, never deleted.
- Only the fixer role edits project files. siteproof's own scripts never deploy and never force-push; `ship.mjs pr` pushes its branch once, normally.
- **In every agent:** `proof.mjs build` checks each Fix commit before building it. A commit that touches `.env*` or lint/TypeScript config, or adds `@ts-ignore`/`@ts-nocheck`/`@ts-expect-error`/`eslint-disable`/`ignoreBuildErrors`/`ignoreDuringBuilds`, fails the build step and gets one repair before it's undone.
- **Where the agent has hooks,** tool calls are also blocked before they run: `.env*` edits and writes, `wrangler deploy`/deploy scripts and force pushes always, lint/TS config edits and suppressions during a fix run. Claude Code, Codex and Copilot run [`hooks/guard.mjs`](hooks/guard.mjs); omp and pi load [`extensions/siteproof.ts`](extensions/siteproof.ts). Both use the rules in [`skills/siteproof/scripts/lib/rules.mjs`](skills/siteproof/scripts/lib/rules.mjs), the same ones the build step applies.

## Development

```bash
npm run setup            # link the skill's dependencies (Lighthouse, Playwright + Chromium) from the shared cache
npm test                 # pure decision logic, Plan, issues, PR body, routes, rules and hooks, setup
npm run fixture          # install + build the fixture Next.js site (test/fixture-site)
npm run test:int         # checks, measure and screenshots against the fixture on the local Workers runtime
npm run test:e2e         # the whole fix flow on a git copy of the fixture, fixer simulated (~30 min)
```

Layout: `skills/siteproof/` is the whole product (SKILL.md, `workflows/`, `roles/`, `references/`, `schema/`, `scripts/`, and its own `package.json`). The rest is packaging: `.claude-plugin/` (the marketplace that Claude Code, Codex, Copilot and omp read), `commands/` and `agents/` (thin wrappers pointing at the skill), `hooks/` (Claude-format hooks), `extensions/` and the root `package.json` `pi` key (pi and omp).

Release: bump `version` in `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `package.json` and `skills/siteproof/package.json`. Codex and omp only reinstall a plugin when its version changes.

The e2e run exercises every outcome: a Speed Fix kept (hero LCP 12.5s → 2.5s), a no-op Speed Fix undone, a broken build undone after one repair, an unproven SEO Fix undone, a Fix that breaks a passing check found by bisect, a Fix that changes the UI found by bisect, and unticked/content Fixes filed as issues.

The fixture site has known defects: no llms.txt, AI search crawlers blocked, homepage copy rendered client-only, missing titles, invalid JSON-LD, an unoptimised 3MB hero image without alt, unused font weights, a broken link.

## Credits

siteproof builds on these projects (details and license texts in [skills/siteproof/LICENSES/](skills/siteproof/LICENSES/), shipped inside the skill so every install carries them):

- [metawhisp/amazing-seo-skill](https://github.com/metawhisp/amazing-seo-skill) (Apache-2.0): the SEO and GEO checks are Node ports of its `llms_txt_checker`, `robots_checker`, `js_rendering_diff`, `sitemap_validator`, `schema_graph_checker`, `broken_links_checker` and `images_audit` scripts. See [NOTICE](skills/siteproof/LICENSES/amazing-seo-skill-NOTICE).
- [Hainrixz/claude-seo-ai](https://github.com/Hainrixz/claude-seo-ai) (MIT): read-only auditors with a single-writer fixer, the Next.js fix map, the Finding schema and JSON-LD templates.
- [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) (MIT): Core Web Vitals and performance know-how.
- [mykpono/ultimate-seo-geo](https://github.com/mykpono/ultimate-seo-geo) (MIT): the audit → plan → execute flow and the AI-search/GEO reference.
- Benchmark to beat: [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo).

## License

MIT
