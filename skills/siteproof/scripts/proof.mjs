#!/usr/bin/env node
// Proof for the siteproof fix workflow. Run from the target project's root, on the siteproof branch.
//   node proof.mjs baseline                         preview of unmodified main → scores, checks, screenshots
//   node proof.mjs build <key>                      rules + build (+lint, +typecheck) after the fixer's commit; exit 1 on failure
//   node proof.mjs undo <key> --reason <r> [--log f] [--detail s]   drop the Fix's commit, record why
//   node proof.mjs speed <key>                      measure vs the previous kept step; keep or undo
//   node proof.mjs checks                           SEO/GEO check flips vs Baseline; undo unproven/regressing Fixes
//   node proof.mjs ui                               screenshots vs Baseline; bisect + undo UI changers; final numbers
//   node proof.mjs status                           one line per Fix
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { measure } from './measure.mjs';
import { runChecks } from './checks/run.mjs';
import { capture, diffImages, shotName, WIDTHS } from './screenshot.mjs';
import { speedVerdict, checkFlipVerdict, uiVerdict, bisect } from './lib/decide.mjs';
import { routeOfFile, uiPages } from './lib/routes.mjs';
import { wd, readJson, writeJson, config, sh, git, withPreview, fixCommits, dropCommit, atRef, TRAILER } from './lib/project.mjs';
import { diffViolations } from './lib/rules.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { reason: { type: 'string' }, log: { type: 'string' }, detail: { type: 'string' } } });
const [cmd, key] = positionals;

const run = readJson(wd('run.json'));
const save = () => writeJson(wd('run.json'), run);
const fixesRaw = readJson(wd('fixes.json'));
const fixes = Array.isArray(fixesRaw) ? fixesRaw : fixesRaw.fixes;
const byKey = new Map(fixes.map(f => [f.key, f]));
const cfg = config();
const slug = (k) => k.replace(/[^a-z0-9.-]+/gi, '_');
const pick = (s) => ({ mobile: s.mobile, desktop: s.desktop, samples: s.samples }); // samples feed the noise check
const log = (...a) => console.error('[siteproof]', ...a);
const checksAt = (url, only) => runChecks(url, { siteOrigin: run.auditUrl ?? undefined, pages: cfg.pages, only });
const record = (k, patch) => { run.fixes[k] = { ...run.fixes[k], ...patch, key: k }; save(); };
const kept = (statuses = ['applied', 'kept']) => fixCommits(run.base).filter(c => statuses.includes(run.fixes[c.key]?.status));

function undo(k, patch) {
  const c = fixCommits(run.base).find(x => x.key === k);
  const how = c ? dropCommit(c.sha) : 'no-commit';
  if (how === 'failed') throw new Error(`could not undo ${k}; resolve git state by hand`);
  record(k, { ...patch, undone: how });
  log(`undid ${k} (${how}): ${patch.status}${patch.detail ? ` — ${patch.detail}` : ''}`);
}

