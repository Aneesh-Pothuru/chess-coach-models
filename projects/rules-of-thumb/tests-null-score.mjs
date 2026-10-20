// Synthetic additions only. No engine, Maia model or study rows.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chess } from '../../bridge/lib/chess.mjs'
import { sampleWithoutReplacement } from './null-common.mjs'
import { bestUci, checkJournal, readNullRow, readOriginalJournal, sampledMoves, storedSound } from './null-score.mjs'
import { rowKey } from './score.mjs'
const K = await chess('src/services/knowledge/index.ts')
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const END = '8/8/8/8/8/4k3/8/R3K3 w - - 0 1'
const legalAt = fen => K.boardOf(fen).movesShared().map(m => m.uci).sort()
const score = cp => ({ cp, mate: null })
const best = uci => ({ best: uci, complete: true, partial: false, completion: 'complete',
  lines: [{ move: uci, pv: [uci], score: score(0) }] })
const reading = uci => ({ best: uci, pv: [uci], score: score(0), partial: false,
  completion: 'complete', status: 'exact', coherent: true })
function row(fen = START, more = {}) {
  const legal = legalAt(fen)
  return { datasetKind: 'amended', month: 'synthetic', game: 'synthetic', rule: 'active-king',
    fen, band: 1500, opponentBand: 1300, R: legal[1], N: legal[0], A: legal[2],
    ruleMoves: [legal[1]], sound: { R: false, N: true, A: false },
    evidence: fen === END
      ? { source: 'tablebase', probe: { category: 'draw', moves: legal.map(uci => ({ uci, category: 'draw' })) } }
      : { source: 'stockfish', best: best(legal[0]) }, ...more }
}
function withSample(source, predicate) {
  for (let i = 0; i < 1000; i++) {
    const candidate = { ...source, game: `synthetic-${i}` }
    if (predicate(sampledMoves(candidate, legalAt(candidate.fen))[0])) return candidate
  }
  throw new Error('synthetic fixture search failed')
}
function mock(row, overrides = {}) {
  const calls = [], legal = legalAt(row.fen)
  const policy = Object.fromEntries(legal.map((uci, i) => [uci, (legal.length - i) / 100]))
  return { calls,
    async humanPolicy(pos, opts) { calls.push({ method: 'humanPolicy', opts }); return { bands: opts.bands.map(band => ({ band, policy })) } },
    async newGame() { calls.push({ method: 'newGame' }) },
    async bestMoves(pos, opts) { calls.push({ method: 'bestMoves', opts }); return best(legal[0]) },
    async scoreMove(pos, uci, opts) { calls.push({ method: 'scoreMove', uci, opts }); return reading(uci) },
    ...overrides }
}
let checks = 0
async function test(name, fn) {
  try { await fn(); checks++ } catch (error) { error.message = `${name}: ${error.message}`; throw error }
}
await test('sampler is deterministic, does not mutate, and samples without replacement', () => {
  const values = ['a', 'b', 'c', 'd', 'e']
  const first = sampleWithoutReplacement(values, 3, 'synthetic')
  assert.deepEqual(first, ['e', 'a', 'c'])
  assert.deepEqual(sampleWithoutReplacement(values, 3, 'synthetic'), first)
  assert.deepEqual(values, ['a', 'b', 'c', 'd', 'e'])
  assert.equal(new Set(first).size, 3)
  assert.deepEqual(new Set(sampleWithoutReplacement(values, 5, 'synthetic')), new Set(values))
  assert.deepEqual(sampleWithoutReplacement(values, 0, 'synthetic'), [])
  for (const n of [-1, .5, 6]) assert.throws(() => sampleWithoutReplacement(values, n, 'synthetic'))
  // Distinct row keys vary a synthetic one-move sample without selecting by outcome.
  assert.equal(new Set(Array.from({ length: 200 }, (_, i) => sampleWithoutReplacement(values, 1, `${i}`)[0])).size, 5)
})
await test('null seed includes the exact row key, delimiter, and null suffix', () => {
  const source = row(), legal = legalAt(source.fen)
  assert.deepEqual(sampledMoves(source, legal.reverse()),
    sampleWithoutReplacement([...legal].sort(), source.ruleMoves.length, `${rowKey(source)}\0null`))
  assert.throws(() => sampledMoves({ ...source, ruleMoves: [] }, legal))
  assert.throws(() => sampledMoves({ ...source, ruleMoves: [source.R, source.R] }, legal))
  assert.throws(() => sampledMoves({ ...source, ruleMoves: ['a2a5'] }, legal))
})
await test('matching stored moves reuse true and false without engine searches', async () => {
  for (const label of ['R', 'N', 'A']) {
    const source = withSample(row(), uci => uci === row()[label])
    const eng = mock(source), result = await readNullRow(eng, source)
    assert.equal(result.R0, source[label])
    assert.equal(result.sound.R0, source.sound[label])
    assert.equal(result.source, 'stored-move')
    assert.equal(result.bestChanged, undefined)
    assert.deepEqual(eng.calls.map(call => call.method), ['humanPolicy'])
    assert.deepEqual(eng.calls[0].opts, { bands: [1500, 1300], opponentBand: 1300 })
    assert.equal(result.times.reusedMoves, 1)
  }
})
await test('fresh search clears once, searches best then R0, and compares best UCI', async () => {
  const source = withSample(row(), uci => ![row().R, row().N, row().A].includes(uci))
  const eng = mock(source), result = await readNullRow(eng, source)
  assert.equal(result.source, 'engine')
  assert.equal(result.bestChanged, false)
  assert.equal(result.sound.R0, true)
  assert.deepEqual(eng.calls.map(call => call.method), ['humanPolicy', 'newGame', 'bestMoves', 'scoreMove'])
  assert.deepEqual(eng.calls[2].opts, { budget: 'grade', multiPv: 1, priority: 'batch', cache: 'bypass' })
  assert.deepEqual(eng.calls[3].opts, { budget: 'grade', priority: 'batch', cache: 'bypass' })
  assert.equal(eng.calls[3].uci, result.R0)
  assert.equal(result.times.newGameCalls, 1)
  assert.equal(result.times.bestCalls, 1)
  assert.equal(result.times.scoreCalls, 1)
  assert.equal(result.times.newSearches, 1)
  const other = mock(source, { bestMoves: async () => best(source.R) })
  assert.equal((await readNullRow(other, source)).bestChanged, true)
})
await test('stored tablebase has priority over alias reuse and never probes the network', async () => {
  const base = row(END, { sound: { R: true, N: true, A: true } })
  for (const alias of [true, false]) {
    const source = withSample(base, uci => [base.R, base.N, base.A].includes(uci) === alias)
    const eng = mock(source), result = await readNullRow(eng, source)
    assert.equal(result.source, 'tablebase')
    assert.equal(result.sound.R0, true)
    assert.equal(result.times.storedProbeReads, 1)
    assert.equal(result.times.tablebaseCalls, 0)
    assert.deepEqual(eng.calls.map(call => call.method), ['humanPolicy'])
  }
})
await test('a missing stored tablebase move or a disagreed original judgment stops', async () => {
  const source = row(END, { sound: { R: true, N: true, A: true } })
  await assert.rejects(readNullRow(mock(source), { ...source, evidence: { source: 'tablebase', probe: null } }), /missing tablebase/)
  await assert.rejects(readNullRow(mock(source), { ...source, sound: { R: false, N: true, A: true } }), /stored probe/)
})
await test('policy drift stops before any engine reading', async () => {
  const source = row(), eng = mock(source)
  await assert.rejects(readNullRow(eng, { ...source, N: legalAt(source.fen)[3] }), /reproduces original/)
  assert.deepEqual(eng.calls.map(call => call.method), ['humanPolicy'])
})
await test('failed, partial or wrong-root engine readings retain attempt timing and stop', async () => {
  const source = withSample(row(), uci => ![row().R, row().N, row().A].includes(uci))
  for (const override of [
    { newGame: async () => { throw new Error('synthetic reset failure') } },
    { scoreMove: async (pos, uci) => ({ ...reading(uci), partial: true }) },
    { scoreMove: async () => reading('invalid') },
  ]) {
    await assert.rejects(readNullRow(mock(source, override), source), error => {
      assert.ok(error.times.rowSeconds >= 0)
      assert.equal(error.times.newGameCalls, 1)
      return true
    })
  }
})
await test('stored aliases must agree and removed rules cannot be scored', async () => {
  const source = row()
  assert.equal(storedSound(source, 'none'), null)
  assert.throws(() => storedSound({ ...source, R: source.N }, source.N), /inconsistent/)
  for (const rule of ['bishop-pair', 'king-shelter']) await assert.rejects(readNullRow(mock(source), { ...source, rule }), /fifteen/)
  assert.equal(bestUci({ ...best(source.N), best: source.R }), source.N)
  assert.throws(() => bestUci({ lines: [{ move: source.N, pv: [source.R] }] }), /differ/)
})
await test('original journal tails are refused without repair; null keys are checked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'null-test-'))
  try {
    const path = join(dir, 'original.jsonl'), data = '{"synthetic":true}\n{"incomplete":'
    writeFileSync(path, data)
    assert.throws(() => readOriginalJournal(path), /incomplete/)
    assert.equal(readFileSync(path, 'utf8'), data)
    writeFileSync(path, '{"synthetic":true}\n')
    assert.deepEqual(readOriginalJournal(path), [{ synthetic: true }])
  } finally { rmSync(dir, { recursive: true }) }
  const source = row(), done = { ...source, key: rowKey(source), datasetKind: 'null-addition' }
  assert.equal(checkJournal([source], [done]).size, 1)
  assert.throws(() => checkJournal([source], [done, done]), /duplicate/)
  assert.throws(() => checkJournal([source], [{ ...done, key: 'foreign' }]), /foreign/)
})
console.log(JSON.stringify({ syntheticNullScorerChecks: checks, engineProcesses: 0, maiaModels: 0, realGames: 0 }))
