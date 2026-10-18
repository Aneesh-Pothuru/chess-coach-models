// Phase-two inputs and the fixed rule. Loading this module runs no engine and
// reads no judgments. All per-game material remains in the project private dir.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { LAB_DIR, privateDir } from '../../bridge/lib/lab.mjs'
import { RULE } from './rules.mjs'

export { RULE }
export const PROFILES = RULE.profiles
export const DEVICES = RULE.devices
export const ARMS = ['baseline', 'candidate']
export const ROOT = privateDir('second-look-fresh')
export const sha256 = (text) => createHash('sha256').update(text).digest('hex')
export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
export function assert(ok, message) { if (!ok) throw new Error(`second-look-fresh: ${message}`) }
export function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n')
  renameSync(temp, file)
}

export function loadInputs() {
  const pin = readJson(join(LAB_DIR, 'bridge/chess.json'))
  const manifest = readJson(join(ROOT, 'manifest.json'))
  const candidate = readJson(join(ROOT, 'candidate-manifest.json'))
  const rawCases = readFileSync(join(ROOT, 'cases.json'), 'utf8')
  const cases = JSON.parse(rawCases)
  const games = readJson(join(ROOT, 'games.json'))
  assert(manifest.appCommit === pin.commit && manifest.recordsCommit === pin.records, 'input manifest no longer matches the pin')
  assert(manifest.casesSha256 === sha256(rawCases), 'frozen cases changed after preparation')
  assert(cases.length === RULE.games && new Set(cases.map(c => c.id)).size === RULE.games && games.length === RULE.games, 'all frozen games are required')
  assert(candidate.appCommit === pin.commit && candidate.recordsCommit === pin.records, 'candidate manifest no longer matches the pin')
  const { candidateSha256, ...candidatePayload } = candidate
  assert(candidateSha256 === sha256(JSON.stringify(candidatePayload)), 'candidate manifest digest differs')
  games.forEach((g, i) => assert(g.caseIndex === i && g.game.sans.length === cases[i].plies, `prepared game ordinal ${i + 1} differs`))
  const expected = { appCommit: pin.commit, recordsCommit: pin.records, casesSha256: manifest.casesSha256, engine: manifest.engine, nodeOptions: manifest.nodeOptions }
  for (const arm of ARMS) {
    const saved = readJson(join(ROOT, arm, 'manifest.json'))
    for (const [key, value] of Object.entries(expected)) assert(JSON.stringify(saved[key]) === JSON.stringify(value), `${arm} manifest ${key} differs`)
    assert(saved.candidateSha256 === (arm === 'candidate' ? candidateSha256 : null), `${arm} candidate digest differs`)
    assert(JSON.stringify(saved.profiles) === JSON.stringify(PROFILES), `${arm} profile manifest differs`)
  }
  const appPaths = { baseline: join(LAB_DIR, '.cache/chess', pin.commit), candidate: join(LAB_DIR, '.cache/chess/candidates/second-look-fresh') }
  for (const r of candidate.replacements) {
    assert(sha256(readFileSync(join(appPaths.baseline, r.path))) === r.sourceSha256, 'pinned replacement source changed')
    assert(sha256(readFileSync(join(appPaths.candidate, r.path))) === r.candidateSha256, 'candidate replacement source changed')
  }
  const sourceHashes = Object.fromEntries(ARMS.map(arm => [arm, sha256([
    'src/services/review/pipeline/run.ts', 'src/services/review/pipeline/evidence.ts',
    'src/services/review/ports.ts', 'src/adapters/node/engine/index.ts',
  ].map(p => readFileSync(join(appPaths[arm], p), 'utf8')).join('\n'))]))
  return { pin, manifest, candidate, cases, games, sourceHashes }
}

