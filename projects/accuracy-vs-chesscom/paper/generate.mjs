#!/usr/bin/env node
// Writes paper/generated.tex for the accuracy paper: the hill-climb's numbers
// recomputed from the records' per-game rows (summarize.mjs), the
// reproduction (results/reproduction.json), each instrument's per-move curve
// from its own code, and one game from the evidence the lab rebuilt.
//
//   bridge/run.sh projects/accuracy-vs-chesscom/paper/generate.mjs
//
// It reads private/accuracy-vs-chesscom (the cases, gold and evidence that
// build-cases.mjs and build-evidence.mjs wrote, and the per-game rows
// reproduce.mjs wrote). What it writes names no game.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Chess } from 'chess.js'
import { LAB_DIR, chess, hillclimbDir, privateDir, records, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, board, esc, figurine, fixed, movesTex } from '../../paper.mjs'
import { summarize } from '../summarize.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FLOW = 'accuracy-vs-chesscom'
const ACCURACY = 'src/services/review/accuracy.ts'
const recorded = join(records(), '.claude', 'hillclimb', FLOW)
const home = privateDir(FLOW)
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const jsonl = (path) => new Map(readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)).map((r) => [String(r.prompt_id), r]))

const g = new Generated('projects/accuracy-vs-chesscom/paper/generate.mjs')
const state = json(join(recorded, '_state.json'))
const testIds = state.test_ids.map(String)
const trainIds = state.train_ids.map(String)
const cases = json(join(home, 'cases.json'))
const devPool = json(join(home, 'dev-pool.json'))
const gold = json(join(home, 'gold.json'))
g.def('Games', String(cases.length)).def('GamesTrain', String(trainIds.length)).def('GamesTest', String(testIds.length))
g.def('Eligible', String(Object.keys(gold).length)).def('DevPool', String(devPool.length))
g.def('RejectedSplits', String(state.rejected_splits.length))
const ratings = cases.map((c) => c.myRating)
g.def('PlayerRatingMin', String(Math.min(...ratings))).def('PlayerRatingMax', String(Math.max(...ratings)))

// The sample's length buckets and the within-N column, as the project's scripts define them.
const script = (name) => readFileSync(join(LAB_DIR, 'projects', FLOW, name), 'utf8')
const buckets = /plies <= (\d+) \? 'short' : plies <= (\d+) \? 'medium' : 'long'/.exec(script('build-cases.mjs'))
if (!buckets) throw new Error('build-cases.mjs no longer buckets games by length as the paper says')
g.def('ShortMax', buckets[1]).def('MediumMin', String(Number(buckets[1]) + 1)).def('MediumMax', buckets[2])
const within = /within5: .*Math\.abs\(o - c\) <= (\d+)\)/.exec(script('summarize.mjs'))
if (!within) throw new Error('summarize.mjs no longer counts the sides within a fixed gap')
g.def('WithinPoints', within[1])

// The two evidence profiles' budgets, as every frozen document records them.
const budgets = {}
for (const profile of ['routine', 'phone']) {
  const seen = new Set(cases.map((c) => {
    const { scanNodes, verifyNodes, verifyMultiPv } = json(join(home, 'evidence', profile, `${c.id}.json`)).provenance
    return JSON.stringify({ scanNodes, verifyNodes, verifyMultiPv })
  }))
  if (seen.size !== 1) throw new Error(`the ${profile} evidence was not all built at one budget`)
  budgets[profile] = JSON.parse([...seen][0])
}
const thousands = (n) => n.toLocaleString('en-US')
g.def('RoutineScan', thousands(budgets.routine.scanNodes)).def('PhoneScan', thousands(budgets.phone.scanNodes))
g.def('VerifyNodes', thousands(budgets.routine.verifyNodes)).def('VerifyLines', String(budgets.routine.verifyMultiPv))
if (budgets.phone.verifyNodes !== budgets.routine.verifyNodes) throw new Error('the profiles verify at different budgets')
const { PASS2_SHARE } = await chess('src/services/review/index.ts')
g.def('PhoneShare', fixed(100 * PASS2_SHARE, 0))

