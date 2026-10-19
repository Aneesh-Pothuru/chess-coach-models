#!/usr/bin/env node
// Writes paper/generated.tex for positions like this: the rule's verdict and
// the descriptions (results/positions-like-this.json), the data
// (results/positions.json, index.json, coverage.json), the design from the
// study's and the app's constants, and two positions from the private rows,
// rescored. It refuses to write when a claim the paper makes no longer holds.
//
//   bridge/run.sh projects/positions-like-this/paper/generate.mjs

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, board, fixed, movesTex, percent, word } from '../../paper.mjs'
import {
  ABOVE,
  ARM,
  BUDGET,
  CLOCK_FLOOR,
  DISTANCE_BINS,
  DRAWS,
  HARD,
  HELD_OUT_ONE_IN,
  KING_CAP,
  MIN_MEN,
  MIN_POSITIONS,
  MONTH,
  OFFSET,
  PIECE_CAP,
  PROJECT,
  RANDOM_DRAWS,
  STRONG_QUERIES,
  STRONG_TRIES,
  WIN_HIGH,
  WIN_LOW,
  argOf,
  distanceParts,
  featuresOf,
  groupSizes,
  linesOf,
  materialKey,
  normalBoard,
  readJsonl,
} from '../lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const E = await chess('src/services/engine/index.ts')
const N = await chess('src/adapters/node/engine/index.ts')
const C = await chess('src/core/chess/index.ts')
const Sc = await chess('src/core/score/index.ts')
const results = argOf('--results', resultsDir(PROJECT))
const read = (file) => JSON.parse(readFileSync(join(results, file), 'utf8'))
const out = read('positions-like-this.json')
const P = read('positions.json')
const I = read('index.json')
const V = read('coverage.json')
const dir = privateDir(PROJECT)
const S = JSON.parse(readFileSync(join(dir, `strong-${MONTH}.json`), 'utf8'))
const g = new Generated('projects/positions-like-this/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const count = (n) => n.toLocaleString('en-US')
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const dateText = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`
const pts = (x, d = 1) => percent(x, d)
const ciWords = (c, d = 1) => (c ? `${percent(c[0], d)} to ${percent(c[1], d)}` : '--')
const cellOf = (s, d = 1) => (s ? `${pts(s.value, d)} {\\scriptsize(${s.ci ? `${percent(s.ci[0], d)}, ${percent(s.ci[1], d)}` : '--'})}` : '--')
const wpCell = (s, d = 2) => (s ? `${fixed(s.value, d)} {\\scriptsize(${s.ci ? `${fixed(s.ci[0], d)}, ${fixed(s.ci[1], d)}` : '--'})}` : '--')
const HALF = ['First', 'Second']

// ---- the design ----
claim(P.app.commit === I.app.commit, 'his positions and the index come from the same app commit')
g.def('AppCommit', P.app.commit.slice(0, 10))
g.def('MinMen', word(MIN_MEN)).def('ClockFloor', String(CLOCK_FLOOR)).def('WinLow', String(WIN_LOW)).def('WinHigh', String(WIN_HIGH))
g.def('Offset', String(OFFSET)).def('Above', String(ABOVE)).def('Arm', word(ARM)).def('RandomDraws', count(RANDOM_DRAWS))
g.def('PieceCap', String(PIECE_CAP)).def('KingCap', String(KING_CAP)).def('GradeNodes', count(E.budgetNodes(BUDGET, 'node')))
g.def('Window', String(E.ACCEPT_WINDOW_WP)).def('StrongQueries', count(STRONG_QUERIES)).def('Tries', word(STRONG_TRIES))
g.def('MinPositions', String(MIN_POSITIONS)).def('Hard', String(Math.round(100 * HARD))).def('Draws', count(DRAWS)).def('HeldOutOneIn', word(HELD_OUT_ONE_IN))
claim(DISTANCE_BINS.map(([lo, hi]) => `${lo}-${hi}`).join(' ') === '0-2 3-5 6-9 10-Infinity', 'the distance bins are 0 to 2, 3 to 5, 6 to 9 and 10 or more')

// ---- the data ----
g.def('Games', count(P.games)).def('GamesFirst', count(P.halves[0])).def('GamesSecond', count(P.halves[1]))
g.def('FirstFrom', dateText(P.dates[0])).def('FirstTo', dateText(P.dates[1])).def('SecondFrom', dateText(P.dates[2])).def('SecondTo', dateText(P.dates[3]))
g.def('Candidates', count(P.candidates)).def('CandFirst', count(P.byHalf[0])).def('CandSecond', count(P.byHalf[1]))
claim(S.kept === I.games && S.month === MONTH && I.month === MONTH, 'the index was built from the games the stream kept')
g.def('MonthName', `${MONTHS[Number(MONTH.slice(5, 7)) - 1]} ${MONTH.slice(0, 4)}`).def('Floor', String(S.floor)).def('MinPlies', String(S.minPlies))
g.def('Cap', count(S.cap)).def('GamesRead', count(S.gamesRead))
g.def('Blitz', count(I.speeds.Blitz)).def('Rapid', count(I.speeds.Rapid)).def('Classical', count(I.speeds.Classical))
g.def('IndexGames', count(I.indexGames)).def('HeldOutGames', count(I.heldOutGames)).def('IndexPositions', count(I.indexPositions)).def('HeldOutPositions', count(I.heldOutPositions))
const millions = (n) => fixed(n / 1e6, 1)
g.def('IndexMillions', millions(I.indexPositions))

// ---- coverage ----
claim(V.index.positions > 0 && V.his.length === 2, 'the coverage count has both halves')
for (const [h, c] of V.his.entries()) {
  claim(c.candidates === P.byHalf[h], `the coverage count covers the ${HALF[h].toLowerCase()} half's positions`)
  g.def(`Covered${HALF[h]}`, pts(c.share, 0)).def(`NearMedian${HALF[h]}`, String(c.nearestD.median)).def(`NearTen${HALF[h]}`, String(c.nearestD.p10))
  g.def(`BucketMedian${HALF[h]}`, count(c.bucketSize.median)).def(`NoBucket${HALF[h]}`, count(c.noBucket))
}
g.def('StrongSample', count(V.strong.candidates)).def('StrongCovered', pts(V.strong.share, 0)).def('StrongNearMedian', String(V.strong.nearestD.median)).def('StrongNearTen', String(V.strong.nearestD.p10))
g.block(
  'CoverageTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\begin{tabular}{@{}lrrrrrrr@{}}',
    '\\toprule',
    '& & & & \\multicolumn{4}{c}{Distance of the nearest match} \\\\',
    '\\cmidrule(lr){5-8}',
    '& Positions & Covered (\\%) & Bucket (median) & 10\\% & 25\\% & Median & 75\\% \\\\',
    '\\midrule',
    ...V.his.map((c, h) => `His, ${HALF[h].toLowerCase()} half & ${count(c.candidates)} & ${pts(c.share, 1)} & ${count(c.bucketSize.median)} & ${c.nearestD.p10} & ${c.nearestD.p25} & ${c.nearestD.median} & ${c.nearestD.p75} \\\\`),
    `Strong players, held out & ${count(V.strong.candidates)} & ${pts(V.strong.share, 1)} & -- & ${V.strong.nearestD.p10} & ${V.strong.nearestD.p25} & ${V.strong.nearestD.median} & ${V.strong.nearestD.p75} \\\\`,
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{How much of each set of positions the index covers, counted before any move was scored: the share of positions for which T, R and R2 (T and R for the strong players' positions) each find ${word(ARM)} matches whose moves transfer, the number of index positions with the same pieces, and the distance of the nearest match that transfers. The strong players' positions are a sample of the held-out ones.}`,
    '\\label{tab:coverage}',
    '\\end{table}',
  ].join('\n'),
)

// ---- the positions scored ----
const H = out.halves
const st = (h, k) => h.status[k] ?? 0
for (const [i, h] of H.entries()) {
  claim(h.candidates === P.byHalf[i], `the report reads every candidate of the ${HALF[i].toLowerCase()} half`)
  g.def(`Scored${HALF[i]}`, count(h.positions)).def(`ScoredGames${HALF[i]}`, count(h.games)).def(`NotCovered${HALF[i]}`, count(st(h, 'not covered')))
  g.def(`Forcing${HALF[i]}`, count(st(h, 'forcing best'))).def(`Decided${HALF[i]}`, count(st(h, 'decided'))).def(`NoExact${HALF[i]}`, count(st(h, 'no exact best'))).def(`Inexact${HALF[i]}`, count(h.inexact))
}
g.def('StrongPositions', count(out.strong.positions)).def('StrongTried', count(out.strong.tried)).def('StrongInexact', count(out.strong.inexact))

const ARMS = [
  ['T', 'T, the matches'],
  ['R', 'R, random matches'],
  ['R2', 'R2, a second draw'],
  ['N', 'N, his band'],
  ['U', 'U, the band above'],
  ['A', 'A, his move'],
]
g.block(
  'ArmTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\begin{tabular}{@{}lll@{}}',
    '\\toprule',
    'Move & First half & Second half \\\\',
    '\\midrule',
    `Positions (games) & ${count(H[0].positions)} (${count(H[0].games)}) & ${count(H[1].positions)} (${count(H[1].games)}) \\\\`,
    '\\midrule',
    ...ARMS.map(([k, name]) => `${name} & ${cellOf(H[0].soundness[k])} & ${cellOf(H[1].soundness[k])} \\\\`),
    '\\midrule',
    `Lift, T minus R (points) & ${cellOf(H[0].lift)} & ${cellOf(H[1].lift)} \\\\`,
    `Null, R2 minus R (points) & ${cellOf(out.controls.null.halves[0])} & ${cellOf(out.controls.null.halves[1])} \\\\`,
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The share of each arm's moves that are sound in his positions, in \\%, with its 95\\% interval, and the lift and the null in points. A move is sound when it gives up no more than ${E.ACCEPT_WINDOW_WP} win\\% against Stockfish's best.}`,
    '\\label{tab:arms}',
    '\\end{table}',
  ].join('\n'),
)

