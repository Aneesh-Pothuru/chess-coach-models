#!/usr/bin/env node
// Writes paper/generated.tex for the structure's breaks: the rule's verdict and
// the descriptions (results/structure-breaks.json), the descriptions added after
// the run (results/descriptions.json), the data (results/positions.json, and
// positions-like-this's for his games), the design from the study's and the
// app's constants, and two positions from the private rows, rescored. It
// refuses to write when a claim the paper makes no longer holds.
//
//   bridge/run.sh projects/structure-breaks/paper/generate.mjs

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, esc, fixed, movesTex, percent, word } from '../../paper.mjs'
import { ABOVE, DRAWS, OFFSET } from '../../positions-like-this/lib.mjs'
import {
  BUDGET,
  CLOCK_FLOOR,
  MIN_CELL,
  MIN_LEGAL,
  MIN_MEN,
  MIN_POSITIONS,
  MONTH,
  PROJECT,
  SEED,
  SOURCE,
  STRONG_CANDIDATES,
  STRONG_POSITIONS,
  STRONG_TRIES,
  WIN_HIGH,
  WIN_LOW,
  argOf,
  readJsonl,
  rowsOf,
} from '../lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const E = await chess('src/services/engine/index.ts')
const N = await chess('src/adapters/node/engine/index.ts')
const C = await chess('src/core/chess/index.ts')
const Sc = await chess('src/core/score/index.ts')
const St = await chess('src/services/knowledge/catalogue/structures.ts')
const results = argOf('--results', resultsDir(PROJECT))
const read = (file, from = results) => JSON.parse(readFileSync(join(from, file), 'utf8'))
const out = read('structure-breaks.json')
const D = read('descriptions.json')
const P = read('positions.json')
const L = read('positions.json', resultsDir(SOURCE))
const dir = privateDir(PROJECT)
const Sm = JSON.parse(readFileSync(join(privateDir(SOURCE), `strong-${MONTH}.json`), 'utf8'))
const g = new Generated('projects/structure-breaks/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const count = (n) => n.toLocaleString('en-US')
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const dateText = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`
const pts = (x, d = 1) => percent(x, d)
const ciWords = (c, d = 1) => (c ? `${percent(c[0], d)} to ${percent(c[1], d)}` : '--')
const cellOf = (s, d = 1) => (s ? `${pts(s.value, d)} {\\scriptsize(${s.ci ? `${percent(s.ci[0], d)}, ${percent(s.ci[1], d)}` : '--'})}` : '--')
const wpCell = (s, d = 1) => (s ? `${fixed(s.value, d)} {\\scriptsize(${s.ci ? `${fixed(s.ci[0], d)}, ${fixed(s.ci[1], d)}` : '--'})}` : '--')
const HALF = ['First', 'Second']
const nameOf = (id) => {
  const name = St.structureById(id).name.replace(/^the /, '')
  return esc(name[0].toUpperCase() + name.slice(1))
}
const catalogueName = (id) => esc(St.structureById(id).name)
const leverTex = (lever) => esc(lever).replace(/^\.\.\./, '\\ldots{}')
const holds0 = (c) => c !== null && c[0] <= 0 && c[1] >= 0
const above0 = (c) => c !== null && c[0] > 0
const below0 = (c) => c !== null && c[1] < 0

// ---- the design ----
claim(P.app.commit === L.app.commit, "his positions are positions-like-this's, from the same app commit")
g.def('AppCommit', P.app.commit.slice(0, 10))
g.def('MinMen', word(MIN_MEN)).def('ClockFloor', String(CLOCK_FLOOR)).def('WinLow', String(WIN_LOW)).def('WinHigh', String(WIN_HIGH)).def('MinLegal', word(MIN_LEGAL))
g.def('Offset', String(OFFSET)).def('Above', String(ABOVE)).def('GradeNodes', count(E.budgetNodes(BUDGET, 'node'))).def('Window', String(E.ACCEPT_WINDOW_WP))
g.def('MinPositions', String(MIN_POSITIONS)).def('MinCell', String(MIN_CELL)).def('Draws', count(DRAWS)).def('Seed', String(SEED))
g.def('StrongTarget', count(STRONG_POSITIONS)).def('StrongDrawn', count(STRONG_CANDIDATES)).def('Tries', word(STRONG_TRIES))
claim([...St.HOLDER_WRITTEN].sort().join(' ') === 'hanging-pawns iqp queenside-majority', "the catalogue writes three structures from the holder's side")

// ---- the data ----
g.def('Games', count(L.games)).def('GamesFirst', count(L.halves[0])).def('GamesSecond', count(L.halves[1]))
g.def('FirstFrom', dateText(L.dates[0])).def('FirstTo', dateText(L.dates[1])).def('SecondFrom', dateText(L.dates[2])).def('SecondTo', dateText(L.dates[3]))
const sk = P.his.skipped
claim(P.his.candidates === L.candidates, 'this study reads every candidate position of positions-like-this')
claim(P.his.candidates - sk['no named structure'] - (sk['no break for his side'] ?? 0) - sk['break not on'] === P.his.breakOn, 'the positions left out and the positions kept add up to the candidates')
g.def('Candidates', count(P.his.candidates)).def('Named', count(P.his.candidates - sk['no named structure'])).def('NotOn', count(sk['break not on'])).def('NoLever', word(sk['no break for his side'] ?? 0))
g.def('BreakOn', count(P.his.breakOn)).def('BreakOnFirst', count(P.his.byHalf[0])).def('BreakOnSecond', count(P.his.byHalf[1]))
g.def('BreakGames', count(P.his.games[0] + P.his.games[1])).def('BreakGamesFirst', count(P.his.games[0])).def('BreakGamesSecond', count(P.his.games[1]))
g.def('NamedShare', pts((P.his.candidates - sk['no named structure']) / P.his.candidates, 0)).def('OnShare', pts(P.his.breakOn / (P.his.candidates - sk['no named structure']), 0))
const london = P.his.byStructure['london-pyramid']
claim(Object.values(P.his.byStructure).every((n) => n <= london), 'the London pyramid is his most common structure with the break on')
g.def('LondonOn', count(london)).def('LondonShare', pts(london / P.his.breakOn, 0))
claim(london / P.his.breakOn > 0.4 && london / P.his.breakOn < 0.6, 'about half of his positions with a break on are the London pyramid')
claim(Sm.month === MONTH, "the strong games are the month positions-like-this streamed")
g.def('MonthName', `${MONTHS[Number(MONTH.slice(5, 7)) - 1]} ${MONTH.slice(0, 4)}`).def('Floor', String(Sm.floor)).def('StreamCap', count(Sm.cap))
claim(P.strong.candidates === STRONG_CANDIDATES, 'the strong positions drawn reach their number')
g.def('StrongGamesRead', count(P.strong.gamesRead)).def('StrongNoStructure', count(P.strong.skipped['game: no position with a named structure'])).def('StrongNotOn', count(P.strong.skipped[`game: no break on in ${STRONG_TRIES} tries`]))
g.def('Blitz', count(P.strong.bySpeed.Blitz)).def('Rapid', count(P.strong.bySpeed.Rapid ?? 0)).def('Classical', count(P.strong.bySpeed.Classical ?? 0))
const strongTop = Object.entries(P.strong.byStructure).sort((a, b) => b[1] - a[1])[0]
claim(strongTop[0] === 'iqp', "the isolated queen's pawn is the strong players' most common structure with the break on")
g.def('StrongIqp', count(strongTop[1])).def('StrongIqpShare', pts(strongTop[1] / P.strong.candidates, 0))

// ---- the catalogue and the positions scored ----
const H = out.halves
const st = (h, k) => h.status?.[k] ?? 0
for (const [i, h] of H.entries()) {
  const x = HALF[i]
  claim(h.candidates === P.his.byHalf[i], `the report reads every position of the ${x.toLowerCase()} half with the break on`)
  g.def(`Scored${x}`, count(h.positions)).def(`ScoredGames${x}`, count(h.games)).def(`Forcing${x}`, count(st(h, 'forcing best'))).def(`Decided${x}`, count(st(h, 'decided')))
  g.def(`NoExact${x}`, count(st(h, 'no exact best'))).def(`NoOther${x}`, count(st(h, 'no other move'))).def(`Inexact${x}`, count(h.inexact))
}
const SS = out.strong
claim(SS.positions === STRONG_POSITIONS, 'the strong positions scored reach their target')
g.def('StrongScored', count(SS.positions)).def('StrongTried', count(SS.tried)).def('StrongForcing', count(st(SS, 'forcing best'))).def('StrongDecided', count(st(SS, 'decided'))).def('StrongInexact', count(SS.inexact))
g.def('ScoredAll', count(H[0].positions + H[1].positions))

const hisScored = new Map(out.byStructure.map((c) => [c.cell, c.positions]))
const strongScored = new Map(D.strongByStructure.map((c) => [c.structure, c.positions]))
const withBreaks = St.STRUCTURES.filter((s) => s.breaks.w.length || s.breaks.b.length)
const catalogueRows = withBreaks
  .map((s) => ({ s, on: P.his.byStructure[s.id] ?? 0 }))
  .sort((a, b) => b.on - a.on || a.s.id.localeCompare(b.s.id))
  .map(({ s, on }) => {
    const side = (list) => (list.length ? list.map(leverTex).join(', ') : '--')
    return `${nameOf(s.id)}${St.HOLDER_WRITTEN.has(s.id) ? '$^{*}$' : ''} & ${side(s.breaks.w)} & ${side(s.breaks.b)} & ${count(on)} & ${count(hisScored.get(s.id) ?? 0)} & ${count(P.strong.byStructure[s.id] ?? 0)} & ${count(strongScored.get(s.id) ?? 0)} \\\\`
  })
g.block(
  'CatalogueTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{@{}l>{\\raggedright\\arraybackslash}p{2.3cm}>{\\raggedright\\arraybackslash}p{3.3cm}rrrr@{}}',
    '\\toprule',
    '& \\multicolumn{2}{c}{The breaks the app teaches} & \\multicolumn{2}{c}{His positions} & \\multicolumn{2}{c}{Strong players\'} \\\\',
    '\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}\\cmidrule(lr){6-7}',
    'Structure & White & Black & Break on & Scored & Drawn & Scored \\\\',
    '\\midrule',
    ...catalogueRows,
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The app's structures with breaks, the breaks its catalogue teaches each side, and the positions with a break on: his, both halves, and the strong players' positions drawn, before the referee's quiet filter, and those scored. $^{*}$Written from the holder's side: White's column is the holder's breaks and Black's the other side's, and the app reads both with the ranks mirrored when Black holds the structure.}`,
    '\\label{tab:catalogue}',
    '\\end{table}',
  ].join('\n'),
)

