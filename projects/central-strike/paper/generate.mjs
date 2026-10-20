#!/usr/bin/env node
// Writes paper/generated.tex for the central strike: the rule's verdict and
// the descriptions (results/central-strike.json), the design from the study's
// and the app's constants, and two positions from the private rows, rescored.
// It refuses to write when a claim the paper makes no longer holds.
//
//   bridge/run.sh projects/central-strike/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, esc, fixed, movesTex, percent } from '../../paper.mjs'
import { BUDGET, MONTH, SOURCE as STRONG_SOURCE, WIN_HIGH, WIN_LOW } from '../../structure-breaks/lib.mjs'
import {
  DRAWS,
  MIN_GAMES,
  PROJECT,
  SEED,
  SOURCE,
  argOf,
  centralBreaks,
  gitCommit,
  kingSquare,
  otherKingInCentre,
  readJsonl,
  soundOf,
} from '../lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const E = await chess('src/services/engine/index.ts')
const N = await chess('src/adapters/node/engine/index.ts')
const C = await chess('src/core/chess/index.ts')
const Sc = await chess('src/core/score/index.ts')
const St = await chess('src/services/knowledge/catalogue/structures.ts')
const results = argOf('--results', resultsDir(PROJECT))
const out = JSON.parse(readFileSync(join(results, 'central-strike.json'), 'utf8'))
const SP = JSON.parse(readFileSync(join(resultsDir(SOURCE), 'positions.json'), 'utf8'))
const g = new Generated('projects/central-strike/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const count = (n) => n.toLocaleString('en-US')
const pts = (x, d = 1) => percent(x, d)
const ciWords = (c, d = 1) => (c ? `${percent(c[0], d)} to ${percent(c[1], d)}` : '--')
const cellOf = (s, d = 1) => (s && s.value !== null ? `${pts(s.value, d)} {\\scriptsize(${s.ci ? `${percent(s.ci[0], d)}, ${percent(s.ci[1], d)}` : '--'})}` : '--')
const head = (text) => `\\begin{tabular}[b]{@{}l@{}}${text.split('|').join(' \\\\ ')}\\end{tabular}`
const above0 = (s) => !!s?.ci && s.ci[0] > 0
const below0 = (s) => !!s?.ci && s.ci[1] < 0
const holds0 = (s) => !!s?.ci && s.ci[0] <= 0 && s.ci[1] >= 0
const HALF = ['First', 'Second']

// ---- the design and the data ----
claim(out.app?.commit && out.app.commit === SP.app.commit, 'the report read the rows structure-breaks scored')
claim(out.app.commit === gitCommit(CHESS_DIR), 'the paper is generated at the app commit the rows were scored at')
g.def('AppCommit', out.app.commit.slice(0, 10)).def('GradeNodes', count(E.budgetNodes(BUDGET, 'node'))).def('Window', String(E.ACCEPT_WINDOW_WP))
g.def('Draws', count(DRAWS)).def('Seed', String(SEED)).def('MinGames', String(MIN_GAMES))
const Sm = JSON.parse(readFileSync(join(privateDir(STRONG_SOURCE), `strong-${MONTH}.json`), 'utf8'))
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
g.def('MonthName', `${MONTHS[Number(MONTH.slice(5, 7)) - 1]} ${MONTH.slice(0, 4)}`).def('Floor', String(Sm.floor)).def('WinLow', String(WIN_LOW)).def('WinHigh', String(WIN_HIGH))
claim(out.design.seed === SEED && out.design.draws === DRAWS && out.design.minGames === MIN_GAMES, 'the report ran the design the README fixed')

const H = out.halves
const S = out.strong
const cov = out.coverage
for (const [h, x] of HALF.entries()) {
  g.def(`Centre${x}`, String(H[h].positions.centre)).def(`Away${x}`, String(H[h].positions.away))
  g.def(`CentreGames${x}`, String(H[h].games.centre)).def(`AwayGames${x}`, String(H[h].games.away))
}
g.def('StrongCentre', String(S.positions.centre)).def('StrongAway', String(S.positions.away))
g.def('HisScored', count(cov.his.scored)).def('StrongScored', count(cov.strong.scored))
g.def('HisEndgames', String(cov.his.endgame ?? 0)).def('HisNoCentral', String(cov.his['no central break'] ?? 0))
g.def('StrongEndgames', String(cov.strong.endgame ?? 0)).def('StrongNoCentral', String(cov.strong['no central break'] ?? 0))
const entering = H[0].positions.centre + H[0].positions.away + H[1].positions.centre + H[1].positions.away
g.def('Entering', String(entering)).def('StrongEntering', String(S.positions.centre + S.positions.away))
claim((cov.his['a score is not exact'] ?? 0) === 0 && (cov.strong['a score is not exact'] ?? 0) === 0, 'every score the study reads is exact')
claim(H.every((h) => Math.min(h.games.centre, h.games.away) >= MIN_GAMES), 'each half has enough games with the king in the centre and away')

g.block(
  'CoverageTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\begin{tabular}{@{}lrrr@{}}',
    '\\toprule',
    ` & ${head('His, first|half')} & ${head('His, second|half')} & ${head('Strong|players')} \\\\`,
    '\\midrule',
    `King in the centre: positions (games) & ${H[0].positions.centre} (${H[0].games.centre}) & ${H[1].positions.centre} (${H[1].games.centre}) & ${S.positions.centre} \\\\`,
    `King away: positions (games) & ${H[0].positions.away} (${H[0].games.away}) & ${H[1].positions.away} (${H[1].games.away}) & ${S.positions.away} \\\\`,
    `King on its starting square & ${out.descriptions.halves[0].stricter.positions} & ${out.descriptions.halves[1].stricter.positions} & ${out.descriptions.strong.stricter.positions} \\\\`,
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The entering positions: quiet middlegame positions with a central break on, every score the study reads exact. His two halves were counted before the rule was fixed, with no score read; of all the scored positions, his ${cov.his.endgame ?? 0} endgames and ${cov.his['no central break'] ?? 0} positions with no central break on stay out, and the strong players' ${cov.strong.endgame ?? 0} and ${cov.strong['no central break'] ?? 0}.}`,
    '\\label{tab:coverage}',
    '\\end{table}',
  ].join('\n'),
)

