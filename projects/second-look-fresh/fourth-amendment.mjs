// Acquisition acceptance only. No search or deciding comparison metric runs.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LAB_DIR, chess } from '../../bridge/lib/chess.mjs'
import { ROOT, loadInputs, loadDocuments, sha256 as sha, readJson as read } from './common.mjs'
import { checkFrozen } from './amendment.mjs'
import { verifyFourthRuntime } from './fourth-runtime.mjs'
import { fourthProbeSource } from './fourth-probe-source.mjs'
import { classifyHumanFallbackMismatch, verifyHumanFailureSources } from './human-failure-diagnostic.mjs'
import { classifySleepMismatch, validateReplayClocks } from './fourth-sleep.mjs'

const PROJECT = join(LAB_DIR, 'projects/second-look-fresh')
const OLD = join(ROOT, 'acquisition-amended')
const SECOND = join(ROOT, 'second-acquisition')
const NEW = join(ROOT, 'fourth-acquisition')
const { isExactScore } = await chess('src/core/score/index.ts')
const { profileSettings } = await chess('src/services/review/profiles.ts')
const routineSettings = profileSettings('routine')
const insist = (ok, message) => { if (!ok) throw new Error(`fourth amendment: ${message}`) }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const core = doc => ({ positions: doc.positions, records: doc.records,
  provenance: doc.provenance, coverage: doc.coverage })
const json = value => JSON.stringify(value, null, 2) + '\n'
function exact(path, bytes) {
  if (existsSync(path)) insist(readFileSync(path).equals(Buffer.from(bytes)), 'an immutable output changed')
  else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes, { flag: 'wx' }) }
}
const ordered = value => Array.isArray(value) ? value.map(ordered)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(k => [k, ordered(value[k])])) : value
function receipt(path, expectedSha) {
  const row = read(path), { receiptSha256, payloadJson, ...payload } = row
  insist(typeof payloadJson === 'string' && sha(payloadJson) === receiptSha256
    && (!expectedSha || expectedSha === receiptSha256)
    && same(ordered(JSON.parse(payloadJson)), ordered(payload)), 'receipt hash or payload differs')
  return row
}

export async function fourthIdentity() {
  const bound = verifyFourthRuntime()
  const first = checkFrozen()
  const manifest = bound.fourthManifest
  const codeBytes = readFileSync(join(PROJECT, 'fourth-amendment-code.json'))
  const code = JSON.parse(codeBytes)
  insist(code.schema === 'second-look-fresh-fourth-acquisition-code/1'
    && code.amendmentSha256 === bound.fourthAmendmentSha256
    && code.bindingSha256 === bound.bindingSha256, 'fourth code identity differs')
  for (const [path, digest] of Object.entries(code.files))
    insist(sha(readFileSync(join(bound.sourceRoot, path))) === digest, 'fourth source changed')
  insist(sha(fourthProbeSource()) === code.generatedProbeSha256, 'generated fourth observation changed')
  const inputs = loadInputs()
  insist(inputs.pin.commit === manifest.appCommit && inputs.pin.records === manifest.recordsCommit,
    'bound study pin differs')
  const gate = read(join(PROJECT, 'results/phase1.json'))
  insist(gate.determinism.passed && gate.determinism.identical === gate.determinism.pairedComparisons
    && gate.appCommit === inputs.pin.commit && gate.casesSha256 === inputs.manifest.casesSha256
    && gate.candidateSha256 === inputs.candidate.candidateSha256, 'original determinism gate differs')
  const initialStop = read(join(SECOND, 'stopped-manifest.json'))
  insist(sha(readFileSync(join(SECOND, 'stopped-manifest.json'))) === manifest.secondStoppedManifestSha256,
    'preserved second stop differs')
  verifyHumanFailureSources({ appDir: join(LAB_DIR, '.cache/chess', inputs.pin.commit),
    candidateDir: join(LAB_DIR, '.cache/chess/candidates/second-look-fresh') })
  const diagnosticBytes = readFileSync(join(PROJECT, manifest.diagnostic.path))
  insist(sha(diagnosticBytes) === manifest.diagnostic.sha256, 'preserved diagnostic differs')
  const diagnostic = JSON.parse(diagnosticBytes)
  insist(diagnostic.schema === 'second-look-fresh-suspension-diagnostic/1'
    && diagnostic.appCommit === inputs.pin.commit && diagnostic.recordsCommit === inputs.pin.records
    && diagnostic.casesSha256 === inputs.manifest.casesSha256
    && diagnostic.candidateSha256 === inputs.candidate.candidateSha256,
  'diagnostic study identity differs')
  const { hashes, candidateHashes, sourceSetSha256 } = diagnostic.source ?? {}
  insist(hashes && candidateHashes && Object.keys(hashes).length > 0
    && same(Object.keys(hashes).sort(), Object.keys(candidateHashes).sort())
    && sha(JSON.stringify({ hashes, candidateHashes })) === sourceSetSha256,
  'diagnostic source inventory differs')
  for (const [sources, root] of [[hashes, join(LAB_DIR, '.cache/chess', inputs.pin.commit)],
    [candidateHashes, join(LAB_DIR, '.cache/chess/candidates/second-look-fresh')]]) {
    for (const [path, digest] of Object.entries(sources)) {
      insist(path.startsWith('src/') && !path.split('/').some(part => ['', '.', '..'].includes(part))
        && /^[0-9a-f]{64}$/.test(digest), 'invalid diagnostic source identity')
      insist(sha(readFileSync(join(root, path))) === digest, 'pinned diagnostic source changed')
    }
  }
  const known = new Set(inputs.cases.map(c => `${c.id}.json`))
  for (const path of [join(NEW, 'replays/first'), join(NEW, 'replays/retry'),
    join(OLD, 'candidate/timed/routine')])
    insist(!existsSync(path) || readdirSync(path).every(n => known.has(n)), 'unknown observation file')
  return { bound, first, manifest, amendmentSha256: bound.fourthAmendmentSha256,
    codeSha256: sha(codeBytes), inputs, initialStop }
}

