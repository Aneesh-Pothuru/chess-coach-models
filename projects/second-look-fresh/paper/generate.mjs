// Acquisition-only paper. No comparison or chess verdict is computed here.
// Every empirical claim is checked against recomputed descriptive aggregates,
// immutable acquired bytes, original source hashes and timestamped run logs.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { Generated, esc, fixed, percent, word } from '../../paper.mjs'
import { RULE } from '../rules.mjs'
import { readDesign, verifyDesignCode } from '../provenance.mjs'
import { readAmendment } from '../execution.mjs'
import { collectStatus } from '../acquisition-status.mjs'
import { claim, validateDesign, validateAmendment, validateSourceClaims } from './checks.mjs'
import { addAcquisitionTable } from './acquisition.mjs'
import { addExecutionTable } from './tables.mjs'

const dir = fileURLToPath(new URL('.', import.meta.url))
const lab = fileURLToPath(new URL('../../../', import.meta.url))
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b, label) => claim(JSON.stringify(a) === JSON.stringify(b), label)
const local = path => {
  const result = realpathSync(path)
  claim(result.startsWith(realpathSync(lab) + '/'), 'paper inputs stay inside this clone')
  return result
}
const r = read(join(dir, '../results/acquisition-status.json'))
// This reads and recomputes all seven cells, first journals and diagnostics,
// revalidates original and acquired hashes, re-parses execution logs, rejects
// active workers or deciding outputs, and never creates a missing checkpoint.
same(r, await collectStatus({ writeCheckpoint: false }), 'the stopped report exactly reproduces from the preserved files')
claim(r.status === 'blocked: exact reproduction failed' && r.noVerdict
  && !r.exactReproductionPassed && r.acceptedExactReproductionPassed,
  'acquisition stopped at the original equality gate, with no verdict')
claim(r.noDecidingOutputs && r.noDecidingOutputsBeforeAmendment
  && r.referencesNotStarted && r.analysisNotStarted && r.noActiveWorkers,
  'references and deciding analysis never started and the project workers stopped')
claim(r.firstOutputsRetained && r.frozenAndArchivedUnchanged,
  'frozen outputs, archived originals and every produced first output are unchanged')

const phase1 = read(join(dir, '../results/phase1.json'))
const execution = read(join(dir, '../results/execution.json'))
const pin = read(join(lab, 'bridge/chess.json'))
const root = local(join(lab, 'private/second-look-fresh'))
const prepared = read(join(root, 'manifest.json'))
const candidate = read(join(root, 'candidate-manifest.json'))
const casesBytes = readFileSync(join(root, 'cases.json'))
const cases = JSON.parse(casesBytes)
const appDir = local(join(lab, '.cache/chess', pin.commit))
const candidateDir = local(join(lab, '.cache/chess/candidates/second-look-fresh'))
const design = readDesign(), amendment = readAmendment(), code = verifyDesignCode()
validateDesign(design, r)
validateAmendment(amendment, design)
claim(code.designSha256 === r.designSha256 && code.protocolUnchanged
  && amendment.amendmentSha256 === r.amendmentSha256, 'original protocol and approved amendment are intact')
claim(r.appCommit === pin.commit && r.recordsCommit === pin.records
  && prepared.appCommit === pin.commit && prepared.recordsCommit === pin.records,
  'the pin and prepared provenance match the acquisition')
claim(r.casesSha256 === prepared.casesSha256 && r.casesSha256 === hash(casesBytes)
  && cases.length === RULE.games && r.games === RULE.games, 'the complete frozen sample is retained')
claim(candidate.candidateSha256 === r.candidateSha256, 'the measured candidate matches its manifest')
const source = validateSourceClaims({ appDir, candidateDir, candidateManifest: candidate,
  recipePath: join(dir, '../candidate.mjs'), pin })
