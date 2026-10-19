// Compare the shipped app's saved scores and labels with the measured combination.
// This reports aggregate reproduction differences; it runs no detector or bootstrap.
// CHESS_DIR=private/detector-themes/app-cache/<pin> bridge/run.sh projects/detector-themes/report-recheck.mjs
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { CHESS_DIR, LAB_DIR, chess } from '../../bridge/lib/chess.mjs'

const PROJECT = 'projects/detector-themes'
const PIN = '3a377486e8ae214f86f1e948f69231248f79f8a0'
const REFERENCE = 'best-deflection-trapped'
const roundDir = `${PROJECT}/results/round2`
const outputDir = `${roundDir}/${PIN}`
const referenceReportPath = `${roundDir}/result.json`
const shippedRowsDir = `private/detector-themes/rechecks/${PIN}/lab/private/detector-themes/round2`
const referenceRowsDir = 'private/detector-themes/round2'
const labellers = ['best', 'blunder', 'move']
const sets = ['app', 'heldout']
const vocabularyPath = 'src/services/knowledge/catalogue/vocabulary.ts'
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const validDigest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const isCount = (value) => Number.isInteger(value) && value >= 0
const git = (cwd, ...args) => execFileSync('git', ['--no-optional-locks', '-C', cwd, ...args], { maxBuffer: 32 * 1024 * 1024 })
const inputs = {}
const bytesAt = (path) => fs.readFileSync(join(LAB_DIR, path))
function read(path) {
  const bytes = bytesAt(path)
  inputs[path] = digest(bytes)
  return JSON.parse(bytes)
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const stringSet = (values) => Array.isArray(values) && values.every((value) => typeof value === 'string')
const canonicalSet = (values) => [...new Set(values)].sort()
const sameSet = (a, b) => stringSet(a) && stringSet(b) && same(canonicalSet(a), canonicalSet(b))
const canonicalMap = (value) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))

assert(process.argv.length === 2, 'usage: report-recheck.mjs (no scoring or comparison options)')
assert(git(CHESS_DIR, 'rev-parse', 'HEAD').toString().trim() === PIN, 'the report must import the shipped app pin')
assert(fs.realpathSync(CHESS_DIR) === fs.realpathSync(join(LAB_DIR, 'private/detector-themes/app-cache', PIN)), 'the report must use the scoped shipped checkout')
assert(JSON.parse(bytesAt('bridge/chess.json')).commit === PIN, 'the bridge does not pin the shipped app')
// Check the imported knowledge code and its core dependencies against the app commit.
git(CHESS_DIR, 'diff', '--exit-code', '--quiet', PIN, '--', 'src/services/knowledge', 'src/core')
const { VOCABULARY } = await chess('src/services/knowledge/index.ts')

// Read the committed report without recording this clone's current commit id.
const committedReportBytes = git(LAB_DIR, 'show', `HEAD:${referenceReportPath}`)
assert(bytesAt(referenceReportPath).equals(committedReportBytes), 'the historical result differs from its committed content')
const referenceReport = JSON.parse(committedReportBytes)
inputs[referenceReportPath] = digest(committedReportBytes)
assert(referenceReport.project === 'detector-themes' && referenceReport.round === 2 && referenceReport.candidates?.[REFERENCE], 'the committed report does not identify the measured combination')
const referenceApp = referenceReport.app
assert(typeof referenceApp === 'string' && /^[a-f0-9]{40}$/.test(referenceApp), 'invalid reference app identity')
const manifestPath = `${roundDir}/combined-design.json`
const manifestBytes = bytesAt(manifestPath)
assert(digest(manifestBytes) === referenceReport.combinedFreeze?.sha256 && digest(manifestBytes) === referenceReport.inputs[manifestPath], 'the historical combined manifest changed')
const manifest = JSON.parse(manifestBytes)
inputs[manifestPath] = digest(manifestBytes)
assert(manifest.candidate === REFERENCE && manifest.app === referenceApp, 'historical combined design identity differs')
const scorerPath = `${PROJECT}/score.mts`
const scorerSha256 = digest(bytesAt(scorerPath))
assert(scorerSha256 === manifest.files[scorerPath], 'the scoring instrument differs from the historical measurement')

const sourceSha256 = {}
const referenceScores = {}
const shippedScores = {}
const bySet = {}