export function pathsFor(inputs, ordinal, attempt) {
  insist(Number.isInteger(ordinal) && ordinal >= 1 && ordinal <= 60 && [1, 2].includes(attempt),
    'invalid observation ordinal or attempt')
  const name = `${inputs.cases[ordinal - 1].id}.json`
  const oldFirst = join(OLD, 'first-replays', name), secondFirst = join(SECOND, 'replays/first', name)
  const secondRetry = join(SECOND, 'replays/retry', name)
  const first = existsSync(oldFirst) ? oldFirst : existsSync(secondFirst) ? secondFirst : join(NEW, 'replays/first', name)
  return { canonical: join(OLD, 'candidate/evidence/routine', name), first,
    observation: attempt === 1 ? first : existsSync(secondRetry) ? secondRetry : join(NEW, 'replays/retry', name),
    accepted: join(OLD, 'candidate/timed/routine', name),
    classification: join(NEW, 'classifications', `${ordinal}-${attempt}.json`) }
}

function validateObservation(identity, ordinal, row, canonical) {
  const { inputs } = identity
  const canonicalHash = sha(JSON.stringify(core(canonical)))
  const inputHash = sha(JSON.stringify(inputs.games[ordinal - 1]))
  const sourceHash = inputs.sourceHashes.candidate
  insist(row.fingerprint === sha(JSON.stringify({ version: 1, inputHash, sourceHash,
    pin: inputs.pin, variant: 'candidate', profile: 'routine', canonicalHash }))
    && row.inputHash === inputHash && row.sourceHash === sourceHash
    && row.app === inputs.pin.commit && row.records === inputs.pin.records
    && row.caseIndex === ordinal - 1 && row.canonicalHash === canonicalHash
    && row.summary.variant === 'candidate' && row.summary.profile === 'routine',
  'observation provenance differs')
  insist(row.doc?.schema === 'game-review/2'
    && row.doc.records.length === inputs.games[ordinal - 1].game.sans.length
    && row.doc.provenance.profile === 'routine' && Array.isArray(row.looks) && Array.isArray(row.calls),
  'malformed or incomplete observation')
  insist(new Set(row.looks.map(l => l.index)).size === row.looks.length && row.looks.every(l =>
    Number.isInteger(l.index) && l.index >= 0 && l.index < canonical.records.length
      && l.evidence != null && Number.isFinite(l.seconds) && l.seconds >= 0), 'invalid raw looks')
}

