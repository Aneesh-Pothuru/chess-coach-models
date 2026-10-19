#!/usr/bin/env node
// Writes paper/generated.tex for the checklist before a break: the rule's
// verdict and the descriptions (results/break-ready.json), the counts made
// before the rule (results/coverage.json), the descriptions added after the
// run (results/descriptions.json), the design from the study's and the app's
// constants, and two positions from the private rows, rescored. It refuses to
// write when a claim the paper makes no longer holds.
//
//   bridge/run.sh projects/break-ready/paper/generate.mjs

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, esc, figurine, fixed, movesTex, percent, word } from '../../paper.mjs'
import { BUDGET } from '../../structure-breaks/lib.mjs'
import { AIMED_MIN, CHECKS, DRAWS, MIN_ARM, MIN_CELL, PIECE_CHECKS, PROJECT, SEED, SOURCE, argOf, gitCommit, piecesReady, readJsonl, rowsOf, soundOf } from '../lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const E = await chess('src/services/engine/index.ts')
const N = await chess('src/adapters/node/engine/index.ts')
const C = await chess('src/core/chess/index.ts')
const Sc = await chess('src/core/score/index.ts')
const St = await chess('src/services/knowledge/catalogue/structures.ts')
const results = argOf('--results', resultsDir(PROJECT))
const read = (file, from = results) => JSON.parse(readFileSync(join(from, file), 'utf8'))
const out = read('break-ready.json')
const cov = read('coverage.json')
const D = read('descriptions.json')
const SB = read('structure-breaks.json', resultsDir(SOURCE))
const SP = read('positions.json', resultsDir(SOURCE))
const g = new Generated('projects/break-ready/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const count = (n) => n.toLocaleString('en-US')
const pts = (x, d = 1) => percent(x, d)
const ciWords = (c, d = 1) => (c ? `${percent(c[0], d)} to ${percent(c[1], d)}` : '--')
const cellOf = (s, d = 1) => (s ? `${pts(s.value, d)} {\\scriptsize(${s.ci ? `${percent(s.ci[0], d)}, ${percent(s.ci[1], d)}` : '--'})}` : '--')
const HALF = ['First', 'Second']
const holds0 = (c) => !!c && c[0] <= 0 && c[1] >= 0
const above0 = (c) => !!c && c[0] > 0
const below0 = (c) => !!c && c[1] < 0
const nameOf = (id) => {
  const name = St.structureById(id).name.replace(/^the /, '')
  return esc(name[0].toUpperCase() + name.slice(1))
}
const catalogueName = (id) => esc(St.structureById(id).name)
const leverTex = (lever) => esc(lever).replace(/^\.\.\./, '\\ldots{}')
const groupTex = (group) => {
  const [structure, lever] = group.split('|')
  return `${nameOf(structure)}, ${leverTex(lever)}`
}
const head = (text) => `\\begin{tabular}[b]{@{}l@{}}${text.split('|').join(' \\\\ ')}\\end{tabular}`
const QUESTION = { aimed: 'Pieces aimed', rooks: 'Rooks ready', purpose: 'A passer or an exposed king', force: 'Force on that side', safe: 'The blunder check: safe', allButPurpose: 'The four but purpose, together' }

// ---- the design and the data ----
claim(SP.app.commit === gitCommit(CHESS_DIR), "the app commit is the one structure-breaks scored")
g.def('AppCommit', SP.app.commit.slice(0, 10)).def('GradeNodes', count(E.budgetNodes(BUDGET, 'node'))).def('Window', String(E.ACCEPT_WINDOW_WP))
g.def('Draws', count(DRAWS)).def('Seed', String(SEED)).def('AimedMin', word(AIMED_MIN)).def('MinArm', String(MIN_ARM)).def('MinCell', String(MIN_CELL))
claim(CHECKS.length === 5 && PIECE_CHECKS.join(' ') === 'aimed rooks force', 'five questions, three of them about the pieces')
const H = out.counts.his
for (const [h, c] of H.entries()) {
  claim(c.positions === SB.halves[h].positions && c.games === SB.halves[h].games, `the ${HALF[h].toLowerCase()} half's positions are the ones structure-breaks scored`)
  g.def(`Positions${HALF[h]}`, count(c.positions)).def(`Games${HALF[h]}`, count(c.games)).def(`Breaks${HALF[h]}`, count(c.breaks))
}
claim(out.counts.strong.positions === SB.strong.positions, "the strong positions are the ones structure-breaks scored")
g.def('StrongPositions', count(out.counts.strong.positions)).def('StrongBreaks', count(out.counts.strong.breaks))
g.def('BreaksAll', count(H[0].breaks + H[1].breaks)).def('PositionsAll', count(H[0].positions + H[1].positions))
g.def('Floor', '2200')

// ---- coverage, before the rule ----
const cols = [cov.his[0], cov.his[1], cov.strong]
claim(cols.map((c) => c.breaks).join(' ') === `${H[0].breaks} ${H[1].breaks} ${out.counts.strong.breaks}`, 'the coverage counts the breaks the analysis reads')
const shareCell = (s) => `${count(s.n)} {\\scriptsize(${pts(s.n / s.of)}\\%)}`
g.block(
  'CoverageTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{@{}llll@{}}',
    '\\toprule',
    '& His, first half & His, second half & Strong players \\\\',
    '\\midrule',
    `Breaks (positions) & ${cols.map((c) => `${count(c.breaks)} (${count(c.positions)})`).join(' & ')} \\\\`,
    '\\midrule',
    ...CHECKS.map((c, i) => `${i + 1}. ${QUESTION[c]} & ${cols.map((x) => shareCell(x.checks[c])).join(' & ')} \\\\`),
    '\\midrule',
    `All five & ${cols.map((x) => shareCell(x.ready)).join(' & ')} \\\\`,
    `Safe, with the pieces ready & ${cols.map((x) => `${count(x.piecesAmongSafe.n)} of ${count(x.piecesAmongSafe.of)}`).join(' & ')} \\\\`,
    '\\bottomrule',
    '\\end{tabular}',
    '\\caption{Counted before the rule was fixed, from the board alone, with no score read: the breaks each question passes, all five, and the safe breaks with the pieces ready (questions 1, 2 and 4), among the safe breaks.}',
    '\\label{tab:coverage}',
    '\\end{table}',
  ].join('\n'),
)
const allFive = cov.his[0].ready.n + cov.his[1].ready.n
const purposeHis = cov.his[0].checks.purpose.n + cov.his[1].checks.purpose.n
claim(allFive / (H[0].breaks + H[1].breaks) < 0.01 && cov.strong.ready.n / cov.strong.breaks < 0.01, 'all five questions pass for under 1% of breaks')
claim(purposeHis / (H[0].breaks + H[1].breaks) > 0.05 && purposeHis / (H[0].breaks + H[1].breaks) < 0.1, 'the purpose question passes for about one break in fourteen of his')
g.def('AllFive', word(allFive)).def('AllFiveStrong', word(cov.strong.ready.n)).def('PurposeShare', pts(purposeHis / (H[0].breaks + H[1].breaks), 0))
for (const [h, c] of cov.his.entries()) g.def(`Ready${HALF[h]}`, count(c.piecesAmongSafe.n)).def(`Safe${HALF[h]}`, count(c.piecesAmongSafe.of))
g.def('ReadyStrong', count(cov.strong.piecesAmongSafe.n)).def('SafeStrong', count(cov.strong.piecesAmongSafe.of))