function checkedScore(set, shipped) {
  const path = shipped ? `${outputDir}/score-${set}.json` : `${roundDir}/score-${set}-${REFERENCE}.json`
  const score = read(path)
  if (!shipped) assert(validDigest(referenceReport.inputs[path]) && inputs[path] === referenceReport.inputs[path], `${set}: reference score differs from the committed report input`)
  assert(score.project === 'detector-themes' && score.round === 2 && score.set === set, `${set}: score identity differs`)
  assert(score.app === (shipped ? PIN : referenceApp) && score.candidate === (shipped ? null : REFERENCE), `${set}: wrong app or candidate identity`)
  assert(score.skipped === 0 && score.puzzles === referenceReport.data[set].puzzles && score.datasetSha256 === referenceReport.data[set].datasetSha256, `${set}: scores must use the complete original dataset`)
  assert(validDigest(score.labelsSha256) && score.scorerSha256 === scorerSha256, `${set}: score lacks the frozen scorer or label hash`)
  assert(score.sourceSha256 && Object.values(score.sourceSha256).every(validDigest), `${set}: invalid instrument source hashes`)
  for (const labeller of labellers) assert(score.table?.[labeller] && typeof score.table[labeller] === 'object', `${set}: missing labeller aggregate`)
  for (const [path, hash] of Object.entries(score.sourceSha256)) {
    assert(path.startsWith('src/services/knowledge/') && !path.split('/').includes('..'), 'instrument source path is outside the knowledge service')
    if (shipped) {
      const bytes = fs.readFileSync(join(CHESS_DIR, path))
      assert(digest(bytes) === hash && bytes.equals(git(CHESS_DIR, 'show', `${PIN}:${path}`)), `${set}: a scored source differs from the shipped app`)
      sourceSha256[path] = hash
    }
  }
  return score
}

function checkedRows(set, shipped, score) {
  const path = `${shipped ? shippedRowsDir : referenceRowsDir}/detector-themes-labels-${set}${shipped ? '' : `-${REFERENCE}`}.json`
  const rows = read(path)
  assert(inputs[path] === score.labelsSha256, `${set}: private labels differ from their saved score hash`)
  assert(Array.isArray(rows) && rows.length === score.puzzles, `${set}: incomplete private labels`)
  const byId = new Map()
  for (const row of rows) {
    assert(typeof row.id === 'string' && row.id.length > 0 && typeof row.best === 'string' && Number.isFinite(row.rating), `${set}: malformed private label row`)
    for (const key of ['themes', 'truth', 'blunder', 'move']) assert(stringSet(row[key]), `${set}: malformed private label set`)
    assert(!byId.has(row.id), `${set}: duplicate private puzzle row`)
    byId.set(row.id, row)
  }
  return byId
}

function bestCounts(score) {
  const counts = { agreeCount: 0, disagreeCount: 0 }
  for (const row of Object.values(score.table.best)) {
    for (const key of ['tp', 'fp', 'fn']) assert(isCount(row[key]) && row[key] <= score.puzzles, 'invalid best-label concept count')
    counts.agreeCount += row.tp
    counts.disagreeCount += row.fp
  }
  assert(counts.agreeCount + counts.disagreeCount <= score.puzzles, 'best is not a single mapped concept per puzzle')
  assert(Object.values(score.bestWords).every(isCount) && Object.values(score.bestWords).reduce((sum, n) => sum + n, 0) === score.puzzles, 'best-word counts do not cover the scored set')
  return { ...counts, agreeRate: counts.agreeCount / score.puzzles, disagreeRate: counts.disagreeCount / score.puzzles, bestWords: canonicalMap(score.bestWords) }
}

function bestAgreement(row) {
  const concept = VOCABULARY[row.best]
  return { agree: concept && row.truth.includes(concept) ? 1 : 0, disagree: concept && !row.truth.includes(concept) ? 1 : 0 }
}
function conceptCounts(score, labeller, concept) {
  const row = score.table[labeller][concept] ?? { tp: 0, fp: 0, fn: 0 }
  const counts = { tp: row.tp, fp: row.fp, fn: row.fn }
  assert(Object.values(counts).every(isCount), 'invalid concept count')
  return counts
}
function transitionsSorted(transitions) {
  return [...transitions.values()].sort((a, b) => b.puzzles - a.puzzles || JSON.stringify(a.before).localeCompare(JSON.stringify(b.before)) || JSON.stringify(a.after).localeCompare(JSON.stringify(b.after)))
}

