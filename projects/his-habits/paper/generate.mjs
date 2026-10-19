#!/usr/bin/env node
// Writes paper/generated.tex for his habits: the rule's verdict on each kind of
// move and the descriptions (results/his-habits.json), the design from the
// study's and the app's constants, and one position from the private rows. It
// refuses to write when a claim the paper makes no longer holds.
//
//   bridge/run.sh projects/his-habits/paper/generate.mjs

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, board, fixed, movesTex, percent, word } from '../../paper.mjs'
import {
  ABOVE,
  CLOCK_FLOOR,
  CONTROL,
  COST_BUDGET,
  DRAWS,
  FILTER_BUDGET,
  INSIGHT_KINDS,
  KAPPA_RANGE,
  KINDS,
  LICHESS_BANDS,
  LICHESS_FLOOR,
  LICHESS_MONTH,
  MIN_COUNT,
  MOVE_KINDS,
  OFFSET,
  PER_BAND,
  PER_PLAYER,
  PROJECT,
  TRIES,
  WIN_HIGH,
  WIN_LOW,
  BIT,
  argOf,
  readJsonl,
  tenMinutes,
} from '../lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const E = await chess('src/services/engine/index.ts')
const N = await chess('src/adapters/node/engine/index.ts')
const C = await chess('src/core/chess/index.ts')
const Sc = await chess('src/core/score/index.ts')
const out = JSON.parse(readFileSync(join(argOf('--results', resultsDir(PROJECT)), 'his-habits.json'), 'utf8'))
const dir = privateDir(PROJECT)
const g = new Generated('projects/his-habits/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const count = (n) => n.toLocaleString('en-US')
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const dateText = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`
const ratio = (x, d = 2) => fixed(x, d)
const ciText = (c, d = 2) => (c ? `${fixed(c[0], d)}, ${fixed(c[1], d)}` : '--')
const ciWords = (c, d = 2) => (c ? `${fixed(c[0], d)} to ${fixed(c[1], d)}` : '--')

const NAMES = {
  capture: 'Capture',
  check: 'Check',
  'pawn-push': 'Pawn push',
  retreat: 'Retreat',
  'king-move': 'King move',
  'queen-move': 'Queen move',
  'even-trade': 'Even trade',
  'worst-piece': 'Worst piece moves',
  shelter: 'Thins his shelter',
  threat: 'New threat',
  'open-file': 'Open file',
  battery: 'Battery',
  'king-pressure': 'King pressure',
  'pawn-break': 'Pawn break',
  'passed-pawn': 'Passed pawn',
  outpost: 'Outpost',
  'seventh-rank': 'Seventh rank',
  'active-king': 'Active king',
  'gives-bishop-pair': 'Gives the bishop pair',
  'pawn-weakness': 'Weakens his pawns',
  tactic: 'Tactic',
  hangs: 'Hangs a piece',
}
const WHAT = {
  capture: 'captures',
  check: 'gives check',
  'pawn-push': 'moves a pawn without capturing',
  retreat: 'steps a knight, bishop, rook or queen back toward its own side, without capturing',
  'king-move': 'moves the king, castling aside',
  'queen-move': 'moves the queen',
  'even-trade': 'captures a piece in an exchange the app scores level',
  'worst-piece': 'moves the piece the app names his worst',
  shelter: "thins his own king's pawn shelter",
  threat: 'leaves him a new capture that wins material, or a new mate in one',
  'open-file': 'puts a rook or queen on an open or half-open file',
  battery: 'lines up two pieces on a line',
  'king-pressure': 'attacks more of the squares around the enemy king, at least three',
  'pawn-break': 'strikes at an enemy pawn chain or centre pawn with a pawn',
  'passed-pawn': 'leaves the moved pawn passed, or promotes it',
  outpost: 'settles a knight or bishop on a pawn-guarded square no enemy pawn can attack',
  'seventh-rank': 'lands a rook on the seventh rank against pawns or the king',
  'active-king': 'brings the king forward in an endgame',
  'gives-bishop-pair': 'takes a knight with a bishop and gives up the pair',
  'pawn-weakness': 'doubles or isolates his own pawns',
  tactic: 'forks, pins, skewers, traps a piece or takes one that nothing takes back',
  hangs: 'leaves a knight, bishop, rook or queen of his standing to be taken, without capturing',
}
claim(KINDS.every((k) => NAMES[k] && WHAT[k]) && Object.keys(NAMES).length === KINDS.length, 'every kind has a name and a description')
claim(out.kinds.map((k) => k.kind).join('|') === KINDS.join('|'), 'the report covers the kinds the README fixed, in order')

// ---- the design ----
g.def('AppCommit', out.app.commit.slice(0, 10))
g.def('Above', String(ABOVE)).def('Offset', String(OFFSET)).def('WinLow', String(WIN_LOW)).def('WinHigh', String(WIN_HIGH)).def('ClockFloor', String(CLOCK_FLOOR))
g.def('CostNodes', count(E.budgetNodes(COST_BUDGET, 'node'))).def('FilterNodes', count(E.budgetNodes(FILTER_BUDGET, 'node')))
g.def('PerBand', count(PER_BAND)).def('PerPlayer', word(PER_PLAYER)).def('Tries', word(TRIES)).def('LichessFloor', String(LICHESS_FLOOR))
g.def('MinCount', String(MIN_COUNT)).def('Draws', count(DRAWS)).def('KappaLow', '2/3').def('KappaHigh', '3/2')
claim(Math.abs(KAPPA_RANGE[0] - 2 / 3) < 1e-12 && Math.abs(KAPPA_RANGE[1] - 3 / 2) < 1e-12, 'the correction bar is 2/3 to 3/2')
g.def('Kinds', word(KINDS.length)).def('MoveKinds', word(MOVE_KINDS.length)).def('IdeaKinds', word(Object.keys(INSIGHT_KINDS).length))
g.def('BandLowest', String(LICHESS_BANDS[0])).def('BandHighest', String(LICHESS_BANDS.at(-1)))
const month = Number(LICHESS_MONTH.slice(5, 7))
g.def('LichessMonth', `${MONTHS[month - 1]} ${LICHESS_MONTH.slice(0, 4)}`)

// ---- the data ----
const P = out.data.his
g.def('Games', count(P.games)).def('GamesFirst', count(P.halves[0])).def('GamesSecond', count(P.halves[1]))
g.def('FirstFrom', dateText(P.dates[0])).def('FirstTo', dateText(P.dates[1])).def('SecondFrom', dateText(P.dates[2])).def('SecondTo', dateText(P.dates[3]))
g.def('Positions', count(P.positions)).def('PositionsFirst', count(P.byHalf[0])).def('PositionsSecond', count(P.byHalf[1]))
g.def('SkipOpening', count(P.skipped.opening ?? 0)).def('SkipCheck', count(P.skipped['in check'] ?? 0)).def('SkipDecided', count(P.skipped.decided ?? 0)).def('SkipClock', count(P.skipped['clock under the floor'] ?? 0))
const L = out.data.lichess
const lichessGames = JSON.parse(readFileSync(join(dir, `lichess-${LICHESS_MONTH}.json`), 'utf8'))
claim(lichessGames.kept === L.games, 'the Lichess games are the ones the report counted')
g.def('LichessRead', count(lichessGames.gamesRead)).def('LichessKept', count(L.games)).def('LichessPlayerGames', count(L.playerGames))
g.def('LichessWithPositions', count(L.playerGamesWithPositions)).def('LichessPositions', count(L.positions))
const bandsText = (o) => {
  const bs = Object.keys(o).map(Number).sort((a, b) => a - b)
  return bs.length === 1 ? String(bs[0]) : `${bs[0]} to ${bs.at(-1)}`
}
g.def('HisBandsFirst', bandsText(out.bands[0].his)).def('HisBandsSecond', bandsText(out.bands[1].his))
g.def('AboveBandsFirst', bandsText(out.bands[0].above)).def('AboveBandsSecond', bandsText(out.bands[1].above))

// ---- the kinds ----
g.block(
  'KindTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\begin{tabularx}{\\textwidth}{@{}lL@{}}',
    '\\toprule',
    'Kind & The move \\\\',
    '\\midrule',
    ...KINDS.map((k, i) => `${i === MOVE_KINDS.length || k === CONTROL ? '\\midrule\n' : ''}${NAMES[k]} & ${WHAT[k]} \\\\`),
    '\\bottomrule',
    '\\end{tabularx}',
    `\\caption{The ${word(KINDS.length)} kinds of move. The first ${word(MOVE_KINDS.length)} are read from the move itself, the next ${word(Object.keys(INSIGHT_KINDS).length)} from the insights the app reads for a move, and the last is the control, a known fault at his level.}`,
    '\\label{tab:kinds}',
    '\\end{table}',
  ].join('\n'),
)


// ---- the tables ----
const kindsOut = out.kinds
const byKind = Object.fromEntries(kindsOut.map((x) => [x.kind, x]))
const bothText = (x) => {
  if (x.verdict.startsWith('not enough data')) return `too few ($E=${fixed(Math.min(...x.halves.map((h) => h.E)), 1)}$)`
  if (x.verdict === 'not measurable') return 'not measurable'
  if (!x.direction) return '--'
  const way = x.direction === 'over' ? 'more often' : 'less often'
  if (x.cost === null) return `${way}, cost too few`
  return `${way}, ${x.cost === 'costs' ? 'costs more' : x.cost === 'cheap' ? 'costs less' : 'costs no more'}`
}
const dirOf = (x) => (x.control ? 'over' : x.direction ?? (x.halves[0].R !== null && x.halves[0].R >= 1 ? 'over' : 'under'))
const rCell = (h, key = 'R', ciKey = 'ci') => (h[key] === null ? '--' : h[ciKey] ? `${ratio(h[key])} {\\scriptsize(${ciText(h[ciKey])})}` : ratio(h[key]))
const relCell = (h, dir) => (h[dir].rel === null ? '--' : `${fixed(h[dir].rel, 1)} {\\scriptsize(${ciText(h[dir].ciRel, 1)})}`)
const rows = (fn) => kindsOut.map((x, i) => `${i === MOVE_KINDS.length || x.kind === CONTROL ? '\\midrule\n' : ''}${fn(x)} \\\\`)

g.block(
  'VerdictTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\setlength{\\tabcolsep}{1.5pt}',
    '\\begin{tabular}{@{}lllllr@{}}',
    '\\toprule',
    '& \\multicolumn{2}{c}{$R$} & \\multicolumn{2}{c}{Relative cost (win\\%)} & \\\\',
    '\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}',
    'Kind & First half & Second half & First half & Second half & Both halves \\\\',
    '\\midrule',
    ...rows((x) => `${NAMES[x.kind]} & ${rCell(x.halves[0])} & ${rCell(x.halves[1])} & ${relCell(x.halves[0], dirOf(x))} & ${relCell(x.halves[1], dirOf(x))} & ${bothText(x)}`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Each kind of move against Maia-2 at the band above. $R$ is his count over the expected count corrected by Maia-2's bias on Lichess, with its 95\\% interval. The relative cost is the mean win\\% his instances give up against the band above's most likely move, minus the same over his other differences: for a kind he plays more often on both halves, or with no such reading where the first half's $R$ is at least 1, the positions where he plays it and the band above would not; otherwise the positions where the band above would and he does not. For the control, the direction it tests: he leaves a piece hanging and the band above would not. The last column is what the rule would have read had the controls passed: the kinds whose $R$ lies on one side of 1 on both halves, and their cost. The known fault failed, so none of it is a verdict.}`,
    '\\label{tab:verdicts}',
    '\\end{table}',
  ].join('\n'),
)

