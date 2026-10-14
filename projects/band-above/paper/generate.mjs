#!/usr/bin/env node
// Writes paper/generated.tex for the band-above paper from what analyze.py
// wrote (results/analysis.json). It refuses to write when a claim the paper
// makes no longer holds.
//
//   bridge/run.sh projects/band-above/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, esc, fixed, percent, word } from '../../paper.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const res = JSON.parse(readFileSync(join(resultsDir('band-above'), 'analysis.json'), 'utf8'))
const g = new Generated('projects/band-above/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const count = (n) => n.toLocaleString('en-US')
const ok = (x) => x != null && Number.isFinite(x)
const signed = (x, d = 1) => (!ok(x) ? '--' : `${x > 0 ? '$+$' : ''}${fixed(x, d)}`)
/** A value with its interval: "12.3 (10.1, 14.2)". */
const ci = (r, d = 1, sign = false) => {
  const f = sign ? (x) => signed(x, d) : (x) => fixed(x, d)
  return !ok(r.value) ? '--' : `${f(r.value)} {\\footnotesize (${f(r.lo)}, ${f(r.hi)})}`
}
/** A share with its interval, as percentages. */
const pci = (r, d = 0) => (!ok(r.value) ? '--' : `${percent(r.value, d)}\\% {\\footnotesize (${percent(r.lo, d)}, ${percent(r.hi, d)})}`)
const pval = (p) => (!ok(p) ? '--' : p < 0.001 ? '$<$0.001' : fixed(p, 3))
const band = (b) => b.replace('-', '--')
const commandName = (s) => s.replace(/(^|[.-])([a-z0-9])/g, (_, __, c) => c.toUpperCase()).replace(/[^A-Za-z]/g, '')
const below = (r) => r.hi < 0
const above0 = (r) => r.lo > 0
const spans = (r) => r.lo <= 0 && r.hi >= 0
const overlap = (a, b) => a.lo <= b.hi && b.lo <= a.hi
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
const falling = (xs) => xs.every((x, i) => i === 0 || x < xs[i - 1])
/** Table rows for the partition's causes, the others and every move, with rules between them. */
const grouped = (row) => [...PART.map(row), '\\midrule', ...OTHER.map(row), '\\midrule', row('all')]

g.def('AppCommit', res.appCommit.slice(0, 10)).def('Month', res.month)
const P = res.params
const HIS = `${P.his[0]}-${P.his[1]}`
const ABOVE = `${P.above[0]}-${P.above[1]}`
g.def('HisLo', String(P.his[0])).def('HisHi', String(P.his[1])).def('AboveLo', String(P.above[0])).def('AboveHi', String(P.above[1]))
g.def('Draws', count(P.draws)).def('Seed', String(P.seed))
const A = res.app
g.def('Discount', fixed(A.LEAK_DISCOUNT, 1)).def('EloPerPoint', String(A.ELO_PER_POINT))
const CAUSES = A.causes.map((c) => c.id)
const PART = A.partition
const OTHER = CAUSES.filter((c) => !PART.includes(c))
const LABEL = Object.fromEntries(A.causes.map((c) => [c.id, c.label]))
LABEL.all = 'every move'
// The causes' names as a table has room for them.
const SHORT = { 'opening.tense': 'opening, tense', 'opening.quiet': 'opening, quiet', 'middlegame.tense': 'middlegame, tense', 'middlegame.quiet': 'middlegame, quiet', 'endgame.tense': 'endgame, tense', 'endgame.quiet': 'endgame, quiet', 'clock.low': 'under a minute left', 'fast.tense': 'tense, under 5 seconds', 'after.gift': "after the opponent's error", late: 'from move 40', all: 'every move' }
claim(CAUSES.every((c) => SHORT[c]), 'every cause has a short name')
g.def('Causes', word(CAUSES.length)).def('PartitionCauses', word(PART.length))
claim(same(PART, ['opening.tense', 'opening.quiet', 'middlegame.tense', 'middlegame.quiet', 'endgame.tense', 'endgame.quiet', 'clock.low']), 'the partition is the six phase-by-position causes and the low clock')
claim(same(OTHER, ['fast.tense', 'after.gift', 'late']), 'the other causes are fast tense answers, the move after the gift and from move 40')

// ---- the data ----
const G = res.games
g.def('GamesBuilt', count(G.built)).def('GamesRead', count(G.read)).def('BlackChecked', count(G.blackBuildsChecked)).def('PlayerGames', count(G.playerGames))
claim(G.built === G.read && Object.keys(G.skipped).length === 0, 'every game read was built')
claim(G.ledgerBroken === 0 && G.ledgerRows === G.playerGames, 'every player-game has a ledger row')
const S = res.slopes
g.def('YardstickK', fixed(S.yardstick.k * 1000, 2)).def('LichessK', fixed(S.lichessK * 1000, 2))
g.def('YardstickPositions', count(S.yardstick.positions)).def('YardstickPlayerGames', count(S.yardstick.playerGames))
const B = res.bands
const BANDS = Object.keys(B)
claim(BANDS.includes(HIS) && BANDS.indexOf(ABOVE) === BANDS.indexOf(HIS) + 1, 'the band above is the next band up')
claim(falling(BANDS.map((b) => -S.bands[b].k)), "the band curve's slope rises with rating")
g.def('HisPlayerGames', count(B[HIS].playerGames)).def('AbovePlayerGames', count(B[ABOVE].playerGames))
g.def('HisGames', count(B[HIS].games)).def('AboveGames', count(B[ABOVE].games))
g.def('BandLo', band(BANDS[0])).def('BandHi', band(BANDS.at(-1))).def('Bands', word(BANDS.length))
g.def('LowK', fixed(1000 * S.bands[BANDS[0]].k, 2)).def('HighK', fixed(1000 * S.bands[BANDS.at(-1)].k, 2))
g.block(
  'BandTable',
  [
    '\\begin{tabular}{lrrrr}',
    '\\toprule',
    "player's rating & player-games & games & slope $k$ ($\\times 10^{-3}$) & plies \\\\",
    '\\midrule',
    ...BANDS.map((b) => `${band(b)}${b === HIS ? ' (his)' : b === ABOVE ? ' (above)' : ''} & ${count(B[b].playerGames)} & ${count(B[b].games)} & ${fixed(1000 * S.bands[b].k, 2)} & ${fixed(res.plies[b], 0)} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)

// ---- rule 1: what separates the bands ----
const SEP = res.separates
const SH = res.shares
g.block(
  'SeparatesTable',
  [
    '\\begin{tabular}{lrrllcl}',
    '\\toprule',
    ` & \\multicolumn{2}{c}{points a game} & & Holm & & share of \\\\`,
    '\\cmidrule(lr){2-3}',
    `cause & his band & above & $\\Delta$ & $p$ & separates & the difference \\\\`,
    '\\midrule',
    ...grouped((c) => {
      const r = SEP[c]
      const test = c === 'all' ? ' & ' : `${pval(r.pHolm)} & ${r.separates ? 'yes' : 'no'}`
      return `${SHORT[c]} & ${fixed(r.his.value, 1)} & ${fixed(r.above.value, 1)} & ${ci(r.delta, 2, true)} & ${test} & ${SH[c] ? pci(SH[c]) : ''} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
const RANKED = res.ranked
// The causes as a sentence names them.
const PROSE = { 'opening.tense': 'tense openings', 'opening.quiet': 'quiet openings', 'middlegame.tense': 'tense middlegames', 'middlegame.quiet': 'quiet middlegames', 'endgame.tense': 'tense endgames', 'endgame.quiet': 'quiet endgames', 'clock.low': 'moves under a minute on the clock', 'fast.tense': 'tense positions answered in under five seconds', 'after.gift': "the move after the opponent's serious error", late: 'moves from move 40' }
claim(CAUSES.every((c) => PROSE[c]), 'every cause has a name for prose')
const listed = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
g.def('Separate', word(RANKED.length)).def('SeparateCap', word(RANKED.length).replace(/^./, (x) => x.toUpperCase()))
g.def('RankedList', RANKED.length ? listed(RANKED.map((c) => esc(PROSE[c]))) : 'none')
g.def('AllGap', fixed(-SEP.all.delta.value, 2)).def('AllGapLo', fixed(-SEP.all.delta.hi, 2)).def('AllGapHi', fixed(-SEP.all.delta.lo, 2))
for (const c of [...CAUSES, 'all']) {
  const r = SEP[c]
  const k = commandName(c)
  g.def(`${k}His`, fixed(r.his.value, 1)).def(`${k}Above`, fixed(r.above.value, 1)).def(`${k}Delta`, signed(r.delta.value, 2))
  g.def(`${k}DeltaLo`, signed(r.delta.lo, 2)).def(`${k}DeltaHi`, signed(r.delta.hi, 2))
  if (SH[c]) g.def(`${k}Share`, percent(SH[c].value, 0))
}
claim(below(SEP.all.delta), 'the band above gives away fewer points a game over every move')
claim(same(RANKED, ['middlegame.tense', 'after.gift', 'opening.tense', 'fast.tense', 'endgame.tense', 'opening.quiet']), 'the ranking the paper names')
claim(RANKED.slice(0, 2).every((c) => SEP[c].delta.value > -3.5 && SEP[c].delta.value < -2.5), 'the first two are about three points a game each')
const GIVE_MORE = ['middlegame.quiet', 'endgame.quiet', 'clock.low', 'late']
claim(same(CAUSES.filter((c) => above0(SEP[c].delta)), GIVE_MORE), 'the band above gives away more a game on quiet middlegames and endgames, the low clock and from move 40, and on nothing else')
claim(same(CAUSES.filter((c) => !SEP[c].separates), GIVE_MORE), 'the causes that do not separate the bands are those four')
const TENSE = ['opening.tense', 'middlegame.tense', 'endgame.tense']
const tenseShare = TENSE.reduce((s, c) => s + SH[c].value, 0)
claim(TENSE.every((c) => SH[c].lo > 0) && tenseShare > 1, 'the tense causes carry more than the whole difference')
const giveBack = PART.filter((c) => SH[c].value < 0)
claim(same(giveBack, ['middlegame.quiet', 'endgame.quiet', 'clock.low']) && giveBack.every((c) => SH[c].hi < 0), 'quiet middlegames and endgames and the low clock give some back')
g.def('TenseShare', percent(tenseShare, 0)).def('GiveBack', percent(-giveBack.reduce((s, c) => s + SH[c].value, 0), 0))
claim(Math.abs(PART.reduce((s, c) => s + SH[c].value, 0) - 1) < 1e-4, "the partition's shares add up to the whole difference")

// ---- per move: added after the results were read ----
const PM = res.pointsPerMove
const MV = res.movesPerGame
g.block(
  'PerMoveTable',
  [
    '\\begin{tabular}{lrrlll}',
    '\\toprule',
    ' & \\multicolumn{2}{c}{moves a game} & \\multicolumn{3}{c}{points a move} \\\\',
    '\\cmidrule(lr){2-3}\\cmidrule(lr){4-6}',
    'cause & his band & above & his band & above & $\\Delta$ \\\\',
    '\\midrule',
    ...grouped((c) => `${SHORT[c]} & ${fixed(MV[HIS][c], 1)} & ${fixed(MV[ABOVE][c], 1)} & ${ci(PM[c].his, 2)} & ${ci(PM[c].above, 2)} & ${ci(PM[c].delta, 2, true)} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
const LESS = CAUSES.filter((c) => below(PM[c].delta))
const SAME = CAUSES.filter((c) => spans(PM[c].delta))
claim(LESS.length + SAME.length === CAUSES.length && below(PM.all.delta), 'per move the band above gives away less or the same on every cause, and less over every move')
claim(same(SAME, ['endgame.quiet', 'clock.low', 'late']), 'per move it is the same on quiet endgames, the low clock and from move 40')
claim(below(PM['middlegame.quiet'].delta), 'per move the band above gives away less in quiet middlegames')
claim(GIVE_MORE.every((c) => MV[ABOVE][c] > MV[HIS][c]) && res.plies[ABOVE] > res.plies[HIS], 'the band above meets more of the moves it gives away more on, in longer games')
g.def('PerMoveLess', word(LESS.length)).def('HisPlies', fixed(res.plies[HIS], 1)).def('AbovePlies', fixed(res.plies[ABOVE], 1))
g.def('HisQuietMiddlegameMoves', fixed(MV[HIS]['middlegame.quiet'], 1)).def('AboveQuietMiddlegameMoves', fixed(MV[ABOVE]['middlegame.quiet'], 1))
g.def('AllPerMoveHis', fixed(PM.all.his.value, 2)).def('AllPerMoveAbove', fixed(PM.all.above.value, 2))
const top = (b) => CAUSES.reduce((m, c) => (PM[c][b].value > PM[m][b].value ? c : m), CAUSES[0])
claim(top('his') === 'after.gift' && top('above') === 'after.gift', "the move after the opponent's serious error costs the most a move in both bands")
const giftRatio = PM['after.gift'].his.value / PM.all.his.value
claim(giftRatio > 2, 'more than twice an average move')
g.def('GiftPerMoveHis', fixed(PM['after.gift'].his.value, 1)).def('GiftPerMoveAbove', fixed(PM['after.gift'].above.value, 1)).def('GiftRatio', fixed(giftRatio, 1))

// ---- rule 2: the discount ----
const D = res.discount
g.block(
  'DiscountTable',
  [
    '\\begin{tabular}{ll}',
    '\\toprule',
    `cause & $\\delta$ \\\\`,
    '\\midrule',
    ...grouped((c) => `${SHORT[c]} & ${ci(D[c], 2)} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
claim([...CAUSES, 'all'].every((c) => D[c].verdict === 'too high'), 'by the rule, the discount is too high on every cause')
claim([...CAUSES, 'all'].every((c) => D[c].drawsWithoutSlope === 0), 'every draw has a slope')
const dvals = CAUSES.map((c) => D[c].value)
g.def('DiscountMin', fixed(Math.min(...dvals), 2)).def('DiscountMax', fixed(Math.max(...dvals), 2))
g.def('AllDiscount', fixed(D.all.value, 2)).def('AllDiscountLo', fixed(D.all.lo, 2)).def('AllDiscountHi', fixed(D.all.hi, 2))

// ---- the discount with the opponent's points: added after the results were read ----
const W = res.discountWithTheirs
g.block(
  'TheirsTable',
  [
    '\\begin{tabular}{lrll}',
    '\\toprule',
    ` & correlation of & \\multicolumn{2}{c}{$\\delta$ with the opponent's points} \\\\`,
    '\\cmidrule(lr){3-4}',
    `cause & the two players' points & the cause alone & every partition cause \\\\`,
    '\\midrule',
    ...grouped((c) => `${SHORT[c]} & ${fixed(W.correlation[c], 2)} & ${ci(W.alone[c], 2)} & ${W.partition[c] ? ci(W.partition[c], 2) : ''} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
g.def('CorrAll', fixed(W.correlation.all, 2))
g.def('TheirsAll', fixed(W.alone.all.value, 2)).def('TheirsAllLo', fixed(W.alone.all.lo, 2)).def('TheirsAllHi', fixed(W.alone.all.hi, 2))
g.def('TheirsAllOpp', fixed(W.alone.all.theirs.value, 2))
claim(W.correlation.all > 0.5, "the two players' points rise and fall together")
claim(D.all.value < W.alone.all.value && PART.every((c) => D[c].value < W.partition[c].value), "left out, the opponent's points pull the slope towards zero")
claim(W.alone.all.value > 0.95 && W.alone.all.value < 1.1, "with the opponent's points, a point given away costs about a point of result")
claim(Math.abs(W.alone.all.theirs.value - W.alone.all.value) < 0.05, "the opponent's points come in at the same size with the other sign")
const pvals = PART.map((c) => W.partition[c].value)
claim(PART.every((c) => W.partition[c].lo > 1), 'in one fit, every partition cause costs a point or more of result')
g.def('PartitionMin', fixed(Math.min(...pvals), 2)).def('PartitionMax', fixed(Math.max(...pvals), 2))
claim(OTHER.every((c) => W.alone[c].value < W.alone.all.value), 'the overlapping causes alone come in below every move')
g.def('GiftTheirs', fixed(W.alone['after.gift'].value, 2))

// ---- error kinds ----
const K = res.kinds
const KD = res.kindDelta
const KINDS = Object.keys(P.kinds)
const PARTS = KINDS.filter((k) => k !== 'serious')
for (const b of BANDS) claim(Math.abs(PARTS.reduce((s, k) => s + K[b][k].perGame.value, 0) - K[b].serious.perGame.value) < 1e-9, `${b}: the kinds split the serious errors`)
const every = (x) => (ok(x) ? fixed(x, 1) : '--')
g.block(
  'KindsTable',
  [
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{lllllr}',
    '\\toprule',
    ' & \\multicolumn{4}{c}{per game} & hanging a piece: \\\\',
    '\\cmidrule(lr){2-5}',
    "player's rating & serious errors & hanging a piece & mate in one & a forced mate & once every $N$ games \\\\",
    '\\midrule',
    ...BANDS.map((b) => `${band(b)} & ${ci(K[b].serious.perGame, 2)} & ${ci(K[b].hanging.perGame, 2)} & ${ci(K[b].mate1.perGame, 3)} & ${ci(K[b].mateN.perGame, 3)} & ${every(K[b].hanging.everyGames)} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
g.block(
  'KindDiffTable',
  [
    '\\begin{tabular}{lrrll}',
    '\\toprule',
    ' & \\multicolumn{2}{c}{points a game} & & share of \\\\',
    '\\cmidrule(lr){2-3}',
    'kind & his band & above & $\\Delta$ & the difference \\\\',
    '\\midrule',
    ...KINDS.map((k) => `${esc(P.kinds[k])} & ${fixed(K[HIS][k].points.value, 1)} & ${fixed(K[ABOVE][k].points.value, 1)} & ${ci(KD[k].delta, 2, true)} & ${pci(KD[k].share)} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
for (const b of [HIS, ABOVE]) {
  const n = b === HIS ? 'His' : 'Above'
  g.def(`${n}Serious`, fixed(K[b].serious.perGame.value, 2)).def(`${n}Hanging`, fixed(K[b].hanging.perGame.value, 2))
  g.def(`${n}HangingEvery`, every(K[b].hanging.everyGames)).def(`${n}MateOneEvery`, every(K[b].mate1.everyGames)).def(`${n}MateNEvery`, every(K[b].mateN.everyGames))
}
// The think-time study's share of serious errors on the move after the opponent's: the same moment, its own data.
const TT = JSON.parse(readFileSync(join(resultsDir('think-time-rapid'), 'analysis.json'), 'utf8'))
const ttGift = TT.concentration.candidates['after-opp-error']
claim(TT.month === res.month && TT.appCommit === res.appCommit, 'the think-time study read the same month on the same app')
claim(ttGift.errorShare > 0.3 && ttGift.errorShare < 0.37 && ttGift.moveShare < 0.15, "a third of serious errors on fewer than one move in six")
g.def('ThinkGiftErrors', percent(ttGift.errorShare, 0)).def('ThinkGiftMoves', percent(ttGift.moveShare, 0))
const KIND_NAME = { serious: 'Serious', hanging: 'Hanging', mate1: 'MateOne', mateN: 'MateN', untagged: 'Untagged' }
for (const k of KINDS) g.def(`${KIND_NAME[k]}DiffShare`, percent(KD[k].share.value, 0))
claim(KINDS.every((k) => below(KD[k].delta)), 'the band above gives away less on every kind')
claim(KD.serious.share.value > 0.9, 'serious errors carry most of the difference')
claim(KD.hanging.share.value > 0.35 && KD.hanging.share.value < 0.5, 'hanging a piece carries about two fifths of it')
claim(KD.mate1.share.value + KD.mateN.share.value < 0.15, 'mates carry little of it')
claim(falling(BANDS.map((b) => res.trend[b].all.value)) && falling(BANDS.map((b) => K[b].serious.perGame.value)) && falling(BANDS.map((b) => K[b].hanging.perGame.value)), 'points, serious errors and hanging pieces fall at every band')
g.def('MatesDiffShare', percent(KD.mate1.share.value + KD.mateN.share.value, 0))

// ---- the trend ----
const T = res.trend
g.block(
  'TrendTable',
  [
    '\\begin{tabular}{l' + 'r'.repeat(BANDS.length) + '}',
    '\\toprule',
    `cause & ${BANDS.map(band).join(' & ')} \\\\`,
    '\\midrule',
    ...grouped((c) => `${SHORT[c]} & ${BANDS.map((b) => fixed(T[b][c].value, 1)).join(' & ')} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
const RISE = CAUSES.filter((c) => falling(BANDS.map((b) => -T[b][c].value)))
claim(same(RISE, ['middlegame.quiet', 'endgame.quiet', 'late']), 'quiet middlegames and endgames and from move 40 rise at every band')
const FALL = CAUSES.filter((c) => falling(BANDS.map((b) => T[b][c].value)))
claim(same(FALL, ['opening.tense', 'opening.quiet', 'middlegame.tense', 'fast.tense', 'after.gift']), 'the causes that fall at every band')
g.def('AllLow', fixed(T[BANDS[0]].all.value, 1)).def('AllHigh', fixed(T[BANDS.at(-1)].all.value, 1))
g.def('PliesLow', fixed(res.plies[BANDS[0]], 0)).def('PliesHigh', fixed(res.plies[BANDS.at(-1)], 0))
claim(falling(BANDS.map((b) => -res.plies[b])), 'games get longer at every band')
// Points a game on every move, and the serious errors a game, across the bands, with their intervals.
const trendPlot = (get, ylabel) =>
  [
    '\\begin{tikzpicture}',
    `\\begin{axis}[scale only axis, width=0.75\\linewidth, height=3.6cm, xtick={0,...,${BANDS.length - 1}}, xticklabels={${BANDS.map((b) => (Number(b.split('-')[0]) + Number(b.split('-')[1]) + 1) / 2).join(',')}},`,
    `  xmin=-0.5, xmax=${BANDS.length - 0.5}, x tick label style={font=\\scriptsize}, y tick label style={font=\\scriptsize}, ylabel={${ylabel}}, xlabel={player's rating, the band's centre}, grid=major]`,
    '\\addplot[thick, black, mark=*, mark size=1.5pt, error bars/.cd, y dir=both, y explicit] coordinates {',
    ...BANDS.map((b, i) => {
      const r = get(b)
      return `(${i}, ${r.value.toFixed(3)}) += (0, ${(r.hi - r.value).toFixed(3)}) -= (0, ${(r.value - r.lo).toFixed(3)})`
    }),
    '};',
    '\\end{axis}',
    '\\end{tikzpicture}',
  ].join('\n')
g.block('AllPlot', trendPlot((b) => T[b].all, 'points a game'))
g.block('SeriousPlot', trendPlot((b) => K[b].serious.perGame, 'serious errors a game'))

// ---- his games ----
const H = res.archive
claim(H != null, 'his games were read')
g.def('ArchiveGames', count(H.games)).def('ArchivePlies', fixed(H.plies, 0))
const SP = res.split
g.block(
  'SplitTable',
  [
    '\\begin{tabular}{llll}',
    '\\toprule',
    'cause & his games & his band & the band above \\\\',
    '\\midrule',
    ...PART.map((c) => `${SHORT[c]} & ${pci(H.split[c], 1)} & ${pci(SP[HIS][c], 1)} & ${pci(SP[ABOVE][c], 1)} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
g.block(
  'HisKindsTable',
  [
    '\\begin{tabular}{llllr}',
    '\\toprule',
    ' & \\multicolumn{3}{c}{per game} & his games: \\\\',
    '\\cmidrule(lr){2-4}',
    'kind & his games & his band & the band above & once every $N$ \\\\',
    '\\midrule',
    ...['hanging', 'mate1', 'mateN'].map((k) => `${esc(P.kinds[k])} & ${ci(H.kinds[k].perGame, 3)} & ${ci(K[HIS][k].perGame, 3)} & ${ci(K[ABOVE][k].perGame, 3)} & ${every(H.kinds[k].everyGames)} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
for (const c of ['endgame.tense', 'opening.tense']) {
  const k = commandName(c)
  g.def(`Split${k}Mine`, percent(H.split[c].value, 1)).def(`Split${k}His`, percent(SP[HIS][c].value, 1)).def(`Split${k}Above`, percent(SP[ABOVE][c].value, 1))
}
claim(H.split['endgame.tense'].lo > Math.max(SP[HIS]['endgame.tense'].hi, SP[ABOVE]['endgame.tense'].hi), "tense endgames take a larger share of his points than of either band's")
claim(H.split['opening.tense'].hi < SP[HIS]['opening.tense'].lo && overlap(H.split['opening.tense'], SP[ABOVE]['opening.tense']), "tense openings take a smaller share of his points than of his band's, about the band above's")
claim(PART.filter((c) => !['endgame.tense', 'opening.tense'].includes(c)).every((c) => overlap(H.split[c], SP[HIS][c])), "on every other cause his share is his band's, within the interval")
claim(overlap(H.kinds.hanging.perGame, K[HIS].hanging.perGame) && overlap(H.kinds.hanging.perGame, K[ABOVE].hanging.perGame), 'he hangs a piece about as often as either band')
claim(['mate1', 'mateN'].every((k) => H.kinds[k].perGame.lo > Math.max(K[HIS][k].perGame.hi, K[ABOVE][k].perGame.hi)), 'he allows a mate more often than either band')
g.def('ArchiveHangingEvery', every(H.kinds.hanging.everyGames)).def('ArchiveMateOneEvery', every(H.kinds.mate1.everyGames)).def('ArchiveMateNEvery', every(H.kinds.mateN.everyGames))
const mates = (x) => x.mate1.perGame.value + x.mateN.perGame.value
g.def('MateRatio', fixed(mates(H.kinds) / mates(K[HIS]), 1))

g.write(join(HERE, 'generated.tex'))
console.error('wrote projects/band-above/paper/generated.tex')