// ---- the aggregates, recomputed from the records' rows ----
const sum = summarize({ flow: recorded, records: recorded })
const row = (profile, variant) => sum.rows.find((r) => r.profile === profile && r.variant === variant)
const ci = (s, d = 1) => `${fixed(s.point, d)} [${fixed(s.lo, d)}, ${fixed(s.hi, d)}]`
const signed = (s, d = 1) => `${s.point >= 0 ? '$+$' : ''}${fixed(s.point, d)} [${fixed(s.lo, d)}, ${fixed(s.hi, d)}]`
const NAME = { baseline: 'Base', v1: 'One', v2: 'Two' }
for (const [profile, P] of [['routine', ''], ['phone', 'Phone']]) {
  for (const v of ['baseline', 'v1', 'v2']) {
    const r = row(profile, v)
    const n = `${P}${NAME[v]}`
    g.def(`${n}TestMae`, fixed(r.testMae.point)).def(`${n}TestMaeCI`, ci(r.testMae))
    g.def(`${n}TrainMae`, fixed(r.trainMae.point)).def(`${n}TestWithin`, fixed(r.testWithin5.point, 0))
    g.def(`${n}TestBias`, fixed(r.testBias.point)).def(`${n}TestR`, fixed(r.testR.point, 2)).def(`${n}TestRCI`, ci(r.testR, 2))
    if (r.testMaeVsBaseline) g.def(`${n}VsBase`, signed(r.testMaeVsBaseline))
  }
}
const aggregateRows = (profile) => ['baseline', 'v1', 'v2'].map((v) => {
  const r = row(profile, v)
  const label = { baseline: 'baseline (Lichess)', v1: 'round 1', v2: 'the app (v2)' }[v]
  return `${label} & ${ci(r.testMae)} & ${fixed(r.trainMae.point)} & ${fixed(r.testWithin5.point, 0)}\\% & ${signed(r.testBias)} & ${ci(r.testR, 2)} & ${r.testMaeVsBaseline ? signed(r.testMaeVsBaseline) : '--'} \\\\`
})
g.block('AggregateTable', [
  '\\begin{tabular}{lllllll}',
  '\\toprule',
  `instrument & test MAE & train MAE & within ${within[1]} & bias & $r$ & vs baseline \\\\`,
  '\\midrule',
  '\\multicolumn{7}{l}{\\emph{routine evidence (the headline)}} \\\\',
  ...aggregateRows('routine'),
  '\\midrule',
  '\\multicolumn{7}{l}{\\emph{phone evidence (the guardrail)}} \\\\',
  ...aggregateRows('phone'),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))

// The same aggregates as the records published them, to the character.
const published = readFileSync(join(recorded, 'metrics.md'), 'utf8')
const block = published.slice(published.indexOf('<!-- aggregates:start -->') + 25, published.indexOf('<!-- aggregates:end -->')).trim()
if (block !== sum.markdown.trim()) throw new Error("the recomputed aggregates differ from the records' metrics.md")
g.def('ReproAggregates', 'match the published ones to the character')

// What the hill-climb tried and did not run as rounds, as its state records it.
g.block('NotRun', [
  '\\begin{itemize}[nosep]',
  ...state.stopped.theses_not_run.map((t) => `\\item ${esc(t.change)}: ${esc(t.result)}.`),
  '\\end{itemize}',
].join('\n'))
g.def('StopRule', esc(state.stopped.why))

// ---- per side, from the records' rows ----
const variants = Object.fromEntries(['baseline', 'v1', 'v2'].map((v) => [v, jsonl(join(recorded, v, 'results.jsonl'))]))
const sides = (v, ids) => ids.flatMap((id) => {
  const r = variants[v].get(id)
  return ['white', 'black'].map((s) => ({ id, ours: r.grade[`ours_${s}`], cc: r.grade[`cc_${s}`], bucket: r.tags[0] }))
}).filter((s) => Number.isFinite(s.ours) && Number.isFinite(s.cc))
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

// A constant guess: the train sides' mean chess.com accuracy, for every side.
const constant = mean(sides('baseline', trainIds).map((s) => s.cc))
g.def('ConstantGuess', fixed(constant))
g.def('ConstantTestMae', fixed(mean(sides('baseline', testIds).map((s) => Math.abs(constant - s.cc)))))
g.def('ConstantTrainMae', fixed(mean(sides('baseline', trainIds).map((s) => Math.abs(constant - s.cc)))))

