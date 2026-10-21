// Invented games and rows only. Maia and the referee are never invoked.
import assert from 'node:assert/strict'
import { chess } from '../../bridge/lib/chess.mjs'
import { seeded } from '../rules-of-thumb/detect.mjs'
import { K, UNITS } from './readings.mjs'
import { draw, emptyCoverage, positionSplits, readGame } from './scan.mjs'
import { selectGames } from './select.mjs'
const C = await chess('src/core/chess/index.ts')

let passed = 0
const test = async (name, fn) => { await fn(); passed++; console.log(`ok ${name}`) }
const game = (i, units = ['tension'], band = 1300) => {
  const coverage = emptyCoverage(); coverage.games = 1; coverage.plies = 10
  const g = { key: `2026-07:synthetic${i}`, game: `synthetic${i}`, gameIndex: i, month: '2026-07', coverage, drawn: [] }
  for (const unit of units) {
    Object.assign(coverage.units[unit], { situation: 3, splits: 2, gamesWithSplit: 1, splitFollowFirst: 1, splitBreakFirst: 1 })
    g.drawn.push({ key: `${g.key}:8`, datasetKind: 'tiebreak-rules', game: g.game, gameIndex: i, month: g.month, ply: 8,
      fen: 'synthetic', band, units: [{ unit, F: 'a2a3', B: 'b2b3', stratum: i % 2 ? 'break-first' : 'follow-first' }] })
  }
  return g
}
await test('draw uses the predecessor seed and exactly game NUL unit', () => {
  const rows = ['a', 'b', 'c', 'd', 'e']
  assert.equal(draw('synthetic', 'tension', rows), rows[Math.floor(seeded('synthetic\0tension')() * rows.length)])
  assert.equal(draw('synthetic', 'tension', rows), draw('synthetic', 'tension', rows))
  assert.equal(draw('synthetic', 'tension', []), null)
})
await test('one candidate is drawn unchanged', () => {
  const row = { arbitrary: 1 }; assert.equal(draw('synthetic', 'hang', [row]), row)
})
await test('caps use original game order across both shards and both bands', () => {
  const result = selectGames([game(3), game(1, ['tension'], 1500), game(2), game(0)], 2)
  assert.deepEqual(result.rows.map(r => r.gameIndex), [0, 1])
  assert.equal(result.coverage.units.tension.gamesWithSplit, 4)
  assert.equal(result.coverage.units.tension.kept, 2)
  assert.equal(result.coverage.units.tension.followFirst, 1)
  assert.equal(result.coverage.units.tension.breakFirst, 1)
})
await test('caps are independent for units', () => {
  const result = selectGames([game(0, ['tension']), game(1, ['tension', 'hang']), game(2, ['hang'])], 1)
  assert.equal(result.rows.length, 2)
  assert.equal(result.coverage.units.tension.kept, 1)
  assert.equal(result.coverage.units.hang.kept, 1)
})
await test('same occurrence shares one row across retained units', () => {
  const result = selectGames([game(0, ['hang', 'tension'])])
  assert.equal(result.rows.length, 1)
  assert.deepEqual(result.rows[0].units.map(u => u.unit), ['tension', 'hang'])
})
await test('identical FENs in separate occurrences stay separate', () => {
  assert.equal(selectGames([game(0), game(1)]).rows.length, 2)
})
await test('duplicates and missing draws are rejected', () => {
  assert.throws(() => selectGames([game(0), game(0)]), /duplicate/)
  const g = game(0); g.drawn.push(g.drawn[0]); assert.throws(() => selectGames([g]), /duplicate/)
  g.drawn = []; assert.throws(() => selectGames([g]), /coverage/)
})
await test('shared occurrence must agree on its original reading', () => {
  const g = game(0, ['tension', 'hang']); g.drawn[1].band = 1500
  assert.throws(() => selectGames([g]), /readings differ/)
})
await test('an initial-position header skips and counts the game', async () => {
  const g = { ...game(0), initialFen: 'any supplied initial position', sans: [], whiteElo: 1300, blackElo: 1500 }
  const r = await readGame(g, { humanPolicy: () => { throw new Error('must not call Maia') } })
  assert.equal(r.coverage.skippedInitial, 1); assert.equal(r.coverage.games, 1)
  assert.equal(r.times.maiaCalls, 0); assert.deepEqual(r.drawn, [])
})
await test('early plies never call Maia', async () => {
  const r = await readGame({ ...game(0), sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'], whiteElo: 1300, blackElo: 1500 },
    { humanPolicy: () => { throw new Error('must not call Maia') } })
  assert.equal(r.coverage.plies, 8); assert.equal(r.times.maiaCalls, 0)
})
const opening = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'b5', 'Bb3', 'Be7', 'Re1', 'd6', 'c3', 'O-O', 'h3', 'Nb8', 'd4', 'Nbd7', 'a4', 'Bb7']
await test('the positive scan asks only the mover band and never a referee', async () => {
  let calls = 0
  const eng = { humanPolicy: async (position, options) => {
    calls++
    assert.equal(options.bands.length, 1)
    assert.ok([1300, 1500].includes(options.opponentBand))
    const fen = C.fenOf(position)
    const legal = K.boardOf(fen).movesShared().map(m => m.uci)
    return { bands: [{ band: options.bands[0], policy: Object.fromEntries(legal.map(m => [m, 1 / legal.length])) }] }
  }, bestMoves: () => { throw new Error('referee forbidden') }, scoreMove: () => { throw new Error('referee forbidden') } }
  const r = await readGame({ ...game(0), sans: opening, whiteElo: 1300, blackElo: 1500 }, eng)
  assert.ok(calls > 0); assert.equal(calls, r.coverage.positionsInAUnit)
  assert.equal(calls, r.times.maiaCalls); assert.equal(calls, r.coverage.maiaCalls)
  assert.ok(!JSON.stringify(r).includes('sound'))
  for (const row of r.drawn) assert.equal(row.key, `${row.month}:${row.game}:${row.ply}`)
})
await test('Maia failure leaves the game pending with its attempted-call time', async () => {
  await assert.rejects(readGame({ ...game(0), sans: opening, whiteElo: 1300, blackElo: 1500 },
    { humanPolicy: async () => 'unavailable' }), e => e.message === 'Maia unavailable' && e.times.maiaCalls === 1)
})
await test('bad replay refuses a changed sample', async () => {
  await assert.rejects(readGame({ ...game(0), sans: ['e4', 'not-a-move'], whiteElo: 1300, blackElo: 1500 }, {}), /replay stopped/)
})
await test('guard runs before any reading and preserves timing on failure', async () => {
  await assert.rejects(readGame({ ...game(0), sans: [] }, {}, { guard: () => { throw new Error('stop now') } }), e => e.message === 'stop now' && e.times.rowSeconds >= 0)
})
await test('split attributes are read from the compared capture', () => {
  const b = K.boardOf('rnbqkb1r/pp3ppp/3p4/2p1p3/2BnP3/2NPBN2/PPP2PPP/R2Q1RK1 w kq - 0 8')
  const s = positionSplits(b, 'trades-ahead', 'h2h3', 'e3d4', 1300, 0.2, 0.1, K.phaseOf(b.fen))
  assert.equal(s.tradePiece, 'n'); assert.equal(s.close, true); assert.equal(s.tensionCentral, null)
})
await test('all eight units have independent coverage counters', () => {
  const c = emptyCoverage(); c.units.tension.situation = 7
  assert.equal(Object.keys(c.units).length, UNITS.length); assert.equal(c.units.hang.situation, 0)
})
console.log(`${passed} passed`)