// ---- the arms ----
const S0 = H[0].stats
const S1 = H[1].stats
const SX = SS.stats
const armRow = (name, a, b, c, f = cellOf) => `${name} & ${f(a)} & ${f(b)} & ${f(c)} \\\\`
g.block(
  'ArmTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{@{}llll@{}}',
    '\\toprule',
    '& His, first half & His, second half & Strong players \\\\',
    '\\midrule',
    `Positions (games) & ${count(H[0].positions)} (${count(H[0].games)}) & ${count(H[1].positions)} (${count(H[1].games)}) & ${count(SS.positions)} (${count(SS.positions)}) \\\\`,
    '\\midrule',
    armRow('B, the breaks', S0.B, S1.B, SX.B),
    armRow('A, his move; S, the strong player\'s', S0.A, S1.A, SX.S),
    armRow('N, Maia-2 at his band', S0.N, S1.N, null),
    armRow('U, the band above', S0.U, S1.U, null),
    armRow('R, a random move', S0.R, S1.R, SX.R),
    armRow('R2, a second random move', S0.R2, S1.R2, SX.R2),
    '\\midrule',
    armRow('Gain: B minus A, or S (points)', S0.gain, S1.gain, SX.BminusS),
    armRow('B minus N (points)', S0.BminusN, S1.BminusN, null),
    armRow('Control: A, or S, minus R (points)', S0.AminusR, S1.AminusR, SX.SminusR),
    armRow('Null: R2 minus R (points)', S0.R2minusR, S1.R2minusR, null),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The share of each arm's moves that are sound, in \\%, and the differences the rule reads, in points, with 95\\% intervals resampling his games, or the strong players' positions. A move is sound when it gives up no more than ${E.ACCEPT_WINDOW_WP} win\\% against Stockfish's best.}`,
    '\\label{tab:arms}',
    '\\end{table}',
  ].join('\n'),
)

