# siteproof

A Claude Code plugin that audits a Next.js site across SEO, GEO and speed, applies ranked fixes, and proves each one on a local preview before shipping.

## Language

**Finding**:
A problem on the site observed by an auditor. Findings are facts, not changes.
_Avoid_: Issue, problem, fix

**Plan**:
The ranked list of all proposed Fixes from one audit, where the user ticks which ones go into the PR.
_Avoid_: Report, audit results, backlog

**Fix**:
One change addressing one or more Findings, belonging to exactly one Area. One Fix is one commit.
_Avoid_: Finding, recommendation, change

**Baseline**:
Measurements of a local preview of unmodified main, against which every Proof is compared. Distinct from the prod measurements shown in the audit.
_Avoid_: Before, control, prod score

**Target Metric**:
The single measurement a Speed Fix claims to improve (e.g. main-content load time, blocking time, layout shift, bytes downloaded). Its Proof is judged on this metric.
_Avoid_: KPI, score

**Deferred Fix**:
A Fix left out of the PR and tracked as an issue instead: unselected by the user, failed its Proof, broke the build, or a content change siteproof only suggests.
_Avoid_: Backlog item, todo, skipped fix

**Area**:
One of three concerns a Fix belongs to: SEO, GEO, or Speed. Assigned by the Fix's primary intent.
_Avoid_: Category, track, pillar

**Proof**:
Evidence from a local preview that a Fix helps and doesn't change the UI. SEO and GEO Fixes are proven together by pass/fail checks; Speed Fixes are proven one at a time by cumulative measurement.
_Avoid_: Validation, verification
