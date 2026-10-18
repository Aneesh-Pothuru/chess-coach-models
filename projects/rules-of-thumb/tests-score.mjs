// Synthetic referee checks. No engine, Maia model, real game or study measure.
// Run with bridge/run.sh projects/rules-of-thumb/tests-score.mjs.
import assert from 'node:assert/strict'
import { chess } from '../../bridge/lib/chess.mjs'
import { engineSound, pick, readRow, tablebaseSound } from './score.mjs'

const K = await chess('src/services/knowledge/index.ts')
const E = await chess('src/services/engine/index.ts')
const S = await chess('src/core/score/index.ts')
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const END = '8/8/8/8/8/4k3/8/R3K3 w - - 0 1'
const score = cp => ({ cp, mate: null })
const best = (s = score(0)) => ({ complete: true, partial: false, completion: 'complete', lines: [{ score: s }] })
const read = (uci, s = score(0)) => ({ best: uci, pv: [uci], score: s,
  partial: false, completion: 'complete', status: 'exact', coherent: true })
const legalAt = fen => K.boardOf(fen).movesShared().map(m => m.uci)
const row = (fen = START, more = {}) => ({ month: 'synthetic', game: 'synthetic', rule: 'synthetic',
  fen, band: 1300, opponentBand: 1500, A: legalAt(fen)[0], ruleMoves: [legalAt(fen)[1]], splits: {}, ...more })
let checks = 0
function test(name, fn) {
  try { fn(); checks++ } catch (error) { error.message = `${name}: ${error.message}`; throw error }
}
async function testAsync(name, fn) {
  try { await fn(); checks++ } catch (error) { error.message = `${name}: ${error.message}`; throw error }
}

test('ties use lexical UCI order, independent of candidate order', () => {
  assert.equal(pick({ h2h3: .4, a2a3: .4, e2e4: .2 }, ['h2h3', 'a2a3', 'e2e4']), 'a2a3')
  assert.equal(pick({ h2h3: .4, a2a3: .4 }, ['a2a3', 'h2h3']), 'a2a3')
  assert.throws(() => pick({}, []))
  assert.throws(() => pick({ a2a3: 1 }, ['a2a3', 'h2h3']))
  assert.throws(() => pick({ a2a3: NaN }, ['a2a3']))
})
test('the referee delegates its window and both colors to the app', () => {
  for (const mover of ['w', 'b']) for (const cp of [-100, -33, -32, 0, 32, 33, 100]) {
    assert.equal(engineSound(read('a2a3', score(cp)), best(), mover),
      E.acceptsAlternative(score(cp), score(0), mover, E.ACCEPT_WINDOW_WP))
  }
  assert.equal(engineSound(read('a2a3', score(-100)), best(), 'w'), false)
  assert.equal(engineSound(read('a7a6', score(-100)), best(), 'b'), true)
  assert.equal(engineSound(read('a7a6', score(100)), best(), 'b'), false)
  assert.equal(engineSound(read('a2a3', score(-32)), best(), 'w'), true)
  assert.equal(engineSound(read('a2a3', score(-33)), best(), 'w'), false)
})
test('inexact, absent and unfinished readings fail instead of becoming unsound', () => {
  for (const change of [{ partial: true }, { completion: 'deadline' }, { status: 'bound' },
    { coherent: false }, { score: null }, { score: { cp: null, mate: null } },
    { score: { cp: 0, mate: null, bound: 'upper' } }, { score: { cp: null, mate: 0 } }]) {
    assert.throws(() => engineSound({ ...read('a2a3'), ...change }, best(), 'w'))
  }
  for (const change of [{ complete: false }, { partial: true }, { completion: 'deadline' }, { lines: [] },
    { lines: [{ score: { cp: 0, mate: null, bound: 'lower' } }] }]) {
    assert.throws(() => engineSound(read('a2a3'), { ...best(), ...change }, 'w'))
  }
  assert.equal(S.isExactScore({ cp: null, mate: 0 }), false)
})
test('tablebase moves are from the opponent POV and use the default outcome policy', () => {
  const probe = { category: 'win', moves: [{ uci: 'a1a2', category: 'loss' }, { uci: 'a1b1', category: 'draw' }] }
  assert.equal(tablebaseSound(probe, 'a1a2'), true)
  assert.equal(tablebaseSound(probe, 'a1b1'), false)
  assert.equal(tablebaseSound({ category: 'loss', moves: [{ uci: 'a1a2', category: 'win' }] }, 'a1a2'), true)
  assert.equal(tablebaseSound({ category: 'cursed-win', moves: [{ uci: 'a1a2', category: 'blessed-loss' }] }, 'a1a2'), true)
  assert.equal(tablebaseSound({ category: 'cursed-win', moves: [{ uci: 'a1a2', category: 'draw' }] }, 'a1a2'), false)
  assert.equal(tablebaseSound({ category: 'syzygy-win', moves: [{ uci: 'a1a2', category: 'syzygy-loss' }] }, 'a1a2'), true)
  assert.throws(() => tablebaseSound(null, 'a1a2'))
  assert.throws(() => tablebaseSound(probe, 'a1c1'))
  assert.throws(() => tablebaseSound({ category: 'unknown', moves: [{ uci: 'a1a2', category: 'loss' }] }, 'a1a2'))
  assert.throws(() => tablebaseSound({ category: 'win', moves: [{ uci: 'a1a2', category: 'unknown' }] }, 'a1a2'))
})

