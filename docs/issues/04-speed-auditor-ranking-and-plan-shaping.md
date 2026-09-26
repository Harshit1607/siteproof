---
labels: [ready-for-agent]
---
## Parent

docs/PRD.md

## What to build

Speed joins the audit and the Plan becomes a finished document the user can shape. A measure script runs Lighthouse on prod (mobile + desktop, median); the Speed auditor produces Speed Fixes, each with a Target Metric. All three Areas are ranked in one list. The planner enforces one Area per Fix (splitting cross-Area problems), lists content rewrites as suggestions only, and chat shortcuts ("Speed only", "top 10", "low-risk only") tick or untick the Plan file.

## Acceptance criteria

- [ ] Measure script: Lighthouse mobile + desktop, N runs → median per metric (LCP, TBT, CLS, bytes, score) as JSON; 1 run for bytes
- [ ] Measure tested against the fixture site: well-formed medians for both devices
- [ ] Speed auditor (read-only) produces Speed Fixes, each with a Target Metric (LCP, TBT, CLS or bytes) and a risk level
- [ ] Audit shows prod numbers as evidence
- [ ] One ranked Plan across SEO, GEO and Speed; ranking test covers mixed Areas
- [ ] A cross-Area problem (e.g. hero image loading + missing alt) becomes separate Fixes, one Area each
- [ ] Content rewrites appear as suggestions that can't be applied
- [ ] Chat shortcuts edit the Plan file; the file stays the source of truth

## Blocked by

- 01-tracer-audit-to-plan.md