// ---- the controls and the verdict ----
const ctl = out.controls
claim(ctl.referee && ctl.positive && ctl.null, 'every control passes')
claim(out.verdict === 'no signal', 'the verdict is no signal')
claim(out.arms.every((a) => a.ready >= MIN_ARM && a.rushed >= MIN_ARM), 'each half has enough safe breaks on both sides')
g.def('Verdict', esc(out.verdict))
const P = out.primary
const ref = out.referee
for (const h of [0, 1]) {
  const x = HALF[h]
  g.def(`Lift${x}`, pts(P[h].lift.value)).def(`Lift${x}Ci`, ciWords(P[h].lift.ci))
  g.def(`Check${x}`, pts(out.positive[h].lift.value)).def(`Check${x}Ci`, ciWords(out.positive[h].lift.ci))
  g.def(`Null${x}`, pts(out.null[h].lift.value)).def(`Null${x}Ci`, ciWords(out.null[h].lift.ci))
  g.def(`Control${x}`, pts(ref.his[h].AminusR.value)).def(`Control${x}Ci`, ciWords(ref.his[h].AminusR.ci))
  g.def(`ReadySound${x}`, pts(out.raw.his[h].pieces.yes.sound)).def(`RushedSound${x}`, pts(out.raw.his[h].pieces.no.sound))
  g.def(`SafeSound${x}`, pts(out.raw.his[h].safe.yes.sound)).def(`UnsafeSound${x}`, pts(out.raw.his[h].safe.no.sound))
}
claim([0, 1].every((h) => holds0(P[h].lift.ci)), "the lift of the pieces' readiness holds 0 on both halves")
claim(holds0(out.strong.pieces.lift.ci), "the strong players' lift holds 0 too")
claim([0, 1].every((h) => above0(out.positive[h].lift.ci)) && above0(out.strong.safe.lift.ci), "the blunder check's lift lies above 0 on both halves and for the strong players")
claim(below0(out.null[0].lift.ci) && above0(out.null[1].lift.ci), "the random reading's interval leaves out 0 on each half, below on the first and above on the second")
claim([0, 1].every((h) => out.raw.his[h].safe.yes.sound > 1.8 * out.raw.his[h].safe.no.sound) && out.raw.strong.safe.yes.sound > 1.8 * out.raw.strong.safe.no.sound, 'a safe break is sound about twice as often as one that is not')
g.def('StrongLift', pts(out.strong.pieces.lift.value)).def('StrongLiftCi', ciWords(out.strong.pieces.lift.ci))
g.def('StrongCheck', pts(out.strong.safe.lift.value)).def('StrongCheckCi', ciWords(out.strong.safe.lift.ci))
g.def('StrongControl', pts(ref.strong.SminusR.value)).def('StrongControlCi', ciWords(ref.strong.SminusR.ci))
g.def('StrongReadySound', pts(out.raw.strong.pieces.yes.sound)).def('StrongRushedSound', pts(out.raw.strong.pieces.no.sound))
g.def('StrongSafeSound', pts(out.raw.strong.safe.yes.sound)).def('StrongUnsafeSound', pts(out.raw.strong.safe.no.sound))
const row3 = (name, a, b, c) => `${name} & ${a} & ${b} & ${c} \\\\`
g.block(
  'ControlTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{@{}llll@{}}',
    '\\toprule',
    '& His, first half & His, second half & Strong players \\\\',
    '\\midrule',
    row3('1. The move played minus a random move', cellOf(ref.his[0].AminusR), cellOf(ref.his[1].AminusR), cellOf(ref.strong.SminusR)),
    row3("2. The blunder check's lift", cellOf(out.positive[0].lift), cellOf(out.positive[1].lift), cellOf(out.strong.safe.lift)),
    row3("3. A random reading's lift", cellOf(out.null[0].lift), cellOf(out.null[1].lift), '--'),
    '\\midrule',
    row3('Pieces ready, the lift', cellOf(P[0].lift), cellOf(P[1].lift), cellOf(out.strong.pieces.lift)),
    row3('Safe breaks: ready / rushed', `${count(out.arms[0].ready)} / ${count(out.arms[0].rushed)}`, `${count(out.arms[1].ready)} / ${count(out.arms[1].rushed)}`, `${count(out.strong.arms.ready)} / ${count(out.strong.arms.rushed)}`),
    row3('Sound: ready / rushed (\\%)', `${pts(out.raw.his[0].pieces.yes.sound)} / ${pts(out.raw.his[0].pieces.no.sound)}`, `${pts(out.raw.his[1].pieces.yes.sound)} / ${pts(out.raw.his[1].pieces.no.sound)}`, `${pts(out.raw.strong.pieces.yes.sound)} / ${pts(out.raw.strong.pieces.no.sound)}`),
    row3('Sound: safe / not safe (\\%)', `${pts(out.raw.his[0].safe.yes.sound)} / ${pts(out.raw.his[0].safe.no.sound)}`, `${pts(out.raw.his[1].safe.yes.sound)} / ${pts(out.raw.his[1].safe.no.sound)}`, `${pts(out.raw.strong.safe.yes.sound)} / ${pts(out.raw.strong.safe.no.sound)}`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The controls and the rule's lift, in points, with 95\\% intervals resampling his games, or the strong players' positions. The strong players' column is reported, not ruled on. Below, the share of breaks that are sound on each side, in \\%, before the groups are weighed.}`,
    '\\label{tab:controls}',
    '\\end{table}',
  ].join('\n'),
)

