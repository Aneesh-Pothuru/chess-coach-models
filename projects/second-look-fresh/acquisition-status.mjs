// Report a stopped acquisition without running a reference, a comparison or
// another search. The paper can recompute this report without writing files.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LAB_DIR, resultsDir } from '../../bridge/lib/lab.mjs'
import { ROOT, PROFILES, assert, loadInputs, sha256, writeJson } from './common.mjs'
import { verifyDesignCode } from './provenance.mjs'
import { checkFrozen, generatedSources } from './amendment.mjs'
import { aggregateInvocations, parseInvocation, readAmendment } from './execution.mjs'
import { summarizeAcquisitionCell } from './acquisition-report.mjs'
import { aggregateRejectedReplays } from './replay-diagnostic.mjs'

const PROJECT = join(LAB_DIR, 'projects/second-look-fresh')
const OLD = join(ROOT, 'acquisition-original')
const NEW = join(ROOT, 'acquisition-amended')
const AMENDED_COMMAND = ['bash', 'projects/second-look-fresh/phase2-amended.sh', '--phase2']
const same = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), message)
const comparable = doc => ({
  positions: doc.positions, records: doc.records, provenance: doc.provenance, coverage: doc.coverage,
})
const local = path => {
  const actual = realpathSync(path)
  assert(actual.startsWith(LAB_DIR + '/'), 'a status input leaves this clone')
  return actual
}
const bytes = path => readFileSync(local(path))
const read = path => JSON.parse(bytes(path))
const names = dir => readdirSync(local(dir)).filter(name => name.endsWith('.json')).sort()
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const noDecidingOutputPaths = [
  join(PROJECT, 'results/compare.json'), join(PROJECT, 'results/compare.md'),
  join(PROJECT, 'results/acquisition.json'), join(ROOT, 'analysis-per-game.json'),
  join(ROOT, 'reference/manifest.json'), join(NEW, 'completed-manifest.json'),
]

function requireStopped() {
  const checked = spawnSync(join(LAB_DIR, '.venv/bin/python'), ['-c',
    "import sys; sys.path.insert(0, 'projects/second-look-fresh'); from run import ensure_no_existing_workers; ensure_no_existing_workers()"],
  { cwd: LAB_DIR, encoding: 'utf8', timeout: 30000 })
  assert(checked.status === 0, 'project workers remain or their absence cannot be verified')
  assert(noDecidingOutputPaths.every(path => !existsSync(path)),
    'a deciding output, reference manifest or completed acquisition is present')
  const reference = join(ROOT, 'reference')
  assert(!existsSync(reference) || readdirSync(local(reference)).length === 0,
    'reference outputs exist before this stopped-acquisition report')
}

function checkedExecution(design, amendment, inputs) {
  const file = join(PROJECT, 'results/execution.json')
  const executionBytes = bytes(file)
  const execution = JSON.parse(executionBytes)
  const root = join(ROOT, 'run-log')
  const runNames = readdirSync(local(root)).filter(name => name.endsWith('-run.json')).sort()
  const invocations = runNames.map(name => {
    const metadata = read(join(root, name))
    const lines = bytes(join(root, name.replace(/-run\.json$/, '-output.jsonl')))
      .toString().split('\n').filter(Boolean).map(line => JSON.parse(line))
    return parseInvocation(metadata, lines, amendment)
  })
  same(execution, { ...aggregateInvocations(invocations, amendment), ...design },
    'execution aggregate no longer matches its complete saved logs and current sources')
  same([execution.appCommit, execution.recordsCommit, execution.games],
    [inputs.pin.commit, inputs.pin.records, inputs.cases.length], 'execution input identity differs')
  const latest = execution.runs.at(-1)
  assert(latest?.status === 'finished' && latest.endKnown && latest.exitCode === 1
    && !execution.lastInvocationSucceeded && execution.amendedInvocations === 1,
  'the prescribed amended invocation has not stopped unsuccessfully')
  same(latest.command, AMENDED_COMMAND, 'the latest run was not the amended acquisition')
  assert(latest.amendmentSha256 === amendment.amendmentSha256
    && latest.replayEqualityFailures === 1
    && latest.replayEqualityFailuresByArmProfile.candidate.routine === 1,
  'the latest run did not stop at one candidate routine reproduction failure')
  const lastStage = latest.stages.at(-1)
  assert(lastStage.stage === 'candidate/observed/routine' && lastStage.status === 'failed'
    && lastStage.timedGames === 49, 'the stopped observed-stage counts differ')
  const rebuilt = latest.stages.find(stage => stage.stage === 'candidate/CLI/routine')
  assert(rebuilt?.status === 'complete' && rebuilt.pendingGames === 60
    && rebuilt.completedGames === 60 && rebuilt.resumedGames === 0 && rebuilt.failedGames === 0,
  'the amended canonical routine batch was not rebuilt in full')
  for (const stage of ['references', 'analysis']) {
    assert(execution.runs.every(run => run.stages.every(row => row.stage !== stage)),
      'a reference or deciding analysis stage was entered')
    const row = execution.stages.find(row => row.stage === stage)
    assert(row && row.activeWallSecondsLowerBound === 0 && row.calendarElapsedSecondsLowerBound === 0
      && row.completeInvocations === 0 && row.failedInvocations === 0 && row.incompleteInvocations === 0
      && Object.values(row.countsAcrossInvocations).every(value => value === 0),
    'reference and analysis aggregate stages are not empty')
  }
  return { execution, executionSha256: sha256(executionBytes) }
}