g.block(
  'MoreTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{@{}llll@{}}',
    '\\toprule',
    '& His, first half & His, second half & Strong players \\\\',
    '\\midrule',
    armRow('Win\\% given up: the breaks', S0.lostB, S1.lostB, SX.lostB, wpCell),
    armRow('Win\\% given up: the move played', S0.lostA, S1.lostA, SX.lostS, wpCell),
    armRow('The breaks that are the best (\\%)', S0.bestB, S1.bestB, SX.bestB),
    '\\midrule',
    armRow('He, or they, played a break (\\%)', S0.playedBreak, S1.playedBreak, SX.playedBreak),
    armRow('Maia-2 at his band gives the breaks (\\%)', S0.massHis, S1.massHis, null),
    armRow('At the band above (\\%)', S0.massPlus, S1.massPlus, null),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The mean win\\% the breaks and the move played give up against Stockfish's best (a move that scores above the best gives up none), the share of breaks that are the best, and how often a break is found: how often the move played was a break, and the probability Maia-2 gives the breaks together at his band and at the band above. 95\\% intervals.}`,
    '\\label{tab:more}',
    '\\end{table}',
  ].join('\n'),
)

const cellRow = (name, c) => `${name} & ${count(c.positions)} & ${count(c.games)} & ${c.stats ? `${cellOf(c.stats.B)} & ${cellOf(c.stats.A)} & ${cellOf(c.stats.gain)}` : `\\multicolumn{3}{l}{not enough data ($n=${c.positions}$)}`} \\\\`
g.block(
  'StructureTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{@{}lrrlll@{}}',
    '\\toprule',
    'Structure & Positions & Games & B (\\%) & A (\\%) & Gain (points) \\\\',
    '\\midrule',
    ...out.byStructure.map((c) => cellRow(nameOf(c.cell), c)),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{His positions by structure, both halves together: the share of the breaks and of his moves that are sound, and the gain, with 95\\% intervals, for each structure with at least ${MIN_CELL} scored positions.}`,
    '\\label{tab:structure}',
    '\\end{table}',
  ].join('\n'),
)

const PHASE = { middlegame: 'Middlegame', endgame: 'Endgame' }
const phase = Object.fromEntries(out.byPhase.map((c) => [c.cell, c]))
const chance = Object.fromEntries(out.firstChance.map((c) => [String(c.cell), c]))
claim(Object.keys(phase).sort().join(' ') === 'endgame middlegame' && Object.keys(chance).sort().join(' ') === 'first later', 'the phases are the middlegame and the endgame, and the chances the first and the later ones')
const notRow = (h) => {
  const s = out.notPlayed[h]
  return `His move not a break, ${HALF[h].toLowerCase()} half & ${count(s.n)} & ${count(s.units)} & ${cellOf(s.B)} & ${cellOf(s.A)} & ${cellOf(s.gain)} \\\\`
}
g.block(
  'SplitTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{@{}lrrlll@{}}',
    '\\toprule',
    'His positions & Positions & Games & B (\\%) & A (\\%) & Gain (points) \\\\',
    '\\midrule',
    cellRow(PHASE.middlegame, phase.middlegame),
    cellRow(PHASE.endgame, phase.endgame),
    '\\midrule',
    cellRow('The first chance in a game', chance.first),
    cellRow('Later chances', chance.later),
    '\\midrule',
    notRow(0),
    notRow(1),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{His positions by the divider's phase and by whether the position is the first in its game with a break on, both halves together, and his positions where his move was not a break, by half: the share of the breaks and of his moves that are sound, and the gain, with 95\\% intervals.}`,
    '\\label{tab:splits}',
    '\\end{table}',
  ].join('\n'),
)

