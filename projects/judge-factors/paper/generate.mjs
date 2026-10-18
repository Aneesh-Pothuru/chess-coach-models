#!/usr/bin/env node
// Writes paper/generated.tex for the judge factors: the rule's verdict on each
// reading and the descriptions (results/judge-factors.json), the study's
// design from the app's own constants, and two positions from the private
// rows. It refuses to write when a claim the paper makes no longer holds.
//
//   bridge/run.sh projects/judge-factors/paper/generate.mjs

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, fixed, movesTex, percent, word } from '../../paper.mjs'
import { BANDS, CAP, DRILL_FACTORS, MIN_HELDOUT, MIN_LEGAL_MOVES, MONTHS, PROJECT, READINGS, RELIABLE, WORST_PIECE_LEAN, keyOf, readJsonl, studyRows } from '../lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const D = await chess('src/services/publishing/decks/evalDeck.ts')
const E = await chess('src/services/engine/index.ts')
const { LEAN_CP } = await chess('src/services/exercises/families/judge.ts')
const out = JSON.parse(readFileSync(join(resultsDir(PROJECT), 'judge-factors.json'), 'utf8'))
const dir = privateDir(PROJECT)
const g = new Generated('projects/judge-factors/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const count = (n) => n.toLocaleString('en-US')
const pct = (x, d = 1) => (x === null || x === undefined ? '--' : percent(x, d))
const ci = (a, d = 1) => (a.ci ? `${pct(a.share, d)} (${pct(a.ci[0], d)}--${pct(a.ci[1], d)})` : '--')
const SPLITS = ['train', 'heldout']
const NAMES = { kingSafety: 'King safety', activity: 'Activity and space', structure: 'Pawn structure', threats: 'Something loose', worstPiece: 'The worst piece' }
const MACRO = { kingSafety: 'King', activity: 'Activity', structure: 'Structure', threats: 'Loose', worstPiece: 'Worst' }

// ---- what was measured ----
const X = out.design
claim(X.months.train === MONTHS.train && X.months.heldout === MONTHS.heldout && X.cap === CAP && X.minHeldout === MIN_HELDOUT, 'the report ran the design the README fixed')
claim(X.leanCp === LEAN_CP && X.worstPieceLean === WORST_PIECE_LEAN && X.levelCp === D.EVAL_LEVEL_CP && X.clearCp === D.EVAL_CLEAR_CP && X.budget === 'grade', "the report used the drill's own scale")
g.def('AppCommit', out.app.commit.slice(0, 10))
g.def('LeanCp', String(LEAN_CP)).def('TwiceLeanCp', String(2 * LEAN_CP)).def('WorstLean', word(WORST_PIECE_LEAN)).def('TwiceWorstLean', word(2 * WORST_PIECE_LEAN))
g.def('LevelCp', String(D.EVAL_LEVEL_CP)).def('ClearCp', String(D.EVAL_CLEAR_CP)).def('PlyFloor', String(D.EVAL_PLY_FLOOR)).def('TacticBar', word(D.EVAL_TACTIC_BAR))
g.def('BudgetNodes', count(E.budgetNodes('grade', 'node'))).def('Cap', count(CAP)).def('MinHeldout', String(MIN_HELDOUT)).def('ReliablePct', percent(RELIABLE, 0))
g.def('BandLow', `${BANDS[0][0]}--${BANDS[0][1]}`).def('BandHigh', `${BANDS[1][0]}--${BANDS[1][1]}`).def('RatingLow', String(BANDS[0][0])).def('RatingHigh', String(BANDS[1][1]))
const W = D.EVAL_WEIGHTS
for (const [k, v] of Object.entries({ Shield: W.shield, RingAttacker: W.ringAttacker, HalfOpenFile: W.halfOpenFile, OpenFile: W.openFile, Mobility: W.mobility, Space: W.space, Doubled: W.doubled, Isolated: W.isolated, Passed: W.passed, PassedRank: W.passedRank })) g.def(`W${k}`, String(v))
claim(W.passedEndgame === 1, 'a passed pawn counts up to twice as much as the material comes off')

const S = out.scans
const games = Object.fromEntries(SPLITS.map((s) => [s, JSON.parse(readFileSync(join(dir, `games-${MONTHS[s]}.json`), 'utf8'))]))
for (const s of SPLITS) claim(games[s].kept === S[s].games && games[s].gamesRead === S[s].gamesRead, `the ${s} month's games are the ones the report counted`)
claim(S.train.games === S.heldout.games, 'both months kept the same number of games')
const [base, increment] = games.train.timeControl.split('+').map(Number)
claim(games.heldout.timeControl === games.train.timeControl && increment === 0 && base % 60 === 0, 'both months are one time control with no increment')
g.def('GamesPerMonth', count(S.train.games)).def('Minutes', String(base / 60)).def('MinPlies', String(games.train.minPlies))
g.def('TrainRead', count(S.train.gamesRead)).def('HeldRead', count(S.heldout.gamesRead))
g.def('TrainRapid', count(games.train.rapidGames)).def('HeldRapid', count(games.heldout.rapidGames))
const tooEarly = (s) => S[s].drops.tooEarly
for (const s of SPLITS) {
  const dropped = Object.values(S[s].drops).reduce((a, b) => a + b, 0)
  claim(S[s].positions === S[s].qualifying + dropped, `on ${s}, every position either qualified or was dropped for a reason`)
  claim(S[s].drops.noRead === 0, `on ${s}, the board code read every position it was asked about`)
}
const later = (s) => S[s].positions - tooEarly(s)
g.def('TrainPositions', count(S.train.positions)).def('HeldPositions', count(S.heldout.positions))
g.def('TrainLater', count(later('train'))).def('HeldLater', count(later('heldout')))
g.def('TrainQualifying', count(S.train.qualifying)).def('HeldQualifying', count(S.heldout.qualifying))
g.def('TrainQualifyingPct', percent(S.train.qualifying / later('train'), 0)).def('HeldQualifyingPct', percent(S.heldout.qualifying / later('heldout'), 0))
g.def('TrainLevelDrop', percent(S.train.drops.materialNotLevel / later('train'), 0)).def('HeldLevelDrop', percent(S.heldout.drops.materialNotLevel / later('heldout'), 0))
g.def('TrainTactical', count(S.train.drops.tactical)).def('HeldTactical', count(S.heldout.drops.tactical))
g.def('Rows', count(out.positions.rows)).def('Unique', count(out.positions.unique))

// ---- the readings in the positions ----
const verdicts = new Map(
  readdirSync(dir)
    .filter((f) => /^verdicts-\d+-of-\d+\.jsonl$/.test(f))
    .flatMap((f) => readJsonl(join(dir, f)))
    .map((v) => [v.key, v]),
)
const rows = studyRows(dir).map((p) => {
  const v = verdicts.get(keyOf(p))
  claim(Boolean(v), 'every position has its verdict')
  const value = p.readings[p.reading]
  const verdict = D.verdictFor(v.cp)
  return { ...p, split: p.month === MONTHS.train ? 'train' : 'heldout', value, favours: value > 0 ? 'white' : 'black', cp: v.cp, mate: v.mate, verdict: verdict ?? 'neither' }
})
claim(rows.length === out.positions.rows, 'the rows the paper reads are the ones the report counted')
const loose = rows.filter((r) => r.reading === 'threats')
claim(loose.every((r) => r.mine === 1 && !(r.theirs > 0) && Math.abs(r.value) === 100), 'something loose leans only when the side to move can win a pawn by a capture and the other side has nothing to take')
claim(loose.every((r) => (r.value > 0) === (r.fen.split(' ')[1] === 'w')), 'something loose always favours the side to move')

const R = out.readings
const kept = (s, r) => S[s].kept[r]
for (const r of READINGS) {
  for (const s of SPLITS) claim(R[r].verdicts[s].n === kept(s, r) && kept(s, r) === Math.min(CAP, S[s].gamesWithLean[r]), `${r} on ${s} kept what the cap allows`)
  g.def(`${MACRO[r]}TrainKept`, count(kept('train', r))).def(`${MACRO[r]}HeldKept`, count(kept('heldout', r)))
  g.def(`${MACRO[r]}TrainLeans`, count(S.train.gamesWithLean[r])).def(`${MACRO[r]}HeldLeans`, count(S.heldout.gamesWithLean[r]))
  g.def(`${MACRO[r]}Verdict`, R[r].verdict.replace(/\(n=(\d+)\)/, '($n=$1$)'))
  for (const s of SPLITS) {
    const tag = s === 'train' ? 'Train' : 'Held'
    const a = R[r].agreement[s]
    g.def(`${MACRO[r]}${tag}`, ci(a)).def(`${MACRO[r]}${tag}N`, count(a.n)).def(`${MACRO[r]}${tag}Pct`, pct(a.share))
    g.def(`${MACRO[r]}${tag}Level`, pct(R[r].verdicts[s].level, 0)).def(`${MACRO[r]}${tag}Clear`, pct(R[r].verdicts[s].clear, 0))
  }
}

const verdictCell = (r) => R[r].verdict.replace(/\(n=(\d+)\)/, '($n=$1$)')
const ruleRow = (r) => `${NAMES[r]} & ${r === 'worstPiece' ? `${WORST_PIECE_LEAN} moves` : `${LEAN_CP} cp`} & ${count(R[r].agreement.train.n)} & ${ci(R[r].agreement.train)} & ${count(R[r].agreement.heldout.n)} & ${ci(R[r].agreement.heldout)} & ${verdictCell(r)} & ${R[r].reliable ? 'yes' : 'no'} \\\\`
g.block(
  'RuleTable',
  [
    '\\begin{table}[ht]\\centering\\small',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{llrrrrll}',
    '\\toprule',
    ' & & \\multicolumn{2}{c}{Train} & \\multicolumn{2}{c}{Held out} & & \\\\',
    '\\cmidrule(lr){3-4}\\cmidrule(lr){5-6}',
    'Reading & Leans at & Clear & Agreement, \\% & Clear & Agreement, \\% & Verdict & Reliable \\\\',
    '\\midrule',
    ...READINGS.map(ruleRow),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Each reading's agreement with the engine: of its positions with a clear verdict (\\emph{Clear}), the share where the side the reading favours is the side Stockfish says is better, with the 95\\% Wilson interval. The verdict, and whether the reading is reliable on its own, are the rule's, fixed before any position was scored.}`,
    '\\label{tab:rule}',
    '\\end{table}',
  ].join('\n'),
)

// ---- described, not tested ----
const bandKeys = BANDS.map(([lo, hi]) => `${lo}-${hi}`)
const phaseKeys = ['opening', 'middlegame', 'endgame']
const cell = (a) => (a && a.n >= 30 ? `${pct(a.share, 0)} (${count(a.n)})` : a ? `-- (${count(a.n)})` : '--')
const descRow = (r) =>
  `${NAMES[r]} & ${pct(R[r].verdicts.heldout.level, 0)} & ${pct(R[r].verdicts.heldout.clear, 0)} & ${bandKeys.map((b) => cell(R[r].byBand.heldout[b])).join(' & ')} & ${phaseKeys.map((p) => cell(R[r].byPhase.heldout[p])).join(' & ')} & ${cell(R[r].atTwiceLean.heldout)} \\\\`
g.block(
  'DescTable',
  [
    '\\begin{table}[ht]\\centering\\small',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{lrrrrrrrr}',
    '\\toprule',
    ` & \\multicolumn{2}{c}{Engine's verdict} & \\multicolumn{2}{c}{Band} & \\multicolumn{3}{c}{Phase} & \\\\`,
    '\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}\\cmidrule(lr){6-8}',
    `Reading & Level & Clear & ${BANDS.map(([lo, hi]) => `${lo}--${hi}`).join(' & ')} & Opening & Middle & End & Twice the lean \\\\`,
    '\\midrule',
    ...READINGS.map(descRow),
    '\\bottomrule',
    '\\end{tabular}',
    "\\caption{Held-out positions only. \\emph{Level} and \\emph{Clear}: the share of a reading's positions the engine calls level or clear. The other columns give the agreement, with the number of clear positions in brackets, by the band of the two players' mean rating, by the divider's phase, and where the reading is at least twice its lean; a cell with fewer than 30 clear positions shows only its count. These were named before the run and carry no rule.}",
    '\\label{tab:desc}',
    '\\end{table}',
  ].join('\n'),
)

const resultRow = (r) => `${NAMES[r]} & ${count(R[r].result.heldout.reading.n)} & ${ci(R[r].result.heldout.reading, 0)} & ${ci(R[r].result.heldout.engine, 0)} \\\\`
g.block(
  'ResultTable',
  [
    '\\begin{table}[ht]\\centering\\small',
    '\\begin{tabular}{lrrr}',
    '\\toprule',
    "Reading & Decisive games & Reading's side won & Engine's side won \\\\",
    '\\midrule',
    ...READINGS.map(resultRow),
    '\\bottomrule',
    '\\end{tabular}',
    "\\caption{Held-out positions with a clear verdict from games that ended in a win: how often the side the reading favours won the game, beside how often the side the engine favours won it, with 95\\% Wilson intervals.}",
    '\\label{tab:result}',
    '\\end{table}',
  ].join('\n'),
)

const DS = out.drillSum
g.def('SumTrain', ci(DS.train)).def('SumHeld', ci(DS.heldout)).def('SumTrainN', count(DS.train.n)).def('SumHeldN', count(DS.heldout.n))
const L = out.logistic
g.def('LogTrain', pct(L.accuracy.train.share)).def('LogHeld', pct(L.accuracy.heldout.share)).def('LogTrainN', count(L.accuracy.train.n)).def('LogHeldN', count(L.accuracy.heldout.n))
for (const r of READINGS) g.def(`${MACRO[r]}Weight`, fixed(L.weights[r], 2))

// ---- the verdict's claims ----
const order = (s) => [...READINGS].sort((a, b) => R[b].agreement[s].share - R[a].agreement[s].share)
claim(READINGS.every((r) => R[r].verdict === 'tells who is better'), 'every reading tells who is better')
claim(READINGS.filter((r) => !R[r].reliable).join() === 'structure', 'all but pawn structure are reliable on their own')
claim(order('train').join() === order('heldout').join(), 'the readings rank the same on both months')
claim(order('heldout').join() === 'threats,activity,kingSafety,worstPiece,structure', 'something loose agrees most and pawn structure least')
claim(R.structure.agreement.train.ci[0] < RELIABLE && R.structure.agreement.heldout.ci[0] < RELIABLE, 'pawn structure falls short of reliable on both months')
g.def('Ranked', order('heldout').map((r) => `${NAMES[r].toLowerCase()} (\\${MACRO[r]}HeldPct\\%)`).join(', ').replace(/, ([^,]*)$/, ', then $1'))

// ---- the descriptions' claims ----
const levelShares = READINGS.map((r) => R[r].verdicts.heldout.level)
g.def('LevelMin', pct(Math.min(...levelShares), 0)).def('LevelMax', pct(Math.max(...levelShares), 0))
claim(Math.min(...levelShares) >= 0.2 && Math.max(...levelShares) < 0.4, 'the engine calls between a fifth and two fifths of each reading\'s positions level')
for (const r of ['kingSafety', 'activity']) {
  for (const s of SPLITS) claim(R[r].atTwiceLean[s].share >= 0.88 && R[r].atTwiceLean[s].n < 60, `${r} at twice its lean agrees in nearly every position, on few positions, on ${s}`)
  g.def(`${MACRO[r]}TwiceHeld`, pct(R[r].atTwiceLean.heldout.share, 0)).def(`${MACRO[r]}TwiceHeldN`, String(R[r].atTwiceLean.heldout.n))
}
for (const r of ['structure', 'worstPiece']) {
  for (const s of SPLITS) {
    const t = R[r].atTwiceLean[s]
    claim(t.ci[0] <= R[r].agreement[s].share && R[r].agreement[s].share <= t.ci[1], `${r} gains nothing at twice its lean on ${s}`)
  }
  g.def(`${MACRO[r]}TwiceHeld`, pct(R[r].atTwiceLean.heldout.share, 0)).def(`${MACRO[r]}TwiceHeldN`, String(R[r].atTwiceLean.heldout.n))
}
claim(R.threats.atTwiceLean.train.n === 0 && R.threats.atTwiceLean.heldout.n === 0, 'something loose never reaches twice its lean')
for (const s of SPLITS) claim(READINGS.every((r) => R[r].result[s].reading.share < R[r].result[s].engine.share), `on ${s}, the side a reading favours wins less often than the side the engine favours`)
const gap = (r) => R[r].result.heldout.engine.share - R[r].result.heldout.reading.share
claim([...READINGS].sort((a, b) => gap(b) - gap(a))[0] === 'structure', "pawn structure trails the engine's side by the most in the results")
const won = READINGS.map((r) => R[r].result.heldout.reading.share)
g.def('WonMin', pct(Math.min(...won), 0)).def('WonMax', pct(Math.max(...won), 0)).def('StructureWon', pct(R.structure.result.heldout.reading.share, 0)).def('StructureEngineWon', pct(R.structure.result.heldout.engine.share, 0))
for (const s of SPLITS) claim(L.accuracy[s].share > DS[s].share, `on ${s}, the weighted model picks the better side more often than the plain sum`)
const perLean = { kingSafety: (LEAN_CP / 100) * L.weights.kingSafety, activity: (LEAN_CP / 100) * L.weights.activity, structure: (LEAN_CP / 100) * L.weights.structure, threats: (LEAN_CP / 100) * L.weights.threats, worstPiece: WORST_PIECE_LEAN * L.weights.worstPiece }
claim(['threats', 'activity', 'kingSafety', 'structure'].every((r, i, a) => i === 0 || L.weights[a[i - 1]] > L.weights[r]), 'per centipawn the model weighs something loose most, then activity, king safety and pawn structure')
claim(Object.entries(perLean).every(([r, v]) => r === 'worstPiece' || v > perLean.worstPiece), 'the worst piece at its lean moves the model less than any drill factor at its lean')

// ---- added after the run ----
const A = out.added
claim(/^Added after the run/.test(A.note), 'the added descriptions say they were added after the run')
const B = A.baseline
for (const s of SPLITS) claim(B[s].sideToMoveWhenNothingLoose.ci[0] > 0.6 && B[s].sideToMoveWhenNothingLoose.ci[1] < 0.7, `on ${s}, the side to move is the better side in about two clear positions in three when nothing is loose`)
g.def('MoverTrain', ci(B.train.sideToMoveWhenNothingLoose)).def('MoverHeld', ci(B.heldout.sideToMoveWhenNothingLoose)).def('MoverHeldN', count(B.heldout.sideToMoveWhenNothingLoose.n))
g.def('WhiteHeld', pct(B.heldout.white.share, 0)).def('MoverHeldPct', pct(B.heldout.sideToMoveWhenNothingLoose.share, 0))
const moverBase = B.heldout.sideToMoveWhenNothingLoose.share
const chanceFromMove = (r) => A.bySideToMove[r].heldout.favoursMover * moverBase + (1 - A.bySideToMove[r].heldout.favoursMover) * (1 - moverBase)
claim(DRILL_FACTORS.filter((r) => r !== 'threats').concat('worstPiece').every((r) => chanceFromMove(r) < 0.5), 'for every reading but something loose, the move alone would put agreement below half')
claim(R.threats.agreement.heldout.ci[0] > moverBase + 0.2, "something loose agrees far more often than the side to move's base rate")
const T = A.bySideToMove
for (const s of SPLITS) {
  claim(READINGS.every((r) => T[r][s].forMover.share >= 0.85), `on ${s}, a reading that favours the side to move agrees at least 85% of the time`)
  claim(READINGS.filter((r) => r !== 'threats').every((r) => T[r][s].favoursMover < 0.5), `on ${s}, every reading but something loose favours the side that just moved more often than the side to move`)
  claim(['kingSafety', 'activity'].every((r) => T[r][s].forOther.ci[0] > 0.5), `on ${s}, king safety and activity still agree when they favour the side that just moved`)
  claim(['structure', 'worstPiece'].every((r) => T[r][s].forOther.ci[0] < 0.5), `on ${s}, pawn structure and the worst piece are no better than a coin when they favour the side that just moved`)
}
const forMover = READINGS.map((r) => T[r].heldout.forMover.share)
g.def('ForMoverMin', pct(Math.min(...forMover), 0)).def('ForMoverMax', pct(Math.max(...forMover), 0))
for (const r of READINGS) {
  g.def(`${MACRO[r]}ForOther`, T[r].heldout.forOther.n ? pct(T[r].heldout.forOther.share, 0) : '--').def(`${MACRO[r]}ForOtherTrain`, T[r].train.forOther.n ? pct(T[r].train.forOther.share, 0) : '--')
  g.def(`${MACRO[r]}Alone`, pct(A.alone[r].heldout.share, 0))
}
for (const s of SPLITS) claim(READINGS.every((r) => A.alone[r][s].ci[0] > 0.6), `on ${s}, every reading agrees when it is the only drill factor that leans`)
claim(A.alone.structure.heldout.share > R.structure.agreement.heldout.share && A.alone.structure.train.share > R.structure.agreement.train.share, 'pawn structure agrees more often when it is the only sign')
const sideRow = (r) =>
  `${NAMES[r]} & ${pct(T[r].heldout.favoursMover, 0)} & ${ci(T[r].heldout.forMover, 0)} & ${T[r].heldout.forOther.n ? ci(T[r].heldout.forOther, 0) : '--'} & ${ci(A.alone[r].heldout, 0)} \\\\`
g.block(
  'SideTable',
  [
    '\\begin{table}[ht]\\centering\\small',
    '\\begin{tabular}{lrrrr}',
    '\\toprule',
    " & & \\multicolumn{3}{c}{Agreement, \\%} \\\\",
    '\\cmidrule(lr){3-5}',
    'Reading & Favours the mover & For the mover & For the other side & Only sign \\\\',
    '\\midrule',
    ...READINGS.map(sideRow),
    '\\bottomrule',
    '\\end{tabular}',
    "\\caption{Added after the run; held-out positions. \\emph{Favours the mover}: the share of a reading's positions where it favours the side to move. The agreement, with 95\\% Wilson intervals, when it favours the side to move, when it favours the side that just moved, and when no other drill factor leans.}",
    '\\label{tab:side}',
    '\\end{table}',
  ].join('\n'),
)

const C = A.conflicts
const pair = (f, h) => C.find((c) => c.first === f && c.second === h)
const sideWith = (winner, loser) => {
  const c = pair(winner, loser) ?? pair(loser, winner)
  const flip = c.first !== winner
  return Object.fromEntries(SPLITS.map((s) => [s, flip ? { ...c[s], share: 1 - c[s].share, ci: [1 - c[s].ci[1], 1 - c[s].ci[0]] } : c[s]]))
}
const wins = (winner, loser, splits = SPLITS) => splits.every((s) => sideWith(winner, loser)[s].ci[0] > 0.5)
claim(['activity', 'structure', 'worstPiece'].every((r) => wins('threats', r)), 'the engine sides with something loose over activity, pawn structure and the worst piece on both months')
claim(wins('threats', 'kingSafety', ['heldout']) && !wins('threats', 'kingSafety', ['train']), 'something loose beats king safety on the held-out month only')
claim(wins('activity', 'structure'), 'the engine sides with activity over pawn structure on both months')
claim(SPLITS.every((s) => { const x = sideWith('structure', 'worstPiece')[s]; return x.ci[0] < 0.5 && x.ci[1] > 0.5 }), 'pawn structure and the worst piece split their disagreements')
const named = new Set(['activity|threats', 'structure|threats', 'threats|worstPiece', 'kingSafety|threats', 'activity|structure', 'structure|worstPiece'])
claim(C.filter((c) => !named.has(`${c.first}|${c.second}`)).every((c) => !wins(c.first, c.second) && !wins(c.second, c.first)), 'no other pair has a winner on both months')
for (const [w, l, name] of [['threats', 'structure', 'LooseOverStructure'], ['threats', 'activity', 'LooseOverActivity'], ['threats', 'worstPiece', 'LooseOverWorst'], ['threats', 'kingSafety', 'LooseOverKing'], ['activity', 'structure', 'ActivityOverStructure']]) {
  const x = sideWith(w, l)
  g.def(name, pct(x.heldout.share, 0)).def(`${name}N`, String(x.heldout.n)).def(`${name}Train`, pct(x.train.share, 0))
}
const conflictRow = (c) => `${NAMES[c.first]} & ${NAMES[c.second].toLowerCase()} & ${count(c.train.n)} & ${c.train.n ? ci(c.train, 0) : '--'} & ${count(c.heldout.n)} & ${c.heldout.n ? ci(c.heldout, 0) : '--'} \\\\`
g.block(
  'ConflictTable',
  [
    '\\begin{table}[ht]\\centering\\small',
    '\\begin{tabular}{llrrrr}',
    '\\toprule',
    ' & & \\multicolumn{2}{c}{Train} & \\multicolumn{2}{c}{Held out} \\\\',
    '\\cmidrule(lr){3-4}\\cmidrule(lr){5-6}',
    'First & against & $n$ & Sides with the first & $n$ & Sides with the first \\\\',
    '\\midrule',
    ...C.map(conflictRow),
    '\\bottomrule',
    '\\end{tabular}',
    "\\caption{Added after the run. The distinct positions with a clear verdict where both readings lean, in opposite directions: the share where the engine sides with the first, with 95\\% Wilson intervals.}",
    '\\label{tab:conflict}',
    '\\end{table}',
  ].join('\n'),
)

const LM = A.logisticWithMove
for (const s of SPLITS) claim(LM.accuracy[s].share > L.accuracy[s].share, `on ${s}, whose move it is adds to the model`)
const moveVsLean = (r) => (LEAN_CP / 100) * LM.weights[r]
claim(LM.weights.whiteToMove > moveVsLean('kingSafety') && LM.weights.whiteToMove < moveVsLean('activity'), 'the move weighs more than king safety at its lean and less than activity at its lean')
g.def('MoveLogTrain', pct(LM.accuracy.train.share)).def('MoveLogHeld', pct(LM.accuracy.heldout.share))

// ---- two positions ----
const N = await chess('src/adapters/node/engine/index.ts')
const Sc = await chess('src/core/score/index.ts')
const Ch = await chess('src/core/chess/index.ts')
const deckSource = readFileSync(join(CHESS_DIR, 'src/services/publishing/decks/evalDeck.ts'), 'utf8')
const floor = Number(/const MIN_LEGAL_MOVES = (\d+)/.exec(deckSource)?.[1])
claim(floor === MIN_LEGAL_MOVES, "the scan's floor of legal moves is the deck's")
g.def('MinLegal', word(MIN_LEGAL_MOVES))
const fav = (x) => (x > 0 ? 'white' : 'black')
const leans = (r, f) => Math.abs(r.readings[f]) >= LEAN_CP
const only = (r, f) => DRILL_FACTORS.filter((h) => h !== f).every((h) => !leans(r, h))
const heldRows = rows.filter((r) => r.split === 'heldout' && r.mate === null)
const byLean = (f) => (a, b) => Math.abs(b.readings[f]) - Math.abs(a.readings[f])
const active = heldRows.filter((r) => r.reading === 'activity' && r.phase === 'middlegame' && only(r, 'activity') && r.verdict === fav(r.value)).sort(byLean('activity'))[0]
const pawns = heldRows.filter((r) => r.reading === 'structure' && only(r, 'structure') && fav(r.value) !== (r.fen.split(' ')[1] === 'w' ? 'white' : 'black') && r.verdict === (r.fen.split(' ')[1] === 'w' ? 'white' : 'black')).sort(byLean('structure'))[0]
claim(active && pawns, 'both examples exist')
const engine = N.createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false, pool: 1 })
const SIDE = { w: 'White', b: 'Black' }
async function example(prefix, r) {
  await engine.newGame('analyst')
  const res = await engine.evaluate(Ch.position(Ch.START_FEN, r.ucis), 'grade', { cache: 'bypass', priority: 'batch' })
  claim(Sc.cpOf(res.eval) === r.cp, `the engine gives ${prefix}'s position the score the verdict run stored`)
  const board = new Chess(r.fen)
  const sans = []
  for (const uci of res.pv.slice(0, 4)) sans.push(board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san)
  const read = D.factorsFor(r.fen, r.mine, r.theirs)
  const stm = r.fen.split(' ')[1]
  g.def(`${prefix}Fen`, `\\fen{${r.fen}}`).def(`${prefix}Mover`, SIDE[stm]).def(`${prefix}Other`, SIDE[stm === 'w' ? 'b' : 'w'])
  g.def(`${prefix}Pawns`, fixed(Math.abs(r.cp) / 100, 1)).def(`${prefix}Better`, r.cp > 0 ? 'White' : 'Black').def(`${prefix}Value`, String(Math.abs(r.value))).def(`${prefix}Favours`, r.value > 0 ? 'White' : 'Black')
  g.def(`${prefix}Line`, movesTex(r.fen, sans))
  g.block(`${prefix}Board`, `\\chessboard[setfen={${r.fen}}, boardfontsize=14pt]`)
  return { read, sans }
}
const one = await example('Ea', active)
const ev = one.read.evidence
g.def('EaWhiteMoves', String(ev.white.mobility)).def('EaBlackMoves', String(ev.black.mobility)).def('EaWhiteSpace', String(ev.white.space)).def('EaBlackSpace', String(ev.black.space))
claim(Math.sign(ev.white.mobility - ev.black.mobility) === Math.sign(active.value) && Math.sign(ev.white.space - ev.black.space) === Math.sign(active.value), 'in the first example the active side has both more moves and more space')
const two = await example('Eb', pawns)
const ew = two.read.evidence
const pawnSide = pawns.value > 0 ? ew.white : ew.black
const moverSide = pawns.value > 0 ? ew.black : ew.white
g.def('EbPassers', word(pawnSide.passed)).def('EbMoverPassers', word(moverSide.passed)).def('EbMoverIsolated', word(moverSide.isolated))
claim(pawnSide.passed > moverSide.passed && moverSide.passed === 0, 'in the second example only the side that just moved has passed pawns')
claim(pawns.phase === 'endgame' && pawns.fen.split(' ')[1] === 'w' && pawns.value < 0 && pawns.verdict === 'white', 'the second example is an endgame, White to move, the pawns favouring Black and the engine White')
claim(active.fen.split(' ')[1] === 'w' && active.value < 0 && active.verdict === 'black', 'the first example is White to move, activity and the engine both favouring Black')
claim(pawns.mine === 1 && pawns.theirs === 1, 'in the second example each side has a pawn to take, and the side to move takes first')
await engine.dispose?.()

g.write(join(HERE, 'generated.tex'))
console.error('judge-factors: wrote paper/generated.tex')
process.exit(0)
