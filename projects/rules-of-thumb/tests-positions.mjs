// Synthetic board, migration and resume checks. No real games or outcomes.
import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { chess, LAB_DIR, privateDir } from '../../bridge/lib/chess.mjs'
import { RULES, ORIGINAL_RULES, LEGACY_NOTE_RULES, rulesOfMove, availabilityOf, drawPosition, emptyRules, cappedRows, splitsOf, describePosition, bandOf, sparseMoves } from './detect.mjs'
import { sansOf, buildGame, validateRecord, worker, merge, shaFile, journalPath, emptyCounts, scannerVersion } from './positions.mjs'
import { migrateRecord, backfillWorker, mergeBackfill } from './backfill.mjs'
const K = await chess('src/services/knowledge/index.ts')
const { squaresToGo } = await chess('src/services/knowledge/facts/activity.ts')

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
  ['outside-passer', '8/6k1/8/1p6/P7/8/4PP2/6K1 w - - 0 1', 'a4b5', true],
  ['outside-passer', '8/6k1/8/1p6/P7/8/4PP2/6K1 w - - 0 1', 'e2e3', false],
  ['trade-when-ahead', '3rk3/1p6/2n5/8/3N4/8/8/3RK2R w K - 0 1', 'd4c6', true],
  ['trade-when-ahead', 'r3k2r/pp3ppp/2n5/1B6/8/8/PP3PPP/R3K2R w KQkq - 0 1', 'b5c6', false],
  ['lucena', '1K6/2P1k3/8/8/8/8/r7/3R4 w - - 0 1', 'b8c8', true],
  ['lucena', '2K5/2P2k2/8/8/8/8/r7/3R4 w - - 0 1', 'd1d2', false],
  ['philidor', '4k3/r7/8/4K3/4P3/8/8/7R b - - 0 1', 'a7a6', true],
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
  ['worst-piece', '7k/8/8/8/8/8/4P3/N5K1 w - - 0 1', 'a1b3', true],
  ['worst-piece', '8/8/8/2k5/8/8/4P3/N5K1 w - - 0 1', 'a1b3', false],
  ['lucena', '2K5/2P5/3k4/8/8/8/r7/3R4 b - - 0 1', 'd6e6', false],
  ['philidor', '4k3/8/r3K3/8/4P3/8/8/7R w - - 0 1', 'e6e5', false],
]
for (const [rule, fen, uci, expected] of cases) assert.equal(rulesOfMove(fen, uci).includes(rule), expected, `${rule}: ${fen} ${uci}`)
assert.deepEqual(new Set(cases.map((x) => x[0])), new Set(RULES))
assert.equal(RULES.length, 15)
for (const removed of ['bishop-pair', 'king-shelter']) assert(!RULES.includes(removed))
for (const rule of ['lucena', 'philidor']) {
  const [, fen, uci] = cases.filter((x) => x[0] === rule).at(-1)
  assert(K.describeMove(fen, uci).findings.some((f) => f.conceptId === rule && f.actor === K.boardOf(fen).turn && f.tone === 'note'))
  const full = availabilityOf(fen)
  assert(!full.ruleMoves[rule].includes(uci))
  assert(full.audit.noteSideFilter[rule].rawMoves > full.audit.noteSideFilter[rule].keptMoves)
}
const ownerTrade = cases.find((x) => x[0] === 'trade-when-ahead')
assert(!K.describeMove(ownerTrade[1], ownerTrade[2]).findings.some((f) => f.conceptId === 'trade-when-ahead'))
assert(availabilityOf(ownerTrade[1]).ruleMoves['trade-when-ahead'].includes(ownerTrade[2]))
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
assert.equal(one.ply, 88)
const cap = emptyRules()
const rows = Array.from({ length: 4002 }, (_, gameIndex) => ({ gameIndex, rule: 'active-king' }))
const kept = cappedRows(rows, cap)
assert.equal(kept.length, 4000)
assert.equal(kept.at(-1).gameIndex, 3999)
assert.equal(cappedRows([{ rule: 'opposition' }], cap).length, 1)
assert.equal(cappedRows(rows, cap).length, 0)
assert.equal(cappedRows(rows, emptyRules()).length, 4000)
assert.throws(() => cappedRows([{ rule: 'bishop-pair' }], cap), /removed/)
for (const [rating, band] of [[1249, null], [1250, 1300], [1449, 1300], [1450, 1500], [1649, 1500], [1650, null]]) assert.equal(bandOf(rating), band)
assert.equal(splitsOf('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1').material, 'ahead')
assert.equal(splitsOf('6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1').material, 'behind')
assert.equal(splitsOf('6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1').material, 'level')
assert.deepEqual(sansOf('1. e4 { [%clk 0:10:00] } 1... e5 2.Nf3?! Nc6 $1 1-0'), ['e4', 'e5', 'Nf3', 'Nc6'])

