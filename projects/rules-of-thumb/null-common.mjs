// Sampling mechanics shared by the two preregistered additions.
import { seeded } from './detect.mjs'

export function sampleWithoutReplacement(items, count, seedKey) {
  if (!Number.isInteger(count) || count < 0 || count > items.length) throw new Error('invalid sample size')
  if (typeof seedKey !== 'string') throw new Error('sample seed must be a string')
  const copy = [...items]
  const random = seeded(seedKey)
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (copy.length - i))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}
