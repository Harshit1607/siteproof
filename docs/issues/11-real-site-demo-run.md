---
labels: [needs-human]
---
## Parent

docs/PRD.md

## What to build

Run siteproof end to end on a real production Next.js site and record before/after results for the demo. Requires a human: repo access, reviewing the Plan, judging the PR.

## Acceptance criteria

- [ ] `/siteproof:audit` on the prod URL produces a sensible ranked Plan
- [ ] `/siteproof:fix` produces a PR with proven Fixes and Deferred Fix issues
- [ ] Any agent or prompt misbehaviour found is filed as a new issue
- [ ] Before/after numbers and screenshots recorded for the demo

## Blocked by

- 10-full-pr-body.md
