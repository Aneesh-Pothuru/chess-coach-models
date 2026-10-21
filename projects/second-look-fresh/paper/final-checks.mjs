// Publication claims only. No app import, private data, search or re-estimation.
import { claim, validateReports } from './checks.mjs'

const same = (a, b, label) => claim(JSON.stringify(a) === JSON.stringify(b), label)
const contains = (text, parts, label) => claim(parts.every(part => text.includes(part)), label)
const near = (a, b, label) => claim(Math.abs(a - b) < 1e-7 * Math.max(1, Math.abs(a), Math.abs(b)), label)

/** Each named check is cited beside the prose it supports in paper.tex. The
 * shared loader has already verified every public input and original protocol
 * byte against the publication manifest. These checks validate the meanings
 * and outcome-dependent relations, independently of the stored verdict. */
export function validateFinalClaims(inputs, paper) {
  const { compare: c, acquisition: a, phase1: p, rule, hashes, design,
    amendments, diagnostics, registeredReadme: registered, sourceClaims: source } = inputs
  const derived = validateReports({ compare: c, phase1: p, rule,
    design: { manifest: design, designSha256: hashes.design } })
  const checked = new Set()
  const check = (name, test) => { test(); checked.add(name) }
  const current = a.rows.filter(row => row.acquisition !== 'original-superseded')
  const original = a.rows.find(row => row.acquisition === 'original-superseded')
  const rebuilt = a.rows.find(row => row.acquisition === 'rebuilt-current-accepted')

  check('data', () => {
    claim(c.games === rule.games && p.counts.plies === c.gaps.phone.baseline.plies,
      'all frozen games and both sides are included')
    contains(registered, ['The same 60 frozen games as `phone-vs-routine`',
      'with\nboth players\' moves', 'It does not draw a new sample or filter by time control.',
      'It is not a new\nheld-out sample'], 'the data description is the registered sample')
    claim(p.counts.partialGames === 0 && Object.values(p.counts.timeControls).reduce((x, y) => x + y, 0) === rule.games,
      'time controls and complete replay cover the whole sample')
  })
  check('candidate', () => {
    contains(registered, ['engine.newGame(\'analyst\')', 'immediately before the initial second look and',
      'before its optional adaptive retry.', 'not\nbetween its candidate search and its restricted search',
      'Teaching searches and manual rechecks\nare outside this change.',
      'The engine service sends `ucinewgame`, then `isready`, and waits\nfor `readyok`.'],
    'candidate and reset scope match the registered hash-checked recipe')
    claim(source.candidateSha256 === c.candidateSha256 && source.appCommit === c.appCommit,
      'the frozen source audit describes the measured candidate')
    claim(p.determinism.budgets[0] * 2 === p.determinism.budgets[1]
      && p.determinism.budgets[0] * 10 === rule.referenceNodes,
      'initial, adaptive and reference budgets reconcile')
  })
  check('instruments', () => {
    contains(registered, ['with the unchanged `accuracy-vs-chesscom/build-evidence.mjs`',
      'Each game has a fresh Node engine, one thread and no evaluation\ncache.',
      'It must reproduce\nthe canonical CLI document\'s positions, records, coverage and provenance.',
      'Unknown records are not serious under the\napp\'s instrument'],
    'canonical, observed and final-class instruments are registered')
    claim(c.nodeOptions.Threads === 1 && c.nodeOptions.Hash === source.nodeHash,
      'the engine options match the source audit')
  })
  check('determinism', () => {
    claim(p.determinism.passed && p.determinism.identical === p.determinism.pairedComparisons,
      'the permitted small raw-evidence determinism check passed')
    contains(registered, ['Equal\nfixed-budget reads do not require equal final documents'],
      'the determinism limit was fixed before comparison')
  })
  check('gap-method', () => {
    contains(registered, ['`isSerious(cls, judged)`', 'Each arm uses its own routine as its comparator.',
      'All played plies of both sides count', 'ratios of sums over games, not means of',
      'candidate share minus baseline share'], 'gap definition matches registration')
  })
  check('bootstrap', () => {
    claim(rule.effects === rule.devices.length * 2 + rule.profiles.length
      && c.correctedCoverage === 1 - rule.alpha / rule.effects,
      'the decision family and Bonferroni coverage match')
    contains(registered, ['Poisson(1)', 'seed 20261014', 'same game weight is used for every arm, profile, numerator and denominator',
      'Subtract the paired ratios inside each draw.', 'linear interpolation at `(n - 1) q`',
      'No effects\nare added to or removed from the family'], 'bootstrap procedure matches registration')
  })
  check('decision-rule', () => {
    claim(rule.agreement === 0.05 && rule.qualityMargin === 0.01,
      'the registered agreement bar and noninferiority margin remain fixed')
    contains(registered, ['both paired point changes are strictly\n   negative',
      'upper end less than zero', 'lower end at most zero',
      'Absolute agreement alone cannot rescue a failed improvement or guard.',
      'There is no time or depth threshold'], 'strict decision boundaries and descriptive cost are registered')
    same(c.decision, derived.decision, 'the original analysis follows the independent rule')
  })
  check('quality-method', () => {
    contains(registered, ['before routine teaching\ncan replace its evidence',
      'intersection of plies\nattempted by both arms', 'not just plies whose evidence was complete',
      'full game history and no evaluation\ncache', 'Use the first valid attempt.',
      '`isSerious(null, judgeMove(bestScore, playedScore, mover))`',
      'Incomplete or\nnon-exact arm evidence counts as incorrect against a valid reference.',
      'An\nunresolved reference makes the quality guard inconclusive'],
    'quality and reference definitions match registration')
    claim(rule.referenceAttempts === 2 && rule.referenceMultiPv === 3,
      'reference retry and candidate counts match the original design')
  })
  check('results-summary', () => {
    same(c.decision, { narrows: false, agrees: false, qualityPasses: false,
      qualityWorse: false, disposition: 'do not keep: inconclusive' }, 'the written disposition holds')
    claim(rule.devices.every(profile => ['deltaMiss', 'deltaExtra'].every(key => c.gaps[profile][key].value < 0)),
      'every device share point estimate falls')
    claim(c.gaps.phone.narrows && !c.gaps.desktop.narrows
      && rule.profiles.every(profile => c.quality[profile].status === 'unclear'),
      'only the phone narrows and every quality guard is inconclusive')
  })
  check('gap-results', () => {
    claim(c.gaps.phone.deltaMiss.corrected.hi < 0 && c.gaps.phone.deltaExtra.corrected.lo < 0
      && c.gaps.phone.deltaExtra.corrected.hi > 0, 'phone miss supplies the narrowing result')
    claim(['deltaMiss', 'deltaExtra'].every(key => c.gaps.desktop[key].corrected.lo < 0
      && c.gaps.desktop[key].corrected.hi > 0), 'both desktop change intervals include zero')
    claim(rule.devices.every(profile => c.gaps[profile].candidate.extra.interval95.hi > rule.agreement),
      'each candidate extra-share upper bound blocks absolute agreement')
  })
  check('quality-results', () => {
    claim(c.reference.positions === c.reference.attempts && c.reference.unresolved === 0,
      'every reference resolved on its first attempt')
    for (const profile of rule.profiles) {
      const row = c.quality[profile]
      claim(row.referenceUnresolved === 0 && row.baselineIncomplete === 0 && row.candidateIncomplete === 0
        && row.deltaError.valid && row.deltaError.validDraws === rule.draws
        && row.deltaError.corrected.hi > rule.qualityMargin
        && row.deltaError.corrected.lo < rule.qualityMargin,
      `${profile}: complete evidence, all draws, and an interval spanning the margin`)
    }
    const d = c.quality.desktop.deltaError
    claim(d.value > 0 && d.corrected.lo > 0 && d.corrected.lo < rule.qualityMargin,
      'desktop reference disagreement rises, but its lower bound does not exceed the margin')
    claim(c.quality.phone.deltaError.value < 0 && c.quality.routine.deltaError.value > 0,
      'phone and routine quality point directions are as written')
  })
  check('cost-results', () => {
    for (const profile of rule.profiles) {
      const row = c.cost[profile]
      claim(row.candidate.secondsPerLook.mean < row.baseline.secondsPerLook.mean
        && row.candidate.acceptedDepth.mean < row.baseline.acceptedDepth.mean
        && row.candidate.acceptedDepth.median === row.baseline.acceptedDepth.median
        && row.commonLookChange.acceptedDepth.median === 0,
      `${profile}: measured means fall while the median retained depth is unchanged`)
    }
    claim(a.acquisition.allAcceptedRetries > 0
      && a.preservedTimingGroups.find(row => row.group === 'old-first-overlaps-reported-load').outcomes.accepted > 0,
      'the accepted cost sample includes loaded first outputs and prescribed retries')
    contains(a.limitations.join('\n'), ['does not reserve the machine', 'do not substitute quiet timings'],
      'timing groups do not replace the registered accepted timing sample')
  })
  check('acquisition', () => {
    claim(amendments.length === 4 && a.complete && a.acquisition.acceptedGames === rule.games
      && a.acquisition.allProducedFirstOutputs === rule.games && a.acquisition.allAcceptedRetries === 2,
      'acquisition completed with the prescribed amendments and accepted retries')
    claim(amendments.every(amendment => amendment.protocol.start.includes('approved before the comparison')),
      'every frozen amendment is explicitly registered before the comparison')
    claim(amendments[0].replacement.games === rule.games && amendments[0].replacement.profile === 'routine'
      && amendments[0].replacement.arm === 'candidate', 'the entire candidate routine batch was replaced')
    const h = diagnostics.human.classification
    claim(diagnostics.human.noNewSearchOrJudgment
      && diagnostics.suspension.noSearchOrDecidingMetricRun
      && diagnostics.suspension.decidingMetricsRead === false,
      'the preserved amendment diagnostics precede deciding analysis and ran no search')
    claim(h.accepted && h.aggregate.unresolvedDifferingRows === 0 && !h.uniqueCausalityProven
      && h.aggregate.failedHumanPolicyCalls === 2 && h.aggregate.failedEngineCalls === 0,
      'the retained human-policy failure has a downstream account, not unique causality')
    const s = a.preservedSuspension
    claim(s.priorClassification.qualifies === false && !s.priorClassification.deadlineTerminationProven
      && s.priorClassification.suspensionDocumented && s.downstream.allRowsDownstream
      && s.fourthRule.qualifiesForPrescribedRetry && !s.fourthRule.deadlineEvidenceRequired,
      'the earlier deadline refusal is preserved and the later sleep rule is distinct')
    claim(a.acquisition.preservedFirstFailuresUnderFourthRule['human-policy'] === 1
      && a.acquisition.preservedFirstFailuresUnderFourthRule.suspension === 1,
      'the preserved first failures have the stated two acquisition paths')
    claim(a.acquisition.fourthOutcomeCounts.accepted === a.acquisition.fourthProducedAttempts
      && a.acquisition.failedCallsAcrossFourthAttempts.failed === 0,
      'every final continuation replay passed with no failed port call')
  })
  check('incomplete', () => {
    claim(a.rows.length === rule.profiles.length * 2 + 1 && original && rebuilt && current.length === rule.profiles.length * 2,
      'all prescribed arm/profile cells and the old routine are shown')
    for (const row of a.rows) {
      claim(row.canonicalGames === rule.games && row.observedGames + row.observedMissingGames === rule.games,
        'each completeness denominator is explicit')
      if (row.observedMissingGames) claim(row.fullBatchObservedLooks === null && row.fullBatchObservedGuardIncomplete === null,
        'missing traces leave full-batch counts unknown')
      else claim(row.fullBatchObservedLooks === row.observedLooks
        && row.fullBatchObservedGuardIncomplete === row.observedGuardIncomplete,
        'complete trace coverage reconciles to the whole batch')
    }
    claim(original.savedPostTeachingGuardIncomplete > 0 && original.observedMissingGames > 0,
      'the superseded routine has incomplete saved evidence and missing raw traces')
    claim(current.every(row => row.observedMissingGames === 0 && row.savedPostTeachingGuardIncomplete === 0
      && row.observedGuardIncomplete === 0), 'all accepted study evidence is complete under the registered guard')
    for (const row of current) {
      const coverage = c.coverage[row.profile][row.arm]
      same(row.observedLooks, coverage.initialLooks, 'accepted raw-look counts reconcile to comparison')
      same(row.observedGuardIncomplete, coverage.incompleteSecondLooks, 'accepted incompleteness reconciles to comparison')
    }
    claim(a.rebuiltAllProducedFirstOutputs.observedGames === rule.games
      && a.rebuiltAllProducedFirstOutputs.observedGuardIncomplete === 0,
      'all rebuilt first traces, including rejected ones, are guard-complete')
  })
  check('runtime', () => {
    const driver = a.driver, stages = driver.stageTiming
    claim(driver.runs.length === 1 && driver.runs[0].state === 'finished-successfully'
      && driver.runs[0].exitCode === 0, 'the final detached continuation completed')
    claim(driver.quiet.recordedPendingWaits === 0
      && driver.quiet.receipts === a.acquisition.fourthProducedAttempts
      && driver.power.receipts === a.acquisition.fourthProducedAttempts
      && driver.power.failedReplayLogCaptures === 0,
      'all continuation replays have completed quiet and power receipts')
    claim(['Sleep', 'Wake', 'DarkWake'].every(key => driver.power.replayPowerEventCounts[key] === 0),
      'the continuation replay power logs have no sleep or wake event')
    claim(stages.find(row => row.group === 'reference-workers').finishedProcesses === 2
      && stages.find(row => row.group === 'analysis').finishedProcesses === 1,
      'the registered parallel references and analysis completed')
    for (const row of stages.filter(row => row.group !== 'awake-assertions'))
      claim(row.startedProcesses === row.finishedProcesses && row.nonzeroExits === 0,
        'all measured work processes exited successfully')
    const run = driver.runs[0]
    near(run.finishedCalendarSeconds - run.finishedMonotonicSeconds,
      run.finishedCalendarMinusMonotonicSeconds, 'final continuation clock difference reconciles')
  })
  check('app', () => {
    claim(source.savedDeviceFirst && source.coachComparisonAvailable
      && source.deviceHash < source.nodeHash, 'saved-review behavior and device limits match the source audit')
    contains(registered, ['A kept candidate becomes a separate port.',
      'Existing reviews therefore keep their old judgments\nuntil an explicit rebuild.',
      'No migration or invalidation is part of this\ncandidate.'], 'the candidate has no port or migration within this study')
    claim(c.decision.disposition === 'do not keep: inconclusive', 'the app takes no port from this outcome')
  })
  check('limits', () => {
    contains(registered, ['not a new\nheld-out sample', 'common attempted plies',
      'Stockfish evidence, not ground truth', 'a fresh reference can favor a'], 'sample, common-set and fresh-reference limits were registered')
    claim(c.nodeOptions.Hash === source.nodeHash && c.nodeOptions.Hash > source.deviceHash,
      'the Node profile study is not a device-hardware experiment')
  })
  check('record', () => {
    claim(a.comparisonSha256 === hashes.compare && a.fourthAmendmentSha256 === hashes.fourthAmendment
      && a.preservedSuspensionDiagnosticSha256 === hashes.suspensionDiagnostic,
      'the final reports and amendment identities agree')
    same(c.rule, p.rule, 'no statistical rule changed between registration and final analysis')
    same(c.decision, derived.decision, 'the final conclusion uses the original estimator outputs')
    claim(a.analysisProcessesStarted === 1 && a.referenceProcessesStarted === 2,
      'the final report records the prescribed reference and analysis sequence')
  })

  const names = [...paper.matchAll(/^% claim: ([a-z-]+)$/gm)].map(match => match[1])
  claim(names.length > 0 && names.every(name => checked.has(name)), 'every prose claim tag has a passing check')
  claim([...checked].every(name => names.includes(name)), 'every checked claim group is tied to the prose')
  return { derived, original, rebuilt, current, checked: [...checked] }
}
