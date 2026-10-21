// Synthetic scorer checks only. Engine and humanPolicy are stubs.
import assert from 'node:assert/strict'
import { chess } from '../../bridge/lib/chess.mjs'
import { checkedSets, readCheckedRow, storedAliases } from './score.mjs'
import { rowKey } from './common.mjs'
import { pick, tablebaseSound } from '../rules-of-thumb/score.mjs'
import { sampleWithoutReplacement } from '../rules-of-thumb/null-common.mjs'

const K = await chess('src/services/knowledge/index.ts')
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const END = '8/8/8/8/8/4k3/8/R3K3 w - - 0 1'
const legalAt = fen => K.boardOf(fen).movesShared().map(move => move.uci).sort()
const score = cp => ({ cp, mate: null })
const best = uci => ({ best: uci, complete: true, partial: false, completion: 'complete',
  lines: [{ move: uci, pv: [uci], score: score(0) }] })
const reading = uci => ({ best: uci, pv: [uci], score: score(0), partial: false,
  completion: 'complete', status: 'exact', coherent: true })

function fixture(fen = START) {
  const legal = legalAt(fen)
  const row = { datasetKind: 'amended', month: 'synthetic-month', game: 'synthetic-game', rule: 'active-king',
    fen, band: 1500, opponentBand: 1300, R: legal[1], N: legal[0], A: legal[2],
    ruleMoves: [legal[1], legal[5], legal[6]], sound: { R: false, N: true, A: false },
    evidence: fen === END
      ? { source: 'tablebase', probe: { category: 'draw', moves: legal.map(uci => ({ uci, category: 'draw' })) } }
      : { source: 'stockfish', best: best(legal[0]) } }
  const nullRow = { R0: legal[3], sound: { R0: false } }
  if (fen === END) { row.sound = { R: true, N: true, A: true }; nullRow.sound.R0 = true }
  const checked = { key: rowKey(row), datasetKind: 'rules-after-check', month: row.month, game: row.game, rule: row.rule,
    quiet: true, safeMoves: legal.slice(4, 9), safeRuleMoves: legal.slice(5, 7), originalRPasses: false,
    R: row.R, N: row.N, A: row.A, R0: nullRow.R0, sound: { ...row.sound, R0: nullRow.sound.R0 },
    splits: { material: 'level', phase: 'middlegame', kingDanger: false },
    forcingByMove: Object.fromEntries(legal.map((uci, index) => [uci, index % 2 === 0])) }
  return { row, nullRow, checked, legal }
}

function syncChecked(f) {
  const { row, nullRow, checked } = f
  Object.assign(checked, { key: rowKey(row), month: row.month, game: row.game, rule: row.rule,
    R: row.R, N: row.N, A: row.A, R0: nullRow.R0, sound: { ...row.sound, R0: nullRow.sound.R0 },
    safeRuleMoves: row.ruleMoves.filter(uci => checked.safeMoves.includes(uci)).sort(),
    originalRPasses: checked.safeMoves.includes(row.R) })
  return f
}

function chooseSyntheticSeed(f, predicate) {
  for (let i = 0; i < 1000; i++) {
    f.row.game = `synthetic-game-${i}`
    syncChecked(f)
    const sample = sampleWithoutReplacement(f.checked.safeMoves, f.checked.safeRuleMoves.length, `${rowKey(f.row)}\0after-check`)
    if (predicate(sample)) return f
  }
  throw new Error('synthetic seed fixture not found')
}

function mock(f, override = {}) {
  const calls = []
  const policy = Object.fromEntries(f.legal.map((uci, i) => [uci, (f.legal.length - i) / 100]))
  return { calls, policy,
    async humanPolicy(_pos, opts) { calls.push({ method: 'humanPolicy', opts }); return { bands: opts.bands.map(band => ({ band, policy })) } },
    async newGame() { calls.push({ method: 'newGame' }) },
    async bestMoves(_pos, opts) { calls.push({ method: 'bestMoves', opts }); return best(f.row.N) },
    async scoreMove(_pos, uci, opts) { calls.push({ method: 'scoreMove', uci, opts }); return reading(uci) },
    async tablebase() { throw new Error('a synthetic scorer must never call the network') },
    ...override }
}

const call = (f, eng = mock(f)) => readCheckedRow(f.row, f.nullRow, f.checked, eng)
let checks = 0
async function test(name, fn) {
  try { await fn(); checks++ } catch (error) { error.message = `${name}: ${error.message}`; throw error }
}