// ---- each question, the count, the groups ----
const Q = out.eachQuestion
g.block(
  'QuestionTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{@{}lrllll@{}}',
    '\\toprule',
    `Question & ${head('His breaks:|pass / fail')} & ${head('His, halves|together')} & ${head('His, first|half')} & ${head('His, second|half')} & ${head('Strong|players')} \\\\`,
    '\\midrule',
    ...Object.entries(Q).map(([name, q]) => `${QUESTION[name]} & ${count(q.share.yes.n)} / ${count(q.share.no.n)} & ${cellOf(q.pooled.lift)} & ${cellOf(q.halves[0].lift)} & ${cellOf(q.halves[1].lift)} & ${cellOf(q.strong.lift)} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Each question alone over all the breaks, safe or not, and the four questions other than purpose together: the lift, in points, with 95\\% intervals.}`,
    '\\label{tab:questions}',
    '\\end{table}',
  ].join('\n'),
)
const strongAbove = Object.entries(Q).filter(([, q]) => above0(q.strong.lift.ci)).map(([n]) => n)
claim(strongAbove.join(' ') === 'safe', "for the strong players only the blunder check's interval lies above 0")
claim(Object.entries(Q).every(([n, q]) => n === 'safe' || q.pooled.lift.value < Q.safe.pooled.lift.value), "with his halves together the blunder check's lift is the largest")
claim(above0(Q.aimed.pooled.lift.ci) && above0(Q.force.pooled.lift.ci) && holds0(Q.rooks.pooled.lift.ci) && holds0(Q.purpose.pooled.lift.ci), 'over all his breaks the aimed and force questions lie above 0 and the rooks and purpose questions hold 0')
for (const [n, q] of Object.entries(Q)) {
  const key = n[0].toUpperCase() + n.slice(1)
  g.def(`Q${key}`, pts(q.pooled.lift.value)).def(`Q${key}Ci`, ciWords(q.pooled.lift.ci)).def(`Q${key}Strong`, pts(q.strong.lift.value))
}

