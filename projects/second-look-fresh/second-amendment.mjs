// Acquisition acceptance only. No search, classification of a chess move,
// serious-error set, share, bootstrap or verdict is computed here.
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LAB_DIR, CHESS_DIR, chess } from '../../bridge/lib/chess.mjs'
import { checkFrozen, generatedSources } from './amendment.mjs'
import { ROOT, loadInputs, loadDocuments, sha256 as sha, readJson as read } from './common.mjs'
import { secondProbeSource } from './second-probe-source.mjs'
import { classifyHumanFallbackMismatch, verifyHumanFailureSources } from './human-failure-diagnostic.mjs'

const PROJECT = join(LAB_DIR, 'projects/second-look-fresh')
const NEW = join(ROOT, 'second-acquisition')
const OLD = join(ROOT, 'acquisition-amended')
const { isExactScore } = await chess('src/core/score/index.ts')
const { profileSettings } = await chess('src/services/review/profiles.ts')
const routineSettings = profileSettings('routine')
const insist = (ok, message) => { if (!ok) throw new Error(`second amendment: ${message}`) }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const core = doc => ({ positions: doc.positions, records: doc.records, provenance: doc.provenance, coverage: doc.coverage })
function exact(path, bytes) {
  if (existsSync(path)) insist(readFileSync(path).equals(Buffer.from(bytes)), 'an immutable output changed')
  else {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, bytes, { flag: 'wx' })
  }
}
const json = value => JSON.stringify(value, null, 2) + '\n'

export async function secondIdentity() {
  const { verifyFrozenRuntime } = await import('./frozen-runtime.mjs')
  await verifyFrozenRuntime()
  const first = checkFrozen()
  const bytes = readFileSync(join(PROJECT, 'second-amendment-manifest.json'))
  const manifest = JSON.parse(bytes)
  insist(manifest.schema === 'second-look-fresh-second-acquisition-amendment/1'
    && manifest.designSha256 === first.design.designSha256
    && manifest.firstAmendmentSha256 === first.amendmentSha256, 'approved amendment identity differs')
  const protocol = manifest.protocol
  insist(protocol.path === 'projects/second-look-fresh/README.md'
    && protocol.start === '## Second acquisition amendment, approved before the comparison\n'
    && protocol.end === '## Files\n', 'approved protocol boundaries differ')
  const text = readFileSync(join(LAB_DIR, protocol.path), 'utf8')
  const start = text.indexOf(protocol.start), end = text.indexOf(protocol.end, start)
  insist(start >= 0 && end > start && sha(text.slice(start, end)) === protocol.sha256, 'second acquisition rule changed')
  insist(sha(readFileSync(join(PROJECT, manifest.diagnostic.path))) === manifest.diagnostic.sha256,
    'pre-amendment diagnostic changed')
  const stoppedBytes = readFileSync(join(OLD, 'stopped-manifest.json'))
  insist(sha(stoppedBytes) === manifest.stoppedManifestSha256, 'stopped manifest changed')
  const stopped = JSON.parse(stoppedBytes)
  insist(readdirSync(join(OLD, 'first-replays')).filter(x => x.endsWith('.json')).length === 50,
    'the stopped first-output namespace changed')
  for (const [path, digest] of Object.entries(stopped.files)) {
    insist(!path.includes('..') && !path.startsWith('/'), 'invalid stopped relative path')
    insist(sha(readFileSync(join(OLD, path))) === digest, 'a stopped output changed')
  }
  const firstCode = read(join(PROJECT, 'amendment-code.json'))
  insist(sha(readFileSync(join(PROJECT, 'amendment-code.json'))) === stopped.acquisitionCodeSha256,
    'first acquisition code manifest changed')
  for (const [path, digest] of Object.entries(firstCode.files))
    insist(sha(readFileSync(join(LAB_DIR, path))) === digest, 'first acquisition source changed')
  const firstGenerated = generatedSources()
  insist(sha(firstGenerated.probe) === firstCode.generated.probeSha256
    && sha(firstGenerated.shell) === firstCode.generated.phase2Sha256
    && sha(readFileSync(join(ROOT, 'amended-probe.mjs'))) === firstCode.generated.probeSha256
    && sha(readFileSync(join(ROOT, 'phase2-amended-body.sh'))) === firstCode.generated.phase2Sha256,
  'first generated acquisition source changed')
  const codeBytes = readFileSync(join(PROJECT, 'second-amendment-code.json'))
  const code = JSON.parse(codeBytes)
  insist(code.schema === 'second-look-fresh-second-acquisition-code/1'
    && code.amendmentSha256 === sha(bytes), 'second acquisition code identity differs')
  for (const [path, digest] of Object.entries(code.files))
    insist(sha(readFileSync(join(LAB_DIR, path))) === digest, 'second acquisition source changed')
  insist(sha(secondProbeSource()) === code.generatedProbeSha256, 'generated observation patch changed')
  const inputs = loadInputs()
  insist(inputs.pin.commit === manifest.appCommit && inputs.pin.records === manifest.recordsCommit,
    'the bound study pin differs')
  const gate = read(join(PROJECT, 'results/phase1.json'))
  insist(gate.determinism.passed && gate.determinism.identical === gate.determinism.pairedComparisons
    && gate.appCommit === inputs.pin.commit && gate.casesSha256 === inputs.manifest.casesSha256
    && gate.candidateSha256 === inputs.candidate.candidateSha256,
  'the original candidate and cases have not passed determinism')
  verifyHumanFailureSources({ appDir: join(LAB_DIR, '.cache/chess', inputs.pin.commit),
    candidateDir: join(LAB_DIR, '.cache/chess/candidates/second-look-fresh') })
  return { manifest, amendmentSha256: sha(bytes), codeSha256: sha(codeBytes), inputs, stopped }
}