const binText = (b) => (b.bin[1] === null ? `${b.bin[0]} or more` : `${b.bin[0]} to ${b.bin[1]}`)
const distRow = (b) => `${count(b.matches)} & ${b.sound ? cellOf(b.sound) : '--'} & ${b.fromT ? pts(b.fromT.value, 0) : '--'}`
g.block(
  'DistanceTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\setlength{\\tabcolsep}{2.5pt}',
    '\\begin{tabular}{@{}lrlrrlrrlr@{}}',
    '\\toprule',
    '& \\multicolumn{3}{c}{His, first half} & \\multicolumn{3}{c}{His, second half} & \\multicolumn{3}{c}{Strong players, held out} \\\\',
    '\\cmidrule(lr){2-4}\\cmidrule(lr){5-7}\\cmidrule(lr){8-10}',
    'Distance & Matches & Sound (\\%) & From T & Matches & Sound (\\%) & From T & Matches & Sound (\\%) & From T \\\\',
    '\\midrule',
    ...DISTANCE_BINS.map((_, b) => `${binText(H[0].distances[b])} & ${distRow(H[0].distances[b])} & ${distRow(H[1].distances[b])} & ${distRow(out.strong.distances[b])} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Every T and R match by its own distance from the position: how many there are, the share whose move is sound, and the share of them, in \\%, that come from T. Intervals resample the games.}`,
    '\\label{tab:distance}',
    '\\end{table}',
  ].join('\n'),
)