for (const [arm, checkout] of [['baseline', appDir], ['candidate', candidateDir]]) {
  claim(local(join(checkout, 'tools/coach-review/.cache')) === local(join(root, arm, 'runtime-cache')),
    'each runtime cache stays in its own private arm directory')
}
same(phase1.rule, RULE, 'phase one and the current fixed rule agree')
claim(phase1.phase === 1 && phase1.comparisonComputed === false,
  'the timing and determinism phase computed no comparison')
for (const key of ['appCommit', 'recordsCommit', 'casesSha256', 'candidateSha256'])
  same(phase1[key], r[key], `phase-one ${key} agrees`)
claim(phase1.counts.games === r.games
  && phase1.counts.plies === cases.reduce((n, c) => n + c.plies, 0)
  && phase1.counts.positions === phase1.counts.plies + r.games,
  'sample counts describe all frozen plies and positions')
claim(Object.values(phase1.counts.timeControls).reduce((a, b) => a + b, 0) === r.games,
  'time-control counts cover the full sample')
claim(phase1.nodeOptions.Threads === 1 && phase1.nodeOptions.Hash === 128,
  'the Node study uses the registered thread and hash settings')
const d = phase1.determinism
claim(d.passed && d.identical === d.pairedComparisons && d.candidateSha256 === r.candidateSha256
  && d.positions === 2 && d.profiles === RULE.profiles.length
  && d.searches === d.positions * d.profiles * d.budgets.length
  && d.pairedComparisons === d.positions * (d.profiles - 1) * d.budgets.length,
  'the same candidate passed the small raw-search determinism gate')
claim(d.budgets.length === 2 && d.budgets[1] === 2 * d.budgets[0]
  && RULE.referenceNodes === 10 * d.budgets[0], 'the registered verification and reference budgets agree')

const first = r.retainedFirstReplays
const old = r.rows.find(row => row.acquisition === 'original')
const rebuilt = r.rows.find(row => row.acquisition === 'rebuilt')
claim(rebuilt.canonicalGames === r.games && first.rejectedGames === 1
  && first.producedGames === first.acceptedGames + first.rejectedGames
  && first.producedGames + first.missingGames === r.games
  && rebuilt.observedGames === first.acceptedGames && first.missingGames > 0,
  'the full canonical batch and stopped first-replay acquisition have the stated coverage')
claim(old.observedMissingGames > 0 && old.fullBatchObservedGuardIncomplete === null
  && rebuilt.observedMissingGames > 0 && rebuilt.fullBatchObservedGuardIncomplete === null
  && first.fullBatchGuardIncompleteLooks === null,
  'missing raw traces leave full-batch incompleteness unknown')
const diagnostic = r.rejectedReplayDiagnostic
claim(diagnostic.rejectedReplays === first.rejectedGames
  && diagnostic.observedPreTeachingEvidence.evidence === first.rejectedSubset.attemptedLooks
  && diagnostic.observedPreTeachingEvidence.guardIncomplete === 0
  && diagnostic.finalPostTeachingEvidence.canonical.guardIncomplete === 0
  && diagnostic.finalPostTeachingEvidence.replay.guardIncomplete === 0,
  'the rejected replay and both final documents have complete exact evidence')
claim(diagnostic.changedPositionRows > 0
  && diagnostic.changedPositionRows === diagnostic.changedDeepEvidenceRows
  && diagnostic.changedNonDeepPositionRows === 0 && diagnostic.changedRecordRows > 0
  && diagnostic.comparableComponentMismatchReviews.coverage === 0
  && diagnostic.comparableComponentMismatchReviews.provenance === 0,
  'the differing positions change only deep evidence; records differ and coverage and provenance agree')
claim(diagnostic.calls.failedEngineCalls === 0 && diagnostic.calls.failedHumanPolicyCalls > 0
  && diagnostic.calls.failedHumanPolicyCalls === diagnostic.calls.byStageAndMethod['after-verification/humanPolicy'].failed
  && diagnostic.calls.withRecordedErrorOrReasonFields === 0,
  'the trace has later human-policy failures, no engine-call failures and no recorded error reason')