const canonicalKeys = value => Array.isArray(value) ? value.map(canonicalKeys)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalKeys(value[key])])) : value
function verifyQuietReceipt(ordinal, attempt, observation) {
  const label = `game-${String(ordinal).padStart(2, '0')}-attempt-${attempt}`
  const receipt = read(join(NEW, 'quiet', `${label}-receipt.json`))
  const { receiptSha256, payloadJson, ...payload } = receipt
  insist(typeof payloadJson === 'string' && sha(payloadJson) === receiptSha256
    && same(canonicalKeys(JSON.parse(payloadJson)), canonicalKeys(payload))
    && receiptSha256 === observation.quietReceiptSha256, 'quiet receipt hash differs')
  insist(receipt.schema === 'second-look-fresh-quiet-receipt/1'
    && receipt.policy.requiredQuietSeconds === 300 && receipt.policy.load1StrictlyBelow === 6
    && receipt.policy.sampleIntervalSeconds === 5 && receipt.policy.maximumSamplingGapSeconds === 15
    && receipt.policy.maximumClockDriftSeconds === 2
    && same(receipt.policy.blockedProcesses, ['npm run verify:pr', 'vitest'])
    && Array.isArray(receipt.readings) && receipt.readings.length >= 2, 'quiet policy differs')
  receipt.readings.forEach((sample, index, all) => {
    insist(Number.isFinite(sample.load1) && sample.load1 >= 0 && sample.load1 < 6
      && same(sample.errors, []) && sample.blockingProcesses.npmVerifyPr === 0
      && sample.blockingProcesses.vitest === 0, 'a quiet-window sample is not quiet')
    if (index) {
      const dm = sample.monotonicSeconds - all[index - 1].monotonicSeconds
      const dw = sample.wallSeconds - all[index - 1].wallSeconds
      insist(dm > 0 && dw > 0 && dm <= 15 && dw <= 15 && Math.abs(dm - dw) <= 2,
        'the quiet interval contains a gap or suspension')
    }
  })
  insist(receipt.quietSeconds === receipt.readings.at(-1).monotonicSeconds
    - receipt.readings[0].monotonicSeconds && receipt.quietSeconds >= 300, 'quiet duration differs')
  const launch = read(join(NEW, 'driver-attempts', `${label}-started.json`))
  const lag = Date.parse(launch.startedAt) - Date.parse(receipt.endedAt)
  insist(launch.ordinal === ordinal && launch.attempt === attempt
    && launch.quietReceiptSha256 === receiptSha256 && lag >= 0 && lag <= 5000,
  'launch does not follow its quiet window')
}

