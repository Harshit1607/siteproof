---
description: Apply the ticked Plan Fixes on a new branch, prove each on a local preview, open one PR, file Deferred Fixes as issues
---

# /siteproof:fix

Apply the Fixes ticked in `siteproof/plan.md`, give each one **Proof** on a local preview against a **Baseline** of unmodified main, and ship one PR. Anything not shipped becomes a GitHub issue (a **Deferred Fix**).

Scripts live in `${CLAUDE_PLUGIN_ROOT}/scripts`. Below, `S` means that absolute path. Run every script from the project root as `node "S/<script>"`. Long steps (Baseline, Speed Proof, checks, UI) take minutes: run them with a generous timeout (10 minutes), and in the background if needed.

**Run each step once.** Every Proof step costs a build and a Lighthouse pass. Don't re-run one "to be sure": `baseline`, `checks` and `ui` each record their result in `siteproof/run.json`, and a second `ui` on the same commit just replays the stored one.

## Hard rules

- **Only the `siteproof:fixer` agent edits project files.** You (the orchestrator) never use Edit/Write on project files. You may only write inside `./siteproof/`.
- Never stash, reset or discard the user's work. Never `git push` yourself and never force-push: `ship.mjs pr` pushes the branch once, normally.
- Never change lint/TypeScript config or add `@ts-ignore`/`eslint-disable` to make a build pass (the hooks block it). A Fix that can't build is undone.
- Never deploy.

## Steps

1. **Git preflight.** `node "S/git.mjs" preflight`. Exit code 2 → show its message and **stop** (dirty tree, no Plan, etc.). Otherwise show the branch name and every warning (old siteproof branches / PRs are only warned about, never touched).

2. **Selection.** `node "S/plan.mjs" selected` → `apply` (ticked, in apply order: Speed first, then SEO/GEO), `unticked`, `content`. If `apply` is empty, skip to step 7.

3. **Baseline.** `node "S/proof.mjs" baseline`. It builds and serves the project's own local preview (for OpenNext: the local Workers runtime, no Cloudflare credentials), runs Lighthouse ×5 on mobile and desktop, all checks, and screenshots. If the preview can't start, show the error and stop.

4. **Apply each Fix, in `apply` order.** For each Fix:
   1. Launch `siteproof:fixer` with this envelope (the Fix JSON verbatim from `siteproof/fixes.json`):
      ```
      MODE: apply
      FIX: <fix json>
      SCRIPTS: <S>
      PROJECT: <absolute project root>
      ```
      If the fixer answers `CANNOT_APPLY: <reason>`, run `node "S/proof.mjs" undo <key> --reason deferred --detail "<reason>"` and continue with the next Fix.
      If it answers `ALREADY_DONE: <what covers it>`, an earlier Fix already made that change: run `node "S/proof.mjs" undo <key> --reason covered --detail "<what covers it>"` and continue. A `covered` Fix gets no issue — the problem is gone on this branch.
   2. `node "S/proof.mjs" build <key>`.
      - Exit 3: the fixer didn't commit with the `Siteproof-Fix: <key>` trailer. Send it back to the same fixer (SendMessage) to commit properly, then re-run build.
      - Exit 1: **one repair attempt**. SendMessage the same fixer: `MODE: repair` plus the `tail` from the build output. It amends its commit. Re-run `build`. Still exit 1 → `node "S/proof.mjs" undo <key> --reason broke-build --log <log path from the output>`.
   3. **Speed Fix only:** `node "S/proof.mjs" speed <key>`. It measures cumulatively against the previous kept step, keeps the Fix if its Target Metric improved on mobile by ≥ max(10%, floor, run-to-run spread) with no other metric worse by the same margin, and otherwise undoes it (`failed-proof`, with numbers). Report the one-line verdict.

5. **Prove SEO/GEO together.** If any SEO/GEO Fix is applied: `node "S/proof.mjs" checks`. A Fix is kept when its checks flip fail → pass; unproven Fixes are undone; a Fix that makes a passing check fail is found by bisecting and undone.

6. **UI check.** `node "S/proof.mjs" ui`. Screenshots at 390px and 1440px of the homepage, one page per route type and every page a kept Fix touched, compared with the Baseline. A page that differs beyond the threshold is traced to the Fix responsible (bisect), which is undone (`changes-ui`, images kept); the other Fixes still ship. It ends with final Lighthouse + checks for the PR.

7. **Ship.**
   - `node "S/ship.mjs" issues`: one issue per Deferred Fix (unticked, failed-proof, broke-build, changes-ui, content), deduped by Fix key.
   - If at least one Fix was kept: `node "S/ship.mjs" pr`. Otherwise tell the user no Fix survived Proof and no PR was opened.
   - `node "S/git.mjs" done`.
   Without a GitHub remote both steps run dry: they write `siteproof/issues/*.md` and `siteproof/pr-body.md` and send nothing.

8. **Report.** `node "S/proof.mjs" status`. Show: PR link (or the dry-run body path), a table of every Fix with its outcome and measured result, the Baseline → final Lighthouse numbers for mobile and desktop, and the issues filed. Keep it short; the PR body has the full proof.
