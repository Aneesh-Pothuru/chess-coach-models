// Synthetic journals and configuration only. Never verify or read study inputs.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { addTimes, baseSignature, checkSignature, configuration, guardWindow, inBlackout,
  loadGames, normalizeGame, readLines, resumeRows, runStage, sha, shardRows } from './common.mjs'

const scratch = mkdtempSync('/tmp/tiebreak-common-')
const row = (key, seconds = 1) => ({ key, datasetKind: 'tiebreak-rules', times: { rowSeconds: seconds } })
const bytes = rows => rows.map(value => JSON.stringify(value) + '\n').join('')
let checks = 0, paths = 0
const path = () => join(scratch, `synthetic-${++paths}.jsonl`)
async function test(name, fn) {
  try { await fn(); checks++ } catch (error) { error.message = `${name}: ${error.message}`; throw error }
}
try {
await test('compact inherited movetext is parsed by the predecessor before replay', () => {
  // Tokenization only: legality is the scanner's separate app replay check.
  const movetext = Array.from({ length: 15 }, (_, i) => `${i + 1}. a3 a6`).join(' ') + ' 1/2-1/2'
  const record = { id: 'synthetic-input', movetext, plies: 30, whiteElo: 1300, blackElo: 1500 }
  const game = normalizeGame(record, '2026-07', 17)
  assert.equal(game.sans.length, 30)
  assert.deepEqual(game.sans.slice(0, 2), ['a3', 'a6'])
  assert.equal(game.key, '2026-07:synthetic-input')
  assert.equal(game.gameIndex, 17)
  assert.equal(game.movetext, movetext)
})
await test('stream shape and stored ply count cannot silently change', () => {
  assert.throws(() => normalizeGame({ id: 'synthetic', sans: [], plies: 30 }, '2026-07', 0), /compact movetext/)
  assert.throws(() => normalizeGame({ id: 'synthetic', movetext: '1. e4 e5', plies: 30 }, '2026-07', 0), /move count/)
})
await test('complete journals reject any changed byte before repairing a partial tail', () => {
  const rows = [row('synthetic-a'), row('synthetic-b')], file = path(), original = bytes(rows)
  const changed = original + '{"key":"synthetic-interrupted'
  writeFileSync(file, changed)
  assert.throws(() => resumeRows(file, { complete: true, rows: 2, outputSha256: sha(original) }, rows), /completed journal changed/)
  assert.equal(readFileSync(file, 'utf8'), changed)
  assert.throws(() => resumeRows(file, { complete: true, rows: 2, outputSha256: sha(changed) }, rows), /completed journal has partial tail/)
  assert.equal(readFileSync(file, 'utf8'), changed)
})
await test('a matching completed journal is immutable and needs every expected row', () => {
  const rows = [row('synthetic-a'), row('synthetic-b')], file = path(), data = bytes(rows)
  writeFileSync(file, data)
  const previous = { complete: true, rows: 2, outputSha256: sha(data) }
  assert.deepEqual(resumeRows(file, previous, rows), rows)
  assert.equal(readFileSync(file, 'utf8'), data)
  assert.throws(() => resumeRows(file, previous, [...rows, row('synthetic-c')]), /completed coverage differs/)
  assert.throws(() => resumeRows(file, { ...previous, rows: 1 }, rows), /completed coverage differs/)
  assert.equal(readFileSync(file, 'utf8'), data)
})
await test('only an unfinished journal loses its partial last line', () => {
  const rows = [row('synthetic-a'), row('synthetic-b')], file = path(), data = bytes(rows)
  writeFileSync(file, data + '{"key":"synthetic-interrupted')
  assert.deepEqual(resumeRows(file, { complete: false, rows: 1 }, [...rows, row('synthetic-c')]), rows)
  assert.equal(readFileSync(file, 'utf8'), data)
  // Recovery keeps the complete row written after the last checkpoint.
  assert.equal(resumeRows(file, { complete: false, rows: 1 }, rows).length, 2)
})
await test('missing journals are accepted only before any row was checkpointed', () => {
  const missing = path()
  assert.deepEqual(resumeRows(missing, null, []), [])
  assert.deepEqual(resumeRows(missing, { complete: false, rows: 0 }, [row('synthetic-a')]), [])
  assert.throws(() => resumeRows(missing, { complete: false, rows: 1 }, [row('synthetic-a')]), /missing journal/)
  assert.throws(() => resumeRows(missing, { complete: true, rows: 0 }, []), /missing journal/)
})
await test('resume refuses shuffled foreign duplicated and wrong-population prefixes', () => {
  const expected = [row('synthetic-a'), row('synthetic-c'), row('synthetic-e')]
  for (const invalid of [
    [expected[1], expected[0]], [row('synthetic-b')], [expected[0], expected[0]],
    [{ ...expected[0], datasetKind: 'different-study' }], [...expected, row('synthetic-g')],
  ]) {
    const file = path(); writeFileSync(file, bytes(invalid))
    assert.throws(() => resumeRows(file, { complete: false, rows: 0 }, expected), /invalid journal prefix/)
  }
  const file = path(); writeFileSync(file, bytes(expected.slice(0, 1)))
  assert.throws(() => resumeRows(file, { complete: false, rows: 2 }, expected), /behind its checkpoint/)
})
await test('each shard resumes in its original alternating occurrence order', () => {
  const input = ['synthetic-a', 'synthetic-b', 'synthetic-c', 'synthetic-d', 'synthetic-e'].map(key => row(key))
  const even = [row('synthetic-a'), row('synthetic-c'), row('synthetic-e')]
  const odd = [row('synthetic-b'), row('synthetic-d')]
  assert.deepEqual(shardRows(input, 0), even)
  assert.deepEqual(shardRows(input, 1), odd)
  assert.deepEqual(shardRows([], 0), [])
  assert.deepEqual(shardRows([input[0]], 1), [])
  for (const invalid of [-1, 2, 0.5, '0']) assert.throws(() => shardRows(input, invalid), /shard/)
  assert.deepEqual(input.map(value => value.key), ['synthetic-a', 'synthetic-b', 'synthetic-c', 'synthetic-d', 'synthetic-e'])
  for (const expected of [even, odd]) {
    const file = path(); writeFileSync(file, bytes(expected.slice(0, 1)))
    assert.deepEqual(resumeRows(file, { complete: false, rows: 1 }, expected), expected.slice(0, 1))
    const other = expected === even ? odd : even
    assert.throws(() => resumeRows(file, { complete: false, rows: 1 }, other), /invalid journal prefix/)
  }
})
await test('checkpoint signatures bind every supplied provenance field', () => {
  const expected = { app: 'synthetic-app', sourceSha256: 'synthetic-source', inputSha256: 'synthetic-input',
    contentManifestSha256: 'synthetic-manifest', keysSha256: 'synthetic-ordered-keys', month: '2026-07',
    shard: 1, shards: 2, timing: false, limit: null, run: 'full' }
  assert.doesNotThrow(() => checkSignature({ ...expected, rows: 1 }, expected))
  for (const key of Object.keys(expected)) assert.throws(() => checkSignature({ ...expected, [key]: 'different' }, expected), /provenance differs/)
})
await test('only scanner and selection timing may pass without the reviewed flag', () => {
  for (const stage of ['scan', 'positions']) {
    const c = configuration(['--timing'], stage)
    assert.equal(c.timing, true)
    assert.equal(c.month, '2026-07')
    assert.equal(c.limit, 300)
    assert.equal(c.run, 'timing-july-300')
    assert.equal(c.uncommittedFreeze, true)
  }
  assert.throws(() => configuration(['--timing'], 'scored'), /owner review/)
  for (const stage of ['scan', 'positions', 'scored']) assert.throws(() => configuration([], stage), /owner review/)
  const reviewed = configuration(['--reviewed'], 'scored')
  assert.equal(reviewed.timing, false)
  assert.equal(reviewed.run, 'full')
  assert.equal(reviewed.month, '2026-09')
  assert.equal(reviewed.uncommittedFreeze, false)
  const refereeTiming = configuration(['--reviewed', '--timing'], 'scored')
  assert.equal(refereeTiming.timing, true)
  assert.equal(refereeTiming.uncommittedFreeze, false)
})
await test('timing is bounded to July and full work has no slice limit', () => {
  for (const args of [
    ['--timing', '--month', '2026-08'], ['--timing', '--month', '2026-09'],
    ['--timing', '--limit', '0'], ['--timing', '--limit', '601'], ['--timing', '--limit', '2.5'],
    ['--timing', '--limit', 'NaN'], ['--reviewed', '--limit', '300'],
  ]) assert.throws(() => configuration(args, 'scan'), /July slice/)
  assert.throws(() => configuration(['--reviewed', '--month', '2026-06'], 'scan'), /invalid month/)
  for (const limit of [1, 300, 600]) assert.equal(configuration(['--timing', '--limit', String(limit)], 'scan').limit, limit)
})
await test('unverified row helpers stop before reading even a synthetic file', () => {
  const file = path(); writeFileSync(file, 'not JSON and not a study row\n')
  assert.throws(() => readLines(file), /verify the content freeze/)
  assert.throws(() => loadGames('2026-07'), /verified month/)
  assert.throws(() => baseSignature('scan', '2026-07'), /unverified signature/)
})
await test('unreviewed scorer and full-scan stages stop before engine or reader creation', async () => {
  const before = process.argv
  try {
    for (const [stage, args] of [['scan', []], ['scored', []], ['scored', ['--timing']]]) {
      process.argv = [before[0], 'synthetic-entry', ...args]
      let calls = 0
      await assert.rejects(runStage(stage, 'synthetic-entry', () => { calls++ }, () => { calls++ }), /owner review/)
      assert.equal(calls, 0)
    }
  } finally { process.argv = before }
})
await test('UTC blackout includes its stop margin and ends at exactly 15:30', () => {
  const cases = [
    ['2026-10-21T12:59:49.999Z', false], ['2026-10-21T12:59:50.000Z', true],
    ['2026-10-21T13:00:00.000Z', true], ['2026-10-21T15:29:59.999Z', true],
    ['2026-10-21T15:30:00.000Z', false], ['2026-10-21T23:59:59.999Z', false],
    ['2026-10-22T00:00:00.000Z', false], ['2026-10-21T05:59:50.000-07:00', true],
  ]
  for (const [time, expected] of cases) assert.equal(inBlackout(new Date(time)), expected)
  assert.throws(() => guardWindow(new Date('2026-10-21T14:00:00Z')), error => error.message === 'scheduled-blackout' && error.exitCode === 75)
  assert.doesNotThrow(() => guardWindow(new Date('2026-10-21T15:30:00Z')))
})
await test('timing totals include valid zeroes and reject nonfinite or negative entries', () => {
  const totals = {}
  assert.deepEqual(addTimes(totals, { rows: 0, rowSeconds: 1.5 }), { rows: 0, rowSeconds: 1.5 })
  assert.deepEqual(addTimes(totals, { rows: 2, rowSeconds: 0.5 }), { rows: 2, rowSeconds: 2 })
  for (const bad of [-1, NaN, Infinity, '1']) assert.throws(() => addTimes({}, { rowSeconds: bad }), /invalid timing/)
})
} finally { rmSync(scratch, { recursive: true, force: true }) }
console.log(JSON.stringify({ syntheticCommonChecks: checks, realRowsRead: 0, engineProcesses: 0, maiaCalls: 0, tablebaseRequests: 0 }))
