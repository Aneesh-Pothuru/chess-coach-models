// Synthetic board checks only. Expected findings come from the pinned app's
// technique/insight fixtures, including concepts that emit note or concession.
import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { privateDir } from '../../bridge/lib/chess.mjs'
import { RULES, ALTERNATIVE_RULES, rulesOfMove, availabilityOf, drawPosition, emptyRules, emptyAlternativeRules, cappedRows, splitsOf, describePosition, bandOf } from './detect.mjs'
import { sansOf, buildGame, validateRecord, worker, merge } from './positions.mjs'

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
for (const rule of ALTERNATIVE_RULES) {
  const [, fen, uci] = cases.find((x) => x[0] === rule)
  const mover = describePosition(fen).turn
  assert(K.describeMove(fen, uci).findings.some((f) => f.conceptId === rule && f.actor === mover && f.tone === 'note'))
  const both = availabilityOf(fen)
  assert.equal(both.ruleMoves[rule].length, 0)
  assert(both.alternativeRuleMoves[rule].includes(uci))
  for (const [id, moves] of Object.entries(both.alternativeRuleMoves)) {
    assert(ALTERNATIVE_RULES.includes(id))
    for (const move of moves) assert(K.describeMove(fen, move).findings.some((f) => f.conceptId === id && f.actor === mover && f.tone === 'note'))
  }
  const [, negativeFen, negativeUci] = cases.filter((x) => x[0] === rule)[1]
  assert(!availabilityOf(negativeFen).alternativeRuleMoves[rule].includes(negativeUci))
}
assert(!ALTERNATIVE_RULES.includes('king-shelter'))
assert(!Object.hasOwn(availabilityOf(cases.find((x) => x[0] === 'king-shelter')[1]).alternativeRuleMoves, 'king-shelter'))
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
const alternativeCap = emptyAlternativeRules()
assert.equal(cappedRows(Array.from({ length: 4002 }, (_, gameIndex) => ({ gameIndex, rule: 'lucena', datasetKind: 'alternative' })), alternativeCap).length, 4000)
assert.equal(cap.lucena, 0)
assert.equal(cappedRows([{ rule: 'lucena', datasetKind: 'literal' }], cap).length, 1)

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

// A synthetic game confirms all pre-move readings survive JSON persistence,
// and its two definitions are drawn from their own chronological positions.
const syntheticInput = { id: 'synthetic-game', whiteElo: 1300, blackElo: 1500, initialFen: '7k/8/8/8/8/8/P7/R5K1 w - - 0 1', moves: Array.from({ length: 30 }, (_, i) => ['a1b1', 'h8h7', 'b1a1', 'h7h8'][i % 4]) }
const synthetic = buildGame(syntheticInput, 0, '2026-07')
assert.equal(synthetic.positionAvailability.length, 30)
assert.equal(synthetic.counts.positions, 30)
assert(synthetic.rows.every((r) => r.datasetKind === 'literal'))
assert(synthetic.alternativeRows.every((r) => r.datasetKind === 'alternative'))
assert(synthetic.positionAvailability.every((p) => p.literalRuleMoves && p.alternativeRuleMoves))
validateRecord(JSON.parse(JSON.stringify(synthetic)), 0)
assert.throws(() => validateRecord(synthetic, 1), /out-of-order/)
const missingReadings = structuredClone(synthetic)
missingReadings.positionAvailability.pop()
assert.throws(() => validateRecord(missingReadings, 0), /per-position/)
const wrongKind = structuredClone(synthetic)
assert(wrongKind.rows.length > 0)
wrongKind.rows[0].datasetKind = 'alternative'
assert.throws(() => validateRecord(wrongKind, 0), /saved draw/)
const wrongDraw = structuredClone(synthetic)
wrongDraw.rows[0].ply++
assert.throws(() => validateRecord(wrongDraw, 0), /saved draw/)
const noteInput = { id: 'synthetic-note', whiteElo: 1300, blackElo: 1500, initialFen: '4k3/1p5p/2n5/1B6/8/8/7P/4KB2 w - - 0 20', moves: ['b5c6', 'b7c6', ...Array.from({ length: 28 }, (_, i) => ['e1f2', 'e8d7', 'f2e1', 'd7e8'][i % 4])] }
const noteGame = buildGame(noteInput, 2, '2026-07')
validateRecord(noteGame, 2)
assert(noteGame.alternativeRows.some((r) => r.rule === 'bishop-pair' && r.ply === 0 && r.ruleMoves.includes('b5c6')))
assert(!noteGame.rows.some((r) => r.rule === 'bishop-pair'))
assert.equal(noteGame.counts.alternativeAvailableGames['bishop-pair'], 1)
assert.equal(noteGame.counts.availableGames['bishop-pair'], 0)
const mixedRows = structuredClone(noteGame)
mixedRows.rows.push(mixedRows.alternativeRows[0])
assert.throws(() => validateRecord(mixedRows, 2), /draw without|saved draw/)