// collectStatus has re-parsed and exactly reconciled execution.json to logs.
claim(!execution.lastInvocationSucceeded && execution.successfulInvocations === 0
  && execution.runs[0].endKnown === false && execution.timingIsLowerBound,
  'the acquisition has no successful invocation and an initially unobserved end')
const amended = execution.runs.filter(run => run.amendmentSha256 !== null)
claim(amended.length === 1, 'the replacement ran in a single prescribed invocation')
const current = amended[0]
const originals = execution.runs.filter(run => run.amendmentSha256 === null)
const stage = key => current.stages.find(row => row.stage === key)
claim(current.replayEqualityFailures === first.rejectedGames && current.cliTimeoutFailures === 0
  && stage('candidate/CLI/routine').status === 'complete'
  && stage('candidate/CLI/routine').failedGames === 0
  && stage('candidate/CLI/routine').completedGames === r.games,
  'the rebuilt canonical batch completed without a logged build failure or timeout')
claim(Math.abs(current.observedClockDifferenceSeconds) < 1
  && execution.observedClockDifferenceSeconds > 3600,
  'the new failure has no large calendar-minus-monotonic gap, while the original acquisition does')
const originalReplayFailures = originals.reduce((sum, run) => sum + run.replayEqualityFailures, 0)
const originalTimeouts = originals.reduce((sum, run) => sum + run.cliTimeoutFailures, 0)
claim(originals.reduce((sum, run) => sum + run.replayEqualityFailuresByArmProfile.candidate.routine, 0) >= 2,
  'original routine reproduction failed repeatedly')
claim(originalTimeouts > 0 && execution.cliTimeoutLimitsSeconds.length === 1,
  'the original CLI logged timeouts at one unchanged limit')
const launches = readdirSync(join(root, 'run-log')).filter(name => name.endsWith('-launcher.json'))
  .map(name => read(join(root, 'run-log', name)))
const amendedLaunches = launches.filter(row => row.amendmentSha256 === r.amendmentSha256)
claim(amendedLaunches.length === 1 && amendedLaunches[0].command.includes('--amended')
  && amendedLaunches[0].pid === amendedLaunches[0].processGroup
  && statSync(local(join(root, 'run-log', amendedLaunches[0].log))).isFile(),
  'the amended wrapper has its own recorded process group and a regular output file')
claim(amendedLaunches.some(row => Number.isInteger(row.awakeHelperPid) && row.awakeHelperPid > 0)
  && readFileSync(join(dir, '../launch.py'), 'utf8').includes('["/usr/bin/caffeinate", "-i", "-w", str(child.pid)]'),
  'the launcher recorded a scoped idle-sleep helper')
claim(!existsSync(join(dir, 'paper.pdf')), 'this project has no compiled PDF')

