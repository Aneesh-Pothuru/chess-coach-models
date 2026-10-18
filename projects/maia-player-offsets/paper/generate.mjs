// Protocol only. Refuses a stale report or any phase-2 result; results need new prose.
import fs from 'node:fs'
import { join } from 'node:path'
import { Generated, esc, fixed } from '../../paper.mjs'
import { LAB_DIR, projectDir } from '../../../bridge/lib/chess.mjs'
import { hash } from '../io.mjs'
const root = projectDir('maia-player-offsets')
const r = JSON.parse(fs.readFileSync(join(root, 'results/phase1.json'), 'utf8'))
const pin = JSON.parse(fs.readFileSync(join(LAB_DIR, 'bridge/chess.json'), 'utf8'))
const check = (yes, message) => { if (!yes) throw new Error(message) }
check(r.phase === 1 && r.decisionMetricsComputed === false && !fs.existsSync(join(root, 'results/offsets.json')), 'paper is phase 1 only; update its claims for results')
check(r.app === pin.commit && r.records === pin.records, 'paper app/records differ from pin')
check(r.provenance.design === hash(join(root, 'design.mjs')), 'design changed after count report')
for (const [file, digest] of Object.entries(r.provenance.sourceHashes)) check(hash(join(LAB_DIR, file)) === digest, 'protocol source changed after count report')
check(r.data.fit.games === r.data.held.games && r.data.fit.games + r.data.held.games === r.data.games, 'equal-halves claim failed')
check(r.data.fit.moves + r.data.held.moves === r.data.moves && r.work.byShard.reduce((a, b) => a + b, 0) === r.work.movePolicyCalls, 'count identity failed')
check(r.data.frozenCases.overlap.unmatched === 0 && r.data.frozenCases.ratingMismatch === 0 && r.data.frozenCases.sideMismatch === 0, 'complete case join claim failed')
check(r.design.A === 441 && r.design.B === 147 && r.design.slopes.every(b => b > -1), 'candidate-family claim failed')
check(r.timing.review.games === 2 && r.timing.policies.reduce((s, t) => s + t.rows, 0) === 32, 'timing slice changed')
check(r.packagesInstalled.length === 0 && r.weights.wasCached === false, 'setup prose changed')
const out = new Generated('projects/maia-player-offsets/paper/generate.mjs')
const defs = {
  Phase: r.phase, ModelName: 'Maia-2', AppCommit: `\\texttt{${r.app}}`, RecordsCommit: `\\texttt{${r.records}}`,
  Games: r.data.games, Moves: r.data.moves, FitGames: r.data.fit.games, FitMoves: r.data.fit.moves,
  HeldGames: r.data.held.games, HeldMoves: r.data.held.moves, EmptyGames: r.data.zeroMoveGames,
  FrozenGames: r.data.frozenCases.total, GuardGames: r.data.frozenCases.overlap.held,
  RecordedEvents: r.data.recordedEvents.held.events, RecordedExact: r.data.recordedEvents.held.exact,
  Base: r.design.baseline, ACount: r.design.A, BCount: r.design.B,
  OffsetMin: Math.min(...r.design.offsets), OffsetMax: Math.max(...r.design.offsets), OffsetStep: r.design.offsets[1] - r.design.offsets[0],
  Anchor: r.protocol.anchor, SlopeList: r.design.slopes.map(x => fixed(x, 2)).join(', '),
  Draws: r.design.draws, Seed: r.design.seed, GuardMargin: fixed(r.design.guardMargin, 3),
  OrdinaryCI: r.protocol.ordinaryCI, AdjustedCI: r.protocol.adjustedCI, Alpha: r.protocol.alpha, GuardCells: r.protocol.guardCells, MinPly: r.protocol.minPly, MinClock: r.protocol.minClock, ErrorLoss: r.protocol.errorLoss,
  PolicyCalls: r.work.movePolicyCalls, SampleMoves: r.timing.policies.reduce((s, t) => s + t.rows, 0),
  SampleCalls: r.timing.policies.reduce((s, t) => s + t.calls, 0),
  PolicySeconds: fixed(Math.max(...r.timing.policies.map(t => t.seconds)), 2),
  CallMS: fixed(1000 * r.timing.secondsPerCall, 2), Startup: fixed(r.timing.startupSeconds, 3),
  ReviewGames: r.timing.review.games, ReviewPlies: r.timing.review.plies, ReviewSeconds: fixed(r.timing.review.wallSeconds, 2),
  FullHours: fixed(r.cost.totalHours, 2), PlanningHours: fixed(r.cost.planningHours, 2),
  Processes: r.cost.processes, Nice: r.cost.nice, Allowance: r.protocol.allowance,
  StorageMB: fixed(r.cost.estimatedPolicyBytes / 1e6, 0), WeightsMB: fixed(r.weights.bytes / 1e6, 2),
}
for (const [key, value] of Object.entries(defs)) out.def(key, value)
out.block('CostTable', [
  '\\begin{tabular}{lrr}\\toprule Step & Work & Projected hours \\\\ \\midrule',
  `Move policies & ${r.work.movePolicyCalls} & ${fixed(r.cost.moveSeconds / 3600, 2)} \\\\`,
  `Routine reviews & ${r.work.heldReviewGames} games & ${fixed(r.cost.reviewSeconds / 3600, 2)} \\\\`,
  `Punish policies (old-event estimate) & ${r.work.recordedHeldPunishCalls} & ${fixed(r.cost.punishSeconds / 3600, 3)} \\\\`,
  '\\bottomrule\\end{tabular}',
].join('\n'))
out.write(join(root, 'paper/generated.tex'))
console.log('wrote phase-1 generated.tex after checking its claims')
