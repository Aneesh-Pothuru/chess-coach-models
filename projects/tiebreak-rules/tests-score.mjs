// Synthetic records and instrument stubs only: no engine, Maia or HTTP requests.
import assert from 'node:assert/strict'
import { chess } from '../../bridge/lib/chess.mjs'
import { K } from './readings.mjs'
import { bestLine, createEngine, movesToScore, readPosition, requireInstruments, validatePosition } from './score.mjs'

const E = await chess('src/services/engine/index.ts')
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const END = '8/8/8/8/8/4k3/8/R3K3 w - - 0 1'
const BLACK = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1'
const score = cp => ({ cp, mate: null })
const best = (uci, cp = 0) => ({ best: uci, complete: true, partial: false, completion: 'complete',
  lines: [{ move: uci, pv: [uci], score: score(cp) }] })
const reading = (uci, cp = 0) => ({ best: uci, pv: [uci], score: score(cp), partial: false,
  completion: 'complete', status: 'exact', coherent: true })
function fixture(fen = START) {
  const board = K.boardOf(fen), legalMoves = board.movesShared().map(move => move.uci).sort()
  const row = { key: '2026-07:synthetic-referee:8', month: '2026-07', game: 'synthetic-referee', gameIndex: 0,
    ply: 8, fen, mover: board.turn, band: 1300, opponentBand: 1500, played: legalMoves[2], legalMoves,
    M1: legalMoves[0], M2: legalMoves[1], p1: 0.3, p2: 0.2, units: [] }
  const unit = (id, first = true) => ({ unit: id, F: first ? row.M1 : row.M2, B: first ? row.M2 : row.M1,
    stratum: first ? 'follow-first' : 'break-first', probabilities: { F: first ? row.p1 : row.p2, B: first ? row.p2 : row.p1 },
    splits: { close: true, band: row.band, phase: 'middlegame', tensionCentral: null, tradePiece: null } })
  row.units = [unit('hang'), unit('bishop-colour'), unit('tension', false)]
  return row
}
function mock(row, override = {}) {
  const calls = []
  return { calls,
    async newGame() { calls.push({ method: 'newGame' }) },
    async bestMoves(_position, opts) { calls.push({ method: 'bestMoves', opts }); return best(row.M1) },
    async scoreMove(_position, uci, opts) { calls.push({ method: 'scoreMove', uci, opts }); return reading(uci) },
    async tablebase() { calls.push({ method: 'tablebase' }); return { category: 'draw', moves: row.legalMoves.map(uci => ({ uci, category: 'draw' })) } },
    status() { return { tablebase: 'offline' } },
    reset(target) { calls.push({ method: 'reset', target }) },
    async humanPolicy() { throw new Error('the referee must not call Maia') },
    ...override }
}
let checks = 0
async function test(name, fn) {
  try { await fn(); checks++ } catch (error) { error.message = `${name}: ${error.message}`; throw error }
}