function powerReading(row) {
  insist(row?.schema === 'second-look-fresh-power-reading/1' && row.ready === true
    && row.acPower === true && row.lidOpen === true && same(row.failures, []), 'power reading is not ready')
  for (const key of ['battery', 'lid'])
    insist(row[key]?.exitCode === 0 && row[key].error == null
      && typeof row[key].stdout === 'string', 'power command failed')
  insist(row.battery.command[0].split('/').at(-1) === 'pmset'
    && same(row.battery.command.slice(1), ['-g', 'batt'])
    && /Now drawing from 'AC Power'/.test(row.battery.stdout), 'AC power is not recorded')
  const lid = [...row.lid.stdout.matchAll(/"AppleClamshellState"\s*=\s*(\S+)/g)]
  insist(row.lid.command[0].split('/').at(-1) === 'ioreg'
    && same(row.lid.command.slice(1), ['-r', '-k', 'AppleClamshellState'])
    && lid.length > 0 && lid.every(m => ['No', 'false', '0'].includes(m[1])), 'open lid is not recorded')
}

function validateNewObservation(ordinal, attempt, row) {
  const label = `game-${String(ordinal).padStart(2, '0')}-attempt-${attempt}`
  const observation = row.observation
  insist(observation?.acquisition === 'fourth' && observation.ordinal === ordinal
    && observation.attempt === attempt && row.calls.every(c => !c.failed || c.error != null),
  'new observation or failed-call provenance differs')
  const quiet = receipt(join(NEW, 'quiet', `${label}-receipt.json`), observation.quietReceiptSha256)
  insist(quiet.schema === 'second-look-fresh-quiet-receipt/1'
    && quiet.policy.requiredQuietSeconds === 300 && quiet.policy.load1StrictlyBelow === 6
    && quiet.policy.sampleIntervalSeconds === 5 && quiet.policy.maximumSamplingGapSeconds === 15
    && quiet.policy.maximumClockDriftSeconds === 2
    && same(quiet.policy.blockedProcesses, ['npm run verify:pr', 'vitest']), 'quiet policy differs')
  quiet.readings.forEach((sample, index, all) => {
    insist(Number.isFinite(sample.load1) && sample.load1 >= 0 && sample.load1 < 6
      && same(sample.errors, []) && sample.blockingProcesses.npmVerifyPr === 0
      && sample.blockingProcesses.vitest === 0, 'quiet window is not quiet')
    if (index) {
      const dm = sample.monotonicSeconds - all[index - 1].monotonicSeconds
      const dw = sample.wallSeconds - all[index - 1].wallSeconds
      insist(dm > 0 && dw > 0 && dm <= 15 && dw <= 15 && Math.abs(dm - dw) <= 2,
        'quiet window has a gap or suspension')
    }
  })
  insist(quiet.readings.length > 1 && quiet.quietSeconds >= 300
    && quiet.quietSeconds === quiet.readings.at(-1).monotonicSeconds - quiet.readings[0].monotonicSeconds,
  'quiet duration differs')
  const start = read(join(NEW, 'driver-attempts', `${label}-started.json`))
  const finish = read(join(NEW, 'driver-attempts', `${label}-finished.json`))
  insist(start.ordinal === ordinal && start.attempt === attempt
    && start.quietReceiptSha256 === quiet.receiptSha256
    && start.powerReceiptSha256 === observation.powerReceiptSha256
    && finish.ordinal === ordinal && finish.attempt === attempt
    && finish.quietReceiptSha256 === start.quietReceiptSha256
    && finish.powerReceiptSha256 === start.powerReceiptSha256
    && finish.powerLogCaptureError == null && finish.process?.terminated === false,
  'driver start/finish receipts differ')
  const lag = Date.parse(start.startedAt) - Date.parse(quiet.endedAt)
  insist(lag >= 0 && lag <= 5000, 'quiet receipt was stale at launch')
  const power = receipt(join(NEW, 'power', `${label}-receipt.json`), observation.powerReceiptSha256)
  insist(power.schema === 'second-look-fresh-power-receipt/1'
    && power.quietReceiptSha256 === quiet.receiptSha256, 'power receipt identity differs')
  powerReading(power.beforeQuiet); powerReading(power.beforeLaunch)
  insist(Date.parse(power.beforeQuiet.captured.at) <= Date.parse(quiet.startedAt)
    && Date.parse(power.beforeLaunch.captured.at) >= Date.parse(quiet.endedAt)
    && Date.parse(start.startedAt) - Date.parse(power.beforeLaunch.captured.at) >= 0
    && Date.parse(start.startedAt) - Date.parse(power.beforeLaunch.captured.at) <= 5000,
  'power checks do not bracket the quiet gate and launch')
  for (const rows of [start.assertionsBeforeLaunch, finish.assertionsAfterReplay])
    insist(Array.isArray(rows) && rows.length === 2 && rows.every(a => a.alive === true
      && same(a.flags, ['-i', '-s']) && Number.isInteger(a.pid)), 'power assertions were not retained alive')
  const p = finish.process
  const processQuietLag = Date.parse(p.startedAt) - Date.parse(quiet.endedAt)
  insist(processQuietLag >= 0 && processQuietLag <= 5000,
    'quiet receipt was stale when the replay process started')
  validateReplayClocks({ replay: row, processStartedAt: p.startedAt, processEndedAt: p.endedAt })
  insist([p.startedWallSeconds, p.endedWallSeconds, p.startedMonotonicSeconds,
    p.endedMonotonicSeconds].every(Number.isFinite), 'process clock values are invalid')
  insist(Number.isFinite(p.calendarSeconds) && p.calendarSeconds >= 0
    && Number.isFinite(p.monotonicSeconds) && p.monotonicSeconds >= 0
    && p.calendarSeconds === p.endedWallSeconds - p.startedWallSeconds
    && p.monotonicSeconds === p.endedMonotonicSeconds - p.startedMonotonicSeconds
    && p.calendarMinusMonotonicSeconds === p.calendarSeconds - p.monotonicSeconds,
  'replay clock arithmetic differs')
  insist(typeof finish.powerLogReceipt === 'string' && !finish.powerLogReceipt.startsWith('/')
    && !finish.powerLogReceipt.split('/').includes('..'), 'invalid power-log path')
  const log = receipt(join(LAB_DIR, finish.powerLogReceipt), finish.powerLogReceiptSha256)
  insist(log.schema === 'second-look-fresh-replay-power-log/1' && log.exitCode === 0 && log.error == null
    && log.command[0].split('/').at(-1) === 'pmset' && same(log.command.slice(1), ['-g', 'log'])
    && log.window.startedAt === p.startedAt && log.window.endedAt === p.endedAt
    && Array.isArray(log.rawLines), 'power log capture differs')
  return { finish, powerLines: log.rawLines, processStartedAt: p.startedAt, processEndedAt: p.endedAt }
}