// Exercise the actual journal and merge paths using synthetic games only.
// Resume repairs an unfinished final line, reuses completed games and keeps
// the two output streams separate even when shards finish out of order.
const testDir = mkdtempSync(join(privateDir('rules-of-thumb'), 'test-positions-'))
try {
  const input = join(testDir, 'games-2026-07.jsonl.gz')
  const bytes = gzipSync([syntheticInput, noteInput].map((g) => JSON.stringify(g) + '\n').join(''))
  writeFileSync(input, bytes)
  const config = { dir: testDir, input, inputGames: 2, inputSha256: createHash('sha256').update(bytes).digest('hex'), month: '2026-07', run: 'slice' }
  await worker(config, 1, 2)
  await worker(config, 0, 2)
  const journal = join(testDir, 'availability-2026-07-0of2.jsonl')
  const original = readFileSync(journal)
  appendFileSync(journal, '{"gameIndex":')
  await worker(config, 0, 2)
  assert.deepEqual(readFileSync(journal), original)
  const resumed = JSON.parse(readFileSync(`${journal}.complete.json`, 'utf8'))
  assert.equal(resumed.resumed, 1)
  assert.equal(resumed.built, 0)
  await merge(config, 2, 0)
  const readRows = (file) => gunzipSync(readFileSync(join(testDir, file))).toString().trim().split('\n').filter(Boolean).map(JSON.parse)
  const literalRows = readRows('positions-2026-07.jsonl.gz')
  const alternativeRows = readRows('positions-alternative-2026-07.jsonl.gz')
  assert(literalRows.every((r) => r.datasetKind === 'literal'))
  assert(alternativeRows.length > 0 && alternativeRows.every((r) => r.datasetKind === 'alternative' && ALTERNATIVE_RULES.includes(r.rule)))
  assert(literalRows.every((r, i) => i === 0 || r.gameIndex >= literalRows[i - 1].gameIndex))
  const literalManifest = JSON.parse(readFileSync(join(testDir, 'positions-2026-07.json'), 'utf8'))
  const alternativeManifest = JSON.parse(readFileSync(join(testDir, 'positions-alternative-2026-07.json'), 'utf8'))
  assert.equal(literalManifest.datasetKind, 'literal')
  assert.equal(alternativeManifest.datasetKind, 'alternative')
  assert.equal(literalManifest.keptPositions, literalRows.length)
  assert.equal(alternativeManifest.keptPositions, alternativeRows.length)
  assert.equal(literalManifest.availability.all.positions, 60)
  assert.equal(alternativeManifest.availability.all.positions, 60)
  assert.equal(literalManifest.availableGames['bishop-pair'], 0)
  assert.equal(alternativeManifest.availableGames['bishop-pair'], 1)
  assert.equal(literalManifest.outputSha256, createHash('sha256').update(readFileSync(join(testDir, 'positions-2026-07.jsonl.gz'))).digest('hex'))
  assert.equal(alternativeManifest.outputSha256, createHash('sha256').update(readFileSync(join(testDir, 'positions-alternative-2026-07.jsonl.gz'))).digest('hex'))
} finally {
  rmSync(testDir, { recursive: true, force: true })
}
console.log(JSON.stringify({ synthetic: true, ruleCases: cases.length, rules: RULES.length, alternativeRules: ALTERNATIVE_RULES.length, checks: 'detection, gain and note isolation, every-position persistence, seeded draws, separate caps, journal order and resume, sharded merge, content hashes, bands, splits, movetext' }))
