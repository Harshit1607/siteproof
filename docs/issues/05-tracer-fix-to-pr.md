---
labels: [ready-for-agent]
---
## Parent

docs/PRD.md

## What to build

The thinnest end-to-end path through `/siteproof:fix`: read the ticked Plan, apply one or more SEO Fixes with the fixer agent, commit each, check the build, and open a single PR with a minimal body. No Proof yet. Includes git safety, hooks, and the nextjs-seo skill.

## Acceptance criteria

- [ ] Dirty working tree → stop with a clear message; never stash for the user
- [ ] Pulls main and creates `siteproof/<YYYY-MM-DD>`; an existing unmerged siteproof branch/PR triggers a warning, never a deletion
- [ ] Only ticked Fixes are applied; only the fixer agent can edit files
- [ ] One commit per Fix
- [ ] After each Fix: project build (+ lint/typecheck if present). Failure → one repair attempt → still failing → undo commit, Fix recorded as `broke-build` with the error log
- [ ] Lint/TS config is never changed to hide errors
- [ ] Hooks block edits to `.env*`, `wrangler deploy`, and `git push --force`
- [ ] nextjs-seo skill guides Fixes toward the Metadata API, sitemap/robots route files and JSON-LD
- [ ] One PR against main opened via `gh`, listing the applied Fixes
- [ ] Verified end to end on a git copy of the fixture site

## Blocked by

- 02-seo-auditor-and-checks.md