export function inspectObservation(identity, ordinal, attempt) {
  const paths = pathsFor(identity.inputs, ordinal, attempt)
  insist(existsSync(paths.observation), 'prescribed observation has not been produced')
  const row = read(paths.observation), canonical = read(paths.canonical)
  validateObservation(identity, ordinal, row, canonical)
  const isNew = paths.observation.startsWith(NEW + '/')
  const observed = isNew ? validateNewObservation(ordinal, attempt, row) : null
  const equalityPassed = same(core(row.doc), core(canonical))
  let diagnosis = null, failureKind = null
  if (!equalityPassed) {
    const human = classifyHumanFallbackMismatch({ canonical, replay: row }, isExactScore, routineSettings)
    if (human.accepted) { diagnosis = human; failureKind = 'human-policy' }
    else {
      let evidence = observed
      if (!evidence && ordinal === 54 && attempt === 1) {
        const saved = read(join(ROOT, 'diagnostics/second-acquisition-report.json'))
        const p = saved.attempts.find(a => a.ordinal === ordinal && a.attempt === attempt)?.processTiming
        insist(p, 'preserved interrupted replay has no process timing')
        const powerFile = join(ROOT, 'third-acquisition/diagnostics/power-window.log')
        const diagnostic = read(join(PROJECT, 'results/suspension-diagnostic.json'))
        insist(sha(readFileSync(powerFile)) === diagnostic.power.powerLogSha256,
          'preserved power evidence differs')
        evidence = { processStartedAt: p.startedAt, processEndedAt: p.endedAt,
          powerLines: readFileSync(powerFile, 'utf8').split('\n') }
      }
      if (evidence) {
        diagnosis = classifySleepMismatch({ canonical, replay: row, ...evidence })
        if (diagnosis.accepted) failureKind = 'suspension'
      } else diagnosis = human
    }
  }
  const outcome = equalityPassed ? 'accepted'
    : attempt === 1 && failureKind ? 'infrastructure-failure' : 'blocked'
  return { schema: 'second-look-fresh-fourth-observation-classification/1', ordinal, attempt,
    amendmentSha256: identity.amendmentSha256, codeSha256: identity.codeSha256,
    observationSha256: sha(readFileSync(paths.observation)),
    canonicalSha256: sha(readFileSync(paths.canonical)), outcome, equalityPassed,
    failedCalls: row.calls.filter(c => c.failed).length, failureKind, diagnosis, paths, row }
}

