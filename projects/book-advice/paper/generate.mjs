#!/usr/bin/env node
// Writes paper/generated.tex for the book-advice paper from what its nine
// tests wrote (results/*.json). It refuses to write when a claim the paper
// makes no longer holds.
//
//   bridge/run.sh projects/book-advice/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, esc, fixed, percent, word } from '../../paper.mjs'
import { ABOVE, GIFT_FLOOR, HIGH_WP, HIS, SWING_PLIES, SWING_WP } from '../lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (f) => JSON.parse(readFileSync(join(resultsDir('book-advice'), f), 'utf8'))
const g = new Generated('projects/book-advice/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const count = (n) => n.toLocaleString('en-US')
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase())
/** A share as a percentage. */
const pc = (s, d = 1) => percent(s.p, d)
/** A share with its 95% interval: "12.4\% (11.7--13.2)". */
const pci = (s, d = 1) => (s.p === null ? '--' : `${percent(s.p, d)}\\% {\\footnotesize (${percent(s.ci[0], d)}--${percent(s.ci[1], d)})}`)
/** A share's count: "31 of 1,094". */
const of = (s) => `${count(s.k)} of ${count(s.n)}`
const apart = (a, b) => a.ci[1] < b.ci[0] || b.ci[1] < a.ci[0]
const inside = (x, s) => x >= s.ci[0] && x <= s.ci[1]
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
const listed = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
const GROUPS = ['his', 'above', 'archive']

// ---- the data ----
const scan = read('scan.json')
const conversion = read('conversion.json')
const APP = conversion.app
for (const f of ['scan.json', 'after-error.json', 'king.json', 'king-notes.json', 'trades.json', 'practical.json', 'capstones.json', 'budgets.json']) claim(read(f).app === APP, `${f} measured the same app commit`)
const BUDGET_NODES = read('budgets.json').nodes
const nodes = (budget) => count(BUDGET_NODES[budget])
const monthName = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
g.def('AppCommit', APP.slice(0, 10)).def('Month', monthName(scan.month))
g.def('PlayerGamesRead', count(scan.playerGamesRead)).def('GamesRead', count(scan.playerGamesRead / 2))
g.def('ArchiveGames', count(scan.archive.games))
const C = scan.counts
g.def('HisPlayerGames', count(C.his.king.playerGames)).def('AbovePlayerGames', count(C.above.king.playerGames))
g.def('HisLo', String(HIS[0])).def('HisHi', String(HIS[1])).def('AboveLo', String(ABOVE[0])).def('AboveHi', String(ABOVE[1]))
g.def('CheckNodes', nodes('check')).def('BestNodes', nodes('best')).def('VerifyNodes', nodes('verify')).def('GradeNodes', nodes('grade')).def('PlanNodes', nodes('plan'))
g.def('GiftFloor', String(GIFT_FLOOR)).def('HighWp', String(HIGH_WP)).def('SwingPlies', word(SWING_PLIES)).def('SwingWp', String(SWING_WP))