const splitRows = (name, cells) => cells.map((c) => `${name(c.key)} & ${count(c.n)} & ${cellOf(c.T)} & ${cellOf(c.R)} & ${cellOf(c.lift)}`)
const SPLIT_NAMES = { middlegame: 'Middlegame', endgame: 'Endgame', named: 'A structure the app names', none: 'No named structure' }
g.block(
  'SplitTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{@{}llrlll@{}}',
    '\\toprule',
    'Half & Positions of & $n$ & T (\\%) & R (\\%) & Lift (points) \\\\',
    '\\midrule',
    ...H.flatMap((h, i) => [...splitRows((k) => `${HALF[i]} & ${SPLIT_NAMES[k]}`, h.phase), ...splitRows((k) => `${HALF[i]} & ${SPLIT_NAMES[k]}`, h.structure)].map((r) => `${r} \\\\`)),
    '\\midrule',
    ...splitRows((k) => `Strong & ${SPLIT_NAMES[k]}`, out.strong.phase).map((r) => `${r} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{T's and R's soundness and the lift by the divider's phase of the position and by whether the app names its pawn structure, with 95\\% intervals.}`,
    '\\label{tab:splits}',
    '\\end{table}',
  ].join('\n'),
)

g.block(
  'MoreTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{@{}llll@{}}',
    '\\toprule',
    '& His, first half & His, second half & Strong players \\\\',
    '\\midrule',
    `Win\\% given up, T & ${wpCell(H[0].lost.T)} & ${wpCell(H[1].lost.T)} & ${wpCell(out.strong.lost.T)} \\\\`,
    `Win\\% given up, R & ${wpCell(H[0].lost.R)} & ${wpCell(H[1].lost.R)} & ${wpCell(out.strong.lost.R)} \\\\`,
    `Win\\% given up, R2 & ${wpCell(H[0].lost.R2)} & ${wpCell(H[1].lost.R2)} & -- \\\\`,
    `Win\\% given up, his move & ${wpCell(H[0].lost.A)} & ${wpCell(H[1].lost.A)} & -- \\\\`,
    '\\midrule',
    `The best move, T (\\%) & ${cellOf(H[0].best.T)} & ${cellOf(H[1].best.T)} & ${cellOf(out.strong.best.T)} \\\\`,
    `The best move, R (\\%) & ${cellOf(H[0].best.R)} & ${cellOf(H[1].best.R)} & ${cellOf(out.strong.best.R)} \\\\`,
    '\\midrule',
    `New to him, T (\\%) & ${cellOf(H[0].newToHim.T)} & ${cellOf(H[1].newToHim.T)} & -- \\\\`,
    `New to him, R (\\%) & ${cellOf(H[0].newToHim.R)} & ${cellOf(H[1].newToHim.R)} & -- \\\\`,
    '\\midrule',
    `His move unsound: positions & ${count(H[0].whenWrong.n)} & ${count(H[1].whenWrong.n)} & -- \\\\`,
    `\\quad some T move sound (\\%) & ${cellOf(H[0].whenWrong.T)} & ${cellOf(H[1].whenWrong.T)} & -- \\\\`,
    `\\quad some R move sound (\\%) & ${cellOf(H[0].whenWrong.R)} & ${cellOf(H[1].whenWrong.R)} & -- \\\\`,
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The mean win\\% each arm's moves give up against Stockfish's best (a move that scores above it gives up none); the share of each arm's moves that are the best; the share of positions where a move of the arm is sound, is not his move and has under ${Math.round(100 * HARD)}\\% at his band by Maia-2; and, where his own move is not sound, the share of positions where at least one of the arm's moves is. 95\\% intervals.}`,
    '\\label{tab:more}',
    '\\end{table}',
  ].join('\n'),
)

// ---- the verdict and what it rests on ----
const holds0 = (c) => c !== null && c[0] <= 0 && c[1] >= 0
const T = out.controls.twin
claim(out.verdict === 'likeness works' && T.pass && out.controls.null.pass, 'both controls pass and the verdict is that likeness works')
claim(H.every((h) => h.positions >= MIN_POSITIONS && h.lift.ci[0] > 0), 'the lift lies above 0 on both halves, each with enough positions')
claim(H.every((h) => h.status['no exact best'] === undefined && h.inexact === 0) && out.strong.inexact === 0, 'every score was exact')
g.def('ScoredAll', count(H[0].positions + H[1].positions))
g.def('TwinSound', pts(T.twin.value)).def('TwinSoundCi', ciWords(T.twin.ci)).def('TwinR', pts(T.R.value)).def('TwinRCi', ciWords(T.R.ci))
g.def('TwinLift', pts(T.lift.value)).def('TwinLiftCi', ciWords(T.lift.ci))
claim(T.lift.ci[0] > 0.3, "the twin's lift lies far above 0")
claim(T.twin.value > 0.6 && T.twin.value < 0.72, "a strong player's own move is sound in about two thirds of their positions")
claim(I.speeds.Blitz > 0.8 * I.indexGames / (1 - 1 / HELD_OUT_ONE_IN) * (1 - 1 / HELD_OUT_ONE_IN), 'most of the index is blitz')
const NL = out.controls.null.halves
claim(NL.every((x) => holds0(x.ci)), "the null's interval holds 0 on both halves")
g.def('NullFirst', pts(NL[0].value)).def('NullFirstCi', ciWords(NL[0].ci)).def('NullSecond', pts(NL[1].value)).def('NullSecondCi', ciWords(NL[1].ci))
for (const [i, h] of H.entries()) {
  const x = HALF[i]
  const so = h.soundness
  g.def(`T${x}`, pts(so.T.value)).def(`R${x}`, pts(so.R.value)).def(`RTwo${x}`, pts(so.R2.value)).def(`A${x}`, pts(so.A.value)).def(`N${x}`, pts(so.N.value)).def(`U${x}`, pts(so.U.value))
  g.def(`Lift${x}`, pts(h.lift.value)).def(`Lift${x}Ci`, ciWords(h.lift.ci))
  g.def(`LostT${x}`, fixed(h.lost.T.value, 1)).def(`LostR${x}`, fixed(h.lost.R.value, 1)).def(`LostA${x}`, fixed(h.lost.A.value, 1))
  g.def(`BestT${x}`, pts(h.best.T.value)).def(`BestR${x}`, pts(h.best.R.value))
  claim(so.T.value / so.A.value > 0.4 && so.T.value / so.A.value < 0.6, `${x} half: a match's move is sound about half as often as his own`)
  claim(so.N.value > so.A.value && so.U.value > so.A.value, `${x} half: Maia-2's most likely moves are sound more often than his`)
  claim(h.lost.R.value - h.lost.T.value > 0.5 && h.lost.R.value - h.lost.T.value < 1.5, `${x} half: the matches' moves give up about one point less than the random matches'`)
  claim(h.lost.T.value > 2 * h.lost.A.value, `${x} half: the matches' moves give up more than twice what his own moves give up`)
  const d = h.distances
  claim(d.every((b, k) => k === 0 || b.sound.value < d[k - 1].sound.value), `${x} half: a match's move is sound more often the nearer its position`)
  claim(d.slice(0, 3).every((b) => b.fromT.value >= 0.99) && d[3].fromT.value > 0.4 && d[3].fromT.value < 0.5, `${x} half: almost every match within 9 is T's, and a little under half at 10 or more`)
  const rAt = d.map((b) => b.matches * (1 - b.fromT.value))
  claim(rAt.slice(0, 3).reduce((a, b) => a + b, 0) / rAt.reduce((a, b) => a + b, 0) < 0.01, `${x} half: nearly all of R's matches are at 10 or more`)
  for (const [k, name] of ['Zero', 'Three', 'Six', 'Ten'].entries()) g.def(`Dist${name}${x}`, pts(d[k].sound.value, 0))
  const ph = Object.fromEntries(h.phase.map((c) => [c.key, c]))
  const stc = Object.fromEntries(h.structure.map((c) => [c.key, c]))
  claim(ph.middlegame.lift.value > ph.endgame.lift.value && stc.named.lift.value > stc.none.lift.value, `${x} half: the lift is larger in the middlegame and with a named structure`)
  g.def(`MidLift${x}`, pts(ph.middlegame.lift.value)).def(`EndLift${x}`, pts(ph.endgame.lift.value)).def(`NamedLift${x}`, pts(stc.named.lift.value)).def(`NoneLift${x}`, pts(stc.none.lift.value))
  claim(holds0(h.newToHim.lift.ci), `${x} half: T and R bring sound moves new to him equally often`)
  g.def(`NewT${x}`, pts(h.newToHim.T.value)).def(`NewR${x}`, pts(h.newToHim.R.value))
  g.def(`Wrong${x}`, count(h.whenWrong.n)).def(`WrongT${x}`, pts(h.whenWrong.T.value)).def(`WrongR${x}`, pts(h.whenWrong.R.value))
}
claim(holds0(Object.fromEntries(H[1].phase.map((c) => [c.key, c])).endgame.lift.ci) && !holds0(Object.fromEntries(H[0].phase.map((c) => [c.key, c])).endgame.lift.ci), "only the second half's endgame interval holds 0")
const SD = out.strong.distances
claim(SD.every((b, k) => k === 0 || b.sound.value < SD[k - 1].sound.value), "in strong players' positions too a match's move is sound more often the nearer its position")
g.def('StrongDistZero', pts(SD[0].sound.value, 0)).def('StrongDistTen', pts(SD[3].sound.value, 0))
g.def('StrongLift', pts(out.strong.lift.value)).def('StrongLiftCi', ciWords(out.strong.lift.ci))
claim(out.strong.lift.ci[0] > 0, "in strong players' own positions the lift lies above 0")

