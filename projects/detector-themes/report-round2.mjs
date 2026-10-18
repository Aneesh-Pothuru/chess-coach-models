// The frozen round-two test, reported from aggregates. The sample is read
// only to bind its raw and canonical-array hashes; no puzzle rows are emitted.
// Run after both comparisons: node projects/detector-themes/report-round2.mjs
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT = 'projects/detector-themes'
const root = fileURLToPath(new URL('../../', import.meta.url))
const dir = `${PROJECT}/results/round2`
const frozenCommit = 'b055ee132c0cde90c2409f52ae9a94c8d9afa0a6'
const variants = {
  'best-deflection': { word: 'deflection', concept: 'deflection' },
  'best-trapped': { word: 'trappedPiece', concept: 'trapped-piece' },
}
const rule = { draws: 2000, seed: 20261014, confidence: 0.95, agreementLowerAbove: 0, disagreementUpperAtMost: 0.01 }
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 })
const isDigest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const isCount = (value) => Number.isInteger(value) && value >= 0
const near = (a, b, message) => assert(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-12, message)
const canonicalSources = (value) => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
const sameSources = (a, b, message) => assert(canonicalSources(a) === canonicalSources(b), message)

assert(git('rev-parse', frozenCommit).toString().trim() === frozenCommit, 'the frozen commit is unavailable')
const frozenPaths = [
  'bridge/chess.json',
  ...['candidate.sh', 'compare.mjs', 'development.mjs', 'run-score.sh', 'sample.py', 'score.mts'].map((name) => `${PROJECT}/${name}`),
  ...['sample.json', 'development.json', 'development.md', 'score-app.json', ...Object.keys(variants).map((name) => `score-app-${name}.json`)].map((name) => `${dir}/${name}`),
  ...git('ls-tree', '-r', '--name-only', frozenCommit, `${PROJECT}/candidates`).toString().trim().split('\n').filter(Boolean),
].sort()
const frozenChecksums = {}
for (const path of frozenPaths) {
  const expected = git('show', `${frozenCommit}:${path}`)
  const actual = fs.readFileSync(join(root, path))
  assert(expected.equals(actual), `${path}: differs from the frozen phase-one commit`)
  frozenChecksums[path] = { gitBlob: git('rev-parse', `${frozenCommit}:${path}`).toString().trim(), sha256: sha256(actual) }
}

const inputs = {}
function read(path) {
  const bytes = fs.readFileSync(join(root, path))
  inputs[path] = sha256(bytes)
  return JSON.parse(bytes)
}
const sample = read(`${dir}/sample.json`)
const development = read(`${dir}/development.json`)
const pin = JSON.parse(git('show', `${frozenCommit}:bridge/chess.json`)).commit
assert(sample.app === pin && development.app === pin, 'app pin differs from phase-one provenance')
assert(sample.excluded_app_ids === 4630 && sample.sampled === 20000, 'the frozen set sizes changed')
assert(sample.seed === rule.seed && JSON.stringify(sample.ratings) === '[400,1899]', 'the frozen sample design changed')
for (const key of ['source_sha256', 'app_pool_sha256', 'data_sha256']) assert(isDigest(sample[key]), `sample: invalid ${key}`)
assert(JSON.stringify(development.sample) === JSON.stringify(sample), 'development uses a different held-out sample')
const sampleBytes = fs.readFileSync(join(root, sample.data))
assert(sha256(sampleBytes) === sample.data_sha256, 'the held-out sample bytes changed after phase one')
const heldoutDatasetSha256 = sha256(JSON.stringify(JSON.parse(sampleBytes)))
const sourceHasher = createHash('sha256')
let sourceBytes = 0
for await (const chunk of fs.createReadStream(join(root, sample.source))) {
  sourceHasher.update(chunk)
  sourceBytes += chunk.length
}
assert(sourceHasher.digest('hex') === sample.source_sha256 && sourceBytes === sample.source_bytes, 'the downloaded puzzle source differs from frozen provenance')
const expectedN = { app: sample.excluded_app_ids, heldout: sample.sampled }
const themePath = 'src/services/knowledge/detectors/theme.ts'
const scorerSha256 = frozenChecksums[`${PROJECT}/score.mts`].sha256
const scores = { app: {}, heldout: {} }

