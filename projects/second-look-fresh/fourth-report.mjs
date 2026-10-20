// Descriptive acquisition reporting only. No engine, acquisition acceptance,
// reference, chess verdict or comparison estimator runs in this module.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { numericSummary, callFailureCounts, utcIntervalSeconds } from './second-report.mjs'
import { guardComplete, summarizeAcquisitionCell } from './acquisition-report.mjs'
import { verifyFourthRuntime } from './fourth-runtime.mjs'

const LAB = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const PROJECT = join(LAB, 'projects/second-look-fresh')
const ROOT = join(LAB, 'private/second-look-fresh')
const FOURTH = join(ROOT, 'fourth-acquisition')
const SECOND = join(ROOT, 'second-acquisition')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const json = value => JSON.stringify(value, null, 2) + '\n'
const insist = (ok, why) => { if (!ok) throw new Error(`fourth report: ${why}`) }
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
const OUTCOMES = ['accepted', 'matching-unaccepted', 'infrastructure-failure', 'blocked']
const publicOutcomes = rows => Object.fromEntries(OUTCOMES.map(outcome =>
  [outcome, rows.filter(row => row.outcome === outcome).length]))

// Reading does not reserve a live file. Refuse a mixed snapshot and let the
// caller collect again if a writer changes any captured bytes or inventory.
function snapshot() {
  const files = new Map(), directories = new Map()
  const local = path => {
    insist(realpathSync(path).startsWith(LAB + '/'), 'an input leaves this clone')
    return path
  }
  const bytes = path => {
    if (!files.has(path)) files.set(path, readFileSync(local(path)))
    return files.get(path)
  }
  const names = path => {
    const values = existsSync(path) ? readdirSync(local(path)).sort() : []
    directories.set(path, values)
    return values
  }
  return {
    bytes, names, read: path => JSON.parse(bytes(path)),
    lines: path => {
      const text = bytes(path).toString()
      return text.slice(0, text.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(JSON.parse)
    },
    finish() {
      for (const [path, expected] of directories)
        insist(same(existsSync(path) ? readdirSync(local(path)).sort() : [], expected),
          'an inventory changed during collection; collect again')
      for (const [path, expected] of files)
        insist(readFileSync(local(path)).equals(expected), 'an input changed during collection; collect again')
      return Object.fromEntries([...files].map(([path, bytes]) => [relative(LAB, path), sha(bytes)]).sort())
    },
  }
}

export function attemptTiming(group, attempts, isExactScore) {
  const rows = attempts.map(a => a.row), looks = rows.flatMap(r => r.looks)
  const depths = looks.map(l => l.depth ?? l.evidence.depth).filter(x => x != null)
  const finished = attempts.filter(a => a.processTiming)
  return { group, producedAttempts: attempts.length, outcomes: publicOutcomes(attempts),
    measuredReviewSeconds: numericSummary(rows.map(r => r.summary.seconds)),
    measuredVerificationSeconds: numericSummary(rows.map(r => r.summary.verifySeconds)),
    observedLookSeconds: numericSummary(looks.map(l => l.seconds)),
    observedLookDepth: numericSummary(depths), looksWithoutDepth: looks.length - depths.length,
    observedLooks: looks.length,
    observedGuardIncomplete: looks.filter(l => !guardComplete(l.evidence, isExactScore)).length,
    recordedReviewCalendarSeconds: numericSummary(rows.map(r =>
      utcIntervalSeconds(r.observation.startedAt, r.observation.endedAt))),
    completedProcessClock: processClocks(finished.map(a => a.processTiming)),
    calls: callFailureCounts(rows) }
}

export function processClocks(rows) {
  return { processes: rows.length,
    calendarSeconds: numericSummary(rows.map(r => r.calendarSeconds)),
    pythonMonotonicSeconds: numericSummary(rows.map(r => r.seconds)),
    calendarMinusPythonMonotonicSeconds: numericSummary(rows.map(r => r.calendarSeconds - r.seconds),
      { allowNegative: true }) }
}

function preservedSecond(snap, identity) {
  const stoppedPath = join(SECOND, 'stopped-manifest.json')
  const stoppedBytes = snap.bytes(stoppedPath), stopped = JSON.parse(stoppedBytes)
  insist(stopped.schema === 'second-look-fresh-second-acquisition-stopped/1',
    'the preserved stopped checkpoint differs')
  const reportPath = join(PROJECT, 'results/second-acquisition.json')
  const privatePath = join(ROOT, 'diagnostics/second-acquisition-report.json')
  const reportBytes = snap.bytes(reportPath), report = JSON.parse(reportBytes)
  insist(sha(reportBytes) === stopped.reportSha256
    && stopped.files[relative(LAB, privatePath)] === sha(snap.bytes(privatePath))
    && stopped.files[relative(LAB, join(PROJECT, 'results/second-acquisition.md'))]
      === sha(snap.bytes(join(PROJECT, 'results/second-acquisition.md')))
    && report.appCommit === identity.inputs.pin.commit
    && report.recordsCommit === identity.inputs.pin.records
    && report.casesSha256 === identity.inputs.manifest.casesSha256
    && report.candidateSha256 === identity.inputs.candidate.candidateSha256
    && report.acquisition.acceptedGames === 53 && !report.complete
    && !report.decidingMetricsRead, 'preserved report or fixed accepted checkpoint differs')
  return { report, privateReport: snap.read(privatePath), stopped,
    stoppedSha256: sha(stoppedBytes), reportSha256: sha(reportBytes) }
}

function stageGroup(stage) {
  if (/^(?:wrapper|game-\d\d-attempt-[12])-awake$/.test(stage)) return 'awake-assertions'
  if (/^game-\d\d-attempt-[12]$/.test(stage)) return 'replay-processes'
  if (/^reference-[01]$/.test(stage)) return 'reference-workers'
  insist(['fourth-runtime', 'prepare', 'next', 'classify', 'check-complete', 'analysis'].includes(stage),
    'unknown driver stage')
  return stage === 'analysis' ? 'analysis' : 'acquisition-helpers'
}

const canonicalKeys = value => Array.isArray(value) ? value.map(canonicalKeys)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, canonicalKeys(value[key])])) : value
function checkReceipt(receipt) {
  const { receiptSha256, payloadJson, ...payload } = receipt
  insist(typeof payloadJson === 'string' && sha(payloadJson) === receiptSha256
    && same(canonicalKeys(JSON.parse(payloadJson)), canonicalKeys(payload)),
  'receipt content hash differs')
}

