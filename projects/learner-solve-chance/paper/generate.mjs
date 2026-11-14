#!/usr/bin/env node
// Writes paper/generated.tex for the solve-chance paper: round 1's verdicts
// and why they do not stand (results/solve.json, from fit.mjs), the looks on
// the profile as the app holds it, the learner's constants as the app states
// them, the mate-in-one ratings over his attempts, one puzzle he solved, and
// round 2's verdicts on the attempts recorded next (results/round2.json, from
// round2.mjs, which names the commit it read: it is not rerun at the pin).
//
//   bridge/run.sh projects/learner-solve-chance/paper/generate.mjs
//
// It reads private/learner-solve-chance (the rows replay.mjs wrote). What it
// writes names no game; the puzzle shown is a public Lichess puzzle.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { CHESS_DIR, LAB_DIR, chess, privateDir, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, board, esc, figurine, fixed, percent, word } from '../../paper.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FLOW = 'learner-solve-chance'
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const r = json(join(resultsDir(FLOW), 'solve.json'))
const pin = json(join(LAB_DIR, 'bridge', 'chess.json'))
const rows = readFileSync(join(privateDir(FLOW), 'rows.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const { TARGET_P, CHANNEL_WEIGHTS } = await chess('src/services/learner/index.ts')
const { UNKNOWN_FIRST_WEIGHT } = await chess('src/services/learner/channels.ts')
const g = new Generated('projects/learner-solve-chance/paper/generate.mjs')
const count = (x) => x.toLocaleString('en-US').replace(/,/g, '{,}')
const pp = (x) => fixed(100 * x, 1)
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper says ${what}, and the results no longer do`)
}

if (r.app !== pin.commit) throw new Error(`the results measured ${r.app}, the lab pins ${pin.commit}: rerun replay.mjs and fit.mjs`)
g.def('AppCommit', `\\texttt{${pin.commit.slice(0, 7)}}`).def('Draws', count(r.draws)).def('Seed', String(r.seed))

// ---- the learner, as the app states it ----
g.def('TargetCore', percent(TARGET_P.core, 0)).def('TargetNew', percent(TARGET_P.new, 0))
const share = (x) => ({ 0.5: 'half', 0.2: 'a fifth', 0.1: 'a tenth', 0.05: 'a twentieth' })[x] ?? fixed(x, 2)
const W = CHANNEL_WEIGHTS
claim(W.themed.win === 0.2 && W.themedObvious.win === 0.1 && UNKNOWN_FIRST_WEIGHT === 0.5, 'a themed solve counts a fifth, an obvious one a tenth, halved when first exposure is unknown')
g.def('ThemedWin', share(W.themed.win)).def('ThemedLoss', fixed(W.themed.loss, 1)).def('ObviousWin', share(W.themedObvious.win)).def('ObviousLoss', fixed(W.themedObvious.loss, 1))
g.def('UnknownFirst', share(UNKNOWN_FIRST_WEIGHT)).def('ObviousUnknownWin', share(W.themedObvious.win * UNKNOWN_FIRST_WEIGHT))
// What the learner's own notes expect the discount to cost, in their words.
const notes = readFileSync(join(CHESS_DIR, 'src', 'services', 'learner', 'README.md'), 'utf8').replace(/\s+/g, ' ')
const expected = /served at (\d+)% in themed sets only reads about (\d+) points under his strength/.exec(notes)
if (!expected) throw new Error("the learner's notes no longer say what the discount costs a player served in themed sets")
claim(Number(expected[1]) === Math.round(100 * TARGET_P.core), "the notes' simulation serves at the core target")
g.def('NotesPoints', expected[2])

// ---- the record ----
const rec = r.record
g.def('TotalAttempts', String(rec.heldPuzzleTotals.attempts)).def('TotalCorrect', String(rec.heldPuzzleTotals.correct))
g.def('Cards', String(rec.cards)).def('Once', String(rec.once)).def('More', String(rec.more)).def('FromEvents', String(rec.fromEvents)).def('Rebuilt', String(rec.rebuilt))
g.def('LogEntries', String(rec.log.entries)).def('LogOnce', String(rec.log.onceCards)).def('LogMore', String(rec.log.multiCards))
claim(rec.log.onceDisagree === 0 && rec.log.unexplained === 0, 'the legacy log agrees with the cards')
const sel = r.selection
claim(sel.once.withFail === 1, 'one of the cards reviewed once holds a miss')
g.def('OnceMisses', String(sel.once.fails)).def('MoreMisses', String(sel.more.fails)).def('MoreWithMiss', String(sel.more.withFail)).def('AllWithMiss', String(sel.once.withFail + sel.more.withFail))

// ---- round 1, as computed ----
const R1 = r.round1
g.def('RAttempts', String(R1.looks.attempts)).def('RDays', String(R1.looks.days)).def('RFirstTries', String(rec.firstTries))
g.def('RFrom', esc(rec.span.from)).def('RTo', esc(rec.span.to))
g.def('RSolved', pp(R1.looks.solved)).def('RHead', pp(R1.looks.headline.meanChance)).def('RView', pp(R1.looks.view.meanChance))
g.def('RGap', pp(R1.verdict1.gap.value)).def('RGapLo', pp(R1.verdict1.gap.interval[0])).def('RGapHi', pp(R1.verdict1.gap.interval[1]))
claim(R1.verdict1.verdict === 'under-predicts', 'by round 1\'s rule the headline under-predicts')
claim(R1.verdict2.passes === true, 'by round 1\'s rule the view passes on both halves')
R1.verdict2.halves.forEach((h, i) => {
  const n = ['One', 'Two'][i]
  g.def(`H${n}Days`, String(h.days)).def(`H${n}Attempts`, String(h.attempts)).def(`H${n}View`, fixed(h.view, 3)).def(`H${n}Head`, fixed(h.head, 3))
  g.def(`H${n}Diff`, fixed(h.value, 3)).def(`H${n}Lo`, fixed(h.interval[0], 3)).def(`H${n}Hi`, fixed(h.interval[1], 3))
})
// The rebuilt record's solve share against the profile's: the selection, in one comparison.
claim(R1.looks.solved > r.held.solved, 'the rebuilt record holds a larger share of solves than the profile does')

// ---- the profile as the app holds it ----
const H = r.held
g.def('PAttempts', String(H.attempts)).def('PDays', word(H.days)).def('PFrom', esc(H.dayRange[0])).def('PTo', esc(H.dayRange[1])).def('PMisses', word(H.misses))
g.def('PSolved', pp(H.solved)).def('PHead', pp(H.headline.meanChance)).def('PView', pp(H.view.meanChance)).def('PRun', pp(H.run.meanChance))
g.def('PGap', pp(H.headline.gap.value)).def('PGapLo', pp(H.headline.gap.interval[0])).def('PGapHi', pp(H.headline.gap.interval[1]))
g.def('PViewGap', pp(H.view.gap.value)).def('PViewGapLo', pp(H.view.gap.interval[0])).def('PViewGapHi', pp(H.view.gap.interval[1]))
claim(H.headline.gap.interval[0] > 0, 'the headline under-predicts on the profile')
claim(H.view.gap.interval[0] > 0, 'the view under-predicts on the profile too')
claim(H.candidate.interval[1] < 0, 'the view\'s log loss is below the headline\'s on the profile, beyond the noise')
g.def('PDiff', fixed(H.candidate.value, 3)).def('PDiffLo', fixed(H.candidate.interval[0], 3)).def('PDiffHi', fixed(H.candidate.interval[1], 3))
const S = H.scores
for (const [k, n] of [['head', 'Head'], ['view', 'View'], ['run', 'Run']]) g.def(`P${n}LL`, fixed(S[k].logLoss, 3)).def(`P${n}Brier`, fixed(S[k].brier, 3))
const ratio = S.view.logLoss / S.head.logLoss
claim(ratio > 0.4 && ratio < 0.6, 'the view has about half the headline\'s log loss')
claim(Math.abs(S.run.logLoss - S.view.logLoss) < 0.05 && Math.abs(S.run.brier - S.view.brier) < 0.01, 'the running rate scores about as well as the view')
// Most of the headline's chances sit below 70%, and he solved nearly all of those attempts.
const low = H.reliability.head.filter((b) => b.to <= 0.7)
const lowN = low.reduce((a, b) => a + b.n, 0)
const lowSolved = low.reduce((a, b) => a + b.n * (b.solved ?? 0), 0) / lowN
claim(lowN > H.attempts / 2 && lowSolved > 0.9, 'most of the headline\'s chances sit below 70% and he solved nearly all of those')
// In every bucket with more than one attempt: the headline below the view, the view below the share solved.
for (const b of H.buckets.filter((x) => x.n > 1)) claim(b.head < b.view && b.view <= b.solved, `in ${b.bucket} the headline is below the view and the view below his solves`)
// Where each estimate sits against the items it was asked about.
const P = rows.filter((x) => x.record === 'held')
const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length
const headAbove = mean(P.map((x) => x.headRating - x.difficulty))
const viewAbove = mean(P.map((x) => x.viewRating - x.difficulty))
claim(headAbove > 0 && headAbove < 100, 'the headline sits close above the difficulty he was served')
claim(viewAbove > 3 * headAbove, 'the view sits several times as far above it')
g.def('HeadAbove', String(Math.round(headAbove))).def('ViewAbove', String(Math.round(viewAbove)))
g.def('ItemMean', String(Math.round(mean(P.map((x) => x.difficulty)))))
const shiftText = (s) => {
  const atEdge = s.interval[1] === s.edge[1]
  return `${s.shift}${s.shift === s.edge[1] ? ' or more' : ''} (${s.interval[0]} to ${s.interval[1]}${atEdge ? ', the grid\'s edge' : ''})`
}
claim(H.shift.head.shift === H.shift.head.edge[1], 'the headline\'s best shift is at the grid\'s edge')
g.def('PShiftHead', shiftText(H.shift.head)).def('PShiftView', shiftText(H.shift.view)).def('ShiftEdge', String(H.shift.head.edge[1]))

// The learner's own self-check, on the same profile.
const sc = r.selfCheck
claim(sc.meanPredicted < sc.meanObserved, 'the self-check under-predicts too')
claim(sc.brier > sc.baseline.brier, 'the self-check does not beat its constant on Brier')
g.def('SelfN', String(sc.n)).def('SelfPred', percent(sc.meanPredicted, 1)).def('SelfObs', percent(sc.meanObserved, 1))
g.def('SelfBrier', fixed(sc.brier, 3)).def('SelfBaseBrier', fixed(sc.baseline.brier, 3)).def('SelfLL', fixed(sc.logLoss, 3)).def('SelfBaseLL', fixed(sc.baseline.logLoss, 3))

// ---- tables ----
const scoreTable = (L, headLabel) => {
  const label = { head: headLabel, view: 'view of the themed sets', run: 'running rate' }
  const chanceOf = { head: L.headline.meanChance, view: L.view.meanChance, run: L.run.meanChance }
  return [
    '\\begin{tabular}{lrrr}',
    '\\toprule',
    'estimate & mean chance & Brier & log loss \\\\',
    '\\midrule',
    ...['head', 'view', 'run'].map((k) => `${label[k]} & ${pp(chanceOf[k])}\\% & ${fixed(L.scores[k].brier, 3)} & ${fixed(L.scores[k].logLoss, 3)} \\\\`),
    '\\midrule',
    `share solved & ${pp(L.solved)}\\% & & \\\\`,
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n')
}
g.block('ScoreTable', scoreTable(H, 'headline rating (serving read it)'))
const cell = (b) => (b.n ? `${b.n} & ${pp(b.chance)}\\% & ${pp(b.solved)}\\%` : `0 & -- & --`)
const reliabilityTable = (L) => [
  '\\begin{tabular}{lrrrrrr}',
  '\\toprule',
  '& \\multicolumn{3}{c}{headline rating} & \\multicolumn{3}{c}{view} \\\\',
  '\\cmidrule(lr){2-4}\\cmidrule(lr){5-7}',
  'solve chance & attempts & mean chance & solved & attempts & mean chance & solved \\\\',
  '\\midrule',
  ...L.reliability.head.map((b, i) => `${fixed(b.from, 1)} to ${fixed(b.to, 1)} & ${cell(b)} & ${cell(L.reliability.view[i])} \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n')
g.block('ReliabilityTable', reliabilityTable(H))
const bucketName = (b) => ({ mateIn1: 'mate in one', mateIn2: 'mate in two', mateIn3: 'mate in three', hangingPiece: 'hanging piece', fork: 'fork', planning: 'planning', defensiveMove: 'defensive move', pawnEndgame: 'pawn endgame', queenEndgame: 'queen endgame', discoveredAttack: 'discovered attack', backRankMate: 'back-rank mate', promotion: 'promotion', attackingF2F7: 'f2 and f7', 'op:london': 'London System', 'op:caroKann': 'Caro-Kann' })[b] ?? esc(b)
const bucketTable = (L) => [
  '\\begin{tabular}{lrrrrr}',
  '\\toprule',
  'bucket & attempts & mean rating & solved & headline\'s chance & view\'s chance \\\\',
  '\\midrule',
  ...L.buckets.map((b) => `${bucketName(b.bucket)} & ${b.n} & ${Math.round(b.difficulty)} & ${pp(b.solved)}\\% & ${pp(b.head)}\\% & ${pp(b.view)}\\% \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n')
g.block('BucketTable', bucketTable(H))

// ---- what each estimate would aim a set at today ----
const withView = r.today.filter((t) => t.view)
claim(withView.every((t) => t.view.target > t.head.target), 'the view aims every bucket that has one higher than the headline does')
claim(withView.every((t) => t.view.target <= t.bankMax + 100), 'the bank can serve where the view aims')
claim(withView.every((t) => t.app.from === 'view' && t.app.target === t.view.target), 'the app aims every bucket that has a view from it')
const totalsOnly = r.today.filter((t) => !t.view)
claim(totalsOnly.length > 0 && totalsOnly.every((t) => t.app.from === 'totals' && t.app.target > t.head.target), 'the app aims every bucket without a view from its stored totals, higher than the headline does')
claim(totalsOnly.every((t) => t.app.target <= t.bankMax + 100), 'the bank can serve where the stored totals aim')
const ups = withView.map((t) => t.view.target - t.head.target)
const totUps = totalsOnly.map((t) => t.app.target - t.head.target)
g.def('LastDay', esc(rec.lastAttempt)).def('SyncedOn', esc(rec.syncedOn)).def('ProfileCommit', `\\texttt{${rec.profile.slice(0, 7)}}`)
g.def('UpMin', String(Math.min(...ups))).def('UpMax', String(Math.max(...ups))).def('WithView', word(withView.length)).def('WithoutView', word(totalsOnly.length))
g.def('TotUpMin', String(Math.min(...totUps))).def('TotUpMax', String(Math.max(...totUps)))
const phases = new Set(r.today.map((t) => t.phase))
claim(phases.size === 1 && phases.has('core'), 'every bucket is served at the core target today')
const todayTable = (today) => [
  '\\begin{tabular}{lrrrrrrr}',
  '\\toprule',
  '& \\multicolumn{2}{c}{headline} & \\multicolumn{2}{c}{themed view} & \\multicolumn{2}{c}{stored totals} & \\\\',
  '\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}\\cmidrule(lr){6-7}',
  'bucket & rating & aims at & rating & aims at & rating & aims at & hardest in the bank \\\\',
  '\\midrule',
  ...today.map((t) => `${bucketName(t.bucket)} & ${t.head.rating} $\\pm$ ${t.head.rd} & ${t.head.target} & ${t.view ? `${t.view.rating} $\\pm$ ${t.view.rd}` : 'none'} & ${t.view ? t.view.target : '--'} & ${t.app.from === 'totals' ? `${t.app.rating} $\\pm$ ${t.app.rd}` : '--'} & ${t.app.from === 'totals' ? t.app.target : '--'} & ${t.bankMax} \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n')
g.block('TodayTable', todayTable(r.today))

// ---- mate in one over his attempts ----
const M = P.filter((x) => x.bucket === 'mateIn1')
claim(M.length >= 30, 'mate in one holds most of the profile\'s attempts')
const pts = (f) => M.map((x, i) => `(${i + 1},${f(x)})`).join(' ')
g.def('MateN', String(M.length)).def('MateSolved', String(M.filter((x) => x.s === 1).length))
g.def('CurveHead', pts((x) => x.headRating)).def('CurveView', pts((x) => x.viewRating))
g.def('ItemsSolved', M.map((x, i) => (x.s === 1 ? `(${i + 1},${x.difficulty})` : '')).filter(Boolean).join(' '))
g.def('ItemsMissed', M.map((x, i) => (x.s === 0 ? `(${i + 1},${x.difficulty})` : '')).filter(Boolean).join(' '))

// ---- one puzzle he solved: the one the headline gave the lowest chance ----
const bank = json(join(CHESS_DIR, 'src', 'data', 'puzzles.json'))
const byId = new Map(Object.values(bank).flat().map((p) => [p.id, p]))
const solved = P.filter((x) => x.s === 1 && x.item && byId.has(x.item)).sort((a, b) => a.head - b.head)
const ex = solved[0]
const puzzle = byId.get(ex.item)
claim(puzzle.rating === ex.difficulty, 'the example\'s rating is the bank\'s')
const [setup, ...solution] = puzzle.moves.split(' ')
const game = new Chess(puzzle.fen)
game.move({ from: setup.slice(0, 2), to: setup.slice(2, 4), promotion: setup[4] })
const fen = game.fen()
const sans = solution.map((u) => game.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san)
const [, side, , , , full] = fen.split(' ')
const moveTex = (san, i) => (i === 0 ? `${side === 'w' ? `${full}.~` : `${full}\\ldots{}`}${figurine(san)}` : figurine(san))
g.def('ExRating', String(ex.difficulty)).def('ExBucket', bucketName(ex.bucket)).def('ExHead', percent(ex.head, 0)).def('ExView', percent(ex.view, 0))
g.def('ExHeadRating', String(ex.headRating)).def('ExViewRating', String(ex.viewRating))
g.input('Example', 'example', [
  '\\noindent\\begin{minipage}[t]{0.37\\textwidth}\\vspace{0pt}',
  board(fen, { better: solution[0], size: '12pt' }),
  '\\end{minipage}\\hfill',
  '\\begin{minipage}[t]{0.6\\textwidth}\\vspace{0pt}\\small',
  `\\textbf{The puzzle:} ${bucketName(ex.bucket)}, rated ${ex.difficulty} on Lichess; ${side === 'w' ? 'White' : 'Black'} to move.\\par\\smallskip`,
  `\\textbf{The solution:} ${sans.map(moveTex).join(' ')} (green), \\uci{${solution.join(' ')}}.\\par\\smallskip`,
  `\\textbf{Before it:} the headline rated him ${ex.headRating} and gave ${percent(ex.head, 0)}\\%; the view rated him ${ex.viewRating} and gave ${percent(ex.view, 0)}\\%. He solved it.\\par\\smallskip`,
  `\\textbf{FEN:} \\fen{${fen}}`,
  '\\end{minipage}%',
].join('\n'))

// ---- round 2: the attempts the app recorded after round 1's last ----
const two = json(join(resultsDir(FLOW), 'round2.json'))
claim(two.round1 === rec.profile && two.cutoff.day === rec.lastAttempt, 'round 2 starts after the last attempt of the profile round 1 read')
claim(two.seed === r.seed && two.draws === r.draws, 'round 2 draws the days as round 1 did')
const T = two.rules
const TL = T.looks
const TA = T.attempts
const listOf = (xs) => `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`
g.def('TwoCommit', `\\texttt{${T.app.slice(0, 7)}}`).def('TwoSynced', esc(T.profileSyncedOn)).def('TwoCutoffClock', esc(two.cutoff.clock))
g.def('TwoAll', String(TA.attempts)).def('TwoAllDays', word(TA.days)).def('TwoFrom', esc(TA.dayRange[0])).def('TwoTo', esc(TA.dayRange[1]))
g.def('TwoLeftOut', word(TA.leftOut.notFirst)).def('TwoAttempts', String(TA.scored.attempts)).def('TwoDays', word(TA.scored.days)).def('TwoOpened', word(TA.attempts - TA.scored.attempts))
claim(TA.days >= 10, "round 2's attempts fall on at least ten days")
claim(TA.leftOut.otherChannel === 0 && TA.notInBank === 0, "every first exposure after round 1's last was served in a bucket's own set, on a puzzle the bank holds")
claim(TL.attempts === TA.scored.attempts && TL.days === TA.scored.days, 'the rules read the scored attempts')
g.def('TwoSolved', pp(TL.solved)).def('TwoMisses', String(TL.misses)).def('TwoHead', pp(TL.headline.meanChance))
g.def('TwoGap', pp(T.rule1.gap.value)).def('TwoGapLo', pp(T.rule1.gap.interval[0])).def('TwoGapHi', pp(T.rule1.gap.interval[1]))
claim(T.rule1.verdict === 'under-predicts', "by round 2's rule 1 the headline under-predicts")
claim(TL.misses > 5 * H.misses, 'round 2 holds several times the misses of the profile round 1 read')
claim(TL.solved < H.solved, 'he solved a smaller share of round 2\'s attempts than of the profile round 1 read')
const [halfOne, halfTwo] = T.rule2.halves
claim(T.rule2.passes === false, "by round 2's rule 2 the view does not pass")
claim(halfOne.value < 0 && halfOne.interval[1] < 0, 'the view passes on the first half')
claim(halfTwo.value < 0 && halfTwo.interval[1] > 0, "on the second half the view's log loss is lower and the interval reaches above zero")
T.rule2.halves.forEach((h, i) => {
  const n = ['One', 'Two'][i]
  g.def(`TwoH${n}Days`, word(h.days)).def(`TwoH${n}Attempts`, String(h.attempts)).def(`TwoH${n}View`, fixed(h.view, 3)).def(`TwoH${n}Head`, fixed(h.head, 3))
  g.def(`TwoH${n}Diff`, fixed(h.value, 3)).def(`TwoH${n}Lo`, fixed(h.interval[0], 3)).def(`TwoH${n}Hi`, fixed(h.interval[1], 3))
  g.def(`TwoH${n}List`, listOf(T.halfDays[i]))
})
claim(T.halfDays[1].length === halfTwo.days && Math.min(...T.halfDays[1]) === 1, "one of the second half's days holds a single attempt")
// Beside the verdicts.
g.def('TwoView', pp(TL.view.meanChance)).def('TwoViewGap', pp(TL.view.gap.value)).def('TwoViewGapLo', pp(TL.view.gap.interval[0])).def('TwoViewGapHi', pp(TL.view.gap.interval[1]))
claim(TL.view.gap.interval[0] > 0, 'the view still under-predicts in round 2')
const gapShare = TL.view.gap.value / T.rule1.gap.value
claim(gapShare > 0.15 && gapShare < 0.35, "the view's gap is about a quarter of the headline's")
g.def('TwoDiff', fixed(TL.candidate.value, 3)).def('TwoDiffLo', fixed(TL.candidate.interval[0], 3)).def('TwoDiffHi', fixed(TL.candidate.interval[1], 3))
claim(TL.candidate.interval[1] < 0, "over all of round 2's days the view's log loss is below the headline's, beyond the noise")
claim(TL.solved >= TARGET_P.core && TL.solved <= TARGET_P.new, 'he solved a share between the two targets the app aims at')
const TS = TL.scores
claim(TS.view.logLoss < TS.head.logLoss && TS.view.logLoss < TS.run.logLoss && TS.view.brier < TS.head.brier && TS.view.brier < TS.run.brier, 'the view scores best of the three estimates in round 2')
claim(TL.shift.head.interval[0] > TL.shift.view.interval[1] && TL.shift.view.interval[0] > 0, "the headline's chances need a larger shift than the view's, and the view's still need one")
const plainShift = (x) => `${x.shift} points (${x.interval[0]} to ${x.interval[1]})`
claim(![TL.shift.head, TL.shift.view].some((x) => x.interval.includes(x.edge[0]) || x.interval.includes(x.edge[1])), "round 2's best shifts sit inside the grid")
g.def('TwoShiftHead', plainShift(TL.shift.head)).def('TwoShiftView', plainShift(TL.shift.view))
g.block('TwoScoreTable', scoreTable(TL, 'headline rating'))
g.block('TwoReliabilityTable', reliabilityTable(TL))
// The reliability bins that hold at least ten attempts, under either estimate.
const bins = [...TL.reliability.head, ...TL.reliability.view].filter((b) => b.n >= 10)
const binSolved = bins.map((b) => b.solved)
const binChance = bins.map((b) => b.chance)
claim(Math.max(...binSolved) - Math.min(...binSolved) < 0.2 && Math.max(...binChance) - Math.min(...binChance) > 0.4, 'his share solved moves under twenty points over bins whose chances span more than forty')
const viewBand = TL.reliability.view.filter((b) => b.from >= 0.7 - 1e-9 && b.to <= 0.9 + 1e-9).reduce((n, b) => n + b.n, 0)
claim(viewBand > 0.6 * TL.attempts, "most of the view's chances in round 2 sit between 70% and 90%")
g.def('TwoBinLo', pp(Math.min(...binSolved))).def('TwoBinHi', pp(Math.max(...binSolved))).def('TwoBinChanceLo', pp(Math.min(...binChance))).def('TwoBinChanceHi', pp(Math.max(...binChance)))
g.block('TwoBucketTable', bucketTable(TL))
const viewNearer = TL.buckets.filter((b) => Math.abs(b.view - b.solved) < Math.abs(b.head - b.solved))
const headNearer = TL.buckets.filter((b) => !viewNearer.includes(b))
claim(viewNearer.length > 2 * headNearer.length && headNearer.length > 1, "the view's chance is the nearer to his share solved in most buckets, and not in all")
g.def('TwoBuckets', word(TL.buckets.length)).def('TwoViewNearer', word(viewNearer.length)).def('TwoHeadNearerList', listOf(headNearer.map((b) => bucketName(b.bucket))))
const sc2 = T.selfCheck
claim(sc2.meanPredicted < sc2.meanObserved && sc2.brier > sc2.baseline.brier && sc2.logLoss < sc2.baseline.logLoss, "on round 2's profile the self-check still under-predicts, beats its constant on log loss and not on Brier")
g.def('TwoSelfN', String(sc2.n)).def('TwoSelfPred', percent(sc2.meanPredicted, 1)).def('TwoSelfObs', percent(sc2.meanObserved, 1))
g.def('TwoSelfBrier', fixed(sc2.brier, 3)).def('TwoSelfBaseBrier', fixed(sc2.baseline.brier, 3)).def('TwoSelfLL', fixed(sc2.logLoss, 3)).def('TwoSelfBaseLL', fixed(sc2.baseline.logLoss, 3))
// Where each estimate would aim a set as round 2's profile stood.
const twoWithView = T.today.filter((t) => t.view)
const twoTotals = T.today.filter((t) => !t.view)
claim(twoWithView.every((t) => t.app.from === 'view' && t.app.target === t.view.target && t.view.target > t.head.target), "on round 2's profile the app aims every bucket that has a view from it, higher than the headline would")
claim(twoWithView.every((t) => t.view.target <= t.bankMax + 100), 'the bank can serve where the view aims in round 2')
claim(twoTotals.every((t) => t.app.from === 'totals'), 'a bucket without a view aims from its stored totals')
claim(new Set(T.today.map((t) => t.phase)).size === 1 && T.today[0].phase === 'core', "every bucket is served at the core target on round 2's profile")
const drops = twoWithView.map((t) => t.view.target - t.head.target).sort((a, b) => a - b)
const median = (xs) => (xs.length % 2 ? xs[(xs.length - 1) / 2] : Math.round((xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2))
g.def('TwoWithView', String(twoWithView.length)).def('TwoDropMin', String(drops[0])).def('TwoDropMax', String(drops.at(-1))).def('TwoDropMedian', String(median(drops)))
g.block('TwoTodayTable', todayTable(T.today))
// Rule 3 waits for its attempts: nothing by depth is read until it runs.
const third = two.rule3
claim(third.status === 'not enough data' && third.serving === 'head', 'rule 3 has not run, and will read the headline')
claim(third.counts.one.attempts < third.counts.needed && third.counts.two.attempts >= third.counts.needed, 'rule 3 waits for one-move attempts only')
g.def('TwoNeeded', String(third.counts.needed)).def('TwoOneScored', String(third.counts.one.attempts)).def('TwoTwoScored', String(third.counts.two.attempts)).def('TwoRuleThreeCommit', `\\texttt{${third.app.slice(0, 7)}}`)

g.write(join(HERE, 'generated.tex'))
console.log(`wrote ${join(HERE, 'generated.tex')}`)
