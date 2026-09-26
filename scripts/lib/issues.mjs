// Pure helpers for Deferred Fix issues: stable key comment, dedup, stale detection, issue body.
import { fmt } from './decide.mjs';

// Reasons a Fix left the run. `covered` never becomes an issue: another Fix in the same PR already did it.
export const REASONS = ['deferred', 'failed-proof', 'broke-build', 'changes-ui', 'content', 'covered'];
const COMMENT_RE = /<!--\s*siteproof:((?:seo|geo|speed):[a-z0-9][a-z0-9.-]*)\s*-->/;

export const keyComment = (key) => `<!-- siteproof:${key} -->`;
export const keyOf = (body = '') => body.match(COMMENT_RE)?.[1] ?? null;

// issues: [{number, body, state}] from `gh issue list --json number,body,state`. Returns {key: number}.
export function openIssueKeys(issues) {
  const out = {};
  for (const i of issues) {
    const k = keyOf(i.body);
    if (k && (i.state ?? 'OPEN').toUpperCase() === 'OPEN' && !(k in out)) out[k] = i.number;
  }
  return out;
}

// Open siteproof issues whose Fix key no longer appears in the current audit.
export function staleIssues(issues, currentKeys) {
  const keep = new Set(currentKeys);
  return issues.filter(i => {
    const k = keyOf(i.body);
    return k && (i.state ?? 'OPEN').toUpperCase() === 'OPEN' && !keep.has(k);
  });
}

const REASON_TEXT = {
  'deferred': 'Left out of the siteproof run by choice (unticked in the Plan).',
  'failed-proof': 'Applied, but its Proof failed, so it was undone.',
  'broke-build': 'Applied, but it broke the build and one repair attempt did not fix it, so it was undone.',
  'changes-ui': 'Applied, but the screenshot comparison showed a visible UI change, so it was undone.',
  'content': 'Content change: siteproof only suggests these and never applies them, to protect the brand voice.',
  'covered': 'Another Fix in the same run already made this change, so there was nothing left to do.',
};

/**
 * fix: a Plan Fix. outcome: {reason, detail?, numbers?, log?, images?}. images: {before, after, diff} URLs.
 * Returns {title, body, labels}.
 */
export function issueFor(fix, outcome) {
  if (!REASONS.includes(outcome.reason)) throw new Error(`unknown reason ${outcome.reason}`);
  const lines = [
    keyComment(fix.key), '',
    `**${fix.area}** · ${fix.title}`, '',
    `**Why:** ${fix.why}`, '',
    `**Status:** ${REASON_TEXT[outcome.reason]}`, '',
    `Impact ${fix.impact} · effort ${fix.effort} · confidence ${fix.confidence} · risk ${fix.risk}` +
      (fix.targetMetric ? ` · target ${fix.targetMetric}` : ''),
  ];
  if (fix.checkIds?.length) lines.push('', `Proving checks: ${fix.checkIds.map(c => `\`${c}\``).join(', ')}`);
  if (fix.detail) lines.push('', fix.detail);
  if (outcome.detail) lines.push('', `**Result:** ${outcome.detail}`);
  if (outcome.numbers) lines.push('', numbersTable(outcome.numbers));
  if (outcome.log) lines.push('', '<details><summary>Build log</summary>', '', '```', outcome.log.slice(-6000), '```', '</details>');
  if (outcome.images) {
    for (const [page, im] of Object.entries(outcome.images)) {
      lines.push('', `**${page}**`, '', '| Before | After | Diff |', '|---|---|---|', `| ![](${im.before}) | ![](${im.after}) | ![](${im.diff}) |`);
    }
  }
  lines.push('', '_Filed by siteproof. Re-run `/siteproof:audit` to pick it up again; it will be closed automatically once the problem is gone._');
  return {
    title: `[siteproof] ${fix.area}: ${fix.title}`,
    body: lines.join('\n'),
    labels: ['siteproof', fix.area.toLowerCase(), outcome.reason],
  };
}

// numbers: {before: {mobile, desktop}, after: {mobile, desktop}}
export function numbersTable({ before, after }) {
  const rows = [];
  for (const d of ['mobile', 'desktop']) {
    for (const m of ['lcp', 'tbt', 'cls', 'bytes']) {
      if (before?.[d]?.[m] === undefined) continue;
      rows.push(`| ${d} | ${m.toUpperCase()} | ${fmt(m, before[d][m])} | ${fmt(m, after[d][m])} |`);
    }
  }
  return ['| Device | Metric | Before | After |', '|---|---|---|---|', ...rows].join('\n');
}

/**
 * A Fix can be dropped (unapplied, or undone) and yet its problem is gone, because another Fix in the
 * same run made the same change — `next/image` adds the alt the SEO Fix was for. Filing an issue for
 * it would be a false positive, so a dropped Fix whose proving checks all pass in the final run is
 * marked `covered` instead. Speed Fixes have no checks and are never reclassified.
 * Mutates nothing: returns { [key]: 'covered' } for the callers to apply.
 */
export function coveredByOthers(fixes, runFixes, finalChecks = {}) {
  const out = {};
  for (const f of fixes) {
    const status = runFixes[f.key]?.status;
    if (!['deferred', 'failed-proof'].includes(status) || f.content) continue;
    if (!f.checkIds?.length) continue;
    if (f.checkIds.every(id => finalChecks[id]?.pass)) out[f.key] = 'covered';
  }
  return out;
}