// ---- the rule ----
const C0 = out.controls
claim(C0.referee && C0.null, 'both controls pass')
claim(out.verdict === 'no signal', 'the verdict is no signal')
claim(H.every((h) => above0(h.referee)) && above0(S.referee), 'the move played is sounder than a random move on each half and for strong players')
claim(H.every((h) => holds0(h.nullLift)), "the null's lift holds 0 on both halves")
claim(H.every((h) => h.lift.value > 0), 'the lift is positive on both halves')
claim(!above0(H[0].lift) && above0(H[1].lift), "only the later half's lift lies above 0")
claim(H[0].lift.ci[0] > -0.005, "the earlier half's interval reaches 0 and no further")
claim(H.every((h) => below0(h.gain)), 'the central break trails his move on both halves even with the king in the centre')
for (const [h, x] of HALF.entries()) {
  g.def(`Lift${x}`, pts(H[h].lift.value)).def(`Lift${x}Ci`, ciWords(H[h].lift.ci))
  g.def(`Gain${x}`, pts(-H[h].gain.value)).def(`Gain${x}Ci`, ciWords(H[h].gain.ci))
  g.def(`Referee${x}`, pts(H[h].referee.value)).def(`Null${x}`, pts(H[h].nullLift.value)).def(`Null${x}Ci`, ciWords(H[h].nullLift.ci))
}
g.def('StrongLift', pts(S.lift.value)).def('StrongLiftCi', ciWords(S.lift.ci)).def('StrongGain', pts(-S.gain.value)).def('StrongGainCi', ciWords(S.gain.ci))
g.def('StrongReferee', pts(S.referee.value)).def('StrongReading', esc(S.reading)).def('Verdict', esc(out.verdict))

