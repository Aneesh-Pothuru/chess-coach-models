// Reporting only. No move data, model fitting, resampling or new estimates.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const project = dirname(fileURLToPath(import.meta.url))
export const lab = resolve(project, '../..')
export const triggerOrder = ['book-end', 'conversion', 'forcing', 'structure']
export const candidateOrder = ['after-opp-error', 'in-check', 'after-capture', 'own-hanging', 'opp-hanging', 'defending', 'early', 'high-danger']
export const names = {
  'book-end': 'Book exit', conversion: 'Conversion', forcing: 'Forcing', structure: 'Structure',
  none: 'No trigger', 'after-opp-error': "After the opponent's serious error",
  'in-check': 'In check', 'after-capture': 'After a capture', 'own-hanging': 'Own piece hanging',
  'opp-hanging': "Opponent's piece hanging", defending: 'Defending', early: 'Early', 'high-danger': 'High danger',
}
export function claim(condition, message) {
  if (!condition) throw new Error(`publication claim failed: ${message}`)
}
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export const readJSON = path => JSON.parse(readFileSync(path, 'utf8'))
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const archivedFiles = ['README.md', 'paper/paper.tex', 'paper/generate.mjs', 'paper/generated.tex', 'freeze.py']

/** Audit the original freeze using the same closed snapshot set as freeze.py.
 * This reporting check does not authorize an effects run.
 */