for (const set of sets) {
  const reference = checkedScore(set, false)
  const shipped = checkedScore(set, true)
  referenceScores[set] = reference
  shippedScores[set] = shipped
  assert(same(Object.keys(reference.sourceSha256).sort(), Object.keys(shipped.sourceSha256).sort()), `${set}: instrument source inventories differ`)
  assert(reference.sourceSha256[vocabularyPath] === shipped.sourceSha256[vocabularyPath], `${set}: vocabulary changed; old labels cannot be silently remapped`)
  const before = checkedRows(set, false, reference)
  const after = checkedRows(set, true, shipped)
  assert(before.size === after.size && [...before.keys()].every((id) => after.has(id)), `${set}: exact puzzle pairing differs`)
  const differences = { anyLabel: 0, best: 0, blunder: 0, move: 0, bestAgreementGained: 0, bestAgreementLost: 0, bestDisagreementGained: 0, bestDisagreementLost: 0 }
  const transitions = Object.fromEntries(labellers.map((labeller) => [labeller, new Map()]))
  const rowCounts = { reference: { agreeCount: 0, disagreeCount: 0 }, shipped: { agreeCount: 0, disagreeCount: 0 } }
  const countedWords = { reference: {}, shipped: {} }
  for (const [id, old] of before) {
    const current = after.get(id)
    assert(current.rating === old.rating && sameSet(current.themes, old.themes) && sameSet(current.truth, old.truth), `${set}: paired puzzle descriptors or truth differ`)
    const oldFlags = bestAgreement(old)
    const newFlags = bestAgreement(current)
    for (const [who, row, flags] of [['reference', old, oldFlags], ['shipped', current, newFlags]]) {
      rowCounts[who].agreeCount += flags.agree
      rowCounts[who].disagreeCount += flags.disagree
      countedWords[who][row.best] = (countedWords[who][row.best] ?? 0) + 1
    }
    differences.bestAgreementGained += Math.max(0, newFlags.agree - oldFlags.agree)
    differences.bestAgreementLost += Math.max(0, oldFlags.agree - newFlags.agree)
    differences.bestDisagreementGained += Math.max(0, newFlags.disagree - oldFlags.disagree)
    differences.bestDisagreementLost += Math.max(0, oldFlags.disagree - newFlags.disagree)
    let any = false
    for (const labeller of labellers) {
      const first = labeller === 'best' ? old.best : canonicalSet(old[labeller])
      const second = labeller === 'best' ? current.best : canonicalSet(current[labeller])
      if (same(first, second)) continue
      any = true
      differences[labeller]++
      const key = JSON.stringify([first, second])
      const transition = transitions[labeller].get(key) ?? { before: first, after: second, puzzles: 0 }
      transition.puzzles++
      transitions[labeller].set(key, transition)
    }
    if (any) differences.anyLabel++
  }
  const referenceCounts = bestCounts(reference)
  const shippedCounts = bestCounts(shipped)
  for (const [who, counts] of [['reference', referenceCounts], ['shipped', shippedCounts]]) {
    assert(rowCounts[who].agreeCount === counts.agreeCount && rowCounts[who].disagreeCount === counts.disagreeCount, `${set}: label agreement totals differ from scored TP/FP totals`)
    assert(same(canonicalMap(countedWords[who]), counts.bestWords), `${set}: label words differ from scored word totals`)
  }
  const conceptCountDifferences = {}
  for (const labeller of labellers) {
    const concepts = [...new Set([...Object.keys(reference.table[labeller]), ...Object.keys(shipped.table[labeller])])].sort()
    conceptCountDifferences[labeller] = concepts.flatMap((concept) => {
      const first = conceptCounts(reference, labeller, concept)
      const second = conceptCounts(shipped, labeller, concept)
      return same(first, second) ? [] : [{ concept, reference: first, shipped: second, delta: Object.fromEntries(['tp', 'fp', 'fn'].map((key) => [key, second[key] - first[key]])) }]
    })
  }
  bySet[set] = {
    puzzles: shipped.puzzles, datasetSha256: shipped.datasetSha256,
    labelsSha256: { reference: reference.labelsSha256, shipped: shipped.labelsSha256 },
    reference: referenceCounts, shipped: shippedCounts, differences,
    transitions: Object.fromEntries(labellers.map((labeller) => [labeller, transitionsSorted(transitions[labeller])])),
    conceptCountDifferences,
    countsMatch: Object.fromEntries(labellers.map((labeller) => [labeller, conceptCountDifferences[labeller].length === 0])),
    labelsMatch: Object.fromEntries(labellers.map((labeller) => [labeller, differences[labeller] === 0])),
    allLabelsMatch: differences.anyLabel === 0,
  }
}

