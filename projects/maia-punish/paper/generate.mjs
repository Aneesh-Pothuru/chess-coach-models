#!/usr/bin/env node
// Writes paper/generated.tex for the punish-odds paper: the recorded analysis
// (the records' results.json, which the lab recomputes byte for byte), its
// calibration bins and the rerun (results/reproduction.json), the rule's
// constants from analyze.mjs and the events' own definitions, and two of the
// player's errors from the recorded events.
//
//   bridge/run.sh projects/maia-punish/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { chess, projectDir, records, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, board, figurine, fixed, percent } from '../../paper.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FLOW = 'maia-punish'
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const recordedDir = join(records(), 'evals', FLOW)
const results = json(join(recordedDir, 'results.json'))
const { events, definitions, counts } = json(join(recordedDir, 'events.json'))
const repro = json(join(resultsDir(FLOW), 'reproduction.json'))
const g = new Generated('projects/maia-punish/paper/generate.mjs')

// ---- the definitions and the rule, as the code states them ----
const errorAt = /lossPct >= (\d+)/.exec(definitions.error)
const e2At = /lossPct <= (\d+)/.exec(definitions.E2)
const analyze = readFileSync(join(projectDir(FLOW), 'analyze.mjs'), 'utf8')
const rule = /n >= (\d+) && \(mean < lo - ([\d.]+) \|\| mean > hi \+ ([\d.]+)\)/.exec(analyze)
const boot = /const SEED = (\d+), B = (\d+)/.exec(analyze)
const step = /S\.filter\(\(e\) => e\.errorLossPct >= (\d+)\)/.exec(analyze)
if (!step) throw new Error("analyze.mjs no longer states step 5's threshold")
g.def('StepAt', step[1])
if (!errorAt || !e2At || !rule || !boot || rule[2] !== rule[3]) throw new Error('the definitions or the rule no longer read as the paper describes them')
g.def('ErrorAt', errorAt[1]).def('EAt', e2At[1]).def('BinMin', rule[1]).def('BinGap', rule[2]).def('Draws', boot[2])
g.def('Events', String(counts.events)).def('ExactEvents', String(counts.exact)).def('Games', String(counts.games))
const bands = [...new Set(events.map((e) => e.band))].sort((a, b) => a - b)
g.def('BandMin', String(bands[0])).def('BandMax', String(bands.at(-1)))