function checkedAcquisitionCode(frozen) {
  const codeBytes = bytes(join(PROJECT, 'amendment-code.json'))
  const code = JSON.parse(codeBytes)
  assert(code.schema === 'second-look-fresh-acquisition-code/1', 'acquisition code schema differs')
  same(Object.keys(code.files).sort(), ['projects/second-look-fresh/amendment.mjs',
    'projects/second-look-fresh/phase2-amended.sh'].sort(), 'acquisition source set differs')
  for (const [path, expected] of Object.entries(code.files)) {
    assert(digest(expected) && sha256(bytes(join(LAB_DIR, path))) === expected,
      'an acquisition source changed')
  }
  const generated = generatedSources()
  same(code.generated, { probeSha256: sha256(generated.probe), phase2Sha256: sha256(generated.shell) },
    'the acquisition persistence patch changed')
  assert(sha256(bytes(join(ROOT, 'amended-probe.mjs'))) === code.generated.probeSha256
    && sha256(bytes(join(ROOT, 'phase2-amended-body.sh'))) === code.generated.phase2Sha256,
  'the executed acquisition wrapper changed')
  const metadata = read(join(NEW, 'manifest.json'))
  assert(metadata.schema === 'second-look-fresh-amended-acquisition/1'
    && metadata.designSha256 === frozen.design.designSha256
    && metadata.amendmentSha256 === frozen.amendmentSha256
    && metadata.codeSha256 === sha256(codeBytes)
    && metadata.originalAcquisitionManifestSha256 === frozen.manifest.originalAcquisitionManifestSha256
    && metadata.frozenFiles === frozen.frozenFiles && metadata.archivedFiles === frozen.archivedFiles
    && metadata.noDecidingOutputsBeforeAmendment === true,
  'amended acquisition-start provenance differs')
  const errors = join(NEW, 'candidate/evidence/routine/_errors.jsonl')
  assert(!existsSync(errors) || !bytes(errors).toString().trim(),
    'the amended canonical build logged an acquisition failure')
  return { acquisitionCodeSha256: sha256(codeBytes), metadata }
}

function checkedFrozenFiles(frozen) {
  const directories = new Map()
  for (const name of Object.keys(frozen.checkpoint.files)) {
    assert(!name.includes('..')
      && /^(baseline|candidate)\/(evidence|timed)\/(phone|desktop|routine)\/[^/]+\.json$/.test(name),
    'the original checkpoint has an unsafe output path')
    const base = /^candidate\/(?:evidence|timed)\/routine\//.test(name) ? OLD : ROOT
    const slash = name.lastIndexOf('/')
    const dir = join(base, name.slice(0, slash))
    local(join(base, name))
    const files = directories.get(dir) ?? []
    files.push(name.slice(slash + 1))
    directories.set(dir, files)
  }
  for (const [dir, files] of directories) same(names(dir), files.sort(),
    'a frozen or archived output set differs')
  assert(bytes(join(OLD, 'manifest.json')).equals(frozen.checkpointBytes),
    'the archived original checkpoint manifest changed')
  assert(frozen.frozenFiles === 600 && frozen.archivedFiles === 63,
    'the approved frozen and archived file counts differ')
}

