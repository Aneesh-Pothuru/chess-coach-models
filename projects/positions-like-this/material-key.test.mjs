import assert from 'node:assert/strict'
import test from 'node:test'
import { Bucket, featuresOf, groupSizes, materialKey, normalBoard } from './lib.mjs'

test('a ten-piece count keeps one slot in the material key', () => {
  const a = normalBoard('6k1/6p1/8/8/8/RR6/RRRRRRRR/7K w - - 0 1')
  const b = normalBoard('6k1/6p1/8/8/R7/1R6/RRRRRRRR/7K w - - 0 1')
  const key = materialKey(a)
  assert.equal(groupSizes(key)[3], 10)
  assert.equal(materialKey(b), key)
  const bucket = new Bucket(key)
  assert.equal(bucket.width, 10)
  bucket.add(featuresOf(a), { game: 0, ply: 0, move: 'a3a4', piece: 'R', phase: 'e' })
  bucket.add(featuresOf(b), { game: 1, ply: 0, move: 'a4a3', piece: 'R', phase: 'e' })
  assert.deepEqual([...bucket.distancesTo(featuresOf(a))], [0, 1])
})

test('ordinary material keys stay compatible with the saved index', () => {
  const start = normalBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
  assert.equal(materialKey(start), '121128/121128')
  assert.deepEqual(groupSizes(materialKey(start)), [2, 1, 1, 2, 1, 2, 1, 1, 2, 1])
})
