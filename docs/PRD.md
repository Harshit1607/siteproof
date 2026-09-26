---
labels: [ready-for-agent]
---

# PRD: siteproof v1

## Problem Statement

I run Next.js sites (deployed with OpenNext on Cloudflare) and want them to rank well in Google, get picked up by AI search (ChatGPT, Perplexity, Claude), and load fast. Existing SEO/GEO tools for Claude Code stop at a list of suggestions. They don't tell me which of the SEO, GEO and speed problems matters most, they don't apply the fixes, and above all they don't show that a fix helped or that it didn't break the page's look. So I either apply suggestions blindly and hope, or spend hours measuring by hand. Any suggestion I don't act on right away is lost.

## Solution

`siteproof` is a Claude Code plugin with two commands:

- `/siteproof:audit <url>` checks the live site (read-only) and writes a **Plan**: one ranked list of **Fixes** covering all three **Areas** (SEO, GEO, Speed). Everything is ticked by default, and I untick what I don't want now.
- `/siteproof:fix` applies the ticked Fixes on a fresh branch, one commit each. It gives each one **Proof** on a local preview against a **Baseline** of unmodified main: Speed Fixes must measurably improve their **Target Metric**, SEO/GEO Fixes must turn their checks from failing to passing, and screenshots must show no UI change. Any Fix that fails is undone automatically. The result is one PR with before/after numbers and screenshots, plus a GitHub issue for every **Deferred Fix**, so nothing is lost.

The promise: *fixes that are proven to work and proven not to break the UI.*

## User Stories

### Audit and Plan

1. As a site owner, I want to run one command against my prod URL, so that I get a full SEO, GEO and speed picture without setting anything up.
2. As a site owner, I want the audit to be strictly read-only, so that running it can never change my code or site.
3. As a site owner, I want SEO, GEO and speed audited in parallel, so that the audit finishes quickly.
4. As a site owner, I want all Fixes across all three Areas in one ranked list, so that I work on the most valuable thing first no matter which Area it is in.
5. As a site owner, I want each Fix scored on impact, confidence and effort with one shared scale, so that a speed Fix and an SEO Fix can be compared fairly.
6. As a site owner, I want the real evidence shown next to each Fix (e.g. "LCP −2.1s", "6 routes missing titles"), so that I understand why it ranks where it does.
7. As a site owner, I want each Fix to have exactly one Area, so that I always know what kind of change it is.
8. As a site owner, I want one problem that spans Areas split into separate Fixes (e.g. image loading vs alt text), so that I can pick them independently.
9. As a site owner, I want each Speed Fix to state its Target Metric, so that I know what it claims to improve before I approve it.
10. As a site owner, I want a risk level on each Fix, so that I can skip risky changes when I'm short on time.
11. As a site owner, I want the Plan written to a file with a checkbox per Fix, so that I can review and edit my selection calmly.
12. As a site owner, I want every Fix ticked by default, so that the common case (take everything) needs no effort.
13. As a site owner, I want chat shortcuts like "Speed only", "top 10" or "low-risk only" that update the Plan file for me, so that I don't have to untick 30 boxes by hand.
14. As a site owner, I want content rewrites listed as suggestions only, so that my brand voice is never changed automatically.
15. As a site owner, I want Plan rows that match an already-open siteproof issue to be marked, so that I know I'm picking up earlier deferred work.
16. As a site owner, I want the siteproof working folder ignored by git, so that working notes never end up in my PR.
17. As a site owner, I want the audit to show prod numbers, so that the Plan reflects what real visitors experience today.

### Fix

