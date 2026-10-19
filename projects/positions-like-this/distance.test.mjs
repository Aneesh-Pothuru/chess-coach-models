import assert from 'node:assert/strict'
import test from 'node:test'
import { distance, distanceParts, featuresOf, groupSizes, materialKey, normalBoard } from './lib.mjs'

test('seven promoted pieces still use the least-cost pairing', () => {
  const a = normalBoard('7k/8/8/8/8/8/RRRRRRR1/7K w - - 0 1')
  const b = normalBoard('7k/8/8/8/8/8/1RRRRRRR/7K w - - 0 1')
  const sizes = groupSizes(materialKey(a))
  assert.equal(materialKey(a), materialKey(b))
  // Six squares pair with themselves. Only a2 and h2 remain, at the cap of two.
  assert.equal(distance(featuresOf(a), sizes, featuresOf(b)), 2)
  assert.deepEqual(distanceParts(featuresOf(a), sizes, featuresOf(b)), { pawns: 0, pieces: 2, kings: 0 })
  assert.equal(distance(featuresOf(b), sizes, featuresOf(a)), 2)
})

test('ordinary two-piece groups retain their least-cost pairing', () => {
  const a = normalBoard('7k/8/8/8/8/8/RR6/7K w - - 0 1')
  const b = normalBoard('7k/8/8/8/8/8/1RR5/7K w - - 0 1')
  assert.equal(distance(featuresOf(a), groupSizes(materialKey(a)), featuresOf(b)), 2)
})