for (const [name, scores] of [['reference', referenceScores], ['shipped', shippedScores]]) assert(same(canonicalMap(scores.app.sourceSha256), canonicalMap(scores.heldout.sourceSha256)), `${name}: the two sets used different sources`)
const runPath = `${outputDir}/run.json`
if (fs.existsSync(join(LAB_DIR, runPath))) inputs[runPath] = digest(bytesAt(runPath))
const sourceChanges = Object.keys(sourceSha256).sort().map((path) => ({ path, referenceSha256: referenceScores.app.sourceSha256[path], shippedSha256: sourceSha256[path], changed: referenceScores.app.sourceSha256[path] !== sourceSha256[path] }))
const result = {
  project: 'detector-themes', round: 2, type: 'shipped-recheck', app: PIN,
  reference: { candidate: REFERENCE, app: referenceApp, reportSha256: inputs[referenceReportPath], manifestSha256: inputs[manifestPath] },
  instrument: { scorerSha256, sourceSha256, sourceChanges, vocabularyUnchanged: true },
  inputs, sets: bySet,
  allLabelsMatch: sets.every((set) => bySet[set].allLabelsMatch),
  analysis: 'Exact saved-label and aggregate-count comparison on the original paired datasets. This performs no new bootstrap and makes no new keep/drop decision. Source changes are reported without attributing their effects to a pull request.',
}

const percent = (value) => `${(100 * value).toFixed(3)}%`
const compact = (value) => Array.isArray(value) ? (value.length ? value.join(', ') : '(none)') : (value || '(empty)')
const markdownCell = (value) => compact(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
const lines = [
  '# Shipped detector recheck', '',
  `App commit \`${PIN}\`, with no candidate override, is compared with the previously measured \`${REFERENCE}\` at app commit \`${referenceApp}\`. The original report, manifest and score inputs remain unchanged.`, '',
  '| Set | Puzzles | Reference agrees | Shipped agrees | Reference disagrees | Shipped disagrees |', '|---|---:|---:|---:|---:|---:|',
  ...sets.map((set) => { const r = bySet[set]; return `| ${set} | ${r.puzzles} | ${r.reference.agreeCount} (${percent(r.reference.agreeRate)}) | ${r.shipped.agreeCount} (${percent(r.shipped.agreeRate)}) | ${r.reference.disagreeCount} (${percent(r.reference.disagreeRate)}) | ${r.shipped.disagreeCount} (${percent(r.shipped.disagreeRate)}) |` }),
  '', '| Set | Best labels changed | Blunder label sets changed | Move concept sets changed | Any label changed |', '|---|---:|---:|---:|---:|',
  ...sets.map((set) => { const d = bySet[set].differences; return `| ${set} | ${d.best} | ${d.blunder} | ${d.move} | ${d.anyLabel} |` }), '',
  result.allLabelsMatch ? 'Every saved label matches on both sets.' : 'Some saved labels differ. The transitions below count those changes; each row is an aggregate.', '',
]
for (const set of sets) {
  for (const labeller of labellers) {
    const transitions = bySet[set].transitions[labeller]
    if (!transitions.length) continue
    lines.push(`| ${set}: ${labeller} before | After | Puzzles |`, '|---|---|---:|')
    for (const row of transitions) lines.push(`| ${markdownCell(row.before)} | ${markdownCell(row.after)} | ${row.puzzles} |`)
    lines.push('')
  }
}
lines.push('The scorer, app source files, dataset identities, private-label hashes and exact puzzle pairing were checked before reporting. Set-valued labels are compared without regard to order. Agreement totals are also checked against the saved concept TP/FP counts using the app’s own vocabulary.', '', 'This is a reproduction check. It adds no bootstrap, threshold or keep/drop decision. The JSON records source hashes and aggregate changes; no puzzle identifiers, positions or per-puzzle rows are written.', '')

function atomicWrite(path, text) {
  const target = join(LAB_DIR, path)
  fs.mkdirSync(dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  fs.writeFileSync(temporary, text)
  fs.renameSync(temporary, target)
}
atomicWrite(`${outputDir}/recheck.json`, JSON.stringify(result, null, 2) + '\n')
atomicWrite(`${outputDir}/recheck.md`, lines.join('\n'))
console.log(`wrote ${outputDir}/recheck.json and recheck.md`)