18. As a site owner, I want `/siteproof:fix` to refuse to start if I have uncommitted changes, so that my in-progress work is never stashed, overwritten or lost.
19. As a site owner, I want work done on a fresh branch from up-to-date main, named with the date, so that it never clashes with earlier runs.
20. As a site owner, I want a warning (not a deletion) when an older unmerged siteproof branch or PR exists, so that I decide what happens to it.
21. As a site owner, I want only ticked Fixes applied, so that I stay in control of what changes.
22. As a site owner, I want each Fix as its own commit, so that I can revert any single Fix later.
23. As a site owner, I want only one agent to be able to edit files, so that read-only auditors can't change my code by accident.
24. As a site owner, I want edits to `.env` files, `wrangler deploy` and force pushes blocked, so that siteproof can never leak secrets, push to prod, or rewrite history.
25. As a site owner, I want my project's build (plus lint and typecheck when present) run after every Fix, so that a broken change is caught right away.
26. As a site owner, I want a Fix that breaks the build to get one repair attempt and then be undone, so that one bad Fix doesn't block all the others.
27. As a site owner, I want siteproof never to loosen my lint or TypeScript config to make errors go away, so that my quality bar stays where I set it.
28. As a site owner, I want Fixes to follow Next.js conventions (Metadata API, sitemap/robots route files, `next/image`, `next/font`, script loading strategies), so that the changes look like code my team would write.

### Proof

29. As a site owner, I want a Baseline measured on a local preview of unmodified main, so that every result is compared like with like.
30. As a site owner, I want proof run locally with no Cloudflare credentials, so that I can use siteproof without deploy access.
31. As a site owner, I want Lighthouse run 5 times on mobile and on desktop with the median used, so that one noisy run can't decide a Fix's fate.
32. As a site owner, I want Speed Fixes measured one at a time, each against the previous kept step, so that every Fix's effect is attributed correctly.
33. As a site owner, I want a Speed Fix kept only if its Target Metric improves on mobile by at least 10% and above a minimum floor, so that noise isn't mistaken for improvement.
34. As a site owner, I want a Speed Fix undone if it makes any other metric worse on either device, so that no Fix trades one problem for another.
35. As a site owner, I want an SEO/GEO Fix counted as proven when the checks tied to its Findings turn from failing to passing, so that proof is exact and repeatable.
36. As a site owner, I want an SEO/GEO Fix undone if it makes any previously passing check fail, so that fixes don't cause new problems.
37. As a site owner, I want checks that already failed and that I didn't pick to be ignored for proof, so that my PR isn't blocked by work I chose to defer.
38. As a site owner, I want GEO proven with concrete checks (llms.txt, AI crawler rules in robots.txt, content visible without JavaScript), so that I get proof now rather than waiting weeks for AI crawlers.
39. As a site owner, I want SEO proven with concrete checks (valid JSON-LD, canonical, sitemap, OG tags, titles and descriptions, broken links, image audit), so that "fixed" means something checkable.
40. As a site owner, I want screenshots at 390px and 1440px compared before and after, so that I know the UI didn't change on phones or desktops.
41. As a site owner, I want screenshots taken of the homepage, one page per route type, and every page a Fix touched, so that coverage is broad without shooting every page.
42. As a site owner, I want animations turned off and fonts and images loaded before a screenshot, so that I don't get false "UI changed" alarms.
43. As a site owner, I want to list selectors for content that always changes (carousels, dates, testimonials) in config, so that those parts are hidden during comparison.
44. As a site owner, I want a UI change above a small threshold traced back to the Fix that caused it, and that Fix undone, so that the rest of the Fixes still ship.
45. As a site owner, I want the before, after and highlighted-diff images kept for a UI-change failure, so that I can judge whether the change was actually acceptable.

### Ship

46. As a site owner, I want one PR against main with all proven Fixes, so that I review and merge once.
47. As a reviewer, I want each Fix in the PR body listed with its measured result, so that I can see what each one did.
48. As a reviewer, I want a before/after table (Lighthouse mobile and desktop, LCP, CLS, TBT, check results), plus the prod numbers from the audit, so that the overall effect is obvious.
49. As a reviewer, I want the PR to state that proof ran on the local Workers runtime, so that I'm not misled about the conditions.
50. As a reviewer, I want screenshot proof in the PR, so that I can trust the UI didn't change without checking out the branch.
51. As a reviewer, I want dropped Fixes listed with their reason and a link to their issue, so that I know what was left out and why.
52. As a reviewer, I want checks that still fail listed with links, so that known remaining problems are visible.

