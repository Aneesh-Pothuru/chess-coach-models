// The frozen round-two test, reported from aggregates. The sample is read
// only to bind its raw and canonical-array hashes; no puzzle rows are emitted.
// Run after all comparisons and the overlap report:
// node projects/detector-themes/report-round2.mjs
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyRound2History } from './verify-round2-history.mjs'

const PROJECT = 'projects/detector-themes'
const root = fileURLToPath(new URL('../../', import.meta.url))
const dir = `${PROJECT}/results/round2`
const frozenCommit = 'da8a4cb1d3ef23ad4a71703dd09967f072b2e851'
const independent = {
  'best-deflection': { word: 'deflection', concept: 'deflection' },
  'best-trapped': { word: 'trappedPiece', concept: 'trapped-piece' },
}
const combinedName = 'best-deflection-trapped'
const variants = {
  ...independent,
  [combinedName]: { words: Object.values(independent) },
}
const manifestPath = `${dir}/combined-design.json`
const overlapPath = `${dir}/overlap-${combinedName}.json`
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
const verifiedCombined = verifyRound2History()
const frozenPaths = [
  'bridge/chess.json',
  ...['compare.mjs', 'development.mjs', 'run-score.sh', 'sample.py', 'score.mts'].map((name) => `${PROJECT}/${name}`),
  ...['sample.json', 'development.json', 'development.md', 'score-app.json', ...Object.keys(independent).map((name) => `score-app-${name}.json`)].map((name) => `${dir}/${name}`),
  ...git('ls-tree', '-r', '--name-only', frozenCommit, `${PROJECT}/candidates`).toString().trim().split('\n').filter(Boolean),
].sort()
const frozenChecksums = {}
for (const path of frozenPaths) {
  const expected = git('show', `${frozenCommit}:${path}`)
  const actual = verifiedCombined.historicalBytes(path)
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
const manifest = read(manifestPath)
assert(inputs[manifestPath] === verifiedCombined.sha256, 'combined design changed while being verified')
const specification = read(`${PROJECT}/combined-spec.json`)
assert(manifest.project === 'detector-themes' && manifest.round === 2 && manifest.phase === 3 && manifest.candidate === combinedName && manifest.app === pin, 'combined design identity differs')
assert(JSON.stringify(manifest.rule) === JSON.stringify(rule), 'combined design changes the fixed rule')
assert(Array.isArray(manifest.priority) && JSON.stringify([...manifest.priority].sort()) === '["deflection","trappedPiece"]', 'combined design must prioritize exactly its two added words')
for (const key of ['priority', 'availabilityDefinition', 'rule']) assert(JSON.stringify(manifest[key]) === JSON.stringify(specification[key]), `combined design differs from the registered ${key}`)
assert(typeof manifest.availabilityDefinition === 'string' && manifest.availabilityDefinition.length > 0, 'combined design must define availability')
// verifyCombined checks the exact authoritative inventory and every file hash.
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
    if (candidate) {
      const path = `${PROJECT}/candidates/${candidate}/theme.ts`
      const themeHash = candidate === combinedName ? manifest.files[path] : frozenChecksums[path].sha256
      assert(score.sourceSha256[themePath] === themeHash, `${set}/${name}: candidate theme was not frozen`)
    }
    scores[set][name] = { score, summary: summarize(score) }
  }
  const baseline = scores[set].baseline.score
  assert(manifest.datasets?.[set]?.puzzles === expectedN[set] && manifest.datasets[set].datasetSha256 === baseline.datasetSha256, `${set}: combined design data differs`)
  if (set === 'heldout') assert(manifest.datasets[set].serializedSha256 === sample.data_sha256, 'combined design names a different serialized sample')
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
for (const name of ['baseline', ...Object.keys(independent)]) {
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
    const newWords = Object.fromEntries((definition.words ?? [definition]).map(({ word, concept: conceptId }) => {
      const concept = changed.score.table.best[conceptId]
      assert(concept, `${name}/${set}/${word}: missing new-word concept`)
      const said = changed.score.bestWords[word] ?? 0
      assert(said === concept.tp + concept.fp, `${name}/${set}/${word}: new word count differs from TP + FP`)
      if (said) near(concept.precision, concept.tp / said, `${name}/${set}/${word}: new-word precision differs`)
      else assert(concept.precision === null, `${name}/${set}/${word}: undefined precision must be null`)
      if (concept.tp + concept.fn) near(concept.recall, concept.tp / (concept.tp + concept.fn), `${name}/${set}/${word}: new-word recall differs`)
      else assert(concept.recall === null, `${name}/${set}/${word}: undefined recall must be null`)
      if (set === 'app' && name !== combinedName) assert(JSON.stringify(concept) === JSON.stringify(development.candidates[name].concept), `${name}: phase-one concept counts differ`)
      return [word, { said, ...concept }]
    }))
    if (set === 'app' && name !== combinedName) {
      assert(JSON.stringify(changed.score.bestWords) === JSON.stringify(development.candidates[name].bestWords), `${name}: phase-one word counts differ`)
    }
    sets[set] = {
      puzzles: pair.puzzles,
      baseline: rateCounts(base.summary), candidate: rateCounts(changed.summary),
      agreeDiff: pair.agreeDiff, agreeCi: pair.agreeCi,
      disagreeDiff: pair.disagreeDiff, disagreeCi: pair.disagreeCi,
      ...(name === combinedName ? { newWords } : { newWord: newWords[definition.word] }),
      passesRule: pair.agreeCi[0] > rule.agreementLowerAbove && pair.disagreeCi[1] <= rule.disagreementUpperAtMost,
    }
  }
  const verdict = Object.values(sets).every((set) => set.passesRule) ? 'keep' : 'drop'
  assert(comparison.verdict === verdict, `${name}: verdict differs from the fixed rule`)
  candidates[name] = { labeller: 'best', ...definition, verdict, sets }
}