const ruleRow = (label, key) => `${label} & ${cellOf(H[0][key])} & ${cellOf(H[1][key])} & ${cellOf(S[key])} \\\\`
g.block(
  'RuleTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\begin{tabular}{@{}llll@{}}',
    '\\toprule',
    ` & ${head('His, first|half')} & ${head('His, second|half')} & ${head('Strong|players')} \\\\`,
    '\\midrule',
    ruleRow('Referee: $A - R$ ($S - R$)', 'referee'),
    ruleRow('Null: $R_2 - R$, centre minus away', 'nullLift'),
    ruleRow('The lift: $C - R$, centre minus away', 'lift'),
    ruleRow("The strike's gain: $C - A$ ($S$), centre", 'gain'),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The rule's measures, in points of soundness with 95\\% intervals from ${count(DRAWS)} bootstrap draws over games. The verdict rests on his halves; the strong players' column is read, not ruled on.}`,
    '\\label{tab:rule}',
    '\\end{table}',
  ].join('\n'),
)

// ---- what the positions describe ----
const D = out.descriptions
const DH = D.halves
const ARM = { C: '$C$, the central breaks', A: '$A$, his move ($S$)', N: "$N$, Maia-2 at his band", U: '$U$, Maia-2 at the band above', R: '$R$, a random move', R2: '$R_2$, another', playedCentral: 'He played a central break' }
g.block(
  'ArmTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{@{}llllll@{}}',
    '\\toprule',
    ` & ${head('First half,|centre')} & ${head('First half,|away')} & ${head('Second half,|centre')} & ${head('Second half,|away')} & ${head('Strong,|centre / away')} \\\\`,
    '\\midrule',
    ...Object.entries(ARM).map(([arm, label]) => {
      const s = D.strong.byCondition
      const strongCell = s.centre[arm] ? `${pts(s.centre[arm].value)} / ${pts(s.away[arm].value)}` : '--'
      return `${label} & ${cellOf(DH[0].byCondition.centre[arm])} & ${cellOf(DH[0].byCondition.away[arm])} & ${cellOf(DH[1].byCondition.centre[arm])} & ${cellOf(DH[1].byCondition.away[arm])} & ${strongCell} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
    '\\caption{Described, not tested: the share of each arm that is sound, and how often the move played was a central break, in percent with 95\\% intervals, where the other king is in the centre and where it is away.}',
    '\\label{tab:arms}',
    '\\end{table}',
  ].join('\n'),
)
for (const [h, x] of HALF.entries()) {
  const b = DH[h].byCondition
  g.def(`CCentre${x}`, pts(b.centre.C.value, 0)).def(`CAway${x}`, pts(b.away.C.value, 0)).def(`ACentre${x}`, pts(b.centre.A.value, 0)).def(`AAway${x}`, pts(b.away.A.value, 0))
  g.def(`RCentre${x}`, pts(b.centre.R.value, 0)).def(`RAway${x}`, pts(b.away.R.value, 0))
  g.def(`PlayedCentre${x}`, pts(b.centre.playedCentral.value, 0)).def(`PlayedAway${x}`, pts(b.away.playedCentral.value, 0))
  g.def(`LostCCentre${x}`, fixed(b.centre.lostC.value, 1)).def(`LostCAway${x}`, fixed(b.away.lostC.value, 1)).def(`LostACentre${x}`, fixed(b.centre.lostA.value, 1))
  g.def(`Strict${x}`, pts(DH[h].stricter.lift.value)).def(`Strict${x}Ci`, ciWords(DH[h].stricter.lift.ci))
  g.def(`Queens${x}`, pts(DH[h].queensOn.lift.value)).def(`Queens${x}Ci`, ciWords(DH[h].queensOn.lift.ci))
  g.def(`Flank${x}`, pts(DH[h].flank.lift.value)).def(`Flank${x}Ci`, ciWords(DH[h].flank.lift.ci))
  g.def(`MaiaC${x}`, pts(DH[h].maia.pHisC.value)).def(`MaiaF${x}`, pts(DH[h].maia.pHisF.value)).def(`MaiaBoth${x}`, String(DH[h].maia.positions))
}
claim(DH.every((d) => d.byCondition.centre.C.value > 1.5 * d.byCondition.away.C.value), 'the central breaks are sound far more often with the king in the centre, on both halves')
claim(DH.every((d) => d.byCondition.centre.C.value < 0.6 * d.byCondition.centre.A.value), 'even with the king in the centre the central breaks are sound well under two thirds as often as his move')
claim(DH.every((d) => d.stricter.lift.value > 0), 'the stricter reading keeps a positive lift on both halves')
claim(DH.every((d) => holds0(d.flank.lift)), "the flank breaks' lift holds 0 on both halves")
claim(DH.every((d) => d.maia.pHisC.value >= d.maia.pHisF.value), 'Maia-2 at his band gives a central break no less probability than a flank break')
claim(DH.every((d) => d.byCondition.centre.lostC.value < d.byCondition.away.lostC.value), 'the central breaks give up less with the king in the centre')
g.def('StrongStrict', pts(D.strong.stricter.lift.value)).def('StrongStrictCi', ciWords(D.strong.stricter.lift.ci))
g.def('StrongQueens', pts(D.strong.queensOn.lift.value)).def('StrongQueensCi', ciWords(D.strong.queensOn.lift.ci))
g.def('StrongFlank', pts(D.strong.flank.lift.value)).def('StrongFlankCi', ciWords(D.strong.flank.lift.ci))
g.def('StrongCCentre', pts(D.strong.byCondition.centre.C.value, 0)).def('StrongCAway', pts(D.strong.byCondition.away.C.value, 0))
g.def('StrongSCentre', pts(D.strong.byCondition.centre.A.value, 0))
claim(S.reading === 'silent' && holds0(S.lift), "the strong players' positions are silent")
claim(Math.abs(D.strong.byCondition.centre.C.value - D.strong.byCondition.away.C.value) < 0.03, "the strong players' central breaks are sound about as often with the king in the centre as away")
claim(below0(S.gain), "the strong players' central breaks trail their own move with the king in the centre")
claim(holds0(D.strong.stricter.lift) && holds0(D.strong.queensOn.lift), "the strong players' stricter and queens-on lifts hold 0")
claim(above0(D.strong.flank.lift) && D.strong.flank.lift.value > S.lift.value, "the strong players' flank breaks gain on a random move with the king in the centre, more than their central breaks")