// ---- the controls and the verdict ----
const controls = out.controls
g.def('Verdict', esc(out.verdict))
for (const [i, s] of [S0, S1].entries()) {
  const x = HALF[i]
  g.def(`B${x}`, pts(s.B.value)).def(`A${x}`, pts(s.A.value)).def(`N${x}`, pts(s.N.value)).def(`U${x}`, pts(s.U.value)).def(`R${x}`, pts(s.R.value)).def(`RTwo${x}`, pts(s.R2.value))
  g.def(`Gain${x}`, pts(s.gain.value)).def(`Gain${x}Ci`, ciWords(s.gain.ci)).def(`BN${x}`, pts(s.BminusN.value)).def(`BNCi${x}`, ciWords(s.BminusN.ci))
  g.def(`Control${x}`, pts(s.AminusR.value)).def(`Control${x}Ci`, ciWords(s.AminusR.ci)).def(`Null${x}`, pts(s.R2minusR.value)).def(`Null${x}Ci`, ciWords(s.R2minusR.ci))
  g.def(`LostB${x}`, fixed(s.lostB.value, 1)).def(`LostA${x}`, fixed(s.lostA.value, 1)).def(`BestB${x}`, pts(s.bestB.value))
  g.def(`Played${x}`, pts(s.playedBreak.value)).def(`MassHis${x}`, pts(s.massHis.value)).def(`MassPlus${x}`, pts(s.massPlus.value))
}
g.def('StrongB', pts(SX.B.value)).def('StrongS', pts(SX.S.value)).def('StrongR', pts(SX.R.value)).def('StrongRTwo', pts(SX.R2.value))
g.def('StrongGain', pts(SX.BminusS.value)).def('StrongGainCi', ciWords(SX.BminusS.ci)).def('StrongControl', pts(SX.SminusR.value)).def('StrongControlCi', ciWords(SX.SminusR.ci))
g.def('StrongLostB', fixed(SX.lostB.value, 1)).def('StrongLostS', fixed(SX.lostS.value, 1)).def('StrongBestB', pts(SX.bestB.value)).def('StrongPlayed', pts(SX.playedBreak.value))

