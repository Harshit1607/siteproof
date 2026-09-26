---
labels: [ready-for-agent]
---
## Parent

docs/PRD.md

## What to build

The PR body becomes the proof document a reviewer can trust without checking out the branch.

## Acceptance criteria

- [ ] Each Fix listed with its measured result (Target Metric change, or checks flipped)
- [ ] Before/after table: Baseline vs final (Lighthouse mobile + desktop, LCP, CLS, TBT, check results), plus prod-at-audit for context
- [ ] States "Proven on local Workers runtime"
- [ ] Screenshot proof that the UI didn't change
- [ ] Dropped Fixes listed with reason + issue link
- [ ] Still-failing unpicked checks listed with issue links

## Blocked by

- 07-speed-proof.md
- 08-ui-check.md
- 09-deferred-fix-issues-and-reaudit-linkage.md
