// Count competition between the frozen independent labels, never raw findings.
// No chess detector or keep-rule estimator is reimplemented here.
import fs from 'node:fs'
import { join } from 'node:path'
import { ROOT, PROJECT, COMBINED, digest, read, json, assert, verifyCombined } from './combined-freeze.mjs'

const { manifest, sha256: manifestSha256 } = verifyCombined()
const variants = { baseline: null, deflection: 'best-deflection', trapped: 'best-trapped', combined: COMBINED }
const wordFor = { deflection: 'deflection', trapped: 'trappedPiece' }
const inputs = {}
const out = { project: 'detector-themes', round: 2, phase: 3, candidate: COMBINED, app: manifest.app, manifestSha256, priority: manifest.priority, availabilityDefinition: manifest.availabilityDefinition, inputs, sets: {} }
const validDigest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b) && a.every((value) => typeof value === 'string') && b.every((value) => typeof value === 'string') && new Set(a).size === new Set(b).size && a.every((value) => b.includes(value))
const categories = ['neither', 'deflectionOnly', 'trappedOnly', 'both']
for (const set of ['app', 'heldout']) {
  const scores = {}, rows = {}, labelsSha256 = {}
  for (const [key, candidate] of Object.entries(variants)) {
    const suffix = candidate ? `-${candidate}` : ''
    const scorePath = `${PROJECT}/results/round2/score-${set}${suffix}.json`
    const scoreBytes = read(scorePath)
    const score = JSON.parse(scoreBytes)
    const bytes = read(`private/detector-themes/round2/detector-themes-labels-${set}${suffix}.json`)
    const values = JSON.parse(bytes)
    assert(score.project === 'detector-themes' && score.round === 2 && score.set === set && score.candidate === candidate && score.app === manifest.app, `${set}/${key}: score identity differs`)
    assert(score.puzzles === manifest.datasets[set].puzzles && score.datasetSha256 === manifest.datasets[set].datasetSha256 && score.skipped === 0, `${set}/${key}: data differs`)
    assert(score.scorerSha256 === manifest.files[`${PROJECT}/score.mts`], `${set}/${key}: scorer differs`)
    assert(validDigest(score.labelsSha256) && digest(bytes) === score.labelsSha256, `${set}/${key}: labels do not match the score`)
    assert(Array.isArray(values) && values.length === score.puzzles && values.every((row) => typeof row.id === 'string' && row.id && typeof row.best === 'string'), `${set}/${key}: incomplete labels`)
    const byId = new Map(values.map((row) => [row.id, row]))
    assert(byId.size === values.length, `${set}/${key}: duplicate label`)
    if (candidate) assert(score.sourceSha256['src/services/knowledge/detectors/theme.ts'] === manifest.files[`${PROJECT}/candidates/${candidate}/theme.ts`], `${set}/${key}: theme source differs`)
    inputs[scorePath] = digest(scoreBytes)
    scores[key] = score
    rows[key] = byId
    labelsSha256[key] = score.labelsSha256
  }
  const availability = Object.fromEntries(categories.map((key) => [key, 0]))
  const selection = Object.fromEntries(categories.map((key) => [key, { baseline: 0, deflection: 0, trappedPiece: 0, other: 0 }]))
  for (const key of ['deflection', 'trapped', 'combined']) {
    assert(rows[key].size === rows.baseline.size, `${set}/${key}: unequal sets`)
    for (const path of ['src/services/knowledge/detectors/motifs.ts', 'src/services/knowledge/catalogue/vocabulary.ts']) assert(scores[key].sourceSha256[path] === scores.baseline.sourceSha256[path], `${set}/${key}: other reader source differs`)
  }
  for (const [id, base] of rows.baseline) {
    const paired = Object.fromEntries(Object.keys(variants).map((key) => [key, rows[key].get(id)]))
    for (const row of Object.values(paired)) {
      assert(row && row.rating === base.rating, `${set}: incomplete or mismatched pairing`)
      for (const key of ['themes', 'truth', 'blunder', 'move']) assert(sameSet(row[key], base[key]), `${set}: another puzzle descriptor or labeller changed`)
    }
    assert(!Object.values(wordFor).includes(base.best), `${set}: baseline already names a new word`)
    for (const key of ['deflection', 'trapped']) assert(paired[key].best === base.best || paired[key].best === wordFor[key], `${set}: independent candidate changes a different word`)
    const d = paired.deflection.best === wordFor.deflection
    const t = paired.trapped.best === wordFor.trapped
    const category = d ? (t ? 'both' : 'deflectionOnly') : (t ? 'trappedOnly' : 'neither')
    availability[category]++
    const available = new Set([...(d ? [wordFor.deflection] : []), ...(t ? [wordFor.trapped] : [])])
    const expected = manifest.priority.find((word) => available.has(word)) ?? base.best
    const actual = paired.combined.best
    assert(actual === expected, `${set}: combined labels violate the registered composition; do not tune on this result`)
    const winner = actual === base.best ? 'baseline' : (['deflection', 'trappedPiece'].includes(actual) ? actual : 'other')
    selection[category][winner]++
  }
  out.sets[set] = { puzzles: rows.baseline.size, datasetSha256: scores.baseline.datasetSha256, labelsSha256, availability, selection }
}
const path = join(ROOT, PROJECT, 'results/round2', `overlap-${COMBINED}.json`)
fs.writeFileSync(`${path}.partial`, JSON.stringify(out, null, 2) + '\n')
fs.renameSync(`${path}.partial`, path)
console.log(JSON.stringify({ candidate: COMBINED, sets: out.sets }, null, 2))
