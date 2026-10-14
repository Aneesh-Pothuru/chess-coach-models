// Compare a candidate's labels with the pinned app's, puzzle by puzzle, by the
// rule in the README: agreement and disagreement per labeller, and the paired
// bootstrap interval of each difference.
//
//   bridge/run.sh projects/detector-themes/compare.mjs <candidate> [best|blunder|move]
//
// Reads the per-puzzle labels score.mts wrote to data/processed/; writes
// results/compare-<candidate>.json.
import fs from 'node:fs'
import { join } from 'node:path'
import { LAB_DIR, chess, resultsDir } from '../../bridge/lib/chess.mjs'

const candidate = process.argv[2]
const labeller = process.argv[3] ?? 'best'
if (!candidate) throw new Error('usage: compare.mjs <candidate> [best|blunder|move]')
const DRAWS = 2000
const SEED = 20261014
const read = (set, tag) => JSON.parse(fs.readFileSync(join(LAB_DIR, 'data/processed', `detector-themes-labels-${set}${tag ? `-${tag}` : ''}.json`), 'utf8'))
const { VOCABULARY: vocabulary } = await chess('src/services/knowledge/index.ts')

/** The concepts a row's words for this labeller name. */
const said = (row) => {
  if (labeller === 'move') return new Set(row.move)
  const words = labeller === 'best' ? [row.best] : row.blunder
  return new Set(words.map((w) => vocabulary[w]).filter(Boolean))
}
const scoreRow = (row) => {
  const truth = new Set(row.truth)
  const s = [...said(row)]
  return { agree: s.some((c) => truth.has(c)) ? 1 : 0, disagree: s.some((c) => !truth.has(c)) ? 1 : 0 }
}

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const out = { project: 'detector-themes', candidate, labeller, draws: DRAWS, sets: {} }
for (const set of ['app', 'heldout']) {
  const base = new Map(read(set, '').map((r) => [r.id, r]))
  const cand = read(set, candidate)
  const pairs = cand.filter((r) => base.has(r.id)).map((r) => ({ b: scoreRow(base.get(r.id)), c: scoreRow(r) }))
  const n = pairs.length
  const diff = (key, idx) => idx.reduce((s, i) => s + pairs[i][`c`][key] - pairs[i][`b`][key], 0) / idx.length
  const all = [...pairs.keys()]
  const u = rng(SEED)
  const boots = { agree: [], disagree: [] }
  for (let d = 0; d < DRAWS; d++) {
    const idx = Array.from({ length: n }, () => Math.floor(u() * n))
    boots.agree.push(diff('agree', idx))
    boots.disagree.push(diff('disagree', idx))
  }
  const ci = (xs) => {
    const s = [...xs].sort((a, b) => a - b)
    return [s[Math.floor(0.025 * s.length)], s[Math.floor(0.975 * s.length)]]
  }
  const rate = (who, key) => pairs.reduce((s, p) => s + p[who][key], 0) / n
  out.sets[set] = {
    puzzles: n,
    base: { agree: rate('b', 'agree'), disagree: rate('b', 'disagree') },
    candidate: { agree: rate('c', 'agree'), disagree: rate('c', 'disagree') },
    agreeDiff: diff('agree', all),
    agreeCi: ci(boots.agree),
    disagreeDiff: diff('disagree', all),
    disagreeCi: ci(boots.disagree),
  }
}
const keep = Object.values(out.sets).every((s) => s.agreeCi[0] > 0 && s.disagreeCi[1] <= 0.01)
out.verdict = keep ? 'keep' : 'drop'
fs.writeFileSync(join(resultsDir('detector-themes'), `compare-${candidate}.json`), JSON.stringify(out, null, 1) + '\n')
console.log(JSON.stringify(out, null, 1))