function summarize(score) {
  const rows = Object.values(score.table.best)
  for (const row of rows) {
    for (const key of ['tp', 'fp', 'fn']) assert(isCount(row[key]) && row[key] <= score.puzzles, 'invalid best-label count')
    assert(row.tp + row.fp <= score.puzzles && row.tp + row.fn <= score.puzzles, 'concept counts exceed the set size')
  }
  const agreeCount = rows.reduce((sum, row) => sum + row.tp, 0)
  const disagreeCount = rows.reduce((sum, row) => sum + row.fp, 0)
  assert(agreeCount + disagreeCount <= score.puzzles, 'best is not a single concept per puzzle')
  const words = Object.values(score.bestWords)
  assert(words.every(isCount) && words.reduce((sum, n) => sum + n, 0) === score.puzzles, 'best word counts do not cover the set')
  assert(Number.isFinite(score.timing.puzzleSeconds) && score.timing.puzzleSeconds >= 0 && score.timing.shards === 2, 'invalid scoring timing')
  return {
    puzzles: score.puzzles,
    agreeCount, agreeRate: agreeCount / score.puzzles,
    disagreeCount, disagreeRate: disagreeCount / score.puzzles,
    puzzleSeconds: score.timing.puzzleSeconds,
  }
}

for (const set of ['app', 'heldout']) {
  for (const name of ['baseline', ...Object.keys(variants)]) {
    const candidate = name === 'baseline' ? null : name
    const score = read(`${dir}/score-${set}${candidate ? `-${candidate}` : ''}.json`)
    assert(score.project === 'detector-themes' && score.round === 2 && score.set === set && score.candidate === candidate, `${set}/${name}: score identity differs`)
    assert(score.app === pin && score.puzzles === expectedN[set] && score.skipped === 0, `${set}/${name}: incomplete set or wrong app`)
    for (const key of ['datasetSha256', 'labelsSha256', 'scorerSha256']) assert(isDigest(score[key]), `${set}/${name}: invalid ${key}`)
    assert(score.scorerSha256 === scorerSha256, `${set}/${name}: scorer was not frozen`)
    assert(score.sourceSha256 && Object.keys(score.sourceSha256).length > 0 && Object.values(score.sourceSha256).every(isDigest), `${set}/${name}: invalid source hashes`)
    if (candidate) assert(score.sourceSha256[themePath] === frozenChecksums[`${PROJECT}/candidates/${candidate}/theme.ts`].sha256, `${set}/${name}: candidate theme was not frozen`)
    scores[set][name] = { score, summary: summarize(score) }
  }
  const baseline = scores[set].baseline.score
  for (const name of Object.keys(variants)) {
    const score = scores[set][name].score
    assert(score.datasetSha256 === baseline.datasetSha256, `${set}: candidate data differs from baseline`)
    const unchanged = (source) => Object.fromEntries(Object.entries(source).filter(([path]) => path !== themePath))
    sameSources(unchanged(score.sourceSha256), unchanged(baseline.sourceSha256), `${set}/${name}: another measured source changed`)
  }
}
for (const name of ['baseline', ...Object.keys(variants)]) sameSources(scores.app[name].score.sourceSha256, scores.heldout[name].score.sourceSha256, `${name}: app and held-out sources differ`)
assert(scores.heldout.baseline.score.datasetSha256 === heldoutDatasetSha256, 'the held-out scores did not use the frozen sample')
assert(development.puzzles === expectedN.app && development.datasetSha256 === scores.app.baseline.score.datasetSha256, 'development data differs from the app scores')
for (const name of ['baseline', ...Object.keys(variants)]) {
  const dev = name === 'baseline' ? development.baseline : development.candidates[name]
  const summary = scores.app[name].summary
  assert(dev.agree === summary.agreeCount && dev.disagree === summary.disagreeCount, `${name}: phase-one counts differ`)
  near(dev.puzzleSeconds, summary.puzzleSeconds, `${name}: phase-one timing differs`)
}