g.block(
  'LevelTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{@{}lllll@{}}',
    '\\toprule',
    `& \\multicolumn{2}{c}{$R$ against his own band} & \\multicolumn{2}{c}{Maia-2's correction} \\\\`,
    '\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}',
    'Kind & First half & Second half & First half & Second half \\\\',
    '\\midrule',
    ...rows((x) => `${NAMES[x.kind]} & ${rCell(x.halves[0], 'Rhis', 'ciHis')} & ${rCell(x.halves[1], 'Rhis', 'ciHis')} & ${ratio(x.halves[0].correction)} & ${ratio(x.halves[1].correction)}`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Each kind against Maia-2 at his own band, corrected the same way, and the correction itself: the corrected expected count at the band above over Maia-2's own. A correction above 1 means players at those bands play the kind more often than Maia-2 predicts.}`,
    '\\label{tab:level}',
    '\\end{table}',
  ].join('\n'),
)

const costCells = (h, dir) => (h[dir].n === 0 ? '-- & --' : `${fixed(h[dir].perGame, 2)} & ${fixed(h[dir].meanD, 1)}`)
g.block(
  'CostTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{@{}lrrrrrrrr@{}}',
    '\\toprule',
    '& \\multicolumn{4}{c}{He plays it, the band above would not} & \\multicolumn{4}{c}{The band above would, he does not} \\\\',
    '\\cmidrule(lr){2-5}\\cmidrule(lr){6-9}',
    '& \\multicolumn{2}{c}{First half} & \\multicolumn{2}{c}{Second half} & \\multicolumn{2}{c}{First half} & \\multicolumn{2}{c}{Second half} \\\\',
    '\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}\\cmidrule(lr){6-7}\\cmidrule(lr){8-9}',
    'Kind & A game & $D$ & A game & $D$ & A game & $D$ & A game & $D$ \\\\',
    '\\midrule',
    ...rows((x) => `${NAMES[x.kind]} & ${costCells(x.halves[0], 'over')} & ${costCells(x.halves[1], 'over')} & ${costCells(x.halves[0], 'under')} & ${costCells(x.halves[1], 'under')}`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The instances of each kind in each direction: how many a game, and their mean $D$, the win\\% his move gives up against the band above's most likely move. Over all the positions where his move is not that move, his move gives up ${fixed(out.agreement[0].differMeanD, 1)} win\\% on average in the first half and ${fixed(out.agreement[1].differMeanD, 1)} in the second; a kind's reference is those positions less the ones where either move is of the kind.}`,
    '\\label{tab:cost}',
    '\\end{table}',
  ].join('\n'),
)

g.block(
  'KappaTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\setlength{\\tabcolsep}{3pt}',
    `\\begin{tabular}{@{}l${LICHESS_BANDS.map(() => 'r').join('')}@{}}`,
    '\\toprule',
    `Kind & ${LICHESS_BANDS.map((b, i) => (i === 0 ? `${b}\\textsuperscript{a}` : String(b))).join(' & ')} \\\\`,
    '\\midrule',
    ...rows((x) => `${NAMES[x.kind]} & ${x.kappa.map((c) => `${ratio(c.kappa)}${c.pooled ? '\\textsuperscript{b}' : ''}`).join(' & ')}`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{$\\kappa$, Maia-2's bias at each band on Lichess: the moves of a kind players at the band played over those Maia-2 at the band expected. \\textsuperscript{a}Maia-2's band below 1100, here from ${LICHESS_FLOOR}. \\textsuperscript{b}Maia-2's expected count at that band is under ${MIN_COUNT}, so the bias pooled over the bands stands in.}`,
    '\\label{tab:kappa}',
    '\\end{table}',
  ].join('\n'),
)

