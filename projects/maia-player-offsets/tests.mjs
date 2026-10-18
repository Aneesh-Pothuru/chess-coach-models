// Synthetic protocol checks only. No private game file is opened, no model is run,
// and no statistic from the player's games is computed.
//
//   bridge/run.sh projects/maia-player-offsets/tests.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { join } from 'node:path'
import { chess } from '../../bridge/lib/chess.mjs'
import { bandsFor, punishBand, CANDIDATES, baseline } from './design.mjs'
import { completedKeys } from './io.mjs'
import {
  bestFromGrid, sharedSamples, doubledLowerTailP, interval, applyHolm,
  summarizeGuard, allGuardCellsPass, chooseAdoption,
} from './fit.mjs'

const { defaultMaiaElo } = await chess('src/services/engine/index.ts')
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12)

// A person's offset follows that person through both Maia inputs.
const split = { kind: 'A', him: 0, opp: 500 }
for (const me of [true, false]) {
  const m = { r: 1000, ro: 1050, me }
  assert.deepEqual(bandsFor(m, split), {
    s: defaultMaiaElo(m.r, me ? 0 : 500),
    o: defaultMaiaElo(m.ro, me ? 500 : 0),
  })
  assert.equal(punishBand(m, split), defaultMaiaElo(m.r, me ? 0 : 500))
}
const line = { kind: 'B', a: 250, b: -0.5 }
assert.deepEqual(bandsFor({ r: 900, ro: 1200, me: true }, line), bandsFor({ r: 900, ro: 1200, me: false }, line))
assert.deepEqual(bandsFor({ r: 900, ro: 1200, me: true }, baseline), { s: defaultMaiaElo(900, 250), o: defaultMaiaElo(1200, 250) })

// The baseline wins a flat fitting surface; exact parameter ties are stable
// under grid order, and a strictly better score wins even when very close.
assert.equal(bestFromGrid([...CANDIDATES.A].reverse(), () => -1).best.id, 'A:250:250')
assert.equal(bestFromGrid([...CANDIDATES.B].reverse(), () => -1).best.id, 'B:250:0')
const a = [{ kind: 'A', him: 275, opp: 225 }, { kind: 'A', him: 225, opp: 275 }]
assert.equal(bestFromGrid(a, () => -1).best.him, 225)
assert.equal(bestFromGrid(a, c => c.him === 275 ? -1 + 1e-14 : -1).best.him, 275)
const b = [{ kind: 'B', a: 275, b: 0 }, { kind: 'B', a: 225, b: 0 }, { kind: 'B', a: 250, b: 0.25 }]
assert.deepEqual(bestFromGrid(b, () => -1).best, { kind: 'B', a: 225, b: 0 })

// Percentile indices and the finite-draw tails match the written rule.
const increasing = Array.from({ length: 1000 }, (_, i) => i)
assert.deepEqual(interval(increasing), [25, 974])
assert.deepEqual(interval(increasing, 0.0125), [12, 987])
close(doubledLowerTailP(Array(1000).fill(1)), 2 / 1001)
close(doubledLowerTailP([0, 1, 1, 1]), 4 / 5)
assert.equal(doubledLowerTailP([0, 0, 0]), 1)
assert.equal(doubledLowerTailP([-1, -1, 1, 1]), 1)
assert.equal(doubledLowerTailP(Array(1000).fill(-1)), 1)
const s1 = sharedSamples([1, 3, 5, 7], 20, 7)
assert.deepEqual(s1, sharedSamples([1, 3, 5, 7], 20, 7))
assert.ok(s1.every(s => s.length === 4 && [...s].every(g => [1, 3, 5, 7].includes(g))))

const test = (p, low = 0.1, stageLow = 0.05, fitGain = 0.1) => ({
  fitGain, held: { p, complete: true, gain: 0.1, interval95: [low, 0.2], interval975: [stageLow, 0.3] },
})
let h = { A: test(0.02), B: test(0.03) }
assert.deepEqual(applyHolm(h), ['A', 'B'])
assert.ok(h.A.wins && h.B.wins)
assert.equal(h.A.holm.adjustedP, 0.04)
assert.equal(h.B.holm.adjustedP, 0.04)
h = { A: test(0.01), B: test(0.01) }
assert.deepEqual(applyHolm(h), ['A', 'B'])
h = { A: test(0.02), B: test(0.001) }
assert.deepEqual(applyHolm(h), ['B', 'A'])
h = { A: test(0.025), B: test(0.03) }
applyHolm(h)
assert.equal(h.A.wins, false) // Equality at adjusted alpha does not pass.
assert.equal(h.B.wins, false) // A later step cannot bypass the first failure.
h = { A: test(0.001, 0.1, 0), B: test(0.002) }
applyHolm(h)
assert.equal(h.A.wins, false) // Positive ordinary interval is insufficient.
assert.equal(h.B.wins, false)
h = { A: test(0.001, 0.1, 0.05, 0), B: test(0.002) }
applyHolm(h)
assert.equal(h.A.wins, false)
h = { A: test(0.001), B: test(0.002, 0) }
applyHolm(h)
assert.equal(h.B.wins, false)
// Convincing negative evidence must not rank before or block positive evidence.
h = { A: test(doubledLowerTailP(Array(1000).fill(-1))), B: test(0.002) }
h.A.held.gain = -0.1
h.A.held.interval95 = [-0.2, -0.05]
h.A.held.interval975 = [-0.3, -0.025]
assert.deepEqual(applyHolm(h), ['B', 'A'])
assert.equal(h.B.wins, true)
assert.equal(h.A.wins, false)
h.A.guardPass = h.B.guardPass = true
assert.equal(chooseAdoption(h), 'B')

