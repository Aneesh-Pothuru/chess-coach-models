import assert from 'node:assert/strict'
import test from 'node:test'
import {
  Bucket, armsOf, checkPlantedTwin, featuresOf, materialKey, moveCode, normalBoard, requirePlantedTwins,
} from './lib.mjs'

// The legal set is synthetic: these tests exercise retrieval, not move legality.
const board = normalBoard('7k/8/8/8/8/8/PP6/KR6 w - - 0 1')
const farther = normalBoard('6k1/8/8/8/8/8/PP6/KR6 w - - 0 1')
const legal = new Set([moveCode('b1c1')])
const plant = { game: 99, ply: 20, move: 'b1c1', piece: 'R', phase: 'm' }
const fixture = (same = false) => {
  const b = new Bucket(materialKey(board))
  for (let game = 0; game < 9; game++) b.add(featuresOf(same ? board : farther), { ...plant, game })
  return b.freeze()
}

test('the planted move is retrieved from the bucket without changing T or R', () => {
  const bucket = fixture()
  const index = new Map([[bucket.key, bucket]])
  const before = armsOf(index, board, legal, 17)
  const check = checkPlantedTwin(bucket, board, legal, plant, 17)
  assert.deepEqual(check, { retrieved: true, distance: 0, move: plant.move })
  assert.equal(bucket.n, 9)
  const after = armsOf(index, board, legal, 17)
  for (const arm of ['T', 'R', 'R2']) assert.deepEqual(after[arm], before[arm])
})

test('an exact existing match can tie the twin without hiding it', () => {
  const bucket = fixture(true)
  for (let seed = 0; seed < 10; seed++) {
    assert.equal(checkPlantedTwin(bucket, board, legal, plant, seed).retrieved, true)
    assert.equal(bucket.n, 9)
  }
})

test('a broken indexed distance fails the control even though self-distance is zero', () => {
  const bucket = fixture()
  bucket.distancesTo = () => new Uint8Array(bucket.n).fill(1)
  assert.throws(() => checkPlantedTwin(bucket, board, legal, plant, 17), /distance 0/)
  assert.equal(bucket.n, 9)
})

test('cached scores cannot pass the control without retrieval evidence', () => {
  const row = { status: 'scored', twin: plant.move }
  assert.throws(() => requirePlantedTwins([row]), /no checked planted-twin/)
  requirePlantedTwins([{ ...row, twinCheck: { retrieved: true, distance: 0, move: plant.move } }])
  assert.throws(() => requirePlantedTwins([{ ...row, twinCheck: { retrieved: true, distance: 1, move: plant.move } }]), /no checked planted-twin/)
})