export function verifyArchive() {
  const relative = 'projects/think-time-budget/freeze-manifest.json'
  execFileSync('git', ['ls-files', '--error-unmatch', relative], { cwd: lab, stdio: 'pipe' })
  claim(execFileSync('git', ['status', '--porcelain', '--', relative], { cwd: lab, encoding: 'utf8' }).trim() === '', 'the original manifest is committed and unchanged')
  const manifest = readJSON(join(lab, relative))
  claim(manifest.schema === 1 && manifest.algorithm === 'sha256', 'original content-freeze format')
  claim(manifest.files.length === 34 && new Set(manifest.files.map(f => f.path)).size === 34, 'complete original freeze')
  for (const entry of manifest.files) {
    const suffix = entry.path.replace(/^projects\/think-time-budget\//, '')
    const path = archivedFiles.includes(suffix)
      ? join(project, 'phase1', suffix) : join(lab, entry.path)
    const bytes = readFileSync(path)
    claim(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `frozen content: ${entry.path}`)
  }
  const original = readFileSync(join(project, 'phase1/README.md'), 'utf8')
  const current = readFileSync(join(project, 'README.md'), 'utf8')
  const registered = s => s.slice(s.indexOf('## The data\n'), s.indexOf('## Files\n'))
  claim(registered(current) === registered(original), 'registered data, measures, estimate, rule and caveats are unchanged')
  return manifest
}

/** Validate saved aggregates and their rule application; never re-estimate. */
export function validateReport({ analysis: a, phase1: p, cohort: c, rule }) {
  claim(a.phase === 2 && p.phase === 1 && p.effectsComputed === false, 'phase separation')
  claim(a.appCommit === p.appCommit && a.appCommit === c.appCommit, 'same measured app')
  claim(a.fingerprint === p.fingerprint && p.cohortFingerprint === c.fingerprint, 'same frozen moves and cohort')
  claim(equal(a.months, p.months) && equal(a.months, c.months), 'same sampled months')
  claim(equal(a.rule, p.rule) && equal(rule, p.rule), 'same registered rule')
  claim(equal(a.rule.triggers, triggerOrder) && equal([...a.rule.candidates].sort(), [...candidateOrder].sort()), 'complete comparison families')
  claim(equal(Object.keys(a.comparisons).sort(), [...triggerOrder, ...candidateOrder].sort()), 'all comparisons reported')
  for (const family of [a.rule.triggers, a.rule.candidates]) {
    const ranked = family.map(key => ({ key, p: a.comparisons[key].contrast?.p ?? 1 })).sort((x, y) => x.p - y.p)
    let previous = 0
    ranked.forEach(({ key, p }, rank) => {
      claim(Number.isFinite(p) && p >= 0 && p <= 1, `saved comparison p-value: ${key}`)
      previous = Math.min(1, Math.max(previous, (family.length - rank) * p))
      claim(Math.abs(previous - a.comparisons[key].pHolm) < 1e-12, `full-family Holm arithmetic: ${key}`)
    })
  }
  for (const [key, value] of Object.entries(a.comparisons)) {
    claim(equal(value.support, p.support[key]), `unchanged support: ${key}`)
    for (const est of [value.moment, value.noneSamePlayers]) {
      claim(est.ratioIdentified === (est.valuePerMinute !== null), `ratio suppression: ${key}`)
      if (est.ratioIdentified) claim(est.think.lo >= rule.thinkFloorSeconds, `denominator floor: ${key}`)
    }
    const available = value.support.sufficient && value.moment.ratioIdentified && value.noneSamePlayers.ratioIdentified
    claim(available === (value.contrast !== null), `contrast availability: ${key}`)
    let expected = 'cannot tell; leave unchanged'
    if (a.checks.gatesPass && available) {
      if (value.contrast.value > 0 && value.pHolm < rule.alpha && value.moment.err.hi < 0)
        expected = triggerOrder.includes(key) ? 'keep' : 'add candidate'
      else if (value.contrast.value < 0 && value.pHolm < rule.alpha)
        expected = triggerOrder.includes(key) ? 'drop priority' : 'do not add'
      else expected = 'no established advantage; leave unchanged'
    }
    claim(value.verdict === expected, `stored verdict follows the rule: ${key}`)
  }
  for (const k of ['all', 'placebo']) claim(equal(a.checks[k].support, p.support[k]), `unchanged gate support: ${k}`)
  const all = a.checks.all, placebo = a.checks.placebo
  const overallPass = all.support.sufficient && all.err.hi !== null && all.err.hi < 0
  const supported = placebo.support.sufficient && placebo.err.lo !== null
  const placeboPass = supported && placebo.err.lo > -rule.placeboMargin && placebo.err.hi < rule.placeboMargin
  const placeboBad = supported && (placebo.err.hi < -rule.placeboMargin || placebo.err.lo > rule.placeboMargin)
  claim(a.checks.overallPass === overallPass, 'overall gate applies the frozen interval rule')
  claim(a.checks.placeboStatus === (placeboPass ? 'pass' : placeboBad ? 'untrustworthy' : 'inconclusive'), 'placebo gate applies the frozen tolerance')
  claim(a.checks.gatesPass === (overallPass && placeboPass), 'both gates are required')
}

export function loadReport() {
  verifyArchive()
  const analysis = readJSON(join(project, 'results/analysis.json'))
  const phase1 = readJSON(join(project, 'results/phase1.json'))
  const cohort = readJSON(join(project, 'results/cohort-counts.json'))
  const rule = phase1.rule
  const result = { analysis, phase1, cohort, rule }
  claim(analysis.appCommit === readJSON(join(lab, 'bridge/chess.json')).commit, 'measured app is the pin')
  validateReport(result)
  return result
}

/** The empirical claims in the README and ordered report, separate from
 * the general rule audit so a different valid result still refuses this prose.
 */
export function checkFindings({ analysis: a, rule }) {
  const order = [...triggerOrder, ...candidateOrder], cmp = a.comparisons
  const all = a.checks.all.err, placebo = a.checks.placebo.err
  claim(a.checks.overallPass && all.hi < 0, 'more time cuts errors overall')
  claim(a.checks.placeboStatus === 'inconclusive' && placebo.lo < -rule.placeboMargin && placebo.hi > -rule.placeboMargin && placebo.hi < 0,
    'the placebo interval crosses the lower tolerance boundary')
  claim(!a.checks.gatesPass && order.every(k => cmp[k].verdict === 'cannot tell; leave unchanged'), 'all app verdicts leave unchanged')
  claim(order.filter(k => cmp[k].contrast === null).join() === ['book-end', 'structure', 'in-check', 'defending'].join(), 'exact unsupported comparisons')
  for (const k of order.filter(k => cmp[k].contrast === null)) claim(cmp[k].support.supportedPlayers >= rule.minPlayers && cmp[k].support.coverage.some(x => x < rule.minCoverage),
    `${k} is unavailable because coverage fails`)
  claim(order.every(k => cmp[k].moment.ratioIdentified && cmp[k].noneSamePlayers.ratioIdentified), 'all moment and paired-none denominators pass')
  for (const k of ['forcing', 'high-danger']) claim(cmp[k].contrast.lo > 0 && cmp[k].pHolm < rule.alpha && cmp[k].moment.err.hi < 0,
    `${k} clears its comparison conditions but the placebo blocks it`)
  claim(cmp['after-opp-error'].moment.err.lo < 0 && cmp['after-opp-error'].moment.err.hi > 0 && cmp['after-opp-error'].contrast.lo < 0 && cmp['after-opp-error'].contrast.hi > 0,
    'after-opponent-error intervals do not resolve either difference')
  for (const key of ['tenStrata', 'zeroIncrementSlow']) claim(a.sensitivity[key].all.err.lo < 0 && a.sensitivity[key].all.err.hi > 0,
    `${key} overall interval crosses zero`)
  claim(cmp.forcing.noneSamePlayers.valuePerMinute.value < 0 && cmp['high-danger'].noneSamePlayers.valuePerMinute.value < 0,
    'the favorable contrasts include negative paired-none point values')
}

export const signed = (x, digits = 3) => x == null ? 'cannot tell' : `${x >= 0 ? '+' : ''}${x.toFixed(digits)}`
export function intervalText(x, scale = 1) {
  if (x == null || x.value == null || !Number.isFinite(x.value)) return 'cannot tell'
  if (x.lo == null || x.hi == null || !Number.isFinite(x.lo) || !Number.isFinite(x.hi))
    return `${signed(scale * x.value)} (interval unavailable)`
  return `${signed(scale * x.value)} (${signed(scale * x.lo)} to ${signed(scale * x.hi)})`
}
