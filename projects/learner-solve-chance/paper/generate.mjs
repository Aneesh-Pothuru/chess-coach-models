#!/usr/bin/env node
// Writes paper/generated.tex for the solve-chance paper: round 1's verdicts
// and why they do not stand (results/solve.json, from fit.mjs), the looks on
// the profile as the app holds it, the learner's constants as the app states
// them, the mate-in-one ratings over his attempts, and one puzzle he solved.
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
const label = { head: 'headline rating (serving reads it)', view: 'view of the themed sets', run: 'running rate' }
const chanceOf = { head: H.headline.meanChance, view: H.view.meanChance, run: H.run.meanChance }
g.block('ScoreTable', [
  '\\begin{tabular}{lrrr}',
  '\\toprule',
  'estimate & mean chance & Brier & log loss \\\\',
  '\\midrule',
  ...['head', 'view', 'run'].map((k) => `${label[k]} & ${pp(chanceOf[k])}\\% & ${fixed(S[k].brier, 3)} & ${fixed(S[k].logLoss, 3)} \\\\`),
  '\\midrule',
  `share solved & ${pp(H.solved)}\\% & & \\\\`,
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
const cell = (b) => (b.n ? `${b.n} & ${pp(b.chance)}\\% & ${pp(b.solved)}\\%` : `0 & -- & --`)
g.block('ReliabilityTable', [
  '\\begin{tabular}{lrrrrrr}',
  '\\toprule',
  '& \\multicolumn{3}{c}{headline rating} & \\multicolumn{3}{c}{view} \\\\',
  '\\cmidrule(lr){2-4}\\cmidrule(lr){5-7}',
  'solve chance & attempts & mean chance & solved & attempts & mean chance & solved \\\\',
  '\\midrule',
  ...H.reliability.head.map((b, i) => `${fixed(b.from, 1)} to ${fixed(b.to, 1)} & ${cell(b)} & ${cell(H.reliability.view[i])} \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
const bucketName = (b) => ({ mateIn1: 'mate in one', mateIn2: 'mate in two', mateIn3: 'mate in three', hangingPiece: 'hanging piece', fork: 'fork', planning: 'planning', defensiveMove: 'defensive move', pawnEndgame: 'pawn endgame', discoveredAttack: 'discovered attack', attackingF2F7: 'f2 and f7', 'op:london': 'London System' })[b] ?? esc(b)
g.block('BucketTable', [
  '\\begin{tabular}{lrrrrr}',
  '\\toprule',
  'bucket & attempts & mean rating & solved & headline\'s chance & view\'s chance \\\\',
  '\\midrule',
  ...H.buckets.map((b) => `${bucketName(b.bucket)} & ${b.n} & ${Math.round(b.difficulty)} & ${pp(b.solved)}\\% & ${pp(b.head)}\\% & ${pp(b.view)}\\% \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))

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
g.def('LastDay', esc(rec.lastAttempt)).def('SyncedOn', esc(rec.syncedOn))
g.def('UpMin', String(Math.min(...ups))).def('UpMax', String(Math.max(...ups))).def('WithView', word(withView.length)).def('WithoutView', word(totalsOnly.length))
g.def('TotUpMin', String(Math.min(...totUps))).def('TotUpMax', String(Math.max(...totUps)))
const phases = new Set(r.today.map((t) => t.phase))
claim(phases.size === 1 && phases.has('core'), 'every bucket is served at the core target today')
g.block('TodayTable', [
  '\\begin{tabular}{lrrrrrrr}',
  '\\toprule',
  '& \\multicolumn{2}{c}{headline} & \\multicolumn{2}{c}{themed view} & \\multicolumn{2}{c}{stored totals} & \\\\',
  '\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}\\cmidrule(lr){6-7}',
  'bucket & rating & aims at & rating & aims at & rating & aims at & hardest in the bank \\\\',
  '\\midrule',
  ...r.today.map((t) => `${bucketName(t.bucket)} & ${t.head.rating} $\\pm$ ${t.head.rd} & ${t.head.target} & ${t.view ? `${t.view.rating} $\\pm$ ${t.view.rd}` : 'none'} & ${t.view ? t.view.target : '--'} & ${t.app.from === 'totals' ? `${t.app.rating} $\\pm$ ${t.app.rd}` : '--'} & ${t.app.from === 'totals' ? t.app.target : '--'} & ${t.bankMax} \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))

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

g.write(join(HERE, 'generated.tex'))
console.log(`wrote ${join(HERE, 'generated.tex')}`)
