#!/usr/bin/env node
// Writes paper/generated.tex for the rating-offset paper: the rule's verdict,
// the curve and the looks beside it (results/offset.json, from fit.mjs), the
// app's own scale (its engine service), the archive's time controls, and one
// of the player's moves priced at the bands three offsets give him.
//
//   bridge/run.sh projects/maia-rating-offset/paper/generate.mjs
//
// It reads private/maia-rating-offset (the moves and policies the project's
// scripts wrote) and runs Maia-2 on one position. What it writes names no game.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { CHESS_DIR, LAB_DIR, chess, privateDir, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, board, esc, figurine, fixed, percent, word } from '../../paper.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FLOW = 'maia-rating-offset'
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const jsonl = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const r = json(join(resultsDir(FLOW), 'offset.json'))
const pin = json(join(LAB_DIR, 'bridge', 'chess.json'))
const engineApi = await chess('src/services/engine/index.ts')
const { DEFAULT_LICHESS_OFFSET, LICHESS_OFFSET_RANGE, MAIA_ELO_START, MAIA_ELO_END, MAIA_ELO_INTERVAL, MAIA_CATEGORY_COUNT, defaultMaiaElo } = engineApi
const g = new Generated('projects/maia-rating-offset/paper/generate.mjs')
/** A count with a thousands separator: 32{,}988. */
const count = (x) => x.toLocaleString('en-US').replace(/,/g, '{,}')

// ---- the scale, as the app states it ----
if (r.app !== pin.commit) throw new Error(`the results measured ${r.app}, the lab pins ${pin.commit}: rerun fit.mjs`)
if (r.base !== DEFAULT_LICHESS_OFFSET) throw new Error("the results' base is not the app's offset")
const step = r.offsets[1] - r.offsets[0]
if (r.offsets[0] !== LICHESS_OFFSET_RANGE.min || r.offsets.at(-1) !== LICHESS_OFFSET_RANGE.max) throw new Error("the grid no longer spans the app's range")
g.def('AppOffset', String(DEFAULT_LICHESS_OFFSET)).def('OffsetMin', String(LICHESS_OFFSET_RANGE.min)).def('OffsetMax', String(LICHESS_OFFSET_RANGE.max))
g.def('OffsetStep', String(step)).def('OffsetCount', String(r.offsets.length))
g.def('MaiaStart', String(MAIA_ELO_START)).def('MaiaEnd', String(MAIA_ELO_END)).def('MaiaWidth', String(MAIA_ELO_INTERVAL)).def('MaiaBands', String(MAIA_CATEGORY_COUNT))
g.def('AppCommit', `\\texttt{${pin.commit.slice(0, 7)}}`)
// The chess.com rating below which every player is in the lowest band, at the app's offset.
g.def('LowestBelow', String(MAIA_ELO_START - DEFAULT_LICHESS_OFFSET))

// ---- the moves ----
const positions = readFileSync(join(LAB_DIR, 'projects', FLOW, 'positions.mts'), 'utf8')
const minPly = /const MIN_PLY = (\d+)/.exec(positions)
const minClock = /const MIN_CLOCK = (\d+)/.exec(positions)
if (!minPly || !minClock) throw new Error('positions.mts no longer states the protocol as the paper describes it')
g.def('MinPly', minPly[1]).def('MinClock', minClock[1])
const d = r.data
g.def('Games', count(d.games)).def('Moves', count(d.moves)).def('HimMoves', count(d.himMoves)).def('OppMoves', count(d.moves - d.himMoves))
g.def('FitGames', count(d.fit.games)).def('FitMoves', count(d.fit.moves)).def('HeldGames', count(d.held.games)).def('HeldMoves', count(d.held.moves))
g.def('RatingMin', String(d.moverRating.min)).def('RatingMedian', String(d.moverRating.median)).def('RatingMax', String(d.moverRating.max))
g.def('MedianBand', String(defaultMaiaElo(d.moverRating.median, DEFAULT_LICHESS_OFFSET)))
g.def('Draws', count(r.draws)).def('Seed', String(r.seed))

