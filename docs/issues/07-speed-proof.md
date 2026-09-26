---
labels: [ready-for-agent]
---
## Parent

docs/PRD.md

## What to build

Speed Fixes get Proof one at a time. Each Speed Fix is applied cumulatively and measured on the local preview (5 runs mobile + desktop, median; 1 run for bytes) against the previous kept step, starting from the Baseline. Keep only if the Target Metric improves on mobile by at least max(10%, floor) and no other metric gets worse by the same margin on either device. Otherwise undo. Includes the nextjs-speed skill.

## Acceptance criteria

- [ ] Speed verdict is pure logic with fixture tests: exactly at the threshold, just below it, below the floor (LCP 100ms, TBT 50ms, CLS 0.02, bytes 10KB), a non-target regression on desktop only, a bytes-only Fix
- [ ] Each step is compared with the previous kept step, not with prod
- [ ] Failed Speed Fixes are undone and recorded as `failed-proof` with their numbers
- [ ] nextjs-speed skill guides next/image, next/font, priority on the main image, script strategy, cutting client JS
- [ ] Verified on the fixture site: the hero image Fix is kept; a no-op Fix is undone

## Blocked by

- 04-speed-auditor-ranking-and-plan-shaping.md
- 06-seo-geo-proof.md