export function loadDocuments(inputs, { timed = false } = {}) {
  return inputs.cases.map((c, caseIndex) => {
    const docs = {}
    let samePlies = null
    for (const arm of ARMS) {
      docs[arm] = {}
      for (const profile of PROFILES) {
        const file = join(ROOT, arm, 'evidence', profile, `${c.id}.json`)
        assert(existsSync(file), `${arm}/${profile}: missing case ordinal ${caseIndex + 1}`)
        const doc = readJson(file)
        const p = inputs.manifest.profiles[profile]
        assert(doc.schema === 'game-review/2' && !doc.partial && doc.records.length === c.plies && doc.positions.length === c.plies + 1, `${arm}/${profile}: incomplete case ordinal ${caseIndex + 1}`)
        assert(doc.provenance.build === inputs.manifest.engine && doc.provenance.profile === profile && doc.provenance.scanNodes === p.sweepNodes && doc.provenance.verifyNodes === p.verifyNodes && doc.provenance.verifyMultiPv === p.verifyMultiPv && doc.provenance.tablebase === p.tablebase, `${arm}/${profile}: wrong provenance at case ordinal ${caseIndex + 1}`)
        assert(JSON.stringify(doc.game.sans) === JSON.stringify(inputs.games[caseIndex].game.sans), `${arm}/${profile}: moves differ at case ordinal ${caseIndex + 1}`)
        const plies = JSON.stringify(doc.records.map((r, i) => [r.ply, r.san, r.uci, r.mover, doc.fens[i]]))
        assert(samePlies === null || samePlies === plies, `documents are not the same plies at case ordinal ${caseIndex + 1}`)
        samePlies = plies
        docs[arm][profile] = doc
      }
    }
    if (timed) {
      docs.timed = {}
      for (const arm of ARMS) {
        docs.timed[arm] = {}
        for (const profile of PROFILES) {
          const file = join(ROOT, arm, 'timed', profile, `${c.id}.json`)
          assert(existsSync(file), `${arm}/${profile}: missing timing replay at case ordinal ${caseIndex + 1}`)
          const row = readJson(file)
          assert(row.app === inputs.pin.commit && row.records === inputs.pin.records && row.caseIndex === caseIndex && row.summary.variant === arm && row.summary.profile === profile, `${arm}/${profile}: timing provenance differs at case ordinal ${caseIndex + 1}`)
          assert(row.inputHash === sha256(JSON.stringify(inputs.games[caseIndex])) && row.sourceHash === inputs.sourceHashes[arm], 'timing input or source digest differs')
          for (const key of ['positions', 'records', 'provenance', 'coverage']) assert(JSON.stringify(row.doc[key]) === JSON.stringify(docs[arm][profile][key]), `${arm}/${profile}: timing replay differs from canonical CLI ${key} at case ordinal ${caseIndex + 1}`)
          const doc = docs[arm][profile]
          assert(row.canonicalHash === sha256(JSON.stringify({ positions: doc.positions, records: doc.records, provenance: doc.provenance, coverage: doc.coverage })), 'timing canonical digest differs')
          assert(Array.isArray(row.looks) && new Set(row.looks.map(l => l.index)).size === row.looks.length, 'timing replay duplicated a ply')
          assert(row.looks.every(l => Number.isInteger(l.index) && l.index >= 0 && l.index < c.plies && l.evidence != null && Number.isFinite(l.seconds) && l.seconds >= 0), 'timing replay has an invalid look')
          docs.timed[arm][profile] = row
        }
      }
    }
    return docs
  })
}

export function commonLooks(docs, profile) {
  assert(docs.timed, 'common second looks require the pre-teaching timing replay')
  const candidate = new Set(docs.timed.candidate[profile].looks.map(l => l.index))
  return docs.timed.baseline[profile].looks.filter(l => candidate.has(l.index)).map(l => l.index).sort((a, b) => a - b)
}

export function referenceIdentity(inputs) {
  const spec = {
    schema: 'second-look-fresh-reference/1', appCommit: inputs.pin.commit,
    recordsCommit: inputs.pin.records, casesSha256: inputs.manifest.casesSha256,
    candidateSha256: inputs.candidate.candidateSha256,
    engine: inputs.manifest.engine, nodeOptions: inputs.manifest.nodeOptions,
    nodes: RULE.referenceNodes, multiPv: RULE.referenceMultiPv, attempts: RULE.referenceAttempts,
  }
  return { ...spec, signature: sha256(JSON.stringify(spec)) }
}

export const referencePath = (caseId, index) => join(ROOT, 'reference', String(caseId), `${index}.json`)

export function validateReference(row, identity, caseIndex, index) {
  assert(row.signature === identity.signature && row.caseIndex === caseIndex && row.index === index, `reference provenance differs at case ordinal ${caseIndex + 1}, ply ordinal ${index + 1}`)
  assert(Array.isArray(row.attempts) && row.attempts.length >= 1 && row.attempts.length <= RULE.referenceAttempts, 'reference attempt count differs')
  assert(row.status === 'complete' || row.status === 'unresolved', 'reference status differs')
  assert(row.status === 'complete' || row.attempts.length === RULE.referenceAttempts, 'unresolved reference has not used its fixed retry')
}
