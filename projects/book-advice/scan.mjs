// The positions 1b to 1e read, by the README's rules: one pass over
// band-above's builds and his archive, drawing each test's seeded sample.
//
//   bridge/run.sh projects/book-advice/scan.mjs
//
// Writes the drawn positions to private/book-advice/scan-<test>.json (they
// carry game ids) and the counts behind each draw to results/scan.json.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { MONTH, archiveGames, bandOf, playerGames, playerSeries, records, sample, seeded } from './lib.mjs'

const K = await chess('src/services/knowledge/index.ts')
const P = await chess('src/services/livecoach/praise.ts')

const PRIVATE = privateDir('book-advice')
const SEED = 20261015
const GROUPS = ['his', 'above', 'archive']
const DRAW = {
  king: { games: 8000, perArchiveGame: 10 },
  trades: { moves: 1500 },
  retreats: { games: 3000, perGame: 10, archive: 6000 },
  practical: { games: 800 },
}
const SWING_PLIES = 6
const SWING_WP = 30
const BEHIND_CP = -250
const MATE_CP = 9000
const PRAISE_LINE = K.PRAISE_LOSS_PCT
const WIN_BEFORE = 55

const pool = () => Object.fromEntries(GROUPS.map((k) => [k, []]))
const king = pool()
const trades = pool()
const missedTrades = []
const retreats = pool()
const practical = pool()

function read(group, x) {
  const { g, id } = x
  const key = `${id}:${g.color}`
  const fens = K.replayFens(g.moves.map((m) => m.san))
  if (fens.length !== g.moves.length + 1) return
  const { wp, cp } = playerSeries(g)
  const n = g.moves.length
  const mine = g.moves.filter((m) => m.mover === 'me')
  const who = { id, color: g.color, rating: x.rating, oppRating: x.oppRating }
  const pick = (list, k, tag) => sample(list, k, Math.floor(seeded(`${tag}:${key}`)() * 2 ** 32))

  const kingPlies = mine.filter((m) => !m.book && !m.inCheck && m.phase !== 'endgame' && wp[m.ply] !== null)
  const kingRows = pick(kingPlies, group === 'archive' ? DRAW.king.perArchiveGame : 1, 'king').map((m) => {
    let low = null
    for (let j = m.ply + 1; j <= Math.min(n, m.ply + SWING_PLIES); j++) if (wp[j] !== null) low = low === null ? wp[j] : Math.min(low, wp[j])
    return { ...who, ply: m.ply, fen: fens[m.ply], phase: m.phase, wp: wp[m.ply], swing: low !== null && low <= wp[m.ply] - SWING_WP }
  })
  if (kingRows.length) king[group].push(kingRows)

  let wonGame = false
  for (const m of mine) {
    if (wonGame && m.captured !== null && K.PIECE_VALUE[m.piece] === K.PIECE_VALUE[m.captured] && m.uci) {
      const trade = P.evenTrade(fens[m.ply], m.san)
      if (trade) {
        trades[group].push({
          ...who,
          ply: m.ply,
          san: m.san,
          fenBefore: fens[m.ply],
          fenAfter: fens[m.ply + 1],
          moves: g.moves.slice(0, m.ply + 1).map((x) => x.uci),
          history: g.moves.slice(0, m.ply + 1).map((x) => x.san),
          lossPct: m.lossPct,
          nextPhase: g.moves[m.ply + 2]?.phase ?? null,
        })
      }
    }
    if (m.evalAfter !== null) wonGame = K.wonGameActive({ cp: g.color === 'w' ? m.evalAfter : -m.evalAfter, mate: null }, fens[m.ply + 1], g.color)
  }
  if (group === 'archive') {
    for (const m of mine) {
      if (m.book || m.lossPct === null || m.lossPct < PRAISE_LINE || m.wpBefore === null || m.wpBefore < WIN_BEFORE || !m.uci) continue
      missedTrades.push({ ...who, ply: m.ply, fen: fens[m.ply], played: m.uci, lossPct: m.lossPct, winBefore: m.wpBefore })
    }
  }

  const retreatPlies = mine.filter((m) => !m.book && m.legalMoves !== null && m.legalMoves >= 2 && m.lossPct !== null && m.uci)
  const retreatRows = pick(retreatPlies, group === 'archive' ? Infinity : DRAW.retreats.perGame, 'retreats').map((m) => ({
    ...who,
    ply: m.ply,
    fen: fens[m.ply],
    played: m.uci,
    lossPct: m.lossPct,
  }))
  if (retreatRows.length) retreats[group].push(retreatRows)

  const lostPlies = mine.filter((m) => !m.book && m.legalMoves !== null && m.legalMoves >= 2 && m.uci && cp[m.ply] !== null && cp[m.ply] <= BEHIND_CP && cp[m.ply] > -MATE_CP)
  const lost = pick(lostPlies, 1, 'practical')[0]
  if (lost) {
    const after = cp[lost.ply + 1]
    const reply = lost.ply + 2 <= n ? cp[lost.ply + 2] : null
    practical[group].push({
      ...who,
      ply: lost.ply,
      fen: fens[lost.ply],
      played: lost.uci,
      saved: g.score >= 0.5,
      behindAfter: after !== null && after <= BEHIND_CP,
      threwAway: after === null || reply === null || after > BEHIND_CP ? null : reply > BEHIND_CP,
    })
  }
}

let playerGamesRead = 0
for await (const rec of records()) {
  for (const pg of playerGames(rec)) {
    playerGamesRead++
    const band = bandOf(pg.rating)
    if (band) read(band, pg)
  }
}
const { games, skipped } = await archiveGames()
for (const x of games) read('archive', x)

const counts = {}
const out = {}
for (const group of GROUPS) {
  const his = group === 'archive'
  const k = his ? king[group] : sample(king[group], DRAW.king.games, SEED)
  const t = his ? trades[group] : sample(trades[group], DRAW.trades.moves, SEED + 1)
  const r = his ? sample(retreats[group].flat(), DRAW.retreats.archive, SEED + 2) : sample(retreats[group], DRAW.retreats.games, SEED + 2)
  const p = his ? practical[group] : sample(practical[group], DRAW.practical.games, SEED + 3)
  out[group] = { king: k.flat(), trades: t, retreats: r.flat(), practical: p }
  counts[group] = {
    king: { playerGames: king[group].length, drawnGames: k.length, positions: k.flat().length },
    trades: { moves: trades[group].length, drawn: t.length },
    retreats: { playerGames: retreats[group].length, positions: retreats[group].flat().length, drawn: r.flat().length },
    practical: { playerGames: practical[group].length, drawn: p.length },
  }
}
counts.archive.missedTrades = missedTrades.length

for (const test of ['king', 'trades', 'retreats', 'practical']) {
  writeFileSync(join(PRIVATE, `scan-${test}.json`), JSON.stringify(Object.fromEntries(GROUPS.map((k) => [k, out[k][test]]))) + '\n')
}
writeFileSync(join(PRIVATE, 'scan-missed-trades.json'), JSON.stringify(missedTrades) + '\n')
const summary = { app: CHESS_DIR.split('/').pop(), month: MONTH, seed: SEED, draw: DRAW, playerGamesRead, archive: { games: games.length, skipped }, counts }
writeFileSync(join(resultsDir('book-advice'), 'scan.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
