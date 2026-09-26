---
labels: [ready-for-agent]
---
## Parent

docs/PRD.md

## What to build

The thinnest end-to-end path through `/siteproof:audit <url>`: install the plugin, point it at a URL, get a Plan file with a real ranked Fix in it. Use a single GEO check (llms.txt present) as the only source of Findings. This slice sets up everything later slices build on: plugin skeleton, Finding/Fix schema, pure scoring logic, the fixture Next.js site with known defects, and the Plan file format.

## Acceptance criteria

- [ ] Plugin installs in Claude Code and exposes `/siteproof:audit <url>`
- [ ] Audit is read-only: auditors have no write/edit tools
- [ ] Fixture Next.js site exists with known defects (no llms.txt, AI crawler blocked, client-only content, missing titles, invalid JSON-LD, unoptimised hero image, unused font weights) and runs locally
- [ ] llms.txt check returns JSON results keyed by check ID; running it on the fixture reports it failing
- [ ] Finding/Fix schema covers area, impact 1–5, effort S/M/L, confidence, risk, targetMetric, Finding IDs, check IDs, and a stable Fix key `<area>:<slug>`
- [ ] Scoring logic (impact × confidence ÷ effort) is pure and has fixture tests for ranking order
- [ ] Audit writes the Plan to the siteproof working folder as a ranked checkbox list, all ticked, each row showing evidence
- [ ] Working folder added to the target repo's `.gitignore`

## Blocked by

None - can start immediately