const BC = out.byCount
const AS = D.pieceCount
claim(BC.slice(1, 5).every((c, i, l) => i === 0 || c.stats.sound.value > l[i - 1].stats.sound.value), 'soundness rises with each question passed, from one to four')
claim(BC[0].stats.sound.value === 0 && BC[5].breaks < MIN_CELL, 'no break that passes none is sound, and too few pass all five to say')
claim(BC[4].stats.sound.ci[1] < Math.min(SB.halves[0].stats.A.value, SB.halves[1].stats.A.value), 'breaks passing four questions are sound less often than his own moves')
g.block(
  'CountTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{@{}lrl@{\\hspace{1.5em}}lrlrl@{}}',
    '\\toprule',
    '\\multicolumn{3}{@{}l}{All his breaks, by questions passed} & \\multicolumn{5}{l}{The safe breaks, by piece questions passed} \\\\',
    '\\cmidrule(r{1.5em}){1-3}\\cmidrule(l){4-8}',
    `Of five & Breaks & Sound (\\%) & Of three & ${head('His|breaks')} & His, sound (\\%) & ${head('Strong|breaks')} & Strong, sound (\\%) \\\\`,
    '\\midrule',
    ...BC.map((c, k) => {
      const left = `${k} & ${count(c.breaks)} & ${c.stats ? cellOf(c.stats.sound) : `\\emph{n=${c.breaks}}`}`
      const a = AS[k]
      const right = a ? `${k} & ${count(a.his.breaks)} & ${a.his.stats ? cellOf(a.his.stats.sound) : `\\emph{n=${a.his.breaks}}`} & ${count(a.strong.breaks)} & ${a.strong.stats ? cellOf(a.strong.stats.sound) : `\\emph{n=${a.strong.breaks}}`}` : '& & & &'
      return `${left} & ${right} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The share of breaks that are sound, in \\%, with 95\\% intervals. Left: all his breaks, both halves together, by how many of the five questions they pass (fewer than ${MIN_CELL} breaks shows only their number). Right, added after the run: the safe breaks, his and the strong players', by how many of the three piece questions they pass.}`,
    '\\label{tab:count}',
    '\\end{table}',
  ].join('\n'),
)
for (const [k, c] of BC.entries()) if (c.stats) g.def(`Count${['None', 'One', 'Two', 'Three', 'Four'][k]}`, pts(c.stats.sound.value))

const groupsShown = out.groups.filter((x) => x.stats)
claim(groupsShown.length === 3 && groupsShown.every((x) => holds0(x.stats.lift.ci)), "in each of the three groups with enough safe breaks the lift holds 0")
g.block(
  'GroupTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{@{}lrlll@{}}',
    '\\toprule',
    'Break & Ready / rushed & Ready, sound (\\%) & Rushed, sound (\\%) & Lift (points) \\\\',
    '\\midrule',
    ...groupsShown.map((x) => `${groupTex(x.group)} & ${count(x.ready)} / ${count(x.rushed)} & ${cellOf(x.stats.ready)} & ${cellOf(x.stats.rushed)} & ${cellOf(x.stats.lift)} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{His safe breaks, both halves together, for each group with at least ${MIN_CELL} breaks with the pieces ready and ${MIN_CELL} rushed: the share sound on each side and the difference, with 95\\% intervals.}`,
    '\\label{tab:groups}',
    '\\end{table}',
  ].join('\n'),
)
const groupsOther = out.groups.length - groupsShown.length
g.def('GroupsOther', word(groupsOther))

// ---- his choice, and the ready break against his move ----
const ch = out.choice
claim(holds0(ch.lift.lift.ci), 'he plays a ready break about as often as a rushed one, within the groups')
claim(ch.played.unsafe < ch.played.ready && ch.played.unsafe < ch.played.rushed && ch.strongPlayed.unsafe < ch.strongPlayed.rushed, 'he and the strong players play an unsafe break less often than a safe one')
g.def('PlayedReady', pts(ch.played.ready)).def('PlayedRushed', pts(ch.played.rushed)).def('PlayedUnsafe', pts(ch.played.unsafe))
g.def('StrongPlayedReady', pts(ch.strongPlayed.ready)).def('StrongPlayedRushed', pts(ch.strongPlayed.rushed)).def('StrongPlayedUnsafe', pts(ch.strongPlayed.unsafe))
g.def('ChoiceLift', pts(ch.lift.lift.value)).def('ChoiceLiftCi', ciWords(ch.lift.lift.ci))
const AM = out.againstMove
claim(AM.every((s) => below0(s.gain.ci)), 'where a safe break has its pieces ready, it trails his own move on both halves')
for (const [h, s] of AM.entries()) {
  const x = HALF[h]
  g.def(`Against${x}`, count(s.n)).def(`AgainstReady${x}`, pts(s.ready.value)).def(`AgainstOwn${x}`, pts(s.own.value)).def(`AgainstGain${x}`, pts(s.gain.value)).def(`AgainstGain${x}Ci`, ciWords(s.gain.ci))
}
g.block(
  'ChoiceTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{@{}llll@{}}',
    '\\toprule',
    '& Safe, pieces ready & Safe, rushed & Not safe \\\\',
    '\\midrule',
    `He played the break (\\%) & ${pts(ch.played.ready)} & ${pts(ch.played.rushed)} & ${pts(ch.played.unsafe)} \\\\`,
    `Strong players played it (\\%) & ${pts(ch.strongPlayed.ready)} & ${pts(ch.strongPlayed.rushed)} & ${pts(ch.strongPlayed.unsafe)} \\\\`,
    '\\midrule',
    `& Positions & ${head('The ready|breaks, sound')} & ${head('His move,|sound')} \\\\`,
    '\\midrule',
    ...AM.map((s, h) => `His, ${HALF[h].toLowerCase()} half & ${count(s.n)} & ${cellOf(s.ready)} & ${cellOf(s.own)} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Above: how often the break was the move played, by what the questions say of it. Below: his positions with a safe break whose pieces are ready, the share of those breaks that are sound and of his moves there, in \\%, with 95\\% intervals.}`,
    '\\label{tab:choice}',
    '\\end{table}',
  ].join('\n'),
)

// ---- added after the run ----
const cal = D.calibration
claim(cal.every((c) => c.excludes <= 10 && Math.abs(c.bootstrapSpread - c.permutationSpread) < 0.1 * c.permutationSpread), "the intervals leave out 0 for about one random reading in twenty, and the bootstrap's spread matches the random readings'")
claim(cal.every((c) => c.permutationP > 0.3), "pieces ready's lift is no farther from 0 than a random reading's often is")
for (const [h, c] of cal.entries()) {
  const x = HALF[h]
  g.def(`CalSpread${x}`, pts(c.permutationSpread)).def(`CalBoot${x}`, pts(c.bootstrapSpread)).def(`CalExcludes${x}`, word(c.excludes)).def(`CalP${x}`, fixed(c.permutationP, 2))
}
g.def('CalReadings', String(cal[0].readings)).def('CalPermutations', count(cal[0].permutations))
const NullSd = cal.map((c, h) => Math.abs(out.null[h].lift.value) / c.permutationSpread)
g.def('NullSdFirst', fixed(NullSd[0], 1)).def('NullSdSecond', fixed(NullSd[1], 1))
const S = D.amongSafe
claim(above0(S.aimed.pooled.lift.ci) && above0(S.force.pooled.lift.ci) && holds0(S.rooks.pooled.lift.ci), 'among his safe breaks, aimed and force alone lie above 0 with the halves together, and rooks holds 0')
claim(Object.values(S).every((q) => holds0(q.strong.lift.ci)) && Object.values(S).some((q) => q.halves.some((s) => holds0(s.lift.ci))), "no piece question alone lies above 0 for the strong players, and some holds 0 on a half")
claim(AS[2].his.stats.sound.value > AS[3].his.stats.sound.value, 'his safe breaks passing two piece questions are sound more often than those passing all three')
g.block(
  'SafeQuestionTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{@{}lrllll@{}}',
    '\\toprule',
    `Question & ${head('His safe breaks:|pass / fail')} & ${head('His, halves|together')} & ${head('His, first|half')} & ${head('His, second|half')} & ${head('Strong|players')} \\\\`,
    '\\midrule',
    ...Object.entries(S).map(([name, q]) => `${QUESTION[name]} & ${count(q.passes)} / ${count(q.fails)} & ${cellOf(q.pooled.lift)} & ${cellOf(q.halves[0].lift)} & ${cellOf(q.halves[1].lift)} & ${cellOf(q.strong.lift)} \\\\`),
    '\\midrule',
    `\\multicolumn{6}{@{}l}{The intervals, checked on random readings drawn as the null draws its own} \\\\`,
    `& ${head('Spread of|random lifts')} & ${head("The bootstrap's|spread")} & ${head('Intervals|leaving out 0')} & ${head("Pieces ready's|lift")} & ${head('Random lifts|as far from 0')} \\\\`,
    '\\midrule',
    ...cal.map((c, h) => `His, ${HALF[h].toLowerCase()} half & ${pts(c.permutationSpread)} & ${pts(c.bootstrapSpread)} & ${c.excludes} of ${c.readings} & ${pts(c.real)} & ${fixed(c.permutationP, 2)} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Added after the run. Above: each piece question alone among the safe breaks, the lift in points with 95\\% intervals. Below: the spread of the lift, in points, over ${count(cal[0].permutations)} random readings that pass as many safe breaks in each group as pieces ready does, the bootstrap's spread for ${cal[0].readings} of them, how many of those ${cal[0].readings} intervals leave out 0, and the share of random readings whose lift is at least as far from 0 as pieces ready's.}`,
    '\\label{tab:safequestions}',
    '\\end{table}',
  ].join('\n'),
)
for (const n of PIECE_CHECKS) {
  const key = n[0].toUpperCase() + n.slice(1)
  g.def(`S${key}`, pts(S[n].pooled.lift.value)).def(`S${key}Ci`, ciWords(S[n].pooled.lift.ci)).def(`S${key}Strong`, pts(S[n].strong.lift.value))
}
g.def('SafeTwo', pts(AS[2].his.stats.sound.value)).def('SafeThree', pts(AS[3].his.stats.sound.value))

// ---- two positions ----
const dir = privateDir(PROJECT)
const rows = new Map(rowsOf(privateDir(SOURCE), 'his', readdirSync).scored.map((r) => [r.id, r]))
const cand = new Map(readJsonl(join(privateDir(SOURCE), 'his-candidates.jsonl')).map((c) => [c.id, c]))
const checks = readJsonl(join(dir, 'his-checks.jsonl')).map((b) => ({ ...b, sound: soundOf(rows.get(b.id), b.uci) }))
claim(checks.length === H[0].breaks + H[1].breaks, 'the private readings are the breaks the report counted')
const firstOf = (keep) => [1, 0].map((h) => checks.filter((b) => b.half === h && keep(b)).sort((a, b) => a.id - b.id || a.uci.localeCompare(b.uci))[0]).find(Boolean) ?? null
const readyUnsound = firstOf((b) => b.checks.safe && piecesReady(b.checks) && !b.sound && soundOf(rows.get(b.id), rows.get(b.id).played))
const rushedSound = firstOf((b) => b.checks.safe && !piecesReady(b.checks) && b.sound && !rows.get(b.id).breaks.includes(rows.get(b.id).played))
claim(readyUnsound && rushedSound, 'both examples exist')
const engine = N.createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false, pool: 1 })
const SIDE = { w: 'White', b: 'Black' }
const COLOR = { sound: 'green!50!black', unsound: 'red!75!black', his: 'blue!70!black' }
const sanOf = (fen, uci) => new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
const pieceText = (fen, square) => {
  const p = new Chess(fen).get(square)
  return figurine(`${p.type.toUpperCase()}${square}`)
}
const listText = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0] ?? 'none')
const arrows = (fen, marks) =>
  `\\chessboard[setfen={${fen}}, boardfontsize=14pt, ${marks.map(([uci, color]) => `pgfstyle=straightmove, arrow=to, linewidth=0.07em, color=${color}, markmoves={${uci.slice(0, 2)}-${uci.slice(2, 4)}}`).join(', ')}]`
