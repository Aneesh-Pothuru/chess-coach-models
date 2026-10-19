// Verify the completed round against its historical pin after the app advances.
// Only bridge/chess.json is read from history; every other frozen file must
// still match its original content manifest in this clone.
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import {
  ROOT, PROJECT, COMBINED, SPEC, MANIFEST, FROZEN_FILES,
  digest, read, json, assert, same,
} from './combined-freeze.mjs'

const PIN = 'bridge/chess.json'
const CURRENT_APP = '3a377486e8ae214f86f1e948f69231248f79f8a0'
const REPORT = `${PROJECT}/results/round2/result.json`
const git = (directory, ...args) => execFileSync('git', ['-C', directory, ...args], { maxBuffer: 16 * 1024 * 1024 })
const commitId = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)

function archivedPin() {
  const report = json(REPORT)
  assert(report.project === 'detector-themes' && report.round === 2 && commitId(report.frozenCommit), 'historical report has no valid reviewer freeze')
  const historicalPinBytes = git(ROOT, 'show', `${report.frozenCommit}:${PIN}`)
  const historicalPin = JSON.parse(historicalPinBytes)
  assert(commitId(historicalPin.commit) && historicalPin.commit === report.app, 'historical report and archived app pin differ')
  const record = report.frozenChecksums?.[PIN]
  assert(record?.sha256 === digest(historicalPinBytes), 'archived pin differs from the historical report checksum')
  assert(record.gitBlob === git(ROOT, 'rev-parse', `${report.frozenCommit}:${PIN}`).toString().trim(), 'archived pin differs from the historical Git blob')
  return { report, historicalPin, historicalPinBytes }
}

function reader(historicalPinBytes) {
  return (path) => {
    assert(typeof path === 'string' && !path.startsWith('/') && !path.split('/').includes('..'), 'historical input must be a relative clone path')
    return path === PIN ? Buffer.from(historicalPinBytes) : read(path)
  }
}

/** Exact archived pin bytes, or the unchanged current bytes of any other input. */
export function historicalBytes(path) {
  return reader(archivedPin().historicalPinBytes)(path)
}

export function verifyRound2History() {
  const { report, historicalPin, historicalPinBytes } = archivedPin()
  const readHistorical = reader(historicalPinBytes)
  const currentPin = json(PIN)
  assert(currentPin.commit === CURRENT_APP, 'current app pin is not the requested shipped recheck')
  assert(currentPin.repo === historicalPin.repo && currentPin.records === historicalPin.records, 'the recheck changed the app repository or records pin')

  const bytes = read(MANIFEST)
  const manifest = JSON.parse(bytes)
  const sha256 = digest(bytes)
  const spec = json(SPEC)
  assert(manifest.project === 'detector-themes' && manifest.round === 2 && manifest.phase === 3 && manifest.candidate === COMBINED, 'wrong historical combined design identity')
  assert(same(Object.keys(manifest.files).sort(), FROZEN_FILES), 'historical combined content inventory differs')
  for (const path of FROZEN_FILES) assert(digest(readHistorical(path)) === manifest.files[path], `${path}: changed after the historical combined freeze`)
  for (const key of ['priority', 'availabilityDefinition', 'rule']) assert(same(manifest[key], spec[key]), `historical combined ${key} differs from its specification`)
  assert(manifest.app === historicalPin.commit, 'historical combined app pin differs')
  assert(report.combinedFreeze?.path === MANIFEST && report.combinedFreeze.sha256 === sha256 && same(report.combinedFreeze.manifest, manifest), 'historical report names a different combined content freeze')
  assert(report.inputs?.[MANIFEST] === sha256, 'historical report manifest input differs')
  for (const set of ['app', 'heldout']) {
    const baseline = json(`${PROJECT}/results/round2/score-${set}.json`)
    assert(baseline.app === historicalPin.commit, `${set}: historical baseline app differs`)
    assert(manifest.datasets[set].puzzles === baseline.puzzles && manifest.datasets[set].datasetSha256 === baseline.datasetSha256, `${set}: historical combined data identity differs`)
  }
  const sample = json(`${PROJECT}/results/round2/sample.json`)
  assert(sample.app === historicalPin.commit && manifest.datasets.heldout.serializedSha256 === sample.data_sha256, 'historical combined sample differs')

  const historicalAppDir = join(ROOT, '.cache/chess', historicalPin.commit)
  assert(git(historicalAppDir, 'rev-parse', 'HEAD').toString().trim() === historicalPin.commit, 'the provisioned historical app checkout has a different HEAD')
  return { manifest, sha256, historicalPin, historicalPinBytes, historicalAppDir, historicalBytes: readHistorical }
}
