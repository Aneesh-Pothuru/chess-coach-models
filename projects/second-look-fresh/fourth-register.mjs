// Freeze the approved append and execution sources before any new replay.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareFourthRuntime, verifyFourthRuntime } from './fourth-runtime.mjs'
import { fourthProbeSource } from './fourth-probe-source.mjs'

const LAB = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const PROJECT = 'projects/second-look-fresh'
const ROOT = 'private/second-look-fresh'
const FOURTH = `${ROOT}/fourth-acquisition`
const MARKER = '\n## Fourth acquisition amendment, approved before the comparison\n'
const THIRD = '\n## Third acquisition amendment, approved before the comparison\n'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const json = value => JSON.stringify(value, null, 2) + '\n'
const insist = (ok, why) => { if (!ok) throw new Error(`fourth registration: ${why}`) }
function bytes(path) {
  insist(path && !path.startsWith('/') && !path.split('/').includes('..'), 'invalid local path')
  insist(realpathSync(join(LAB, path)).startsWith(LAB + '/'), 'input leaves this clone')
  return readFileSync(join(LAB, path))
}
const read = path => JSON.parse(bytes(path))
function once(path, content) {
  const full = join(LAB, path)
  if (existsSync(full)) insist(bytes(path).equals(Buffer.from(content)), 'frozen content differs')
  else {
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content, { flag: 'wx' })
  }
}
function noNewWork() {
  for (const path of [`${PROJECT}/results/compare.json`, `${PROJECT}/results/compare.md`,
    `${ROOT}/analysis-per-game.json`, `${ROOT}/reference/manifest.json`,
    `${FOURTH}/completed-manifest.json`])
    insist(!existsSync(join(LAB, path)), 'later work already exists')
  for (const path of ['replays/first', 'replays/retry', 'driver-attempts'])
    insist(!existsSync(join(LAB, FOURTH, path)) || !readdirSync(join(LAB, FOURTH, path)).length,
      'a new replay has already started')
}

export function freezeFourthProtocol() {
  noNewWork()
  const thirdBytes = bytes(`${PROJECT}/third-amendment-manifest.json`)
  const third = JSON.parse(thirdBytes)
  insist(third.schema === 'second-look-fresh-third-acquisition-amendment/1', 'third identity differs')
  const original = bytes(third.preservedReadme.path)
  const current = bytes(`${PROJECT}/README.md`), text = current.toString()
  const start = text.indexOf(MARKER)
  insist(start >= 0 && text.indexOf(MARKER, start + MARKER.length) === -1, 'fourth section is missing or repeated')
  const previous = Buffer.from(text.slice(0, start))
  const thirdAppend = previous.subarray(original.length)
  insist(sha(original) === third.preservedReadme.sha256
    && previous.subarray(0, original.length).equals(original)
    && thirdAppend.toString().startsWith(THIRD)
    && sha(thirdAppend) === third.protocol.sha256, 'previous README is not the frozen third append')
  for (const [path, digest] of Object.entries(third.files))
    insist(sha(bytes(path)) === digest, 'a third-amendment source changed')
  const stop = bytes(`${ROOT}/second-acquisition/stopped-manifest.json`)
  insist(sha(stop) === third.secondStoppedManifestSha256, 'preceding stopped checkpoint changed')
  const diagnosis = bytes(`${PROJECT}/${third.diagnostic.path}`), d = JSON.parse(diagnosis)
  insist(sha(diagnosis) === third.diagnostic.sha256 && d.decidingMetricsRead === false
    && d.noSearchOrDecidingMetricRun === true && d.classification.qualifies === false
    && d.classification.downstreamRowsAccountedFor === true
    && d.classification.suspensionDocumented === true
    && d.classification.actualSlotStartRecorded === false
    && d.classification.terminalCauseRecorded === false, 'preserved diagnosis does not support this amendment')
  const preservedPath = `${FOURTH}/preserved-third-README.md`
  once(preservedPath, previous)
  const manifest = {
    schema: 'second-look-fresh-fourth-acquisition-amendment/1',
    appCommit: third.appCommit, recordsCommit: third.recordsCommit,
    thirdAmendmentSha256: sha(thirdBytes), secondStoppedManifestSha256: sha(stop),
    preservedReadme: { path: preservedPath, sha256: sha(previous) },
    protocol: { path: `${PROJECT}/README.md`, start: MARKER, end: 'EOF',
      sha256: sha(text.slice(start)) },
    diagnostic: third.diagnostic,
  }
  once(`${PROJECT}/fourth-amendment-manifest.json`, json(manifest))
  return { amendmentSha256: sha(json(manifest)), protocolSha256: manifest.protocol.sha256 }
}

export function freezeFourthCode() {
  noNewWork()
  const protocol = freezeFourthProtocol()
  const bound = prepareFourthRuntime()
  const names = ['fourth-register.mjs', 'fourth-runtime.mjs', 'fourth-amendment.mjs',
    'fourth-probe-source.mjs', 'fourth-sleep.mjs', 'fourth-run.py', 'fourth-launch.py',
    'power.py', 'quiet.py', 'run.py', 'second-run.py']
  const files = Object.fromEntries(names.map(name => {
    const path = `${PROJECT}/${name}`
    return [path, sha(bytes(path))]
  }))
  const manifest = { schema: 'second-look-fresh-fourth-acquisition-code/1',
    amendmentSha256: protocol.amendmentSha256, bindingSha256: bound.bindingSha256,
    files, generatedProbeSha256: sha(fourthProbeSource()) }
  once(`${PROJECT}/fourth-amendment-code.json`, json(manifest))
  prepareFourthRuntime()
  verifyFourthRuntime()
  return { ...protocol, codeSha256: sha(json(manifest)), bindingSha256: bound.bindingSha256,
    noAcquisitionStarted: true }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  insist(process.argv.length === 3 && ['--protocol', '--code'].includes(process.argv[2]),
    'use --protocol or --code')
  console.log(JSON.stringify(process.argv[2] === '--protocol' ? freezeFourthProtocol() : freezeFourthCode()))
}
