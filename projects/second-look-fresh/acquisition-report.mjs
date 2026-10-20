// Descriptive acquisition audit. Run after the registered analysis. No engine,
// verdict, comparison estimator or selection of an acquisition attempt runs here.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LAB_DIR, resultsDir } from '../../bridge/lib/lab.mjs'
import { ROOT, PROFILES, assert, loadInputs, loadDocuments, readJson, sha256, writeJson } from './common.mjs'
import { checkFrozen, checkComplete } from './amendment.mjs'

const PROJECT = join(LAB_DIR, 'projects/second-look-fresh')
const OLD = join(ROOT, 'acquisition-original')
const NEW = join(ROOT, 'acquisition-amended')
const comparable = doc => ({
  positions: doc.positions, records: doc.records,
  provenance: doc.provenance, coverage: doc.coverage,
})
const natural = value => Number.isInteger(value) && value >= 0

// This is the registered quality guard's evidence-availability condition.
// The exact-score instrument is supplied by the pinned app, never copied here.
export const guardComplete = (evidence, isExactScore) => !!(
  evidence?.complete && evidence.lines?.length
  && evidence.lines.every(line => isExactScore(line.score))
  && isExactScore(evidence.played)
)

// Pure aggregate helper. A missing replay is absent evidence, not a complete
// look or a zero count. Final saved deep evidence can include teaching changes.
export function summarizeAcquisitionCell(documents, observed, isExactScore) {
  assert(documents.length > 0 && observed.length <= documents.length,
    'invalid acquisition cell size')
  assert(typeof isExactScore === 'function', 'the app exact-score instrument is required')
  for (const doc of documents) {
    assert(doc?.schema === 'game-review/2' && Array.isArray(doc.positions)
      && natural(doc.coverage?.partial), 'invalid saved acquisition document')
  }
  for (const row of observed) {
    assert(Array.isArray(row.looks)
      && row.looks.every(look => look.evidence != null), 'invalid observed acquisition replay')
  }
  const saved = documents.flatMap(doc => doc.positions.map(position => position.deep)
    .filter(evidence => evidence != null))
  const looks = observed.flatMap(row => row.looks)
  const observedMissingGames = documents.length - observed.length
  const observedGuardIncomplete = looks.filter(look => !guardComplete(look.evidence, isExactScore)).length
  return {
    canonicalGames: documents.length,
    savedPostTeachingDeep: saved.length,
    savedPostTeachingGuardIncomplete: saved.filter(evidence => !guardComplete(evidence, isExactScore)).length,
    savedAppCoveragePartial: documents.reduce((sum, doc) => sum + doc.coverage.partial, 0),
    observedGames: observed.length,
    observedMissingGames,
    observedLooks: looks.length,
    observedGuardIncomplete,
    fullBatchObservedLooks: observedMissingGames ? null : looks.length,
    fullBatchObservedGuardIncomplete: observedMissingGames ? null : observedGuardIncomplete,
  }
}

export function reconcileAcquisitionCoverage(rows, comparison) {
  assert(rows.length === 7, 'acquisition report must contain the seven prescribed cells')
  const used = rows.filter(row => row.usedInComparison)
  const keys = used.map(row => `${row.arm}/${row.profile}`).sort()
  const expected = ['baseline', 'candidate'].flatMap(arm => PROFILES.map(profile => `${arm}/${profile}`)).sort()
  assert(JSON.stringify(keys) === JSON.stringify(expected),
    'comparison acquisition cells are missing or duplicated')
  for (const row of used) {
    const coverage = comparison.coverage?.[row.profile]?.[row.arm]
    assert(coverage && row.canonicalGames === comparison.games
      && row.observedMissingGames === 0 && row.observedGames === coverage.games
      && row.observedLooks === coverage.initialLooks
      && row.observedGuardIncomplete === coverage.incompleteSecondLooks,
    `${row.arm}/${row.profile}: acquisition audit differs from the registered analysis`)
  }
  const old = rows.filter(row => !row.usedInComparison)
  assert(old.length === 1 && old[0].arm === 'candidate' && old[0].profile === 'routine'
    && old[0].acquisition === 'original' && old[0].canonicalGames === comparison.games,
  'only the full original routine cell is superseded')
  return true
}

