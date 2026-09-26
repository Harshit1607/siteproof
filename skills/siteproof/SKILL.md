---
name: siteproof
description: Audit a live Next.js site for SEO, GEO (AI search visibility) and speed, rank every fix in one Plan, then apply the chosen fixes on a new branch, prove each one on a local preview (Lighthouse, SEO/GEO checks, screenshots) against unmodified main, and open one PR; anything not shipped becomes a GitHub issue. Use when the user asks to audit, improve or fix SEO, GEO/AI-search visibility, Core Web Vitals or page speed of a Next.js site, or says "siteproof audit <url>" or "siteproof fix".
license: MIT
compatibility: Needs Node 20+, npm, git and network access; gh (logged in) to open the PR and file issues. Next.js projects (App Router first), including OpenNext on Cloudflare.
---

# siteproof

Fixes that are proven to work and proven not to break the UI. Two workflows:

| Workflow | When | Instructions |
|---|---|---|
| **audit** `<prod url>` | Read-only. Audits SEO, GEO and speed and writes a ranked, all-ticked Plan to `siteproof/plan.md`. | `workflows/audit.md` |
| **fix** | Applies the ticked Fixes on `siteproof/<date>`, proves each one, opens one PR, files the rest as issues. Needs a Plan. | `workflows/fix.md` |

Pick the workflow from the request. If it's unclear, or an audit has no URL, ask.

## 1. Find this skill's folder

`SKILL_DIR` is the folder that holds this SKILL.md. Paths below are relative to it; pass absolute paths to every command. Take the first that works:

1. `node -e "console.log(process.env.SITEPROOF_SKILL_DIR || '')"`. The pi and omp extension sets this.
2. The location your agent showed when it loaded this skill (a base directory or the SKILL.md path).
3. omp: `realpath skill://siteproof`.
4. Search for a `siteproof` folder that holds both `SKILL.md` and `scripts/setup.mjs`: the project's `.agents/skills`, then user skill and plugin folders such as `~/.agents`, `~/.claude`, `~/.codex`, `~/.copilot`, `~/.gemini`, `~/.cursor`, `~/.omp`, `~/.pi`.

## 2. Install dependencies (every run, before anything else)

```
node "<SKILL_DIR>/scripts/setup.mjs"
```

It prints one line. The first run on a machine installs Lighthouse, Playwright and Chromium (1–3 minutes: use a 10-minute timeout); later runs return at once. If it exits 1, show its line to the user and stop.

## 3. Roles

The workflows hand work to five roles. Each has a brief in `roles/`:

| Role | Brief | Edits files? |
|---|---|---|
| SEO auditor | `roles/seo-auditor.md` | no |
| GEO auditor | `roles/geo-auditor.md` | no |
| Speed auditor | `roles/speed-auditor.md` | no |
| Planner | `roles/planner.md` | no |
| Fixer | `roles/fixer.md` | yes: the only role that edits project files |

Each role gets an **envelope**: the fields its brief lists, always including `SKILL: <SKILL_DIR>` and `SCRIPTS: <SKILL_DIR>/scripts` as absolute paths.

- **If your agent can start subagents**, run each role as one. Where siteproof's agents are installed, use them: `siteproof:seo-auditor`, `siteproof:fixer`, … in Claude Code and Copilot; `seo-auditor`, `fixer`, … in omp. Otherwise start a general-purpose subagent whose task is: "Read `<SKILL_DIR>/roles/<role>.md` and follow it exactly", followed by the envelope. Give the auditors and the planner read-only tools where you can choose them.
- **If it can't**, play the role yourself: read the brief, follow it exactly, produce exactly its output, then carry on with the workflow. Run the three auditors one after another.
- **Follow-ups** ("send it back to the fixer") go to the same subagent if you can message it. Otherwise start the role again with the original envelope plus the follow-up.

## 4. Rules for every step

- Run scripts from the project root: `node "<SKILL_DIR>/scripts/<script>"`.
- The audit never edits the project. siteproof only writes inside `./siteproof/`, which is ignored through `.git/info/exclude`.
- Never deploy, force-push, stash, reset or discard the user's work, and never edit `.env*` files.
- During a fix, never change lint/TypeScript config or add `@ts-ignore`, `@ts-nocheck`, `eslint-disable`, `ignoreBuildErrors` or `ignoreDuringBuilds` to get a build through. `proof.mjs build` rejects any Fix commit that does. Some agents also block these edits as they happen.

## 5. Run the workflow

Read `workflows/audit.md` or `workflows/fix.md` and follow it step by step. The roles use `references/nextjs-seo.md`, `references/nextjs-geo.md` and `references/nextjs-speed.md` (Next.js conventions) and `schema/` (the Finding and Fix formats).
