---
labels: [ready-for-agent]
---
## Parent

docs/PRD.md

## What to build

Nothing gets lost. Every Deferred Fix (unticked, `failed-proof`, `broke-build`, `changes-ui`, `content`) becomes one GitHub issue via `gh`. On a later audit, Plan rows that match an open issue are marked; picking one adds "Closes #N" to the PR; open siteproof issues whose Finding no longer exists get a comment and are closed.

## Acceptance criteria

- [ ] One issue per Deferred Fix, labelled `siteproof` + Area + reason
- [ ] Issue body embeds the Fix key as an HTML comment, plus numbers/logs/images where relevant
- [ ] Re-running doesn't create duplicates (dedup by Fix key; matching logic has fixture tests)
- [ ] Audit marks Plan rows that match open issues
- [ ] PR includes "Closes #N" for picked Fixes that were previously deferred
- [ ] Stale issues are commented on and closed on the next audit

## Blocked by

- 04-speed-auditor-ranking-and-plan-shaping.md
- 05-tracer-fix-to-pr.md
