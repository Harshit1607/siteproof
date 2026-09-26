---
labels: [ready-for-agent]
---
## Parent

docs/PRD.md

## What to build

SEO and GEO Fixes get Proof. Before applying anything, build and run the local preview of unmodified main and record the Baseline check results. After all SEO/GEO Fixes are applied, re-run the checks on the local preview. A Fix is proven when its check IDs go from fail to pass; a Fix that isn't proven, or that breaks a passing check, is undone. Includes the nextjs-geo skill.

## Acceptance criteria

- [ ] Baseline taken on the local preview (local Workers runtime) of unmodified main; no Cloudflare credentials needed
- [ ] Check-flip verdict is pure logic with fixture tests: fail→pass proven; fail→fail not proven; any pass→fail elsewhere is a regression; unpicked pre-existing failures ignored
- [ ] Unproven or regressing Fixes are undone and recorded as `failed-proof`
- [ ] The regressing Fix is identified when several Fixes are applied
- [ ] nextjs-geo skill guides llms.txt, AI crawler rules and server-rendered content
- [ ] PR lists each SEO/GEO Fix with the checks it flipped

## Blocked by

- 03-geo-auditor-and-checks.md
- 05-tracer-fix-to-pr.md