export function pathsFor(inputs, ordinal, attempt) {
  insist(Number.isInteger(ordinal) && ordinal >= 1 && ordinal <= 60 && [1, 2].includes(attempt),
    'invalid observation ordinal or attempt')
  const id = inputs.cases[ordinal - 1].id
  const oldFirst = join(OLD, 'first-replays', `${id}.json`)
  return {
    canonical: join(OLD, 'candidate/evidence/routine', `${id}.json`),
    first: existsSync(oldFirst) ? oldFirst : join(NEW, 'replays/first', `${id}.json`),
    observation: attempt === 1
      ? (existsSync(oldFirst) ? oldFirst : join(NEW, 'replays/first', `${id}.json`))
      : join(NEW, 'replays/retry', `${id}.json`),
    accepted: join(OLD, 'candidate/timed/routine', `${id}.json`),
    classification: join(NEW, 'classifications', `${ordinal}-${attempt}.json`),
  }
}

function validateObservation(identity, ordinal, row, canonical) {
  const { inputs } = identity
  const one = inputs.games[ordinal - 1]
  const canonicalHash = sha(JSON.stringify(core(canonical)))
  const inputHash = sha(JSON.stringify(one))
  const sourceHash = inputs.sourceHashes.candidate
  insist(row.fingerprint === sha(JSON.stringify({ version: 1, inputHash, sourceHash,
    pin: inputs.pin, variant: 'candidate', profile: 'routine', canonicalHash }))
    && row.inputHash === inputHash && row.sourceHash === sourceHash
    && row.app === inputs.pin.commit && row.records === inputs.pin.records
    && row.caseIndex === ordinal - 1 && row.canonicalHash === canonicalHash
    && row.summary.variant === 'candidate' && row.summary.profile === 'routine',
  'observation provenance differs')
  insist(row.doc?.schema === 'game-review/2' && row.doc.records.length === one.game.sans.length
    && row.doc.provenance.profile === 'routine' && Array.isArray(row.looks) && Array.isArray(row.calls),
  'incomplete or malformed observation')
  insist(new Set(row.looks.map(look => look.index)).size === row.looks.length
    && row.looks.every(look => Number.isInteger(look.index) && look.index >= 0
      && look.index < canonical.records.length && look.evidence != null
      && Number.isFinite(look.seconds) && look.seconds >= 0), 'invalid observed looks')
}

export function inspectObservation(identity, ordinal, attempt) {
  const paths = pathsFor(identity.inputs, ordinal, attempt)
  insist(existsSync(paths.observation), 'the prescribed observation has not been produced')
  const row = read(paths.observation), canonical = read(paths.canonical)
  validateObservation(identity, ordinal, row, canonical)
  if (row.observation) {
    insist(row.observation.ordinal === ordinal && row.observation.attempt === attempt
      && /^[0-9a-f]{64}$/.test(row.observation.quietReceiptSha256 ?? ''), 'new observation metadata differs')
    insist(row.calls.every(call => !call.failed || call.error != null), 'failed-call reason not retained')
    verifyQuietReceipt(ordinal, attempt, row.observation)
  } else insist(attempt === 1 && ordinal <= 50, 'new observation has no quiet provenance')
  const equal = same(core(row.doc), core(canonical))
  let diagnosis = null
  if (!equal) diagnosis = classifyHumanFallbackMismatch({ canonical, replay: row }, isExactScore, routineSettings)
  const outcome = equal ? 'accepted'
    : (attempt === 1 && diagnosis.accepted ? 'infrastructure-failure' : 'blocked')
  return { schema: 'second-look-fresh-second-observation-classification/1', ordinal, attempt,
    amendmentSha256: identity.amendmentSha256, codeSha256: identity.codeSha256,
    observationSha256: sha(readFileSync(paths.observation)), canonicalSha256: sha(readFileSync(paths.canonical)),
    outcome, equalityPassed: equal, failedCalls: row.calls.filter(call => call.failed).length,
    diagnosis, paths, row }
}

