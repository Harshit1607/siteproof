---
labels: [ready-for-agent]
---
## Parent

docs/PRD.md

## What to build

The SEO auditor agent and the full SEO check set, ported to Node from amazing-seo-skill, feed SEO Fixes into the Plan. Running the audit on the fixture site produces ranked SEO rows with evidence.

## Acceptance criteria

- [ ] SEO checks in Node: title/description, canonical, OG tags, sitemap validity, JSON-LD graph validity, broken links, image audit, each with a stable check ID
- [ ] Each check tested against the fixture site: expected failures reported, passing pages pass
- [ ] SEO auditor (read-only) turns check results + Next.js knowledge into Findings; the planner turns them into SEO Fixes using the SEO impact rubric
- [ ] Each SEO Fix lists the check IDs that will prove it
- [ ] Ported Apache-2.0 code keeps copyright + NOTICE in the licences folder; README credits the source

## Blocked by

- 01-tracer-audit-to-plan.md
