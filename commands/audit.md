---
description: Audit a Next.js site for SEO, GEO and speed (read-only) and write a ranked Plan to siteproof/plan.md
argument-hint: <prod url>
---

# /siteproof:audit

Audit **$ARGUMENTS** (the live prod URL) and write one ranked **Plan** of **Fixes** across SEO, GEO and Speed. Terms: a **Finding** is a fact an auditor observed; a **Fix** is one change (one commit, one Area) addressing ≥1 Finding.

Scripts live in `${CLAUDE_PLUGIN_ROOT}/scripts`. Below, `S` means that absolute path. Run every script from the project root (the current directory), always as `node "S/<script>"`.

## Rules

- **Read-only for the project.** You and every agent in this command never edit project files, never commit, never deploy. The only files written are inside `./siteproof/` (git-ignored through `.git/info/exclude`, so the tree stays clean).
- If `$ARGUMENTS` is empty, ask for the prod URL and stop.

## Steps

1. **Set up.** Run `node "S/plan.mjs" init`. Write `siteproof/audit/meta.json` as `{"url": "<the url>", "at": "<ISO time>"}`. Run `node "S/ship.mjs" keys > siteproof/audit/open-issues.json` (prints `{}` and a note when there's no GitHub remote; that's fine).

2. **Audit in parallel.** In ONE message, launch these three agents at once (Agent tool). Give each the same envelope, filled in with absolute paths:
   ```
   SCRIPTS: <S>
   URL: <the url>
   PROJECT: <absolute project root>
   OUT: <absolute project root>/siteproof/audit
   ```
   - `siteproof:seo-auditor`
   - `siteproof:geo-auditor`
   - `siteproof:speed-auditor`

   Each returns a JSON array of Findings (schema: `${CLAUDE_PLUGIN_ROOT}/schema/finding.schema.json`). Save each array verbatim to `siteproof/audit/seo-findings.json`, `geo-findings.json`, `speed-findings.json`.

3. **Plan.** Launch `siteproof:planner` with:
   ```
   FINDINGS: siteproof/audit/{seo,geo,speed}-findings.json (absolute paths)
   CHECKS: siteproof/audit/checks-seo.json, siteproof/audit/checks-geo.json
   PROD: siteproof/audit/prod-scores.json
   OPEN_ISSUES: siteproof/audit/open-issues.json
   SCHEMA: ${CLAUDE_PLUGIN_ROOT}/schema/fix.schema.json
   ```
   It returns a JSON array of Fixes. Save it to `siteproof/fixes.json`, then run `node "S/plan.mjs" validate`. If it reports errors, send them back to the planner (same agent, SendMessage) and save its corrected array; repeat until it validates.

4. **Link to earlier deferred work.** Run `node "S/ship.mjs" sync`. It marks Fixes that match an open siteproof issue and comments on + closes open siteproof issues whose problem is gone. (Skipped automatically without a GitHub remote.)

5. **Write the Plan.** Run `node "S/plan.mjs" render --url "<the url>"`. Read `siteproof/plan.md`.

6. **Report.** Show a compact table of the ranked Fixes (#, Area, Fix, Why, Impact, Effort, Risk), the prod numbers, how many content suggestions there are, and which open issues were matched or closed. Then tell the user:
   - Everything is ticked. Untick rows in `siteproof/plan.md`, or say a shortcut: **"Speed only"**, **"SEO only"**, **"GEO only"**, **"top 10"**, **"low-risk only"**, **"all"**, **"none"** (filters can combine, e.g. "Speed only top 3").
   - Then run `/siteproof:fix`.

## Shortcuts (for the rest of this conversation)

When the user replies with a selection shortcut like those above, run `node "S/plan.mjs" shortcut "<their phrase>"` and report its one-line result. The Plan file stays the source of truth: never keep selection state anywhere else, and never edit ticks by hand when a shortcut covers it.
