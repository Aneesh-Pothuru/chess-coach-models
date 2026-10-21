// Final publication only: frozen public aggregates, no app or private inputs.
// Refuses to write when a tagged prose claim or source identity no longer holds.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { Generated, esc, fixed, percent, word } from './format.mjs'
import { loadPublicationInputs } from '../publication.mjs'
import { validateFinalClaims } from './final-checks.mjs'
import { addTables } from './tables.mjs'

const dir = fileURLToPath(new URL('.', import.meta.url))
const inputs = loadPublicationInputs()
const { compare: c, acquisition: a, phase1: p, rule, hashes, sourceClaims } = inputs
const validated = validateFinalClaims(inputs, readFileSync(join(dir, 'paper.tex'), 'utf8'))
const g = new Generated('second-look-fresh/paper/generate.mjs')
const count = n => n.toLocaleString('en-US')
const pp = n => `${n > 0 ? '$+$' : ''}${percent(n, 2)}`
const ci = interval => `${pp(interval.lo)} to ${pp(interval.hi)}`
const stages = a.driver.stageTiming
const stage = name => stages.find(row => row.group === name)
const definitions = {
  Cases: count(c.games), Plies: count(p.counts.plies),
  VerifyNodes: count(p.determinism.budgets[0]), AdaptiveNodes: count(p.determinism.budgets[1]),
  Candidates: word(rule.referenceMultiPv), ReferenceNodes: count(rule.referenceNodes),
  Threads: word(c.nodeOptions.Threads), HashSize: c.nodeOptions.Hash, DeviceHashSize: sourceClaims.deviceHash,
  DeterminismComparisons: count(p.determinism.pairedComparisons), DeterminismPositions: word(p.determinism.positions),
  Draws: count(rule.draws), PoissonMean: 1, Seed: String(rule.seed), Effects: word(rule.effects),
  Confidence: percent(1 - rule.alpha, 0), CorrectedConfidence: percent(c.correctedCoverage, 6),
  AgreementLine: percent(rule.agreement, 0), QualityMargin: percent(rule.qualityMargin, 0),
  ReferenceRetries: word(rule.referenceAttempts - 1), ReferencePositions: count(c.reference.positions),
  PhoneMissChange: pp(c.gaps.phone.deltaMiss.value), PhoneMissChangeInterval: ci(c.gaps.phone.deltaMiss.corrected),
  DesktopBaselineError: percent(c.quality.desktop.baselineError.value, 2),
  DesktopCandidateError: percent(c.quality.desktop.candidateError.value, 2),
  DesktopErrorChange: pp(c.quality.desktop.deltaError.value), DesktopErrorInterval: ci(c.quality.desktop.deltaError.corrected),
  PairedDepthMedian: word(c.cost.phone.commonLookChange.acceptedDepth.median),
  AcceptedRetries: word(a.acquisition.allAcceptedRetries), OriginalIncomplete: count(validated.original.savedPostTeachingGuardIncomplete),
  Amendments: word(inputs.amendments.length),
  OriginalObserved: word(validated.original.observedGames), OriginalMissing: count(validated.original.observedMissingGames),
  ContinuationHours: fixed(a.driver.runs[0].finishedCalendarSeconds / 3600, 2),
  QuietHours: fixed(a.driver.quiet.completedWaitCalendarSeconds.sum / 3600, 2),
  ReplayMinutes: fixed(stage('replay-processes').calendarSeconds.sum / 60, 2),
  ReferenceWorkers: word(stage('reference-workers').finishedProcesses),
  ReferenceHours: fixed(stage('reference-workers').calendarSeconds.max / 3600, 2),
  AnalysisSeconds: fixed(stage('analysis').calendarSeconds.sum, 3),
  AppCommit: esc(c.appCommit), RecordsCommit: esc(c.recordsCommit), Engine: esc(c.engine),
}
for (const [name, value] of Object.entries(definitions)) g.def(name, value)
g.block('TimeControls', Object.entries(p.counts.timeControls).map(([label, n]) => {
  const control = JSON.parse(label)
  return `${count(n)} ${n === 1 ? 'game' : 'games'} at ${count(control.base)} seconds with ${count(control.inc)} seconds increment`
}).join('; ') + '.')
const printedTables = new Set(['GapTable', 'GapChangeTable', 'QualityTable', 'CostTable'])
addTables({ block(name, latex) { if (printedTables.has(name)) g.block(name, latex) } }, c)

const stack = lines => `\\shortstack[r]{${lines.join(' \\\\ ')}}`
const right = '>{\\raggedleft\\arraybackslash}X'
const nat = n => n === null ? 'unknown' : count(n)
const acquisitionLabel = { frozen: 'frozen', 'original-superseded': 'superseded', 'rebuilt-current-accepted': 'rebuilt' }
g.block('AcquisitionTable', [
  '{\\footnotesize\\setlength{\\tabcolsep}{3pt}',
  `\\begin{tabularx}{\\textwidth}{@{}ll${right}${right}${right}${right}@{}}`,
  '\\toprule', ['arm / profile', 'batch', stack(['final deep', 'incomplete / all']),
    stack(['app', 'partial']), stack(['observed', 'games / all']),
    stack(['raw looks', 'incomplete / all'])].join(' & ') + ' \\\\', '\\midrule',
  ...a.rows.map(row => [esc(`${row.arm} / ${row.profile}`), acquisitionLabel[row.acquisition],
    `${nat(row.savedPostTeachingGuardIncomplete)} / ${nat(row.savedPostTeachingDeep)}`,
    nat(row.savedAppCoveragePartial), `${nat(row.observedGames)} / ${nat(row.canonicalGames)}`,
    `${nat(row.fullBatchObservedGuardIncomplete)} / ${nat(row.fullBatchObservedLooks)}`].join(' & ') + ' \\\\'),
  '\\bottomrule\\end{tabularx}',
  `\\par\\smallskip\\raggedright Final deep evidence is saved after teaching; raw looks use accepted pre-teaching replays. The superseded batch's ${nat(validated.original.observedGames)} observed games contain ${nat(validated.original.observedGuardIncomplete)} incomplete looks out of ${nat(validated.original.observedLooks)}; its full-batch count is unknown. App partial is the separate \\texttt{coverage.partial} count.\\par}`,
].join('\n'))
g.block('ProvenanceTable', [
  '{\\footnotesize\\setlength{\\tabcolsep}{3pt}',
  '\\begin{tabularx}{\\textwidth}{@{}lX@{}}\\toprule',
  ...Object.entries({ 'design manifest': hashes.design, 'candidate manifest': c.candidateSha256,
    'comparison report': hashes.compare, 'final acquisition report': hashes.acquisition,
    'final acquisition amendment': hashes.fourthAmendment }).map(([label, digest]) =>
    `${label} & \\texttt{${digest}} \\\\`),
  '\\bottomrule\\end{tabularx}}',
].join('\n'))
g.write(join(dir, 'generated.tex'))
console.log(`Wrote final paper quantities after ${validated.checked.length} claim groups; no searches, estimates or PDF compilation.`)