// Produce the old journal definition on synthetic positions using only the
// same app readers as the original scan. Real journals are never redescribed.
function oldPosition(fen, ply, game = 'synthetic-old', gameIndex = 0) {
  const facts = K.describePosition(fen)
  const literal = Object.fromEntries(ORIGINAL_RULES.map((r) => [r, []]))
  const alternative = Object.fromEntries(LEGACY_NOTE_RULES.map((r) => [r, []]))
  for (const move of facts.board.movesShared()) {
    const findings = K.describeMove(fen, move.uci).findings
    for (const rule of ORIGINAL_RULES.filter((r) => r !== 'worst-piece')) if (findings.some((f) => f.conceptId === rule && f.actor === facts.turn && f.tone === 'gain')) literal[rule].push(move.uci)
    for (const rule of LEGACY_NOTE_RULES) if (findings.some((f) => f.conceptId === rule && f.actor === facts.turn && f.tone === 'note')) alternative[rule].push(move.uci)
    const worst = facts.side[facts.turn].activity.worstPiece
    if (worst?.square === move.from) {
      const mobility = squaresToGo(facts.board.child(move), move.to)
      if (mobility !== null && mobility > worst.moves) literal['worst-piece'].push(move.uci)
    }
  }
  for (const map of [literal, alternative]) for (const moves of Object.values(map)) moves.sort()
  return { game, gameIndex, month: '2026-07', band: 1300, opponentBand: 1500, fen, ply, A: facts.board.movesShared()[0].uci, legalMoves: facts.board.movesShared().length, literalRuleMoves: sparseMoves(literal), alternativeRuleMoves: sparseMoves(alternative) }
}
function oldRecord(positionAvailability) {
  const { game, gameIndex, month } = positionAvailability[0]
  return { game, gameIndex, month, positionAvailability, rows: [], alternativeRows: [], counts: { games: 1, plies: 30, positions: positionAvailability.length, legalMoves: positionAvailability.reduce((sum, p) => sum + p.legalMoves, 0), describeMoveCalls: positionAvailability.reduce((sum, p) => sum + p.legalMoves, 0), timing: { seconds: 1, describeMoveSeconds: .8, worstPieceSeconds: .1, splitsSeconds: .1 } } }
}
const migrationFixture = oldRecord([ownerTrade[1], cases.find((x) => x[0] === 'outside-passer')[1], ...['lucena', 'philidor'].flatMap((r) => [cases.find((x) => x[0] === r)[1], cases.filter((x) => x[0] === r).at(-1)[1]])].map((fen, ply) => oldPosition(fen, ply)))
const provenance = { manifestSha256: 'synthetic-manifest', legacyScannerVersion: 'synthetic-old-code', legacyJournalSha256: 'synthetic-journal' }
const migrated = migrateRecord(migrationFixture, 0, provenance)
assert.equal(migrated.counts.timing.freshDescribeMoveCalls, 0)
assert.equal(migrated.counts.timing.describeMoveCallsReused, migrationFixture.counts.legalMoves)
assert(migrated.counts.timing.tradeReaderCalls > 0)
assert(migrated.counts.timing.splitsRead > 0)
assert(migrated.rows.some((r) => r.rule === 'trade-when-ahead'))
for (const position of migrated.positionAvailability) assert.deepEqual(position.ruleMoves, sparseMoves(availabilityOf(position.fen).ruleMoves))
const withSplits = structuredClone(migrationFixture)
withSplits.rows = migrated.rows
const reused = migrateRecord(withSplits, 0, provenance)
assert.equal(reused.counts.timing.splitsRead, 0)
assert.equal(reused.counts.timing.splitsReused, reused.rows.length)
const missing = structuredClone(migrationFixture)
delete missing.positionAvailability[0].alternativeRuleMoves
assert.throws(() => migrateRecord(missing, 0, provenance), /missing its saved definition/)
const syntheticInput = { id: 'synthetic-game', whiteElo: 1300, blackElo: 1500, initialFen: '7k/8/8/8/8/8/P7/R5K1 w - - 0 1', moves: Array.from({ length: 30 }, (_, i) => ['a1b1', 'h8h7', 'b1a1', 'h7h8'][i % 4]) }
const synthetic = buildGame(syntheticInput, 0, '2026-07')
assert.equal(synthetic.positionAvailability.length, 30)
validateRecord(JSON.parse(JSON.stringify(synthetic)), 0)
assert.throws(() => validateRecord(synthetic, 1), /out-of-order/)
const wrongKind = structuredClone(synthetic)
wrongKind.rows[0].datasetKind = 'alternative'
assert.throws(() => validateRecord(wrongKind, 0), /saved draw/)
const wrongDraw = structuredClone(synthetic)
wrongDraw.rows[0].ply++
assert.throws(() => validateRecord(wrongDraw, 0), /saved draw/)

