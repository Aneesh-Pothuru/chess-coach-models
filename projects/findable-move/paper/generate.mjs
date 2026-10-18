#!/usr/bin/env node
// Writes paper/generated.tex for the findable move: the rule's verdict and
// the descriptions (results/findable-move.json), the positions' counts
// (results/positions.json), and two positions from the private rows. It
// refuses to write when a claim the paper makes no longer holds.
//
//   bridge/run.sh projects/findable-move/paper/generate.mjs

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { chess, privateDir, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, fixed, line, movesTex, percent, word } from '../../paper.mjs'
import { DRAWS, OFFSET, PROJECT, ROLLOUTS, readJsonl } from '../lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const E = await chess('src/services/engine/index.ts')
const out = JSON.parse(readFileSync(join(resultsDir(PROJECT), 'findable-move.json'), 'utf8'))
const setup = JSON.parse(readFileSync(join(resultsDir(PROJECT), 'positions.json'), 'utf8'))
const g = new Generated('projects/findable-move/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const ci = (e) => `${fixed(e.mean, 2)} (${fixed(e.ci[0], 2)} to ${fixed(e.ci[1], 2)})`
const covers = (e, x) => e.ci[0] <= x && x <= e.ci[1]
const count = (n) => n.toLocaleString('en-US')

// ---- what was measured ----
const D = out.design
const M = D.margin
const window = E.ACCEPT_WINDOW_WP
g.def('AppCommit', out.app.commit.slice(0, 10)).def('Offset', String(OFFSET)).def('Window', String(window))
g.def('Rollouts', String(D.rollouts)).def('Plies', String(D.plies)).def('HalfPlies', word(D.plies / 2)).def('HalfRollouts', String(D.rollouts / 2))
g.def('BudgetNodes', count(E.budgetNodes(D.budget, 'node'))).def('Margin', word(M)).def('DecoyDrop', String(D.decoyDrop))
claim(D.rollouts === ROLLOUTS && D.budget === 'check', 'the report ran the design the README fixed')
claim(3 * M === window, "the margin is a third of the review's window")
g.def('NegMargin', fixed(-M, 0)).def('Draws', count(DRAWS))

const S = setup.skipped
const same = (S['turning: the move he would find is the best'] ?? 0) + (S['plan: the move he would find is the best'] ?? 0)
const withTwo = setup.examined - (S['plan: fewer than 2 candidates'] ?? 0) - (S['turning: fewer than 2 candidates'] ?? 0)
g.def('Games', String(setup.games)).def('TrainGames', String(setup.trainGames)).def('HeldoutGames', String(setup.heldoutGames))
g.def('Examined', count(setup.examined)).def('WithTwo', count(withTwo)).def('SameAsBest', count(same)).def('SameAsBestPct', percent(same / withTwo, 0))
g.def('Entering', String(setup.entering)).def('Turning', String(setup.byKind.turning)).def('Plans', String(setup.byKind.plan))
g.def('TrainPositions', String(setup.bySplit.train)).def('HeldoutPositions', String(setup.bySplit.heldout))
claim(setup.entering === setup.byKind.turning + setup.byKind.plan && setup.entering === setup.bySplit.train + setup.bySplit.heldout, 'the counts add up')
claim(setup.examined === setup.entering + Object.entries(S).filter(([k]) => !k.startsWith('game:')).reduce((s, [, n]) => s + n, 0), 'every examined position entered or was skipped for a reason')
claim(same / withTwo > 0.7, "in most positions the move his band would find is the engine's best")
const P = out.positions
const rolled = readdirSync(privateDir(PROJECT))
  .filter((f) => /^rollouts-\d+-of-\d+\.jsonl$/.test(f))
  .flatMap((f) => readJsonl(join(privateDir(PROJECT), f)))
g.def('RolloutCount', count(rolled.length))
claim(P.scored === P.entering && P.entering === setup.entering && Object.values(P.incomplete).every((n) => n === 0), 'every entering position has all its rollouts')

// ---- the controls ----
const C = out.controls
claim(out.controlsPass, 'both controls pass on both sets')
for (const s of ['train', 'heldout']) {
  claim(covers(C[s].null, 0), `the null covers zero on ${s}`)
  claim(C[s].decoy.ci[1] < -D.decoyDrop / 2, `the decoy sits well below zero on ${s}`)
}
g.def('DecoyTrainN', String(C.train.decoy.n)).def('DecoyHeldN', String(C.heldout.decoy.n))

// ---- the verdict ----
const V = out.primary
g.def('Verdict', out.verdict)
claim(out.verdict === 'unclear', 'the verdict is unclear')
for (const s of ['train', 'heldout']) {
  claim(V[s].mean < 0, `the move he would find scores below the best on ${s}`)
  claim(V[s].ci[0] < -M && V[s].ci[1] > -M, `on ${s}, a cost over the margin is neither ruled out nor shown`)
}
g.def('DFTrain', ci(V.train)).def('DFHeld', ci(V.heldout))
claim(V.train.ci[1] > 0 && V.heldout.ci[1] < 0 && V.heldout.ci[1] > -M, 'the train interval reaches above zero, the held-out one lies below zero but not below the margin')
const row = (name, f) => `${name} & ${f(C.train, V.train)} & ${f(C.heldout, V.heldout)} \\\\`
g.block(
  'RuleTable',
  [
    '\\begin{table}[ht]\\centering\\small',
    '\\begin{tabular}{lrr}',
    '\\toprule',
    ' & Train & Held out \\\\',
    '\\midrule',
    row('Games', (_, v) => String(v.games)),
    row('Positions', (_, v) => String(v.n)),
    row("Null: B's two halves", (c) => ci(c.null)),
    row('Decoy: his errors against B, $D_P$', (c) => ci(c.decoy)),
    row('\\textbf{$D_F = V(F) - V(B)$}', (_, v) => `\\textbf{${ci(v)}}`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The controls and the verdict's measure, in win\\% with 95\\% intervals from ${count(DRAWS)} bootstrap draws over games. The decoy rows are the turning points where his move lost at least ${D.decoyDrop} win\\% and is neither B nor F.}`,
    '\\label{tab:rule}',
    '\\end{table}',
  ].join('\n'),
)

// ---- what else the rollouts show (both sets) ----
const A = out.described.all
g.def('DFAll', ci(A.dF)).def('MinusDF', ci(A.minusDF)).def('RootGap', ci(A.rootGap))
g.def('FAheadPct', percent(A.shareFAhead, 0)).def('PBestPct', percent(A.meanPHisBest, 0)).def('PFindPct', percent(A.meanPHisFindable, 0))
g.def('FOverP', ci(A.fOverPlayed)).def('FOverPN', String(A.fOverPlayed.n)).def('NullWidth', fixed(A.nullWidth, 1))
claim(covers(A.minusDF, A.rootGap.mean), "what the move costs in human hands covers the engine's own gap")
claim(A.minusDF.ci[0] > 0, 'pooled, the move he would find costs something')
claim(A.meanPHisFindable > 3 * A.meanPHisBest, 'his band plays the move he would find over three times as often as the best')
claim(A.fOverPlayed.ci[0] > 10, 'the move he would find scores far above the move he played')
claim(A.shareFAhead > 0.35 && A.shareFAhead < 0.5, 'the move he would find comes out ahead in a large minority of positions')
const Q = A.byBestKind
claim(Q.forcing.ci[1] < 0 && covers(Q.quiet, 0), 'the cost is clear when the best is forcing and may be nothing when it is quiet')
claim(Q.forcing.mean < 2 * Q.quiet.mean, 'the cost is larger when the best is forcing')
const K = A.byKind
const H = A.byPhase
claim(K.turning.mean < K.plan.mean && H.middlegame.mean < H.opening.mean && H.endgame.mean < H.opening.mean, 'the cost is larger at turning points than at plan checkpoints, and in the middlegame and endgame than in the opening')
claim(A.minusDF.mean > 0.5 && A.minusDF.mean < 2, 'the natural sound move costs about a point')
const split = (name, e) => `${name} & ${e.n} & ${e.games} & ${ci(e)} \\\\`
g.block(
  'SplitTable',
  [
    '\\begin{table}[ht]\\centering\\small',
    '\\begin{tabular}{lrrr}',
    '\\toprule',
    ' & Positions & Games & $D_F$, win\\% \\\\',
    '\\midrule',
    split('All', A.dF),
    '\\midrule',
    split("B quiet", Q.quiet),
    split('B forcing (a capture or a check)', Q.forcing),
    '\\midrule',
    split('Turning points', K.turning),
    split('Plan checkpoints', K.plan),
    '\\midrule',
    split('Opening', H.opening),
    split('Middlegame', H.middlegame),
    split('Endgame', H.endgame),
    '\\bottomrule',
    '\\end{tabular}',
    '\\caption{$D_F$ over both sets, by the kind of the engine\'s best, by the kind of position and by the divider\'s phase. These splits were named before the run but carry no rule: they describe.}',
    '\\label{tab:splits}',
    '\\end{table}',
  ].join('\n'),
)
g.def('QuietN', String(Q.quiet.n)).def('ForcingN', String(Q.forcing.n))

// ---- two positions ----
const positions = readJsonl(join(privateDir(PROJECT), 'positions.jsonl'))
const values = new Map()
for (const r of rolled) {
  const key = `${r.id}|${r.which}`
  const v = values.get(key) ?? []
  v.push(r.wp)
  values.set(key, v)
}
const mean = (key) => {
  const v = values.get(key)
  return v.reduce((s, x) => s + x, 0) / v.length
}
const rows = positions.map((p) => ({ p, vB: mean(`${p.id}|B`), vF: mean(`${p.id}|F`), gap: p.B.wp - p.F.wp }))
const halves = positions
  .map((p) => {
    const v = rolled.filter((r) => r.id === p.id && r.which === 'B').sort((a, b) => a.k - b.k).map((r) => r.wp)
    const m = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length
    return Math.abs(m(v.slice(0, ROLLOUTS / 2)) - m(v.slice(ROLLOUTS / 2)))
  })
  .sort((a, b) => a - b)
const quantile = (q) => halves[Math.floor(q * (halves.length - 1))]
g.def('HalvesMedian', fixed(quantile(0.5))).def('HalvesNinety', fixed(quantile(0.9)))
claim(quantile(0.5) > 2 * Math.abs(A.dF.mean), "one position's rollouts are far noisier than the mean they add up to")
const QUIET_GAP = 1.5
const FORCING_GAP = 2
g.def('QuietGap', fixed(QUIET_GAP)).def('ForcingGap', String(FORCING_GAP))
const held = rows
  .filter((r) => !r.p.B.forcing && !r.p.F.forcing && r.gap >= QUIET_GAP && r.vF >= r.vB)
  .sort((a, b) => b.p.F.pHis - b.p.B.pHis - (a.p.F.pHis - a.p.B.pHis))[0]
const cost = rows.filter((r) => r.p.B.forcing && !r.p.F.forcing && r.gap <= FORCING_GAP).sort((a, b) => a.vF - a.vB - (b.vF - b.vB))[0]
claim(held && cost && held.p.id !== cost.p.id, 'both examples exist')
claim(cost.vF - cost.vB < -10, 'in the second example the move he would find scores over ten win% below the best')

function arrows(fen, best, findable, size = '14pt') {
  const mark = (uci, color) => `pgfstyle=straightmove, arrow=to, linewidth=0.07em, color=${color}, markmoves={${uci.slice(0, 2)}-${uci.slice(2, 4)}}`
  return `\\chessboard[setfen={${fen}}, boardfontsize=${size}, ${mark(best.uci, 'blue!60!black')}, ${mark(findable.uci, 'green!50!black')}]`
}
const san = (fen, uci) => line(fen, [uci]).sans[0]
const PHASE = { opening: 'opening', middlegame: 'middlegame', endgame: 'endgame' }
const KIND = { turning: 'a turning point', plan: 'a plan checkpoint' }
const side = (fen) => (fen.split(' ')[1] === 'w' ? 'White' : 'Black')
function example(prefix, r) {
  const { p } = r
  const best = san(p.fen, p.B.uci)
  const findable = san(p.fen, p.F.uci)
  const played = p.P ? san(p.fen, p.P.uci) : null
  g.def(`${prefix}Kind`, KIND[p.kind]).def(`${prefix}Phase`, PHASE[p.phase]).def(`${prefix}Side`, side(p.fen))
  g.def(`${prefix}Best`, movesTex(p.fen, [best])).def(`${prefix}BestUci`, `\\uci{${p.B.uci}}`)
  g.def(`${prefix}Find`, movesTex(p.fen, [findable])).def(`${prefix}FindUci`, `\\uci{${p.F.uci}}`)
  g.def(`${prefix}Played`, played ? movesTex(p.fen, [played]) : '--').def(`${prefix}PlayedUci`, played ? `\\uci{${p.P.uci}}` : '--')
  g.def(`${prefix}PBest`, percent(p.B.pHis, 0)).def(`${prefix}PFind`, percent(p.F.pHis, 0))
  g.def(`${prefix}Gap`, fixed(r.gap)).def(`${prefix}VBest`, fixed(r.vB)).def(`${prefix}VFind`, fixed(r.vF)).def(`${prefix}DF`, fixed(r.vF - r.vB))
  g.def(`${prefix}Fen`, `\\fen{${p.fen}}`)
  g.block(`${prefix}Board`, arrows(p.fen, p.B, p.F))
  return { best, findable, played }
}
const one = example('Ex', held)
const two = example('Ey', cost)
claim(one.played === one.findable, 'in the first example he played the move he would find')
claim(/x/.test(two.best) && !/[x+#]/.test(two.findable), 'in the second example the best is a capture and the move he would find is quiet')
claim(new Chess(held.p.fen).inCheck() && new Chess(held.p.fen).move(one.findable).flags === 'n' && !one.findable.startsWith('K') && one.best.startsWith('K'), 'in the first example he is in check: the best moves the king, the move he would find blocks')
claim(held.vF - held.vB > quantile(0.9) && cost.vB - cost.vF > quantile(0.5), "the examples' gaps are larger than most of the rollouts' own noise")

g.write(join(HERE, 'generated.tex'))
console.error('findable-move: wrote paper/generated.tex')
