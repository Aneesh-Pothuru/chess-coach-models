// Register the approved suspension rule by content hash. This command starts
// no acquisition and cannot authorize a replay without the rule's evidence.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LAB = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const PROJECT = 'projects/second-look-fresh'
const ROOT = 'private/second-look-fresh'
const EXECUTION = `${ROOT}/second-acquisition/execution-root`
const MARKER = '\n## Third acquisition amendment, approved before the comparison\n'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const json = value => JSON.stringify(value, null, 2) + '\n'
const insist = (ok, message) => { if (!ok) throw new Error(`third amendment: ${message}`) }
function bytes(path) {
  insist(typeof path === 'string' && path && !path.startsWith('/') && !path.split('/').includes('..'),
    'invalid relative path')
  const full = join(LAB, path)
  insist(realpathSync(full).startsWith(LAB + '/') && lstatSync(full).isFile(), 'input leaves this clone')
  return readFileSync(full)
}
const read = path => JSON.parse(bytes(path))

export function freezeThirdAmendment() {
  const secondBytes = bytes(`${PROJECT}/second-amendment-manifest.json`)
  const second = JSON.parse(secondBytes)
  const stopBytes = bytes(`${ROOT}/second-acquisition/stopped-manifest.json`)
  const stop = JSON.parse(stopBytes)
  const stopAggregate = read(`${PROJECT}/results/second-stopped-manifest.json`)
  insist(sha(stopBytes) === stopAggregate.stoppedManifestSha256
    && stop.amendmentSha256 === sha(secondBytes), 'preserved second stop differs')
  for (const [path, digest] of Object.entries(stop.files))
    insist(sha(bytes(path)) === digest, 'a preserved stopped input changed')
  for (const [path, names] of Object.entries(stop.inventories))
    insist(JSON.stringify(readdirSync(join(LAB, path)).sort()) === JSON.stringify(names),
      'a preserved stopped inventory changed')

  const bindingBytes = bytes(`${EXECUTION}/frozen-binding.json`)
  const binding = JSON.parse(bindingBytes)
  insist(sha(bindingBytes) === stop.frozenBindingSha256, 'preserved runtime binding differs')
  insist(binding.sourceRoot === LAB && binding.executionRoot === join(LAB, EXECUTION)
    && realpathSync(join(LAB, EXECUTION)) === join(LAB, EXECUTION)
    && !lstatSync(join(LAB, EXECUTION)).isSymbolicLink(), 'bound runtime location differs')
  const pinBytes = bytes(`${EXECUTION}/bridge/chess.json`)
  insist(sha(pinBytes) === binding.pinSha256 && pinBytes.toString() === json(binding.pin)
    && binding.pin.commit === second.appCommit && binding.pin.records === second.recordsCommit
    && read('bridge/chess.json').repo === binding.pin.repo, 'bound study pin differs')
  for (const [path, target] of Object.entries(binding.links)) {
    const source = join(LAB, target), destination = join(LAB, EXECUTION, path)
    insist(realpathSync(source).startsWith(LAB + '/')
      && lstatSync(destination).isSymbolicLink()
      && realpathSync(destination) === realpathSync(source), 'bound link target differs')
  }
  for (const commit of [binding.pin.commit, binding.pin.records]) {
    const cache = join(LAB, '.cache/chess', commit)
    insist(realpathSync(cache).startsWith(LAB + '/')
      && existsSync(join(cache, '.git/bridge-ready')), 'study cache is not ready and local')
    insist(execFileSync('git', ['-C', cache, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === commit,
      'study cache commit differs')
  }
  for (const name of [binding.pin.commit, 'candidates/second-look-fresh'])
    insist(realpathSync(join(LAB, '.cache/chess', name)).startsWith(LAB + '/')
      && realpathSync(join(LAB, '.cache/chess', name, 'node_modules')).startsWith(LAB + '/'),
    'app or dependency path leaves this clone')
  const candidate = read(`${ROOT}/candidate-manifest.json`)
  const { candidateSha256, ...payload } = candidate
  insist(candidateSha256 === binding.candidateSha256 && candidateSha256 === sha(JSON.stringify(payload))
    && candidate.appCommit === binding.pin.commit && candidate.recordsCommit === binding.pin.records
    && candidate.recipeSha256 === binding.files[`${PROJECT}/candidate.mjs`].sha256,
  'candidate identity differs')
  for (const replacement of candidate.replacements)
    insist(sha(bytes(`.cache/chess/${binding.pin.commit}/${replacement.path}`)) === replacement.sourceSha256
      && sha(bytes(`.cache/chess/candidates/second-look-fresh/${replacement.path}`)) === replacement.candidateSha256,
    'candidate replacement differs')
  const codeBytes = bytes(`${PROJECT}/second-amendment-code.json`)
  insist(bytes(`${EXECUTION}/${PROJECT}/second-amendment-code.json`).equals(codeBytes)
    && JSON.parse(codeBytes).bindingSha256 === sha(bindingBytes), 'code attestation copy differs')
  const originalPath = `${EXECUTION}/${PROJECT}/README.md`
  const original = bytes(originalPath)
  const current = bytes(`${PROJECT}/README.md`)
  const text = current.toString()
  const start = text.indexOf(MARKER)
  insist(start >= 0 && text.indexOf(MARKER, start + MARKER.length) === -1
    && Buffer.from(text.slice(0, start)).equals(original),
  'only the approved third section may be appended to the preserved README')
  for (const [path, expected] of Object.entries(binding.files)) {
    insist(sha(bytes(`${EXECUTION}/${path}`)) === expected.sha256
      && (statSync(join(LAB, EXECUTION, path)).mode & 0o777) === expected.mode,
    'a preserved execution source changed')
    const sourceBytes = path === `${PROJECT}/README.md` ? original : bytes(path)
    insist(sha(sourceBytes) === expected.sha256
      && (statSync(join(LAB, path)).mode & 0o777) === expected.mode, 'a registered source changed')
  }
  for (const [path, digest] of Object.entries(binding.linkedFiles))
    insist(sha(bytes(path)) === digest, 'a linked immutable report changed')
  for (const path of [`${PROJECT}/results/compare.json`, `${PROJECT}/results/compare.md`,
    `${ROOT}/analysis-per-game.json`, `${ROOT}/reference/manifest.json`,
    `${ROOT}/second-acquisition/completed-manifest.json`])
    insist(!existsSync(join(LAB, path)), 'comparison or completed acquisition unexpectedly exists')

  const diagnosticPath = 'results/suspension-diagnostic.json'
  const diagnosticBytes = bytes(`${PROJECT}/${diagnosticPath}`)
  const diagnostic = JSON.parse(diagnosticBytes)
  insist(diagnostic.schema === 'second-look-fresh-suspension-diagnostic/1'
    && diagnostic.appCommit === second.appCommit && diagnostic.recordsCommit === second.recordsCommit
    && diagnostic.decidingMetricsRead === false && diagnostic.noSearchOrDecidingMetricRun === true
    && diagnostic.secondStoppedManifestSha256 === sha(stopBytes)
    && diagnostic.secondAcquisitionReportSha256 === stop.reportSha256
    && diagnostic.secondAmendmentSha256 === sha(secondBytes)
    && diagnostic.frozenBindingSha256 === sha(bindingBytes)
    && diagnostic.reportingScriptSha256 === sha(bytes(`${PROJECT}/suspension-diagnostic.mjs`)),
  'diagnostic identity differs')
  const finding = diagnostic.classification
  insist(finding?.downstreamRowsAccountedFor === true && finding.suspensionDocumented === true
    && finding.qualifies === false && finding.actualSlotStartRecorded === false
    && finding.actualDeadlineExpiryRecorded === false && finding.terminalCauseRecorded === false
    && finding.deadlineTerminationProven === false
    && finding.nominalCallStartPlusDeadlineFallsInPowerInterval === true,
  'the diagnostic does not support this amendment and its stopped eligibility finding')
  const files = Object.fromEntries(['suspension-diagnostic.mjs', 'third-amendment.mjs']
    .map(name => [`${PROJECT}/${name}`, sha(bytes(`${PROJECT}/${name}`))]))
  const manifest = {
    schema: 'second-look-fresh-third-acquisition-amendment/1',
    appCommit: second.appCommit, recordsCommit: second.recordsCommit,
    secondAmendmentSha256: sha(secondBytes),
    secondStoppedManifestSha256: sha(stopBytes),
    frozenBindingSha256: sha(bindingBytes),
    preservedReadme: { path: originalPath, sha256: sha(original) },
    protocol: { path: `${PROJECT}/README.md`, start: MARKER, end: 'EOF',
      sha256: sha(text.slice(start)) },
    diagnostic: { path: diagnosticPath, sha256: sha(diagnosticBytes) },
    files,
  }
  const output = join(LAB, PROJECT, 'third-amendment-manifest.json')
  const content = json(manifest)
  if (existsSync(output)) insist(readFileSync(output, 'utf8') === content, 'third amendment manifest changed')
  else writeFileSync(output, content, { flag: 'wx' })
  return { amendmentSha256: sha(content), protocolSha256: manifest.protocol.sha256,
    diagnosticSha256: manifest.diagnostic.sha256, noAcquisitionStarted: true }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  insist(process.argv.length === 3 && process.argv[2] === '--freeze', 'use --freeze')
  console.log(JSON.stringify(freezeThirdAmendment()))
}