function oldRoutine(inputs, checkpoint) {
  const evidenceDir = join(OLD, 'candidate/evidence/routine')
  const timedDir = join(OLD, 'candidate/timed/routine')
  const names = kind => Object.keys(checkpoint.files)
    .filter(name => name.startsWith(`candidate/${kind}/routine/`))
    .map(name => name.split('/').at(-1)).sort()
  for (const [kind, dir] of [['evidence', evidenceDir], ['timed', timedDir]]) {
    const actual = readdirSync(dir).filter(name => name.endsWith('.json')).sort()
    assert(JSON.stringify(actual) === JSON.stringify(names(kind)),
      'archived routine file set differs from the acquisition checkpoint')
  }
  assert(names('evidence').length === inputs.cases.length,
    'the full original canonical routine batch is required')
  const documents = [], observed = []
  inputs.cases.forEach((c, caseIndex) => {
    const doc = readJson(join(evidenceDir, `${c.id}.json`))
    const p = inputs.manifest.profiles.routine
    assert(doc.schema === 'game-review/2' && !doc.partial
      && doc.records.length === c.plies && doc.positions.length === c.plies + 1
      && JSON.stringify(doc.game.sans) === JSON.stringify(inputs.games[caseIndex].game.sans),
    'original canonical routine input differs')
    assert(doc.provenance.build === inputs.manifest.engine && doc.provenance.profile === 'routine'
      && doc.provenance.scanNodes === p.sweepNodes && doc.provenance.verifyNodes === p.verifyNodes
      && doc.provenance.verifyMultiPv === p.verifyMultiPv && doc.provenance.tablebase === p.tablebase,
    'original canonical routine provenance differs')
    documents.push(doc)
    const file = join(timedDir, `${c.id}.json`)
    if (!existsSync(file)) return
    const row = readJson(file)
    assert(row.app === inputs.pin.commit && row.records === inputs.pin.records
      && row.caseIndex === caseIndex && row.summary.variant === 'candidate'
      && row.summary.profile === 'routine'
      && row.inputHash === sha256(JSON.stringify(inputs.games[caseIndex]))
      && row.sourceHash === inputs.sourceHashes.candidate,
    'original accepted replay provenance differs')
    assert(row.canonicalHash === sha256(JSON.stringify(comparable(doc)))
      && JSON.stringify(comparable(row.doc)) === JSON.stringify(comparable(doc)),
    'original accepted replay fails the registered reproduction check')
    assert(Array.isArray(row.looks)
      && new Set(row.looks.map(look => look.index)).size === row.looks.length
      && row.looks.every(look => Number.isInteger(look.index) && look.index >= 0
        && look.index < c.plies && look.evidence != null),
    'original accepted replay has invalid look indices')
    observed.push(row)
  })
  assert(observed.length === names('timed').length,
    'original accepted replay is outside the frozen cases')
  return { documents, observed }
}

export function acquisitionMarkdown(report) {
  const labels = {
    frozen: 'frozen', original: 'original, superseded', rebuilt: 'rebuilt, first outputs',
  }
  const rows = report.rows.map(row => [
    `${row.arm} ${row.profile}`, labels[row.acquisition], row.canonicalGames,
    `${row.savedPostTeachingGuardIncomplete}/${row.savedPostTeachingDeep}`,
    row.savedAppCoveragePartial, row.observedGames,
    `${row.observedGuardIncomplete}/${row.observedLooks}`, row.observedMissingGames,
    row.fullBatchObservedGuardIncomplete === null ? 'unknown' : row.fullBatchObservedGuardIncomplete,
  ].join(' | '))
  return `# Acquisition audit

Written by \`acquisition-report.mjs\`. This audit is descriptive. The registered analysis retains its existing treatment of incomplete looks.

App: \`${report.appCommit}\`. Records: \`${report.recordsCommit}\`. Data: ${report.games} frozen games; cases SHA256 \`${report.casesSha256}\`. Candidate SHA256 \`${report.candidateSha256}\`.

The original candidate routine batch is retained for this audit. Its saved documents are final documents, after teaching. Only its accepted observed replays supply pre-teaching second-look evidence. The missing original replays are unknown; diagnostics are not study evidence. The rebuilt batch keeps every first prescribed output. All frozen files and archived originals still match their recorded hashes, and all rebuilt accepted replays match their first-output journals and canonical documents. Acquisition preparation recorded that the comparison aggregate, per-game analysis and reference manifest were absent when the amended namespace was initialized.

| Arm and profile | Acquisition | Saved games | Final post-teaching deep evidence: guard-incomplete/all | Saved app coverage.partial | Observed games | Pre-teaching looks: guard-incomplete/all observed | Games without an accepted replay | Full-batch pre-teaching incomplete looks |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.map(row => `| ${row} |`).join('\n')}

The guard requires the evidence complete flag, a nonempty set of lines, exact scores for every line and an exact played-move score. Exactness comes from the app's \`isExactScore\`, as in the registered analysis. The saved app \`coverage.partial\` count has its own app meaning; it is not a count of raw incomplete second looks. Final post-teaching deep evidence is also not substituted for the verification-event evidence used by the quality guard. The six cells used in the comparison reconcile exactly with its observed-game, attempted-look and incomplete-look counts.

Content provenance: design SHA256 \`${report.designSha256}\`; amendment SHA256 \`${report.amendmentSha256}\`; acquisition code manifest SHA256 \`${report.acquisitionCodeSha256}\`; original checkpoint manifest SHA256 \`${report.originalAcquisitionManifestSha256}\`; completed acquisition manifest SHA256 \`${report.completedAcquisitionManifestSha256}\`; comparison aggregate SHA256 \`${report.comparisonSha256}\`; this reporting script SHA256 \`${report.reportingScriptSha256}\`. No lab-branch commit identity is used.
`
}