function checkDocument(doc, inputs, caseIndex, profile) {
  const c = inputs.cases[caseIndex]
  const p = inputs.manifest.profiles[profile]
  assert(doc?.schema === 'game-review/2' && !doc.partial && doc.records.length === c.plies
    && doc.positions.length === c.plies + 1, 'an acquisition document is structurally incomplete')
  same(doc.game.sans, inputs.games[caseIndex].game.sans, 'an acquisition document uses another game')
  assert(doc.provenance.build === inputs.manifest.engine && doc.provenance.profile === profile
    && doc.provenance.scanNodes === p.sweepNodes && doc.provenance.verifyNodes === p.verifyNodes
    && doc.provenance.verifyMultiPv === p.verifyMultiPv && doc.provenance.tablebase === p.tablebase,
  'an acquisition document has another profile or engine provenance')
}

function checkReplay(row, canonical, inputs, caseIndex, arm, profile) {
  const inputHash = sha256(JSON.stringify(inputs.games[caseIndex]))
  const sourceHash = inputs.sourceHashes[arm]
  const canonicalHash = sha256(JSON.stringify(comparable(canonical)))
  assert(row.app === inputs.pin.commit && row.records === inputs.pin.records
    && row.caseIndex === caseIndex && row.summary.variant === arm && row.summary.profile === profile
    && row.inputHash === inputHash && row.sourceHash === sourceHash && row.canonicalHash === canonicalHash,
  'a saved replay has another input, source or canonical identity')
  same(row.fingerprint, sha256(JSON.stringify({ version: 1, inputHash, sourceHash, pin: inputs.pin,
    variant: arm, profile, canonicalHash })), 'a saved replay fingerprint differs')
  checkDocument(row.doc, inputs, caseIndex, profile)
  assert(Array.isArray(row.looks) && new Set(row.looks.map(look => look.index)).size === row.looks.length
    && row.looks.every(look => Number.isInteger(look.index) && look.index >= 0
      && look.index < inputs.cases[caseIndex].plies && look.evidence != null
      && Number.isFinite(look.seconds) && look.seconds >= 0),
  'a saved replay has invalid attempted-look evidence')
  return JSON.stringify(comparable(row.doc)) === JSON.stringify(comparable(canonical))
}

function loadCell(inputs, arm, profile, acquisition) {
  const base = acquisition === 'original' ? OLD : acquisition === 'rebuilt' ? NEW : ROOT
  const evidenceDir = join(base, arm, 'evidence', profile)
  const timedDir = join(base, arm, 'timed', profile)
  const expected = inputs.cases.map(c => `${c.id}.json`).sort()
  same(names(evidenceDir), expected, 'a canonical cell does not contain every prescribed game')
  const observedNames = names(timedDir)
  assert(observedNames.every(name => expected.includes(name)), 'an accepted replay is outside its prescribed batch')
  const documents = [], observed = [], byCase = new Map()
  inputs.cases.forEach((c, caseIndex) => {
    const canonical = read(join(evidenceDir, `${c.id}.json`))
    checkDocument(canonical, inputs, caseIndex, profile)
    documents.push(canonical)
    const file = join(timedDir, `${c.id}.json`)
    if (!existsSync(file)) return
    const row = read(file)
    assert(checkReplay(row, canonical, inputs, caseIndex, arm, profile),
      'an accepted replay fails the original exact-reproduction gate')
    observed.push(row)
    byCase.set(caseIndex, row)
  })
  same(observed.length, observedNames.length, 'accepted replay count differs')
  if (acquisition === 'frozen') same(observed.length, inputs.cases.length, 'a frozen cell is missing an accepted replay')
  return { documents, observed, byCase }
}