const overlap = read(overlapPath)
assert(overlap.project === 'detector-themes' && overlap.round === 2 && overlap.phase === 3 && overlap.candidate === combinedName && overlap.app === pin, 'overlap identity differs')
assert(overlap.manifestSha256 === inputs[manifestPath], 'overlap uses a different content freeze')
for (const key of ['priority', 'availabilityDefinition']) assert(JSON.stringify(overlap[key]) === JSON.stringify(manifest[key]), `overlap differs from the registered ${key}`)
assert(JSON.stringify(Object.keys(overlap.sets).sort()) === '["app","heldout"]', 'overlap must cover both sets')
const overlapInputs = ['app', 'heldout'].flatMap((set) => ['baseline', ...Object.keys(variants)].map((name) => `${dir}/score-${set}${name === 'baseline' ? '' : `-${name}`}.json`)).sort()
assert(JSON.stringify(Object.keys(overlap.inputs).sort()) === JSON.stringify(overlapInputs), 'overlap score input inventory differs')
for (const path of overlapInputs) assert(overlap.inputs[path] === inputs[path], `${path}: overlap used a different score aggregate`)
const groups = ['neither', 'deflectionOnly', 'trappedOnly', 'both']
const winners = ['baseline', 'deflection', 'trappedPiece', 'other']
const expectedWinner = { neither: 'baseline', deflectionOnly: 'deflection', trappedOnly: 'trappedPiece', both: manifest.priority[0] }
for (const set of ['app', 'heldout']) {
  const row = overlap.sets[set]
  assert(row.puzzles === expectedN[set] && row.datasetSha256 === scores[set].baseline.score.datasetSha256, `${set}: overlap data differs`)
  const labels = {
    baseline: scores[set].baseline.score.labelsSha256,
    deflection: scores[set]['best-deflection'].score.labelsSha256,
    trapped: scores[set]['best-trapped'].score.labelsSha256,
    combined: scores[set][combinedName].score.labelsSha256,
  }
  assert(canonicalSources(row.labelsSha256) === canonicalSources(labels), `${set}: overlap labels differ from scored labels`)
  assert(JSON.stringify(Object.keys(row.availability).sort()) === JSON.stringify([...groups].sort()) && JSON.stringify(Object.keys(row.selection).sort()) === JSON.stringify([...groups].sort()), `${set}: overlap groups differ`)
  assert(Object.values(row.availability).every(isCount) && Object.values(row.availability).reduce((sum, n) => sum + n, 0) === expectedN[set], `${set}: availability does not partition the set`)
  for (const group of groups) {
    const selected = row.selection[group]
    assert(JSON.stringify(Object.keys(selected).sort()) === JSON.stringify([...winners].sort()), `${set}/${group}: overlap winner keys differ`)
    assert(Object.values(selected).every(isCount) && Object.values(selected).reduce((sum, n) => sum + n, 0) === row.availability[group], `${set}/${group}: winner counts do not match availability`)
    assert(selected[expectedWinner[group]] === row.availability[group] && selected.other === 0, `${set}/${group}: combined winner violates registered priority`)
  }
  assert(row.availability.deflectionOnly + row.availability.both === candidates['best-deflection'].sets[set].newWord.said, `${set}: deflection availability differs from independent labels`)
  assert(row.availability.trappedOnly + row.availability.both === candidates['best-trapped'].sets[set].newWord.said, `${set}: trapped availability differs from independent labels`)
  for (const word of ['deflection', 'trappedPiece']) {
    assert(groups.reduce((sum, group) => sum + row.selection[group][word], 0) === candidates[combinedName].sets[set].newWords[word].said, `${set}/${word}: overlap winners differ from combined word counts`)
  }
}