export function classify(identity, ordinal, attempt, { write = false } = {}) {
  const checked = inspectObservation(identity, ordinal, attempt)
  if (attempt === 2) {
    const prior = inspectObservation(identity, ordinal, 1)
    insist(prior.outcome === 'infrastructure-failure', 'a retry has no eligible first failure')
  }
  if (write) {
    const { paths, row, ...record } = checked
    exact(paths.classification, json(record))
    if (checked.outcome === 'accepted') exact(paths.accepted, readFileSync(paths.observation))
  }
  if (checked.outcome === 'blocked') throw new Error('second amendment: unclassified mismatch or second failure; stop')
  return checked
}

export async function nextObservation() {
  const identity = await secondIdentity()
  for (let ordinal = 1; ordinal <= 60; ordinal++) {
    const paths = pathsFor(identity.inputs, ordinal, 1)
    if (!existsSync(paths.first)) {
      insist(ordinal > 50 && !existsSync(paths.accepted), 'a frozen first observation disappeared')
      return { next: { ordinal, attempt: 1 } }
    }
    const first = classify(identity, ordinal, 1)
    if (first.outcome === 'accepted') {
      insist(existsSync(paths.accepted) && readFileSync(paths.accepted).equals(readFileSync(paths.first)),
        'matching first observation must be accepted from the same bytes')
      continue
    }
    const retryPaths = pathsFor(identity.inputs, ordinal, 2)
    if (!existsSync(retryPaths.observation)) {
      insist(!existsSync(paths.accepted), 'an unproduced retry has an accepted output')
      return { next: { ordinal, attempt: 2 } }
    }
    const retry = classify(identity, ordinal, 2)
    insist(retry.outcome === 'accepted' && existsSync(paths.accepted)
      && readFileSync(paths.accepted).equals(readFileSync(retryPaths.observation)),
    'retry acceptance must preserve the produced bytes')
  }
  return { next: null }
}

export async function checkComplete() {
  const identity = await secondIdentity()
  insist((await nextObservation()).next === null, 'observations remain missing')
  loadDocuments(identity.inputs, { timed: true })
  const files = {}
  const classifications = []
  for (let ordinal = 1; ordinal <= 60; ordinal++) {
    const first = classify(identity, ordinal, 1, { write: true })
    classifications.push({ ordinal, firstOutcome: first.outcome,
      acceptedAttempt: first.outcome === 'accepted' ? 1 : 2 })
    for (const attempt of first.outcome === 'accepted' ? [1] : [1, 2]) {
      const checked = classify(identity, ordinal, attempt, { write: true })
      for (const path of [checked.paths.observation, checked.paths.accepted, checked.paths.canonical,
        checked.paths.classification].filter(existsSync))
        files[relative(ROOT, path)] = sha(readFileSync(path))
    }
  }
  const complete = { schema: 'second-look-fresh-second-acquisition-complete/1',
    amendmentSha256: identity.amendmentSha256, codeSha256: identity.codeSha256,
    observations: classifications, files }
  exact(join(NEW, 'completed-manifest.json'), json(complete))
  return { acceptedObservations: classifications.length, retriesAccepted: classifications.filter(x => x.acceptedAttempt === 2).length,
    completedManifestSha256: sha(json(complete)) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2)
  insist(['prepare', 'next', 'classify', 'check-complete'].includes(command), 'unknown command')
  if (command === 'prepare') {
    const identity = await secondIdentity()
    exact(join(PROJECT, 'second-probe.mjs'), secondProbeSource())
    exact(join(NEW, 'manifest.json'), json({ schema: 'second-look-fresh-second-acquisition/1',
      amendmentSha256: identity.amendmentSha256, codeSha256: identity.codeSha256 }))
    console.log(JSON.stringify({ prepared: true, amendmentSha256: identity.amendmentSha256 }))
  } else if (command === 'next') console.log(JSON.stringify(await nextObservation()))
  else if (command === 'check-complete') console.log(JSON.stringify(await checkComplete()))
  else {
    insist(args.length === 4 && args[0] === '--ordinal' && args[2] === '--attempt', 'classify requires ordinal and attempt')
    const checked = classify(await secondIdentity(), Number(args[1]), Number(args[3]), { write: true })
    console.log(JSON.stringify({ ordinal: checked.ordinal, attempt: checked.attempt, outcome: checked.outcome,
      equalityPassed: checked.equalityPassed, failedCalls: checked.failedCalls }))
  }
}