function freezeStoppedManifest(manifest, allowWrite) {
  const file = join(NEW, 'stopped-manifest.json')
  const encoded = Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
  if (existsSync(file)) assert(bytes(file).equals(encoded), 'the immutable stopped-acquisition checkpoint changed')
  else {
    assert(allowWrite, 'create the stopped-acquisition checkpoint with the status script first')
    writeFileSync(file, encoded, { flag: 'wx' })
  }
  return sha256(encoded)
}

/** Recompute the entire status. false is read-only and requires the stopped
 * checkpoint already written by the CLI; no output can be selected or rebuilt. */
export async function collectStatus({ writeCheckpoint = false } = {}) {
  assert(typeof writeCheckpoint === 'boolean', 'writeCheckpoint must be explicit boolean')
  requireStopped()
  const design = verifyDesignCode()
  const amendment = readAmendment()
  const frozen = checkFrozen()
  checkedFrozenFiles(frozen)
  const code = checkedAcquisitionCode(frozen)
  const inputs = loadInputs()
  const { execution, executionSha256 } = checkedExecution(design, amendment, inputs)
  const { CHESS_DIR, chess } = await import('../../bridge/lib/chess.mjs')
  assert(local(CHESS_DIR) === join(LAB_DIR, '.cache/chess', inputs.pin.commit),
    'status reporting must import the local pinned baseline app')
  const { isExactScore } = await chess('src/core/score/index.ts')
  const rows = []
  for (const arm of ['baseline', 'candidate']) for (const profile of PROFILES) {
    if (arm === 'candidate' && profile === 'routine') continue
    const cell = loadCell(inputs, arm, profile, 'frozen')
    rows.push({ arm, profile, acquisition: 'frozen', plannedForComparison: true,
      ...summarizeAcquisitionCell(cell.documents, cell.observed, isExactScore) })
  }
  const original = loadCell(inputs, 'candidate', 'routine', 'original')
  const rebuilt = loadCell(inputs, 'candidate', 'routine', 'rebuilt')
  same(original.observed.length, 3, 'the original routine accepted-replay availability changed')
  same(rebuilt.observed.length, 49, 'the rebuilt routine accepted-replay availability changed')
  rows.push({ arm: 'candidate', profile: 'routine', acquisition: 'original', plannedForComparison: false,
    ...summarizeAcquisitionCell(original.documents, original.observed, isExactScore) })
  rows.push({ arm: 'candidate', profile: 'routine', acquisition: 'rebuilt', plannedForComparison: true,
    ...summarizeAcquisitionCell(rebuilt.documents, rebuilt.observed, isExactScore) })

  const firstDir = join(NEW, 'first-replays')
  same(names(firstDir), inputs.cases.slice(0, 50).map(c => `${c.id}.json`).sort(),
    'the retained first-replay set differs from the stopped prescribed sequence')
  same(names(join(NEW, 'candidate/timed/routine')),
    inputs.cases.slice(0, 49).map(c => `${c.id}.json`).sort(), 'accepted replays are not the prescribed initial sequence')
  const first = [], rejected = [], acceptedFirst = [], outputHashes = {}
  for (const [caseIndex, c] of inputs.cases.entries()) {
    const canonicalName = `candidate/evidence/routine/${c.id}.json`
    outputHashes[canonicalName] = sha256(bytes(join(NEW, canonicalName)))
    const firstName = `first-replays/${c.id}.json`
    if (!existsSync(join(NEW, firstName))) continue
    const firstBytes = bytes(join(NEW, firstName))
    outputHashes[firstName] = sha256(firstBytes)
    const row = JSON.parse(firstBytes)
    const canonical = rebuilt.documents[caseIndex]
    const matches = checkReplay(row, canonical, inputs, caseIndex, 'candidate', 'routine')
    first.push(row)
    if (rebuilt.byCase.has(caseIndex)) {
      const acceptedName = `candidate/timed/routine/${c.id}.json`
      const acceptedBytes = bytes(join(NEW, acceptedName))
      assert(matches && firstBytes.equals(acceptedBytes),
        'an accepted amended replay differs from its first output or canonical document')
      outputHashes[acceptedName] = sha256(acceptedBytes)
      acceptedFirst.push(row)
    } else {
      assert(!matches, 'a matching first replay unexpectedly lacks its accepted output')
      rejected.push({ canonical, replay: row })
    }
  }
  same([first.length, acceptedFirst.length, rejected.length], [50, 49, 1],
    'the stopped first-output and equality-failure counts differ')
  const allFirst = summarizeAcquisitionCell(rebuilt.documents, first, isExactScore)
  const rejectedFirst = summarizeAcquisitionCell(rebuilt.documents, rejected.map(pair => pair.replay), isExactScore)
  const acceptedSummary = summarizeAcquisitionCell(rebuilt.documents, acceptedFirst, isExactScore)
  const retainedFirstReplays = {
    source: 'first-output acquisition journal; rejected output is not accepted study evidence',
    games: inputs.cases.length, producedGames: first.length, acceptedGames: acceptedFirst.length,
    rejectedGames: rejected.length, missingGames: inputs.cases.length - first.length,
    attemptedLooks: allFirst.observedLooks, guardIncompleteLooks: allFirst.observedGuardIncomplete,
    fullBatchAttemptedLooks: allFirst.fullBatchObservedLooks,
    fullBatchGuardIncompleteLooks: allFirst.fullBatchObservedGuardIncomplete,
    acceptedSubset: { games: acceptedFirst.length, attemptedLooks: acceptedSummary.observedLooks,
      guardIncompleteLooks: acceptedSummary.observedGuardIncomplete },
    rejectedSubset: { games: rejected.length, attemptedLooks: rejectedFirst.observedLooks,
      guardIncompleteLooks: rejectedFirst.observedGuardIncomplete },
  }
  const rejectedReplayDiagnostic = aggregateRejectedReplays(rejected, isExactScore)
  requireStopped()
  const stopped = {
    schema: 'second-look-fresh-stopped-acquisition/1',
    designSha256: design.designSha256, amendmentSha256: amendment.amendmentSha256,
    acquisitionCodeSha256: code.acquisitionCodeSha256,
    originalAcquisitionManifestSha256: frozen.manifest.originalAcquisitionManifestSha256,
    executionSha256, casesSha256: inputs.manifest.casesSha256, candidateSha256: inputs.candidate.candidateSha256,
    canonicalGames: rebuilt.documents.length, acceptedReplayGames: acceptedFirst.length,
    firstReplayGames: first.length, rejectedFirstReplayGames: rejected.length,
    files: outputHashes,
  }
  const stoppedAcquisitionManifestSha256 = freezeStoppedManifest(stopped, writeCheckpoint)
  return {
    schema: 'second-look-fresh-acquisition-status/1',
    status: 'blocked: exact reproduction failed', noVerdict: true,
    appCommit: inputs.pin.commit, recordsCommit: inputs.pin.records, games: inputs.cases.length,
    casesSha256: inputs.manifest.casesSha256, candidateSha256: inputs.candidate.candidateSha256,
    designSha256: design.designSha256, amendmentSha256: amendment.amendmentSha256,
    acquisitionCodeSha256: code.acquisitionCodeSha256,
    originalAcquisitionManifestSha256: frozen.manifest.originalAcquisitionManifestSha256,
    stoppedAcquisitionManifestSha256, executionSha256,
    reportingScriptSha256: sha256(bytes(fileURLToPath(import.meta.url))),
    diagnosticScriptSha256: sha256(bytes(join(PROJECT, 'replay-diagnostic.mjs'))),
    executionScriptSha256: sha256(bytes(join(PROJECT, 'execution.mjs'))),
    frozenFiles: frozen.frozenFiles, archivedFiles: frozen.archivedFiles,
    frozenAndArchivedUnchanged: true, firstOutputsRetained: true,
    acceptedExactReproductionPassed: true, exactReproductionPassed: false,
    noDecidingOutputsBeforeAmendment: code.metadata.noDecidingOutputsBeforeAmendment,
    noDecidingOutputs: true, referencesNotStarted: true, analysisNotStarted: true, noActiveWorkers: true,
    latestExitCode: execution.runs.at(-1).exitCode,
    rows, retainedFirstReplays, rejectedReplayDiagnostic,
  }
}