function driverEvidence(snap, code) {
  const runDir = join(FOURTH, 'run-log'), quietDir = join(FOURTH, 'quiet'), powerDir = join(FOURTH, 'power')
  const runs = [], privateRuns = [], intervals = [], startedStages = []
  const waitsEnded = [], waitsPending = [], completedWaits = [], assertionEvents = []
  for (const name of snap.names(runDir).filter(n => n.endsWith('-run.json'))) {
    const meta = snap.read(join(runDir, name))
    insist(meta.schema === 'second-look-fresh-fourth-run/1'
      && ['running', 'finished'].includes(meta.status) && date(meta.startedAt), 'invalid driver metadata')
    for (const [path, digest] of Object.entries(meta.sourceSha256))
      insist(code.files[`projects/second-look-fresh/${path}`] === digest, 'driver source differs')
    const events = snap.lines(join(runDir, name.replace('-run.json', '-events.jsonl')))
    const active = new Map(), waits = new Map()
    let previousSeconds = 0, previousAt = meta.startedAt
    for (const event of events) {
      insist(date(event.at) && finite(event.seconds) && event.seconds >= previousSeconds
        && Date.parse(event.at) >= Date.parse(previousAt), 'driver event clock ordering differs')
      previousSeconds = event.seconds; previousAt = event.at
      if (event.event === 'child-started') {
        insist(!active.has(event.pid), 'duplicate active child')
        startedStages.push(event.stage); stageGroup(event.stage); active.set(event.pid, event)
      } else if (['child-finished', 'child-terminated'].includes(event.event)) {
        const begin = active.get(event.pid)
        insist(begin?.stage === event.stage && finite(event.monotonicSeconds)
          && finite(event.calendarSeconds) && date(event.startedAt) && date(event.endedAt)
          && Math.abs(event.calendarMinusMonotonicSeconds
            - (event.calendarSeconds - event.monotonicSeconds)) < 1e-8,
        'child clock record has no consistent start or elapsed values')
        intervals.push({ group: stageGroup(event.stage), stage: event.stage,
          seconds: event.monotonicSeconds, calendarSeconds: event.calendarSeconds,
          startedAt: event.startedAt, endedAt: event.endedAt,
          calendarMinusMonotonicSeconds: event.calendarMinusMonotonicSeconds,
          exitCode: event.exitCode, terminated: event.terminated })
        active.delete(event.pid)
      } else if (event.event === 'quiet-started') {
        const key = `${event.ordinal}/${event.attempt}`
        insist(!waits.has(key), 'duplicate quiet wait')
        waits.set(key, event)
      } else if (event.event === 'quiet-passed') {
        const key = `${event.ordinal}/${event.attempt}`, begin = waits.get(key)
        insist(begin && finite(event.quietSeconds), 'quiet passage has no wait')
        completedWaits.push({ seconds: event.seconds - begin.seconds,
          calendarSeconds: utcIntervalSeconds(begin.at, event.at), quietSeconds: event.quietSeconds })
        waits.delete(key)
      } else if (event.event === 'assertion-verified') assertionEvents.push(event)
      else insist(['replay-classified', 'wrapper-stopped', 'wrapper-interrupted'].includes(event.event),
        'unknown driver event')
    }
    if (meta.status === 'finished') insist(date(meta.endedAt) && finite(meta.seconds)
      && finite(meta.calendarSeconds) && meta.seconds >= previousSeconds
      && Date.parse(meta.endedAt) >= Date.parse(previousAt), 'driver end clocks differ')
    const state = meta.status === 'finished' ? (meta.exitCode === 0 ? 'finished-successfully' : 'stopped')
      : waits.size ? 'recorded-waiting-for-quiet'
        : [...active.values()].some(e => stageGroup(e.stage) === 'replay-processes') ? 'recorded-replay-running'
          : [...active.values()].some(e => stageGroup(e.stage) === 'reference-workers') ? 'recorded-reference-running'
            : [...active.values()].some(e => e.stage === 'analysis') ? 'recorded-analysis-running'
              : 'recorded-running-between-steps'
    runs.push({ state, startedAt: meta.startedAt, endedAt: meta.endedAt ?? null,
      observedThrough: meta.endedAt ?? previousAt, exitCode: meta.exitCode ?? null,
      finishedMonotonicSeconds: meta.status === 'finished' ? meta.seconds : null,
      finishedCalendarSeconds: meta.status === 'finished' ? meta.calendarSeconds : null,
      finishedCalendarMinusMonotonicSeconds: meta.status === 'finished' ? meta.calendarMinusMonotonicSeconds : null })
    for (const wait of waits.values()) {
      if (meta.status === 'finished') waitsEnded.push({
        seconds: meta.seconds - wait.seconds, calendarSeconds: utcIntervalSeconds(wait.at, meta.endedAt) })
      else waitsPending.push(wait)
    }
    privateRuns.push({ metadata: name, activeChildren: [...active.values()],
      pendingQuietWindows: [...waits.values()], state })
  }
  const quietSamples = [], samplesByAttempt = new Map(), quietReceipts = []
  let powerResets = 0
  const allowedReset = new Set(['process-scan-failed', 'load-read-failed', 'load-unavailable',
    'sample-collection-too-slow', 'process-inventory-unavailable', 'blocking-process-present',
    'load-not-below-limit', 'clock-did-not-advance', 'sampling-gap', 'clock-drift-or-suspension'])
  for (const name of snap.names(quietDir)) {
    if (name.endsWith('-receipt.json')) {
      const receipt = snap.read(join(quietDir, name)); checkReceipt(receipt)
      quietReceipts.push(receipt)
    } else if (name.endsWith('-samples.jsonl')) {
      const match = /^game-(\d\d)-attempt-([12])-samples\.jsonl$/.exec(name)
      insist(match, 'unknown quiet log filename')
      const rows = snap.lines(join(quietDir, name))
      samplesByAttempt.set(`${Number(match[1])}/${Number(match[2])}`, rows.filter(r => r.event === 'sample'))
      for (const row of rows) {
        if (row.event === 'sample') {
          insist(date(row.at) && Array.isArray(row.resetReasons)
            && row.resetReasons.every(reason => allowedReset.has(reason)), 'quiet sample needs review')
          quietSamples.push(row)
        } else if (row.event === 'power-gate-reset') powerResets++
        else insist(row.event === 'passed', 'unknown quiet event')
      }
    } else insist(false, 'unknown quiet artifact')
  }
  const powerReadings = [], powerReceipts = [], powerLogs = [], referencePower = []
  for (const name of snap.names(powerDir)) {
    const path = join(powerDir, name)
    if (name.endsWith('-receipt.json')) {
      const receipt = snap.read(path); checkReceipt(receipt); powerReceipts.push(receipt)
    } else if (name.endsWith('-powerlog.json')) {
      const receipt = snap.read(path); checkReceipt(receipt); powerLogs.push(receipt)
    } else if (name.endsWith('-samples.jsonl')) {
      for (const row of snap.lines(path)) {
        if (['before-quiet', 'before-launch'].includes(row.event)) powerReadings.push(row.reading)
        else insist(row.event === 'passed', 'unknown power event')
      }
    } else if (name === 'reference-power.jsonl') referencePower.push(...snap.lines(path))
    else insist(false, 'unknown power artifact')
  }
  const allowedPowerFailures = new Set(['battery-command-failed', 'lid-command-failed',
    'ac-power-not-established', 'open-lid-not-established'])
  for (const reading of [...powerReadings, ...referencePower])
    insist(reading.schema === 'second-look-fresh-power-reading/1' && typeof reading.ready === 'boolean'
      && reading.failures.every(reason => allowedPowerFailures.has(reason)), 'power reading needs review')
  for (const receipt of powerReceipts)
    insist(receipt.schema === 'second-look-fresh-power-receipt/1'
      && receipt.beforeQuiet.ready && receipt.beforeLaunch.ready, 'power receipt is not ready')
  const pendingBounds = waitsPending.map(wait => {
    const rows = (samplesByAttempt.get(`${wait.ordinal}/${wait.attempt}`) ?? [])
      .filter(row => Date.parse(row.at) >= Date.parse(wait.at))
    return { calendarSeconds: rows.length ? utcIntervalSeconds(wait.at, rows.at(-1).at) : 0,
      seconds: rows.length ? rows.at(-1).monotonicSeconds - rows[0].monotonicSeconds : 0 }
  })
  const latest = quietSamples.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1)
  const resetCounts = {}
  for (const sample of quietSamples) for (const reason of sample.resetReasons)
    resetCounts[reason] = (resetCounts[reason] ?? 0) + 1
  const powerFailureCounts = {}
  for (const sample of powerReadings) for (const reason of sample.failures)
    powerFailureCounts[reason] = (powerFailureCounts[reason] ?? 0) + 1
  const fullPowerEvents = powerLogs.flatMap(log => log.events)
  insist(fullPowerEvents.every(event => ['Sleep', 'Wake', 'DarkWake', 'other'].includes(event.event)),
    'unknown power-log event classification')
  const groups = ['acquisition-helpers', 'replay-processes', 'reference-workers', 'analysis', 'awake-assertions']
  return { runs, privateRuns, intervals,
    replayProcesses: intervals.filter(row => row.group === 'replay-processes').map(row => {
      const match = /^game-(\d\d)-attempt-([12])$/.exec(row.stage)
      return { ...row, ordinal: Number(match[1]), attempt: Number(match[2]) }
    }),
    timing: groups.map(group => {
      const rows = intervals.filter(row => row.group === group)
      return { group, startedProcesses: startedStages.filter(stage => stageGroup(stage) === group).length,
        finishedProcesses: rows.length, monotonicSeconds: numericSummary(rows.map(r => r.seconds)),
        calendarSeconds: numericSummary(rows.map(r => r.calendarSeconds)),
        nonzeroExits: rows.filter(row => row.exitCode !== 0).length }
    }),
    quiet: { samples: quietSamples.length, receipts: quietReceipts.length, resetCounts, powerGateResets: powerResets,
      receiptQuietSeconds: numericSummary(quietReceipts.map(r => r.quietSeconds)),
      completedWaitSeconds: numericSummary(completedWaits.map(w => w.seconds)),
      completedWaitCalendarSeconds: numericSummary(completedWaits.map(w => w.calendarSeconds)),
      endedBeforePassWaitSeconds: numericSummary(waitsEnded.map(w => w.seconds)),
      endedBeforePassCalendarSeconds: numericSummary(waitsEnded.map(w => w.calendarSeconds)),
      recordedPendingWaits: pendingBounds.length,
      pendingWaitMonotonicSecondsLowerBound: numericSummary(pendingBounds.map(w => w.seconds)),
      pendingWaitCalendarSecondsLowerBound: numericSummary(pendingBounds.map(w => w.calendarSeconds)),
      latestSample: latest ? { at: latest.at, load1: latest.load1, blockingProcesses: latest.blockingProcesses,
        quietSeconds: latest.quietSeconds, passed: latest.passed, resetReasons: latest.resetReasons } : null },
    power: { readings: powerReadings.length, readyReadings: powerReadings.filter(r => r.ready).length,
      failureCounts: powerFailureCounts, receipts: powerReceipts.length,
      beforeQuietReadyReceipts: powerReceipts.filter(r => r.beforeQuiet.ready).length,
      beforeLaunchReadyReceipts: powerReceipts.filter(r => r.beforeLaunch.ready).length,
      capturedReplayLogs: powerLogs.length, failedReplayLogCaptures: powerLogs.filter(r => r.error !== null || r.exitCode !== 0).length,
      replayPowerEventCounts: Object.fromEntries(['Sleep', 'Wake', 'DarkWake', 'other']
        .map(kind => [kind, fullPowerEvents.filter(event => event.event === kind).length])),
      referencePowerReadings: referencePower.length,
      referenceReadyReadings: referencePower.filter(r => r.ready).length,
      assertionVerificationEvents: assertionEvents.length } }
}