// ---- added after the run ----
const Dx = read('descriptions.json')
const both = Dx.his.find((h) => h.half === 'both')
claim(both.positions === H[0].positions + H[1].positions, 'the descriptions read the positions the report counted')
const near = both.bins[0]
const far = both.bins[3]
claim(far.share > 0.75, 'most of his positions have no match nearer than 10')
claim(holds0(near.nearestMinusA.ci) && holds0(near.nearestMinusN.ci) && near.nearestMinusN.value <= 0.05, "within 2 the nearest match's move does about as well as his own and no better than Maia-2's")
claim(near.A.ci[0] > far.A.ci[1] && near.N.ci[0] > far.N.ci[1], 'positions with a match within 2 are easier: his own move and Maia-2\'s are sound more often there')
claim(far.nearest.value < far.A.value && far.nearest.value < far.N.value, "at 10 or more the nearest match's move is sound less often than his own and Maia-2's")
g.def('FarShare', pts(far.share, 0)).def('FarSound', pts(far.nearest.value)).def('FarA', pts(far.A.value)).def('FarMaia', pts(far.N.value))
g.def('NearTwoShare', pts(near.share)).def('NearTwoCount', count(near.positions)).def('NearTwoSound', pts(near.nearest.value)).def('NearTwoA', pts(near.A.value)).def('NearTwoMaia', pts(near.N.value))
const binName = (b) => (b.bin[1] === null ? `${b.bin[0]} or more` : `${b.bin[0]} to ${b.bin[1]}`)
g.block(
  'NearestTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{@{}lrrllll@{}}',
    '\\toprule',
    'Nearest match & Positions & Share (\\%) & Its move & R & His move & N, his band \\\\',
    '\\midrule',
    ...both.bins.map((b) => `${binName(b)} & ${count(b.positions)} & ${pts(b.share)} & ${cellOf(b.nearest)} & ${cellOf(b.R)} & ${cellOf(b.A)} & ${cellOf(b.N)} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Added after the run. His positions, both halves, by the distance of their nearest match: how many, and the share of moves that are sound, in \\%, for the nearest match's move, R's, his own and Maia-2's most likely move at his band, with 95\\% intervals resampling his games.}`,
    '\\label{tab:nearest}',
    '\\end{table}',
  ].join('\n'),
)
const SC = Dx.scale
claim(SC.length >= 3 && SC.every((x, k) => k === 0 || (x.median <= SC[k - 1].median && x.within2 >= SC[k - 1].within2)), 'a bigger index brings his nearest matches no farther')
const factor = SC.at(-1).streamGames / SC[0].streamGames
claim(Number.isInteger(factor), 'the largest index is a whole multiple of the smallest')
const doublings = Math.log2(factor)
claim(Math.abs(SC[0].median - SC.at(-1).median - doublings) <= 1, 'the median distance falls by about one for each doubling of the index')
claim(SC.at(-1).median === H[0].nearestDistance && SC.at(-1).median === H[1].nearestDistance, "the curve's last median is the report's on both halves")
g.def('ScaleFactor', word(factor)).def('ScaleMedianFirst', String(SC[0].median)).def('ScaleMedianLast', String(SC.at(-1).median))
g.def('ScaleTwoFirst', pts(SC[0].within2)).def('ScaleTwoLast', pts(SC.at(-1).within2))
g.block(
  'ScaleTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{@{}rrrrrrr@{}}',
    '\\toprule',
    'Stream games & Index games & No match & Median distance & Within 2 (\\%) & Within 5 (\\%) & Within 9 (\\%) \\\\',
    '\\midrule',
    ...SC.map((x) => `${count(x.streamGames)} & ${count(x.indexGamesWithThesePieces)} & ${count(x.none)} & ${x.median} & ${pts(x.within2)} & ${pts(x.within5)} & ${pts(x.within9)} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Added after the run. The nearest match that transfers for each of his scored positions, with the index cut to the positions of the first games of the stream: how many have no match at all, the median distance, a position with no match counting as farther than any, and the share of positions with one within 2, 5 and 9. Index games counts the index games with any of his positions' sets of pieces. With the whole index, every position has its nearest match at the distance T found.}`,
    '\\label{tab:scale}',
    '\\end{table}',
  ].join('\n'),
)
claim(SC.at(-1).none === 0, 'with the whole index every scored position has a match')