const candidates = {}
const finiteInterval = (ci) => Array.isArray(ci) && ci.length === 2 && ci.every((x) => Number.isFinite(x) && x >= -1 && x <= 1) && ci[0] <= ci[1]
const rateCounts = ({ agreeCount, agreeRate, disagreeCount, disagreeRate }) => ({ agreeCount, agreeRate, disagreeCount, disagreeRate })
for (const [name, definition] of Object.entries(variants)) {
  const comparison = read(`${dir}/compare-${name}.json`)
  assert(comparison.project === 'detector-themes' && comparison.round === 2 && comparison.candidate === name && comparison.labeller === 'best', `${name}: comparison identity differs`)
  assert(comparison.draws === rule.draws && comparison.seed === rule.seed, `${name}: bootstrap design differs`)
  assert(JSON.stringify(Object.keys(comparison.sets).sort()) === '["app","heldout"]', `${name}: comparison must contain both sets`)
  const sets = {}
  for (const set of ['app', 'heldout']) {
    const pair = comparison.sets[set]
    const base = scores[set].baseline
    const changed = scores[set][name]
    assert(pair.puzzles === expectedN[set] && pair.datasetSha256 === base.score.datasetSha256, `${name}/${set}: comparison data differs`)
    assert(pair.labelsSha256?.baseline === base.score.labelsSha256 && pair.labelsSha256?.candidate === changed.score.labelsSha256, `${name}/${set}: comparison label hashes differ from the score aggregates`)
    for (const [who, summary] of [['base', base.summary], ['candidate', changed.summary]]) {
      near(pair[who].agree, summary.agreeRate, `${name}/${set}: ${who} agreement rate differs from TP counts`)
      near(pair[who].disagree, summary.disagreeRate, `${name}/${set}: ${who} disagreement rate differs from FP counts`)
    }
    near(pair.agreeDiff, changed.summary.agreeRate - base.summary.agreeRate, `${name}/${set}: agreement difference differs`)
    near(pair.disagreeDiff, changed.summary.disagreeRate - base.summary.disagreeRate, `${name}/${set}: disagreement difference differs`)
    assert(finiteInterval(pair.agreeCi) && finiteInterval(pair.disagreeCi), `${name}/${set}: invalid paired interval`)
    for (const [who, score] of [['baseline', base.score], ['candidate', changed.score]]) {
      const provenance = comparison.provenance?.[who]
      assert(provenance?.app === pin && provenance?.scorerSha256 === scorerSha256, `${name}: comparison source identity differs`)
      sameSources(provenance.sourceSha256, score.sourceSha256, `${name}/${set}: comparison source hashes differ`)
    }
    const concept = changed.score.table.best[definition.concept]
    assert(concept, `${name}/${set}: missing new-word concept`)
    const said = changed.score.bestWords[definition.word] ?? 0
    assert(said === concept.tp + concept.fp, `${name}/${set}: new word count differs from TP + FP`)
    if (said) near(concept.precision, concept.tp / said, `${name}/${set}: new-word precision differs`)
    else assert(concept.precision === null, `${name}/${set}: undefined precision must be null`)
    if (concept.tp + concept.fn) near(concept.recall, concept.tp / (concept.tp + concept.fn), `${name}/${set}: new-word recall differs`)
    else assert(concept.recall === null, `${name}/${set}: undefined recall must be null`)
    if (set === 'app') {
      assert(JSON.stringify(concept) === JSON.stringify(development.candidates[name].concept), `${name}: phase-one concept counts differ`)
      assert(JSON.stringify(changed.score.bestWords) === JSON.stringify(development.candidates[name].bestWords), `${name}: phase-one word counts differ`)
    }
    sets[set] = {
      puzzles: pair.puzzles,
      baseline: rateCounts(base.summary), candidate: rateCounts(changed.summary),
      agreeDiff: pair.agreeDiff, agreeCi: pair.agreeCi,
      disagreeDiff: pair.disagreeDiff, disagreeCi: pair.disagreeCi,
      newWord: { said, ...concept },
      passesRule: pair.agreeCi[0] > rule.agreementLowerAbove && pair.disagreeCi[1] <= rule.disagreementUpperAtMost,
    }
  }
  const verdict = Object.values(sets).every((set) => set.passesRule) ? 'keep' : 'drop'
  assert(comparison.verdict === verdict, `${name}: verdict differs from the fixed rule`)
  candidates[name] = { labeller: 'best', ...definition, verdict, sets }
}

const heldoutPuzzleSecondsByVariant = Object.fromEntries(Object.entries(scores.heldout).map(([name, value]) => [name, value.summary.puzzleSeconds]))
const result = {
  project: 'detector-themes', round: 2, frozenCommit, app: pin, rule,
  frozenChecksums, inputs,
  data: {
    app: { puzzles: expectedN.app, datasetSha256: scores.app.baseline.score.datasetSha256 },
    heldout: { puzzles: expectedN.heldout, datasetSha256: scores.heldout.baseline.score.datasetSha256, serializedSha256: sample.data_sha256 },
    sample,
    hashBasis: 'The source archive and serialized sample bytes match their frozen hashes. Parsing the sample solely to hash JSON.stringify links its canonical-array hash to all three held-out score files. No puzzle rows or tags are reported.',
  },
  baseline: Object.fromEntries(['app', 'heldout'].map((set) => [set, scores[set].baseline.summary])),
  candidates,
  timing: {
    heldoutPuzzleSecondsByVariant,
    totalHeldoutPuzzleSeconds: Object.values(heldoutPuzzleSecondsByVariant).reduce((sum, seconds) => sum + seconds, 0),
    basis: 'Sum of recorded per-puzzle elapsed times across the two scoring shards; excludes setup, launch, merge and comparison time. This is work time, not elapsed wall time for the full run.',
  },
}