const g = new Generated('second-look-fresh/paper/generate.mjs')
const nums = {
  Cases: r.games, Plies: phase1.counts.plies, Candidates: RULE.referenceMultiPv,
  VerifyNodes: d.budgets[0].toLocaleString('en-US'), AdaptiveNodes: d.budgets[1].toLocaleString('en-US'),
  Threads: phase1.nodeOptions.Threads, HashSize: phase1.nodeOptions.Hash, DeviceHashSize: source.deviceHash,
  DeterminismComparisons: d.pairedComparisons, DeterminismPositions: d.positions,
  DeterminismSearches: d.searches, Draws: RULE.draws, PoissonMean: 1, Seed: RULE.seed,
  Confidence: percent(1 - RULE.alpha, 0), Effects: RULE.effects,
  CorrectedConfidence: percent(1 - RULE.alpha / RULE.effects, 6),
  AgreementLine: percent(RULE.agreement, 0), QualityMargin: percent(RULE.qualityMargin, 0),
  ReferenceNodes: RULE.referenceNodes.toLocaleString('en-US'), RetryWord: word(RULE.referenceAttempts - 1),
  FrozenFiles: r.frozenFiles, ArchivedFiles: r.archivedFiles,
  FirstGames: first.producedGames, AcceptedGames: first.acceptedGames, RejectedGames: first.rejectedGames,
  MissingFirstGames: first.missingGames, MissingAcceptedGames: rebuilt.observedMissingGames,
  OriginalObservedGames: old.observedGames, OriginalMissingGames: old.observedMissingGames,
  AmendedHours: fixed(current.exactActiveWallSeconds / 3600, 3),
  AmendedCalendarHours: fixed(current.exactCalendarElapsedSeconds / 3600, 3),
  AmendedBuildHours: fixed(stage('candidate/CLI/routine').activeWallSecondsLowerBound / 3600, 3),
  AmendedReplayHours: fixed(stage('candidate/observed/routine').activeWallSecondsLowerBound / 3600, 3),
  AmendedClockDifference: fixed(current.observedClockDifferenceSeconds, 3),
  ElapsedHours: fixed(execution.activeWallSecondsLowerBound / 3600, 2),
  CalendarHours: fixed(execution.calendarElapsedSecondsLowerBound / 3600, 2),
  ClockDifferenceHours: fixed(execution.observedClockDifferenceSeconds / 3600, 2),
  UnallocatedHours: fixed(execution.unallocatedGapSeconds / 3600, 2),
  EstimatedHours: fixed(phase1.estimate.totalWallHours, 2),
  ReservedHours: fixed(phase1.estimate.planningHoursAtOneAndHalfSpeedCost, 2),
  OriginalTimeouts: originalTimeouts, OriginalReplayFailures: originalReplayFailures,
  BuildTimeoutSeconds: execution.cliTimeoutLimitsSeconds[0].toLocaleString('en-US'),
}
for (const [name, value] of Object.entries(nums)) g.def(name, value)
for (const [name, value] of Object.entries({ AppCommit: r.appCommit, RecordsCommit: r.recordsCommit,
  DesignDigest: r.designSha256, AmendmentDigest: r.amendmentSha256,
  AcquisitionCodeDigest: r.acquisitionCodeSha256, StoppedDigest: r.stoppedAcquisitionManifestSha256,
  Engine: phase1.engine })) g.def(name, esc(value))
g.block('TimeControls', Object.entries(phase1.counts.timeControls).map(([key, count]) => {
  const tc = JSON.parse(key)
  claim(Number.isInteger(tc.base) && Number.isInteger(tc.inc), 'time-control units are seconds')
  return `${count} ${count === 1 ? 'game' : 'games'} at ${tc.base} seconds with ${tc.inc} seconds increment`
}).join('; ') + '.')
g.block('FailureDescription', `The rejected replay has ${diagnostic.observedPreTeachingEvidence.evidence} raw second looks, all guard-complete. Its canonical and replay final deep evidence are also complete. The saved positions differ only in deep evidence on ${diagnostic.changedDeepEvidenceRows} rows; ${diagnostic.changedRecordRows} record rows differ. Coverage and provenance agree. No recorded engine call failed. There were ${word(diagnostic.calls.failedHumanPolicyCalls)} failed human-policy calls after verification. The retained call trace records their failure flags and durations, but no error reason.`)
g.block('FirstReplayDescription', `Across all ${first.producedGames} retained first journals, including the rejected output, ${first.guardIncompleteLooks} of ${first.attemptedLooks} attempted second looks are guard-incomplete. The rejected subset has ${first.rejectedSubset.guardIncompleteLooks} incomplete looks out of ${first.rejectedSubset.attemptedLooks}. These counts describe only the produced journals; the ${first.missingGames} missing first replays leave the full-batch raw count unknown.`)
addAcquisitionTable(g, r)
addExecutionTable(g, execution)
g.write(join(dir, 'generated.tex'))
console.log('Wrote the checked acquisition-only paper quantities; no comparison or PDF compilation.')