// The runner's separate clock tests cover the scheduled blackout. A fixed
// non-blackout clock makes these scorer tests independent of test launch time.
const RealDate = globalThis.Date
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : ['2026-10-20T00:00:00Z'])) }
}
try {
await test('the sampled safe subset has the exact row seed and fixed ordering', async () => {
  const f = fixture(), eng = mock(f), original = [...f.checked.safeMoves]
  const result = await call(f, eng)
  const expected = sampleWithoutReplacement([...f.checked.safeMoves].sort(), f.checked.safeRuleMoves.length, `${rowKey(f.row)}\0after-check`)
  assert.deepEqual(result.sampledMoves, expected)
  assert.equal(new Set(result.sampledMoves).size, f.checked.safeRuleMoves.length)
  assert.ok(result.sampledMoves.every(uci => original.includes(uci)))
  assert.deepEqual(f.checked.safeMoves, original)
  assert.equal(result.R0s, pick(eng.policy, expected))
  const repeated = await call(f)
  assert.deepEqual(repeated.sampledMoves, result.sampledMoves)
  assert.equal(repeated.R0s, result.R0s)
})
await test('lexical UCI breaks tied policy probabilities in every chosen set', async () => {
  const f = fixture(), eng = mock(f)
  for (const uci of f.legal) eng.policy[uci] = 1
  const result = await call(f, eng)
  assert.equal(result.Rs, [...f.checked.safeRuleMoves].sort()[0])
  assert.equal(result.Ns, [...f.checked.safeMoves].sort()[0])
  assert.equal(result.R0s, [...result.sampledMoves].sort()[0])
})
await test('every original alias including false and R0 is reusable without a search', async () => {
  for (const label of ['R', 'N', 'A', 'R0']) {
    const f = fixture(), target = label === 'R0' ? f.nullRow.R0 : f.row[label]
    const value = label === 'R0' ? f.nullRow.sound.R0 : f.row.sound[label]
    assert.deepEqual(storedAliases(f.row, f.nullRow, target), { label, sound: value })
    if (label === 'N') { f.row.R = target; f.row.sound.R = value }
    f.row.ruleMoves = [...new Set([f.row.R, target])]
    f.checked.safeMoves = [target]
    syncChecked(f)
    const eng = mock(f), result = await call(f, eng)
    for (const chosen of ['Rs', 'Ns', 'R0s']) {
      assert.equal(result[chosen], target)
      assert.equal(result.sound[chosen], value)
    }
    assert.deepEqual(eng.calls.map(item => item.method), ['humanPolicy'])
    assert.equal(result.freshSearch, false)
    assert.equal(result.freshBestChanged, undefined)
    assert.equal(result.times.reusedMoves, 1)
  }
  const f = fixture()
  assert.equal(storedAliases(f.row, f.nullRow, f.legal[8]), null)
})
await test('conflicting aliases or missing stored Booleans stop before Maia', async () => {
  const f = fixture(); f.nullRow.R0 = f.row.R; f.nullRow.sound.R0 = !f.row.sound.R; syncChecked(f)
  assert.throws(() => storedAliases(f.row, f.nullRow, f.row.R), /matching stored soundness/)
  const eng = mock(f)
  await assert.rejects(call(f, eng), /matching stored soundness/)
  assert.equal(eng.calls.length, 0)
  const missing = fixture(); missing.row.sound.R = null; syncChecked(missing)
  await assert.rejects(call(missing), /matching stored soundness/)
})
await test('an empty safe rule set is counted with no Maia or engine reading', async () => {
  const f = fixture(); f.checked.safeMoves = [f.row.N]; syncChecked(f)
  const eng = mock(f), result = await call(f, eng)
  assert.equal(result.quiet, true)
  for (const label of ['Rs', 'Ns', 'R0s']) { assert.equal(result[label], null); assert.equal(result.sound[label], null) }
  assert.deepEqual(result.sampledMoves, [])
  assert.equal(result.splits.forcing, null)
  assert.equal(result.freshSearch, false)
  assert.equal(result.evidence, null)
  assert.equal(eng.calls.length, 0)
  assert.equal(result.times.maiaCalls, 0)
  assert.equal(result.times.scoreCalls, 0)
})
await test('nonquiet eligible rows are scored for the registered description', async () => {
  const f = fixture(); f.checked.quiet = false
  const eng = mock(f), result = await call(f, eng)
  assert.equal(result.quiet, false)
  assert.ok(result.Rs)
  assert.equal(result.times.maiaCalls, 1)
  assert.ok(eng.calls.some(item => item.method === 'scoreMove'))
  assert.equal(result.splits.forcing, f.checked.forcingByMove[result.Rs])
})
await test('Maia uses the original bands and opponent band', async () => {
  for (const band of [1300, 1500]) {
    const f = fixture(); f.row.band = band; f.row.opponentBand = 1500
    const eng = mock(f), result = await call(f, eng)
    assert.deepEqual(eng.calls[0].opts, { bands: band === 1300 ? [1300] : [1500, 1300], opponentBand: 1500 })
    assert.equal(result.times.maiaBands, band === 1300 ? 1 : 2)
  }
})
await test('R or N policy drift, unavailability and incomplete legal policies stop', async () => {
  for (const label of ['R', 'N']) {
    const f = fixture(); f.row[label] = f.legal[5]; syncChecked(f)
    const eng = mock(f)
    await assert.rejects(call(f, eng), /reproduces original R and N/)
    assert.deepEqual(eng.calls.map(item => item.method), ['humanPolicy'])
  }
  const f = fixture()
  await assert.rejects(call(f, mock(f, { humanPolicy: async () => 'unavailable' })), /Maia unavailable/)
  const eng = mock(f); delete eng.policy[f.legal.at(-1)]
  await assert.rejects(call(f, eng), /incomplete Maia legal policy/)
})
await test('saved tablebase outcomes precede alias reuse and no network is called', async () => {
  for (const alias of [true, false]) {
    const f = fixture(END)
    if (alias) { f.row.ruleMoves = [f.row.R]; f.checked.safeMoves = [f.row.R]; syncChecked(f) }
    const eng = mock(f), result = await call(f, eng)
    assert.equal(result.evidence.source, 'tablebase')
    assert.equal(result.evidence.storedProbe, true)
    assert.deepEqual(eng.calls.map(item => item.method), ['humanPolicy'])
    assert.equal(result.times.storedProbeReads, 1)
    assert.equal(result.times.reusedMoves, 0)
    assert.equal(result.times.tablebaseCalls, 0)
    assert.equal(result.freshSearch, false)
    for (const label of ['Rs', 'Ns', 'R0s']) assert.equal(result.sound[label], true)
  }
})
await test('exact tablebase categories stay distinct instead of becoming binary wins', async () => {
  const f = fixture(END), target = f.legal[5]
  f.row.evidence.probe = { category: 'cursed-win', moves: f.legal.map(uci => ({ uci, category: uci === target ? 'loss' : 'blessed-loss' })) }
  for (const label of ['R', 'N', 'A']) f.row.sound[label] = tablebaseSound(f.row.evidence.probe, f.row[label])
  f.nullRow.sound.R0 = tablebaseSound(f.row.evidence.probe, f.nullRow.R0)
  f.checked.safeMoves = [target]; syncChecked(f)
  const result = await call(f)
  for (const label of ['Rs', 'Ns', 'R0s']) assert.equal(result.sound[label], false)
})
await test('missing saved probes or disagreements leave the row unscored', async () => {
  const missing = fixture(END); missing.row.evidence.probe = null
  await assert.rejects(call(missing), /missing tablebase outcome/)
  const disagreement = fixture(END); disagreement.nullRow.sound.R0 = false; syncChecked(disagreement)
  await assert.rejects(call(disagreement), /stored probe and soundness differ/)
})
await test('new moves are deduplicated and searched in Rs Ns R0s order after one cleared best', async () => {
  const f = chooseSyntheticSeed(fixture(), sample => sample.every(uci => ![legalAt(START)[4], legalAt(START)[5]].includes(uci)))
  const eng = mock(f), result = await call(f, eng)
  const fresh = [...new Set([result.Rs, result.Ns, result.R0s])]
  assert.equal(fresh.length, 3)
  assert.deepEqual(eng.calls.map(item => item.method), ['humanPolicy', 'newGame', 'bestMoves', 'scoreMove', 'scoreMove', 'scoreMove'])
  assert.deepEqual(eng.calls.filter(item => item.method === 'scoreMove').map(item => item.uci), fresh)
  assert.deepEqual(eng.calls[2].opts, { budget: 'grade', multiPv: 1, priority: 'batch', cache: 'bypass' })
  for (const item of eng.calls.filter(item => item.method === 'scoreMove'))
    assert.deepEqual(item.opts, { budget: 'grade', priority: 'batch', cache: 'bypass' })
  assert.equal(result.times.newGameCalls, 1)
  assert.equal(result.times.bestCalls, 1)
  assert.equal(result.times.newSearches, 3)
  assert.equal(result.freshSearch, true)
  assert.equal(result.freshBestChanged, false)
  const one = fixture(); one.checked.safeMoves = [one.legal[5]]; syncChecked(one)
  const oneEng = mock(one), oneResult = await call(one, oneEng)
  assert.equal(oneResult.times.scoreCalls, 1)
  assert.deepEqual(oneEng.calls.map(item => item.method), ['humanPolicy', 'newGame', 'bestMoves', 'scoreMove'])
})
await test('fresh best change compares the scored exact line rather than final bestmove', async () => {
  const f = fixture()
  const changed = await call(f, mock(f, { bestMoves: async () => best(f.row.R) }))
  assert.equal(changed.freshBestChanged, true)
  const finalOnly = await call(f, mock(f, { bestMoves: async () => ({ ...best(f.row.N), best: f.row.R }) }))
  assert.equal(finalOnly.freshBestChanged, false)
})
await test('failed newGame best and move readings retain failed-attempt timing', async () => {
  for (const override of [
    { newGame: async () => { throw new Error('synthetic new game failure') } },
    { bestMoves: async () => { throw new Error('synthetic best failure') } },
    { bestMoves: async () => ({ ...best(fixture().row.N), partial: true }) },
    { scoreMove: async (_pos, uci) => ({ ...reading(uci), partial: true }) },
    { scoreMove: async (_pos, uci) => ({ ...reading(uci), status: 'upper' }) },
    { scoreMove: async (_pos, uci) => ({ ...reading(uci), coherent: false }) },
    { scoreMove: async () => reading('h9h8') },
  ]) {
    const f = fixture()
    await assert.rejects(call(f, mock(f, override)), error => {
      assert.ok(error.times.rowSeconds >= 0)
      assert.ok(error.times.engineSeconds >= 0)
      assert.equal(error.times.newGameCalls, 1)
      return true
    })
  }
})
await test('a later new-move failure never returns a partially scored row', async () => {
  const f = chooseSyntheticSeed(fixture(), sample => sample.every(uci => ![legalAt(START)[4], legalAt(START)[5]].includes(uci)))
  let calls = 0
  const eng = mock(f, { scoreMove: async (_pos, uci) => { calls++; if (calls === 2) throw new Error('synthetic second-move failure'); return reading(uci) } })
  await assert.rejects(call(f, eng), error => {
    assert.equal(error.times.scoreCalls, 2)
    assert.equal(error.times.newSearches, 1)
    assert.equal(error.times.bestCalls, 1)
    return true
  })
})
await test('checked sets require the legal sorted intersection and matching flags', async () => {
  const f = fixture()
  assert.deepEqual(checkedSets(f.row, f.checked, f.legal), { S: f.checked.safeMoves, SR: f.checked.safeRuleMoves })
  for (const checked of [
    { ...f.checked, key: 'foreign' },
    { ...f.checked, safeMoves: [...f.checked.safeMoves].reverse() },
    { ...f.checked, safeMoves: ['a2a5'] },
    { ...f.checked, safeMoves: [f.legal[5], f.legal[5]] },
    { ...f.checked, safeRuleMoves: [f.legal[8]] },
    { ...f.checked, originalRPasses: true },
    { ...f.checked, quiet: null },
  ]) assert.throws(() => checkedSets(f.row, checked, f.legal))
  const noForcing = fixture(); noForcing.checked.forcingByMove = {}
  await assert.rejects(call(noForcing), /missing Rs forcing/)
  const inherited = fixture(); inherited.checked.sound.R = !inherited.row.sound.R
  await assert.rejects(call(inherited), /checked inherited move differs/)
})
await test('removed or unregistered rules and wrong source evidence are refused', async () => {
  for (const rule of ['lucena', 'philidor', 'bishop-pair', 'unregistered']) {
    const f = fixture(); f.row.rule = rule; syncChecked(f)
    await assert.rejects(call(f), /thirteen inherited/)
  }
  const f = fixture(); f.row.evidence.source = 'tablebase'
  await assert.rejects(call(f), /stored referee source differs/)
})
} finally { globalThis.Date = RealDate }

console.log(JSON.stringify({ syntheticScorerChecks: checks, engineProcesses: 0, maiaModels: 0, realRows: 0 }))
