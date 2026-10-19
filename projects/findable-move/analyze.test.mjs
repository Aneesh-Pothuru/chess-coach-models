import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

// Run the unchanged analyzer in a scratch lab, with synthetic rollout scores.
// This needs neither the app nor the player's private data.
function analyze({ dF = -0.5, dP = -20, nullDifference = 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'findable-move-audit-'))
  try {
    const project = join(root, 'projects/findable-move')
    const data = join(root, 'private/findable-move')
    const results = join(project, 'results')
    for (const dir of [join(root, 'bridge/lib'), data, results]) mkdirSync(dir, { recursive: true })
    for (const file of ['projects/findable-move/analyze.mjs', 'projects/findable-move/lib.mjs', 'bridge/lib/lab.mjs']) {
      copyFileSync(join(ROOT, file), join(root, file))
    }
    const positions = ['train', 'heldout'].map((split, id) => ({
      id, game: id, split, kind: 'turning', phase: 'middlegame', decoy: true,
      B: { uci: 'a2a3', wp: 50, pHis: 0.1, forcing: false },
      F: { uci: 'b2b3', wp: 49, pHis: 0.2, forcing: false },
      P: { uci: 'c2c3' },
    }))
    const rollouts = positions.flatMap((p) => ['B', 'F', 'P'].flatMap((which) => Array.from({ length: 16 }, (_, k) => ({
      id: p.id, which, k,
      wp: 50 + (which === 'B' ? (k < 8 ? nullDifference / 2 : -nullDifference / 2) : which === 'F' ? dF : dP),
    }))))
    const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
    writeFileSync(join(data, 'positions.jsonl'), jsonl(positions))
    writeFileSync(join(data, 'rollouts-0-of-1.jsonl'), jsonl(rollouts))
    writeFileSync(join(results, 'positions.json'), JSON.stringify({ app: { commit: 'synthetic' } }))
    const run = spawnSync(process.execPath, [join(project, 'analyze.mjs')], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    return JSON.parse(readFileSync(join(results, 'findable-move.json'), 'utf8'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

for (const [dF, verdict] of [
  [-0.999, 'holds up'],
  [0.001, 'better in his hands'],
  [-1.001, "the engine's best is worth the trouble"],
]) {
  test(`the verdict compares the unrounded interval at D_F=${dF}`, () => {
    assert.equal(analyze({ dF }).verdict, verdict)
  })
}

test('a null interval strictly above zero fails even within display precision', () => {
  const report = analyze({ nullDifference: 0.001 })
  assert.equal(report.controls.train.null.passes, false)
  assert.equal(report.verdict, 'no verdict: a control failed')
})

test('a decoy interval strictly below zero passes even within display precision', () => {
  const report = analyze({ dP: -0.001 })
  assert.equal(report.controls.train.decoy.passes, true)
  assert.equal(report.verdict, 'holds up')
})