// The archive's time controls: the header's, or the first clock's minutes when a game has none.
const { nodeArchive } = await chess('src/adapters/node/archive/index.ts')
const { toGame } = await chess('src/services/archive/index.ts')
const archived = await nodeArchive({ root: CHESS_DIR, keyCache: false }).query({ owner: 'any' })
const minutes = archived.map((rec) => {
  const game = toGame(rec)
  return game.timeControl ? game.timeControl.base / 60 : Math.ceil(game.clocks[0] / 60)
})
const ten = minutes.filter((m) => m === 10).length
if (minutes.some((m) => m < 10)) throw new Error('a game is faster than rapid: the paper says every game is rapid')
if (archived.length !== d.games) throw new Error('the archive no longer holds the games the fit used')
g.def('TenMinuteGames', count(ten)).def('OtherGames', word(minutes.length - ten))

// ---- the verdict ----
const at = (o) => r.offsets.indexOf(o)
const bi = at(r.base)
const fi = at(r.fitted)
g.def('Fitted', String(r.fitted)).def('Kept', String(r.kept))
g.def('HeldDiff', fixed(r.held.diff, 4)).def('HeldLo', fixed(r.held.interval[0], 4)).def('HeldHi', fixed(r.held.interval[1], 4))
g.def('FitGain', fixed(r.curve.fit[fi] - r.curve.fit[bi], 4))
g.def('LLBase', fixed(r.curve.all[bi], 3)).def('LLFitted', fixed(r.curve.all[fi], 3))
g.def('TopBase', percent(r.top1.all[bi], 1)).def('TopFitted', percent(r.top1.all[fi], 1))
g.def('BestAll', String(r.bestOverAll.offset)).def('BestAllLo', String(r.bestOverAll.interval[0])).def('BestAllHi', String(r.bestOverAll.interval[1]))
g.def('BestHim', String(r.bestBySide.him.offset)).def('BestHimLo', String(r.bestBySide.him.interval[0])).def('BestHimHi', String(r.bestBySide.him.interval[1]))
g.def('BestOpp', String(r.bestBySide.opponents.offset)).def('BestOppLo', String(r.bestBySide.opponents.interval[0])).def('BestOppHi', String(r.bestBySide.opponents.interval[1]))
if (r.replaces !== (r.fitted !== r.base && r.held.interval[0] > 0)) throw new Error('the verdict does not follow from the rule')
if (r.kept !== (r.replaces ? r.fitted : r.base)) throw new Error('the kept offset does not follow from the verdict')
// The paper says the fitting half chose the app's own offset, and the held-out half and all the games did too.
if (r.fitted !== r.base || r.held.best !== r.base || r.bestOverAll.offset !== r.base) throw new Error('the paper says every half chose the app\'s offset')
g.def('HeldBest', String(r.held.best))
// How much the offset matters: the all-games curve at the range's ends, against the app's offset.
const lo = r.curve.all[0] - r.curve.all[bi]
const hi = r.curve.all.at(-1) - r.curve.all[bi]
if (!(lo < 0 && hi < 0)) throw new Error('an end of the range fits as well as the app\'s offset')
g.def('LossAtMin', fixed(-lo, 4)).def('LossAtMax', fixed(-hi, 4))
g.def('RatioAtMin', percent(Math.exp(-lo) - 1, 1)).def('RatioAtMax', percent(Math.exp(-hi) - 1, 1))
const tops = r.top1.all
g.def('TopMin', percent(Math.min(...tops), 1)).def('TopMax', percent(Math.max(...tops), 1))
// The looks beside it: the gains a different offset would bring each part, against the app's.
const gain = (c) => Math.max(...c) - c[bi]
g.def('GainHim', fixed(gain(r.curve.him), 4)).def('GainOpp', fixed(gain(r.curve.opponents), 4)).def('GainLow', fixed(gain(r.byRating[0].curve), 4))
if (!(r.bestBySide.him.interval[1] < r.bestBySide.opponents.interval[0])) throw new Error("the player's and his opponents' intervals overlap: the paper says they do not")
if (!(r.bestBySide.him.offset < r.base && r.bestBySide.opponents.offset > r.base)) throw new Error('the sides no longer pull apart around the app\'s offset')
if (!(r.byRating[0].best > r.base && r.byRating[1].best === r.base && r.byRating[2].best === r.base)) throw new Error('the thirds no longer read as the paper says')
// The paper says no offset fits both sides better than the app's: whatever helps one side hurts the other.
r.offsets.forEach((o, oi) => {
  if (oi === bi) return
  const him = r.curve.him[oi] - r.curve.him[bi], opp = r.curve.opponents[oi] - r.curve.opponents[bi]
  if ((opp > 0 && !(him < 0)) || (him > 0 && !(opp < 0))) throw new Error(`offset ${o} fits one side better without fitting the other worse`)
})