async function example(prefix, b) {
  const row = rows.get(b.id)
  const c = cand.get(b.id)
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
  const bestWp = Sc.winPercentFor(best.eval, turn)
  const move = (uci) => movesTex(c.fen, [sanOf(c.fen, uci)])
  const yes = (ok) => (ok ? 'yes' : 'no')
  g.def(`${prefix}Fen`, `\\fen{${c.fen}}`).def(`${prefix}Mover`, SIDE[turn]).def(`${prefix}Phase`, c.phase).def(`${prefix}Structure`, catalogueName(c.structure))
  g.def(`${prefix}Break`, move(b.uci)).def(`${prefix}BreakSound`, b.sound ? 'sound' : 'not sound').def(`${prefix}WpBreak`, fixed(again[b.uci].wp, 0))
  g.def(`${prefix}Best`, move(row.best)).def(`${prefix}WpBest`, fixed(bestWp, 0)).def(`${prefix}Played`, move(row.played)).def(`${prefix}WpPlayed`, fixed(again[row.played].wp, 0))
  g.def(`${prefix}PlayedSound`, row.scores[row.played].sound ? 'sound' : 'not sound')
  g.def(`${prefix}Aimed`, listText(b.aimedBy.map((s) => pieceText(c.fen, s)))).def(`${prefix}AimedOk`, yes(b.checks.aimed)).def(`${prefix}Undeveloped`, b.undeveloped.length ? `, with ${listText(b.undeveloped.map((s) => pieceText(c.fen, s)))} undeveloped` : '')
  g.def(`${prefix}Files`, listText(b.files.map((f) => `${f}-file`))).def(`${prefix}Rooks`, b.rooks === 0 ? 'he has no rook' : b.rooksReady.length ? listText(b.rooksReady.map((s) => pieceText(c.fen, s))) : 'none').def(`${prefix}RooksOk`, yes(b.checks.rooks))
  g.def(`${prefix}ForceUs`, String(b.force.us)).def(`${prefix}ForceThem`, String(b.force.them)).def(`${prefix}ForceOk`, yes(b.checks.force))
  g.block(`${prefix}Board`, arrows(c.fen, [[row.played, COLOR.his], [b.uci, b.sound ? COLOR.sound : COLOR.unsound]]))
}
await example('Ea', readyUnsound)
await example('Eb', rushedSound)
await engine.dispose?.()

g.write(join(HERE, 'generated.tex'))
console.error('break-ready: wrote paper/generated.tex')
process.exit(0)