// ---- two positions ----
const hisRows = readdirSync(dir)
  .filter((f) => /^his-\d+-of-\d+\.jsonl$/.test(f))
  .flatMap((f) => readJsonl(join(dir, f)))
const scoredRows = hisRows.filter((r) => r.status === 'scored' && Object.values(r.scores).every((x) => x.exact))
claim(scoredRows.filter((r) => r.half === 1).length === H[1].positions, "the private rows are the second half's positions the report counted")
const candidates = new Map(readJsonl(join(dir, 'his-candidates.jsonl')).map((c) => [c.id, c]))
const sameSide = (r) => {
  const c = candidates.get(r.id)
  return (r.T[0].ply % 2 === 0 ? 'w' : 'b') === c.myColor
}
const pick = (keep) =>
  scoredRows
    .filter((r) => r.half === 1 && sameSide(r) && keep(r))
    .sort((a, b) => a.T[0].d - b.T[0].d || a.id - b.id)[0] ?? null
const nearestRow = pick(() => true)
const medianRow = pick((r) => r.T[0].d === H[1].nearestDistance)
claim(nearestRow && medianRow, 'both examples exist')
const wantedGames = new Set([nearestRow, medianRow].map((r) => r.T[0].game))
const sansOf = new Map()
let gi = -1
for await (const line of linesOf(join(dir, `strong-${MONTH}.jsonl.gz`))) {
  gi++
  if (wantedGames.has(gi)) sansOf.set(gi, JSON.parse(line).sans)
  if (sansOf.size === wantedGames.size) break
}
const engine = N.createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false, pool: 1 })
const SIDE = { w: 'White', b: 'Black' }
const sanOf = (fen, uci) => new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
const arrows = (fen, marks) =>
  `\\chessboard[setfen={${fen}}, boardfontsize=13pt, ${marks.map(([uci, color]) => `pgfstyle=straightmove, arrow=to, linewidth=0.07em, color=${color}, markmoves={${uci.slice(0, 2)}-${uci.slice(2, 4)}}`).join(', ')}]`
