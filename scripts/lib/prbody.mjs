// Pure: the PR body is the proof document a reviewer can trust without checking out the branch.
import { fmt } from './decide.mjs';

const REASON_LABEL = {
  'deferred': 'unticked in the Plan',
  'failed-proof': 'failed its Proof',
  'broke-build': 'broke the build',
  'changes-ui': 'changed the UI',
  'content': 'content change (suggestion only)',
  'covered': 'already done by another Fix in this PR',
};

const cell = (s, m) => (s?.[m] === undefined ? '–' : m === 'score' ? String(s[m]) : fmt(m, s[m]));
const issueLink = (n) => (n ? `#${n}` : '_(not filed)_');
const pct = (a, b) => (a ? ` (${b <= a ? '−' : '+'}${Math.abs(Math.round(100 * (b - a) / a))}%)` : '');

/**
 * run: siteproof/run.json. fixes: all Plan Fixes. prod: audit scores {mobile, desktop} or null.
 * prodChecks: audit check results or null. filed: {key: issueNumber} for Deferred Fixes.
 * shots: {name: {before, after}} image URLs for the UI proof.
 */
export function renderPrBody({ run, fixes, prod, prodChecks, filed = {}, shots = {} }) {
  const byKey = new Map(fixes.map(f => [f.key, f]));
  const outcome = (k) => run.fixes[k] ?? {};
  const kept = fixes.filter(f => outcome(f.key).status === 'kept');
  const dropped = fixes.filter(f => f.content || ['deferred', 'failed-proof', 'broke-build', 'changes-ui', 'covered'].includes(outcome(f.key).status));
  const L = [];

  L.push(`siteproof applied **${kept.length} proven Fix${kept.length === 1 ? '' : 'es'}** to \`${run.baseBranch}\` ` +
    `(${['SEO', 'GEO', 'Speed'].map(a => `${a} ${kept.filter(f => f.area === a).length}`).join(' · ')}).`);
  L.push('');
  L.push(`> **Proven on ${run.runtime ?? 'local preview'}.** Every number below compares a local preview of this branch with a local preview of unmodified \`${run.baseBranch}\` (the Baseline) on the same machine. Speed Fixes were measured one at a time (Lighthouse ×${run.runs ?? 5}, median); SEO/GEO Fixes were proven by pass/fail checks; screenshots show the UI did not change.`);
  L.push('');

  L.push('## Fixes', '', '| # | Area | Fix | Measured result |', '|---|---|---|---|');
  kept.forEach((f, i) => L.push(`| ${i + 1} | ${f.area} | ${f.title} | ${outcome(f.key).result ?? '–'} |`));
  if (!kept.length) L.push('| – | – | _No Fix survived Proof._ | – |');
  L.push('');

  const b = run.baseline?.scores, a = run.final?.scores;
  L.push('## Before / after', '', '| Device | Metric | Prod at audit | Baseline | After |', '|---|---|---|---|---|');
  for (const d of ['mobile', 'desktop']) {
    for (const m of ['score', 'lcp', 'tbt', 'cls', 'bytes']) {
      const label = m === 'score' ? 'Lighthouse' : m === 'bytes' ? 'Bytes' : m.toUpperCase();
      const change = b && a && m !== 'score' ? pct(b[d][m], a[d][m]) : '';
      L.push(`| ${d} | ${label} | ${cell(prod?.[d], m)} | ${cell(b?.[d], m)} | ${cell(a?.[d], m)}${change} |`);
    }
  }
  L.push('');
  const bc = run.baseline?.checks ?? {}, ac = run.final?.checks ?? {};
  const ids = Object.keys(bc);
  const pass = (c) => (c === undefined ? '–' : c.pass ? '✅' : '❌');
  const count = (cs) => `${ids.filter(i => cs[i]?.pass).length}/${ids.length}`;
  L.push(`**Checks passing:** Baseline ${count(bc)} → After ${count(ac)}`, '');
  L.push('<details><summary>All checks</summary>', '', '| Check | Prod at audit | Baseline | After |', '|---|---|---|---|');
  for (const id of ids) L.push(`| \`${id}\` | ${pass(prodChecks?.[id])} | ${pass(bc[id])} | ${pass(ac[id])} |`);
  L.push('', '</details>', '');

  L.push('## UI unchanged', '');
  if (run.ui?.results?.length) {
    const worst = Math.max(...run.ui.results.map(r => r.ratio));
    L.push(`${run.ui.results.length} screenshots (${run.ui.pages.length} pages × 390px and 1440px) differ from the Baseline by at most **${(worst * 100).toFixed(3)}%** of pixels (limit ${(run.ui.threshold * 100).toFixed(1)}%). Animations were off, fonts and images loaded, and configured changing elements hidden.`);
    if (run.ui.missing?.length) L.push('', `No Baseline screenshot for: ${run.ui.missing.join(', ')} (outside the sampled pages).`);
    L.push('', '<details><summary>Screenshots</summary>', '', '| Page | Width | Diff | Before | After |', '|---|---|---|---|---|');
    for (const r of run.ui.results) {
      const s = shots[r.name];
      L.push(`| ${r.page} | ${r.width}px | ${(r.ratio * 100).toFixed(3)}% | ${s ? `<img src="${s.before}" width="160">` : '–'} | ${s ? `<img src="${s.after}" width="160">` : '–'} |`);
    }
    L.push('', '</details>', '');
  } else L.push('_UI check did not run._', '');

  L.push('## Dropped Fixes', '');
  if (dropped.length) {
    L.push('| Area | Fix | Why | Issue |', '|---|---|---|---|');
    for (const f of dropped) {
      const o = outcome(f.key);
      const reason = f.content ? 'content' : o.status;
      // A Fix another Fix already did needs no issue: the problem is gone on this branch.
      const issue = reason === 'covered' ? '–' : issueLink(filed[f.key] ?? f.issue);
      L.push(`| ${f.area} | ${f.title} | ${REASON_LABEL[reason]}${o.detail ? `: ${o.detail}` : ''} | ${issue} |`);
    }
  } else L.push('_None._');
  L.push('');

  // Checks still failing that no kept Fix was meant to flip: known, visible, not blocking.
  const claimedByKept = new Set(kept.flatMap(f => f.checkIds));
  const still = Object.keys(ac).filter(id => !ac[id].pass && !claimedByKept.has(id));
  L.push('## Still failing (not picked)', '');
  if (still.length) {
    for (const id of still) {
      const owner = fixes.find(f => f.checkIds?.includes(id) && (filed[f.key] || f.issue));
      L.push(`- \`${id}\`: ${ac[id].failures?.slice(0, 3).map(x => `${x.url} ${x.detail}`).join('; ') || 'failing'}${owner ? ` → ${issueLink(filed[owner.key] ?? owner.issue)}` : ''}`);
    }
  } else L.push('_None._');
  L.push('');

  const closes = kept.filter(f => f.issue).map(f => `Closes #${f.issue}`);
  if (closes.length) L.push(...closes, '');

  L.push('---', '🤖 Generated with siteproof · proof data in `siteproof/` (git-ignored)');
  return L.join('\n');
}

export function prTitle(run, fixes) {
  const kept = fixes.filter(f => run.fixes[f.key]?.status === 'kept');
  return `siteproof: ${kept.length} proven SEO/GEO/speed fix${kept.length === 1 ? '' : 'es'} (${run.date})`;
}
