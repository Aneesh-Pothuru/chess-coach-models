// Synthetic joins and scheduling only. No private file or position is read.
import assert from 'node:assert/strict'
import { joinRows, inBlackout, guardWindow, loadJoined, loadCompleted, readLines,
  signature, RULES, rowKey, runStage } from './common.mjs'

function fixture(rule = 'active-king', game = 'synthetic') {
  const position = { month: '2026-09', game, rule, fen: 'synthetic-not-a-position',
    A: 'synthetic-played', band: 1300, opponentBand: 1500, datasetKind: 'amended', ruleMoves: ['synthetic-rule-move'] }
  const original = { ...position, R: 'synthetic-rule-move', N: 'synthetic-natural', sound: { R: false, N: true, A: true } }
  const nullRow = { month: position.month, game, rule, key: rowKey(position), datasetKind: 'null-addition',
    R: original.R, N: original.N, A: original.A, R0: 'synthetic-null',
    band: original.band, opponentBand: original.opponentBand, sound: { ...original.sound, R0: false } }
  return { position, original, nullRow }
}
let checks = 0
async function test(name, fn) {
  try { await fn(); checks++ } catch (error) { error.message = `${name}: ${error.message}`; throw error }
}
await test('join restores original position order and excludes only the two sparse rules', () => {
  const fixtures = [...RULES].reverse().concat(['lucena', 'philidor']).map(rule => fixture(rule))
  const positions = fixtures.map(row => row.position)
  const originals = fixtures.map(row => row.original).reverse()
  const nulls = fixtures.map(row => row.nullRow)
  nulls.push(nulls.shift())
  const before = JSON.stringify({ positions, originals, nulls })
  const out = joinRows(positions, originals, nulls)
  assert.deepEqual(out.map(row => row.original.rule), [...RULES].reverse())
  assert.equal(out.length, 13)
  assert.equal(JSON.stringify({ positions, originals, nulls }), before)
  assert.equal(out[0].original, fixtures[0].original)
})
await test('duplicate, absent and foreign source rows stop the join', () => {
  const a = fixture('active-king', 'synthetic-a'), b = fixture('active-king', 'synthetic-b'), c = fixture('active-king', 'synthetic-c')
  const positions = [a.position, b.position], originals = [a.original, b.original], nulls = [a.nullRow, b.nullRow]
  assert.throws(() => joinRows([a.position, a.position], originals, nulls), /duplicate/)
  assert.throws(() => joinRows(positions, [a.original, a.original], nulls), /duplicate/)
  assert.throws(() => joinRows(positions, originals, [a.nullRow, a.nullRow]), /duplicate/)
  assert.throws(() => joinRows(positions, originals.slice(1), nulls), /coverage/)
  assert.throws(() => joinRows(positions, originals, nulls.slice(1)), /coverage/)
  assert.throws(() => joinRows(positions, [a.original, c.original], nulls), /absent/)
  assert.throws(() => joinRows(positions, originals, [a.nullRow, c.nullRow]), /absent/)
})
await test('original source fields and amended rule moves must agree', () => {
  for (const field of ['fen', 'A', 'band', 'opponentBand', 'datasetKind']) {
    const row = fixture(); row.original[field] = 'synthetic-different'
    assert.throws(() => joinRows([row.position], [row.original], [row.nullRow]), /differ/)
  }
  const row = fixture(); row.original.ruleMoves = ['synthetic-other-move']
  assert.throws(() => joinRows([row.position], [row.original], [row.nullRow]), /rule moves/)
})
await test('null identity, moves, bands and saved soundness must agree', () => {
  for (const change of [
    row => { row.nullRow.key = 'synthetic-wrong-key' },
    row => { row.nullRow.datasetKind = 'synthetic-wrong-population' },
    ...['R', 'N', 'A', 'band', 'opponentBand'].map(field => row => { row.nullRow[field] = 'synthetic-wrong' }),
    ...['R', 'N', 'A'].map(label => row => { row.nullRow.sound[label] = !row.original.sound[label] }),
    row => { row.original.sound.R = 0; row.nullRow.sound.R = 0 },
    row => { row.nullRow.sound.R0 = null },
  ]) {
    const row = fixture(); change(row)
    assert.throws(() => joinRows([row.position], [row.original], [row.nullRow]))
  }
})
await test('every private-reader helper refuses use before a verified freeze', () => {
  assert.throws(() => loadJoined('2026-09'), /verified/)
  assert.throws(() => readLines('/tmp/synthetic-do-not-open'), /verify the committed/)
  assert.throws(() => loadCompleted('checked', '2026-09'), /verified/)
  assert.throws(() => signature('checked', '2026-09', 0, []), /unverified/)
  assert.throws(() => loadCompleted('synthetic-invalid-stage', '2026-09'), /invalid/)
})
await test('a stage without the reviewed flag stops before reader or engine creation', async () => {
  let readerCalled = false, engineCalled = false
  await assert.rejects(runStage('checked', 'synthetic', () => { readerCalled = true }, () => { engineCalled = true }), /review/)
  assert.equal(readerCalled, false); assert.equal(engineCalled, false)
})
await test('blackout includes the ten-second margin and ends exactly at 15:30 UTC', () => {
  const cases = [
    ['2026-10-20T12:59:49.999Z', false],
    ['2026-10-20T12:59:50.000Z', true],
    ['2026-10-20T13:00:00.000Z', true],
    ['2026-10-20T15:29:59.999Z', true],
    ['2026-10-20T15:30:00.000Z', false],
    ['2026-10-20T23:59:59.999Z', false],
    ['2026-10-21T00:00:00.000Z', false],
  ]
  for (const [time, expected] of cases) assert.equal(inBlackout(new Date(time)), expected)
})
await test('blackout guard carries its resumable scheduler exit code', () => {
  assert.throws(() => guardWindow(new Date('2026-10-20T14:00:00Z')), error => error.message === 'scheduled-blackout' && error.exitCode === 75)
  assert.doesNotThrow(() => guardWindow(new Date('2026-10-20T16:00:00Z')))
})
console.log(JSON.stringify({ syntheticCommonChecks: checks, realRowsRead: 0, engineProcesses: 0, maiaModels: 0 }))