async function main() {
  assert(process.argv.length === 3 && process.argv[2] === '--phase2',
    'acquisition-report.mjs requires --phase2 after the registered analysis')
  const comparisonFile = join(PROJECT, 'results/compare.json')
  assert(existsSync(comparisonFile), 'complete the registered analysis before the acquisition report')
  const comparisonBytes = readFileSync(comparisonFile)
  const comparison = JSON.parse(comparisonBytes)
  const inputs = loadInputs()
  assert(comparison.phase === 2 && comparison.appCommit === inputs.pin.commit
    && comparison.recordsCommit === inputs.pin.records
    && comparison.casesSha256 === inputs.manifest.casesSha256
    && comparison.candidateSha256 === inputs.candidate.candidateSha256
    && comparison.games === inputs.cases.length, 'comparison provenance differs')
  checkComplete()
  const frozen = checkFrozen()
  const completedBytes = readFileSync(join(NEW, 'completed-manifest.json'))
  const completed = JSON.parse(completedBytes)
  const codeBytes = readFileSync(join(PROJECT, 'amendment-code.json'))
  assert(completed.amendmentSha256 === frozen.amendmentSha256
    && completed.designSha256 === frozen.design.designSha256
    && completed.codeSha256 === sha256(codeBytes)
    && completed.originalAcquisitionManifestSha256 === frozen.manifest.originalAcquisitionManifestSha256
    && completed.frozenFiles === frozen.frozenFiles
    && completed.archivedFiles === frozen.archivedFiles
    && completed.noDecidingOutputsBeforeAmendment === true,
  'completed acquisition manifest provenance differs')
  const { CHESS_DIR, chess } = await import('../../bridge/lib/chess.mjs')
  assert(resolve(CHESS_DIR) === join(LAB_DIR, '.cache/chess', inputs.pin.commit),
    'acquisition reporting must import the local pinned app')
  const { isExactScore } = await chess('src/core/score/index.ts')
  const documents = loadDocuments(inputs, { timed: true })
  const rows = []
  for (const arm of ['baseline', 'candidate']) {
    for (const profile of PROFILES) {
      if (arm === 'candidate' && profile === 'routine') continue
      rows.push({ arm, profile, acquisition: 'frozen', usedInComparison: true,
        ...summarizeAcquisitionCell(documents.map(doc => doc[arm][profile]),
          documents.map(doc => doc.timed[arm][profile]), isExactScore) })
    }
  }
  const original = oldRoutine(inputs, frozen.checkpoint)
  rows.push({ arm: 'candidate', profile: 'routine', acquisition: 'original', usedInComparison: false,
    ...summarizeAcquisitionCell(original.documents, original.observed, isExactScore) })
  rows.push({ arm: 'candidate', profile: 'routine', acquisition: 'rebuilt', usedInComparison: true,
    ...summarizeAcquisitionCell(documents.map(doc => doc.candidate.routine),
      documents.map(doc => doc.timed.candidate.routine), isExactScore) })
  reconcileAcquisitionCoverage(rows, comparison)
  const report = {
    schema: 'second-look-fresh-acquisition-report/1',
    appCommit: inputs.pin.commit, recordsCommit: inputs.pin.records,
    games: inputs.cases.length, casesSha256: inputs.manifest.casesSha256,
    candidateSha256: inputs.candidate.candidateSha256,
    designSha256: frozen.design.designSha256, amendmentSha256: frozen.amendmentSha256,
    acquisitionCodeSha256: sha256(codeBytes),
    originalAcquisitionManifestSha256: frozen.manifest.originalAcquisitionManifestSha256,
    completedAcquisitionManifestSha256: sha256(completedBytes),
    comparisonSha256: sha256(comparisonBytes),
    reportingScriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    frozenFiles: frozen.frozenFiles, archivedFiles: frozen.archivedFiles,
    frozenAndArchivedUnchanged: true, firstOutputsRetained: true,
    exactReproductionPassed: true, comparisonCoverageReconciled: true,
    noDecidingOutputsBeforeAmendment: completed.noDecidingOutputsBeforeAmendment,
    rows,
  }
  const out = resultsDir('second-look-fresh')
  writeJson(join(out, 'acquisition.json'), report)
  writeFileSync(join(out, 'acquisition.md'), acquisitionMarkdown(report))
  console.log('Wrote acquisition aggregates; frozen outputs, first-output journals and comparison coverage agree.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