const fixed = (value, places) => {
  const scale = 10 ** places
  return (Math.sign(value) * Math.round(Math.abs(value) * scale + 1e-9) / scale).toFixed(places)
}
const percent = (value) => `${fixed(100 * value, 2)}%`
const points = (value) => `${value > 0 ? '+' : ''}${fixed(100 * value, 3)}`
const interval = (values) => `[${values.map(points).join(', ')}]`
const countRate = (count, rate) => `${count} (${percent(rate)})`
const lines = [
  '# Detector themes, round 2', '',
  `The test measures app commit \`${pin}\`. The candidates, measurement scripts and app-pool results were frozen at \`${frozenCommit}\` before the held-out test. The report checked every frozen file against its Git blob.`, '',
  `The app pool contains ${expectedN.app} puzzles. The held-out set contains ${expectedN.heldout} other puzzles, sampled with seed ${sample.seed} from ${sample.eligible} eligible puzzles rated ${sample.ratings[0]} to ${sample.ratings[1]}. The compressed source has SHA256 \`${sample.source_sha256}\`; the serialized sample has SHA256 \`${sample.data_sha256}\`.`, '',
  `Each candidate is compared independently with the pinned app. Keep requires the paired agreement interval's lower end above zero and the disagreement interval's upper end at or below ${100 * rule.disagreementUpperAtMost} percentage point on both sets. The comparisons use ${rule.draws} puzzle-bootstrap draws, seed ${rule.seed}, and ${100 * rule.confidence}% intervals.`, '',
  '| Candidate | Set | Agreement: app → candidate | Paired change (points), 95% interval | Disagreement: app → candidate | Paired change (points), 95% interval |',
  '|---|---|---|---|---|---|',
]
for (const [name, candidate] of Object.entries(candidates)) {
  for (const [set, row] of Object.entries(candidate.sets)) lines.push(`| \`${name}\` | ${set} | ${countRate(row.baseline.agreeCount, row.baseline.agreeRate)} → ${countRate(row.candidate.agreeCount, row.candidate.agreeRate)} | ${points(row.agreeDiff)} ${interval(row.agreeCi)} | ${countRate(row.baseline.disagreeCount, row.baseline.disagreeRate)} → ${countRate(row.candidate.disagreeCount, row.candidate.disagreeRate)} | ${points(row.disagreeDiff)} ${interval(row.disagreeCi)} |`)
}
lines.push('', '| Candidate | Set | New word said | Agrees | Disagrees | Precision | Verdict on both sets |', '|---|---|---:|---:|---:|---:|---|')
for (const [name, candidate] of Object.entries(candidates)) {
  for (const [set, row] of Object.entries(candidate.sets)) lines.push(`| \`${name}\` | ${set} | ${row.newWord.said} | ${row.newWord.tp} | ${row.newWord.fp} | ${row.newWord.precision === null ? 'undefined' : percent(row.newWord.precision)} | ${candidate.verdict} |`)
}
lines.push('', `Recorded held-out scoring work totals ${result.timing.totalHeldoutPuzzleSeconds.toFixed(3)} seconds: ${Object.entries(heldoutPuzzleSecondsByVariant).map(([name, seconds]) => `${name} ${seconds.toFixed(3)}`).join(', ')}. ${result.timing.basis}`, '', 'These results measure agreement with Lichess’s tagger. They do not establish that every label is correct. The two candidates were tested independently; their combination has not been measured. The defensive-move and hanging-piece changes were deferred and have no verdict in this test.', '', 'The JSON report records every aggregate input checksum and frozen Git blob. It verifies the archive and sample against their frozen hashes, and links the sample’s canonical-array hash to the held-out scores. It emits no puzzle rows or tags.', '')

function atomicWrite(path, text) {
  const target = join(root, path)
  fs.mkdirSync(dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  fs.writeFileSync(temporary, text)
  fs.renameSync(temporary, target)
}
atomicWrite(`${dir}/result.json`, JSON.stringify(result, null, 2) + '\n')
atomicWrite(`${dir}/result.md`, lines.join('\n'))
console.log(`wrote ${relative(root, join(root, dir, 'result.json'))} and result.md`)
