---
labels: [ready-for-agent]
---
## Parent

docs/PRD.md

## What to build

The GEO auditor agent and the full GEO check set in Node: llms.txt, AI crawler rules in robots.txt, and content visible without JavaScript (Playwright with JS disabled vs enabled). Runs in parallel with the other auditors and feeds GEO Fixes into the Plan.

## Acceptance criteria

- [ ] GEO checks in Node with stable check IDs: llms.txt, robots AI crawler rules, JS-off rendering diff
- [ ] Each check tested against the fixture site (blocked crawler and client-only content detected)
- [ ] No Python needed anywhere in the plugin
- [ ] GEO auditor (read-only) produces Findings; the planner produces GEO Fixes using the GEO impact rubric, each listing its proving check IDs
- [ ] SEO and GEO auditors run in parallel during the audit
- [ ] Licence notices + README credit for ported code

## Blocked by

- 01-tracer-audit-to-plan.md
