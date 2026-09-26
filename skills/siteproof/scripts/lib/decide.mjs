// Pure decision logic. No I/O. Every threshold siteproof judges by lives here.

export const EFFORT = { S: 1, M: 2, L: 3 };
export const SPEED_METRICS = ['lcp', 'tbt', 'cls', 'bytes'];
// Minimum absolute change for a metric to count (units: ms, ms, unitless, bytes).
export const FLOORS = { lcp: 100, tbt: 50, cls: 0.02, bytes: 10 * 1024 };
export const RELATIVE = 0.10;
export const UI_THRESHOLD = 0.005; // share of pixels that may differ

const EPS = 1e-9; // float guard so "exactly at the threshold" passes

export function score(fix) {
  return (fix.impact * fix.confidence) / EFFORT[fix.effort];
}

// Highest score first; ties: higher impact, lower effort, then key for a stable order.
export function rank(fixes) {
  return [...fixes].sort((a, b) =>
    score(b) - score(a) ||
    b.impact - a.impact ||
    EFFORT[a.effort] - EFFORT[b.effort] ||
    a.key.localeCompare(b.key));
}

export function margin(metric, value) {
  return Math.max(RELATIVE * Math.abs(value), FLOORS[metric]);
}

// Run-to-run spread of one metric across both steps' samples (0 without samples; bytes come from one run).
function noise(prev, after, device, m) {
  if (m === 'bytes') return 0;
  const range = (xs) => (xs?.length > 1 ? Math.max(...xs.map(x => x[m])) - Math.min(...xs.map(x => x[m])) : 0);
  return Math.max(range(prev.samples?.[device]), range(after.samples?.[device]));
}

/**
 * prev/after: { mobile: {lcp,tbt,cls,bytes}, desktop: {...}, samples?: {mobile: [...], desktop: [...]} }.
 * Keep only if the target metric's mobile median improves by >= max(margin, noise) and no other
 * metric on either device gets worse by >= its max(margin, noise). margin = max(10%, floor);
 * noise = the larger run-to-run range of the two steps, so a change smaller than the machine's
 * own jitter never counts as an improvement (or a regression).
 */
export function speedVerdict(prev, after, target) {
  const t = target.toLowerCase();
  if (!SPEED_METRICS.includes(t)) throw new Error(`unknown target metric: ${target}`);
  const gain = prev.mobile[t] - after.mobile[t];
  const need = Math.max(margin(t, prev.mobile[t]), noise(prev, after, 'mobile', t));
  const regressions = [];
  for (const device of ['mobile', 'desktop']) {
    for (const m of SPEED_METRICS) {
      if (device === 'mobile' && m === t) continue;
      const worse = after[device][m] - prev[device][m];
      if (worse > 0 && worse + EPS >= Math.max(margin(m, prev[device][m]), noise(prev, after, device, m))) {
        regressions.push({ device, metric: m, before: prev[device][m], after: after[device][m] });
      }
    }
  }
  const improved = gain + EPS >= need;
  const keep = improved && regressions.length === 0;
  const reason = !improved
    ? `${t.toUpperCase()} mobile ${fmt(t, prev.mobile[t])} → ${fmt(t, after.mobile[t])}, needed −${fmt(t, need)}`
    : regressions.length
      ? `regressed ${regressions.map(r => `${r.metric.toUpperCase()} ${r.device} ${fmt(r.metric, r.before)} → ${fmt(r.metric, r.after)}`).join(', ')}`
      : `${t.toUpperCase()} mobile ${fmt(t, prev.mobile[t])} → ${fmt(t, after.mobile[t])}`;
  return { keep, gain, need, regressions, reason };
}

export function fmt(metric, v) {
  if (metric === 'cls') return v.toFixed(3);
  if (metric === 'bytes') return `${Math.round(v / 1024)}KB`;
  return `${Math.round(v)}ms`;
}

const passed = (r) => (typeof r === 'object' && r !== null ? r.pass : r);

/**
 * before/after: { [checkId]: {pass} | boolean }. fixes: [{key, checkIds}].
 * Per fix: proven if all its checks now pass and at least one flipped fail→pass.
 * Regressions: checks that passed before and fail now (blame is found by bisect).
 * Unpicked: checks failing before and after that no fix claims (ignored for proof).
 */
export function checkFlipVerdict(before, after, fixes) {
  const claimed = new Set(fixes.flatMap(f => f.checkIds));
  const regressions = Object.keys(before).filter(id => passed(before[id]) && after[id] !== undefined && !passed(after[id]));
  const results = fixes.map(f => {
    const flipped = f.checkIds.filter(id => !passed(before[id]) && passed(after[id]));
    const stillFailing = f.checkIds.filter(id => !passed(after[id]));
    return { key: f.key, proven: flipped.length > 0 && stillFailing.length === 0, flipped, stillFailing };
  });
  const unpicked = Object.keys(after).filter(id => !passed(after[id]) && !claimed.has(id));
  return { results, regressions, unpicked };
}

export function uiVerdict(diffRatio, threshold = UI_THRESHOLD) {
  return { changed: diffRatio > threshold + EPS, diffRatio, threshold };
}

/**
 * Find the first commit (index into `commits`) at which `isBad(prefixLength)` turns true.
 * isBad(n) = state after applying the first n commits is bad. Assumes isBad(0) false and
 * isBad(commits.length) true. Returns the culprit index. log2(n) probes.
 */
export async function bisect(commits, isBad) {
  let lo = 0, hi = commits.length; // good at lo, bad at hi
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (await isBad(mid)) hi = mid; else lo = mid;
  }
  return hi - 1;
}

// Median of a numeric list (no mutation).
export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
