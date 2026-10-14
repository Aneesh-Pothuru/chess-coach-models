#!/usr/bin/env node
// Writes paper/generated.tex for the praise gate: the replay's counts
// (results/praise.json) and one position from its rows (private/praise-gate/).
// It refuses to write when a claim the paper makes no longer holds.
//
//   bridge/run.sh projects/praise-gate/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { privateDir, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, board, fixed, movesTex, percent, word } from '../../paper.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const out = JSON.parse(readFileSync(join(resultsDir('praise-gate'), 'praise.json'), 'utf8'))
const rows = JSON.parse(readFileSync(join(privateDir('praise-gate'), 'rows.json'), 'utf8'))
const g = new Generated('projects/praise-gate/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const A = out.all
const C = out.byRule.castling
const T = out.byRule.tradeWhileAhead
const nodes = (n) => n.toLocaleString('en-US')
// The rule fixed before the first run (README): at most one praised move in twenty faulted,
// and at least three in four fine moves praised.
const MAX_FAULTED = 1 / 20
const MIN_FINE = 3 / 4
// The candidate the sweep points to, and the bar below it that is too strict.
const CANDIDATE = 1
const TOO_STRICT = 0.5
g.def('RuleFaulted', 'one in twenty').def('RuleFine', 'three in four').def('CandidateBar', String(CANDIDATE)).def('StrictBar', fixed(TOO_STRICT))
const ci = (s) => `${percent(s.ci[0])}--${percent(s.ci[1])}`

// ---- what was measured ----
const B = out.budgets
g.def('AppCommit', out.app.slice(0, 10)).def('ArchiveThrough', out.archiveThrough).def('Games', String(out.games)).def('HisMoves', out.hisMoves.toLocaleString('en-US'))
g.def('Moves', String(A.moves)).def('Castles', String(C.moves)).def('Trades', String(T.moves)).def('PraiseBar', String(out.bar)).def('ClearBar', String(out.clear))
g.def('NamingNodes', nodes(B.naming.node)).def('CheckNodes', nodes(B.check.node)).def('ArchiveNodes', nodes(B.archive.node)).def('Lines', word(B.lines))
claim(out.failed === 0 && out.replayFailed === 0 && A.noReading === 0 && A.noArchive === 0, 'every move replayed, got a verdict and has the archive reading')
claim(A.moves === C.moves + T.moves, 'no move holds both kinds of praise')
claim(A.small === 0, 'no move in the study has seven pieces or fewer, so the tablebase never speaks')
for (const b of [B.naming, B.check]) claim(b.phone === b.node && b.desktop === b.node, `the ${b.name} budget is the same on a phone, a desktop and in Node`)
claim(B.archive.node > B.naming.node, "the archive's sweep searches deeper than the live naming search")

// ---- the table: each rule, and both ----
const cell = (s) => `${s.k} (${percent(s.share)}\\%)`
const row = (name, s) =>
  `${name} & ${s.moves} & ${cell(s.praised)} & ${cell(s.faultedAll)} & ${cell(s.faultedPraised)} & ${cell(s.clearAll)} & ${cell(s.clearPraised)} & ${cell(s.praisedOfFine)} \\\\`
g.block(
  'GateTable',
  [
    '\\begin{table}[ht]\\centering\\footnotesize',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{lrrrrrrr}',
    '\\toprule',
    ` & & & \\multicolumn{2}{c}{Faulted ($\\ge$ ${out.bar} win\\%)} & \\multicolumn{2}{c}{Clearly faulted ($\\ge$ ${out.clear})} & \\\\`,
    '\\cmidrule(lr){4-5}\\cmidrule(lr){6-7}',
    'Rule & Moves & Praised & of all & of praised & of all & of praised & Fine praised \\\\',
    '\\midrule',
    row('Castling by move 8', C),
    row('Even trade while ahead', T),
    '\\midrule',
    row('Both', A),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{His moves where an instant rule held praise, read by the change's verdict at the live budgets and by the archive's deeper reading of the same move. \\emph{Of all} is what the instant rules alone would have praised; \\emph{of praised} is what the gate lets through. \\emph{Fine moves praised}: of the moves that gave away under ${out.bar} win\\% by the archive's reading, the share the gate praises.}`,
    '\\label{tab:gate}',
    '\\end{table}',
  ].join('\n'),
)

// ---- what the gate does ----
g.def('Praised', String(A.praised.k)).def('PraisedPct', percent(A.praised.share, 0))
g.def('FaultedAll', String(A.faultedAll.k)).def('FaultedAllPct', percent(A.faultedAll.share, 0))
g.def('ClearAll', String(A.clearAll.k)).def('ClearAllPct', percent(A.clearAll.share, 0))
g.def('FaultedPraised', word(A.faultedPraised.k)).def('FaultedPraisedPct', percent(A.faultedPraised.share)).def('FaultedPraisedCI', ci(A.faultedPraised))
g.def('ClearPraised', word(A.clearPraised.k)).def('ClearPraisedCastles', word(C.clearPraised.k))
g.def('Caught', String(A.caughtOfFaulted.k)).def('CaughtPct', percent(A.caughtOfFaulted.share, 0))
g.def('Fine', String(A.praisedOfFine.n)).def('FinePraised', String(A.praisedOfFine.k)).def('FinePraisedPct', percent(A.praisedOfFine.share, 0)).def('FinePraisedCI', ci(A.praisedOfFine))
g.def('CastlesFaultedPct', percent(C.faultedPraised.share)).def('TradesFaultedPct', percent(T.faultedPraised.share))
claim(A.faultedPraised.share < A.faultedAll.share / 3, 'the gate cuts the faulted share of praise to under a third of what the instant rules alone would praise')
claim(A.caughtOfFaulted.share >= 0.75, 'the gate withholds praise from at least three in four faulted moves')
claim(A.clearAll.k >= 20 && A.clearPraised.k <= 1 && C.clearPraised.k === 0, 'clearly faulted praise all but disappears, and no castle it praises is clearly faulted')
claim(T.clearPraised.k === A.clearPraised.k && Object.keys(T.faultedPraisedClasses).every((c) => c === 'good'), "the clearly faulted move it praises is a trade the archive's classifier calls good")
// The castles it withholds: how many of them the archive faults.
const castlesWithheld = C.read - C.praised.k
g.def('CastlesPraisedPct', percent(C.praised.share, 0)).def('CastlesWithheld', String(castlesWithheld)).def('CastlesWithheldFaulted', String(C.caughtOfFaulted.k))
claim(C.caughtOfFaulted.k / castlesWithheld > 0.6, 'most castles it withholds are faulted')

// The rule fixed before the run: at most one in twenty praised moves faulted, and at least three in four fine moves praised.
claim(A.faultedPraised.share > MAX_FAULTED && A.faultedPraised.share < 1.6 * MAX_FAULTED, 'the gate misses the one-in-twenty bar, narrowly')
claim(A.faultedPraised.ci[0] < MAX_FAULTED, "the faulted share's interval still reaches below the bar")
claim(A.praisedOfFine.share >= MIN_FINE, 'the gate meets the three-in-four bar')
claim(C.faultedPraised.share > MAX_FAULTED && T.faultedPraised.share > MAX_FAULTED, 'neither rule alone meets the one-in-twenty bar')

// ---- where its faulted praise sits ----
const fpOut = A.faultedPraised.k - A.faultedPraisedInLines
g.def('FaultedPraisedInLines', word(A.faultedPraisedInLines)).def('FaultedPraisedOutOfLines', word(fpOut))
g.def('FaultedRangeLow', fixed(A.faultedPraisedRange[0])).def('FaultedRangeHigh', fixed(A.faultedPraisedRange[1])).def('CastleRangeHigh', fixed(C.faultedPraisedRange[1]))
g.def('GapMedian', fixed(A.lossGap.median)).def('GapNinety', fixed(A.lossGap.p90))
g.def('LiveOnly', word(A.agree.liveOnly)).def('ArchiveOnly', word(A.agree.archiveOnly)).def('Agree', String(A.agree.bothFaulted + A.agree.neither))
claim(fpOut === 1, "all but one faulted praised move was among the engine's own lines")
claim(C.faultedPraisedRange[1] < out.clear, 'every faulted castle the gate praises sits under the clearly faulted line')
claim(Object.keys(A.faultedPraisedClasses).every((c) => c === 'good' || c === 'best'), "the archive's own classifier calls every faulted praised move good or best")
claim(Math.abs(A.agree.liveOnly - A.agree.archiveOnly) <= 3, 'the live and archive readings put about as many moves over the bar each way')
claim(A.lossGap.p90 < out.bar, "nine in ten moves' live and archive losses sit within the bar of each other")
const why = A.withheldWhy
const withheld = Object.values(why).reduce((s, x) => s + x, 0)
g.def('Withheld', String(withheld)).def('WithheldLoss', String(why.loss ?? 0)).def('WithheldJudgment', word(why.judgment ?? 0))
claim((why.loss ?? 0) > withheld / 2, 'most withheld praise is withheld for the loss the live verdict read')

// ---- a stricter bar, read after the fact ----
const S = out.sweep
const at = (bar) => S.find((x) => x.bar === bar)
const built = at(out.bar)
claim(built && built.praised === A.praised.k && built.faultedPraised.k === A.faultedPraised.k, 'the sweep at the praise bar is the gate as built')
const sweepRow = (x) =>
  `${fixed(x.bar)}${x.bar === out.bar ? ' (as built)' : ''} & ${x.praised} & ${x.faultedPraised.k} (${percent(x.faultedPraised.share)}\\%) & ${ci(x.faultedPraised)} & ${x.praisedOfFine.k} (${percent(x.praisedOfFine.share)}\\%) & ${ci(x.praisedOfFine)} \\\\`
g.block(
  'SweepTable',
  [
    '\\begin{table}[ht]\\centering\\small',
    '\\begin{tabular}{lrrrrr}',
    '\\toprule',
    'Live bar (win\\%) & Praised & Faulted of praised & 95\\% interval & Fine moves praised & 95\\% interval \\\\',
    '\\midrule',
    ...S.map(sweepRow),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The same moves, praised only when the gate praises them and the live loss is also under the bar. The bars were chosen after the run, so this table describes these games; it does not test a rule.}`,
    '\\label{tab:sweep}',
    '\\end{table}',
  ].join('\n'),
)
const one = at(CANDIDATE)
const half = at(TOO_STRICT)
g.def('OneFaultedPct', percent(one.faultedPraised.share)).def('OneFinePct', percent(one.praisedOfFine.share, 0)).def('HalfFinePct', percent(half.praisedOfFine.share, 0))
claim(one.faultedPraised.share <= MAX_FAULTED && one.faultedPraised.share > 0.8 * MAX_FAULTED && one.praisedOfFine.share >= MIN_FINE, 'the candidate live bar sits just inside both bars on these games')
claim(half.praisedOfFine.share < MIN_FINE, 'the stricter bar praises under three in four fine moves')

// ---- the board: the castle with the largest loss the gate withheld ----
const ex = rows
  .filter((r) => r.reading && r.rules.includes('castling') && !Object.values(r.praised).some(Boolean))
  .sort((a, b) => b.archive.lossPct - a.archive.lossPct)[0]
const pos = new Chess(ex.fenBefore)
const san = (uci) => new Chess(ex.fenBefore).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
const played = san(ex.uci)
const better = san(ex.best)
claim(played === 'O-O' || played === 'O-O-O', 'the example is a castle')
claim(ex.archive.lossPct >= out.clear && ex.lossWp >= out.clear, 'both readings fault the example clearly')
claim(['blunder', 'mistake'].includes(ex.judgment) && ['miss', 'blunder', 'mistake'].includes(ex.archive.cls), 'the example reads as "a" blunder or mistake live and "a" miss, blunder or mistake in the archive')
claim(better.includes('x'), "the engine's move in the example is a capture")
// What the capturing piece attacks once it lands, read from the board with the same side to move again.
const NAMES = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }
const after = new Chess(ex.fenBefore)
const landed = after.move({ from: ex.best.slice(0, 2), to: ex.best.slice(2, 4), promotion: ex.best[4] })
const [board0, , ...rest] = after.fen().split(' ')
const again = new Chess([board0, landed.color, '-', '-', ...rest.slice(2)].join(' '))
const hits = again.moves({ square: landed.to, verbose: true }).filter((m) => m.captured && NAMES[m.captured]).map((m) => `the ${NAMES[m.captured]} on ${m.to}`)
claim(hits.length >= 2, 'the capture in the example also attacks two pieces at once')
g.def('ExTaken', NAMES[landed.captured] ?? 'pawn').def('ExTargets', hits.join(' and '))
g.def('ExMove', String(pos.moveNumber())).def('ExPlayed', movesTex(ex.fenBefore, [played])).def('ExBetter', movesTex(ex.fenBefore, [better]))
g.def('ExLive', fixed(ex.lossWp)).def('ExArchive', fixed(ex.archive.lossPct)).def('ExJudgment', ex.judgment).def('ExClass', ex.archive.cls)
g.def('ExFen', `\\fen{${ex.fenBefore}}`).def('ExPlayedUci', `\\uci{${ex.uci}}`).def('ExBetterUci', `\\uci{${ex.best}}`)
g.block('ExBoard', board(ex.fenBefore, { played: ex.uci, better: ex.best }))

g.write(join(HERE, 'generated.tex'))
console.error('praise-gate: wrote paper/generated.tex')