g.block(
  'PhaseTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\begin{tabular}{@{}lll@{}}',
    '\\toprule',
    'Kind & Middlegame & Endgame \\\\',
    '\\midrule',
    ...rows((x) => `${NAMES[x.kind]} & ${rCell(x.phases.middlegame)} & ${rCell(x.phases.endgame)}`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{$R$ against the band above by the divider's phase of the position, both halves together.}`,
    '\\label{tab:phase}',
    '\\end{table}',
  ].join('\n'),
)

// ---- the controls ----
const H = byKind[CONTROL].halves
claim(out.controls.knownFault === false && out.controls.null === true && out.verdictGiven === false, 'the known fault fails, the null passes, and no verdict is given')
claim(H.every((h) => h.ci[0] <= 1 && h.ci[1] >= 1), "the known fault's R interval holds 1 on both halves")
claim(H.every((h) => h.over.ciRel[0] > 0), 'a piece left hanging where the band above would not costs more than his other differences on both halves')
claim(H.every((h) => h.ciHis[1] < 1), 'against his own band he leaves a piece hanging less often on both halves')
g.def('HangsRFirst', ratio(H[0].R)).def('HangsRSecond', ratio(H[1].R)).def('HangsRFirstCi', ciWords(H[0].ci)).def('HangsRSecondCi', ciWords(H[1].ci))
g.def('HangsRhisFirst', ratio(H[0].Rhis)).def('HangsRhisSecond', ratio(H[1].Rhis)).def('HangsRhisFirstCi', ciWords(H[0].ciHis)).def('HangsRhisSecondCi', ciWords(H[1].ciHis))
g.def('HangsNFirst', count(H[0].N)).def('HangsNSecond', count(H[1].N))
g.def('HangsOverDFirst', fixed(H[0].over.meanD, 1)).def('HangsOverDSecond', fixed(H[1].over.meanD, 1))
g.def('HangsRelFirst', fixed(H[0].over.rel, 1)).def('HangsRelSecond', fixed(H[1].over.rel, 1)).def('HangsRelFirstCi', ciWords(H[0].over.ciRel, 1)).def('HangsRelSecondCi', ciWords(H[1].over.ciRel, 1))
const step = H.map((h) => h.R / h.Rhis)
const spread = H.map((h) => (h.ci[1] - h.ci[0]) / 2 / h.R)
claim(step.every((x) => x > 1), 'the band above is expected to leave a piece hanging less often than his band on both halves')
claim(step[0] * (1 - spread[0]) < 1, 'a player at his band in the first half would not have shown an interval above 1')
g.def('StepFirst', ratio(step[0])).def('StepSecond', ratio(step[1])).def('SpreadFirst', percent(spread[0], 0)).def('SpreadSecond', percent(spread[1], 0))
claim(out.kinds.every((x) => x.nullDirection === null), 'the null player shows no kind over- or under-used on both halves')
const nullMisses = out.kinds.flatMap((x) => x.halves.filter((h) => h.ciNull && (h.ciNull[0] > 1 || h.ciNull[1] < 1)))
claim(nullMisses.length <= Math.ceil(0.1 * 2 * KINDS.length), "the null's single-half misses are no more than chance allows")
g.def('NullMisses', word(nullMisses.length)).def('NullIntervals', String(2 * KINDS.length))
const A = out.agreement
g.def('TopAboveFirst', percent(A[0].topAbove, 0)).def('TopAboveSecond', percent(A[1].topAbove, 0)).def('TopHisFirst', percent(A[0].topHis, 0)).def('TopHisSecond', percent(A[1].topHis, 0))
g.def('DiffShareFirst', percent(A[0].differShare, 0)).def('DiffShareSecond', percent(A[1].differShare, 0))
g.def('DiffDFirst', fixed(A[0].differMeanD, 1)).def('DiffDSecond', fixed(A[1].differMeanD, 1))

// ---- what the positions describe ----
const bothSides = (x, ci) => x.halves.every((h) => h[ci] && h[ci][0] > 1) || x.halves.every((h) => h[ci] && h[ci][1] < 1)
const consistent = out.kinds.filter((x) => !x.control && bothSides(x, 'ci')).map((x) => x.kind)
claim(consistent.join('|') === 'check|retreat|pawn-break|pawn-weakness', 'four kinds lie on one side of 1 on both halves: check, retreat, pawn break and pawn weakness')
claim(consistent.every((k) => byKind[k].verdict === 'a habit that costs no more'), 'none of the four costs more or less than his other differences on both halves')
claim(byKind.retreat.direction === 'under' && ['check', 'pawn-break', 'pawn-weakness'].every((k) => byKind[k].direction === 'over'), 'he retreats less often and plays the other three more often')
const oneHalf = out.kinds.filter((x) => !x.control && !consistent.includes(x.kind) && x.halves.some((h) => h.ci && (h.ci[0] > 1 || h.ci[1] < 1))).map((x) => x.kind)
claim(oneHalf.join('|') === 'capture|pawn-push|even-trade|tactic', 'four more kinds differ on one half only: captures, pawn pushes, even trades and tactics')
g.def('OneHalf', word(oneHalf.length))
for (const [name, k] of [['Break', 'pawn-break'], ['Retreat', 'retreat'], ['Check', 'check'], ['Weak', 'pawn-weakness'], ['Trade', 'even-trade']]) {
  const h = byKind[k].halves
  g.def(`${name}RFirst`, ratio(h[0].R)).def(`${name}RSecond`, ratio(h[1].R)).def(`${name}RFirstCi`, ciWords(h[0].ci)).def(`${name}RSecondCi`, ciWords(h[1].ci))
  g.def(`${name}RhisFirst`, ratio(h[0].Rhis)).def(`${name}RhisSecond`, ratio(h[1].Rhis)).def(`${name}RhisFirstCi`, ciWords(h[0].ciHis)).def(`${name}RhisSecondCi`, ciWords(h[1].ciHis))
}
const hisSide = out.kinds.filter((x) => bothSides(x, 'ciHis')).map((x) => x.kind)
claim(hisSide.join('|') === 'even-trade|pawn-break|pawn-weakness|hangs', 'against his own band, even trades, pawn breaks, pawn weakness and hanging a piece lie on one side of 1 on both halves')
claim(byKind['even-trade'].halves[0].ci[0] <= 1 && byKind['even-trade'].halves[1].ci[0] > 1, 'against the band above, even trades stand out in the second half only')
claim(['retreat', 'check'].every((k) => !bothSides(byKind[k], 'ciHis')), 'against his own band, retreats and checks do not lie on one side of 1 on both halves')
claim(consistent.every((k) => ['over', 'under'].includes(byKind[k].direction) && byKind[k].halves.every((h) => h[byKind[k].direction].ciRel[0] < 0 && h[byKind[k].direction].ciRel[1] > 0)), "each of the four's relative cost holds 0 on both halves")
const breakRel = byKind['pawn-break'].halves.map((h) => h.over)
g.def('BreakDFirst', fixed(breakRel[0].meanD, 1)).def('BreakDSecond', fixed(breakRel[1].meanD, 1)).def('BreakPerGameFirst', fixed(breakRel[0].perGame, 2)).def('BreakPerGameSecond', fixed(breakRel[1].perGame, 2))
const retreatRel = byKind.retreat.halves.map((h) => h.under)
g.def('RetreatDFirst', fixed(retreatRel[0].meanD, 1)).def('RetreatDSecond', fixed(retreatRel[1].meanD, 1)).def('RetreatPerGameFirst', fixed(retreatRel[0].perGame, 2)).def('RetreatPerGameSecond', fixed(retreatRel[1].perGame, 2))
const checkRel = byKind.check.halves.map((h) => h.over)
g.def('CheckDFirst', fixed(checkRel[0].meanD, 1)).def('CheckDSecond', fixed(checkRel[1].meanD, 1))
claim(checkRel.every((h, i) => h.meanD < A[i].differMeanD), 'his extra checks give up less on average than his other differences')

claim(byKind['pawn-break'].halves.every((h) => h.R >= 1.4 && h.R <= 1.7), 'pawn breaks come about half again as often as the band above would play them')
const size = (k) => byKind[k].halves.map((h) => Math.abs(Math.log(h.R)))
claim(consistent.filter((k) => k !== 'pawn-break').every((k) => Math.max(...size(k)) < Math.min(...size('pawn-break'))), 'pawn breaks are the clearest of the four differences on both halves')
const mid = (k) => byKind[k].phases.middlegame
const end = (k) => byKind[k].phases.endgame
claim(mid('retreat').ci[1] < 1 && end('retreat').ci[0] <= 1 && end('retreat').ci[1] >= 1, 'his fewer retreats are a middlegame difference')
claim(mid('pawn-break').ci[0] > 1 && end('pawn-break').ci[0] > 1, 'his pawn breaks stand out in both phases')
claim(mid('king-move').ci[1] < 1, 'he moves his king less often in the middlegame')
g.def('RetreatMid', ratio(mid('retreat').R)).def('RetreatMidCi', ciWords(mid('retreat').ci)).def('RetreatEnd', ratio(end('retreat').R)).def('RetreatEndCi', ciWords(end('retreat').ci))
g.def('BreakMid', ratio(mid('pawn-break').R)).def('BreakEnd', ratio(end('pawn-break').R)).def('KingMid', ratio(mid('king-move').R)).def('KingMidCi', ciWords(mid('king-move').ci))
const ownKappa = out.kinds.flatMap((x) => x.kappa.filter((c) => !c.pooled).map((c) => c.kappa))
g.def('KappaMin', ratio(Math.min(...ownKappa))).def('KappaMax', ratio(Math.max(...ownKappa)))
const pooledCells = out.kinds.flatMap((x) => x.kappa.filter((c) => c.pooled))
g.def('KappaPooled', word(pooledCells.length)).def('KappaCells', String(KINDS.length * LICHESS_BANDS.length))
const corrections = out.kinds.flatMap((x) => x.halves.map((h) => h.correction))
claim(corrections.every((c) => c >= KAPPA_RANGE[0] && c <= KAPPA_RANGE[1]), 'every kind is measurable on both halves')
g.def('CorrMin', ratio(Math.min(...corrections))).def('CorrMax', ratio(Math.max(...corrections)))

// ---- added after the run ----
const desc = JSON.parse(readFileSync(join(argOf('--results', resultsDir(PROJECT)), 'descriptions.json'), 'utf8'))
const kindAt = (list, kind) => list.kinds.find((x) => x.kind === kind)
const lowBand = desc.lichess[0]
const highBand = desc.lichess.at(-1)
claim(lowBand.band === LICHESS_BANDS[0] && highBand.band === LICHESS_BANDS.at(-1), 'the descriptions cover the lowest and highest bands')
const trend = (kind) => [kindAt(lowBand, kind), kindAt(highBand, kind)]
const [hLow, hHigh] = trend(CONTROL)
claim(hLow.ciRate[0] > hHigh.ciRate[1], 'on Lichess, players at the lowest band leave a piece hanging more often than at the highest')
g.def('LiHangsLow', percent(hLow.rate, 1)).def('LiHangsHigh', percent(hHigh.rate, 1))
const [rLow, rHigh] = trend('retreat')
claim(rLow.ciRate[1] < rHigh.ciRate[0], 'on Lichess, retreats rise with the band')
g.def('LiRetreatLow', percent(rLow.rate, 1)).def('LiRetreatHigh', percent(rHigh.rate, 1))
const [cLow, cHigh] = trend('check')
claim(cLow.ciRate[0] > cHigh.ciRate[1], 'on Lichess, checks fall with the band')
g.def('LiCheckLow', percent(cLow.rate, 1)).def('LiCheckHigh', percent(cHigh.rate, 1))
const breakRates = desc.lichess.map((b) => kindAt(b, 'pawn-break'))
claim(Math.max(...breakRates.map((x) => x.ciRate[0])) <= Math.min(...breakRates.map((x) => x.ciRate[1])), 'on Lichess, pawn breaks show no trend across the bands')
g.def('LiBreakMin', percent(Math.min(...breakRates.map((x) => x.rate)), 1)).def('LiBreakMax', percent(Math.max(...breakRates.map((x) => x.rate)), 1))
const hisBreak = desc.his.map((h) => kindAt(h, 'pawn-break'))
claim(hisBreak.every((x) => x.ciRate[0] > Math.max(...breakRates.map((y) => y.rate))), 'his pawn-break rate lies above every band on Lichess')
g.def('HisBreakFirst', percent(hisBreak[0].rate, 1)).def('HisBreakSecond', percent(hisBreak[1].rate, 1))
g.def('MaiaBreakFirst', percent(hisBreak[0].maiaAbove, 1)).def('MaiaBreakSecond', percent(hisBreak[1].maiaAbove, 1))
const like = desc.his.map((h) => h.likelihood)
claim(like.every((l) => l.ciGain[1] < 0), 'Maia-2 at his own band reads his moves better than at the band above on both halves')
g.def('LikeFirst', percent(1 - Math.exp(like[0].gain), 1)).def('LikeSecond', percent(1 - Math.exp(like[1].gain), 1))
const hisHangs = desc.his.map((h) => kindAt(h, CONTROL))
g.def('HisHangsFirst', percent(hisHangs[0].rate, 1)).def('HisHangsSecond', percent(hisHangs[1].rate, 1))
g.def('MaiaHangsHisFirst', percent(hisHangs[0].maiaHis, 1)).def('MaiaHangsHisSecond', percent(hisHangs[1].maiaHis, 1)).def('MaiaHangsAboveFirst', percent(hisHangs[0].maiaAbove, 1)).def('MaiaHangsAboveSecond', percent(hisHangs[1].maiaAbove, 1))
g.block(
  'TrendTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\setlength{\\tabcolsep}{4pt}',
    `\\begin{tabular}{@{}l${LICHESS_BANDS.map(() => 'r').join('')}rr@{}}`,
    '\\toprule',
    `& \\multicolumn{${LICHESS_BANDS.length}}{c}{Lichess players at each band} & \\multicolumn{2}{c}{Him} \\\\`,
    `\\cmidrule(lr){2-${LICHESS_BANDS.length + 1}}\\cmidrule(lr){${LICHESS_BANDS.length + 2}-${LICHESS_BANDS.length + 3}}`,
    `Kind & ${LICHESS_BANDS.map((b, i) => (i === 0 ? `${b}\\textsuperscript{a}` : String(b))).join(' & ')} & First & Second \\\\`,
    '\\midrule',
    ...['pawn-break', 'retreat', 'check', 'pawn-weakness', 'even-trade', CONTROL].map((k) => `${NAMES[k]} & ${desc.lichess.map((b) => percent(kindAt(b, k).rate, 1)).join(' & ')} & ${desc.his.map((h) => percent(kindAt(h, k).rate, 1)).join(' & ')} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Added after the run. The share of positions, in \\%, in which players play each kind: Lichess players at each band in their own positions, and him in his. The positions differ, so the columns compare the bands with each other, not with him. \\textsuperscript{a}Maia-2's band below 1100, here from ${LICHESS_FLOOR}.}`,
    '\\label{tab:trend}',
    '\\end{table}',
  ].join('\n'),
)

// ---- positions ----
const { parseTimeControl } = await chess('src/core/game/index.ts')
const { ARCHIVE_SUBDIR, loadArchiveGames } = await chess('src/adapters/node/archive/days.ts')
const hisRows = readdirSync(dir)
  .filter((f) => /^his-\d+-of-\d+\.jsonl$/.test(f))
  .flatMap((f) => readJsonl(join(dir, f)))
  .sort((a, b) => a.id - b.id)
claim(hisRows.length === P.positions && hisRows.every((r, i) => r.id === i), 'the private rows are the positions the report counted')
const stepsOf = new Map()
for (const r of hisRows) stepsOf.set(r.gi, r.plusBand - r.hisBand)
const oneStep = [...stepsOf.values()].filter((d) => d === 100).length
claim(oneStep > 0 && [...stepsOf.values()].every((d) => d === 100 || d === 200), 'the band above is one or two of Maia-2\'s bands up')
g.def('OneStepGames', count(oneStep)).def('GamesWithPositions', count(stepsOf.size))
const games = loadArchiveGames({ dir: join(CHESS_DIR, ARCHIVE_SUBDIR) })
  .filter((x) => tenMinutes(x, parseTimeControl))
  .sort((a, b) => a.endTime - b.endTime)
claim(games.length === P.games, 'the archive gives the games the report counted')
const engine = N.createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false, pool: 1 })
const SIDE = { w: 'White', b: 'Black' }
const D = (r) => r.wpT - r.wpP
const instancesOf = (kind, dir, half) =>
  hisRows.filter((r) => r.half === half && r.P !== r.T && (dir === 'over' ? (r.maskP & BIT[kind]) && !(r.maskT & BIT[kind]) : (r.maskT & BIT[kind]) && !(r.maskP & BIT[kind])))
