#!/usr/bin/env node
// Writes paper/generated.tex for the phone-against-routine paper from what
// compare.mjs wrote (results/compare.json: the shares, and the app's constants
// as it read them) and one position from the per-ply differences (private/).
// It refuses to write when a claim the paper makes no longer holds.
//
//   bridge/run.sh projects/phone-vs-routine/paper/generate.mjs

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { privateDir, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, board, fixed, line, movesTex, percent, word } from '../../paper.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const res = JSON.parse(readFileSync(join(resultsDir('phone-vs-routine'), 'compare.json'), 'utf8'))
const g = new Generated('projects/phone-vs-routine/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const ok = (x) => x != null && Number.isFinite(x)
const overlap = (a, b) => a.lo <= b.hi && b.lo <= a.hi
const count = (n) => n.toLocaleString('en-US')
const DEVICES = ['phone', 'desktop']
const NAME = { phone: 'Phone', desktop: 'Desktop' }

// The app's constants as compare.mjs read them, on the commit it ran on.
const { PASS2_SHARE, DESKTOP_KNPS, ACCEPT_WINDOW_WP, liveCoach, gameReview, analyst } = res.app
g.def('AppCommit', res.appCommit.slice(0, 10)).def('Engine', res.engine.split('/').slice(0, 2).join(' ').replace('@', ' '))
g.def('Cases', String(res.cases)).def('Line', percent(res.line, 0)).def('Draws', count(res.draws)).def('Seed', String(res.seed))
g.def('PassShare', percent(PASS2_SHARE, 0)).def('DesktopKnps', String(DESKTOP_KNPS)).def('AcceptWindow', String(ACCEPT_WINDOW_WP))
claim(Object.keys(res.skipped).length === 0, 'every game has all three documents')

// ---- the profiles ----
const B = res.budgets
for (const p of ['phone', 'desktop', 'routine']) claim(B[p] && B[p].verifyNodes === B.routine.verifyNodes, `${p}: the second look has the routine's budget`)
const nodes = (n) => (n >= 1e6 ? `${fixed(n / 1e6, n % 1e6 ? 1 : 0)} million` : count(n))
g.def('PhoneSweep', count(B.phone.sweepNodes)).def('DesktopSweep', count(B.desktop.sweepNodes)).def('RoutineSweep', nodes(B.routine.sweepNodes)).def('VerifyNodes', count(B.routine.verifyNodes))
claim(!B.phone.tablebase && !B.desktop.tablebase && B.routine.tablebase, 'only the routine reads the tablebase')

// ---- the rule ----
const R = res.results
const share = (r) => (ok(r.value) ? `${percent(r.value, 1)}\\% {\\footnotesize (${percent(r.lo, 1)}, ${percent(r.hi, 1)})}` : '--')
g.block(
  'VerdictTable',
  [
    '\\begin{tabular}{lrrrrlll}',
    '\\toprule',
    ' & \\multicolumn{2}{c}{serious errors} & & & & & \\\\',
    '\\cmidrule(lr){2-3}',
    'profile & routine & device & missed & extra & miss share & extra share & verdict \\\\',
    '\\midrule',
    ...DEVICES.map((p) => {
      const r = R[p]
      return `${NAME[p]} & ${count(r.serious.routine)} & ${count(r.serious.device)} & ${count(r.miss.num)} & ${count(r.extra.num)} & ${share(r.miss)} & ${share(r.extra)} & ${r.verdict} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
g.block(
  'OtherTable',
  [
    '\\begin{tabular}{llllll}',
    '\\toprule',
    ' & \\multicolumn{2}{c}{blunders} & \\multicolumn{2}{c}{inaccuracies} & any class \\\\',
    '\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}',
    'profile & missed & extra & missed & extra & differs \\\\',
    '\\midrule',
    ...DEVICES.map((p) => {
      const r = R[p]
      return `${NAME[p]} & ${share(r.blunders.miss)} & ${share(r.blunders.extra)} & ${share(r.inaccuracies.miss)} & ${share(r.inaccuracies.extra)} & ${share(r.differ)} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
g.block(
  'WhereTable',
  [
    '\\begin{tabular}{lrrrrrr}',
    '\\toprule',
    ' & \\multicolumn{3}{c}{missed} & \\multicolumn{3}{c}{extra} \\\\',
    '\\cmidrule(lr){2-4}\\cmidrule(lr){5-7}',
    'profile & second look & sweep only & routine: tablebase & second look & sweep only & routine: tablebase \\\\',
    '\\midrule',
    ...DEVICES.map((p) => {
      const w = R[p].where
      return `${NAME[p]} & ${w.missed.verified} & ${w.missed.sweep} & ${w.missed.routineTablebase} & ${w.extra.verified} & ${w.extra.sweep} & ${w.extra.routineTablebase} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
for (const p of DEVICES) {
  const r = R[p]
  const k = NAME[p]
  g.def(`${k}Verdict`, r.verdict).def(`${k}Games`, String(r.games)).def(`${k}Plies`, count(r.plies))
  g.def(`${k}RoutineSerious`, count(r.serious.routine)).def(`${k}DeviceSerious`, count(r.serious.device)).def(`${k}Both`, count(r.serious.both))
  g.def(`${k}Missed`, count(r.miss.num)).def(`${k}Extra`, count(r.extra.num))
  g.def(`${k}Miss`, percent(r.miss.value, 1)).def(`${k}MissLo`, percent(r.miss.lo, 1)).def(`${k}MissHi`, percent(r.miss.hi, 1))
  g.def(`${k}ExtraShare`, percent(r.extra.value, 1)).def(`${k}ExtraLo`, percent(r.extra.lo, 1)).def(`${k}ExtraHi`, percent(r.extra.hi, 1))
  g.def(`${k}Differ`, percent(r.differ.value, 1)).def(`${k}DifferLo`, percent(r.differ.lo, 1)).def(`${k}DifferHi`, percent(r.differ.hi, 1))
  g.def(`${k}InaccMiss`, percent(r.inaccuracies.miss.value, 0)).def(`${k}InaccExtra`, percent(r.inaccuracies.extra.value, 0))
  g.def(`${k}Looks`, count(r.looks.device)).def(`${k}Flags`, count(r.looks.deviceFlags)).def(`${k}Cut`, count(r.looks.deviceFlags - r.looks.device))
  g.def(`${k}Bias`, fixed(r.accuracy.bias, 1)).def(`${k}Mae`, fixed(r.accuracy.mae, 1)).def(`${k}Largest`, fixed(r.accuracy.largest, 1)).def(`${k}Sides`, String(r.accuracy.sides))
  const w = r.where
  g.def(`${k}MissedSweep`, word(w.missed.sweep)).def(`${k}MissedVerified`, word(w.missed.verified)).def(`${k}ExtraSweep`, word(w.extra.sweep)).def(`${k}ExtraVerified`, word(w.extra.verified))
  g.def(`${k}MissedTablebase`, word(w.missed.routineTablebase)).def(`${k}ExtraTablebase`, word(w.extra.routineTablebase))
}
g.def('RoutineLooks', count(R.phone.looks.routine))
claim(DEVICES.every((p) => R[p].verdict === 'differs'), 'by the rule, both devices differ from the routine')
claim(R.phone.miss.lo > res.line && R.desktop.extra.lo > res.line, "the phone's miss share and the desktop's extra share lie wholly above the line")
const looked = (p, kind) => R[p].where[kind].verified / (R[p].where[kind].verified + R[p].where[kind].sweep)
claim(DEVICES.every((p) => looked(p, 'missed') > 0.8 && R[p].where.extra.sweep === 0), 'the devices looked twice at nearly every move they missed and at every extra one')
claim(DEVICES.every((p) => R[p].where.missed.routineTablebase + R[p].where.extra.routineTablebase <= 1), 'the tablebase played almost no part')
claim(DEVICES.every((p) => overlap(R[p].blunders.miss, R[p].miss) && overlap(R[p].blunders.extra, R[p].extra)), 'blunders alone part about as often')
claim(DEVICES.every((p) => R[p].inaccuracies.miss.value > 0.25 && R[p].inaccuracies.miss.value < 0.4), 'about a third of the inaccuracies differ')
claim(DEVICES.every((p) => R[p].accuracy.bias < 0), "both devices read a side's accuracy a little lower")
for (const p of DEVICES) g.def(`${NAME[p]}BiasAbs`, fixed(-R[p].accuracy.bias, 1))
const oneIn = Math.round(1 / R.phone.miss.value)
claim(oneIn >= 9 && oneIn <= 13, 'the phone misses about one serious error in eleven')
g.def('PhoneOneIn', word(oneIn))

// ---- why the reviews part: added after the results were read ----
const X = res.posthoc
g.def('Near', String(X.near)).def('MistakeLine', String(X.mistakeLine))
const isFlip = (k) => k === 'mistake/inaccuracy' || k === 'inaccuracy/mistake'
g.block(
  'ReadingsTable',
  [
    '\\begin{tabular}{lrrrrrrrr}',
    '\\toprule',
    ' & \\multicolumn{4}{c}{moves both looked at twice} & \\multicolumn{4}{c}{serious errors they disagree on} \\\\',
    '\\cmidrule(lr){2-5}\\cmidrule(lr){6-9}',
    ` & & same & same & loss gap & & mistake & both within & an extra look \\\\`,
    `profile & moves & depth & numbers & median (90\\%) & moves & /inaccuracy & ${X.near} points & changed it \\\\`,
    '\\midrule',
    ...DEVICES.map((p) => {
      const x = X.readings[p]
      const flips = Object.entries(x.flips).filter(([k]) => isFlip(k)).reduce((s, [, v]) => s + v, 0)
      return `${NAME[p]} & ${count(x.bothLooked)} & ${count(x.sameDepth)} & ${count(x.identical)} & ${fixed(x.lossGap.median, 2)} (${fixed(x.lossGap.p90, 1)}) & ${x.serious} & ${flips} & ${x.near} & ${x.unsettled} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
for (const p of DEVICES) {
  const x = X.readings[p]
  const k = NAME[p]
  const flips = Object.entries(x.flips).filter(([f]) => isFlip(f)).reduce((s, [, v]) => s + v, 0)
  claim(x.serious === R[p].miss.num + R[p].extra.num, `${p}: the descriptions count the same disagreements as the rule`)
  claim(x.identical / x.bothLooked < 0.05 && x.sameDepth / x.bothLooked < 0.35, `${p}: the two second looks rarely give the same numbers or reach the same depth`)
  claim(flips / x.serious > 0.85, `${p}: nearly every disagreement is a mistake on one side and an inaccuracy on the other`)
  claim(x.near / x.serious > 0.65, `${p}: most have both losses near the mistake line`)
  claim(x.unsettled / x.serious > 0.4, `${p}: on nearly half, a profile's own extra look changed its verdict`)
  g.def(`${k}BothLooked`, count(x.bothLooked)).def(`${k}SameDepth`, count(x.sameDepth)).def(`${k}Identical`, word(x.identical))
  g.def(`${k}GapMedian`, fixed(x.lossGap.median, 1)).def(`${k}GapNinety`, fixed(x.lossGap.p90, 1))
  g.def(`${k}Disagree`, String(x.serious)).def(`${k}Flips`, String(flips)).def(`${k}FlipShare`, percent(flips / x.serious, 0))
  g.def(`${k}Near`, String(x.near)).def(`${k}Unsettled`, String(x.unsettled))
}
const PD = X.phoneAgainstDesktop
claim(PD.miss.lo > res.line && overlap(PD.miss, R.phone.miss) && overlap(PD.extra, R.phone.extra), 'the phone and the desktop disagree with each other as much as with the routine')
g.def('PvDMiss', percent(PD.miss.value, 1)).def('PvDMissLo', percent(PD.miss.lo, 1)).def('PvDMissHi', percent(PD.miss.hi, 1))
g.def('PvDExtra', percent(PD.extra.value, 1)).def('PvDExtraLo', percent(PD.extra.lo, 1)).def('PvDExtraHi', percent(PD.extra.hi, 1))

// ---- the live coach's accept window: a fact about the code ----
claim(liveCoach.typedLine != null && !liveCoach.importsAcceptWindow, "the live coach types its own window instead of importing the review's")
claim(ACCEPT_WINDOW_WP === 3, "the review's accept window is the 3 the live coach types")
g.def('VerdictLine', String(liveCoach.typedLine)).def('VerdictFile', `\\texttt{${liveCoach.file}}`)

// ---- which review Game Review opens, and the device's analyst: facts about the code ----
claim(gameReview.coachOnlyWhenNoneKept, "Game Review asks for the coach's review only when it has kept none")
g.def('GameReviewFile', `\\texttt{${gameReview.file}}`).def('KeptLine', String(gameReview.keptLine)).def('CoachLine', String(gameReview.coachLine))
claim(analyst.deviceHash < analyst.nodeHash && analyst.deviceCache.kept, "the device's engine has a smaller hash than the routine's, and an evaluation cache")
g.def('DeviceHash', String(analyst.deviceHash)).def('NodeHash', String(analyst.nodeHash)).def('DeviceEngineFile', `\\texttt{${analyst.deviceCache.file}}`)

// ---- one position: the phone's costliest missed serious error ----
const diffPath = join(privateDir('phone-vs-routine'), 'differences.json')
claim(existsSync(diffPath), 'the per-ply differences are here (compare.mjs writes them under private/)')
const diffs = JSON.parse(readFileSync(diffPath, 'utf8'))
const missed = diffs.filter((d) => d.device === 'phone' && d.kind === 'missed').sort((a, b) => b.routine.lossPct - a.routine.lossPct)
claim(missed.length > 0, 'the phone missed at least one serious error the routine names')
const d = missed[0]
const docOf = (profile) => JSON.parse(readFileSync(join(privateDir('accuracy-vs-chesscom'), 'evidence', profile, `${d.game}.json`), 'utf8'))
const routine = docOf('routine')
const phone = docOf('phone')
const rr = routine.records.find((r) => r.ply === d.ply)
const pr = phone.records.find((r) => r.ply === d.ply)
const fen = routine.fens[d.ply - 1]
claim(fen && rr.uci === pr.uci, 'the example is the same move in both documents')
const bestLine = line(fen, rr.bestPv.slice(0, 4))
g.block('ExampleBoard', board(fen, { played: rr.uci, better: rr.bestUci, size: '13pt' }))
g.def('ExampleFen', `\\fen{${fen}}`).def('ExampleMove', movesTex(fen, [rr.san])).def('ExampleUci', `\\uci{${rr.uci}}`)
g.def('ExampleBest', movesTex(fen, bestLine.sans)).def('ExampleBestUci', `\\uci{${bestLine.ucis.join(' ')}}`)
g.def('ExampleRoutineCls', rr.cls).def('ExamplePhoneCls', pr.cls).def('ExampleRoutineLoss', fixed(rr.lossPct, 1)).def('ExamplePhoneLoss', fixed(pr.lossPct, 1))
g.def('ExampleSide', rr.mover === 'w' ? 'White' : 'Black')
claim(rr.evidence === 'verified' && pr.evidence === 'verified', 'both reviews looked at the example twice')
// The two second looks of the example: the same best move at the same depth,
// and the move played read two ways, inside the candidates or on its own.
const rd = routine.positions[d.ply - 1].deep
const pd = phone.positions[d.ply - 1].deep
claim(rr.bestUci === pr.bestUci && rd.depth === pd.depth, 'the two second looks of the example agree on the best move and the depth')
claim(pd.playedFrom === 'multipv' && rd.playedFrom === 'searchmoves', "the phone's look kept the move among its candidates and the routine's searched it on its own")
claim(rd.played.mate === null && pd.played.mate === null && Math.abs(rd.played.cp - pd.played.cp) >= 100, 'the two readings of the move played are a pawn or more apart')
const pawns = (cp) => `${cp > 0 ? '$+$' : ''}${fixed(cp / 100, 2)}`
g.def('ExampleDepth', String(rd.depth)).def('ExampleBestMove', movesTex(fen, line(fen, [rr.bestUci]).sans))
g.def('ExamplePhonePlayed', pawns(pd.played.cp)).def('ExampleRoutinePlayed', pawns(rd.played.cp))
g.def('ExampleCandidates', word(pd.lines.length))

g.write(join(HERE, 'generated.tex'))
console.error('wrote projects/phone-vs-routine/paper/generated.tex')