export async function collectFourthReport({ withComparison = false } = {}) {
  const bound = verifyFourthRuntime()
  const helper = await import(pathToFileURL(join(bound.executionRoot,
    'projects/second-look-fresh/fourth-amendment.mjs')).href)
  const identity = await helper.fourthIdentity(), snap = snapshot()
  snap.names(FOURTH)
  snap.names(ROOT)
  snap.names(join(PROJECT, 'results'))
  snap.names(join(ROOT, 'reference'))
  const codeBytes = snap.bytes(join(PROJECT, 'fourth-amendment-code.json')), code = JSON.parse(codeBytes)
  insist(sha(codeBytes) === identity.codeSha256, 'frozen fourth code identity differs')
  const bridge = await import(pathToFileURL(join(bound.executionRoot, 'bridge/lib/chess.mjs')).href)
  insist(bridge.CHESS_DIR.endsWith('/' + identity.inputs.pin.commit),
    'reporting must import the frozen baseline app instrument')
  const { isExactScore } = await bridge.chess('src/core/score/index.ts')
  const preserved = preservedSecond(snap, identity)
  const suspensionBytes = snap.bytes(join(PROJECT, identity.manifest.diagnostic.path))
  const suspension = JSON.parse(suspensionBytes)
  insist(sha(suspensionBytes) === identity.manifest.diagnostic.sha256
    && suspension.schema === 'second-look-fresh-suspension-diagnostic/1'
    && suspension.classification.qualifies === false
    && suspension.classification.deadlineTerminationProven === false
    && suspension.decidingMetricsRead === false, 'the preserved suspension diagnosis differs')
  const knownNames = identity.inputs.cases.map(c => `${c.id}.json`)
  const canonical = [], accepted = [], firsts = [], attempts = []
  const acceptedDirectory = dirname(helper.pathsFor(identity.inputs, 1, 1).accepted)
  const acceptedNames = snap.names(acceptedDirectory)
  insist(acceptedNames.every(name => knownNames.includes(name)), 'unexpected accepted replay filename')
  for (const [path, digest] of Object.entries(preserved.stopped.files))
    insist(sha(snap.bytes(join(LAB, path))) === digest, 'a preserved stopped input changed')
  for (const [path, names] of Object.entries(preserved.stopped.inventories))
    insist(same(snap.names(join(LAB, path)), names), 'a preserved stopped inventory changed')
  for (const dir of ['replays/first', 'replays/retry', 'classifications', 'driver-attempts'])
    snap.names(join(FOURTH, dir))
  for (let ordinal = 1; ordinal <= identity.inputs.cases.length; ordinal++) {
    const firstPaths = helper.pathsFor(identity.inputs, ordinal, 1)
    const doc = snap.read(firstPaths.canonical); canonical.push(doc)
    const produced = []
    for (const attempt of [1, 2]) {
      const paths = helper.pathsFor(identity.inputs, ordinal, attempt)
      if (!existsSync(paths.observation)) continue
      const bytes = snap.bytes(paths.observation), row = JSON.parse(bytes)
      const checked = helper.inspectObservation(identity, ordinal, attempt)
      insist(checked.observationSha256 === sha(bytes)
        && checked.canonicalSha256 === sha(snap.bytes(paths.canonical)), 'checked observation changed')
      const acceptedNow = existsSync(paths.accepted) && snap.bytes(paths.accepted).equals(bytes)
      insist(!acceptedNow || checked.equalityPassed, 'a non-reproducing replay became accepted')
      const fourth = row.observation?.acquisition === 'fourth'
      if (existsSync(paths.classification)) {
        const { paths: unusedPaths, row: unusedRow, ...expected } = checked
        insist(same(snap.read(paths.classification), expected), 'saved fourth classification is stale')
      }
      const outcome = checked.outcome === 'accepted' && !acceptedNow ? 'matching-unaccepted' : checked.outcome
      insist(OUTCOMES.includes(outcome), 'unknown acquisition outcome')
      const item = { ordinal, attempt, fourth, outcome, equalityPassed: checked.equalityPassed,
        failureKind: checked.failureKind ?? null, acceptedNow, row,
        observationSha256: sha(bytes), classificationPresent: existsSync(paths.classification),
        classification: checked.diagnosis, processTiming: null }
      attempts.push(item); produced.push(item)
      if (attempt === 1) firsts.push(row)
      if (acceptedNow) accepted.push(row)
    }
    if (existsSync(firstPaths.accepted))
      insist(produced.filter(row => row.acceptedNow).length === 1,
        'accepted bytes do not match exactly one prescribed observation')
  }
  insist(accepted.length === acceptedNames.length && accepted.length >= preserved.report.acquisition.acceptedGames,
    'the accepted checkpoint lost or gained an unexplained replay')
  const expectedComplete = { schema: 'second-look-fresh-fourth-acquisition-complete/1',
    amendmentSha256: identity.amendmentSha256, codeSha256: identity.codeSha256,
    observations: [], files: {} }
  let completedManifestSha256 = null
  const completePath = join(FOURTH, 'completed-manifest.json')
  if (existsSync(completePath)) {
    insist(accepted.length === identity.inputs.cases.length, 'completed manifest lacks all accepted games')
    const privateExecutionRoot = join(bound.executionRoot, 'private/second-look-fresh')
    for (let ordinal = 1; ordinal <= identity.inputs.cases.length; ordinal++) {
      const first = attempts.find(a => a.ordinal === ordinal && a.attempt === 1)
      const chosen = attempts.find(a => a.ordinal === ordinal && a.acceptedNow)
      insist(first && chosen, 'completed acquisition has a missing prescribed observation')
      expectedComplete.observations.push({ ordinal, firstOutcome: first.outcome, acceptedAttempt: chosen.attempt })
      for (const attempt of chosen.attempt === 1 ? [1] : [1, 2]) {
        const paths = helper.pathsFor(identity.inputs, ordinal, attempt)
        for (const path of [paths.observation, paths.accepted, paths.canonical, paths.classification]) {
          insist(existsSync(path), 'complete acquisition is missing a required file')
          const key = relative(privateExecutionRoot, path)
          insist(!key.startsWith('../'), 'completed input is outside the private root')
          expectedComplete.files[key] = sha(snap.bytes(path))
        }
      }
    }
    const bytes = snap.bytes(completePath)
    insist(same(canonicalKeys(JSON.parse(bytes)), canonicalKeys(expectedComplete)),
      'completed acquisition manifest differs from the exact reconstructed set')
    completedManifestSha256 = sha(bytes)
  }
  const rows = [...preserved.report.rows.slice(0, -1),
    { arm: 'candidate', profile: 'routine', acquisition: 'rebuilt-current-accepted',
      ...summarizeAcquisitionCell(canonical, accepted, isExactScore) }]
  insist(rows.length === 7, 'the seven prescribed acquisition cells are required')
  const fourthAttempts = attempts.filter(a => a.fourth)
  const historicalSuspension = attempts.filter(a => !a.fourth && a.attempt === 1
    && a.failureKind === 'suspension' && a.outcome === 'infrastructure-failure')
  insist(historicalSuspension.length === 1 && historicalSuspension[0].classification.accepted === true
    && historicalSuspension[0].classification.aggregate.allRowsDownstream === true
    && historicalSuspension[0].classification.aggregate.deadlineEvidenceRequired === false,
  'the preserved sleep mismatch no longer qualifies under the fourth rule')
  const driver = driverEvidence(snap, code)
  for (const attempt of fourthAttempts) {
    const timings = driver.replayProcesses.filter(p => p.ordinal === attempt.ordinal && p.attempt === attempt.attempt)
    insist(timings.length <= 1, 'a prescribed attempt has multiple completed processes')
    attempt.processTiming = timings[0] ?? null
  }
  const missingAttempts = []
  for (const name of snap.names(join(FOURTH, 'driver-attempts')).filter(n => n.endsWith('-started.json'))) {
    const start = snap.read(join(FOURTH, 'driver-attempts', name))
    if (!fourthAttempts.some(a => a.ordinal === start.ordinal && a.attempt === start.attempt))
      missingAttempts.push({ ordinal: start.ordinal, attempt: start.attempt,
        startedAt: start.startedAt, outcome: 'started-without-output' })
  }
  const groups = ['fourth-first', 'fourth-retry'].map(group => attemptTiming(group,
    fourthAttempts.filter(a => (a.attempt === 1) === (group === 'fourth-first')), isExactScore))
  const referenceStage = driver.timing.find(r => r.group === 'reference-workers')
  const analysisStage = driver.timing.find(r => r.group === 'analysis')
  const comparePath = join(PROJECT, 'results/compare.json')
  const comparisonAvailable = existsSync(comparePath)
  if (!completedManifestSha256) insist(referenceStage.startedProcesses === 0 && analysisStage.startedProcesses === 0
    && !comparisonAvailable && !existsSync(join(ROOT, 'analysis-per-game.json'))
    && !existsSync(join(ROOT, 'reference/manifest.json')),
  'reference or comparison output preceded completed acquisition')
  let comparison = null, comparisonSha256 = null
  if (withComparison) {
    const lastAnalysis = driver.intervals.filter(r => r.group === 'analysis').at(-1)
    const lastReferences = ['reference-0', 'reference-1'].map(stage =>
      driver.intervals.filter(r => r.stage === stage).at(-1))
    insist(completedManifestSha256 && lastAnalysis?.exitCode === 0 && !lastAnalysis.terminated
      && lastReferences.every(row => row?.exitCode === 0 && !row.terminated)
      && comparisonAvailable, 'registered analysis has not completed successfully')
    const bytes = snap.bytes(comparePath), registered = JSON.parse(bytes)
    insist(registered.appCommit === identity.inputs.pin.commit
      && registered.recordsCommit === identity.inputs.pin.records
      && registered.casesSha256 === identity.inputs.manifest.casesSha256
      && registered.candidateSha256 === identity.inputs.candidate.candidateSha256
      && registered.games === identity.inputs.cases.length, 'registered comparison identity differs')
    for (const cell of rows.filter(r => r.acquisition !== 'original-superseded')) {
      const coverage = registered.coverage[cell.profile][cell.arm]
      insist(cell.observedMissingGames === 0 && cell.observedGames === coverage.games
        && cell.observedLooks === coverage.initialLooks
        && cell.observedGuardIncomplete === coverage.incompleteSecondLooks,
      'accepted completeness audit differs from the registered analysis')
    }
    comparisonSha256 = sha(bytes)
    comparison = { decision: registered.decision, gaps: registered.gaps, quality: registered.quality,
      coverage: registered.coverage, cost: registered.cost, reference: registered.reference }
  }
  const blocked = fourthAttempts.filter(a => a.outcome === 'blocked')
  const report = {
    schema: 'second-look-fresh-fourth-acquisition-report/1',
    appCommit: identity.inputs.pin.commit, recordsCommit: identity.inputs.pin.records,
    games: identity.inputs.cases.length, casesSha256: identity.inputs.manifest.casesSha256,
    candidateSha256: identity.inputs.candidate.candidateSha256,
    fourthAmendmentSha256: identity.amendmentSha256, fourthAmendmentCodeSha256: identity.codeSha256,
    frozenBindingSha256: bound.bindingSha256, secondStoppedManifestSha256: preserved.stoppedSha256,
    preservedSecondReportSha256: preserved.reportSha256,
    preservedSuspensionDiagnosticSha256: sha(suspensionBytes),
    reportingScriptSha256: sha(snap.bytes(fileURLToPath(import.meta.url))),
    complete: completedManifestSha256 !== null, completedManifestSha256,
    decidingMetricsRead: withComparison, comparisonAvailable, comparisonSha256, comparison,
    stoppedAtRegisteredAcquisitionGuard: blocked.length > 0 && driver.runs.at(-1)?.state === 'stopped',
    referenceProcessesStarted: referenceStage.startedProcesses, analysisProcessesStarted: analysisStage.startedProcesses,
    acquisition: { canonicalGames: canonical.length, initiallyAcceptedGames: preserved.report.acquisition.acceptedGames,
      acceptedGames: accepted.length, gamesWithoutAcceptedReplay: canonical.length - accepted.length,
      allProducedFirstOutputs: firsts.length, firstOutputsNotYetProduced: canonical.length - firsts.length,
      fourthProducedAttempts: fourthAttempts.length, fourthOutcomeCounts: publicOutcomes(fourthAttempts),
      fourthStartedWithoutOutput: missingAttempts.length,
      fourthAcceptedFirstOutputs: fourthAttempts.filter(a => a.attempt === 1 && a.acceptedNow).length,
      fourthAcceptedRetries: fourthAttempts.filter(a => a.attempt === 2 && a.acceptedNow).length,
      allAcceptedRetries: attempts.filter(a => a.attempt === 2 && a.acceptedNow).length,
      failedCallsAcrossFourthAttempts: callFailureCounts(fourthAttempts.map(a => a.row)),
      preservedFirstFailuresUnderFourthRule: Object.fromEntries(['human-policy', 'suspension']
        .map(kind => [kind, attempts.filter(a => !a.fourth && a.attempt === 1
          && a.outcome === 'infrastructure-failure' && a.failureKind === kind).length])),
      classifiedFailureKinds: Object.fromEntries(['human-policy', 'suspension']
        .map(kind => [kind, fourthAttempts.filter(a => a.failureKind === kind).length])),
      blockedFourthOutputs: blocked.length },
    rows, rebuiltAllProducedFirstOutputs: summarizeAcquisitionCell(canonical, firsts, isExactScore),
    preservedSuspension: {
      priorClassification: suspension.classification,
      downstream: suspension.downstream,
      observedCompleteness: suspension.observedCompleteness,
      power: suspension.power,
      clockComparison: suspension.clockComparison,
      fourthRule: { qualifiesForPrescribedRetry: true,
        deadlineEvidenceRequired: historicalSuspension[0].classification.aggregate.deadlineEvidenceRequired,
        documentedSleepIntervals: historicalSuspension[0].classification.aggregate.documentedSleepIntervals,
        differingRowsWhoseSearchSpansSuspension:
          historicalSuspension[0].classification.aggregate.rowsWhoseSearchSpansSuspension },
    },
    preservedTimingGroups: preserved.report.timingGroups,
    preservedClockComparison: preserved.report.clockComparison,
    fourthTimingGroups: groups,
    driver: { runs: driver.runs, stageTiming: driver.timing, quiet: driver.quiet, power: driver.power },
    limitations: [
      'Preserved earlier reports are checked by content hash and retain their original stopped counts and outcomes.',
      'The comparison cost summary uses accepted observations, including retained loaded firsts and any accepted retries. Timing groups here do not substitute quiet timings.',
      'The original candidate routine batch has missing raw replays. Their incompleteness remains unknown; saved app coverage.partial has a separate meaning.',
      'A pre-launch quiet and power gate does not reserve the machine or establish that the later run stayed quiet or awake.',
      'A recorded running state is the last saved state and does not establish process liveness.',
      'The registered comparison is copied only after complete acquisition and successful recorded registered analysis; this reporter computes no deciding estimate.',
    ],
  }
  const inputs = snap.finish()
  const finalIdentity = await helper.fourthIdentity()
  insist(finalIdentity.amendmentSha256 === identity.amendmentSha256
    && finalIdentity.codeSha256 === identity.codeSha256, 'frozen fourth identity changed during collection')
  report.inputSnapshotSha256 = sha(JSON.stringify(inputs))
  return { report, privateReport: {
    schema: 'second-look-fresh-private-fourth-acquisition-report/1',
    reportSha256: sha(json(report)), inputs, runs: driver.privateRuns,
    attempts: fourthAttempts.map(({ row, ...attempt }) => ({ ...attempt,
      measuredReviewSeconds: row.summary.seconds, measuredVerificationSeconds: row.summary.verifySeconds,
      reviewStartedAt: row.observation.startedAt, reviewEndedAt: row.observation.endedAt,
      failedCalls: row.calls.flatMap((call, order) => call.failed ? [{ order, ...call }] : []) })),
    preservedSuspensionClassification: historicalSuspension.map(({ row, ...attempt }) => attempt),
    startedWithoutOutput: missingAttempts,
  } }
}

