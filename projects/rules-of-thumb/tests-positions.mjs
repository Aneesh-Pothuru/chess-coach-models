// Synthetic board checks only. Expected findings come from the pinned app's
// technique/insight fixtures, including concepts that emit note or concession.
import assert from 'node:assert/strict'
import { RULES, rulesOfMove, availabilityOf, drawPosition, emptyRules, cappedRows, splitsOf, describePosition, bandOf } from './detect.mjs'
import { sansOf } from './positions.mjs'

const cases = [
  ['active-king', '8/pp4k1/8/8/8/8/6P1/R5K1 w - - 0 1', 'g1f2', true],
  ['active-king', '8/pp4k1/8/8/8/8/6P1/R5K1 w - - 0 1', 'g1h1', false],
  ['opposition', '8/8/8/4k3/8/2PK4/8/8 w - - 0 1', 'd3e3', true],
  ['opposition', '8/8/8/4k3/8/2P5/3K4/8 w - - 0 1', 'd2e2', false],
  ['square-rule', '8/8/8/8/P6k/8/8/7K w - - 0 1', 'a4a5', true],
  ['square-rule', '8/8/8/8/P3k3/8/8/7K w - - 0 1', 'a4a5', false],
  ['rook-behind-passer', '6k1/8/8/P7/8/8/6K1/7R w - - 0 1', 'h1a1', true],
  ['rook-behind-passer', '6k1/8/5b2/P7/8/8/6K1/7R w - - 0 1', 'h1a1', false],
  ['cut-off-king', '8/6k1/8/1P6/8/8/3K4/R6r w - - 0 1', 'a1e1', true],
  ['cut-off-king', '8/4p1k1/8/1P6/8/8/3K4/R6r w - - 0 1', 'a1e1', false],
  ['outside-passer', '8/6k1/8/1p6/P7/8/4PP2/6K1 w - - 0 1', 'a4b5', false],
  ['outside-passer', '8/6k1/8/1p6/P7/8/4PP2/6K1 w - - 0 1', 'e2e3', false],
  ['trade-when-ahead', 'r3k3/pp3ppp/2n5/1B6/8/8/PP3PPP/R3K2R w KQq - 0 1', 'b5c6', false],
  ['trade-when-ahead', 'r3k2r/pp3ppp/2n5/1B6/8/8/PP3PPP/R3K2R w KQkq - 0 1', 'b5c6', false],
  ['lucena', '1K6/2P1k3/8/8/8/8/r7/3R4 w - - 0 1', 'b8c8', false],
  ['lucena', '2K5/2P2k2/8/8/8/8/r7/3R4 w - - 0 1', 'd1d2', false],
  ['philidor', '4k3/r7/8/4K3/4P3/8/8/7R b - - 0 1', 'a7a6', false],
  ['philidor', '4k3/8/r7/4K3/4P3/8/8/7R b - - 0 1', 'a6b6', false],
  ['open-file', '4k3/pp3ppp/8/8/8/8/PP3PPP/R3K3 w - - 0 1', 'a1d1', true],
  ['open-file', '4k3/pp3ppp/8/8/8/8/PP3PPP/R3K3 w - - 0 1', 'a1b1', false],
  ['rook-on-the-seventh', '6k1/pp3pp1/8/8/8/8/PP4PP/3R2K1 w - - 0 1', 'd1d7', true],
  ['rook-on-the-seventh', '8/8/6k1/8/8/8/8/R5K1 w - - 0 1', 'a1a7', false],
  ['outpost', 'r5k1/pp3pp1/8/8/4P3/2N5/PP3PPP/R5K1 w - - 0 1', 'c3d5', true],
  ['outpost', 'r3k3/ppp2ppp/8/8/4P3/2N5/PP3PPP/4K3 w - - 0 1', 'c3d5', false],
  ['pawn-break', 'rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3', 'c7c5', true],
  ['pawn-break', 'rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'f2f4', false],
  ['passed-pawn', '4k3/7p/8/8/P7/8/8/4K3 w - - 0 1', 'a4a5', true],
  ['passed-pawn', '4k3/p7/8/8/P7/8/8/4K3 w - - 0 1', 'a4a5', false],
  ['bishop-pair', 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1', 'b5c6', false],
  ['bishop-pair', 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1', 'b5a4', false],
  ['king-shelter', '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'h2h4', false],
  ['king-shelter', '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'h2h3', false],
  ['worst-piece', '7k/8/8/8/8/8/4P3/N5K1 w - - 0 1', 'a1b3', true],
  ['worst-piece', '8/8/8/2k5/8/8/4P3/N5K1 w - - 0 1', 'a1b3', false],
]
for (const [rule, fen, uci, expected] of cases) assert.equal(rulesOfMove(fen, uci).includes(rule), expected, `${rule}: ${fen} ${uci}`)
assert.deepEqual(new Set(cases.map((x) => x[0])), new Set(RULES))

// Confirm note-tone examples are genuinely recognized but fail the gain gate.
const { chess } = await import('../../bridge/lib/chess.mjs')
const K = await chess('src/services/knowledge/index.ts')
for (const rule of ['outside-passer', 'lucena', 'philidor', 'bishop-pair']) {
  const [, fen, uci] = cases.find((x) => x[0] === rule)
  assert(K.describeMove(fen, uci).findings.some((f) => f.conceptId === rule && f.tone === 'note'))
}
const full = availabilityOf('7k/8/8/8/8/8/4P3/N5K1 w - - 0 1')
assert.equal(full.legalMoves, describePosition('7k/8/8/8/8/8/4P3/N5K1 w - - 0 1').board.movesShared().length)
assert(full.ruleMoves['worst-piece'].includes('a1b3'))
for (const [rule, moves] of Object.entries(full.ruleMoves)) for (const move of moves) assert(rulesOfMove('7k/8/8/8/8/8/4P3/N5K1 w - - 0 1', move).includes(rule))

const options = Array.from({ length: 100 }, (_, ply) => ({ ply }))
const one = drawPosition('synthetic-game', 'active-king', options)
assert.equal(drawPosition('synthetic-game', 'active-king', options), one)
assert.equal(drawPosition('synthetic-game', 'active-king', []), null)
assert.equal(drawPosition('synthetic-game', 'active-king', [options[0]]), options[0])
assert.notEqual(drawPosition('synthetic-game', 'opposition', options).ply, one.ply)
assert.notEqual(drawPosition('synthetic-other', 'active-king', options).ply, one.ply)
// Independently reproduce the uniform-index selection from the named PRNG.
assert.equal(one.ply, 88)
const cap = emptyRules()
const rows = Array.from({ length: 4002 }, (_, gameIndex) => ({ gameIndex, rule: 'active-king' }))
const kept = cappedRows(rows, cap)
assert.equal(kept.length, 4000)
assert.equal(kept.at(-1).gameIndex, 3999)
assert.equal(cappedRows([{ rule: 'opposition' }], cap).length, 1)
assert.equal(cappedRows(rows, cap).length, 0)
assert.equal(cappedRows(rows, emptyRules()).length, 4000)

assert.equal(bandOf(1249), null)
assert.equal(bandOf(1250), 1300)
assert.equal(bandOf(1449), 1300)
assert.equal(bandOf(1450), 1500)
assert.equal(bandOf(1649), 1500)
assert.equal(bandOf(1650), null)
assert.equal(splitsOf('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1').material, 'ahead')
assert.equal(splitsOf('6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1').material, 'behind')
assert.equal(splitsOf('6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1').material, 'level')
assert.equal(splitsOf('6k1/5ppp/q7/8/8/8/5PPP/6K1 w - - 0 1').kingDanger, true)
assert.deepEqual(sansOf('1. e4 { [%clk 0:10:00] } 1... e5 2.Nf3?! Nc6 $1 1-0'), ['e4', 'e5', 'Nf3', 'Nc6'])
console.log(JSON.stringify({ synthetic: true, ruleCases: cases.length, rules: RULES.length, checks: 'detection, gain filter, legal-move availability, seeded draw, caps, bands, splits, movetext' }))
