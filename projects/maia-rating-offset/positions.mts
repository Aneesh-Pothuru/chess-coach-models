// The moves the offset is fitted on: every move of the archive's games that the
// Maia protocol counts (the eleventh ply on, both clocks at 30 seconds or more
// at the position), with the position before it, the move in UCI, both
// players' ratings and the half its game falls in. Reads the archive through
// the app's archive service, at the pinned commit.
//
//   bridge/run.sh projects/maia-rating-offset/positions.mts
import fs from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'

const MIN_PLY = 11
const MIN_CLOCK = 30

const { nodeArchive } = await chess('src/adapters/node/archive/index.ts')
const { toGame } = await chess('src/services/archive/index.ts')
const { replaySans } = await chess('src/core/chess/index.ts')

const archive = nodeArchive({ root: CHESS_DIR, keyCache: false })
const records = await archive.query({ owner: 'any' })

const skips: Record<string, number> = {}
const skip = (why: string) => (skips[why] = (skips[why] ?? 0) + 1)

interface Usable { id: string; ended: number; game: any }
const usable: Usable[] = []
for (const record of records) {
  const game = toGame(record)
  if (game.variant !== 'standard' || game.initialFen) { skip('not from the standard start'); continue }
  if (typeof game.white.rating !== 'number' || typeof game.black.rating !== 'number') { skip('a rating missing'); continue }
  if (!game.clocks || game.clocks.length < game.sans.length || game.clocks.slice(0, game.sans.length).some((c: number | null) => typeof c !== 'number')) { skip('a clock missing'); continue }
  usable.push({ id: record.id, ended: game.endedAt ?? record.at, game })
}

// Ordered by when they ended (the id breaks a tie), alternating between the halves.
usable.sort((a, b) => a.ended - b.ended || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

const moves: object[] = []
const games: object[] = []
usable.forEach(({ id, game }, g) => {
  const half = g % 2 === 0 ? 'fit' : 'held'
  const line = replaySans('startpos', game.sans)
  if (line.ucis.length < game.sans.length) skip('a move that does not replay (the legal prefix is kept)')
  const clocks = game.clocks as number[]
  let counted = 0
  for (let i = MIN_PLY - 1; i < line.ucis.length; i++) {
    // The mover's clock after its previous move and the opponent's after its last one.
    if (clocks[i - 2] < MIN_CLOCK || clocks[i - 1] < MIN_CLOCK) continue
    const mover = i % 2 === 0 ? 'w' : 'b'
    const r = mover === 'w' ? game.white.rating : game.black.rating
    const ro = mover === 'w' ? game.black.rating : game.white.rating
    moves.push({ k: moves.length, g, half, ply: i + 1, fen: line.fens[i], uci: line.ucis[i], mover, me: game.me === mover, r, ro })
    counted++
  }
  games.push({ g, id, half, plies: line.ucis.length, counted, white: game.white.rating, black: game.black.rating, me: game.me })
})

const dir = privateDir('maia-rating-offset')
fs.writeFileSync(join(dir, 'positions.jsonl'), moves.map((m) => JSON.stringify(m)).join('\n') + '\n')
fs.writeFileSync(join(dir, 'games.json'), JSON.stringify(games, null, 1))
const count = (half: string) => ({ games: games.filter((x: any) => x.half === half).length, moves: moves.filter((x: any) => x.half === half).length })
console.log(JSON.stringify({ archived: records.length, games: games.length, moves: moves.length, fit: count('fit'), held: count('held'), skips }, null, 1))