// ---- the curve, relative to the app's offset ----
const rel = (c) => r.offsets.map((o, oi) => `(${o},${(c[oi] - c[bi]).toFixed(5)})`).join(' ')
g.def('CurveFit', rel(r.curve.fit)).def('CurveHeld', rel(r.curve.held)).def('CurveAll', rel(r.curve.all))
g.def('CurveHim', rel(r.curve.him)).def('CurveOpp', rel(r.curve.opponents))
for (const [name, x] of [['Low', r.byRating[0]], ['Mid', r.byRating[1]], ['High', r.byRating[2]]]) {
  g.def(`Curve${name}`, rel(x.curve))
  g.def(`${name}From`, String(x.from)).def(`${name}To`, String(x.to)).def(`${name}Moves`, count(x.moves))
  g.def(`${name}Best`, String(x.best)).def(`${name}Lo`, String(x.interval[0])).def(`${name}Hi`, String(x.interval[1]))
}

// ---- the table: every offset ----
const mark = (o) => (o === r.base && o === r.fitted ? ' (app, fitted)' : o === r.base ? ' (app)' : o === r.fitted ? ' (fitted)' : '')
g.block('OffsetTable', [
  '\\begin{tabular}{lrrrr}',
  '\\toprule',
  'offset & fitting half & held-out half & all games & first choice \\\\',
  '\\midrule',
  ...r.offsets.map((o, oi) => `${o}${mark(o)} & ${fixed(r.curve.fit[oi], 4)} & ${fixed(r.curve.held[oi], 4)} & ${fixed(r.curve.all[oi], 4)} & ${percent(r.top1.all[oi], 1)}\\% \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))

// ---- the looks beside the verdict: by side and by the mover's rating ----
g.block('LookTable', [
  '\\begin{tabular}{lrrl}',
  '\\toprule',
  'moves & count & best offset & 95\\% interval over draws \\\\',
  '\\midrule',
  `all & ${count(d.moves)} & ${r.bestOverAll.offset} & ${r.bestOverAll.interval[0]} to ${r.bestOverAll.interval[1]} \\\\`,
  `the player's & ${count(d.himMoves)} & ${r.bestBySide.him.offset} & ${r.bestBySide.him.interval[0]} to ${r.bestBySide.him.interval[1]} \\\\`,
  `his opponents' & ${count(d.moves - d.himMoves)} & ${r.bestBySide.opponents.offset} & ${r.bestBySide.opponents.interval[0]} to ${r.bestBySide.opponents.interval[1]} \\\\`,
  ...r.byRating.map((x) => `movers rated ${x.from} to ${x.to} & ${count(x.moves)} & ${x.best} & ${x.interval[0]} to ${x.interval[1]} \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))

// ---- one of the player's moves at three offsets ----
// The player's move whose probability moves most, in points, between the lowest and the highest offset.
const dir = privateDir(FLOW)
const moves = jsonl(join(dir, 'positions.jsonl'))
const pairs = new Map()
for (const f of readdirSync(dir).filter((f) => /^policies-\d+-of-\d+\.jsonl$/.test(f))) for (const p of jsonl(join(dir, f))) pairs.set(p.k, p.pairs)
const SHOWN = [LICHESS_OFFSET_RANGE.min, DEFAULT_LICHESS_OFFSET, LICHESS_OFFSET_RANGE.max]
const probAt = (m, o) => {
  const s = defaultMaiaElo(m.r, o), so = defaultMaiaElo(m.ro, o)
  const p = pairs.get(m.k).find((x) => x.s === s && x.o === so)
  return p.ps[p.i]
}
let pick = null
for (const m of moves) {
  if (!m.me) continue
  const swing = Math.abs(probAt(m, SHOWN[2]) - probAt(m, SHOWN[0]))
  if (!pick || swing > pick.swing) pick = { m, swing }
}
const ex = pick.m
const engine = (await chess('src/adapters/node/engine/index.ts')).createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false })
const { position } = await chess('src/core/chess/index.ts')
const sanOf = (fen, uci) => new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
const rows = []
for (const o of SHOWN) {
  const s = defaultMaiaElo(ex.r, o), so = defaultMaiaElo(ex.ro, o)
  const hp = await engine.humanPolicy(position(ex.fen), { bands: [s], opponentBand: so })
  if (hp === 'unavailable') throw new Error('Maia unavailable')
  const policy = hp.bands[0].policy
  const top = Object.entries(policy).sort((a, b) => b[1] - a[1])[0]
  if (Math.abs(policy[ex.uci] - probAt(ex, o)) > 1e-5) throw new Error(`Maia gives the example another probability at offset ${o} than policies.mts recorded`)
  rows.push({ o, s, so, played: policy[ex.uci], top: top[0], topP: top[1] })
}
engine.dispose()
// The paper says the stronger the bands, the surer Maia-2 is of the move he chose.
if (!(rows[0].played < rows[1].played && rows[1].played < rows[2].played)) throw new Error("the example's probability does not rise with the bands")
const [, side, , , , full] = ex.fen.split(' ')
const moveTex = (uci) => `${side === 'w' ? `${full}.~` : `${full}\\ldots{}`}${figurine(sanOf(ex.fen, uci))}`
const bandName = (b) => (b < MAIA_ELO_START ? `<${MAIA_ELO_START}` : b >= MAIA_ELO_END ? `${MAIA_ELO_END}+` : String(b))
g.def('ExampleRating', String(ex.r)).def('ExampleOppRating', String(ex.ro)).def('ExamplePlayed', moveTex(ex.uci))
g.def('ExampleLowP', percent(rows[0].played, 0)).def('ExampleHighP', percent(rows[2].played, 0))
g.input('Example', 'example', [
  '\\noindent\\begin{minipage}[t]{0.37\\textwidth}\\vspace{0pt}',
  board(ex.fen, { played: ex.uci, size: '12pt' }),
  '\\end{minipage}\\hfill',
  '\\begin{minipage}[t]{0.6\\textwidth}\\vspace{0pt}\\small\\setlength{\\tabcolsep}{4pt}',
  `\\textbf{Played:} ${moveTex(ex.uci)} (red), by the player at ${ex.r} against ${ex.ro}.\\par\\smallskip`,
  '\\begin{tabular}{rllrl}',
  '\\toprule',
  'offset & his band & opponent\'s & played & Maia-2\'s first choice \\\\',
  '\\midrule',
  ...rows.map((x) => `${x.o} & ${esc(bandName(x.s))} & ${esc(bandName(x.so))} & ${percent(x.played, 1)}\\% & ${moveTex(x.top)}, ${percent(x.topP, 1)}\\% \\\\`),
  '\\bottomrule',
  '\\end{tabular}\\par\\smallskip',
  `\\textbf{UCI:} played \\uci{${ex.uci}}; first choices ${rows.map((x) => `\\uci{${x.top}}`).join(', ')}\\par`,
  `\\textbf{FEN:} \\fen{${ex.fen}}`,
  '\\end{minipage}%',
].join('\n'))

g.write(join(HERE, 'generated.tex'))
console.log(`wrote ${join(HERE, 'generated.tex')}`)
process.exit(0)
