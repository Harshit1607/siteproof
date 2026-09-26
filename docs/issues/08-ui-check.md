---
labels: [ready-for-agent]
---
## Parent

docs/PRD.md

## What to build

After all Fixes are applied and proven, take screenshots of the Baseline preview and the final preview and compare them. If a page differs beyond the threshold, bisect the kept Fix commits to find the one responsible, undo it, and keep its before, after and diff images.

## Acceptance criteria

- [ ] Pages: homepage, one page per route type (from the sitemap), and every page a Fix touched
- [ ] Widths 390px and 1440px
- [ ] Before capture: animations disabled, fonts and images loaded, configured selectors hidden
- [ ] UI verdict is pure logic with fixture tests around the 0.5% threshold
- [ ] Screenshot script tested on the fixture site: identical builds give a near-zero diff; a deliberate CSS change gives a positive diff
- [ ] Bisect runs only on failure and undoes just the culprit, recorded as `changes-ui` with images
- [ ] Other Fixes still ship

## Blocked by

- 06-seo-geo-proof.md
