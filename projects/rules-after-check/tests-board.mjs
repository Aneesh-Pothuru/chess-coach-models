// Synthetic board facts only: no original position files or engine calls.
import assert from 'node:assert/strict'
import { chess } from '../../bridge/lib/chess.mjs'
import { readBoardRow, quietOf } from './board.mjs'
import { splitsOf } from '../rules-of-thumb/detect.mjs'
const K = await chess('src/services/knowledge/index.ts')
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
function fixture(fen = START, ruleMoves = ['e2e4', 'd2d4']) {
  const legal = K.boardOf(fen).movesShared().map(m => m.uci)
  return { datasetKind: 'amended', month: 'synthetic', game: 'synthetic', rule: 'open-file',
    fen, ruleMoves, band: 1300, opponentBand: 1500, R: ruleMoves[0], N: legal[0], A: legal[1], sound: { R: true, N: true, A: false } }
}
function read(row, instruments) {
  return readBoardRow(row, { R0: row.N, sound: { R0: true } }, null, null, instruments)
}
let checks = 0
function test(name, fn) { try { fn(); checks++ } catch (error) { error.message = `${name}: ${error.message}`; throw error } }
test('quiet excludes check and either type of threat for either side', () => {
  const empty = () => ({ threats: { mateInOne: { w: [], b: [] }, winningCaptures: { w: [], b: [] } } })
  assert.equal(quietOf({ inCheck: () => false }, empty()), true)
  assert.equal(quietOf({ inCheck: () => true }, empty()), false)
  for (const kind of ['mateInOne', 'winningCaptures']) for (const side of ['w', 'b']) {
    const facts = empty(); facts.threats[kind][side].push('synthetic')
    assert.equal(quietOf({ inCheck: () => false }, facts), false)
  }
  assert.throws(() => quietOf({ inCheck: () => false }, { threats: {} }), /missing threat/)
})
test('one position reading and one safety call per legal move, with unchanged input', () => {
  const row = fixture(), before = JSON.stringify(row), calls = []
  const output = read(row, { describePosition: fen => { calls.push('position'); return K.describePosition(fen) },
    safetyCheck: (fen, uci) => { calls.push(uci); return K.safetyCheck(fen, uci) } })
  const legal = K.boardOf(row.fen).movesShared().map(m => m.uci)
  assert.deepEqual(calls, ['position', ...legal]); assert.equal(JSON.stringify(row), before)
  assert.equal(output.times.positionCalls, 1); assert.equal(output.times.safetyCalls, legal.length)
  assert.equal(output.quiet, true)
  assert.deepEqual(output.safeRuleMoves, row.ruleMoves.filter(m => output.safeMoves.includes(m)).sort())
  const { material, phase, kingDanger } = splitsOf(row.fen)
  assert.deepEqual(output.splits, { material, phase, kingDanger })
  for (const uci of legal) assert.equal(output.forcingByMove[uci], false)
})
test('the fixed safety app passes even queen trades on both sides', () => {
  for (const [fen, uci] of [
    ['3r2k1/3q4/8/8/8/8/8/3Q2K1 w - - 0 1', 'd1d7'],
    ['3q2k1/8/8/8/8/8/3Q4/3R2K1 b - - 0 1', 'd8d2'],
  ]) {
    const output = read(fixture(fen, [uci]))
    assert.equal(K.safetyCheck(fen, uci).verdict, 'safe')
    assert.deepEqual(output.safeRuleMoves, [uci]); assert.equal(output.originalRPasses, true)
    assert.equal(output.forcingByMove[uci], true)
  }
})
test('bad captures and trades abandoning a defence are excluded', () => {
  for (const [fen, uci] of [
    ['3r2k1/3p4/8/8/8/8/8/3Q2K1 w - - 0 1', 'd1d7'],
    ['r6k/8/8/5p2/Q3q3/8/7K/R7 w - - 0 1', 'a4e4'],
  ]) {
    assert.equal(K.safetyCheck(fen, uci).verdict, 'loses-material')
    const output = read(fixture(fen, [uci]))
    assert.deepEqual(output.safeRuleMoves, []); assert.equal(output.originalRPasses, false)
  }
})
test('real app check and winning-capture facts make synthetic positions nonquiet', () => {
  for (const fen of ['4r1k1/8/8/8/8/8/8/4K3 w - - 0 1', '6k1/8/8/8/8/8/q7/R5K1 w - - 0 1']) {
    const uci = K.boardOf(fen).movesShared()[0].uci
    assert.equal(read(fixture(fen, [uci])).quiet, false)
  }
})
test('illegal, duplicate and removed rule inputs refuse before safety scans', () => {
  for (const row of [fixture(START, ['e2e5']), fixture(START, ['e2e4', 'e2e4']),
    { ...fixture(), rule: 'lucena' }, { ...fixture(), rule: 'philidor' }]) assert.throws(() => read(row))
})
test('missing check readings stop and retain attempt timing', () => {
  assert.throws(() => read(fixture(), { describePosition: K.describePosition, safetyCheck: () => null }), error => {
    assert.match(error.message, /missing safety/); assert.equal(error.times.positionCalls, 1)
    assert.equal(error.times.safetyCalls, 1); assert.ok(error.times.rowSeconds >= 0); return true
  })
})
console.log(JSON.stringify({ syntheticBoardChecks: checks, engineProcesses: 0, maiaModels: 0, realPositions: 0 }))