export function fourthReportMarkdown(r) {
  const a = r.acquisition, q = r.driver.quiet, p = r.driver.power
  const s = r.preservedSuspension, sc = s.clockComparison
  const fixed = value => value == null ? 'unavailable' : value.toFixed(3)
  const outcome = counts => OUTCOMES.map(key => `${key}: ${counts[key]}`).join('; ')
  const state = r.stoppedAtRegisteredAcquisitionGuard ? 'Stopped at the registered acquisition guard. No further replay is prescribed.'
    : r.complete ? 'Every prescribed game has an accepted replay and the completed acquisition manifest is verified.'
      : 'Acquisition is not complete. The last recorded driver state is reported below.'
  const cells = r.rows.map(cell => `| ${cell.arm} ${cell.profile} | ${cell.acquisition} | ${cell.canonicalGames} | ${cell.savedPostTeachingGuardIncomplete}/${cell.savedPostTeachingDeep} | ${cell.savedAppCoveragePartial} | ${cell.observedGames} | ${cell.observedGuardIncomplete}/${cell.observedLooks} | ${cell.observedMissingGames} | ${cell.fullBatchObservedGuardIncomplete ?? 'unknown'} |`)
  const timing = [
    ...r.preservedTimingGroups.map(group => ({ ...group, label: `preserved: ${group.group}`,
      processSeconds: group.recordedIntervalMonotonicSeconds.sum,
      processCalendarSeconds: group.recordedIntervalCalendarSeconds.sum,
      clockLabel: group.intervalTimer })),
    ...r.fourthTimingGroups.map(group => ({ ...group, label: group.group,
      processSeconds: group.completedProcessClock.pythonMonotonicSeconds.sum,
      processCalendarSeconds: group.completedProcessClock.calendarSeconds.sum,
      clockLabel: 'Python process time.monotonic; completed processes only' })),
  ].map(group => `| ${group.label} | ${group.producedAttempts} | ${outcome(group.outcomes)} | ${fixed(group.measuredReviewSeconds.sum)} | ${fixed(group.observedLookSeconds.sum)} | ${fixed(group.observedLookDepth.median)} | ${group.observedGuardIncomplete}/${group.observedLooks} | ${fixed(group.processCalendarSeconds)} | ${fixed(group.processSeconds)} | ${group.clockLabel} |`)
  const stages = r.driver.stageTiming.map(stage =>
    `| ${stage.group} | ${stage.startedProcesses} | ${stage.finishedProcesses} | ${fixed(stage.calendarSeconds.sum)} | ${fixed(stage.monotonicSeconds.sum)} | ${stage.nonzeroExits} |`)
  const runs = r.driver.runs.map(run =>
    `| ${run.state} | ${run.startedAt} | ${run.endedAt ?? 'not recorded'} | ${fixed(run.finishedCalendarSeconds)} | ${fixed(run.finishedMonotonicSeconds)} | ${run.exitCode ?? 'not recorded'} |`)
  const currentClock = r.fourthTimingGroups.map(group => {
    const c = group.completedProcessClock
    return `| ${group.group} | ${c.processes} | ${fixed(c.calendarSeconds.sum)} | ${fixed(c.pythonMonotonicSeconds.sum)} | ${fixed(c.calendarMinusPythonMonotonicSeconds.sum)} | ${fixed(group.recordedReviewCalendarSeconds.sum)} | ${fixed(group.measuredReviewSeconds.sum)} |`
  })
  return `# Fourth acquisition report

Written by \`fourth-report.mjs\`. App \`${r.appCommit}\`; records \`${r.recordsCommit}\`; ${r.games} frozen games, cases SHA256 \`${r.casesSha256}\`. Fourth amendment SHA256 \`${r.fourthAmendmentSha256}\`; acquisition code SHA256 \`${r.fourthAmendmentCodeSha256}\`.

${state}

There were ${a.initiallyAcceptedGames} accepted games at the preserved checkpoint. There are now ${a.acceptedGames} accepted games and ${a.gamesWithoutAcceptedReplay} without accepted replays. ${a.allProducedFirstOutputs} first outputs exist and ${a.firstOutputsNotYetProduced} have not been produced. The fourth acquisition has produced ${a.fourthProducedAttempts} observations: ${outcome(a.fourthOutcomeCounts)}. ${a.fourthStartedWithoutOutput} launches have no produced output in this snapshot. It accepted ${a.fourthAcceptedFirstOutputs} first outputs and ${a.fourthAcceptedRetries} retries. Earlier accepted outputs retain their exact bytes.

The fourth rule recognizes ${a.preservedFirstFailuresUnderFourthRule['human-policy']} preserved first failure from human-policy fallback and ${a.preservedFirstFailuresUnderFourthRule.suspension} preserved first failure from suspension. These remain rejected observations. The preceding stopped report retains its original classifications; the fourth rule supplies eligibility for the prescribed retry.

The fourth traces record ${a.failedCallsAcrossFourthAttempts.failed} failed calls: ${a.failedCallsAcrossFourthAttempts.failedEngine} engine, ${a.failedCallsAcrossFourthAttempts.failedHumanPolicy} human-policy, and ${a.failedCallsAcrossFourthAttempts.failedOther} other calls. Classification of new fourth observations records ${a.classifiedFailureKinds['human-policy']} human-policy failures and ${a.classifiedFailureKinds.suspension} suspension failures. Failure messages, row locations and per-attempt outcomes remain in the private report.

The preserved suspension diagnosis accounts for ${s.downstream.differingPositionRows} changed position rows and ${s.downstream.differingRecordRows} changed record rows downstream of the adaptive search spanning the recorded suspension. Its raw trace has ${s.observedCompleteness.completeRawLooks}/${s.observedCompleteness.rawLooks} complete retained looks, ${s.observedCompleteness.differingCanonicalLatestReadings} differing canonical verification reading and ${s.observedCompleteness.failedCalls} failed calls. The logged Sleep event is ${s.power.sleepEventAt}; Wake is ${s.power.wakeEventAt}. The driver records ${sc.blockedNewProcesses.calendarSeconds.sum.toFixed(6)} UTC seconds and ${sc.blockedNewProcesses.pythonMonotonicSeconds.sum.toFixed(6)} Python monotonic seconds, a divergence of ${sc.blockedNewProcesses.calendarMinusPythonMonotonicSeconds.sum.toFixed(6)} seconds. The review records ${sc.blockedNewReviewNodePerformanceSeconds.sum.toFixed(6)} Node performance seconds.

The fourth rule qualifies this preserved first failure for its prescribed retry: ${s.fourthRule.documentedSleepIntervals} documented sleep interval is spanned by the search feeding ${s.fourthRule.differingRowsWhoseSearchSpansSuspension} differing row. It does not require proof of deadline termination. The third rule's deadline condition remains unproved, and that prior refusal and its diagnostic remain unchanged. Preserved diagnostic SHA256: \`${r.preservedSuspensionDiagnosticSha256}\`.

| Arm and profile | Acquisition | Saved games | Final deep incomplete / saved | App coverage.partial | Observed games | Raw incomplete / looks | Missing raw games | Full-batch raw incomplete |
|---|---|---:|---:|---:|---:|---:|---:|---:|
${cells.join('\n')}

Final deep evidence is saved after teaching. Raw evidence is captured before teaching. The app's coverage.partial counts a separate saved condition. Missing original raw replays remain unknown. Rejected first outputs are retained diagnostics; only an exactly reproducing prescribed observation enters the accepted set.

The earlier timing groups below are copied from the immutable stopped report, including its outcomes as known at that stop. The fourth groups describe new observations. The registered comparison cost summary uses accepted observations, including retained loaded firsts and accepted retries. These separate groups do not substitute quiet timings for loaded timings.

| Timing group | Observations | Outcomes | Node review seconds | Observed look seconds | Median retained depth | Raw incomplete / looks | Interval UTC seconds | Interval elapsed seconds | Elapsed clock |
|---|---:|---|---:|---:|---:|---:|---:|---:|---|
${timing.join('\n')}

| Fourth group | Finished processes | Driver UTC seconds | Driver Python seconds | UTC minus Python seconds | Review UTC seconds | Review Node seconds |
|---|---:|---:|---:|---:|---:|---:|
${currentClock.join('\n')}

The Python driver and Node review clocks are reported separately. The preserved blocked replay's driver interval remains ${fixed(r.preservedClockComparison.blockedNewProcesses.calendarSeconds.sum)} UTC seconds and ${fixed(r.preservedClockComparison.blockedNewProcesses.pythonMonotonicSeconds.sum)} Python seconds, a divergence of ${fixed(r.preservedClockComparison.blockedNewProcesses.calendarMinusPythonMonotonicSeconds.sum)} seconds. Its review records ${fixed(r.preservedClockComparison.blockedNewReviewNodePerformanceSeconds.sum)} Node seconds against ${fixed(r.preservedClockComparison.blockedNewReviewCalendarSeconds.sum)} review UTC seconds.

| Driver state | Started UTC | Ended UTC | Finished UTC seconds | Finished Python seconds | Exit |
|---|---|---|---:|---:|---:|
${runs.length ? runs.join('\n') : '| No recorded driver run | — | — | — | — | — |'}

| Stage | Started processes | Finished processes | UTC seconds summed | Python seconds summed | Nonzero exits |
|---|---:|---:|---:|---:|---:|
${stages.join('\n')}

Stage sums are process durations; parallel reference workers overlap. Awake assertions are lightweight guard processes and overlap the work they guard.

Quiet sampling has ${q.samples} samples and ${q.receipts} completed receipts. Completed waits total ${fixed(q.completedWaitSeconds.sum)} Python seconds and ${fixed(q.completedWaitCalendarSeconds.sum)} UTC seconds. ${q.recordedPendingWaits} waits remain recorded as pending, with ${fixed(q.pendingWaitMonotonicSecondsLowerBound.sum)} Python seconds and ${fixed(q.pendingWaitCalendarSecondsLowerBound.sum)} UTC seconds observed as lower bounds. Waits that ended before passing total ${fixed(q.endedBeforePassWaitSeconds.sum)} Python seconds. There were ${q.powerGateResets} resets at the final power gate.

Power sampling has ${p.readings} readings, ${p.readyReadings} ready readings and ${p.receipts} receipts. Every saved receipt checked readiness before quiet (${p.beforeQuietReadyReceipts}) and immediately before launch (${p.beforeLaunchReadyReceipts}). ${p.assertionVerificationEvents} awake-assertion checks were recorded. ${p.capturedReplayLogs} replay power logs were captured; ${p.failedReplayLogCaptures} captures failed. Their typed events contain ${p.replayPowerEventCounts.Sleep} Sleep, ${p.replayPowerEventCounts.Wake} Wake and ${p.replayPowerEventCounts.DarkWake} DarkWake events. Raw system output stays private. A pre-launch gate does not establish that later load stayed low or that no later suspension occurred.

${r.decidingMetricsRead
    ? `The unchanged registered analysis completed. Its comparison SHA256 is \`${r.comparisonSha256}\`. The copied decision is **${r.comparison.decision.disposition}**. No estimate was recomputed by this reporter.`
    : `This snapshot reads no deciding metric. Reference processes started: ${r.referenceProcessesStarted}; analysis processes started: ${r.analysisProcessesStarted}.`}