const COLOR = { sound: 'green!50!black', unsound: 'red!75!black', his: 'blue!70!black' }
async function example(prefix, row) {
  const c = candidates.get(row.id)
  const m = row.T[0]
  const replayed = C.replaySans(C.START_FEN, sansOf.get(m.game))
  const strongFen = replayed.fens[m.ply]
  const strongUci = replayed.ucis[m.ply]
  const strongTurn = strongFen.split(' ')[1]
  claim(strongTurn === c.myColor && strongUci === m.move, `${prefix}: the strong player's move is the match's, on the same side`)
  const hisBoard = normalBoard(c.fen)
  const theirBoard = normalBoard(strongFen)
  claim(materialKey(hisBoard) === materialKey(theirBoard), `${prefix}: the two positions have the same pieces`)
  const parts = distanceParts(featuresOf(hisBoard), groupSizes(materialKey(hisBoard)), featuresOf(theirBoard))
  claim(parts.pawns + parts.pieces + parts.kings === m.d, `${prefix}: the distance is the match's`)
  await engine.newGame('analyst')
  const pos = C.position(C.START_FEN, c.history)
  const best = (await engine.bestMoves(pos, { budget: BUDGET, multiPv: 1, priority: 'batch' })).lines[0]
  claim(best.move === row.best, `${prefix}: the referee's best move is the run's`)
  const again = {}
  for (const uci of Object.keys(row.scores)) {
    const r = await engine.scoreMove(pos, uci, { budget: BUDGET, priority: 'batch' })
    again[uci] = { sound: E.acceptsAlternative(r.score, best.score, c.myColor), wp: Sc.winPercentFor(r.eval, c.myColor) }
  }
  claim(Object.keys(row.scores).every((u) => again[u].sound === row.scores[u].sound), `${prefix}: every move's soundness is the run's`)
  const bestWp = Sc.winPercentFor(best.eval, c.myColor)
  claim(Math.abs(bestWp - row.wp) < 0.5, `${prefix}: the best move's win% is the run's`)
  const sound = row.scores[m.move].sound
  g.def(`${prefix}Fen`, `\\fen{${c.fen}}`).def(`${prefix}StrongFen`, `\\fen{${strongFen}}`).def(`${prefix}Mover`, SIDE[c.myColor]).def(`${prefix}Phase`, row.phase)
  g.def(`${prefix}D`, String(m.d)).def(`${prefix}Pawns`, String(parts.pawns)).def(`${prefix}Pieces`, String(parts.pieces)).def(`${prefix}Kings`, String(parts.kings))
  g.def(`${prefix}Move`, movesTex(c.fen, [sanOf(c.fen, m.move)])).def(`${prefix}Best`, movesTex(c.fen, [sanOf(c.fen, row.best)])).def(`${prefix}Played`, movesTex(c.fen, [sanOf(c.fen, row.played)]))
  g.def(`${prefix}StrongMove`, movesTex(strongFen, [sanOf(strongFen, strongUci)]))
  g.def(`${prefix}MoveUci`, `\\uci{${m.move}}`).def(`${prefix}BestUci`, `\\uci{${row.best}}`).def(`${prefix}PlayedUci`, `\\uci{${row.played}}`)
  g.def(`${prefix}WpBest`, fixed(bestWp, 0)).def(`${prefix}WpMove`, fixed(again[m.move].wp, 0)).def(`${prefix}WpPlayed`, fixed(again[row.played].wp, 0))
  g.def(`${prefix}Sound`, sound ? 'sound' : 'not sound')
  g.def(`${prefix}TSound`, word(row.T.filter((x) => row.scores[x.move].sound).length)).def(`${prefix}RSound`, word(row.R.filter((x) => row.scores[x.move].sound).length))
  g.block(`${prefix}Board`, arrows(c.fen, [[row.played, COLOR.his], [m.move, sound ? COLOR.sound : COLOR.unsound]]))
  g.block(`${prefix}StrongBoard`, arrows(strongFen, [[strongUci, sound ? COLOR.sound : COLOR.unsound]]))
  return { row, sound, parts }
}
const ea = await example('Ea', nearestRow)
const eb = await example('Eb', medianRow)
await engine.dispose?.()

g.write(join(HERE, 'generated.tex'))
console.error('positions-like-this: wrote paper/generated.tex')
process.exit(0)