export function acquisitionStatusMarkdown(report) {
  const labels = { frozen: 'frozen', original: 'original, superseded', rebuilt: 'rebuilt, stopped' }
  const rows = report.rows.map(row => [
    `${row.arm} ${row.profile}`, labels[row.acquisition], row.canonicalGames,
    `${row.savedPostTeachingGuardIncomplete}/${row.savedPostTeachingDeep}`,
    row.savedAppCoveragePartial, row.observedGames,
    `${row.observedGuardIncomplete}/${row.observedLooks}`, row.observedMissingGames,
    row.fullBatchObservedGuardIncomplete === null ? 'unknown' : row.fullBatchObservedGuardIncomplete,
  ])
  const first = report.retainedFirstReplays
  return `# Acquisition stopped at reproduction

Written by \`acquisition-status.mjs\`. Status: ${report.status}. No verdict is available under the registered rule. References and analysis did not start. No miss share, extra share or quality comparison was computed.

App: \`${report.appCommit}\`. Records: \`${report.recordsCommit}\`. Data: ${report.games} frozen games; cases SHA256 \`${report.casesSha256}\`. Candidate SHA256 \`${report.candidateSha256}\`.

The amended candidate routine acquisition kept all first prescribed outputs. Its ${first.acceptedGames} accepted replays match their canonical documents and first-output journals byte for byte where required. The next retained first replay failed the existing reproduction check. It was preserved, not accepted or replaced. The ${report.frozenFiles} frozen outputs and ${report.archivedFiles} archived originals still match their recorded hashes. No project workers remain.

| Arm and profile | Acquisition | Saved games | Final post-teaching deep evidence: guard-incomplete/all | Saved app coverage.partial | Accepted observed games | Pre-teaching looks: guard-incomplete/all accepted | Games without an accepted replay | Full-batch pre-teaching incomplete looks |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.map(row => `| ${row.join(' | ')} |`).join('\n')}

Final retained deep evidence can include teaching changes. Accepted observed replays preserve pre-teaching looks. Missing traces are unknown, not zero. The app's \`coverage.partial\` is reported separately; it is not inferred to be a raw second-look count. Evidence availability uses the registered condition and the pinned app's \`isExactScore\`, without computing a serious-error verdict.

| First-output journal audit | Games | Attempted looks | Guard-incomplete looks |
| --- | ---: | ---: | ---: |
| All retained first replays | ${first.producedGames} | ${first.attemptedLooks} | ${first.guardIncompleteLooks} |
| Accepted subset | ${first.acceptedSubset.games} | ${first.acceptedSubset.attemptedLooks} | ${first.acceptedSubset.guardIncompleteLooks} |
| Rejected subset; not accepted study evidence | ${first.rejectedSubset.games} | ${first.rejectedSubset.attemptedLooks} | ${first.rejectedSubset.guardIncompleteLooks} |

The remaining ${first.missingGames} games have no retained first replay. Full-batch first-replay counts remain unknown. The rejected replay diagnostic in \`acquisition-status.json\` compares reproduction and evidence availability only. It does not compute a verdict or substitute rejected evidence for an accepted replay.

Content provenance: design SHA256 \`${report.designSha256}\`; amendment SHA256 \`${report.amendmentSha256}\`; acquisition code SHA256 \`${report.acquisitionCodeSha256}\`; original checkpoint SHA256 \`${report.originalAcquisitionManifestSha256}\`; stopped checkpoint SHA256 \`${report.stoppedAcquisitionManifestSha256}\`; execution SHA256 \`${report.executionSha256}\`; reporting script SHA256 \`${report.reportingScriptSha256}\`; diagnostic script SHA256 \`${report.diagnosticScriptSha256}\`; execution script SHA256 \`${report.executionScriptSha256}\`. The immutable stopped checkpoint covers every saved amended canonical document, accepted replay and first-output journal. Its per-game paths remain private.
`
}

async function main() {
  assert(process.argv.length === 3 && process.argv[2] === '--stopped',
    'use acquisition-status.mjs --stopped')
  const report = await collectStatus({ writeCheckpoint: true })
  const out = resultsDir('second-look-fresh')
  writeJson(join(out, 'acquisition-status.json'), report)
  writeFileSync(join(out, 'acquisition-status.md'), acquisitionStatusMarkdown(report))
  console.log('Wrote stopped-acquisition aggregates; no reference, deciding analysis or new search ran.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