claim(out.verdict === 'the break misleads' && out.enough, 'each half has enough positions and the verdict is that the break misleads')
claim(controls.tellsApartPassed && controls.nullPassed, 'both controls pass')
claim([S0, S1].every((s) => above0(s.AminusR.ci) && holds0(s.R2minusR.ci) && below0(s.gain.ci)) && above0(SX.SminusR.ci), "the control lies above 0, the null holds 0 and the gain lies below 0 on both halves")
claim([H[0], H[1]].every((h) => h.inexact === 0 && !h.status['no exact best']) && SS.inexact === 0 && !SS.status['no exact best'], 'every score was exact')
claim([S0, S1].every((s) => s.B.value > 0.15 && s.B.value < 0.25 && s.A.value > 0.5), 'a break is sound about one time in five and his move more than half the time')
claim([S0, S1].every((s) => s.N.value > s.A.value && s.U.value > s.A.value), "Maia-2's most likely moves are sound more often than his own")
claim([S0, S1].every((s) => s.lostB.value / s.lostA.value > 2.5 && s.lostB.value / s.lostA.value < 3.5), 'the breaks give up about three times what his moves give up')

// ---- the descriptions by structure, phase and chance ----
for (const c of out.byStructure) {
  if (!c.stats) continue
  const key = c.cell.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase()).replace(/^[a-z]/, (ch) => ch.toUpperCase())
  g.def(`Struct${key}B`, pts(c.stats.B.value)).def(`Struct${key}A`, pts(c.stats.A.value)).def(`Struct${key}Gain`, pts(c.stats.gain.value)).def(`Struct${key}N`, count(c.positions))
}
g.def('MidB', pts(phase.middlegame.stats.B.value)).def('MidA', pts(phase.middlegame.stats.A.value)).def('MidGain', pts(phase.middlegame.stats.gain.value))
g.def('EndB', pts(phase.endgame.stats.B.value)).def('EndA', pts(phase.endgame.stats.A.value)).def('EndGain', pts(phase.endgame.stats.gain.value)).def('EndN', count(phase.endgame.positions))
g.def('FirstB', pts(chance.first.stats.B.value)).def('FirstA', pts(chance.first.stats.A.value)).def('FirstGain', pts(chance.first.stats.gain.value))
g.def('LaterB', pts(chance.later.stats.B.value)).def('LaterA', pts(chance.later.stats.A.value)).def('LaterGain', pts(chance.later.stats.gain.value))
for (const [h, s] of out.notPlayed.entries()) g.def(`NotPlayed${HALF[h]}`, count(s.n)).def(`NotPlayedGain${HALF[h]}`, pts(s.gain.value)).def(`NotPlayedB${HALF[h]}`, pts(s.B.value))
const enoughCells = out.byStructure.filter((c) => c.stats)
claim(['london-pyramid', 'iqp', 'carlsbad-reversed', 'advance-chain'].every((id) => enoughCells.some((c) => c.cell === id)), 'the four structures the text names have enough positions')
claim(enoughCells.every((c) => below0(c.stats.gain.ci)), "in each structure with enough positions the gain's interval lies below 0")
claim(below0(phase.endgame.stats.gain.ci) && below0(phase.middlegame.stats.gain.ci), 'the breaks trail his move in the middlegame and in the endgame')
const covers = (a, b) => a.ci[0] <= b.value && a.ci[1] >= b.value
claim(covers(chance.first.stats.B, chance.later.stats.B) && covers(chance.later.stats.B, chance.first.stats.B), "the first chance's breaks are sound about as often as the later ones'")
claim(SX.B.value < 0.35 && below0(SX.BminusS.ci), "the strong players' breaks are rarely sound and trail their own moves")
claim(SX.BminusS.ci[1] < Math.min(S0.gain.value, S1.gain.value), "the strong players' breaks trail their own moves by more than his trail his")