// ---- two positions ----
const source = privateDir(SOURCE)
const rows = new Map(
  [0, 1, 2, 3]
    .flatMap((i) => readJsonl(join(source, `his-${i}-of-4.jsonl`)))
    .filter((r) => r.status === 'scored')
    .map((r) => [r.id, r]),
)
const cand = new Map(readJsonl(join(source, 'his-candidates.jsonl')).map((c) => [c.id, c]))
const inCentre = (r) => r.phase === 'middlegame' && centralBreaks(r).length > 0 && otherKingInCentre(cand.get(r.id).fen)
const later = [...rows.values()].filter((r) => r.half === 1 && inCentre(r)).sort((a, b) => a.id - b.id)
claim(later.length === H[1].positions.centre, "the private rows are the later half's positions the report counted")
const struck = later.find((r) => centralBreaks(r).some((m) => soundOf(r, m) === 1) && !centralBreaks(r).includes(r.played))
const trailed = later.find((r) => centralBreaks(r).every((m) => soundOf(r, m) === 0) && soundOf(r, r.played) === 1)
claim(struck && trailed, 'both examples exist')
const engine = N.createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false, pool: 1 })
const SIDE = { w: 'White', b: 'Black' }
const COLOR = { sound: 'green!50!black', unsound: 'red!75!black', his: 'blue!70!black' }
const sanOf = (fen, uci) => new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
const arrows = (fen, marks) =>
  `\\chessboard[setfen={${fen}}, boardfontsize=14pt, ${marks.map(([uci, color]) => `pgfstyle=straightmove, arrow=to, linewidth=0.07em, color=${color}, markmoves={${uci.slice(0, 2)}-${uci.slice(2, 4)}}`).join(', ')}]`
const catalogueName = (id) => esc(St.structureById(id).name)
async function example(prefix, row, pick) {
  const c = cand.get(row.id)
  const turn = c.fen.split(' ')[1]
  await engine.newGame('analyst')
  const pos = C.position(C.START_FEN, c.history)
  claim(C.fenOf(pos) === c.fen, `${prefix}: the game's moves replay to the position`)
  const best = (await engine.bestMoves(pos, { budget: BUDGET, multiPv: 1, priority: 'batch' })).lines[0]
  claim(best.move === row.best, `${prefix}: the referee's best move is the run's`)
  const again = {}
  for (const uci of Object.keys(row.scores)) {
    const r = await engine.scoreMove(pos, uci, { budget: BUDGET, priority: 'batch' })
    again[uci] = { sound: E.acceptsAlternative(r.score, best.score, turn), wp: Sc.winPercentFor(r.eval, turn) }
  }
  claim(Object.keys(row.scores).every((u) => again[u].sound === row.scores[u].sound), `${prefix}: every move's soundness is the run's, searched in the run's order`)
  const brk = pick(row)
  const move = (uci) => movesTex(c.fen, [sanOf(c.fen, uci)])
  const king = kingSquare(c.fen, turn === 'w' ? 'b' : 'w')
  g.def(`${prefix}Fen`, `\\fen{${c.fen}}`).def(`${prefix}Mover`, SIDE[turn]).def(`${prefix}Structure`, catalogueName(c.structure)).def(`${prefix}King`, king)
  g.def(`${prefix}Break`, move(brk)).def(`${prefix}BreakSound`, row.scores[brk].sound ? 'sound' : 'not sound').def(`${prefix}WpBreak`, fixed(again[brk].wp, 0))
  g.def(`${prefix}Best`, move(row.best)).def(`${prefix}WpBest`, fixed(Sc.winPercentFor(best.eval, turn), 0)).def(`${prefix}Played`, move(row.played)).def(`${prefix}WpPlayed`, fixed(again[row.played].wp, 0))
  g.def(`${prefix}PlayedSound`, row.scores[row.played].sound ? 'sound' : 'not sound')
  g.block(`${prefix}Board`, arrows(c.fen, [[row.played, COLOR.his], [brk, row.scores[brk].sound ? COLOR.sound : COLOR.unsound]]))
}
await example('Ea', struck, (r) => centralBreaks(r).find((m) => soundOf(r, m) === 1))
await example('Eb', trailed, (r) => centralBreaks(r)[0])
await engine.dispose?.()

g.write(join(HERE, 'generated.tex'))
console.error('central-strike: wrote paper/generated.tex')
process.exit(0)