// Brier differences keep their sign and use event weights, not equal weights
// for game averages. Boundary upper bounds pass; a strictly larger one fails.
const fixed = Array.from({ length: 1000 }, () => [0, 1])
let g = summarizeGuard([{ n: 1, sums: [0.1, 0.102] }, { n: 9, sums: [0.9, 0.927] }], fixed, [0, 1], 1)
close(g.difference, 0.0029)
assert.equal(g.pass, true)
g = summarizeGuard([{ n: 1, sums: [0, 0.005] }], [[0]], [0], 1)
assert.equal(g.pass, true)
g = summarizeGuard([{ n: 1, sums: [0, 0.005001] }], [[0]], [0], 1)
assert.equal(g.pass, false)
g = summarizeGuard([{ n: 1, sums: [0.1, 0.09] }], [[0]], [0], 1)
assert.ok(g.difference < 0 && g.pass)
const zero = { n: 0, sums: [0, 0] }
g = summarizeGuard([zero, { n: 1, sums: [0.1, 0.1] }], [[0, 0], [0, 1]], [0, 1], 1)
assert.equal(g.emptyDraws, 1)
assert.equal(g.status, 'inconclusive')
assert.equal(g.pass, false)
assert.equal(g.interval975, null)
g = summarizeGuard([zero, zero], [[0, 1]], [0, 1], 1)
assert.equal(g.events, 0)
assert.equal(g.status, 'inconclusive')
assert.equal(g.difference, null)
assert.equal(g.pass, false)

// Every verified/all by direction cell is necessary. Missing cells and an
// inconclusive cell fail, and no likelihood result can override the guard.
assert.equal(allGuardCellsPass(Array.from({ length: 4 }, () => ({ pass: true }))), true)
assert.equal(allGuardCellsPass(Array.from({ length: 3 }, () => ({ pass: true }))), false)
for (let bad = 0; bad < 4; bad++) {
  assert.equal(allGuardCellsPass(Array.from({ length: 4 }, (_, i) => ({ pass: i !== bad }))), false)
}
const choice = (gain, wins = true, guardPass = true) => ({ held: { gain }, wins, guardPass })
assert.equal(chooseAdoption({ A: choice(0.1), B: choice(0.1) }), 'B')
assert.equal(chooseAdoption({ A: choice(0.2), B: choice(0.1) }), 'A')
assert.equal(chooseAdoption({ A: choice(0.2, true, false), B: choice(0.1) }), 'B')
assert.equal(chooseAdoption({ A: choice(0.2, true, false), B: choice(0.1, false) }), null)

// Resume logic keeps only newline-committed rows, including when an interrupted
// row is longer than the backward-scan buffer. All files contain synthetic keys.
const scratch = fs.mkdtempSync('/tmp/maia-player-offsets-test-')
try {
  const file = join(scratch, 'rows.jsonl')
  assert.deepEqual(await completedKeys(file), new Set())
  assert.equal(fs.statSync(file).size, 0)
  const complete = [{ k: 0, label: 'synthetic' }, { k: 1, label: 'synthetic♞' }].map(row => JSON.stringify(row) + '\n').join('')
  fs.writeFileSync(file, complete + '{"k":2,"payload":"' + 'x'.repeat(70_000))
  const received = []
  assert.deepEqual(await completedKeys(file, (row, bytes) => received.push({ key: row.k, bytes })), new Set([0, 1]))
  assert.equal(fs.readFileSync(file, 'utf8'), complete)
  assert.deepEqual(received.map(row => row.key), [0, 1])
  assert.equal(received.reduce((sum, row) => sum + row.bytes, 0), Buffer.byteLength(complete))
  fs.writeFileSync(file, '{"k":0}\n{"k":0}\n')
  await assert.rejects(completedKeys(file), /duplicated cached position/)
} finally {
  fs.rmSync(scratch, { recursive: true, force: true })
}
console.log('Synthetic protocol and resume checks passed; no private game files or model inference were used.')
