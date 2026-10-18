// Compare a candidate's labels with the pinned app's, puzzle by puzzle, by the
// rule in the README: agreement and disagreement per labeller, and the paired
// bootstrap interval of each difference.
//
//   bridge/run.sh projects/detector-themes/compare.mjs <candidate> [best|blunder|move] [--round2]
//
// Reads the per-puzzle labels score.mts wrote to data/processed/; writes
// results/compare-<candidate>.json. Round 2 reads private/detector-themes/round2
// and results/round2, checks the complete paired inputs, and writes results/round2.
import fs from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { CHESS_DIR, LAB_DIR, chess, resultsDir } from '../../bridge/lib/chess.mjs'

const args = process.argv.slice(2)
const round2 = args.at(-1) === '--round2'
if (round2) args.pop()
const candidate = args[0]
const labeller = args[1] ?? 'best'
if (!candidate || args.length > 2 || args.some((arg) => arg.startsWith('--'))) throw new Error('usage: compare.mjs <candidate> [best|blunder|move] [--round2]')
if (!/^[a-z0-9-]+$/.test(candidate)) throw new Error('invalid candidate name')
if (!['best', 'blunder', 'move'].includes(labeller)) throw new Error('unknown labeller')
const DRAWS = 2000
const SEED = 20261014
const outputDir = join(resultsDir('detector-themes'), ...(round2 ? ['round2'] : []))
const rowDir = join(LAB_DIR, round2 ? 'private/detector-themes/round2' : 'data/processed')
const json = (path) => JSON.parse(fs.readFileSync(path, 'utf8'))
const labelsPath = (set, tag) => join(rowDir, `detector-themes-labels-${set}${tag ? `-${tag}` : ''}.json`)
const read = (set, tag) => json(labelsPath(set, tag))
const { VOCABULARY: vocabulary } = await chess('src/services/knowledge/index.ts')
const pin = round2 ? json(join(LAB_DIR, 'bridge/chess.json')).commit : null
const vocabularyPath = 'src/services/knowledge/catalogue/vocabulary.ts'
const vocabularySha256 = round2 ? createHash('sha256').update(fs.readFileSync(join(CHESS_DIR, vocabularyPath))).digest('hex') : null
const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b) && a.every((x) => typeof x === 'string') && b.every((x) => typeof x === 'string') && new Set(a).size === new Set(b).size && a.every((x) => b.includes(x))
const canonicalSources = (sources) => JSON.stringify(Object.entries(sources).sort(([a], [b]) => a.localeCompare(b)))
const validDigest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
let provenance = null

/** Round 2 never drops a puzzle to make two inputs match. */
function checkedInputs(set) {
  const scores = ['', candidate].map((tag) => json(join(outputDir, `score-${set}${tag ? `-${tag}` : ''}.json`)))
  const labelFiles = ['', candidate].map((tag) => fs.readFileSync(labelsPath(set, tag)))
  const rows = labelFiles.map((data) => JSON.parse(data.toString('utf8')))
  for (let i = 0; i < 2; i++) {
    const score = scores[i]
    if (score.project !== 'detector-themes' || score.round !== 2 || score.set !== set || score.candidate !== (i ? candidate : null)) throw new Error(`${set}: score identity mismatch`)
    if (score.app !== pin) throw new Error(`${set}: score does not measure the current app pin`)
    if (!Array.isArray(rows[i]) || rows[i].length === 0 || rows[i].length !== score.puzzles || score.skipped !== 0) throw new Error(`${set}: incomplete or empty labels`)
    if (!validDigest(score.labelsSha256) || createHash('sha256').update(labelFiles[i]).digest('hex') !== score.labelsSha256) throw new Error(`${set}: labels do not match their score aggregate`)
    if (!validDigest(score.datasetSha256) || !validDigest(score.scorerSha256) || !score.sourceSha256 || !Object.keys(score.sourceSha256).length || !Object.values(score.sourceSha256).every(validDigest)) throw new Error(`${set}: missing source or data digests`)
    if (score.sourceSha256[vocabularyPath] !== vocabularySha256) throw new Error(`${set}: scored vocabulary differs from the comparison vocabulary`)
    if (rows[i].some((row) => typeof row.id !== 'string' || !row.id || typeof row.best !== 'string' || !sameSet(row.truth, row.truth) || !sameSet(row.blunder, row.blunder) || !sameSet(row.move, row.move))) throw new Error(`${set}: malformed label row`)
    if (new Set(rows[i].map((row) => row.id)).size !== rows[i].length) throw new Error(`${set}: duplicate puzzle labels`)
  }
  const [baseline, changed] = scores
  if (baseline.datasetSha256 !== changed.datasetSha256 || baseline.scorerSha256 !== changed.scorerSha256) throw new Error(`${set}: baseline and candidate used different data or scorer`)
  const sourceKeys = (score) => Object.keys(score.sourceSha256)
  if (!sameSet(sourceKeys(baseline), sourceKeys(changed))) throw new Error(`${set}: source digest inventories differ`)
  const base = new Map(rows[0].map((row) => [row.id, row]))
  if (base.size !== rows[1].length || rows[1].some((row) => !base.has(row.id))) throw new Error(`${set}: baseline and candidate puzzle sets differ`)
  for (const row of rows[1]) {
    const before = base.get(row.id)
    if (!sameSet(before.truth, row.truth) || !sameSet(before.themes, row.themes) || before.rating !== row.rating) throw new Error(`${set}: paired puzzle truth or descriptors differ`)
    for (const other of ['best', 'blunder', 'move'].filter((key) => key !== labeller)) {
      const equal = other === 'best' ? before.best === row.best : sameSet(before[other], row[other])
      if (!equal) throw new Error(`${set}: candidate changes a labeller outside its declared target`)
    }
  }
  const sources = {
    baseline: { app: baseline.app, sourceSha256: baseline.sourceSha256, scorerSha256: baseline.scorerSha256 },
    candidate: { app: changed.app, sourceSha256: changed.sourceSha256, scorerSha256: changed.scorerSha256 },
  }
  if (provenance) {
    for (const who of ['baseline', 'candidate']) if (provenance[who].scorerSha256 !== sources[who].scorerSha256 || canonicalSources(provenance[who].sourceSha256) !== canonicalSources(sources[who].sourceSha256)) throw new Error('the app pool and held-out set used different source code')
  } else provenance = sources
  return { base, cand: rows[1], datasetSha256: baseline.datasetSha256, labelsSha256: { baseline: baseline.labelsSha256, candidate: changed.labelsSha256 } }
}

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

const out = { project: 'detector-themes', candidate, labeller, draws: DRAWS, ...(round2 ? { round: 2, seed: SEED } : {}), sets: {} }
for (const set of ['app', 'heldout']) {
  const checked = round2 ? checkedInputs(set) : null
  const base = checked?.base ?? new Map(read(set, '').map((r) => [r.id, r]))
  const cand = checked?.cand ?? read(set, candidate)
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
    ...(checked ? { datasetSha256: checked.datasetSha256, labelsSha256: checked.labelsSha256 } : {}),
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
if (round2) out.provenance = provenance
fs.mkdirSync(outputDir, { recursive: true })
fs.writeFileSync(join(outputDir, `compare-${candidate}.json`), JSON.stringify(out, null, 1) + '\n')
console.log(JSON.stringify(out, null, 1))