// ---- added after the run ----
const some = D.some
for (const [h, s] of some.his.entries()) g.def(`Some${HALF[h]}`, pts(s.any.value)).def(`SomeMinus${HALF[h]}`, pts(s.anyMinusA.value)).def(`SomeMinus${HALF[h]}Ci`, ciWords(s.anyMinusA.ci))
for (const [h, s] of some.his.entries()) g.def(`BR${HALF[h]}`, pts(s.BminusR.value)).def(`BR${HALF[h]}Ci`, ciWords(s.BminusR.ci))
g.def('StrongBR', pts(some.strong.BminusR.value)).def('StrongBRCi', ciWords(some.strong.BminusR.ci))
claim(above0(some.strong.BminusR.ci) && some.strong.BminusR.value < 0.1, "the strong players' breaks are sound a few points more often than a random move")
g.def('StrongSome', pts(some.strong.any.value)).def('StrongSomeMinus', pts(some.strong.anyMinusS.value)).def('StrongSomeMinusCi', ciWords(some.strong.anyMinusS.ci))
const WP = D.whenPlayed
const WB = D.whenBest
claim(WP.strong.played.sound.ci[0] > WP.strong.notPlayed.B.ci[1], 'the breaks strong players played were sound more often than the ones they passed over')
g.def('PlayedN', count(WP.his.played.n)).def('PlayedSound', pts(WP.his.played.sound.value)).def('PlayedSoundCi', ciWords(WP.his.played.sound.ci))
g.def('NotPlayedB', pts(WP.his.notPlayed.B.value)).def('NotPlayedBCi', ciWords(WP.his.notPlayed.B.ci))
g.def('StrongPlayedN', count(WP.strong.played.n)).def('StrongPlayedSound', pts(WP.strong.played.sound.value)).def('StrongNotPlayedB', pts(WP.strong.notPlayed.B.value))
g.def('BestN', count(WB.his.best.n)).def('BestShare', pts(WB.his.best.n / (WB.his.best.n + WB.his.notBest.n)))
g.def('BestPlayed', pts(WB.his.best.playedBreak.value)).def('BestPlayedCi', ciWords(WB.his.best.playedBreak.ci)).def('NotBestPlayed', pts(WB.his.notBest.playedBreak.value))
g.def('BestMass', pts(WB.his.best.massHis.value)).def('NotBestMass', pts(WB.his.notBest.massHis.value)).def('BestMassPlus', pts(WB.his.best.massPlus.value)).def('NotBestMassPlus', pts(WB.his.notBest.massPlus.value))
g.def('StrongBestN', count(WB.strong.best.n)).def('StrongBestPlayed', pts(WB.strong.best.playedBreak.value)).def('StrongNotBestPlayed', pts(WB.strong.notBest.playedBreak.value))
const whenRow = (name, s, keys) => `${name} & ${count(s.n)} & ${keys.map((k) => (k && s[k] ? cellOf(s[k]) : '--')).join(' & ')} \\\\`
const head = (text) => `\\begin{tabular}[b]{@{}l@{}}${text.split('|').join(' \\\\ ')}\\end{tabular}`
g.block(
  'MomentTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{@{}lrllll@{}}',
    '\\toprule',
    `Positions & $n$ & ${head('Played|a break')} & ${head('Played|the best')} & ${head('Maia-2 gives the|breaks, his band')} & ${head('The band|above')} \\\\`,
    '\\midrule',
    whenRow('His, a break is the best', WB.his.best, ['playedBreak', 'playedBest', 'massHis', 'massPlus']),
    whenRow('His, no break is the best', WB.his.notBest, ['playedBreak', 'playedBest', 'massHis', 'massPlus']),
    whenRow('Strong, a break is the best', WB.strong.best, ['playedBreak', 'playedBest', null, null]),
    whenRow('Strong, no break is the best', WB.strong.notBest, ['playedBreak', 'playedBest', null, null]),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Added after the run. His positions, both halves together, and the strong players', where a break is Stockfish's best and where none is: how often the move played was a break and was the best, and the probability Maia-2 gives the breaks together. In \\%, with 95\\% intervals.}`,
    '\\label{tab:moment}',
    '\\end{table}',
  ].join('\n'),
)
g.block(
  'ChoiceTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{@{}lrllll@{}}',
    '\\toprule',
    `Positions & $n$ & ${head('Some break|sound')} & ${head('The move|played, sound')} & ${head('Difference|(points)')} & ${head('B minus R|(points)')} \\\\`,
    '\\midrule',
    ...some.his.map((s, h) => `His, ${HALF[h].toLowerCase()} half & ${count(s.n)} & ${cellOf(s.any)} & ${cellOf(s.A)} & ${cellOf(s.anyMinusA)} & ${cellOf(s.BminusR)} \\\\`),
    `Strong players & ${count(some.strong.n)} & ${cellOf(some.strong.any)} & ${cellOf(some.strong.S)} & ${cellOf(some.strong.anyMinusS)} & ${cellOf(some.strong.BminusR)} \\\\`,
    '\\midrule',
    `& & ${head('The break|played, sound')} & ${head('The breaks,|sound')} & ${head('The move|played, sound')} & \\\\`,
    '\\midrule',
    whenRow('His, played one', WP.his.played, ['sound', 'B', null, null]),
    whenRow('His, did not', WP.his.notPlayed, [null, 'B', 'A', null]),
    whenRow('Strong, played one', WP.strong.played, ['sound', 'B', null, null]),
    whenRow('Strong, did not', WP.strong.notPlayed, [null, 'B', 'S', null]),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Added after the run. Above, the share of positions where at least one break is sound, against the share where the move played is, and the breaks' soundness minus a random move's, paired by position. Below, his positions, both halves together, and the strong players', where the move played was a break or was not: the share of the breaks played that are sound, of all the breaks, and of the moves played. In \\%, with 95\\% intervals.}`,
    '\\label{tab:choice}',
    '\\end{table}',
  ].join('\n'),
)

