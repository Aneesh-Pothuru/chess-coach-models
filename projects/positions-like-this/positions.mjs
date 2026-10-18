import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import {
  ABOVE,
  CLOCK_FLOOR,
  MIN_LEGAL,
  MIN_MEN,
  OFFSET,
  PROJECT,
  START_CLOCK,
  WIN_HIGH,
  WIN_LOW,
  clockBefore,
  gitCommit,
  menOf,
  tenMinutes,
} from './lib.mjs'

const E = await chess('src/services/engine/index.ts')
const Sc = await chess('src/core/score/index.ts')
const C = await chess('src/core/chess/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const { parseTimeControl } = await chess('src/core/game/index.ts')
const { ARCHIVE_SUBDIR, loadArchiveGames } = await chess('src/adapters/node/archive/days.ts')

const skipped = {}
const skip = (why) => {
  skipped[why] = (skipped[why] ?? 0) + 1
}

const games = loadArchiveGames({ dir: join(CHESS_DIR, ARCHIVE_SUBDIR) })
  .filter((g) => {
    if (tenMinutes(g, parseTimeControl)) return true
    skip('game: not 10 minutes')
    return false
  })
  .sort((a, b) => a.endTime - b.endTime)
const firstHalf = Math.ceil(games.length / 2)

const positions = []
for (let gi = 0; gi < games.length; gi++) {
  const g = games[gi]
  if (typeof g.myRating !== 'number' || typeof g.oppRating !== 'number') {
    skip('game: no ratings')
    continue
  }
  const myColor = g.meIsWhite ? 'w' : 'b'
  const replayed = C.replaySans(C.START_FEN, g.sans ?? [])
  if (replayed.ucis.length !== (g.sans?.length ?? 0)) skip('game: does not replay to the end')
  for (let ply = 0; ply < replayed.ucis.length; ply++) {
    const fen = replayed.fens[ply]
    if (fen.split(' ')[1] !== myColor) continue
    if (K.phaseOf(fen) === 'opening') {
      skip('opening')
      continue
    }
    const board = new Chess(fen)
    if (board.isCheck()) {
      skip('in check')
      continue
    }
    if (board.moves().length < MIN_LEGAL) {
      skip('one legal move')
      continue
    }
    if (menOf(fen) < MIN_MEN) {
      skip('under eight men')
      continue
    }
    const ev = g.evals?.[ply]
    if (typeof ev !== 'number') {
      skip('no evaluation')
      continue
    }
    const wp = Sc.lichessWinPercent(ev)
    if (wp < WIN_LOW || wp > WIN_HIGH) {
      skip('decided')
      continue
    }
    const clock = clockBefore(g.clocks, ply, START_CLOCK)
    if (clock === null) {
      skip('no clock')
      continue
    }
    if (clock < CLOCK_FLOOR) {
      skip('clock under the floor')
      continue
    }
    positions.push({
      id: positions.length,
      gi,
      half: gi < firstHalf ? 0 : 1,
      ply,
      fen,
      history: replayed.ucis.slice(0, ply),
      played: replayed.ucis[ply],
      myColor,
      phase: K.phaseOf(fen),
      hisBand: E.defaultMaiaElo(g.myRating, OFFSET),
      plusBand: E.defaultMaiaElo(g.myRating + ABOVE, OFFSET),
      oppBand: E.defaultMaiaElo(g.oppRating, OFFSET),
    })
  }
}

writeFileSync(join(privateDir(PROJECT), 'his-candidates.jsonl'), positions.map((p) => JSON.stringify(p)).join('\n') + '\n')
const count = (h) => positions.filter((p) => p.half === h).length
const summary = {
  app: { commit: gitCommit(CHESS_DIR), archive: ARCHIVE_SUBDIR },
  games: games.length,
  halves: [firstHalf, games.length - firstHalf],
  dates: [games[0], games[firstHalf - 1], games[firstHalf], games.at(-1)].map((g) => new Date(g.endTime * 1000).toISOString().slice(0, 10)),
  candidates: positions.length,
  byHalf: [count(0), count(1)],
  skipped,
}
writeFileSync(join(resultsDir(PROJECT), 'positions.json'), JSON.stringify(summary, null, 2) + '\n')
console.error(JSON.stringify(summary))
