// Prints a few app-pool mates that the strict back-rank reading calls a back-rank mate,
// with and without Lichess's tag, to read the disagreement on the board.
//
//   bridge/run.sh models/coach-narrator/coach-eval/line-tactics-peek.mjs [count]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { CHESS_DIR } from '../../../bridge/lib/chess.mjs'

const count = Number(process.argv[2] ?? 6)
const b = JSON.parse(readFileSync(join(CHESS_DIR, 'src/data/puzzles.json'), 'utf8'))
const pool = [...new Map((Array.isArray(b) ? b : Object.values(b).flat()).map((p) => [p.id, p])).values()]
const shown = { tagged: 0, untagged: 0 }
for (const p of pool) {
  const ucis = p.moves.split(' ')
  const g = new Chess(p.fen)
  for (const u of ucis) g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
  if (!g.isCheckmate()) continue
  const loser = g.turn()
  const winner = loser === 'w' ? 'b' : 'w'
  const king = g.board().flat().find((c) => c && c.type === 'k' && c.color === loser).square
  const back = loser === 'w' ? '1' : '8'
  if (king[1] !== back) continue
  const along = g.attackers(king, winner).some((s) => ['r', 'q'].includes(g.get(s).type) && s[1] === back)
  const front = loser === 'w' ? '2' : '7'
  const files = [-1, 0, 1].map((d) => king.charCodeAt(0) - 97 + d).filter((f) => f >= 0 && f < 8)
  const fronts = files.map((f) => String.fromCharCode(97 + f) + front)
  if (!along || !fronts.every((s) => g.get(s)?.color === loser)) continue
  const tagged = p.themes.includes('backRankMate')
  const key = tagged ? 'tagged' : 'untagged'
  if (shown[key] >= count) continue
  shown[key]++
  console.log(key.padEnd(9), p.id, '| mate position', g.fen(), '| themes', p.themes, '| line', ucis.slice(1).join(' '))
  if (shown.tagged >= count && shown.untagged >= count) break
}
process.exit(0)