claim(some.his.every((s) => holds0(s.BminusR.ci) && s.BminusR.value > 0), 'the breaks are sound a little more often than a random move, within the noise, on both halves')
claim(WB.his.best.n / (WB.his.best.n + WB.his.notBest.n) > 0.08 && WB.his.best.n / (WB.his.best.n + WB.his.notBest.n) < 0.12, 'a break is the best in about one position in ten')
claim(WB.his.best.playedBreak.value > 0.2 && WB.his.best.playedBreak.value < 0.3, 'where a break is the best he played one about one time in four')
claim(WB.his.best.playedBreak.ci[0] > WB.his.notBest.playedBreak.ci[1] && WB.his.best.massHis.ci[0] > WB.his.notBest.massHis.ci[1], 'he and Maia-2 at his band play a break more often where one is the best')
claim(WB.his.best.playedBreak.value < 0.5 && WB.his.best.massHis.value < 0.5, 'he and his band miss the break most of the time where it is the best')
claim(WB.strong.best.playedBreak.value > WB.strong.notBest.playedBreak.value, 'strong players play a break more often where one is the best')
claim([S0, S1].every((s) => covers(WP.his.played.sound, s.A)), 'the breaks he played were sound about as often as his moves are')
claim(WP.his.played.sound.ci[0] > WP.his.notPlayed.B.ci[1], 'the breaks he played were sound more often than the ones he passed over')
const leverKey = (c) => `${c.structure}|${c.lever}`
const hisLevers = new Map(D.levers.his.map((c) => [leverKey(c), c]))
const strongLevers = new Map(D.levers.strong.map((c) => [leverKey(c), c]))
const leverKeys = [...new Set([...D.levers.his, ...D.levers.strong].filter((c) => c.stats).map(leverKey))].sort(
  (a, b) => (hisLevers.get(b)?.positions ?? 0) - (hisLevers.get(a)?.positions ?? 0) || (strongLevers.get(b)?.positions ?? 0) - (strongLevers.get(a)?.positions ?? 0) || a.localeCompare(b),
)
const leverCells = (c) => (c ? `${count(c.positions)} & ${c.stats ? `${cellOf(c.stats.L)} & ${pts(c.stats.own.value)}` : '-- & --'}` : '0 & -- & --')
g.block(
  'LeverTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{@{}>{\\raggedright\\arraybackslash}p{2.4cm}>{\\raggedright\\arraybackslash}p{2.3cm}rlrrlr@{}}',
    '\\toprule',
    '& & \\multicolumn{3}{c}{His positions} & \\multicolumn{3}{c}{Strong players\'} \\\\',
    '\\cmidrule(lr){3-5}\\cmidrule(lr){6-8}',
    'Structure & Break & $n$ & The break & His move & $n$ & The break & Their move \\\\',
    '\\midrule',
    ...leverKeys.map((k) => {
      const [structure, lever] = k.split('|')
      return `${nameOf(structure)} & ${leverTex(lever)} & ${leverCells(hisLevers.get(k))} & ${leverCells(strongLevers.get(k))} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Added after the run. Each break the catalogue teaches, apart, where it is on in at least ${MIN_CELL} of his positions (both halves) or of the strong players': the positions, the share of the break's moves that are sound, with its 95\\% interval, and the share of the moves played there that are, in \\%. Each break is the catalogue's text as the app reads it for the side to move: for a structure written from the holder's side, with the ranks mirrored when Black holds the structure.}`,
    '\\label{tab:levers}',
    '\\end{table}',
  ].join('\n'),
)

const WORDS = ['One', 'Two', 'Three', 'Four']
const leverDefs = (prefix, list) =>
  list
    .filter((c) => c.stats)
    .slice(0, WORDS.length)
    .forEach((c, i) => {
      const k = `${prefix}${WORDS[i]}`
      g.def(`${k}Structure`, catalogueName(c.structure)).def(`${k}Break`, leverTex(c.lever)).def(`${k}N`, count(c.positions))
      g.def(`${k}L`, pts(c.stats.L.value)).def(`${k}Own`, pts(c.stats.own.value))
    })
leverDefs('Lev', D.levers.his)
leverDefs('StrongLev', D.levers.strong)
claim(D.levers.his.filter((c) => c.stats).length >= WORDS.length && D.levers.strong.some((c) => c.stats), 'the text names four of his breaks and one of the strong players\'')
claim([...D.levers.his, ...D.levers.strong].filter((c) => c.stats).every((c) => c.stats.L.value < c.stats.own.value), 'no break with enough positions is sound as often as the move played')

g.block(
  'StrongStructureTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{@{}lrlll@{}}',
    '\\toprule',
    'Structure & Positions & B (\\%) & S (\\%) & B minus S (points) \\\\',
    '\\midrule',
    ...D.strongByStructure.map((c) => `${nameOf(c.structure)} & ${count(c.positions)} & ${c.stats ? `${cellOf(c.stats.B)} & ${cellOf(c.stats.S)} & ${cellOf(c.stats.gain)}` : `\\multicolumn{3}{l}{not enough data ($n=${c.positions}$)}`} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Added after the run. The strong players' positions by structure: the share of the breaks and of their moves that are sound, and the difference, with 95\\% intervals, for each structure with at least ${MIN_CELL} scored positions.}`,
    '\\label{tab:strongstructure}',
    '\\end{table}',
  ].join('\n'),
)

// ---- two positions ----
const hisRows = rowsOf(dir, 'his', readdirSync).scored
claim(hisRows.length === H[0].positions + H[1].positions, 'the private rows are the positions the report counted')
const cand = new Map(readJsonl(join(dir, 'his-candidates.jsonl')).map((c) => [c.id, c]))
const firstOf = (keep) => [1, 0].map((h) => hisRows.filter((r) => r.half === h && keep(r)).sort((a, b) => a.id - b.id)[0]).find(Boolean) ?? null
const rowA = firstOf((r) => r.breaks.includes(r.best) && !r.breaks.includes(r.played) && !r.scores[r.played].sound)
const rowB = firstOf((r) => r.structure === 'london-pyramid' && r.breaks.every((m) => !r.scores[m].sound) && r.scores[r.played].sound)
claim(rowA && rowB, 'both examples exist')
g.def('EaHalf', HALF[rowA.half].toLowerCase()).def('EbHalf', HALF[rowB.half].toLowerCase())
const asSide = (id, side) => [...cand.values()].filter((c) => c.structure === id && c.fen.split(' ')[1] === side).length
claim([...cand.values()].length === P.his.breakOn, 'the private candidates are the positions with the break on')
const londonWhite = asSide('london-pyramid', 'w')
claim(londonWhite > 0.9 * london, 'almost all of his London pyramid positions have him as White')
const blackShare = ['carlsbad-reversed', 'advance-chain'].map((id) => asSide(id, 'b') / P.his.byStructure[id])
claim(blackShare.every((x) => x > 0.9), 'almost all of his reversed Carlsbad and advance chain positions have him as Black')
g.def('LondonWhite', count(londonWhite))
const engine = N.createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false, pool: 1 })
const SIDE = { w: 'White', b: 'Black' }
const sanOf = (fen, uci) => new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
const COLOR = { sound: 'green!50!black', unsound: 'red!75!black', his: 'blue!70!black' }
const arrows = (fen, marks) =>
  `\\chessboard[setfen={${fen}}, boardfontsize=14pt, ${marks.map(([uci, color]) => `pgfstyle=straightmove, arrow=to, linewidth=0.07em, color=${color}, markmoves={${uci.slice(0, 2)}-${uci.slice(2, 4)}}`).join(', ')}]`
