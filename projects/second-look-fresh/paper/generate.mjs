// A phase-one paper only. Every printed quantity is generated from the
// aggregate report or the fixed rule; there is no comparison claim yet.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { Generated, esc, fixed, percent } from '../../paper.mjs'
import { LAB_DIR } from '../../../bridge/lib/lab.mjs'
import { RULE } from '../rules.mjs'

const dir = fileURLToPath(new URL('.', import.meta.url))
const file = join(dir, '../results/phase1.json')
const r = JSON.parse(readFileSync(file, 'utf8'))
const assert = (ok, message) => { if (!ok) throw new Error(message) }
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const hash = value => createHash('sha256').update(value).digest('hex')
const pin = read(join(LAB_DIR, 'bridge/chess.json'))
assert(r.appCommit === pin.commit && r.recordsCommit === pin.records, 'the paper report no longer matches the app or records pin')
const privateRoot = join(LAB_DIR, 'private/second-look-fresh')
const localManifest = join(privateRoot, 'manifest.json')
if (existsSync(localManifest)) {
  const inputs = read(localManifest)
  assert(r.appCommit === inputs.appCommit && r.recordsCommit === inputs.recordsCommit && r.casesSha256 === inputs.casesSha256, 'the paper report no longer matches the prepared inputs')
  const cases = join(privateRoot, 'cases.json')
  if (existsSync(cases)) assert(r.casesSha256 === hash(readFileSync(cases)), 'the paper report no longer matches the frozen cases')
}
const localCandidate = join(privateRoot, 'candidate-manifest.json')
if (existsSync(localCandidate)) {
  const candidate = read(localCandidate)
  const { candidateSha256, ...payload } = candidate
  assert(candidateSha256 === hash(JSON.stringify(payload)), 'candidate manifest digest differs')
  assert(r.candidateSha256 === candidateSha256 && candidate.appCommit === pin.commit && candidate.recordsCommit === pin.records, 'the paper report measured a different candidate')
  assert(candidate.recipeSha256 === hash(readFileSync(join(dir, '../candidate.mjs'))), 'the candidate recipe changed after the report')
}
assert(!existsSync(join(dir, '../results/compare.json')), 'the phase-one paper cannot describe a completed comparison')
assert(r.phase === 1 && r.comparisonComputed === false, 'this paper requires phase-one data only')
assert(r.counts.games === RULE.games && r.counts.partialGames === 0, 'the whole frozen sample no longer replays')
assert(r.determinism.passed && r.determinism.identical === r.determinism.pairedComparisons, 'cleared looks no longer repeat')
assert(r.determinism.candidateSha256 === r.candidateSha256, 'the determinism check measured a different candidate')
assert(JSON.stringify(r.rule) === JSON.stringify(RULE), 'the rule changed after the report')
assert(r.timing.length === RULE.profiles.length * 2 && r.timing.every(t => t.failedCalls === 0), 'timing slice incomplete or failed')
assert(r.estimate.totalWallHours > 0 && r.estimate.allPliesTwoAttemptsWallHours >= r.estimate.totalWallHours, 'invalid cost estimate')
assert(r.packagesInstalled === false, 'the no-installation claim no longer holds')
const g = new Generated('second-look-fresh/paper/generate.mjs')
const nums = { Phase: r.phase, Cases: r.counts.games, Plies: r.counts.plies,
  Positions: r.counts.positions, Nonterminal: r.counts.nonterminalPositions,
  TablebasePositions: r.counts.tablebasePositions, SlicePlies: r.sample.plies,
  Draws: RULE.draws, Seed: RULE.seed, Confidence: 100 * (1 - RULE.alpha),
  CorrectedConfidence: fixed(100 * (1 - RULE.alpha / RULE.effects), 6), Effects: RULE.effects,
  AgreementLine: percent(RULE.agreement, 0), QualityMargin: percent(RULE.qualityMargin, 0),
  ReferenceNodes: RULE.referenceNodes.toLocaleString('en-US'), Candidates: RULE.referenceMultiPv,
  VerifyNodes: r.determinism.budgets[0].toLocaleString('en-US'), AdaptiveNodes: r.determinism.budgets[1].toLocaleString('en-US'),
  DeterminismPositions: r.determinism.positions, DeterminismSearches: r.determinism.searches,
  DeterminismComparisons: r.determinism.pairedComparisons, HashSize: r.nodeOptions.Hash,
  Threads: r.nodeOptions.Threads, WorkerLimit: 2, PoissonMean: 1,
  CanonicalDocuments: r.estimate.canonicalDocuments, ObservedReplays: r.estimate.observedReplays,
  ReferencePositions: fixed(r.estimate.estimatedReferencePositions, 0),
  RefSlicePositions: r.referenceTiming.positions, RefSliceSeconds: fixed(r.referenceTiming.seconds),
  RefSecondsEach: fixed(r.estimate.referenceSecondsPerPosition),
  TotalHours: fixed(r.estimate.totalWallHours), WorkHours: fixed(r.estimate.totalProcessHours),
  CliHours: fixed(r.estimate.canonicalWallHours), ReplayHours: fixed(r.estimate.observedWallHours),
  ReferenceHours: fixed(r.estimate.referenceWallHours), EnvelopeHours: fixed(r.estimate.allPliesTwoAttemptsWallHours),
  PlanningHours: fixed(r.estimate.planningHoursAtOneAndHalfSpeedCost), ReservePercent: 50,
  NominalMultiplier: RULE.referenceNodes / r.determinism.budgets[0],
  AdaptiveMultiplier: RULE.referenceNodes / r.determinism.budgets[1],
  ReferenceAttempts: RULE.referenceAttempts }
for (const [name, value] of Object.entries(nums)) g.def(name, value)
g.def('AppCommit', esc(r.appCommit)).def('RecordsCommit', esc(r.recordsCommit))
g.def('CandidateDigest', esc(r.candidateSha256)).def('CasesDigest', esc(r.casesSha256)).def('Engine', esc(r.engine))
g.block('TimingTable', [
  '\\begin{tabular}{llrrrrr}', '\\toprule',
  'arm & profile & seconds & looks & seconds/look & median depth & adaptive \\\\', '\\midrule',
  ...r.timing.map(t => `${esc(t.arm)} & ${esc(t.profile)} & ${fixed(t.seconds)} & ${t.looks} & ${fixed(t.secondsPerLook.mean)} & ${fixed(t.depth.median, 1)} & ${t.adaptiveSearches} \\\\`),
  '\\bottomrule', '\\end{tabular}',
].join('\n'))
g.block('TimeControls', Object.entries(r.counts.timeControls).map(([key, count]) => {
  const tc = JSON.parse(key)
  return `${count} ${count === 1 ? 'game' : 'games'} at ${tc.base} seconds with ${tc.inc} seconds increment`
}).join('; ') + '.')
g.write(join(dir, 'generated.tex'))
console.log('Wrote the phase-one paper quantities; no TeX compilation.')