if (cmd === 'baseline') {
  if (git(['rev-parse', 'HEAD']).stdout.trim() !== run.base) throw new Error('baseline must run before any Fix is applied (HEAD != base)');
  const res = await withPreview(async (url) => {
    log(`Baseline on ${url} (${cfg.runtime}): Lighthouse ×${cfg.runs} mobile + desktop…`);
    const scores = await measure(url, { runs: cfg.runs });
    log('Baseline checks…');
    const checks = await checksAt(url);
    log(`Baseline screenshots of ${checks.pages.length} pages…`);
    await capture(url, checks.pages, wd('shots', 'baseline'), { hideSelectors: cfg.hideSelectors });
    return { scores, checks };
  }, cfg);
  writeJson(wd('proof', 'baseline-scores.json'), res.scores);
  writeJson(wd('proof', 'baseline-checks.json'), res.checks);
  run.runtime = cfg.runtime;
  run.baseline = { scores: pick(res.scores), checks: res.checks.checks, sample: res.checks.pages, at: new Date().toISOString() };
  run.lastKept = run.baseline.scores;
  save();
  const failing = Object.keys(res.checks.checks).filter(k => !res.checks.checks[k].pass);
  console.log(JSON.stringify({ baseline: run.baseline.scores, failingChecks: failing, pages: res.checks.pages }, null, 2));
} else if (cmd === 'build') {
  if (!byKey.has(key)) throw new Error(`unknown Fix ${key}`);
  const head = git(['log', '-1', `--format=%(trailers:key=${TRAILER},valueonly)`]).stdout.trim();
  if (head !== key) {
    console.error(`HEAD is not a commit for ${key} (trailer "${TRAILER}: ${key}" missing). The fixer must commit each Fix with that trailer.`);
    process.exit(3);
  }
  // The rules run here as well as in harness hooks, so they hold in harnesses without hooks.
  const violations = diffViolations(git(['show', '--format=', '--unified=0', '--no-color', '--no-ext-diff', 'HEAD']).stdout);
  const steps = [['build', cfg.buildCommand], ['lint', cfg.lintCommand], ['typecheck', cfg.typecheckCommand]].filter(([, c]) => c);
  let out = violations.length ? `\n$ siteproof rules\n${violations.join('\n')}\nUndo those changes in the Fix commit (amend it) and fix the cause in the code instead.\n` : '';
  let failed = violations.length ? 'rules' : null;
  for (const [name, c] of failed ? [] : steps) {
    log(`${name}: ${c}`);
    const r = sh(c, { quiet: true });
    out += `\n$ ${c}\n${r.out}`;
    if (r.code !== 0) { failed = name; break; }
  }
  const logFile = wd('logs', `${slug(key)}-build.log`);
  mkdirSync(wd('logs'), { recursive: true });
  writeFileSync(logFile, out);
  record(key, { status: 'applied', attempts: (run.fixes[key]?.attempts ?? 0) + 1, area: byKey.get(key).area });
  if (failed) {
    console.log(JSON.stringify({ ok: false, step: failed, log: logFile, tail: out.slice(-2500) }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, steps: ['rules', ...steps.map(s => s[0])] }));
} else if (cmd === 'undo') {
  if (!values.reason) throw new Error('--reason required');
  const logText = values.log && existsSync(values.log) ? readFileSync(values.log, 'utf8').slice(-6000) : undefined;
  undo(key, { status: values.reason, detail: values.detail, log: logText, area: byKey.get(key)?.area });
} else if (cmd === 'speed') {
  const fix = byKey.get(key);
  if (fix?.area !== 'Speed') throw new Error(`${key} is not a Speed Fix`);
  log(`Measuring ${key} (target ${fix.targetMetric}) ×${cfg.runs} against the previous kept step…`);
  const after = await withPreview((url) => measure(url, { runs: cfg.runs }), cfg);
  writeJson(wd('proof', `${slug(key)}-scores.json`), after);
  const v = speedVerdict(run.lastKept, pick(after), fix.targetMetric);
  const numbers = { before: run.lastKept, after: pick(after) };
  if (v.keep) {
    record(key, { status: 'kept', area: 'Speed', result: v.reason, numbers });
    run.lastKept = pick(after);
    save();
  } else {
    undo(key, { status: 'failed-proof', area: 'Speed', detail: v.reason, numbers });
  }
  console.log(JSON.stringify({ key, keep: v.keep, reason: v.reason, regressions: v.regressions }, null, 2));
} else if (cmd === 'checks') {
  let after;
  for (let round = 0; round < 20; round++) {
    const pending = kept(['applied']).map(c => byKey.get(c.key)).filter(f => f.area !== 'Speed');
    if (!pending.length) break;
    log(`Round ${round + 1}: running checks on ${pending.length} SEO/GEO Fixes…`);
    after = await withPreview((url) => checksAt(url), cfg);
    const v = checkFlipVerdict(run.baseline.checks, after.checks, pending);
    const unproven = v.results.filter(r => !r.proven);
    if (unproven.length) {
      for (const r of unproven) undo(r.key, { status: 'failed-proof', detail: r.stillFailing.length ? `checks still failing after the Fix: ${r.stillFailing.map(c => `\`${c}\``).join(', ')}` : 'its checks already passed on the Baseline, so there was nothing to prove', failures: Object.fromEntries(r.stillFailing.map(c => [c, after.checks[c]?.failures])) });
      continue; // re-check without them: their removal can change other results
    }
    if (v.regressions.length) {
      const commits = kept();
      log(`Checks ${v.regressions.join(', ')} went pass → fail; bisecting ${commits.length} commits…`);
      const idx = await bisect(commits, (n) => atRef(commits[n - 1].sha, async () => {
        const r = await withPreview((url) => checksAt(url, v.regressions), cfg);
        return v.regressions.some(id => !r.checks[id]?.pass);
      }));
      const culprit = commits[idx];
      undo(culprit.key, { status: 'failed-proof', detail: `made passing checks fail: ${v.regressions.map(c => `\`${c}\``).join(', ')}` });
      continue;
    }
    for (const r of v.results) record(r.key, { status: 'kept', flipped: r.flipped, result: `flipped ${r.flipped.map(c => `\`${c}\``).join(', ')} fail → pass` });
    break;
  }
  if (after) writeJson(wd('proof', 'after-checks.json'), after);
  console.log(JSON.stringify(Object.values(run.fixes).filter(f => f.area !== 'Speed').map(f => ({ key: f.key, status: f.status, result: f.result ?? f.detail })), null, 2));
} else if (cmd === 'ui') {
  // Idempotent: the step costs a build plus a full Lighthouse pass, so a repeat on the same commit
  // replays the stored result instead of measuring the same tree twice.
  const head = git(['rev-parse', 'HEAD']).stdout.trim();
  if (run.ui?.head === head && run.final) {
    log('UI check already ran on this commit; reusing the stored result.');
    console.log(JSON.stringify({ ui: run.ui, final: run.final.scores, reused: true }, null, 2));
    process.exit(0);
  }
  const base = wd('shots', 'baseline');
  const final = wd('shots', 'final');
  const shotsFor = (pages) => pages.flatMap(p => WIDTHS.map(w => ({ page: p, width: w, name: shotName(p, w) })))
    .filter(s => existsSync(join(base, s.name)));
  for (let round = 0; round < 20; round++) {
    const commits = kept(['kept']);
    const touched = commits.flatMap(c => c.files.map(routeOfFile));
    const pages = uiPages(run.baseline.sample, touched);
    const shots = shotsFor(pages);
    log(`UI check round ${round + 1}: ${shots.length} screenshots of ${pages.join(', ')}`);
    const res = await withPreview(async (url) => {
      await capture(url, pages, final, { hideSelectors: cfg.hideSelectors });
      mkdirSync(wd('shots', 'diff'), { recursive: true });
      const results = shots.map(s => ({ ...s, ratio: diffImages(join(base, s.name), join(final, s.name), wd('shots', 'diff', s.name)) }));
      const changed = results.filter(r => uiVerdict(r.ratio, cfg.uiThreshold).changed);
      if (changed.length) return { results, changed };
      log('UI unchanged. Final Lighthouse + checks on the same preview…');
      return { results, changed, scores: await measure(url, { runs: cfg.runs }), checks: await checksAt(url) };
    }, cfg);
    if (!res.changed.length) {
      run.ui = { head: git(['rev-parse', 'HEAD']).stdout.trim(), pages, missing: pages.filter(p => !shotsFor([p]).length), threshold: cfg.uiThreshold, results: res.results.map(({ name, page, width, ratio }) => ({ name, page, width, ratio })) };
      run.final = { scores: pick(res.scores), checks: res.checks.checks, at: new Date().toISOString() };
      writeJson(wd('proof', 'final-scores.json'), res.scores);
      writeJson(wd('proof', 'final-checks.json'), res.checks);
      save();
      break;
    }
    const target = res.changed[0];
    // ponytail: bisect trusts that the Baseline capture is reproducible; a page that differs with no
    // Fix applied is nondeterministic (carousel, date, ad) and needs a hideSelectors entry, not an undo.
    if (!commits.length) throw new Error(`${target.name} differs from the Baseline with no Fix applied: add its changing elements to hideSelectors in siteproof.config.json`);
    log(`${target.name} differs by ${(target.ratio * 100).toFixed(2)}%; bisecting ${commits.length} commits…`);
    const idx = commits.length === 1 ? 0 : await bisect(commits, (n) => atRef(commits[n - 1].sha, () => withPreview(async (url) => {
      const dir = wd('shots', `bisect-${n}`);
      await capture(url, [target.page], dir, { hideSelectors: cfg.hideSelectors });
      return uiVerdict(diffImages(join(base, target.name), join(dir, target.name)), cfg.uiThreshold).changed;
    }, cfg)));
    const culprit = commits[idx];
    const keep = wd('ui', slug(culprit.key));
    mkdirSync(keep, { recursive: true });
    const images = {};
    for (const r of res.changed) {
      const n = r.name.replace('.png', '');
      copyFileSync(join(base, r.name), join(keep, `${n}-before.png`));
      copyFileSync(join(final, r.name), join(keep, `${n}-after.png`));
      copyFileSync(wd('shots', 'diff', r.name), join(keep, `${n}-diff.png`));
      images[`${r.page} @${r.width}px (${(r.ratio * 100).toFixed(2)}%)`] = { before: join(keep, `${n}-before.png`), after: join(keep, `${n}-after.png`), diff: join(keep, `${n}-diff.png`) };
    }
    undo(culprit.key, { status: 'changes-ui', detail: `${target.page} at ${target.width}px changed ${(target.ratio * 100).toFixed(2)}% of pixels (limit ${(cfg.uiThreshold * 100).toFixed(1)}%)`, images });
  }
  console.log(JSON.stringify({ ui: run.ui, final: run.final?.scores }, null, 2));
} else if (cmd === 'status') {
  for (const f of Object.values(run.fixes)) console.log(`${f.status.padEnd(13)} ${f.key}  ${f.result ?? f.detail ?? ''}`);
} else {
  console.error('usage: proof.mjs baseline | build <key> | undo <key> --reason r | speed <key> | checks | ui | status');
  process.exit(64);
}