export function classify(identity, ordinal, attempt, { write = false } = {}) {
  const checked = inspectObservation(identity, ordinal, attempt)
  if (attempt === 2) insist(inspectObservation(identity, ordinal, 1).outcome === 'infrastructure-failure',
    'retry lacks an eligible first failure')
  if (write) {
    const { paths, row, ...record } = checked
    exact(paths.classification, json(record))
    if (checked.outcome === 'accepted') exact(paths.accepted, readFileSync(paths.observation))
  }
  if (checked.outcome === 'blocked') throw new Error('fourth amendment: unclassified mismatch or second failure; stop')
  return checked
}

export async function nextObservation() {
  const identity = await fourthIdentity()
  for (let ordinal = 1; ordinal <= 60; ordinal++) {
    const p = pathsFor(identity.inputs, ordinal, 1)
    if (!existsSync(p.first)) {
      insist(ordinal >= 55 && !existsSync(p.accepted), 'a preserved first observation disappeared')
      return { next: { ordinal, attempt: 1 } }
    }
    const first = classify(identity, ordinal, 1, { write: true })
    if (first.outcome === 'accepted') continue
    const retry = pathsFor(identity.inputs, ordinal, 2)
    if (!existsSync(retry.observation)) {
      insist(!existsSync(p.accepted), 'unproduced retry has an accepted output')
      return { next: { ordinal, attempt: 2 } }
    }
    classify(identity, ordinal, 2, { write: true })
  }
  return { next: null }
}

export async function checkComplete() {
  const identity = await fourthIdentity()
  insist((await nextObservation()).next === null, 'observations remain missing')
  loadDocuments(identity.inputs, { timed: true })
  const files = {}, observations = []
  for (let ordinal = 1; ordinal <= 60; ordinal++) {
    const first = classify(identity, ordinal, 1, { write: true })
    const acceptedAttempt = first.outcome === 'accepted' ? 1 : 2
    observations.push({ ordinal, firstOutcome: first.outcome, acceptedAttempt })
    for (const attempt of acceptedAttempt === 1 ? [1] : [1, 2]) {
      const checked = classify(identity, ordinal, attempt, { write: true })
      for (const path of [checked.paths.observation, checked.paths.accepted,
        checked.paths.canonical, checked.paths.classification])
        files[relative(ROOT, path)] = sha(readFileSync(path))
    }
  }
  const complete = { schema: 'second-look-fresh-fourth-acquisition-complete/1',
    amendmentSha256: identity.amendmentSha256, codeSha256: identity.codeSha256, observations, files }
  exact(join(NEW, 'completed-manifest.json'), json(complete))
  return { acceptedObservations: observations.length,
    retriesAccepted: observations.filter(x => x.acceptedAttempt === 2).length,
    completedManifestSha256: sha(json(complete)) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2)
  insist(['prepare', 'next', 'classify', 'check-complete'].includes(command), 'unknown command')
  if (command === 'prepare') {
    const identity = await fourthIdentity()
    exact(join(PROJECT, 'fourth-probe.mjs'), fourthProbeSource())
    exact(join(NEW, 'manifest.json'), json({ schema: 'second-look-fresh-fourth-acquisition/1',
      amendmentSha256: identity.amendmentSha256, codeSha256: identity.codeSha256 }))
    console.log(JSON.stringify({ prepared: true, amendmentSha256: identity.amendmentSha256 }))
  } else if (command === 'next') console.log(JSON.stringify(await nextObservation()))
  else if (command === 'check-complete') console.log(JSON.stringify(await checkComplete()))
  else {
    insist(args.length === 4 && args[0] === '--ordinal' && args[2] === '--attempt', 'classify requires ordinal and attempt')
    const checked = classify(await fourthIdentity(), Number(args[1]), Number(args[3]), { write: true })
    console.log(JSON.stringify({ ordinal: checked.ordinal, attempt: checked.attempt,
      outcome: checked.outcome, equalityPassed: checked.equalityPassed,
      failedCalls: checked.failedCalls, failureKind: checked.failureKind }))
  }
}
