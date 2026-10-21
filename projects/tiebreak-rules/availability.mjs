// Before the rule: how often each unit's situation, and a split of the two moves
// Maia-2 rates most likely, come up in June 2026 games, a month outside the study's.
// It reads Maia-2 and the board only: no move is scored and no soundness is read.
// Maia-2 reads the entering positions in at least one unit's situation, as the scan
// will. Writes results/availability.json and results/availability.md.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chess, CHESS_DIR, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { CONTROL, K, UNITS, entersScan, hangReading, inControlSituation, labelOf, split, topTwo, unitsOf } from './readings.mjs'

const C = await chess('src/core/chess/index.ts')
const Node = await chess('src/adapters/node/engine/index.ts')
const input = join(privateDir('tiebreak-rules'), 'june', 'games.jsonl')
const games = readFileSync(input, 'utf8').trim().split('\n').map(JSON.parse)
const band = elo => (elo <= 1449 ? 1300 : 1500)
const CLOSE = 0.5
const eng = Node.createNodeEngine({ root: CHESS_DIR, pool: 1, tablebase: false, evalCache: false })

const tally = Object.fromEntries(UNITS.map(u => [u, { situation: 0, splits: 0, followFirst: 0, breakFirst: 0, close: 0, games: 0 }]))
let plies = 0, entered = 0, inAUnit = 0, inARule = 0, maiaCalls = 0, maiaSeconds = 0
const started = performance.now()
for (const game of games) {
  const fens = K.replayFens(game.sans)
  const splitIn = new Set()
  for (let i = 0; i < game.sans.length && i + 1 < fens.length; i++) {
    plies++
    const board = K.boardOf(fens[i]), facts = K.describePosition(fens[i])
    if (!entersScan(board, facts, i, game.sans[i - 1])) continue
    entered++
    const units = unitsOf(board, facts)
    if (!Object.keys(units).length) continue
    inAUnit++
    const control = inControlSituation(units)
    if (control) inARule++
    const mover = board.turn
    const moverElo = mover === 'w' ? game.whiteElo : game.blackElo
    const opponentElo = mover === 'w' ? game.blackElo : game.whiteElo
    const t = performance.now()
    const h = await eng.humanPolicy(C.position(fens[i]), { bands: [band(moverElo)], opponentBand: band(opponentElo) })
    maiaCalls++
    maiaSeconds += (performance.now() - t) / 1000
    if (h === 'unavailable') throw new Error('Maia unavailable')
    const policy = h.bands[0].policy
    const two = topTwo(policy, board.movesShared().map(m => m.uci))
    if (control) units[CONTROL] = hangReading(board, two)
    const close = policy[two[1]] >= CLOSE * policy[two[0]]
    for (const [unit, reading] of Object.entries(units)) {
      const row = tally[unit]
      row.situation++
      const s = split(labelOf(reading, two[0]), labelOf(reading, two[1]))
      if (!s) continue
      row.splits++
      row[s.stratum === 'follow-first' ? 'followFirst' : 'breakFirst']++
      if (close) row.close++
      splitIn.add(unit)
    }
  }
  for (const unit of splitIn) tally[unit].games++
}

const out = {
  month: '2026-06',
  app: CHESS_DIR.split('/').pop(),
  filter: 'rated standard 600+0, both players 1250-1649 on Lichess, ended normally or on time, 30 plies or more, file order',
  games: games.length,
  plies,
  positionsEntering: entered,
  positionsInAUnit: inAUnit,
  positionsInARule: inARule,
  maiaCalls,
  maiaSecondsPerCall: +(maiaSeconds / maiaCalls).toFixed(4),
  scanSeconds: +((performance.now() - started) / 1000).toFixed(1),
  units: tally,
}
const dir = resultsDir('tiebreak-rules')
writeFileSync(join(dir, 'availability.json'), JSON.stringify(out, null, 2) + '\n')
const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : 'n/a')
const lines = [
  '# Before the rule: how often each unit comes up',
  '',
  `June 2026 Lichess games (a month outside the study's), ${out.filter}: ${out.games} games, ${out.plies} positions, ${out.positionsEntering} entering the scan (from ply 8, after a move that captured nothing, quiet), ${out.positionsInAUnit} of them in at least one unit's situation and ${out.positionsInARule} in at least one rule unit's. App \`${out.app}\`. Maia-2 at the mover's band read each entering position in at least one unit's situation, ${out.maiaSecondsPerCall} s a call. Nothing was scored.`,
  '',
  '| Unit | In its situation | Split | Follow first | Break first | Close calls | Games with a split |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...UNITS.map(u => {
    const r = tally[u]
    return `| \`${u}\` | ${r.situation} | ${r.splits} | ${r.followFirst} | ${r.breakFirst} | ${pct(r.close, r.splits)} | ${r.games} (${pct(r.games, out.games)}) |`
  }),
  '',
  `A position splits when one of the two moves Maia-2 rates most likely follows the unit's rule and the other breaks it. A close call: the second move's probability is at least ${CLOSE} of the first's. The control's situation is every entering position in at least one rule unit's situation.`,
  '',
]
writeFileSync(join(dir, 'availability.md'), lines.join('\n'))
console.log(lines.join('\n'))
process.exit(0)
