// No private data or estimates: make incompatible saved claims fail closed.
import assert from 'node:assert/strict'
import { loadReport, validateReport, checkFindings, intervalText } from './publication.mjs'

const saved = loadReport()
checkFindings(saved)
assert.equal(intervalText({ value: .1, lo: null, hi: null }, 100), '+10.000 (interval unavailable)')
assert.equal(intervalText(null), 'cannot tell')
let cases = 0
function refuses(label, mutate, verify, pattern) {
  const changed = structuredClone(saved)
  mutate(changed)
  assert.throws(() => verify(changed), pattern, label)
  cases++
}
refuses('changed move inputs', r => r.analysis.fingerprint = 'different', validateReport, /frozen moves/)
refuses('changed rule', r => r.analysis.rule = { ...r.rule, placeboMargin: .02 }, validateReport, /registered rule/)
refuses('changed matched cohort', r => r.analysis.comparisons.forcing.support.supportedPlayers--, validateReport, /unchanged support/)
refuses('published keep bypasses the placebo', r => r.analysis.comparisons.forcing.verdict = 'keep', validateReport, /stored verdict/)
refuses('placebo cannot be called untrustworthy', r => r.analysis.checks.placeboStatus = 'untrustworthy', validateReport, /placebo gate/)
refuses('missing candidate', r => delete r.analysis.comparisons['after-opp-error'], validateReport, /all comparisons/)
refuses('correction must keep the full family', r => r.analysis.comparisons.forcing.pHolm /= 2, validateReport, /Holm arithmetic/)
refuses('a different valid overall direction needs new prose', r => { r.analysis.checks.overallPass = false; r.analysis.checks.all.err.hi = .001 }, checkFindings, /more time cuts/)
refuses('a placebo interval inside tolerance needs new prose', r => r.analysis.checks.placebo.err.lo = -.009, checkFindings, /lower tolerance/)
refuses('loss of forcing evidence needs new prose', r => r.analysis.comparisons.forcing.pHolm = .1, checkFindings, /forcing clears/)
refuses('resolved leading candidate needs new prose', r => r.analysis.comparisons['after-opp-error'].contrast.lo = .01, checkFindings, /after-opponent-error/)
refuses('sensitivity direction needs new prose', r => r.analysis.sensitivity.tenStrata.all.err.hi = -.001, checkFindings, /tenStrata overall/)
console.log(`Publication checks passed; ${cases} incompatible inputs refused.`)