function mockEngine(fen, options = {}) {
  const calls = []
  const legal = legalAt(fen)
  const policy = Object.fromEntries(legal.map(m => [m, 1 / legal.length]))
  return {
    calls,
    async humanPolicy(pos, opts) {
      calls.push({ method: 'humanPolicy', opts })
      return { bands: opts.bands.map(band => ({ band, policy: { ...policy, ...options.policy } })), legalCount: legal.length }
    },
    async bestMoves(pos, opts) {
      calls.push({ method: 'bestMoves', opts })
      return options.best ?? best()
    },
    async scoreMove(pos, uci, opts) {
      calls.push({ method: 'scoreMove', uci, opts })
      return options.read ? options.read(uci) : read(uci)
    },
    async tablebase() {
      calls.push({ method: 'tablebase' })
      return options.probe === undefined ? { category: 'draw', moves: legal.map(uci => ({ uci, category: 'draw' })) } : options.probe
    },
  }
}
const outcomePoison = new Proxy({}, { get(_target, property) {
  if (property === 'then') return undefined
  throw new Error(`timing touched an outcome: ${String(property)}`)
} })
const noConversion = () => new Proxy(score(0), { has(target, property) {
  // core/score's conversions test isEvaluation with `kind in score`;
  // isExactScore only validates score fields and does not do that.
  if (property === 'kind') throw new Error('timing converted a score into a deciding value')
  return Reflect.has(target, property)
} })
await testAsync('timing engine branch validates status but cannot convert scores or write moves', async () => {
  const mock = mockEngine(START, { best: best(noConversion()), read: uci => read(uci, noConversion()) })
  const result = await readRow(mock, row(), true)
  assert.deepEqual(Object.keys(result).sort(), ['key', 'times'])
  assert.equal(result.times.maiaCalls, 1)
  assert.equal(result.times.bestCalls, 1)
  assert.equal(result.times.tablebaseCalls, 0)
  assert.ok(result.times.scoreCalls >= 1 && result.times.scoreCalls <= 3)
  assert.equal(mock.calls.find(c => c.method === 'bestMoves').opts.budget, 'grade')
  assert.equal(mock.calls.find(c => c.method === 'bestMoves').opts.multiPv, 1)
  for (const c of mock.calls.filter(c => c.method === 'scoreMove')) assert.equal(c.opts.budget, 'grade')
})
await testAsync('timing tablebase branch never reads the probe outcome', async () => {
  const mock = mockEngine(END, { probe: outcomePoison })
  const result = await readRow(mock, row(END), true)
  assert.deepEqual(Object.keys(result).sort(), ['key', 'times'])
  assert.equal(result.times.tablebaseCalls, 1)
  assert.equal(result.times.tablebaseUnavailable, 0)
  assert.equal(result.times.bestCalls, 0)
  assert.equal(result.times.scoreCalls, 0)
  assert.equal(mock.calls.some(c => c.method === 'bestMoves' || c.method === 'scoreMove'), false)
})
await testAsync('missing tablebase is counted during timing and refuses real scoring', async () => {
  const timed = await readRow(mockEngine(END, { probe: null }), row(END), true)
  assert.equal(timed.times.tablebaseUnavailable, 1)
  await assert.rejects(readRow(mockEngine(END, { probe: null }), row(END), false), /missing tablebase outcome/)
})
await testAsync('R is modal within the rule; N is modal over every legal move; A remains played', async () => {
  const source = row(START, { band: 1500, opponentBand: 1300, A: 'd2d4', ruleMoves: ['h2h3', 'a2a3'] })
  const mock = mockEngine(START, { policy: { h2h3: .2, a2a3: .2, e2e4: .4 } })
  const result = await readRow(mock, source, false)
  assert.equal(result.R, 'a2a3')
  assert.equal(result.N, 'e2e4')
  assert.equal(result.A, 'd2d4')
  assert.equal(result.probabilityRAtHisBand, .2)
  assert.equal(result.times.maiaBands, 2)
  assert.deepEqual(new Set(mock.calls[0].opts.bands), new Set([1300, 1500]))
  assert.equal(mock.calls[0].opts.opponentBand, 1300)
  assert.deepEqual(mock.calls.filter(c => c.method === 'scoreMove').map(c => c.uci), ['a2a3', 'e2e4', 'd2d4'])
})
await testAsync('identical R N A share one requested move reading', async () => {
  const mock = mockEngine(START, { policy: { a2a3: 1 } })
  const result = await readRow(mock, row(START, { A: 'a2a3', ruleMoves: ['a2a3'] }), false)
  assert.equal(result.times.scoreCalls, 1)
  assert.deepEqual(result.sound, { R: true, N: true, A: true })
})
await testAsync('scoreMove must return its own root', async () => {
  await assert.rejects(readRow(mockEngine(START, { read: () => read('synthetic-wrong-root') }), row(), false), /requested root/)
})
await testAsync('illegal recorded moves stop before any instrument request', async () => {
  const mock = mockEngine(START)
  await assert.rejects(readRow(mock, row(START, { A: 'a2a5' }), false), /illegal candidate/)
  assert.equal(mock.calls.length, 0)
})
console.log(JSON.stringify({ syntheticRefereeChecks: checks, engineProcesses: 0, maiaModels: 0, realGames: 0 }))