Preserved second report SHA256 \`${r.preservedSecondReportSha256}\`; second stopped manifest SHA256 \`${r.secondStoppedManifestSha256}\`; completed manifest SHA256 \`${r.completedManifestSha256 ?? 'not produced'}\`; report source SHA256 \`${r.reportingScriptSha256}\`; input snapshot SHA256 \`${r.inputSnapshotSha256}\`.
`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  insist(process.argv.length === 3 && ['--snapshot', '--after-analysis'].includes(process.argv[2]),
    'use --snapshot or --after-analysis')
  const { report, privateReport } = await collectFourthReport({ withComparison: process.argv[2] === '--after-analysis' })
  for (const [path, bytes] of [
    [join(PROJECT, 'results/fourth-acquisition.json'), json(report)],
    [join(PROJECT, 'results/fourth-acquisition.md'), fourthReportMarkdown(report)],
    [join(FOURTH, 'diagnostics/acquisition-report.json'), json(privateReport)],
  ]) {
    mkdirSync(dirname(path), { recursive: true })
    const temp = `${path}.${process.pid}.tmp`
    writeFileSync(temp, bytes); renameSync(temp, path)
  }
  console.log(JSON.stringify({ complete: report.complete, acquisition: report.acquisition,
    decidingMetricsRead: report.decidingMetricsRead }))
}