// ---- the main table, from the recorded results ----
const KEYS = [['EXACT|player-err', 'player', 'verified'], ['EXACT|opp-err', 'opponents', 'verified'], ['ALL|player-err', 'player', 'all'], ['ALL|opp-err', 'opponents', 'all']]
const ci = ([lo, hi]) => `[${fixed(lo, 3)}, ${fixed(hi, 3)}]`
g.block('ResultTable', [
  '\\begin{tabular}{llrrrrlll}',
  '\\toprule',
  'replies & errors of & events & punished & $q$ & base & size & $q$ $-$ base & $q$ $-$ size \\\\',
  '\\midrule',
  ...KEYS.map(([key, who, set]) => {
    const r = results[key]
    return `${set} & ${who} & ${r.n} (${r.games}) & ${fixed(r.k1 / r.n, 3)} & ${fixed(r.e1.bq, 3)} & ${fixed(r.e1.bb, 3)} & ${fixed(r.e1.bl, 3)} & ${fixed(r.e1.bq - r.e1.bb, 3)} ${ci(r.e1.iB)} & ${fixed(r.e1.bq - r.e1.bl, 3)} ${ci(r.e1.iL)} \\\\`
  }),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
for (const [key, name] of [['EXACT|player-err', 'Player'], ['EXACT|opp-err', 'Opp'], ['ALL|player-err', 'AllPlayer'], ['ALL|opp-err', 'AllOpp']]) {
  const r = results[key], s = results[`${key}|step5`]
  if (r.verdict !== 'HOLDS') throw new Error(`${key} does not hold: the paper says it does`)
  g.def(`${name}Events`, String(r.n)).def(`${name}Games`, String(r.games)).def(`${name}Punished`, fixed(r.k1 / r.n, 2))
  g.def(`${name}Brier`, fixed(r.e1.bq, 3)).def(`${name}BrierBase`, fixed(r.e1.bb, 3)).def(`${name}BrierSize`, fixed(r.e1.bl, 3))
  g.def(`${name}BigErrors`, String(s.n)).def(`${name}Unpunished`, percent(s.unpunished / s.n, 0))
  g.def(`${name}QPunished`, fixed(s.mqP, 2)).def(`${name}QUnpunished`, fixed(s.mqU, 2))
  g.def(`${name}Auc`, fixed(s.aucPoint, 2)).def(`${name}AucCI`, `[${fixed(s.aucLo, 2)}, ${fixed(s.aucHi, 2)}]`)
}
// What the app took from the check: the same error threshold, and the player's punish rate as its prior.
const { PUNISH_MIN_LOSS, PUNISH_PRIOR } = await chess('src/services/review/punish.ts')
if (PUNISH_MIN_LOSS !== Number(errorAt[1])) throw new Error("the app prices errors from another threshold than the check's")
const playerRate = results['EXACT|player-err'].k1 / results['EXACT|player-err'].n
if (Math.abs(PUNISH_PRIOR - playerRate) > 0.005) throw new Error("the app's prior is not the check's punish rate")
g.def('AppPrior', String(PUNISH_PRIOR))

// The secondary outcome on all replies, where it does not beat the base rate for the player's errors.
const allPlayerE2 = results['ALL|player-err'].e2
g.def('AllPlayerETwoDiff', fixed(allPlayerE2.bq - allPlayerE2.bb, 3)).def('AllPlayerETwoCI', ci(allPlayerE2.iB))

// ---- the calibration figure, recorded events, primary set ----
const coords = (key) => repro.calibration.recorded[key].filter((b) => b.n > 0)
  .map((b) => `(${b.meanQ.toFixed(3)},${b.observed.toFixed(3)}) += (0,${(b.wilson[1] - b.observed).toFixed(3)}) -= (0,${(b.observed - b.wilson[0]).toFixed(3)})`).join(' ')
g.def('CalPlayer', coords('EXACT|player-err')).def('CalOpp', coords('EXACT|opp-err'))
const binRows = repro.calibration.recorded['EXACT|player-err'].map((b, i) => {
  const o = repro.calibration.recorded['EXACT|opp-err'][i]
  const cell = (x) => `${fixed(x.meanQ, 2)} & ${fixed(x.observed, 2)} & ${x.n}${x.altViolates ? '$^{*}$' : ''}`
  return `${fixed(b.lo, 1)}--${fixed(b.hi, 1)} & ${cell(b)} & ${cell(o)} \\\\`
})
g.block('CalTable', [
  '\\begin{tabular}{lrrrrrr}',
  '\\toprule',
  ' & \\multicolumn{3}{c}{the player\'s errors} & \\multicolumn{3}{c}{the opponents\' errors} \\\\',
  '\\cmidrule(lr){2-4}\\cmidrule(lr){5-7}',
  '$q$ & mean $q$ & found & $n$ & mean $q$ & found & $n$ \\\\',
  '\\midrule',
  ...binRows,
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
const soft = repro.calibration.recorded['EXACT|opp-err'].find((b) => b.altViolates)
if (!soft) throw new Error('no bin is flagged on the stricter reading: the paper says one is')
g.def('SoftLo', fixed(soft.lo, 1)).def('SoftHi', fixed(soft.hi, 1)).def('SoftQ', fixed(soft.meanQ, 2)).def('SoftFound', fixed(soft.observed, 2)).def('SoftN', String(soft.n))

// ---- two of the player's errors ----
const BIG = 20
const big = events.filter((e) => e.inExact && e.dir === 'player-err' && e.errorLossPct >= BIG)
const takesBack = (e) => e.bestUci.slice(2, 4) === e.errorUci.slice(2, 4)
const found = big.filter((e) => e.E1 && !takesBack(e)).reduce((a, b) => (b.q > a.q ? b : a))
const missed = big.filter((e) => !e.E2).reduce((a, b) => (b.q < a.q ? b : a))
g.def('BigLoss', String(BIG)).def('BigLossEvents', String(big.length))
const sanOf = (fen, uci) => new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
function example(e, letter) {
  const fen = e.fenBeforeReply
  const [, side, , , , full] = fen.split(' ')
  // The error was the other side's move, just before this position.
  const error = side === 'w' ? `${Number(full) - 1}\\ldots{}${figurine(e.errorSan)}` : `${full}.~${figurine(e.errorSan)}`
  const reply = (uci) => `${side === 'w' ? `${full}.~` : `${full}\\ldots{}`}${figurine(sanOf(fen, uci))}`
  const playedOther = e.replyUci !== e.bestUci
  g.def(`Example${letter}Q`, fixed(e.q, 3)).def(`Example${letter}Band`, String(e.band)).def(`Example${letter}Loss`, fixed(e.errorLossPct, 0))
  g.def(`Example${letter}Error`, error).def(`Example${letter}Best`, reply(e.bestUci)).def(`Example${letter}Played`, reply(e.replyUci))
  g.input(`Example${letter}`, `example-${letter.toLowerCase()}`, [
    '\\begin{minipage}[t]{0.4\\textwidth}\\vspace{0pt}',
    board(fen, { played: playedOther ? e.replyUci : null, better: e.bestUci, size: '13pt' }),
    '\\end{minipage}\\hfill',
    '\\begin{minipage}[t]{0.56\\textwidth}\\vspace{0pt}\\small',
    `\\textbf{The error:} ${error}, giving away ${fixed(e.errorLossPct, 1)}\\% of the player's winning chances.\\par`,
    `\\textbf{The punishing reply:} ${reply(e.bestUci)} (green), the engine's best; Maia-2 at ${e.band} gives it $q = ${fixed(e.q, 3)}$.\\par`,
    `\\textbf{Played:} ${reply(e.replyUci)}${playedOther ? ` (red), which gave away ${fixed(e.replyLossPct, 1)}\\% of the replier's winning chances` : ', the punishing reply'}.\\par`,
    `\\textbf{UCI:} error \\uci{${e.errorUci}}; punishing reply \\uci{${e.bestUci}}; played \\uci{${e.replyUci}}\\par`,
    `\\textbf{FEN:} \\fen{${fen}}`,
    '\\end{minipage}',
  ].join('\n'))
}
example(found, 'A')
example(missed, 'B')

// ---- the reproduction ----
g.def('RecomputedIdentical', repro.recomputedIdentical ? 'matches the records\' results byte for byte' : 'differs from the records\' results')
if (!repro.recomputedIdentical) throw new Error('the recomputed analysis differs from the records')
g.def('RerunEvents', String(repro.events.rerun)).def('RecordedEvents', String(repro.events.recorded))
g.def('AppCommit', `\\texttt{${repro.chess.pinned_commit.slice(0, 7)}}`).def('RecordsCommit', `\\texttt{${repro.chess.records_commit.slice(0, 7)}}`)
const label = { 'EXACT|player-err': ['verified', 'the player\'s'], 'EXACT|opp-err': ['verified', 'the opponents\''], 'ALL|player-err': ['all', 'the player\'s'], 'ALL|opp-err': ['all', 'the opponents\''] }
g.block('ReproTable', [
  '\\begin{tabular}{llrrrrrrll}',
  '\\toprule',
  ' & & \\multicolumn{2}{c}{events} & \\multicolumn{2}{c}{Brier, $q$} & \\multicolumn{2}{c}{AUC} & \\multicolumn{2}{c}{verdict} \\\\',
  '\\cmidrule(lr){3-4}\\cmidrule(lr){5-6}\\cmidrule(lr){7-8}\\cmidrule(lr){9-10}',
  'replies & to errors of & recorded & rerun & recorded & rerun & recorded & rerun & recorded & rerun \\\\',
  '\\midrule',
  ...repro.rows.map((r) => `${label[r.key][0]} & ${label[r.key][1]} & ${r.recorded.events} & ${r.rerun.events} & ${fixed(r.recorded.brierMaia, 3)} & ${fixed(r.rerun.brierMaia, 3)} & ${fixed(r.recorded.aucStep5, 2)} & ${fixed(r.rerun.aucStep5, 2)} & ${r.recorded.verdict.toLowerCase()} & ${r.rerun.verdict.toLowerCase()} \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
if (!repro.rows.every((r) => r.rerun.verdict === 'HOLDS')) throw new Error('a rerun verdict fails: the paper says they all hold')
const brierMoves = repro.rows.map((r) => Math.abs(r.rerun.brierMaia - r.recorded.brierMaia))
const aucMoves = repro.rows.map((r) => Math.abs(r.rerun.aucStep5 - r.recorded.aucStep5))
g.def('RerunBrierMove', fixed(Math.max(...brierMoves), 3)).def('RerunAucMove', fixed(Math.max(...aucMoves), 2))

g.write(join(HERE, 'generated.tex'))
console.log(`wrote ${join(HERE, 'generated.tex')}`)