### Deferred Fixes

53. As a site owner, I want every Fix I unticked filed as a GitHub issue, so that I can pick it up later.
54. As a site owner, I want every Fix that failed proof, broke the build or changed the UI filed as an issue with its numbers, logs or images, so that nobody retries it blindly.
55. As a site owner, I want content suggestions filed as issues, so that a writer can act on them.
56. As a site owner, I want one issue per Fix, labelled with siteproof, its Area and its reason, so that the backlog is easy to filter.
57. As a site owner, I want re-running the audit not to create duplicate issues, so that the backlog stays clean.
58. As a site owner, I want picking a previously deferred Fix to close its issue when the PR merges, so that the backlog updates itself.
59. As a site owner, I want open siteproof issues whose problem no longer exists to get a comment and be closed on the next audit, so that the backlog doesn't go stale.

### Plugin and credits

60. As a plugin user, I want siteproof to need only Node (no Python), so that installing it is simple.
61. As an open-source maintainer, I want borrowed and ported code to keep its license headers and NOTICE files, with credit in the README, so that licensing is respected.

## Implementation Decisions

- **Form:** a Claude Code plugin with two commands (audit, fix), five agents (SEO auditor, GEO auditor, Speed auditor, planner, fixer), three Next.js knowledge skills (SEO, GEO, Speed), Node scripts, and a hook config.
- **Agents:** the three auditors are read-only and run in parallel. The planner merges their Findings into one ranked Plan. The fixer is the only agent with write/edit access.
- **Domain terms** follow `CONTEXT.md`: Finding (fact), Fix (change, one commit, one Area), Plan, Area, Proof, Baseline, Target Metric, Deferred Fix.
- **Finding/Fix schema:** based on claude-seo-ai's finding schema, extended with `area`, `impact` (1–5), `effort` (S/M/L → 1/2/3), `confidence` (0.5–1), `risk`, `targetMetric` (Speed only: LCP, TBT, CLS or bytes), the IDs of the Findings each Fix addresses, and the check IDs that prove it (SEO/GEO).
- **Scoring:** impact × confidence ÷ effort. Impact uses a per-Area rubric on one shared 1–5 scale; raw numbers are shown as evidence and are not part of the maths.
- **Stable Fix key:** `<area>:<slug>`, used for issue dedup, matching Plan rows to open issues, and closing stale issues.
- **Plan file:** a Markdown checkbox list in the siteproof working folder (git-ignored). It is the source of truth for selection; chat shortcuts only edit it.
- **Modules on the Node side:**
  - *Decision logic* (pure, no I/O): scoring and ranking; Speed verdict (baseline step vs after step → keep/undo + reason); check-flip verdict (before/after check results + a Fix's check IDs → proven/not proven/caused a regression); UI verdict (diff ratio vs threshold). This is where the thresholds live: 10% relative, floors of LCP 100ms, TBT 50ms, CLS 0.02, bytes 10KB, UI 0.5% of pixels.
  - *Measure:* Lighthouse, mobile + desktop, N runs → median per metric as JSON. 5 runs for timing, 1 for bytes.
  - *Checks:* SEO and GEO pass/fail checks ported to Node from amazing-seo-skill (llms.txt, robots/AI crawlers, JS-off rendering diff, sitemap, JSON-LD graph, broken links, images, canonical, OG, title/description). Given a URL, they output JSON results keyed by check ID. JS-off rendering uses Playwright with JavaScript disabled.
  - *Screenshot:* Playwright at 390px and 1440px with animations disabled, fonts/images loaded, and configured selectors hidden; outputs images plus a diff ratio.
- **Proof environment:** the project's own local preview (OpenNext on the local Workers runtime). No Cloudflare deploy in v1. Baseline and every step are measured on the same machine in the same session.
- **Fix loop:** apply → commit → build/lint/typecheck (one repair attempt, else undo with reason `broke-build`) → for Speed, cumulative measurement and verdict (undo with `failed-proof`). SEO/GEO are verified together after all Fixes are applied. The UI check runs last; on failure, bisect the kept commits to find the culprit and undo it (`changes-ui`).
- **Git rules:** a dirty tree aborts; the branch is `siteproof/<YYYY-MM-DD>` off freshly pulled main; existing siteproof branches/PRs trigger a warning only.
- **Hooks:** block edits to `.env*`, `wrangler deploy`, and `git push --force`.
- **Output:** one PR via `gh`. Deferred Fix issues via `gh`, one per Fix, labelled `siteproof` + Area + reason (`deferred`, `failed-proof`, `broke-build`, `changes-ui`, `content`), with the Fix key embedded as an HTML comment.
- **Re-audit is the source of truth:** issues are memory only. Picking a matching Plan row links "Closes #N" in the PR; issues whose Finding has disappeared are commented on and closed.
- **Build order:** (1) skeleton + measure + audit → Plan; (2) fixer + skills + checks + fix loop with build check; (3) proof: Baseline, Speed verdicts, check flips, screenshots, auto-undo; (4) PR body + issues + dedup/close; (5) run on a real production site for the demo.

## Testing Decisions

- **Good tests check behaviour at a seam, not internals:** given inputs, check the verdict or the JSON output. Don't assert on helper calls, intermediate files or prompt wording.
- **Seam A — decision logic (pure):** JSON fixtures in, verdicts out. Cover:
  - scoring order across Areas
  - Speed keep at exactly the threshold / just below it / below the floor
  - a regression in a non-target metric on desktop only
  - bytes judged from a single run
  - check flips fail→pass (proven), fail→fail (not proven), pass→fail elsewhere (regression)
  - pre-existing failures ignored
  - UI diff ratio at and around 0.5%
  - Fix-key dedup matching
- **Seam B — scripts against a fixture site:** a tiny Next.js app with known defects (no llms.txt, AI crawler blocked, content rendered only client-side, missing titles, invalid JSON-LD, an unoptimised hero image, unused font weights), served locally. Assert that the checks report the expected check IDs as failing, that measure returns well-formed medians for both devices, and that screenshot returns a near-zero diff for identical builds and a positive diff for a deliberate CSS change.
- **Not unit-tested:** agent and prompt behaviour, git/`gh` orchestration. These are covered by the Phase 5 run on a real production site, with the before/after recorded.
- **Prior art:** none in this repo yet (it has no code). Follow the test styles of the upstream sources where they exist.

## Out of Scope

- Frameworks other than Next.js
- Proof on a real Cloudflare preview URL (`wrangler versions upload`) and edge-only fixes such as cache headers and compression
- Multiple PRs (per Area) or stacked PRs
- Applying Fixes straight from issues (`/siteproof:fix #42`)
- Applying content rewrites (they are only suggested and filed as issues)
- Scheduled re-audits and score-drop alerts
- Tracking whether AI assistants cite the site
- Running across several client sites or a scoreboard
- Real-user INP (lab TBT is used as the stand-in)

## Further Notes

- Pitch for the demo: rank all three Areas in one list, prove every Fix, guarantee no UI change, and lose nothing (Deferred Fixes become issues).
- Benchmark to beat: AgriciDaniel/claude-seo.
- Reused sources: claude-seo-ai (MIT), amazing-seo-skill (Apache-2.0, ported), web-quality-skills (MIT), ultimate-seo-geo (MIT). Headers, NOTICE files and README credits are required.
- This PRD is stored locally because the project has no git repo or GitHub remote yet. File it as an issue labelled `ready-for-agent` once the repo exists.