// The length tilt: the signed error by length bucket, over all the games.
const all = [...trainIds, ...testIds]
const tilt = (v, bucket) => sides(v, all).filter((s) => s.bucket === bucket)
const BUCKETS = [['short', `short (${buckets[1]} plies or fewer)`], ['medium', `medium (${Number(buckets[1]) + 1} to ${buckets[2]})`], ['long', `long (over ${buckets[2]})`]]
g.block('TiltTable', [
  '\\begin{tabular}{lrrrr}',
  '\\toprule',
  'length & sides & baseline & round 1 & the app (v2) \\\\',
  '\\midrule',
  ...BUCKETS.map(([b, label]) => `${label} & ${tilt('baseline', b).length} & ${['baseline', 'v1', 'v2'].map((v) => { const x = mean(tilt(v, b).map((s) => s.ours - s.cc)); return `${x >= 0 ? '$+$' : ''}${fixed(x)}` }).join(' & ')} \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
for (const [b] of BUCKETS) {
  for (const v of ['baseline', 'v2']) g.def(`Tilt${NAME[v]}${b[0].toUpperCase()}${b.slice(1)}`, fixed(Math.abs(mean(tilt(v, b).map((s) => s.ours - s.cc)))))
}

// The scatter: every held-out side, ours against chess.com's.
const coords = (v) => sides(v, testIds).map((s) => `(${s.cc.toFixed(2)},${s.ours.toFixed(2)})`).join(' ')
g.def('ScatterBase', coords('baseline')).def('ScatterTwo', coords('v2')).def('ScatterSides', String(sides('v2', testIds).length))

// ---- the per-move curves, from each instrument's own code ----
// The baseline's file is not importable from the lab (its imports are the
// app's), so it is read through a candidate of the pinned app that carries it.
const candidate = execFileSync(join(LAB_DIR, 'bridge', 'candidate.sh'), ['accuracy-paper-baseline', `${ACCURACY}=${join(hillclimbDir(FLOW), 'v1', 'accuracy.before.ts')}`], { encoding: 'utf8' }).trim()
const base = await import(pathToFileURL(join(candidate, ACCURACY)).href)
const app = await chess(ACCURACY)
const decayOf = (file) => {
  const m = /Math\.exp\(-([\d.]+) \* lossPct\)/.exec(readFileSync(file, 'utf8'))
  if (!m) throw new Error(`no decay in ${file}`)
  return Number(m[1])
}
const baseDecay = decayOf(join(hillclimbDir(FLOW), 'v1', 'accuracy.before.ts'))
g.def('BaseDecay', baseDecay.toFixed(4)).def('AppDecay', String(app.MOVE_DECAY))
// The curve's other two constants, which both instruments share: s = a e^{-d x} - c + 1.
const shape = /const a = ([\d.]+) \* Math\.exp\(-[\d.]+ \* lossPct\) - ([\d.]+) \+ 1/.exec(readFileSync(join(hillclimbDir(FLOW), 'v1', 'accuracy.before.ts'), 'utf8'))
if (!shape) throw new Error("no curve constants in the baseline's accuracy.before.ts")
const [A, C] = [Number(shape[1]), Number(shape[2])]
for (const x of [0, 1, 2.5, 5, 10, 20, 40]) {
  const clamp = (v) => Math.max(0, Math.min(100, v))
  if (Math.abs(clamp(A * Math.exp(-baseDecay * x) - C + 1) - base.moveAccuracy(x)) > 1e-9) throw new Error('the baseline curve is not its formula')
  if (Math.abs(clamp(A * Math.exp(-app.MOVE_DECAY * x) - C + 1) - app.moveAccuracy(x)) > 1e-9) throw new Error("the app's curve is not the formula with its decay")
}
g.def('CurveA', A.toFixed(4)).def('CurveC', C.toFixed(4))
// The baseline's volatility windows and weights, as its code bounds them.
const baseText = readFileSync(join(hillclimbDir(FLOW), 'v1', 'accuracy.before.ts'), 'utf8')
const win = /Math\.max\((\d+), Math\.min\((\d+), Math\.floor\(gradedMoves \/ (\d+)\)\)\)/.exec(baseText)
const wt = /Math\.max\(([\d.]+), Math\.min\(([\d.]+), stdev\(w\)\)\)/.exec(baseText)
if (!win || !wt) throw new Error("no window or weight bounds in the baseline's accuracy.before.ts")
g.def('WindowMin', win[1]).def('WindowMax', win[2]).def('WindowShare', win[3]).def('WeightMin', wt[1]).def('WeightMax', wt[2])
const curve = (fn) => Array.from({ length: 81 }, (_, i) => i / 2).map((x) => `(${x},${fn(x).toFixed(3)})`).join(' ')
g.def('CurveBase', curve(base.moveAccuracy)).def('CurveApp', curve(app.moveAccuracy))
for (const loss of [2, 5, 10]) {
  g.def(`BaseAt${['Two', 'Five', 'Ten'][[2, 5, 10].indexOf(loss)]}`, fixed(base.moveAccuracy(loss), 0))
  g.def(`AppAt${['Two', 'Five', 'Ten'][[2, 5, 10].indexOf(loss)]}`, fixed(app.moveAccuracy(loss), 0))
}

// ---- the round's own notes, as recorded ----
const change = readFileSync(join(hillclimbDir(FLOW), 'v1', 'change.md'), 'utf8').replace(/\s+/g, ' ')
const dev = /Dev pool \((\d+) games outside the eval, archived evidence\): MAE (\d+\.\d+) to (\d+\.\d+), paired 95% CI of the change \[(-?\d+\.\d+), (-?\d+\.\d+)\]; r (\d+\.\d+) to (\d+\.\d+)/.exec(change)
const decays = /Decay (\d+\.\d+) to (\d+\.\d+) all land within (\d+\.\d+) points/.exec(change)
if (!dev || !decays) throw new Error("the round's change.md no longer states its dev-pool numbers")
g.def('DevMaeBefore', dev[2]).def('DevMaeAfter', dev[3]).def('DevCI', `[${fixed(Number(dev[4]), 2)}, ${fixed(Number(dev[5]), 2)}]`)
g.def('DevRBefore', dev[6]).def('DevRAfter', dev[7])
g.def('DecayLow', decays[1]).def('DecayHigh', decays[2]).def('DecaySpread', decays[3])
if (Number(dev[1]) !== devPool.length) throw new Error(`the note's dev pool (${dev[1]}) is not dev-pool.json's (${devPool.length})`)

// ---- one game: the held-out side the round helped most, on rebuilt evidence ----
const rerun = Object.fromEntries(['baseline', 'v2'].map((v) => [v, jsonl(join(home, 'reproduce', v, 'results.jsonl'))]))
let pick = null
for (const id of testIds) {
  for (const side of ['white', 'black']) {
    const b = rerun.baseline.get(id).grade, t = rerun.v2.get(id).grade
    const gain = Math.abs(b[`ours_${side}`] - b[`cc_${side}`]) - Math.abs(t[`ours_${side}`] - t[`cc_${side}`])
    if (!pick || gain > pick.gain) pick = { id, side, gain, base: b[`ours_${side}`], app: t[`ours_${side}`], cc: b[`cc_${side}`] }
  }
}
const doc = json(join(home, 'evidence', 'routine', `${pick.id}.json`))
const color = pick.side === 'white' ? 'w' : 'b'
const mine = doc.records.map((r, i) => ({ r, i })).filter(({ r }) => r.mover === color)
const gradedBase = mine.filter(({ r }) => base.graded(r))
const accs = gradedBase.map(({ r }) => base.moveAccuracy(r.lossPct))
const weights = base.volatilityWeights(base.winSequence(doc.records, doc.rootWin), base.accuracyWindowSize(gradedBase.length))
const w = gradedBase.map(({ i }) => weights[i] ?? 0.5)
const weighted = accs.reduce((s, a, k) => s + a * w[k], 0) / w.reduce((s, x) => s + x, 0)
const harmonic = accs.length / accs.reduce((s, a) => s + 1 / a, 0)
const baseAcc = base.gameAccuracy(accs.map((acc, k) => ({ acc, weight: w[k] })))
const appAcc = app.summarizeSide(doc.records, color, doc.division).accuracy
if (Math.abs((weighted + harmonic) / 2 - baseAcc) > 1e-9) throw new Error('the baseline is not the mean of its two halves')
if (Math.abs(baseAcc - pick.base) > 1e-6 || Math.abs(appAcc - pick.app) > 1e-6) throw new Error('the example does not recompute to the reproduction')
const worst = gradedBase.reduce((a, b) => (b.r.lossPct > a.r.lossPct ? b : a))
const fen = doc.fens[worst.i]
const sans = doc.records.map((r) => r.san)
const startFen = doc.fens[0]
const sideName = color === 'w' ? 'White' : 'Black'
const numbered = (mover, n, san) => (mover === 'w' ? `${n}.~` : `${n}\\ldots{}`) + figurine(san)
const moveLabel = (r) => numbered(r.mover, r.moveNumber, r.san)
const bestSan = new Chess(fen).move({ from: worst.r.bestUci.slice(0, 2), to: worst.r.bestUci.slice(2, 4), promotion: worst.r.bestUci[4] }).san
const after = doc.records[worst.i + 1]
g.def('ExamplePlies', String(doc.records.length)).def('ExampleSide', sideName)
g.def('ExampleGraded', String(gradedBase.length)).def('ExampleWorst', moveLabel(worst.r)).def('ExampleWorstLoss', fixed(worst.r.lossPct))
g.def('ExampleWorstBase', fixed(base.moveAccuracy(worst.r.lossPct))).def('ExampleWorstApp', fixed(app.moveAccuracy(worst.r.lossPct)))
g.def('ExampleWeighted', fixed(weighted)).def('ExampleHarmonic', fixed(harmonic)).def('ExampleBase', fixed(baseAcc))
g.def('ExampleApp', fixed(appAcc)).def('ExampleChessCom', fixed(pick.cc, 1))
g.def('ExampleAfter', after ? moveLabel(after) : '--')
g.input('ExampleGame', 'example-game', [
  '\\begin{minipage}[t]{0.4\\textwidth}\\vspace{0pt}',
  board(fen, { played: worst.r.uci, better: worst.r.bestUci, size: '13pt' }),
  '\\end{minipage}\\hfill',
  '\\begin{minipage}[t]{0.56\\textwidth}\\vspace{0pt}\\small',
  `\\textbf{The game:} ${movesTex(startFen, sans)}\\par`,
  `\\textbf{Played:} ${moveLabel(worst.r)} (red); the engine's best was ${numbered(worst.r.mover, worst.r.moveNumber, bestSan)} (green).\\par`,
  `\\textbf{UCI:} \\uci{${worst.r.uci}}; best \\uci{${worst.r.bestUci}}\\par`,
  `\\textbf{FEN:} \\fen{${fen}}`,
  '\\end{minipage}',
  '',
  '\\smallskip\\small',
  '\\begin{tabular}{lrrr}',
  '\\toprule',
  `${sideName}'s graded move & win\\% lost & Lichess curve & steep curve \\\\`,
  '\\midrule',
  ...gradedBase.map(({ r }) => `${moveLabel(r)} & ${fixed(r.lossPct)} & ${fixed(base.moveAccuracy(r.lossPct))} & ${fixed(app.moveAccuracy(r.lossPct))} \\\\`),
  '\\midrule',
  `\\multicolumn{2}{l}{the side's accuracy} & ${fixed(baseAcc)} & ${fixed(appAcc)} \\\\`,
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
// ---- the reproduction ----
const repro = json(join(resultsDir(FLOW), 'reproduction.json'))
const cell = (a, b, d = 1) => `${fixed(a, d)} & ${fixed(b, d)}`
g.block('ReproTable', [
  '\\begin{tabular}{llrrrrrr}',
  '\\toprule',
  ' & & \\multicolumn{2}{c}{test MAE} & \\multicolumn{2}{c}{train MAE} & \\multicolumn{2}{c}{test $r$} \\\\',
  '\\cmidrule(lr){3-4}\\cmidrule(lr){5-6}\\cmidrule(lr){7-8}',
  'evidence & instrument & recorded & rerun & recorded & rerun & recorded & rerun \\\\',
  '\\midrule',
  ...repro.rows.map((r) => `${r.profile} & ${{ baseline: 'baseline', v1: 'round 1', v2: 'the app (v2)' }[r.variant]} & ${cell(r.recorded.testMae, r.reproduced.testMae)} & ${cell(r.recorded.trainMae, r.reproduced.trainMae)} & ${cell(r.recorded.testR, r.reproduced.testR, 2)} \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
g.def('ReproLargest', fixed(repro.largest_test_mae_change, 2))
g.def('AppCommit', `\\texttt{${repro.chess.pinned_commit.slice(0, 7)}}`).def('RecordsCommit', `\\texttt{${repro.chess.records_commit.slice(0, 7)}}`)
const rr = repro.reread
g.def('RereadRecordedMae', fixed(rr.recorded.mae, 2)).def('RereadRecordedPNinety', fixed(rr.recorded.p90, 2)).def('RereadRecordedSides', String(rr.recorded.sides))
g.def('RereadMae', fixed(rr.rerun.mae, 2)).def('RereadPNinety', fixed(rr.rerun.p90, 2)).def('RereadSides', String(rr.rerun.sides)).def('RereadMax', fixed(rr.rerun.max, 1))
g.def('RereadRuleMae', String(rr.rule.mae)).def('RereadRuleP', String(rr.rule.p90)).def('RereadHolds', rr.rerun.holds ? 'holds' : 'fails')
g.def('RereadLaterRows', String(Object.values(rr.rerun.leftOut).reduce((a, b) => a + b, 0)))
g.def('RereadUntaggedSides', String(rr.rerun.untaggedSides)).def('RereadUntaggedMae', fixed(rr.rerun.untaggedMae, 2))
g.def('RereadTaggedSides', String(rr.rerun.taggedSides)).def('RereadTaggedMae', fixed(rr.rerun.taggedMae, 2))

g.write(join(HERE, 'generated.tex'))
console.log(`wrote ${join(HERE, 'generated.tex')}`)