const quiet = (r) => [r.maskP, r.maskT].every((m) => !(m & BIT.capture) && !(m & BIT.check))
function typical(kind, dir, half, phase = null, keep = () => true) {
  const all = instancesOf(kind, dir, half)
  const pool = all.filter((r) => (phase === null || r.phase === phase) && keep(r))
  const ds = all.map(D).sort((a, b) => a - b)
  const median = ds.length % 2 ? ds[(ds.length - 1) / 2] : (ds[ds.length / 2 - 1] + ds[ds.length / 2]) / 2
  return [...pool].sort((a, b) => Math.abs(D(a) - median) - Math.abs(D(b) - median) || a.id - b.id)[0] ?? null
}
async function scoreAfter(history, color, uci) {
  await engine.newGame('analyst')
  const res = await engine.evaluate(C.child(C.position(C.START_FEN, history), uci), COST_BUDGET, { cache: 'bypass', priority: 'batch' })
  return { wp: Sc.winPercentFor(res.eval, color), pv: res.pv ?? [] }
}
const sansOn = (fen, ucis) => {
  const b = new Chess(fen)
  return ucis.map((u) => b.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san)
}
async function example(prefix, row, plies = 4) {
  const game = games[row.gi]
  const replayed = C.replaySans(C.START_FEN, game.sans ?? [])
  const fen = replayed.fens[row.ply]
  claim(replayed.ucis[row.ply] === row.P, `${prefix}: the move shown is the one he played`)
  const legal = new Chess(fen).moves({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion ?? ''}`).sort()
  claim(legal.join(' ') === row.moves.map(([u]) => u).sort().join(' '), `${prefix}: the position is the row's`)
  const history = replayed.ucis.slice(0, row.ply)
  const p = await scoreAfter(history, row.myColor, row.P)
  const t = await scoreAfter(history, row.myColor, row.T)
  claim(Math.abs(p.wp - row.wpP) < 0.5 && Math.abs(t.wp - row.wpT) < 0.5, `${prefix}: the engine gives both moves the win% the run stored`)
  const plusOf = (uci) => row.moves.find(([u]) => u === uci)[3]
  const lineP = sansOn(fen, [row.P, ...p.pv.slice(0, plies - 1)])
  const lineT = sansOn(fen, [row.T, ...t.pv.slice(0, plies - 1)])
  g.def(`${prefix}Fen`, `\\fen{${fen}}`).def(`${prefix}Mover`, SIDE[row.myColor]).def(`${prefix}Phase`, row.phase)
  g.def(`${prefix}Played`, movesTex(fen, [lineP[0]])).def(`${prefix}Top`, movesTex(fen, [lineT[0]]))
  g.def(`${prefix}PlayedUci`, `\\uci{${row.P}}`).def(`${prefix}TopUci`, `\\uci{${row.T}}`)
  g.def(`${prefix}LineP`, movesTex(fen, lineP)).def(`${prefix}LineT`, movesTex(fen, lineT))
  g.def(`${prefix}WpBefore`, fixed(row.wpBefore, 0)).def(`${prefix}WpP`, fixed(p.wp, 0)).def(`${prefix}WpT`, fixed(t.wp, 0)).def(`${prefix}D`, fixed(t.wp - p.wp, 1))
  g.def(`${prefix}PPlus`, percent(plusOf(row.P), 0)).def(`${prefix}TPlus`, percent(plusOf(row.T), 0)).def(`${prefix}Band`, String(row.plusBand))
  g.block(`${prefix}Board`, board(fen, { played: row.P, better: row.T }))
  return { fen, row, p, t }
}

const breakRow = typical('pawn-break', 'over', 1, 'middlegame', quiet)
const retreatRow = typical('retreat', 'under', 1, 'middlegame', quiet)
claim(breakRow && retreatRow, 'both examples exist')
const ea = await example('Ea', breakRow)
const eb = await example('Eb', retreatRow)
claim(ea.p.wp < ea.t.wp && eb.p.wp < eb.t.wp, "in both examples his move gives up win% against the band above's")
const plusOf = (row, uci) => row.moves.find(([u]) => u === uci)[3]
claim(plusOf(breakRow, breakRow.T) > plusOf(breakRow, breakRow.P) && plusOf(retreatRow, retreatRow.T) > plusOf(retreatRow, retreatRow.P), 'in both examples the band above rates its move above his')
const medianOf = (xs) => {
  const v = [...xs].sort((a, b) => a - b)
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
}
g.def('EaMedian', fixed(medianOf(instancesOf('pawn-break', 'over', 1).map(D)), 1)).def('EbMedian', fixed(medianOf(instancesOf('retreat', 'under', 1).map(D)), 1))
await engine.dispose?.()

g.write(join(HERE, 'generated.tex'))
console.error('his-habits: wrote paper/generated.tex')
process.exit(0)