const heldoutPuzzleSecondsByVariant = Object.fromEntries(Object.entries(scores.heldout).map(([name, value]) => [name, value.summary.puzzleSeconds]))
const result = {
  project: 'detector-themes', round: 2, frozenCommit, app: pin, rule,
  frozenChecksums, inputs,
  combinedFreeze: { path: manifestPath, sha256: inputs[manifestPath], manifest },
  overlap,
  data: {
    app: { puzzles: expectedN.app, datasetSha256: scores.app.baseline.score.datasetSha256 },
    heldout: { puzzles: expectedN.heldout, datasetSha256: scores.heldout.baseline.score.datasetSha256, serializedSha256: sample.data_sha256 },
    sample,
    hashBasis: 'The source archive and serialized sample bytes match their frozen hashes. Parsing the sample solely to hash JSON.stringify links its canonical-array hash to every held-out score file. No puzzle rows or tags are reported.',
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
  `The test measures app commit \`${pin}\`. The independent candidates, measurement scripts and app-pool results were frozen at reviewer commit \`${frozenCommit}\` before their held-out tests. The report checked those frozen files against their Git blobs.`, '',
  `The combined candidate is \`${combinedName}\`. Its replacement files, tests, wrapper, measurement scripts and prior evidence were frozen by content before its scores. The manifest is \`combined-design.json\`, SHA256 \`${inputs[manifestPath]}\`. Its registered priority is ${manifest.priority.map((word) => `\`${word}\``).join(' before ')} after the existing named tactics. The report checked every manifest file hash.`, '',
  `The app pool contains ${expectedN.app} puzzles. The held-out set contains ${expectedN.heldout} other puzzles, sampled with seed ${sample.seed} from ${sample.eligible} eligible puzzles rated ${sample.ratings[0]} to ${sample.ratings[1]}. The compressed source has SHA256 \`${sample.source_sha256}\`; the serialized sample has SHA256 \`${sample.data_sha256}\`.`, '',
  `Each candidate is compared independently with the pinned app. Keep requires the paired agreement interval's lower end above zero and the disagreement interval's upper end at or below ${100 * rule.disagreementUpperAtMost} percentage point on both sets. The comparisons use ${rule.draws} puzzle-bootstrap draws, seed ${rule.seed}, and ${100 * rule.confidence}% intervals.`, '',
  '| Candidate | Set | Agreement: app → candidate | Paired change (points), 95% interval | Disagreement: app → candidate | Paired change (points), 95% interval |',
  '|---|---|---|---|---|---|',
]
for (const [name, candidate] of Object.entries(candidates)) {
  for (const [set, row] of Object.entries(candidate.sets)) lines.push(`| \`${name}\` | ${set} | ${countRate(row.baseline.agreeCount, row.baseline.agreeRate)} → ${countRate(row.candidate.agreeCount, row.candidate.agreeRate)} | ${points(row.agreeDiff)} ${interval(row.agreeCi)} | ${countRate(row.baseline.disagreeCount, row.baseline.disagreeRate)} → ${countRate(row.candidate.disagreeCount, row.candidate.disagreeRate)} | ${points(row.disagreeDiff)} ${interval(row.disagreeCi)} |`)
}
lines.push('', '| Candidate | Set | Word | Said | Agrees | Disagrees | Precision | Verdict on both sets |', '|---|---|---|---:|---:|---:|---:|---|')
for (const [name, candidate] of Object.entries(candidates)) {
  for (const [set, row] of Object.entries(candidate.sets)) {
    for (const [word, counts] of Object.entries(row.newWords ?? { [candidate.word]: row.newWord })) lines.push(`| \`${name}\` | ${set} | \`${word}\` | ${counts.said} | ${counts.tp} | ${counts.fp} | ${counts.precision === null ? 'undefined' : percent(counts.precision)} | ${candidate.verdict} |`)
  }
}
lines.push('', manifest.availabilityDefinition, '', '| Set | Availability | Puzzles | Baseline wins | Deflection wins | Trapped piece wins | Other wins |', '|---|---|---:|---:|---:|---:|---:|')
for (const set of ['app', 'heldout']) {
  const row = overlap.sets[set]
  for (const group of groups) {
    const selected = row.selection[group]
    lines.push(`| ${set} | ${group} | ${row.availability[group]} | ${selected.baseline} | ${selected.deflection} | ${selected.trappedPiece} | ${selected.other} |`)
  }
}
lines.push('', `The combined candidate's fixed-rule verdict is **${candidates[combinedName].verdict}**. The overlap counts are descriptive; they have no separate decision rule.`, '', `Recorded held-out scoring work totals ${result.timing.totalHeldoutPuzzleSeconds.toFixed(3)} seconds across the independent and combined runs: ${Object.entries(heldoutPuzzleSecondsByVariant).map(([name, seconds]) => `${name} ${seconds.toFixed(3)}`).join(', ')}. ${result.timing.basis}`, '', 'These results measure agreement with Lichess’s tagger. They do not establish that every label is correct. The combined test reuses the previously scored held-out sample; its priority was fixed before its own scores. The defensive-move and hanging-piece changes were deferred and have no verdict in this test.', '', 'The JSON report records every aggregate input checksum, historical frozen Git blob and combined content-manifest hash. It verifies the archive and sample against their frozen hashes, and links the sample’s canonical-array hash to the held-out scores. It emits no puzzle rows or tags.', '')