// ---- 1a: the move after their mistake ----
const AE = read('after-error.json')
const A = AE.groups
for (const grp of GROUPS) {
  const k = cap(grp)
  const x = A[grp].all
  g.def(`OneA${k}Events`, count(x.events)).def(`OneA${k}Punished`, pc(x.punished)).def(`OneA${k}Trap`, pc(x.trap)).def(`OneA${k}Missed`, pc(x.missed))
  g.def(`OneA${k}TrapOfFailures`, pci(x.trapOfFailures)).def(`OneA${k}MissedOfFailures`, pci(x.missedOfFailures))
  const y = A[grp].gift20
  g.def(`OneA${k}GiftTrapOfFailures`, pci(y.trapOfFailures)).def(`OneA${k}GiftPunished`, pc(y.punished))
  const p = A[grp].afterPunish
  g.def(`OneA${k}NextSerious`, pci(p.nextSerious)).def(`OneA${k}HighOtherSerious`, pci(p.highOtherSerious))
}
g.block(
  'OneATable',
  [
    '\\begin{tabular}{lrrrrll}',
    '\\toprule',
    ' & & \\multicolumn{3}{c}{share of the replies} & \\multicolumn{2}{c}{share of the failures} \\\\',
    '\\cmidrule(lr){3-5}\\cmidrule(lr){6-7}',
    'players & replies & punished & a trap taken & missed & a trap taken & missed \\\\',
    '\\midrule',
    ...[
      ['his band', 'his'],
      ['the band above', 'above'],
      ['his games', 'archive'],
    ].map(([label, grp]) => {
      const x = A[grp].all
      return `${label} & ${count(x.events)} & ${pc(x.punished)}\\% & ${pc(x.trap)}\\% & ${pc(x.missed)}\\% & ${pci(x.trapOfFailures)} & ${pci(x.missedOfFailures)} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
const trapsReal = A.his.all.trapOfFailures.p >= 0.1 || A.archive.all.trapOfFailures.ci[0] >= 0.1
const missesDominate = A.his.all.missedOfFailures.p >= 2 / 3
claim(trapsReal && A.his.all.trapOfFailures.ci[0] >= 0.1 && A.archive.all.trapOfFailures.ci[0] >= 0.1, 'traps are a real share, in his band and in his games alike')
claim(missesDominate && A.archive.all.missedOfFailures.p >= 2 / 3, 'misses dominate, in his band and in his games alike')
claim(GROUPS.every((grp) => A[grp].gift20.trapOfFailures.p > A[grp].all.trapOfFailures.p), "on the punish goal's own gifts (20 win% or more) traps are a larger share of the failures")
claim(GROUPS.every((grp) => apart(A[grp].afterPunish.nextSerious, A[grp].afterPunish.highOtherSerious) && A[grp].afterPunish.nextSerious.p > 1.8 * A[grp].afterPunish.highOtherSerious.p), 'after punishing, the next move is a serious error about twice as often as other moves at 75 win% or more')

claim(AE.engine?.app === APP && AE.engine.budget === 'best', "1a's engine pass ran at the same app commit, at the app's best budget")
const KINDS = ['hangingPiece', 'mate', 'fork', 'pinSkewerDiscovered', 'attackingF2F7', 'defensiveMove', 'unnamed']
const KIND_NAME = {
  hangingPiece: 'the hanging piece',
  mate: 'a mate',
  fork: 'a fork',
  pinSkewerDiscovered: 'a pin, skewer or discovered attack',
  attackingF2F7: 'the f2 or f7 strike',
  defensiveMove: 'saving a loose piece of his own',
  unnamed: 'a move it does not name',
}
const ADDS = ['mate', 'fork', 'pinSkewerDiscovered']
const ADDED = ADDS.filter((k) => A.his.missedKinds[k].p >= 0.1)
g.def('OneASampleMisses', count(AE.engine.sample.misses)).def('OneASampleOffers', count(AE.engine.sample.offers))
for (const grp of GROUPS) {
  const k = cap(grp)
  const x = A[grp]
  claim(same(Object.keys(x.missedKinds), KINDS), `${grp}: the seven kinds`)
  const named = KINDS.reduce((a, kind) => a + x.missedKinds[kind].k, 0)
  claim(named === x.missesSearched, `${grp}: every searched miss has one kind`)
  g.def(`OneA${k}MissesSearched`, count(x.missesSearched))
  for (const kind of KINDS) g.def(`OneA${k}Kind${kind === 'attackingF2F7' ? 'Strike' : cap(kind)}`, pci(x.missedKinds[kind]))
  g.def(`OneA${k}OfferedSearched`, count(x.offered.searched)).def(`OneA${k}OfferedTraps`, pci(x.offered.traps)).def(`OneA${k}TookTrap`, pci(x.offered.tookTrap)).def(`OneA${k}LeftGift`, pci(x.offered.leftGift))
  for (const p of ['n', 'b', 'r', 'q']) g.def(`OneA${k}OfferedTrap${{ n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen' }[p]}`, pci(x.offered.byPiece[p]))
}
claim(ADDED.length === 0, 'no kind of punishment beyond the hanging piece names one miss in ten in his band')
claim(['his', 'above'].every((grp) => { const t = A[grp].offered.byPiece; return t.n.p > t.b.p && t.b.p > t.r.p && t.r.p > t.q.p }), 'an offered knight is a trap most often and an offered queen least often, in both bands')
claim(A.his.offered.leftGift.k > A.his.offered.tookTrap.k, 'in his band more gifts were left than traps taken')
g.def('OneAHisTrapShare', pc(A.his.all.trapOfFailures, 0)).def('OneAHisPunishedShare', pc(A.his.all.punished, 0))
g.block(
  'OneAKindsTable',
  [
    '\\begin{tabular}{llll}',
    '\\toprule',
    "the engine's best reply & his band & the band above & his games \\\\",
    '\\midrule',
    `misses searched & ${GROUPS.map((grp) => count(A[grp].missesSearched)).join(' & ')} \\\\`,
    '\\midrule',
    ...KINDS.map((kind) => `${KIND_NAME[kind]} & ${GROUPS.map((grp) => pci(A[grp].missedKinds[kind])).join(' & ')} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)

// ---- 1b: danger to his own king ----
const KJ = read('king.json')
const KN = read('king-notes.json')
const SIGNS = Object.keys(KJ.groups.his.signs).filter((s) => s !== 'any')
const SIGN_NAME = {
  noSafeSquares: 'no safe squares',
  queenOnExits: 'queen on the exits',
  bishopAimedIn: 'bishop aimed in',
  approachingKnight: 'approaching knight',
  rookLift: 'rook lift',
  hookPawn: 'hook pawn',
  oppositeStorm: 'opposite-side storm',
  plusTwo: 'plus two',
}
claim(SIGNS.every((s) => SIGN_NAME[s]) && SIGNS.length === 8, 'eight signs, each named')
const KB = KJ.bar
g.def('KingShowsBar', percent(KB.shows, 0)).def('KingLiftBar', fixed(KB.lift, 1)).def('KingFloorBar', fixed(KB.floor, 2))
for (const grp of GROUPS) g.def(`King${cap(grp)}Positions`, count(KJ.groups[grp].positions)).def(`King${cap(grp)}Base`, pci(KJ.groups[grp].base.danger))
g.def('KingHisMateBase', pc(KJ.groups.his.base.mateThreat)).def('KingHisSwingBase', pc(KJ.groups.his.base.swing))
const lift = (x) => fixed(x, 2)
g.block(
  'KingTable',
  [
    '\\begin{tabular}{lrlrcrr}',
    '\\toprule',
    ' & \\multicolumn{4}{c}{his band} & above & his games \\\\',
    '\\cmidrule(lr){2-5}',
    'sign & shows & dangerous when shown & lift & clears & lift & lift \\\\',
    '\\midrule',
    `every position & & ${pci(KJ.groups.his.base.danger)} & & & & \\\\`,
    '\\midrule',
    ...SIGNS.map((s) => {
      const h = KJ.groups.his.signs[s]
      return `${SIGN_NAME[s]} & ${pc(h.shows)}\\% & ${pci(h.danger.precision)} & ${lift(h.danger.lift)} & ${h.clears ? 'yes' : 'no'} & ${lift(KJ.groups.above.signs[s].danger.lift)} & ${lift(KJ.groups.archive.signs[s].danger.lift)} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
const CLEARED = SIGNS.filter((s) => KJ.groups.his.signs[s].clears)
claim(SIGNS.every((s) => s === 'queenOnExits' || KJ.groups.his.signs[s].danger.lift < KJ.groups.his.signs.queenOnExits.danger.lift), 'the queen on the exits lifts the danger rate most')
claim(same(KJ.warnings, CLEARED), "king.json's warnings are the signs that clear the bar")
claim(same([...CLEARED].sort(), ['noSafeSquares', 'plusTwo', 'queenOnExits', 'rookLift']), 'four signs clear the bar: no safe squares, queen on the exits, rook lift and plus two')
g.def('KingCleared', word(CLEARED.length)).def('KingClearedCap', cap(word(CLEARED.length)))
const storm = KJ.groups.his.signs.oppositeStorm
claim(storm.danger.lift >= KB.lift && storm.danger.precision.ci[0] < KB.floor * KJ.groups.his.base.danger.p, 'the opposite-side storm lifts enough but its interval starts under the floor')
g.def('KingStormLift', lift(storm.danger.lift)).def('KingStormLow', percent(storm.danger.precision.ci[0], 1)).def('KingFloor', percent(KB.floor * KJ.groups.his.base.danger.p, 1))
const nsq = KJ.groups.his.signs.noSafeSquares
claim(nsq.mateThreat.lift > 4 && nsq.swing.lift < 1, 'no safe squares foretells mate threats, not swings')
g.def('KingNoSafeMateLift', fixed(nsq.mateThreat.lift, 1)).def('KingNoSafeSwingLift', lift(nsq.swing.lift))

const R = KN.bookReach
claim(R.plies === 12, 'the book decides the first 12 plies')
g.def('BookPlies', String(R.plies))
const inReach = R.groups.his.inReach
const after = R.groups.his.after
g.def('KingEarlyPositions', count(inReach.base.n)).def('KingEarlyBase', pc(inReach.base)).def('KingEarlyAny', pci(inReach.any.precision)).def('KingEarlyNoSafeShows', pc(inReach.signs.noSafeSquares.shows))
claim(inside(inReach.base.p, inReach.any.precision), 'inside the first 12 plies a sign says nothing: the base rate lies inside its interval')
g.def('KingLatePositions', count(after.base.n)).def('KingLateBase', pci(after.base))
const SPOKEN = CLEARED.filter((s) => after.signs[s].clears)
claim(same(KN.spoken, SPOKEN), "king-notes.json's spoken signs are those that clear the bar after the book's plies")
claim(same([...SPOKEN].sort(), ['noSafeSquares', 'queenOnExits']), 'after the first 12 plies only the queen on the exits and no safe squares clear it')
const BYPLY = KN.byPly
g.block(
  'KingLateTable',
  [
    '\\begin{tabular}{lrlrcrrr}',
    '\\toprule',
    ` & \\multicolumn{4}{c}{his band, after ply ${R.plies}} & \\multicolumn{3}{c}{against the ply alone} \\\\`,
    '\\cmidrule(lr){2-5}\\cmidrule(lr){6-8}',
    'sign & shows & dangerous when shown & lift & clears & his band & above & his games \\\\',
    '\\midrule',
    `every position & & ${pci(after.base)} & & & & & \\\\`,
    '\\midrule',
    ...CLEARED.map((s) => {
      const x = after.signs[s]
      return `${SIGN_NAME[s]} & ${pc(x.shows)}\\% & ${pci(x.precision)} & ${lift(x.lift)} & ${x.clears ? 'yes' : 'no'} & ${lift(BYPLY.his.signs[s].ratio)} & ${lift(BYPLY.above.signs[s].ratio)} & ${lift(BYPLY.archive.signs[s].ratio)} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
claim(GROUPS.every((grp) => BYPLY[grp].bins.every((b, i, bs) => i === 0 || b.base.p > bs[i - 1].base.p)), 'danger rises with the ply in every group')
g.def('KingBinFirst', pc(BYPLY.his.bins[0].base)).def('KingBinLast', pc(BYPLY.his.bins.at(-1).base))
const binText = (b) => (b.plies[1] === null ? `${b.plies[0]} and later` : `${b.plies[0]}--${b.plies[1]}`)
claim(BYPLY.his.bins[0].plies[0] === R.plies + 1 && BYPLY.his.bins.at(-1).plies[1] === null, 'the bins start after the book and the last is open')
g.def('KingBins', listed(BYPLY.his.bins.map(binText))).def('KingBinFirstPlies', binText(BYPLY.his.bins[0]).replace('--', ' to ')).def('KingBinLastFrom', String(BYPLY.his.bins.at(-1).plies[0]))
claim(GROUPS.every((grp) => SPOKEN.every((s) => BYPLY[grp].signs[s].ratio >= 1.5) && ['rookLift', 'plusTwo'].every((s) => BYPLY[grp].signs[s].ratio < 1.5)), 'against the ply alone the two spoken signs keep a lift of 1.5 or more in every group, the other two do not')
for (const s of CLEARED) g.def(`KingLate${cap(s)}`, lift(after.signs[s].lift))
const NOTES = KN.notes
const spokenArchive = NOTES.spoken.groups.archive
const allArchive = NOTES.all.groups.archive
g.def('KingNotesPerGame', fixed(spokenArchive.ways.onset.notesPerGame, 2)).def('KingNotesSilent', pc(spokenArchive.ways.onset.silentGames, 0))
g.def('KingNotesHisBand', fixed(NOTES.spoken.groups.his.ways.onset.notesPerGame, 2)).def('KingNotesAllPerGame', fixed(allArchive.ways.onset.notesPerGame, 2))
g.def('KingOnsetDanger', pci(spokenArchive.scored.onset)).def('KingNoneDanger', pci(spokenArchive.scored.none)).def('KingAllOnsetDanger', pci(allArchive.scored.onset))
claim(apart(spokenArchive.scored.onset, spokenArchive.scored.none) && spokenArchive.scored.onset.p > 2.5 * spokenArchive.scored.none.p, 'in his games danger follows the two-sign warning over two and a half times as often as no sign')
claim(spokenArchive.ways.onset.notesPerGame < 0.5 && allArchive.ways.onset.notesPerGame > 1.5, 'two signs speak under once in two games, four over one and a half times a game')

// ---- 1c: the coach's good-trade praise ----
const TR = read('trades.json')
const T = TR.groups
const CASES = ['activeForPassive', 'attackerTraded', 'queensOffAttacking', 'worseEnding']
const CASE_NAME = { activeForPassive: 'active for passive', attackerTraded: 'an attacker traded', queensOffAttacking: 'queens off while attacking', worseEnding: 'a worse ending' }
claim(same(Object.keys(T.his.cases), CASES), 'the four cases')
g.def('TradeShareBar', percent(TR.bar.share, 0)).def('TradeFaultBar', String(TR.bar.faulted)).def('TradeMobilityGap', word(TR.bar.mobilityGap))
for (const grp of GROUPS) {
  const k = cap(grp)
  g.def(`Trade${k}Trades`, count(T[grp].trades)).def(`Trade${k}Praised`, pc(T[grp].praised, 0)).def(`Trade${k}Faulted`, pci(T[grp].faultedPraised)).def(`Trade${k}FaultedCount`, of(T[grp].faultedPraised))
}
g.block(
  'TradeTable',
  [
    '\\begin{tabular}{lrllrll}',
    '\\toprule',
    ' & \\multicolumn{3}{c}{his band} & \\multicolumn{3}{c}{his games} \\\\',
    '\\cmidrule(lr){2-4}\\cmidrule(lr){5-7}',
    'case & share & faulted & others faulted & share & faulted & others faulted \\\\',
    '\\midrule',
    ...CASES.map((c) => {
      const h = T.his.cases[c]
      const a = T.archive.cases[c]
      const all = c === 'worseEnding'
      return `${CASE_NAME[c]} & ${pc(h.share)}\\% & ${all ? 'all' : `${pc(h.faulted)}\\%`} & ${pc(h.faultedOthers)}\\% & ${pc(a.share)}\\% & ${all ? 'all' : of(a.faulted)} & ${of(a.faultedOthers)} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
const tightens = (grp, c) => T[grp].cases[c].share.p >= TR.bar.share && T[grp].cases[c].faulted.p >= T[grp].cases[c].faultedOthers.p
claim(['his', 'above', 'archive'].every((grp) => T[grp].cases.worseEnding.faulted.k === T[grp].cases.worseEnding.faulted.n), 'every trade into a worse ending is faulted, by its definition')
claim(TR.tightens.length === 0 && !TR.replaceReason && CASES.every((c) => !tightens('his', c) && !tightens('archive', c)), 'no case tightens the praise')
claim(T.his.cases.activeForPassive.share.p > 0.25 && T.his.cases.activeForPassive.faulted.p < T.his.cases.activeForPassive.faultedOthers.p, 'active for passive is over a quarter of the praised trades and faulted less than the rest')
claim(['attackerTraded', 'queensOffAttacking', 'worseEnding'].every((c) => T.his.cases[c].share.p < TR.bar.share && T.archive.cases[c].share.p < TR.bar.share), 'the other cases are under one praised trade in twenty, in his band and in his games')
g.def('TradeActiveShare', pc(T.his.cases.activeForPassive.share, 0)).def('TradeActiveFaulted', pc(T.his.cases.activeForPassive.faulted)).def('TradeActiveOthers', pc(T.his.cases.activeForPassive.faultedOthers))
g.def('TradeQueensFaulted', pc(T.his.cases.queensOffAttacking.faulted)).def('TradeQueensShare', pc(T.his.cases.queensOffAttacking.share))
claim(T.his.cases.queensOffAttacking.faulted.p > T.his.cases.queensOffAttacking.faultedOthers.p, 'queens off while attacking is faulted more often than the rest')
const ML = TR.missedTradeLine
g.def('TradeLineFires', count(ML.fires)).def('TradeLineFaultedAhead', count(ML.faultedWhileAhead))
g.def('TradeLineActive', of(ML.cases.activeForPassive)).def('TradeLineAttacker', of(ML.cases.attackerTraded)).def('TradeLineQueens', of(ML.cases.queensOffAttacking))

// ---- 1d: backward moves ----
const RT = read('retreats.json')
const RG = RT.groups
claim(RT.app === APP, 'retreats.json measured the same app commit')
claim(RT.budget === 'check', "1d reads the app's check budget")
g.def('RetreatsDrawGames', count(scan.draw.retreats.games)).def('RetreatsDrawArchive', count(scan.draw.retreats.archive)).def('RetreatsMustFind', String(RT.mustFind))
const MARGINS = RG.his.maia.bins.map((b) => b.margin)
claim(MARGINS.length === 3 && MARGINS[0][0] === RT.mustFind && MARGINS[2][1] === null, "the margin bins start at the must-find gap and the last is open")
g.def('RetreatsBins', listed(MARGINS.map(([lo, hi]) => (hi === null ? `${lo} or more` : `${lo} to ${hi}`))))
/** A difference of two shares in points, with its interval. */
const diff = (x) => `${fixed(100 * x.d, 1)} {\\footnotesize (${fixed(100 * x.ci[0], 1)} to ${fixed(100 * x.ci[1], 1)})}`
for (const grp of GROUPS) {
  const k = cap(grp)
  const q = RG[grp].quiet
  g.def(`Retreats${k}Positions`, count(RG[grp].positions)).def(`Retreats${k}MustFindPositions`, count(RG[grp].mustFind))
  g.def(`Retreats${k}Backward`, pci(q.backward)).def(`Retreats${k}Forward`, pci(q.forward)).def(`Retreats${k}Diff`, diff(q.backwardMinusForward))
  g.def(`Retreats${k}KnightBack`, pci(q.knights.backward)).def(`Retreats${k}KnightFwd`, pci(q.knights.forward))
  g.def(`Retreats${k}AllBackward`, pci(RG[grp].all.backward)).def(`Retreats${k}AllForward`, pci(RG[grp].all.forward))
  g.def(`Retreats${k}MaiaDiff`, fixed(100 * RG[grp].maia.weightedBackwardMinusForward, 1)).def(`Retreats${k}MaiaCi`, `${fixed(100 * RG[grp].maia.ci[0], 1)} to ${fixed(100 * RG[grp].maia.ci[1], 1)}`)
}
g.block(
  'RetreatsTable',
  [
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{lrllll}',
    '\\toprule',
    ' & & \\multicolumn{3}{c}{quiet best moves missed} & \\\\',
    '\\cmidrule(lr){3-5}',
    'players & must-find & backward & sideways & forward & backward $-$ forward \\\\',
    '\\midrule',
    ...[
      ['his band', 'his'],
      ['the band above', 'above'],
      ['his games', 'archive'],
    ].map(([label, grp]) => {
      const q = RG[grp].quiet
      return `${label} & ${count(RG[grp].mustFind)} & ${pci(q.backward)} & ${pci(q.sideways)} & ${pci(q.forward)} & ${diff(q.backwardMinusForward)} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
const marginText = ([lo, hi]) => (hi === null ? `${lo} or more` : `${lo}--${hi}`)
g.block(
  'RetreatsMaiaTable',
  [
    '\\begin{tabular}{lrrrr}',
    '\\toprule',
    ' & \\multicolumn{2}{c}{backward} & \\multicolumn{2}{c}{forward} \\\\',
    '\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}',
    "best move's margin (win\\%) & positions & Maia-2 & positions & Maia-2 \\\\",
    '\\midrule',
    ...RG.his.maia.bins.map((b) => `${marginText(b.margin)} & ${count(b.backward)} & ${percent(b.backwardMean, 1)}\\% & ${count(b.forward)} & ${percent(b.forwardMean, 1)}\\% \\\\`),
    '\\midrule',
    `weighted by the backward moves & & \\multicolumn{3}{l}{backward $-$ forward: ${fixed(100 * RG.his.maia.weightedBackwardMinusForward, 1)} points (${fixed(100 * RG.his.maia.ci[0], 1)} to ${fixed(100 * RG.his.maia.ci[1], 1)})} \\\\`,
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
claim(!RT.missedMore && !RT.harderForMaia && !RT.holds, 'neither half of 1d holds')
claim(['his', 'above'].every((grp) => RG[grp].quiet.backwardMinusForward.ci[1] < 0), 'in both bands quiet backward best moves are missed less often than forward ones, interval and all')
claim(inside(0, RG.archive.quiet.backwardMinusForward), 'in his games the difference is inside the noise')
claim(['his', 'above'].every((grp) => RG[grp].maia.ci[0] > 0), 'in both bands Maia-2 gives backward best moves more probability than forward ones at the same margin, interval and all')
const BINS_HIS = RG.his.maia.bins
const lastBin = BINS_HIS.at(-1)
claim(BINS_HIS.slice(0, -1).every((b) => b.backwardMean > b.forwardMean) && lastBin.backwardMean < lastBin.forwardMean, "in his band backward moves get more of Maia's probability in the first two bins and less in the last")
g.def('RetreatsLastBinBackward', word(lastBin.backward)).def('RetreatsLastBinFrom', String(lastBin.margin[0])).def('RetreatsFirstBinsBackward', count(BINS_HIS.slice(0, -1).reduce((a, b) => a + b.backward, 0))).def('RetreatsHisQuietBackward', count(RG.his.quiet.backward.n))
claim(GROUPS.every((grp) => inside(0, RG[grp].all.backwardMinusForward)), 'with captures counted the two directions are missed about equally, in every group')
const fwdQuietShare = RG.his.quiet.forward.n / RG.his.all.forward.n
claim(fwdQuietShare < 0.5 && RG.his.quiet.backward.n / RG.his.all.backward.n > 0.5, 'most forward best moves are captures, most backward ones are quiet')
g.def('RetreatsFwdQuietShare', percent(fwdQuietShare, 0)).def('RetreatsBackQuietShare', percent(RG.his.quiet.backward.n / RG.his.all.backward.n, 0))
claim(inside(0, RG.his.quiet.knights.backwardMinusForward), 'backward and forward knight moves are missed about equally in his band, within the noise')

// ---- 1e: practical tries when every move loses ----
const PR = read('practical.json')
const P = PR.groups
g.def('PracticalBehind', String(-PR.behindCp)).def('PracticalWithin', String(PR.withinCp)).def('PracticalCover', percent(PR.replies.cover, 0)).def('PracticalMost', word(PR.replies.most))
g.def('PracticalDiffersBar', percent(PR.bar.differs, 0)).def('PracticalExtraBar', fixed(100 * PR.bar.extraSaves, 0))
for (const grp of GROUPS) {
  const k = cap(grp)
  const x = P[grp]
  g.def(`Practical${k}Positions`, count(x.positions)).def(`Practical${k}Kept`, count(x.kept)).def(`Practical${k}SOne`, pci(x.s1)).def(`Practical${k}SZero`, pci(x.s0))
  g.def(`Practical${k}Differs`, pci(x.differs)).def(`Practical${k}Extra`, fixed(100 * x.extraSavesPerPosition, 1))
}
const third = ['lowest', 'middle', 'highest']
g.block(
  'PracticalCalibration',
  [
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{llrlrlr}',
    '\\toprule',
    ` & \\multicolumn{2}{c}{his band} & \\multicolumn{2}{c}{the band above} & \\multicolumn{2}{c}{his games} \\\\`,
    '\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}\\cmidrule(lr){6-7}',
    "third of Maia's chance & observed & predicted & observed & predicted & observed & predicted \\\\",
    '\\midrule',
    ...third.map((t, i) => `${t} & ${GROUPS.map((grp) => `${pci(P[grp].calibration[i].observed)} & ${percent(P[grp].calibration[i].predicted, 1)}\\%`).join(' & ')} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
claim(!PR.savesMore && GROUPS.every((grp) => !P[grp].fair), 'Maia is not a fair instrument here, so the practical try does not save more by the rule')
claim(GROUPS.every((grp) => P[grp].calibration[0].predicted === 0 && P[grp].calibration[0].observed.k > 0), "in the lowest third Maia gives no chance, yet some replies throw the win away")
claim(['his', 'above'].every((grp) => inside(P[grp].calibration[2].predicted, P[grp].calibration[2].observed)), 'in the highest third Maia is right, in both bands')
claim(P.his.differs.p < PR.bar.differs && P.his.differs.ci[1] < PR.bar.differs, 'the practical try differs from the top move in under one position in four, interval and all')
claim(P.his.extraSavesPerPosition >= PR.bar.extraSaves, 'where it differs its extra saves would clear the bar')
g.def('PracticalSavedTop', pci(P.his.savedByPlayed.top)).def('PracticalSavedTry', pci(P.his.savedByPlayed.practical)).def('PracticalSavedTryCount', of(P.his.savedByPlayed.practical)).def('PracticalSavedOther', pci(P.his.savedByPlayed.other))
const SB = P.his.savedByPlayed
claim(SB.practical.p > SB.top.p && SB.top.p > SB.other.p, 'the games agree in direction: the practical try saved most, then the top move, then any other')
claim(['his', 'above'].every((grp) => P[grp].calibration[0].predicted === 0 && P[grp].calibration[1].predicted === 0), 'in two thirds of the positions in each band Maia gives no chance at all')
g.def('PracticalChanceTop', percent(P.his.meanChance.top, 1)).def('PracticalChanceTry', percent(P.his.meanChance.practical, 1))
const RES = P.his.resources
g.def('PracticalCheck', pc(RES.check, 0)).def('PracticalPiecesOn', pc(RES.keepsPiecesOn, 0)).def('PracticalPassed', pc(RES.passed, 0)).def('PracticalStalemate', pc(RES.stalemate, 0))

// ---- 1f: the conversion target ----
const CV = conversion
claim(CV.metric === 'conversion.sustained', 'the metric is conversion.sustained')
const band = (b) => `${b[0]}--${b[1]}`
const LOOK = CV.goals[0].above[0] - CV.goals[0].band[0]
claim(CV.goals.every((x) => x.above[0] - x.band[0] === LOOK) && HIS[0] - CV.tripwire.below[0] === LOOK, 'every goal reads the band the same distance above, and the tripwire the same distance below him')
g.def('LookAbove', String(LOOK)).def('TripwireWas', percent(CV.tripwire.value, 0)).def('TripwireWindow', String(CV.tripwire.window.games))
g.def('GoalsWas', listed(CV.goals.map((x) => `${percent(x.value, 0)}\\%`)))
g.block(
  'ConversionTable',
  [
    '\\begin{tabular}{llllrr}',
    '\\toprule',
    " & chess.com & the band it reads (Lichess) & converts & was & now \\\\",
    '\\midrule',
    ...CV.goals.map((x) => `stage ${x.stage} goal & ${band(x.chesscom)} & ${band(x.above)}, ${LOOK} above & ${pci(x.reach)} & ${percent(x.value, 0)}\\% & ${percent(x.to ?? x.value, 0)}\\% \\\\`),
    `tripwire & & ${band(CV.tripwire.below)}, ${LOOK} below him & ${pci(CV.tripwire.rate)} & ${percent(CV.tripwire.value, 0)}\\% & ${percent(CV.tripwire.to ?? CV.tripwire.value, 0)}\\% \\\\`,
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
claim(CV.goals.every((x) => x.verdict === 'moves' && !inside(x.value, x.reach)) && CV.tripwire.verdict === 'moves', 'all four numbers move')
claim(CV.goals.every((x) => x.value > x.reach.ci[1]) && CV.tripwire.value < CV.tripwire.rate.ci[0], 'the goals were above what players reach, and the tripwire below')
const B = CV.books
g.def('BooksTarget', percent(B.target, 0)).def('ConvHis', pci(B.his)).def('ConvAbove', pci(B.above))
claim(B.his.ci[0] > B.target && B.above.ci[0] > B.target, "both bands already convert more than the books' 70%")
const top = CV.bands.find((b) => b.band[0] === 1900 && b.band[1] === 2049) ?? CV.bands.find((b) => b.band[0] === 1850 && b.band[1] === 2049)
g.def('ConvTopBand', band(top.band)).def('ConvTop', pci(top))
claim(CV.goals.find((x) => x.stage === 4).value > top.ci[1], 'the stage 4 goal was above what Lichess players at 1850 or more convert')
g.def('ConvArchive', pci(CV.archive.conversion)).def('ConvArchiveGames', count(CV.archive.conversion.n))
g.def('ConvWindow', String(CV.archive.lastWindow.games)).def('ConvWindowSustained', String(CV.archive.lastWindow.sustained)).def('ConvWindowMin', String(CV.archive.lastWindow.minN))
claim(CV.archive.lastWindow.sustained < CV.archive.lastWindow.minN, 'his last 30 games hold fewer sustained +3 games than the metric needs')

// ---- 1g: the twelve planning positions ----
const CP = read('capstones.json')
claim(CP.margin === 45, 'the drill counts any option within 45 cp as right')
g.def('PlanMargin', String(CP.margin)).def('PlanPositions', word(CP.positions))
const deep = CP.budgets.find((b) => b.id === 'n32m').budget.nodes
claim(deep % 1e6 === 0, 'the deep check is a whole number of millions of nodes')
g.def('DeepNodes', `${deep / 1e6} million`)
const T12 = CP.twelve
g.def('PlanRejected', String(T12.plan.rejected)).def('PlanSound', String(T12.plan.preferredOrSound))
g.def('PlanRejectedRightPlan', word(T12.plan.rejectedCountedRight)).def('PlanSoundWrongPlan', word(T12.plan.preferredOrSoundCountedWrong))
g.def('PlanRejectedRightDeep', word(T12.n32m.rejectedCountedRight)).def('PlanSoundWrongDeep', word(T12.n32m.preferredOrSoundCountedWrong))
g.def('PlanRejectedTopThree', word(T12.plan.rejectedInTopThree))
claim(T12.held === 0 && CP.later.held === 0, 'no disagreement holds at both budgets')
claim(T12.plan.rejectedCountedRight === 0 && T12.plan.preferredOrSoundCountedWrong === 0, "at the drill's own budget the rule agrees with the books on every named move")
claim(T12.n32m.rejectedCountedRight === 1 && T12.n32m.preferredOrSoundCountedWrong === 1, 'the deep check alone gives one disagreement of each kind')
claim(CP.evaluation.words.length === 2, 'the evaluation position is read with White to move, then Black')
const quoted = (w) => "``" + esc(w) + "''"
g.def('PlanEvalAgreement', esc(CP.evaluation.agreement)).def('PlanEvalWhite', quoted(CP.evaluation.words[0])).def('PlanEvalBlack', quoted(CP.evaluation.words[1]))
claim(CP.evaluation.agreement === 'disagrees', 'the engine does not call the evaluation position equal')

// ---- 6a and 6b: the later pair, at their own commit ----
const AG = read('after-gain.json')
const LT = read('lost-trades.json')
const LATER = AG.app
claim(LT.app === LATER, '6a and 6b measured the same app commit')
claim(LATER !== APP, '6a and 6b ran at a later commit than 1a to 1g, which the paper names')
g.def('LaterAppCommit', LATER.slice(0, 10))
claim(AG.month === scan.month && LT.month === scan.month, '6a and 6b read the same month of games')
claim(AG.groups.archive.playerGames === LT.groups.archive.playerGames, '6a and 6b read the same games of his')
g.def('LaterArchiveGames', count(AG.groups.archive.playerGames))
const points = (x) => fixed(100 * x, 1)
const pointsCi = (x, ci) => `${points(x)} {\\footnotesize (${points(ci[0])} to ${points(ci[1])})}`
const liftCi = (x) => `${fixed(x.lift, 2)} {\\footnotesize (${fixed(x.liftCi[0], 2)}--${fixed(x.liftCi[1], 2)})}`

// ---- 6a: errors right after winning material ----
const AGR = AG.rule
g.def('AfterGainMin', word(AGR.gain)).def('AfterGainWindow', word(AGR.window)).def('AfterGainLiftBar', fixed(AGR.lift, 1))
g.def('AfterGainClockLow', String(AGR.clockEdges[0] / 60 === 1 ? 'a minute' : `${AGR.clockEdges[0]} seconds`)).def('AfterGainClockHigh', word(AGR.clockEdges[1] / 60))
claim(AGR.clockEdges[0] === 60 && AGR.clockEdges[1] % 60 === 0, 'the clock bins are whole minutes')
const AGG = AG.groups
for (const grp of GROUPS) {
  const k = cap(grp)
  const x = AGG[grp].primary
  g.def(`AfterGain${k}Events`, count(AGG[grp].events)).def(`AfterGain${k}Window`, count(x.windowMoves))
  g.def(`AfterGain${k}Rate`, `${percent(x.rate, 1)}\\%`).def(`AfterGain${k}Expected`, `${percent(x.expectedRate, 1)}\\%`).def(`AfterGain${k}Lift`, liftCi(x))
  g.def(`AfterGain${k}LooseLift`, fixed(AGG[grp].evalAndDanger.lift, 2))
}
const GAIN_KEYS = Object.keys(AGG.his.byGain)
claim(same(GAIN_KEYS, ['2', '3-4', '5+']), 'the material won falls in three bins')
g.def('AfterGainHisMoves', listed(['1', '2', '3'].map((k) => fixed(AGG.his.byMove[k].lift, 2))))
g.def('AfterGainHisGains', listed(GAIN_KEYS.map((k) => `${fixed(AGG.his.byGain[k].lift, 2)} for ${k.replace('-', ' or ').replace('+', ' or more')}`)))
g.block(
  'AfterGainTable',
  [
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{lrrllll}',
    '\\toprule',
    ' & & & \\multicolumn{2}{c}{serious errors} & & \\\\',
    '\\cmidrule(lr){4-5}',
    'players & runs & window moves & in the window & expected & lift & excess (points) \\\\',
    '\\midrule',
    ...[
      ['his band', 'his'],
      ['the band above', 'above'],
      ['his games', 'archive'],
    ].map(([label, grp]) => {
      const x = AGG[grp].primary
      return `${label} & ${count(AGG[grp].events)} & ${count(x.windowMoves)} & ${percent(x.rate, 1)}\\% & ${percent(x.expectedRate, 1)}\\% & ${liftCi(x)} & ${pointsCi(x.excess, x.excessCi)} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
claim(AG.holds === false, '6a does not hold')
claim(GROUPS.every((grp) => AGG[grp].primary.liftCi[1] < 1 && AGG[grp].primary.excessCi[1] < 0), 'serious errors are rarer in the window than in positions alike, interval and all, in every group')
claim(AGG.his.primary.droppedWindowMoves === 0, 'in his band every window move has controls in its stratum')
claim(['1', '2', '3'].every((k) => AGG.his.byMove[k].liftCi[1] < 1), 'in his band each of the three window moves is lower on its own')
const gainLifts = GAIN_KEYS.map((k) => AGG.his.byGain[k].lift)
claim(gainLifts.every((x, i) => i === 0 || x < gainLifts[i - 1]), 'in his band the more material won, the lower the lift')
claim(['his', 'above'].every((grp) => AGG[grp].evalAndDanger.lift > AGG[grp].primary.lift && AGG[grp].evalAndDanger.liftCi[1] < 1), 'on the eval and the two dangers alone the gap is smaller but still there, in both bands')
claim(GROUPS.every((grp) => AGG[grp].mistakesAndBlunders.rate === AGG[grp].primary.rate && AGG[grp].mistakesAndBlunders.expectedRate === AGG[grp].primary.expectedRate), 'the reader gives these games no miss, so counting mistakes and blunders alone changes nothing')

// ---- 6b: even trades when lost ----
const LTR = LT.rule
const LG = LT.groups
g.def('LostTradesBehind', String(LTR.behindCp)).def('LostTradesDown', word(LTR.down)).def('LostTradesDropBar', fixed(100 * LTR.drop, 0)).def('LostTradesMinTrades', count(LTR.minTrades)).def('LostTradesClockEdge', String(LTR.clockEdge))
const LGROUPS = ['both', 'his', 'above', 'archive']
for (const grp of LGROUPS) {
  const k = cap(grp)
  const x = LG[grp]
  g.def(`LostTrades${k}Positions`, count(x.positions)).def(`LostTrades${k}Traded`, pci(x.traded)).def(`LostTrades${k}PlainTrades`, count(x.kinds.plain))
  g.def(`LostTrades${k}SavedPlain`, pci(x.saved.plain)).def(`LostTrades${k}SavedKeep`, pci(x.saved.keep))
  if (x.primary.d !== null) g.def(`LostTrades${k}Diff`, pointsCi(x.primary.d, x.primary.ci))
}
const LB = LG.both
g.def('LostTradesBothDrop', fixed(-100 * LB.primary.d, 1)).def('LostTradesAfterDiff', pointsCi(LB.evalAfter.d, LB.evalAfter.ci)).def('LostTradesClockDiff', pointsCi(LB.withClock.d, LB.withClock.ci))
g.def('LostTradesLossPlain', fixed(LB.lossPct.plain, 1)).def('LostTradesLossKeep', fixed(LB.lossPct.keep, 1))
g.def('LostTradesCheck', count(LB.kinds.check)).def('LostTradesCheckDiff', pointsCi(LB.apart.check.d, LB.apart.check.ci))
g.def('LostTradesPassed', word(LB.kinds.passed)).def('LostTradesPawn', word(LB.kinds.pawnTrade)).def('LostTradesPawnDiff', pointsCi(LB.apart.pawnTrade.d, LB.apart.pawnTrade.ci))
g.def('LostTradesOther', count(LB.kinds.otherCapture)).def('LostTradesOtherDiff', pointsCi(LB.apart.otherCapture.d, LB.apart.otherCapture.ci))
const tradesAll = LB.kinds.plain + LB.kinds.check + LB.kinds.passed
g.def('LostTradesMoveLoses', word(LB.tradesTheMoveLoses)).def('LostTradesAll', count(tradesAll))
g.block(
  'LostTradesTable',
  [
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{lrrrrll}',
    '\\toprule',
    ' & & & \\multicolumn{2}{c}{saved after} & \\multicolumn{2}{c}{plain trade $-$ keeping, in points} \\\\',
    '\\cmidrule(lr){4-5}\\cmidrule(lr){6-7}',
    'players & positions & traded & a plain trade & keeping the pieces & alike before & alike after \\\\',
    '\\midrule',
    ...[
      ['both bands', 'both'],
      ['his band', 'his'],
      ['the band above', 'above'],
      ['his games', 'archive'],
    ].map(([label, grp]) => {
      const x = LG[grp]
      return `${label} & ${count(x.positions)} & ${pc(x.traded, 0)}\\% & ${pc(x.saved.plain)}\\% & ${pc(x.saved.keep)}\\% & ${pointsCi(x.primary.d, x.primary.ci)} & ${pointsCi(x.evalAfter.d, x.evalAfter.ci)} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
claim(LT.enough === true && LB.primary.trades >= LTR.minTrades, '6b has enough plain trades')
claim(LT.holds === false, '6b does not hold')
claim(LB.primary.d < 0 && LB.primary.d > -LTR.drop && LB.primary.ci[1] >= 0, 'a plain trade saves fewer games, by less than the bar, with an interval that reaches zero')
claim(LB.evalAfter.d < LB.primary.d && LB.evalAfter.ci[1] < 0 && LB.evalAfter.d <= -LTR.drop, 'at the same eval after the move the trade costs more, beyond the bar and interval and all')
claim(LB.withClock.d > -LTR.drop && LB.withClock.ci[1] < 0, 'with the clocks the drop is clear of zero but under the bar')
claim(['both', 'his', 'above'].every((grp) => LG[grp].lossPct.plain < LG[grp].lossPct.keep), 'a plain trade gives away less win% than a move that keeps the pieces, in every band')
claim(inside(0, { ci: LB.apart.check.ci }) && inside(0, { ci: LB.apart.otherCapture.ci }), 'trades with check and other captures save about as often as keeping the pieces')
claim(LB.apart.pawnTrade.ci[1] < 0 && LB.kinds.pawnTrade < 100, 'the few even pawn trades saved fewer games, interval and all')
claim(LB.kinds.passed < 100 && inside(0, { ci: LB.apart.passed.ci }), 'trades that make a passed pawn are too few to read')
claim(LG.archive.positions < 100, 'his games hold too few such positions to read')
claim(LB.tradesTheMoveLoses / tradesAll < 0.01, 'the trade reader judges a capture by its square, and under one trade in a hundred loses material as played')

// ---- the verdicts ----
claim(trapsReal && missesDominate, '1a: both of its rules hold')
const punishPractice = ADDED.length === 0 ? 'the punish goal keeps its hanging-piece practice: no other kind reaches one miss in ten' : `the punish goal's practice adds ${listed(ADDED.map((k) => KIND_NAME[k]))}`
const VERDICTS = [
  ['1a', 'Traps are a real share of the failures, and misses dominate', "A ``take it or not'' drill (chess PR 109); " + punishPractice],
  ['1b', `${cap(word(CLEARED.length))} of eight signs warn; past the book, ${word(SPOKEN.length)}`, 'Practice games warn on their reply (chess PR 111)'],
  ['1c', 'No case tightens the praise', 'Nothing: the praise stays'],
  ['1d', 'Backward moves are missed less often, not more, and are not harder for Maia', 'Nothing'],
  ['1e', 'Maia is not a fair judge here; the practical try does not save more', 'Nothing: the review names the top move'],
  ['1f', 'All four conversion numbers move', 'The goals and the tripwire (chess PR 108)'],
  ['1g', 'No disagreement holds', 'Nothing: the margin stays'],
  ['6a', 'Serious errors are rarer, not more common, right after winning material', 'The scan drops its clause on winning material'],
  ['6b', 'An even trade when lost costs fewer saved games than the bar', 'Nothing'],
]
g.block(
  'VerdictTable',
  ['\\begin{tabular}{lp{0.42\\textwidth}p{0.42\\textwidth}}', '\\toprule', 'test & what the rule found & what the app took \\\\', '\\midrule', ...VERDICTS.map((v) => `${v.join(' & ')} \\\\`), '\\bottomrule', '\\end{tabular}'].join('\n'),
)

g.write(join(HERE, 'generated.tex'))
console.error('wrote projects/book-advice/paper/generated.tex')