async function example(prefix, row) {
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
  claim(Object.keys(row.scores).every((u) => again[u].sound === row.scores[u].sound), `${prefix}: every move's soundness is the run's`)
  const bestWp = Sc.winPercentFor(best.eval, turn)
  claim(Math.abs(bestWp - row.wp) < 0.5, `${prefix}: the best move's win% is the run's`)
  const move = (uci) => movesTex(c.fen, [sanOf(c.fen, uci)])
  const breakText = row.breaks.map((m) => `${move(m)} (${row.scores[m].sound ? 'sound' : 'not sound'}, ${fixed(again[m].wp, 0)}\\%)`)
  g.def(`${prefix}Fen`, `\\fen{${c.fen}}`).def(`${prefix}Mover`, SIDE[turn]).def(`${prefix}Phase`, row.phase).def(`${prefix}Structure`, catalogueName(row.structure))
  g.def(`${prefix}Breaks`, breakText.length > 1 ? `${breakText.slice(0, -1).join(', ')} and ${breakText.at(-1)}` : breakText[0]).def(`${prefix}BreakLabel`, row.breaks.length > 1 ? 'The breaks' : 'The break')
  g.def(`${prefix}Best`, move(row.best)).def(`${prefix}WpBest`, fixed(bestWp, 0)).def(`${prefix}Played`, move(row.played)).def(`${prefix}WpPlayed`, fixed(again[row.played].wp, 0))
  g.def(`${prefix}PlayedSound`, row.scores[row.played].sound ? 'sound' : 'not sound').def(`${prefix}Lost`, fixed(again[row.played].wp - bestWp, 0))
  g.block(`${prefix}Board`, arrows(c.fen, [[row.played, COLOR.his], ...row.breaks.map((m) => [m, row.scores[m].sound ? COLOR.sound : COLOR.unsound])]))
  return { row, c, again, bestWp }
}
await example('Ea', rowA)
await example('Eb', rowB)
await engine.dispose?.()

g.write(join(HERE, 'generated.tex'))
console.error('structure-breaks: wrote paper/generated.tex')
process.exit(0)