await test('the registered app exposes the fixed referee budget and window', () => requireInstruments())
await test('several units share one cleared best and each distinct candidate once', async () => {
  const row = fixture(), eng = mock(row), original = structuredClone(row)
  const result = await readPosition(row, eng)
  assert.deepEqual(row, original)
  assert.deepEqual(movesToScore(row), [row.M2, row.M1])
  assert.deepEqual(eng.calls.map(call => call.method), ['newGame', 'bestMoves', 'scoreMove', 'scoreMove'])
  assert.deepEqual(eng.calls.filter(call => call.method === 'scoreMove').map(call => call.uci), [row.M2, row.M1])
  assert.deepEqual(eng.calls[1].opts, { budget: 'grade', multiPv: 1, priority: 'batch', cache: 'bypass' })
  for (const call of eng.calls.slice(2)) assert.deepEqual(call.opts, { budget: 'grade', priority: 'batch', cache: 'bypass' })
  assert.deepEqual(Object.keys(result.sound), [row.M2, row.M1])
  assert.equal(result.sound[row.M1], true)
  assert.equal(result.sound[row.M2], true)
  assert.equal(result.evidence.source, 'stockfish')
  assert.equal(result.times.newGameCalls, 1)
  assert.equal(result.times.bestCalls, 1)
  assert.equal(result.times.scoreCalls, 2)
  assert.equal(result.times.maiaCalls, 0)
  assert.equal(result.times.tablebaseCalls, 0)
  assert.equal(result.sound[row.played], undefined)
})
await test('canonical units set F then B order independently of input-unit order', () => {
  const row = fixture(), expected = movesToScore(row)
  row.units.reverse()
  assert.deepEqual(movesToScore(row), expected)
  row.units = [row.units.find(unit => unit.unit === 'hang')]
  assert.deepEqual(movesToScore(row), [row.M1, row.M2])
})
await test('played candidate is scored once only by its F/B role', async () => {
  const row = fixture(); row.played = row.M2
  const eng = mock(row), result = await readPosition(row, eng)
  assert.equal(eng.calls.filter(call => call.method === 'scoreMove' && call.uci === row.played).length, 1)
  assert.deepEqual(Object.keys(result.evidence.readings).sort(), [row.M1, row.M2].sort())
})
await test('the engine is cleared again for another occurrence of the same FEN', async () => {
  const row = fixture(), eng = mock(row)
  await readPosition(row, eng)
  row.ply++; row.key = `${row.month}:${row.game}:${row.ply}`
  await readPosition(row, eng)
  assert.equal(eng.calls.filter(call => call.method === 'newGame').length, 2)
  assert.equal(eng.calls.filter(call => call.method === 'bestMoves').length, 2)
})
await test('soundness uses the app comparison and original mover for both colours', async () => {
  for (const fen of [START, BLACK]) {
    const row = fixture(fen), cp = row.mover === 'w' ? -200 : 200
    const eng = mock(row, { async scoreMove(_position, uci) { return reading(uci, uci === row.M1 ? 0 : cp) } })
    const result = await readPosition(row, eng)
    assert.equal(result.sound[row.M2], E.acceptsAlternative(score(cp), score(0), row.mover, E.ACCEPT_WINDOW_WP))
    assert.equal(result.sound[row.M2], false)
    assert.equal(result.sound[row.M1], true)
  }
})
await test('the exact first best line is used even when the raw final best differs', async () => {
  const row = fixture(), expected = best(row.M1)
  expected.best = row.played
  const result = await readPosition(row, mock(row, { bestMoves: async () => expected }))
  assert.equal(bestLine(result.evidence.best, row.legalMoves).move, row.M1)
  assert.equal(result.sound[row.M1], true)
})
await test('seven men uses only a probe and eight men uses the engine', async () => {
  for (const [fen, tablebase] of [['4k3/pp6/8/8/8/8/PP6/R3K3 w - - 0 8', true], ['4k3/pp6/8/8/8/8/PP6/RN2K3 w - - 0 8', false]]) {
    const row = fixture(fen), eng = mock(row), result = await readPosition(row, eng)
    assert.equal(result.evidence.source, tablebase ? 'tablebase' : 'stockfish')
    assert.equal(result.times.tablebaseCalls, tablebase ? 1 : 0)
    assert.equal(result.times.newGameCalls, tablebase ? 0 : 1)
  }
})
await test('tablebase outcomes are exact, including cursed wins versus draws and wins', async () => {
  for (const [before, first, second] of [['win', 'loss', 'draw'], ['cursed-win', 'blessed-loss', 'draw'], ['cursed-win', 'blessed-loss', 'loss']]) {
    const row = fixture(END)
    const probe = { category: before, moves: [{ uci: row.M1, category: first }, { uci: row.M2, category: second }] }
    const result = await readPosition(row, mock(row, { tablebase: async () => probe }))
    assert.equal(result.sound[row.M1], true)
    assert.equal(result.sound[row.M2], false)
    assert.equal(result.evidence.probe, probe)
  }
})
await test('failed probes back off and reset negative cache before recovery', async () => {
  const row = fixture(END), events = [], delays = [], eng = mock(row)
  let attempts = 0
  const answer = await eng.tablebase(); eng.calls.length = 0
  eng.tablebase = async () => { eng.calls.push({ method: 'tablebase' }); return ++attempts < 3 ? null : answer }
  eng.status = () => ({ tablebase: 'unsupported' }) // The adapter also uses this for HTTP 429.
  const result = await readPosition(row, eng, { onEvent: event => events.push(event), sleep: async ms => delays.push(ms) })
  assert.deepEqual(delays, [1000, 2000])
  assert.deepEqual(events.map(event => event.event), ['tablebase-retry', 'tablebase-retry', 'tablebase-recovered'])
  assert.deepEqual(eng.calls.map(call => call.method), ['tablebase', 'reset', 'tablebase', 'reset', 'tablebase'])
  assert.ok(eng.calls.filter(call => call.method === 'reset').every(call => call.target === 'tablebase'))
  assert.equal(result.times.tablebaseCalls, 3)
  assert.equal(result.times.tablebaseUnavailable, 2)
  assert.equal(result.times.tablebaseRetries, 2)
  assert.equal(result.times.bestCalls, 0)
})
await test('an exhausted probe stops after four attempts and never falls back', async () => {
  const row = fixture(END), eng = mock(row, { tablebase: async () => null }), delays = [], events = []
  await assert.rejects(readPosition(row, eng, { sleep: async ms => delays.push(ms), onEvent: event => events.push(event) }), error => {
    assert.match(error.message, /tablebase unavailable/)
    assert.equal(error.times.tablebaseCalls, 4)
    assert.equal(error.times.tablebaseRetries, 3)
    assert.equal(error.times.newGameCalls, 0)
    assert.equal(error.times.bestCalls, 0)
    return true
  })
  assert.deepEqual(delays, [1000, 2000, 4000])
  assert.equal(events.at(-1).event, 'tablebase-unavailable')
  assert.equal(events.at(-1).exhausted, true)
})
await test('uncovered small positions and missing outcomes stop without engine fallback', async () => {
  const row = fixture('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 8'), eng = mock(row, { tablebase: async () => null })
  await assert.rejects(readPosition(row, eng, { sleep: async () => assert.fail('uncovered probe must not retry') }), error => {
    assert.equal(error.times.tablebaseCalls, 1)
    assert.equal(error.times.bestCalls, 0)
    return /tablebase unavailable/.test(error.message)
  })
  for (const probe of [{ category: 'draw', moves: [] }, { category: 'unknown', moves: [] }])
    await assert.rejects(readPosition(fixture(END), mock(fixture(END), { tablebase: async () => probe })), /missing tablebase outcome/)
})
await test('timing exercises the engine but never invokes judgments or returns evidence', async () => {
  const row = fixture(), eng = mock(row), forbidden = () => assert.fail('timing invoked judgment')
  const result = await readPosition(row, eng, { timing: true, judgeEngine: forbidden, judgeTablebase: forbidden })
  assert.deepEqual(Object.keys(result).sort(), ['key', 'times'])
  assert.equal(result.key, row.key)
  assert.equal(result.times.scoreCalls, 2)
  assert.equal(result.times.bestCalls, 1)
  assert.equal(result.times.newGameCalls, 1)
})
await test('tablebase timing never interprets outcomes and still stops if unavailable', async () => {
  const row = fixture(END), forbidden = () => assert.fail('timing invoked judgment')
  const eng = mock(row, { tablebase: async () => ({ category: 'intentionally-uninterpreted', moves: [] }) })
  const result = await readPosition(row, eng, { timing: true, judgeEngine: forbidden, judgeTablebase: forbidden })
  assert.deepEqual(Object.keys(result).sort(), ['key', 'times'])
  assert.equal(result.times.tablebaseCalls, 1)
  await assert.rejects(readPosition(row, mock(row, { tablebase: async () => null }), { timing: true, sleep: async () => {} }), /tablebase unavailable/)
})
await test('the clock guard stops before searches and before a tablebase retry', async () => {
  const row = fixture(), eng = mock(row)
  await assert.rejects(readPosition(row, eng, { guard: () => { throw new Error('synthetic scheduled pause') } }), /scheduled pause/)
  assert.deepEqual(eng.calls, [])
  let checks = 0, probes = 0
  const end = fixture(END)
  await assert.rejects(readPosition(end, mock(end, { tablebase: async () => { probes++; return null } }), {
    sleep: async () => {}, guard: () => { if (++checks === 2) throw new Error('synthetic retry pause') },
  }), /retry pause/)
  assert.equal(probes, 1)
})
await test('malformed input stops before any instrument', async () => {
  const mutations = [
    row => { row.key = 'different' }, row => { row.ply = 7; row.key = `${row.month}:${row.game}:7` },
    row => { row.legalMoves.reverse() }, row => { row.played = 'a9a8' }, row => { row.M2 = row.M1 },
    row => { row.p1 = NaN }, row => { row.band = 1700 }, row => { row.units = [] },
    row => { row.units.push(structuredClone(row.units[0])) }, row => { row.units[0].F = row.played },
    row => { row.units[0].stratum = 'break-first' }, row => { row.units[0].probabilities.F = 0 },
    row => { row.units[0].unit = 'unknown' }, row => { row.mover = 'b' },
  ]
  for (const mutate of mutations) {
    const row = fixture(); mutate(row)
    const eng = mock(row)
    await assert.rejects(readPosition(row, eng))
    assert.deepEqual(eng.calls, [])
  }
})
await test('tied natural probabilities must keep the lexical first move', () => {
  const row = fixture(); row.p2 = row.p1
  for (const unit of row.units) unit.probabilities = { F: row.p1, B: row.p1 }
  assert.doesNotThrow(() => validatePosition(row))
  ;[row.M1, row.M2] = [row.M2, row.M1]
  assert.throws(() => validatePosition(row), /tie is not lexical/)
})
await test('inexact wrong-root and failed engine readings remain pending with timings', async () => {
  const row = fixture()
  for (const override of [
    { newGame: async () => { throw new Error('synthetic engine failure') } },
    { bestMoves: async () => ({ ...best(row.M1), partial: true }) },
    { bestMoves: async () => ({ ...best(row.M1), lines: [{ move: row.M1, pv: [row.M2], score: score(0) }] }) },
    { scoreMove: async (_position, uci) => ({ ...reading(uci), status: 'upper' }) },
    { scoreMove: async (_position, uci) => ({ ...reading(uci), coherent: false }) },
    { scoreMove: async (_position, uci) => ({ ...reading(uci), partial: true }) },
    { scoreMove: async () => reading(row.played) },
  ]) await assert.rejects(readPosition(row, mock(row, override)), error => {
    assert.ok(error.times.engineSeconds >= 0)
    assert.ok(error.times.rowSeconds >= error.times.engineSeconds)
    assert.equal(error.times.newGameCalls, 1)
    return true
  })
})
await test('an invalid cache path is rejected before constructing any engine', () => {
  assert.throws(() => createEngine({ tablebasePath: '/tmp/not-this-project.json' }), /cache must stay in this project/)
  assert.throws(() => createEngine(), /cache must stay in this project/)
})
console.log(JSON.stringify({ syntheticScorerChecks: checks, realRowsRead: 0, engineProcesses: 0, maiaCalls: 0, tablebaseRequests: 0 }))