// Resume a partially written migration, then continue normal scanning; no
// amended prefix is redescribed and no alternative output is generated.
const testDir = mkdtempSync(join(privateDir('rules-of-thumb'), 'test-positions-'))
try {
  const input = join(testDir, 'games-2026-07.jsonl.gz')
  const bytes = gzipSync([syntheticInput, { ...syntheticInput, id: 'synthetic-second' }].map((g) => JSON.stringify(g) + '\n').join(''))
  writeFileSync(input, bytes)
  const archived = join(testDir, 'legacy.jsonl')
  const legacy = oldRecord(synthetic.positionAvailability.map((p) => oldPosition(p.fen, p.ply, syntheticInput.id, 0)))
  writeFileSync(archived, JSON.stringify(legacy) + '\n' + '{"incomplete":')
  const source = { shard: 0, path: relative(LAB_DIR, archived), sha256: await shaFile(archived), games: 1, positions: 30, partialTrailingBytes: 14 }
  assert.equal(Buffer.byteLength('{"incomplete":'), 14)
  const config = { dir: testDir, input, inputGames: 2, inputSha256: createHash('sha256').update(bytes).digest('hex'), month: '2026-07', run: 'slice', migrationManifestSha256: 'synthetic-manifest', migrationManifest: { legacyScannerVersion: 'synthetic-old-code', months: { '2026-07': { inputSha256: createHash('sha256').update(bytes).digest('hex'), shards: 2, journals: [source, { shard: 1, path: relative(LAB_DIR, join(testDir, 'empty.jsonl')), sha256: createHash('sha256').update('').digest('hex'), games: 0, positions: 0, partialTrailingBytes: 0 }] } } } }
  writeFileSync(join(testDir, 'empty.jsonl'), '')
  await backfillWorker(config, 0, 2)
  const journal = journalPath(config, 0, 2)
  const original = readFileSync(journal)
  appendFileSync(journal, '{"gameIndex":')
  const resumed = await backfillWorker(config, 0, 2)
  assert.equal(resumed.built, 0)
  assert.equal(resumed.resumed, 1)
  assert.deepEqual(readFileSync(journal), original)
  assert.equal(await shaFile(archived), source.sha256)
  await backfillWorker(config, 1, 2)
  const backfill = mergeBackfill(config, 2, 0)
  assert.equal(backfill.games, 1)
  assert.equal(backfill.positions, 30)
  assert.equal(backfill.timing.freshDescribeMoveCalls, 0)
  await worker(config, 1, 2)
  await worker(config, 0, 2)
  assert.deepEqual(readFileSync(journal), original)
  await backfillWorker(config, 1, 2) // Safe even after fresh games follow.
  await merge(config, 2, 0)
  const keptRows = gunzipSync(readFileSync(join(testDir, 'positions-2026-07.jsonl.gz'))).toString().trim().split('\n').filter(Boolean).map(JSON.parse)
  assert(keptRows.every((r) => r.datasetKind === 'amended' && RULES.includes(r.rule)))
  assert(keptRows.every((r, i) => i === 0 || r.gameIndex >= keptRows[i - 1].gameIndex))
  const manifest = JSON.parse(readFileSync(join(testDir, 'positions-2026-07.json'), 'utf8'))
  assert.equal(manifest.datasetKind, 'amended')
  assert.equal(manifest.keptPositions, keptRows.length)
  assert.equal(manifest.availability.all.positions, 60)
  assert.equal(manifest.migration.backfilledGames, 1)
  assert.equal(manifest.timing.backfilledPositions, 30)
  assert.equal(manifest.outputSha256, await shaFile(join(testDir, 'positions-2026-07.jsonl.gz')))
  assert(!existsSync(join(testDir, 'positions-alternative-2026-07.jsonl.gz')))
  const absent = { ...config, month: '2026-08' }
  const noSource = await backfillWorker(absent, 0, 2)
  assert.equal(noSource.complete, true)
  assert.equal(noSource.games, 0)
  assert.equal(noSource.positions, 0)
} finally { rmSync(testDir, { recursive: true, force: true }) }
console.log(JSON.stringify({ synthetic: true, ruleCases: cases.length, rules: RULES.length, scannerVersion: scannerVersion(), checks: 'amended detectors, wrong-side notes, owner trade, seeded draws, caps, removed-rule rejection, every-position persistence, migration equivalence and split reuse, partial-tail resume, sharded merge, content hashes, absent-month no-op' }))