const readmePath = `${PROJECT}/README.md`
const readme = fs.readFileSync(join(root, readmePath), 'utf8')
const headings = [...readme.matchAll(/^## Candidates$/gm)]
assert(headings.length === 1, 'README must have exactly one Candidates heading')
const sectionStart = headings[0].index
const nextHeading = readme.indexOf('\n## ', sectionStart + 1)
const sectionEnd = nextHeading < 0 ? readme.length : nextHeading
const section = readme.slice(sectionStart, sectionEnd)
const tableHeader = /^\| Candidate \| Labeller \| Verdict \| The change \|$/gm
assert([...section.matchAll(tableHeader)].length === 1, 'Candidates must have exactly one declared table header')
const table = /^\| Candidate \| Labeller \| Verdict \| The change \|\n\|---\|---\|---\|---\|\n(?:\|[^\n]*\|\n)+/m.exec(section)
assert(table, 'Candidates table has an unexpected shape')
const changes = {
  'best-deflection': "Before defence or phase, name the existing line reader's deflection when the supplied solution begins with this move.",
  'best-trapped': "Before defence or phase, name the describer's trapped piece when the supplied line wins that same piece after costs.",
  [combinedName]: 'Before defence or phase, name the existing trapped-piece proof first, then the deflection proof.',
}
let updatedTable = table[0]
for (const [name, change] of Object.entries(changes)) {
  const row = new RegExp('^\\| `' + name + '` \\| `best` \\| [^\\n]*\\|$', 'gm')
  assert([...updatedTable.matchAll(row)].length === 1, `${name}: Candidates table must contain exactly one row`)
  const verdict = candidates[name].verdict === 'keep' ? (name === combinedName ? 'Kept; shipped with chess PR 127' : 'Kept; candidate for the app') : 'Not kept'
  updatedTable = updatedTable.replace(row, `| \`${name}\` | \`best\` | ${verdict} | ${change} |`)
}
const tableStart = sectionStart + table.index
const updatedReadme = readme.slice(0, tableStart) + updatedTable + readme.slice(tableStart + table[0].length)

function atomicWrite(path, text) {
  const target = join(root, path)
  fs.mkdirSync(dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  fs.writeFileSync(temporary, text)
  fs.renameSync(temporary, target)
}
atomicWrite(`${dir}/result.json`, JSON.stringify(result, null, 2) + '\n')
atomicWrite(`${dir}/result.md`, lines.join('\n'))
if (updatedReadme !== readme) atomicWrite(readmePath, updatedReadme)
console.log(`wrote ${relative(root, join(root, dir, 'result.json'))}, result.md and the round-two Candidates rows`)
