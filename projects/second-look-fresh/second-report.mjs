// Descriptive reporting for the second acquisition amendment. This module
// starts no search, changes no acquisition artifact and reads no deciding metric.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { verifyFrozenRuntime } from './frozen-runtime.mjs'

const LAB = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')
const PROJECT = join(LAB, 'projects/second-look-fresh')
const ROOT = join(LAB, 'private/second-look-fresh')
const OLD = join(ROOT, 'acquisition-amended')
const NEW = join(ROOT, 'second-acquisition')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const insist = (ok, message) => { if (!ok) throw new Error(`second acquisition report: ${message}`) }
const finite = x => typeof x === 'number' && Number.isFinite(x) && x >= 0
const date = x => typeof x === 'string' && Number.isFinite(Date.parse(x))
const json = value => JSON.stringify(value, null, 2) + '\n'
const METHOD = new Set(['evaluate', 'bestMoves', 'scoreMove', 'newGame', 'tablebase',
  'humanPolicy', 'findability', 'compare'])
const STAGE = new Set(['sweep', 'verify', 'after-verification'])
const ENGINE = new Set(['evaluate', 'bestMoves', 'scoreMove', 'newGame', 'compare'])
export const REPORTED_LOAD_WINDOW = Object.freeze({
  start: '2026-10-20T09:00:00.000Z', end: '2026-10-20T10:40:00.000Z',
  source: 'Reviewer-reported outside heavy work, 02:00–03:40 America/Los_Angeles.',
})
const GROUPS = ['old-first-overlaps-reported-load', 'old-first-outside-reported-load',
  'new-quiet-first', 'new-quiet-retry']

// Python's UTC log timestamps retain microseconds. Date.parse alone truncates
// them to milliseconds and can round a reported clock gap the wrong way.
function utcNanoseconds(value) {
  const parts = /^(.+T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  insist(parts && date(value), 'invalid UTC timestamp')
  return BigInt(Date.parse(parts[1] + parts[3])) * 1000000n
    + BigInt((parts[2] ?? '').padEnd(9, '0'))
}
export function utcIntervalSeconds(start, end) {
  const elapsed = Number(utcNanoseconds(end) - utcNanoseconds(start)) / 1e9
  insist(elapsed >= 0, 'calendar interval ends before it starts')
  return elapsed
}

export function overlapsReportedLoad(start, end) {
  insist(date(start) && date(end) && Date.parse(end) >= Date.parse(start), 'invalid timing interval')
  return Date.parse(start) < Date.parse(REPORTED_LOAD_WINDOW.end)
    && Date.parse(end) > Date.parse(REPORTED_LOAD_WINDOW.start)
}

// The old logs bound each replay, rather than recording its exact start time.
// In particular, a boundary-straddling interval is conservatively an overlap.
export function preservedReplayWindows(rows) {
  const windows = new Map()
  let prior = null, desktopSummaries = 0, rejected = false
  for (const row of rows) {
    insist(date(row.at) && finite(row.seconds) && typeof row.line === 'string', 'invalid old log envelope')
    let parsed
    try { parsed = JSON.parse(row.line) } catch { /* Most log lines are plain text. */ }
    if (parsed?.variant === 'candidate' && parsed.profile === 'desktop'
      && Number.isInteger(parsed.completed) && Number.isInteger(parsed.resumed)) {
      desktopSummaries++
      prior = row
    }
    const ok = /^\[candidate\/routine\] case (\d+) timed; \d+s$/.exec(row.line)
    const bad = /^Error: timed review does not reproduce the CLI document at case (\d+); no timing kept$/.exec(row.line)
    if (!ok && !bad) continue
    const ordinal = Number((ok ?? bad)[1])
    insist(desktopSummaries === 2 && prior && !rejected && ordinal === windows.size + 1
      && Date.parse(row.at) >= Date.parse(prior.at) && row.seconds >= prior.seconds,
    'old first-replay timing sequence differs')
    windows.set(ordinal, {
      beginsAfter: prior.at, endsBy: row.at,
      calendarWindowSeconds: utcIntervalSeconds(prior.at, row.at),
      monotonicWindowSeconds: row.seconds - prior.seconds,
      exactReviewUtcBoundaries: false,
      overlapsReportedHeavyLoad: overlapsReportedLoad(prior.at, row.at),
    })
    prior = row
    rejected = !!bad
  }
  insist(windows.size === 50 && rejected, 'expected fifty preserved first-replay intervals')
  return windows
}

export function numericSummary(values, { allowNegative = false } = {}) {
  insist(values.every(x => typeof x === 'number' && Number.isFinite(x)
    && (allowNegative || x >= 0)), 'invalid timing or depth')
  if (!values.length) return { count: 0, sum: 0, mean: null, median: null, min: null, max: null }
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length
  const sum = values.reduce((a, b) => a + b, 0)
  return { count: n, sum, mean: sum / n,
    median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    min: sorted[0], max: sorted.at(-1) }
}

// Only fixed, nonsensitive method/stage names leave private traces.
export function callFailureCounts(rows) {
  const out = { calls: 0, failed: 0, failedEngine: 0, failedHumanPolicy: 0,
    failedOther: 0, failuresWithRetainedException: 0, failedByStageAndMethod: {} }
  for (const row of rows) for (const call of row.calls) {
    insist(METHOD.has(call.method) && STAGE.has(call.stage) && typeof call.failed === 'boolean',
      'unknown call instrumentation')
    out.calls++
    if (!call.failed) continue
    out.failed++
    if (ENGINE.has(call.method)) out.failedEngine++
    else if (call.method === 'humanPolicy') out.failedHumanPolicy++
    else out.failedOther++
    out.failuresWithRetainedException += Number(call.error != null)
    const key = `${call.stage}/${call.method}`
    out.failedByStageAndMethod[key] = (out.failedByStageAndMethod[key] ?? 0) + 1
  }
  return out
}

export function timingGroups(attempts, isComplete) {
  return GROUPS.map(group => {
    const rows = attempts.filter(a => a.group === group)
    const looks = rows.flatMap(a => a.row.looks)
    const depths = looks.map(l => l.depth ?? l.evidence.depth).filter(x => x != null)
    const outcomes = Object.fromEntries(['accepted', 'matching-unaccepted', 'infrastructure-failure', 'blocked']
      .map(outcome => [outcome, rows.filter(a => a.outcome === outcome).length]))
    return { group, producedAttempts: rows.length, outcomes,
      measuredReviewSeconds: numericSummary(rows.map(a => a.row.summary.seconds)),
      measuredVerificationSeconds: numericSummary(rows.map(a => a.row.summary.verifySeconds)),
      observedLookSeconds: numericSummary(looks.map(l => l.seconds)),
      observedLookDepth: numericSummary(depths), looksWithoutDepth: looks.length - depths.length,
      observedLooks: looks.length, observedGuardIncomplete: looks.filter(l => !isComplete(l.evidence)).length,
      recordedIntervalCalendarSeconds: numericSummary(rows.map(a => a.window.calendarWindowSeconds)),
      recordedIntervalMonotonicSeconds: numericSummary(rows.map(a => a.window.monotonicWindowSeconds)
        .filter(x => x != null)),
      intervalCalendarMinusRecordedTimerSeconds: numericSummary(rows
        .filter(a => a.window.monotonicWindowSeconds != null)
        .map(a => a.window.calendarWindowSeconds - a.window.monotonicWindowSeconds), { allowNegative: true }),
      intervalTimer: group.startsWith('old-') ? 'Python driver time.monotonic between log lines'
        : 'Node review performance.now',
      calls: callFailureCounts(rows.map(a => a.row)) }
  })
}

export function blockedDiagnosis(attempts) {
  const blocked = attempts.filter(a => !a.old && a.outcome === 'blocked')
  const fields = ['differingPositionRows', 'differingRecordRows', 'observedVerificationLooks',
    'completeObservedVerificationLooks', 'canonicalLatestVerificationReadingsEqual',
    'canonicalVerificationHistoriesEqualIgnoringStability', 'unresolvedDifferingRows']
  const aggregate = Object.fromEntries(fields.map(field => [field, 0]))
  for (const attempt of blocked) {
    insist(attempt.classification?.schema === 'second-look-fresh-human-fallback-classification/1',
      'blocked replay has no checked acquisition diagnosis')
    for (const field of fields) {
      const value = attempt.classification.aggregate[field]
      insist(Number.isInteger(value) && value >= 0, 'invalid blocked diagnostic count')
      aggregate[field] += value
    }
  }
  return { blockedOutputs: blocked.length,
    fallbackClassificationPassed: blocked.filter(a => a.classification.accepted).length,
    ...aggregate,
    canonicalLatestVerificationReadingsDifferent:
      aggregate.observedVerificationLooks - aggregate.canonicalLatestVerificationReadingsEqual,
    calls: callFailureCounts(blocked.map(a => a.row)) }
}

// Compare retained reading bytes only. This neither judges a move nor
// reimplements strongerEvidence; it cannot recover a discarded engine result.
export function retainedAdaptiveDiagnostic(attempts, canonicalDocuments) {
  const reading = evidence => evidence ? Object.fromEntries(Object.entries(evidence)
    .filter(([key]) => !['history', 'stability'].includes(key))) : null
  const privateRows = [], longCalls = []
  for (const attempt of attempts.filter(a => !a.old)) {
    const canonical = canonicalDocuments[attempt.ordinal - 1]
    const nodes = canonical.provenance.verifyNodes
    for (const [order, call] of attempt.row.calls.entries()) {
      if (call.seconds <= 120) continue
      insist(date(call.startedAt) && date(call.endedAt), 'long new call has no UTC timing')
      longCalls.push({ ordinal: attempt.ordinal, attempt: attempt.attempt, order, ...call,
        adaptiveVerification: call.stage === 'verify' && call.method === 'bestMoves'
          && call.budget?.nodes === nodes * 2,
        returnedPayloadSaved: ['result', 'lines', 'score', 'complete', 'partial', 'status']
          .some(key => Object.hasOwn(call, key)),
        calendarSeconds: utcIntervalSeconds(call.startedAt, call.endedAt) })
    }
    if (attempt.outcome !== 'blocked') continue
    for (const [lookOrder, look] of attempt.row.looks.entries()) {
      const deep = canonical.positions[look.index].deep
      const chain = [...(deep?.history ?? []), deep].filter(Boolean)
      const verification = chain.filter(e => [nodes, nodes * 2].includes(e.searchBudget?.nodes))
      const latest = verification.at(-1)
      if (same(reading(latest), reading(look.evidence))) continue
      const adaptiveCalls = attempt.row.calls.filter(call => call.index === look.index
        && call.stage === 'verify' && call.method === 'bestMoves' && call.budget?.nodes === nodes * 2)
      const initial = verification.find(e => e.searchBudget?.nodes === nodes)
      privateRows.push({ ordinal: attempt.ordinal, attempt: attempt.attempt,
        lookOrderPrivate: lookOrder, plyIndexPrivate: look.index,
        rawRetainedNodes: look.evidence.searchBudget?.nodes ?? null,
        canonicalLatestVerificationNodes: latest?.searchBudget?.nodes ?? null,
        rawEqualsCanonicalInitialVerificationReading: same(reading(initial), reading(look.evidence)),
        rawRetainsInitialBudget: look.evidence.searchBudget?.nodes === nodes,
        canonicalRetainsAdaptiveBudget: latest?.searchBudget?.nodes === nodes * 2,
        adaptiveBestMovesCalls: adaptiveCalls.length,
        adaptiveCallsOverCutoff: adaptiveCalls.filter(c => c.seconds > 120).length,
        discardedAdaptivePayloadSaved: adaptiveCalls.some(call =>
          ['result', 'lines', 'score', 'complete', 'partial', 'status'].some(key => Object.hasOwn(call, key))),
      })
    }
  }
  return { aggregate: {
    differingRawVerificationReadings: privateRows.length,
    rawEqualsCanonicalInitialVerificationReading: privateRows
      .filter(r => r.rawEqualsCanonicalInitialVerificationReading).length,
    rawRetainsInitialBudget: privateRows.filter(r => r.rawRetainsInitialBudget).length,
    canonicalRetainsAdaptiveBudget: privateRows.filter(r => r.canonicalRetainsAdaptiveBudget).length,
    rawRetainedNodeBudgets: [...new Set(privateRows.map(r => r.rawRetainedNodes))],
    canonicalLatestVerificationNodeBudgets: [...new Set(privateRows.map(r => r.canonicalLatestVerificationNodes))],
    differingRowsWithRecordedAdaptiveBestMoves: privateRows.filter(r => r.adaptiveBestMovesCalls > 0).length,
    differingRowsWithAdaptiveCallOverCutoff: privateRows.filter(r => r.adaptiveCallsOverCutoff > 0).length,
    differingRowsWithDiscardedAdaptivePayloadSaved: privateRows.filter(r => r.discardedAdaptivePayloadSaved).length,
    longCallCutoffSeconds: 120,
    cutoffPurpose: 'Descriptive call-timing audit only; no acquisition or study decision.',
    allNewCallsOverCutoff: longCalls.length,
    adaptiveVerificationCallsOverCutoff: longCalls.filter(c => c.adaptiveVerification).length,
    failedCallsOverCutoff: longCalls.filter(c => c.failed).length,
    callsOverCutoffWithReturnedPayloadSaved: longCalls.filter(c => c.returnedPayloadSaved).length,
    longCallNodeBudgets: [...new Set(longCalls.map(c => c.budget?.nodes ?? null))],
    longCallNodePerformanceSeconds: numericSummary(longCalls.map(c => c.seconds)),
    longCallCalendarSeconds: numericSummary(longCalls.map(c => c.calendarSeconds)),
    firstLongCallStartedAt: longCalls.length ? longCalls.map(c => c.startedAt).sort()[0] : null,
    lastLongCallEndedAt: longCalls.length ? longCalls.map(c => c.endedAt).sort().at(-1) : null,
    rejectionConditionKnown: false,
  }, privateRows, privateLongCalls: longCalls }
}

function processClockSummary(rows) {
  return { processes: rows.length,
    firstStartedAt: rows.length ? rows.map(r => r.startedAt).sort()[0] : null,
    lastEndedAt: rows.length ? rows.map(r => r.endedAt).sort().at(-1) : null,
    calendarSeconds: numericSummary(rows.map(r => r.calendarSeconds)),
    pythonMonotonicSeconds: numericSummary(rows.map(r => r.seconds)),
    calendarMinusPythonMonotonicSeconds: numericSummary(rows.map(r => r.calendarSeconds - r.seconds),
      { allowNegative: true }) }
}

// Reading live logs can race a writer. Capture each input once and refuse the
// report if a captured file or inventory changes before the collection ends.
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
    const found = existsSync(path) ? readdirSync(local(path)).sort() : []
    directories.set(path, found)
    return found
  }
  return {
    bytes, read: path => JSON.parse(bytes(path)),
    lines: path => {
      const text = bytes(path).toString()
      // A live writer may have started its final JSONL line. Its prefix remains
      // hashed but is not a complete observation.
      return text.slice(0, text.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(JSON.parse)
    },
    names,
    finish() {
      for (const [path, expected] of directories)
        insist(same(existsSync(path) ? readdirSync(local(path)).sort() : [], expected),
          'input inventory changed during collection; collect a fresh snapshot')
      for (const [path, expected] of files)
        insist(readFileSync(local(path)).equals(expected), 'input changed during collection; collect a fresh snapshot')
      return Object.fromEntries([...files].map(([path, data]) => [relative(LAB, path), sha(data)]).sort())
    },
  }
}

function stageGroup(stage) {
  if (/^game-\d\d-attempt-[12]$/.test(stage)) return 'replay-processes'
  if (/^reference-[01]$/.test(stage)) return 'reference-workers'
  insist(['frozen-runtime', 'prepare', 'next', 'classify', 'check-complete', 'analysis'].includes(stage),
    'unknown driver stage')
  return stage === 'analysis' ? 'analysis' : 'acquisition-helpers'
}

function driverEvidence(snap, code) {
  const root = join(NEW, 'run-log')
  const runs = [], privateRuns = [], intervals = [], quietWaits = [], unpassedWaits = [], startedStages = []
  for (const name of snap.names(root).filter(n => n.endsWith('-run.json'))) {
    const meta = snap.read(join(root, name))
    insist(meta.schema === 'second-look-fresh-second-run/1'
      && ['running', 'finished'].includes(meta.status) && date(meta.startedAt), 'invalid driver metadata')
    for (const [path, digest] of Object.entries(meta.sourceSha256))
      insist(code.files[`projects/second-look-fresh/${path}`] === digest, 'driver source differs from frozen code')
    const events = snap.lines(join(root, name.replace('-run.json', '-events.jsonl')))
    const active = new Map(), waits = new Map()
    let lastSeconds = 0, lastAt = meta.startedAt
    for (const event of events) {
      insist(date(event.at) && finite(event.seconds) && event.seconds >= lastSeconds
        && Date.parse(event.at) >= Date.parse(lastAt), 'invalid driver event ordering')
      lastSeconds = event.seconds; lastAt = event.at
      if (event.event === 'child-started') {
        insist(!active.has(event.pid), 'duplicate active child')
        stageGroup(event.stage)
        startedStages.push(event.stage)
        active.set(event.pid, event)
      } else if (['child-finished', 'child-terminated'].includes(event.event)) {
        const begin = active.get(event.pid)
        insist(begin?.stage === event.stage && finite(event.elapsedSeconds), 'child timing has no matching start')
        intervals.push({ group: stageGroup(event.stage), stage: event.stage, seconds: event.elapsedSeconds,
          startedAt: begin.at, endedAt: event.at,
          calendarSeconds: utcIntervalSeconds(begin.at, event.at),
          terminated: event.event === 'child-terminated', exitCode: event.exitCode })
        active.delete(event.pid)
      } else if (event.event === 'quiet-started') {
        waits.set(`${event.ordinal}/${event.attempt}`, event)
      } else if (event.event === 'quiet-passed') {
        const key = `${event.ordinal}/${event.attempt}`, begin = waits.get(key)
        insist(begin && finite(event.quietSeconds) && event.quietSeconds >= 300, 'quiet passage has no matching wait')
        quietWaits.push(event.seconds - begin.seconds); waits.delete(key)
      } else insist(['replay-classified', 'wrapper-stopped', 'wrapper-interrupted'].includes(event.event),
        'unknown driver event')
    }
    if (meta.status === 'finished') insist(date(meta.endedAt) && finite(meta.seconds)
      && meta.seconds >= lastSeconds && Date.parse(meta.endedAt) >= Date.parse(lastAt), 'invalid driver end')
    const state = meta.status === 'finished' ? (meta.exitCode === 0 ? 'finished-successfully' : 'stopped')
      : waits.size ? 'recorded-waiting-for-quiet'
        : [...active.values()].some(e => stageGroup(e.stage) === 'replay-processes') ? 'recorded-replay-running'
          : [...active.values()].some(e => stageGroup(e.stage) === 'reference-workers') ? 'recorded-reference-running'
            : [...active.values()].some(e => e.stage === 'analysis') ? 'recorded-analysis-running'
              : 'recorded-running-between-steps'
    runs.push({ state, startedAt: meta.startedAt, endedAt: meta.endedAt ?? null,
      observedThrough: meta.endedAt ?? lastAt, exitCode: meta.exitCode ?? null,
      finishedMonotonicSeconds: meta.status === 'finished' ? meta.seconds : null,
      observedMonotonicSeconds: meta.status === 'finished' ? meta.seconds : lastSeconds,
      pendingQuietWindows: meta.status === 'running' ? waits.size : 0,
      endedBeforeQuietPass: meta.status === 'finished' ? waits.size : 0 })
    for (const wait of waits.values()) unpassedWaits.push({ wait, metadata: meta })
    privateRuns.push({ metadata: name, state, activeChildren: [...active.values()],
      pendingQuietWindows: [...waits.values()] })
  }
  const samples = [], samplesByAttempt = new Map()
  let receipts = 0
  for (const name of snap.names(join(NEW, 'quiet'))) {
    if (name.endsWith('-receipt.json')) {
      snap.bytes(join(NEW, 'quiet', name)); receipts++
    } else if (name.endsWith('-samples.jsonl')) {
      const rows = snap.lines(join(NEW, 'quiet', name))
      const key = /^game-(\d\d)-attempt-([12])-samples\.jsonl$/.exec(name)
      insist(key, 'unknown quiet-sample filename')
      samplesByAttempt.set(`${Number(key[1])}/${Number(key[2])}`, rows.filter(r => r.event === 'sample'))
      for (const row of rows) {
        if (row.event === 'sample') samples.push(row)
        else insist(row.event === 'passed', 'unknown quiet log event')
      }
    }
  }
  samples.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const latest = samples.at(-1)
  const reasons = new Set(['process-scan-failed', 'load-read-failed', 'load-unavailable', 'sample-collection-too-slow',
    'process-inventory-unavailable', 'blocking-process-present', 'load-not-below-limit',
    'clock-did-not-advance', 'sampling-gap', 'clock-drift-or-suspension'])
  const resetCounts = {}
  for (const row of samples) {
    insist(date(row.at) && Array.isArray(row.resetReasons), 'invalid quiet sample')
    for (const reason of row.resetReasons) {
      insist(reasons.has(reason), 'unknown quiet reason; keep it private until reviewed')
      resetCounts[reason] = (resetCounts[reason] ?? 0) + 1
    }
  }
  const pendingWaits = [], endedWaits = []
  for (const { wait, metadata } of unpassedWaits) {
    if (metadata.status === 'finished') {
      endedWaits.push({ monotonicSeconds: metadata.seconds - wait.seconds,
        calendarSeconds: utcIntervalSeconds(wait.at, metadata.endedAt) })
      continue
    }
    const rows = (samplesByAttempt.get(`${wait.ordinal}/${wait.attempt}`) ?? [])
      .filter(s => Date.parse(s.at) >= Date.parse(wait.at))
    pendingWaits.push({
      calendarSecondsLowerBound: rows.length
        ? utcIntervalSeconds(wait.at, rows.at(-1).at) : 0,
      // The first sample follows the wait-start event. The sample-to-sample
      // duration is therefore a lower bound on the whole unfinished wait.
      monotonicSecondsLowerBound: rows.length
        ? rows.at(-1).monotonicSeconds - rows[0].monotonicSeconds : 0,
    })
  }
  return { runs, privateRuns,
    replayProcesses: intervals.filter(x => x.group === 'replay-processes').map(row => {
      const match = /^game-(\d\d)-attempt-([12])$/.exec(row.stage)
      return { ...row, ordinal: Number(match[1]), attempt: Number(match[2]) }
    }),
    timing: ['acquisition-helpers', 'replay-processes', 'reference-workers', 'analysis']
    .map(group => {
      const rows = intervals.filter(x => x.group === group)
      return { group, startedProcesses: startedStages.filter(stage => stageGroup(stage) === group).length,
        finishedProcesses: rows.length,
        monotonicSeconds: numericSummary(rows.map(x => x.seconds)),
        calendarSeconds: numericSummary(rows.map(x => x.calendarSeconds)),
        calendarSpanSeconds: rows.length ? utcIntervalSeconds(rows.map(x => x.startedAt).sort()[0],
          rows.map(x => x.endedAt).sort().at(-1)) : null,
        nonzeroExits: rows.filter(x => x.exitCode !== 0).length }
    }),
    quiet: { samples: samples.length, receipts, resetCounts,
      completedWaitSeconds: numericSummary(quietWaits),
      endedBeforePassWaitSeconds: numericSummary(endedWaits.map(w => w.monotonicSeconds)),
      endedBeforePassCalendarSeconds: numericSummary(endedWaits.map(w => w.calendarSeconds)),
      recordedPendingWaits: pendingWaits.length,
      pendingWaitMonotonicSecondsLowerBound: numericSummary(pendingWaits.map(w => w.monotonicSecondsLowerBound)),
      pendingWaitCalendarSecondsLowerBound: numericSummary(pendingWaits.map(w => w.calendarSecondsLowerBound)),
      latestSample: latest ? { at: latest.at, load1: latest.load1,
        blockingProcesses: latest.blockingProcesses, quietSeconds: latest.quietSeconds,
        passed: latest.passed, resetReasons: latest.resetReasons } : null } }
}

export async function collectSecondReport() {
  const bound = verifyFrozenRuntime()
  insist(bound.sourceRoot === LAB && process.env.CHESS_DIR
    && realpathSync(process.env.CHESS_DIR) === join(LAB, '.cache/chess', bound.pin.commit),
  'run from this clone with CHESS_DIR set to the original frozen app')
  const bridge = await import(pathToFileURL(join(bound.executionRoot, 'bridge/lib/chess.mjs')).href)
  const { isExactScore } = await bridge.chess('src/core/score/index.ts')
  const helper = await import(pathToFileURL(join(bound.executionRoot, 'projects/second-look-fresh/second-amendment.mjs')).href)
  const { guardComplete, summarizeAcquisitionCell } = await import(
    pathToFileURL(join(bound.executionRoot, 'projects/second-look-fresh/acquisition-report.mjs')).href)
  const identity = await helper.secondIdentity()
  const snap = snapshot()
  snap.names(NEW)
  const code = snap.read(join(PROJECT, 'second-amendment-code.json'))
  const manifest = snap.read(join(PROJECT, 'second-amendment-manifest.json'))
  insist(sha(snap.bytes(join(PROJECT, 'second-amendment-code.json'))) === identity.codeSha256
    && sha(snap.bytes(join(PROJECT, 'second-amendment-manifest.json'))) === identity.amendmentSha256,
  'acquisition identity changed during collection')
  const diagnosticBytes = snap.bytes(join(PROJECT, manifest.diagnostic.path))
  insist(sha(diagnosticBytes) === manifest.diagnostic.sha256, 'preserved diagnosis changed')
  const diagnostic = JSON.parse(diagnosticBytes)
  const stopped = snap.read(join(OLD, 'stopped-manifest.json'))
  insist(same(stopped, identity.stopped), 'stopped snapshot differs')
  const oldRunRoot = join(ROOT, 'run-log')
  const oldRuns = snap.names(oldRunRoot).filter(n => n.endsWith('-run.json'))
    .map(name => ({ name, meta: snap.read(join(oldRunRoot, name)) }))
    .filter(r => r.meta.command.includes('projects/second-look-fresh/phase2-amended.sh'))
  insist(oldRuns.length === 1, 'preserved amended run set differs')
  const oldLog = join(oldRunRoot, oldRuns[0].name.replace('-run.json', '-output.jsonl'))
  insist(sha(snap.bytes(oldLog)) === diagnostic.originalAmendedRunLogSha256, 'preserved run log changed')
  const oldWindows = preservedReplayWindows(snap.lines(oldLog))
  const attempts = [], missingAttempts = [], accepted = [], firsts = [], preAccepted = []
  const canonical = []
  const knownNames = identity.inputs.cases.map(c => `${c.id}.json`)
  const firstNames = new Set(Object.keys(stopped.files).filter(p => p.startsWith('first-replays/'))
    .map(p => p.split('/').at(-1)))
  const acceptedBefore = new Set(Object.keys(stopped.files).filter(p => p.startsWith('candidate/timed/routine/'))
    .map(p => p.split('/').at(-1)))
  insist(same(snap.names(join(OLD, 'first-replays')).filter(n => n.endsWith('.json')),
    [...firstNames].sort()), 'preserved first-output namespace differs')
  insist(same(snap.names(join(OLD, 'candidate/evidence/routine')).filter(n => n.endsWith('.json')),
    [...knownNames].sort()), 'preserved canonical namespace differs')
  for (const [dir, allowed] of [
    [join(OLD, 'candidate/timed/routine'), knownNames],
    [join(NEW, 'replays/first'), knownNames.filter(n => !firstNames.has(n))],
    [join(NEW, 'replays/retry'), knownNames],
  ]) insist(snap.names(dir).filter(n => n.endsWith('.json')).every(n => allowed.includes(n)),
    'an observation namespace contains an unknown game')
  snap.names(join(NEW, 'classifications'))
  const markerNames = snap.names(join(NEW, 'driver-attempts'))
  for (let ordinal = 1; ordinal <= identity.inputs.cases.length; ordinal++) {
    const paths = helper.pathsFor(identity.inputs, ordinal, 1)
    canonical.push(snap.read(paths.canonical))
    const produced = []
    for (const attempt of [1, 2]) {
      const current = helper.pathsFor(identity.inputs, ordinal, attempt)
      const label = `game-${String(ordinal).padStart(2, '0')}-attempt-${attempt}`
      const marker = join(NEW, 'driver-attempts', `${label}-started.json`)
      const finish = join(NEW, 'driver-attempts', `${label}-finished.json`)
      const started = existsSync(marker) ? snap.read(marker) : null
      if (started) insist(started.ordinal === ordinal && started.attempt === attempt
        && date(started.startedAt), 'attempt start identity differs')
      if (!existsSync(current.observation)) {
        if (started) missingAttempts.push({ ordinal, attempt, outcome: 'started-without-output',
          startedAt: started.startedAt })
        insist(!existsSync(finish), 'finished attempt has no journal')
        continue
      }
      const bytes = snap.bytes(current.observation), row = JSON.parse(bytes)
      const checked = helper.inspectObservation(identity, ordinal, attempt)
      insist(checked.observationSha256 === sha(bytes), 'observation changed while checking')
      const old = attempt === 1 && firstNames.has(knownNames[ordinal - 1])
      insist(old ? !started : !!started, 'new observation lacks its start marker')
      if (attempt === 2) insist(produced[0]?.outcome === 'infrastructure-failure',
        'retry lacks a classified eligible first failure')
      const isAccepted = existsSync(paths.accepted) && snap.bytes(paths.accepted).equals(bytes)
      insist(!isAccepted || checked.equalityPassed, 'a rejected output became accepted')
      const outcome = checked.outcome === 'accepted' && !isAccepted ? 'matching-unaccepted' : checked.outcome
      if (existsSync(current.classification)) {
        const saved = snap.read(current.classification)
        const { paths: ignoredPaths, row: ignoredRow, ...expected } = checked
        insist(same(saved, expected), 'saved observation classification is stale')
      }
      if (existsSync(finish)) {
        const finished = snap.read(finish)
        insist(finished.ordinal === ordinal && finished.attempt === attempt
          && finished.quietReceiptSha256 === started.quietReceiptSha256
          && finished.classification?.outcome === checked.outcome
          && finished.classification?.equalityPassed === checked.equalityPassed,
        'finished observation marker differs')
      }
      const window = old ? oldWindows.get(ordinal) : {
        beginsAfter: row.observation.startedAt, endsBy: row.observation.endedAt,
        calendarWindowSeconds: utcIntervalSeconds(row.observation.startedAt, row.observation.endedAt),
        monotonicWindowSeconds: row.summary.seconds, exactReviewUtcBoundaries: true,
        overlapsReportedHeavyLoad: overlapsReportedLoad(row.observation.startedAt, row.observation.endedAt),
      }
      insist(window && finite(window.calendarWindowSeconds), 'observation has invalid timing bounds')
      const group = old ? (window.overlapsReportedHeavyLoad ? GROUPS[0] : GROUPS[1])
        : attempt === 1 ? GROUPS[2] : GROUPS[3]
      const item = { ordinal, attempt, old, group, outcome, equalityPassed: checked.equalityPassed,
        acceptedNow: isAccepted, row, window, observationSha256: sha(bytes),
        classification: checked.diagnosis }
      attempts.push(item); produced.push(item)
      if (isAccepted) accepted.push(row)
      if (attempt === 1) {
        firsts.push(row)
        if (acceptedBefore.has(knownNames[ordinal - 1])) {
          insist(old && checked.equalityPassed, 'a preserved accepted replay changed')
          preAccepted.push(row)
        }
      }
    }
    if (existsSync(paths.accepted))
      insist(produced.filter(x => x.acceptedNow).length === 1, 'accepted bytes have no unique matching prescribed journal')
  }
  insist(attempts.filter(a => a.old).length === 50 && preAccepted.length === 49,
    'preserved first/accepted counts changed')
  for (const name of markerNames)
    insist(/^game-(?:0[1-9]|[1-5]\d|60)-attempt-[12]-(?:started|finished)\.json$/.test(name),
      'unexpected driver attempt artifact')
  const completePath = join(NEW, 'completed-manifest.json')
  let completedManifestSha256 = null
  if (existsSync(completePath)) {
    const bytes = snap.bytes(completePath), complete = JSON.parse(bytes)
    insist(complete.schema === 'second-look-fresh-second-acquisition-complete/1'
      && complete.amendmentSha256 === identity.amendmentSha256 && complete.codeSha256 === identity.codeSha256
      && accepted.length === 60 && complete.observations.length === 60, 'completed acquisition identity differs')
    // Reconstruct the complete object exactly as the frozen helper does,
    // without invoking its writing operation. Length alone cannot exclude
    // a duplicated ordinal or an omitted file.
    const observations = [], files = {}
    for (let ordinal = 1; ordinal <= 60; ordinal++) {
      const first = attempts.find(a => a.ordinal === ordinal && a.attempt === 1)
      const found = attempts.find(a => a.ordinal === ordinal && a.acceptedNow)
      insist(first && found, 'completed acquisition has a missing prescribed output')
      observations.push({ ordinal, firstOutcome: first.outcome, acceptedAttempt: found.attempt })
      for (const attempt of found.attempt === 1 ? [1] : [1, 2]) {
        const p = helper.pathsFor(identity.inputs, ordinal, attempt)
        for (const path of [p.observation, p.accepted, p.canonical, p.classification]) {
          insist(existsSync(path), 'completed acquisition is missing a required file')
          files[relative(join(bound.executionRoot, 'private/second-look-fresh'), path)] = sha(snap.bytes(path))
        }
      }
    }
    insist(same(complete, { schema: 'second-look-fresh-second-acquisition-complete/1',
      amendmentSha256: identity.amendmentSha256, codeSha256: identity.codeSha256,
      observations, files }), 'completed acquisition manifest differs from its exact required contents')
    completedManifestSha256 = sha(bytes)
  }
  const oldCheckpointBytes = snap.bytes(join(ROOT, 'acquisition-original/manifest.json'))
  insist(sha(oldCheckpointBytes) === stopped.originalAcquisitionManifestSha256, 'original archive checkpoint changed')
  const oldCheckpoint = JSON.parse(oldCheckpointBytes)
  const rows = []
  for (const arm of ['baseline', 'candidate']) for (const profile of ['phone', 'desktop', 'routine']) {
    if (arm === 'candidate' && profile === 'routine') continue
    const docs = [], timed = []
    for (const name of knownNames) for (const kind of ['evidence', 'timed']) {
      const key = `${arm}/${kind}/${profile}/${name}`, bytes = snap.bytes(join(ROOT, key))
      insist(oldCheckpoint.files[key] === sha(bytes), 'a frozen acquisition input changed')
      ;(kind === 'evidence' ? docs : timed).push(JSON.parse(bytes))
    }
    rows.push({ arm, profile, acquisition: 'frozen', ...summarizeAcquisitionCell(docs, timed, isExactScore) })
  }
  const originalDocs = [], originalTimed = []
  for (const [path, digest] of Object.entries(oldCheckpoint.files)) {
    if (!/^candidate\/(?:evidence|timed)\/routine\//.test(path)) continue
    const bytes = snap.bytes(join(ROOT, 'acquisition-original', path))
    insist(sha(bytes) === digest, 'original routine archive changed')
    ;(path.includes('/evidence/') ? originalDocs : originalTimed).push(JSON.parse(bytes))
  }
  rows.push({ arm: 'candidate', profile: 'routine', acquisition: 'original-superseded',
    ...summarizeAcquisitionCell(originalDocs, originalTimed, isExactScore) })
  rows.push({ arm: 'candidate', profile: 'routine', acquisition: 'rebuilt-current-accepted',
    ...summarizeAcquisitionCell(canonical, accepted, isExactScore) })
  const groups = timingGroups(attempts, e => guardComplete(e, isExactScore))
  const newAttempts = attempts.filter(a => !a.old)
  // Read the continuously written quiet samples last, reducing the chance of
  // an otherwise consistent snapshot straddling the next five-second sample.
  const driver = driverEvidence(snap, code)
  for (const attempt of newAttempts) {
    const matched = driver.replayProcesses.filter(p => p.ordinal === attempt.ordinal && p.attempt === attempt.attempt)
    insist(matched.length <= 1, 'a prescribed attempt has multiple finished replay processes')
    attempt.processTiming = matched[0] ?? null
  }
  const blocked = blockedDiagnosis(attempts)
  const adaptive = retainedAdaptiveDiagnostic(attempts, canonical)
  insist(adaptive.aggregate.differingRawVerificationReadings
    === blocked.canonicalLatestVerificationReadingsDifferent, 'raw-reading diagnostic counts differ')
  const stoppedAtGuard = blocked.blockedOutputs > 0 && driver.runs.at(-1)?.state === 'stopped'
  const referencesStarted = driver.timing.find(s => s.group === 'reference-workers').startedProcesses
  const analysisStarted = driver.timing.find(s => s.group === 'analysis').startedProcesses
  const decidingOutputsAbsent = [join(PROJECT, 'results/compare.json'), join(PROJECT, 'results/compare.md'),
    join(ROOT, 'analysis-per-game.json'), join(ROOT, 'reference/manifest.json')].every(p => !existsSync(p))
  if (stoppedAtGuard) insist(referencesStarted === 0 && analysisStarted === 0 && decidingOutputsAbsent,
    'a reference or deciding analysis followed the blocked acquisition')
  const clocks = {
    newFirstProcesses: processClockSummary(newAttempts.filter(a => a.attempt === 1 && a.processTiming)
      .map(a => a.processTiming)),
    newRetryProcesses: processClockSummary(newAttempts.filter(a => a.attempt === 2 && a.processTiming)
      .map(a => a.processTiming)),
    blockedNewProcesses: processClockSummary(newAttempts.filter(a => a.outcome === 'blocked' && a.processTiming)
      .map(a => a.processTiming)),
    blockedNewReviewCalendarSeconds: numericSummary(newAttempts.filter(a => a.outcome === 'blocked')
      .map(a => a.window.calendarWindowSeconds)),
    blockedNewReviewNodePerformanceSeconds: numericSummary(newAttempts.filter(a => a.outcome === 'blocked')
      .map(a => a.row.summary.seconds)),
  }
  const report = {
    schema: 'second-look-fresh-second-acquisition-report/1',
    appCommit: bound.pin.commit, recordsCommit: bound.pin.records,
    games: identity.inputs.cases.length, casesSha256: identity.inputs.manifest.casesSha256,
    candidateSha256: identity.inputs.candidate.candidateSha256,
    designSha256: manifest.designSha256, firstAmendmentSha256: manifest.firstAmendmentSha256,
    secondAmendmentSha256: identity.amendmentSha256, secondAmendmentCodeSha256: identity.codeSha256,
    frozenBindingSha256: bound.bindingSha256, stoppedManifestSha256: manifest.stoppedManifestSha256,
    preservedDiagnosticSha256: manifest.diagnostic.sha256,
    reportingScriptSha256: sha(snap.bytes(fileURLToPath(import.meta.url))),
    completedManifestSha256,
    complete: completedManifestSha256 !== null,
    decidingMetricsRead: false,
    stoppedAtRegisteredAcquisitionGuard: stoppedAtGuard,
    furtherReplayAllowedUnderCurrentAmendment: blocked.blockedOutputs ? false : null,
    referenceProcessesStarted: referencesStarted, analysisProcessesStarted: analysisStarted,
    decidingOutputsAbsent,
    reportedHeavyLoadWindow: REPORTED_LOAD_WINDOW,
    driver: { runs: driver.runs, stageTiming: driver.timing, quiet: driver.quiet },
    acquisition: {
      canonicalGames: canonical.length, acceptedGames: accepted.length,
      gamesWithoutAcceptedReplay: canonical.length - accepted.length,
      preservedFirstOutputs: attempts.filter(a => a.old).length,
      allFirstOutputs: firsts.length, firstOutputsNotYetProduced: canonical.length - firsts.length,
      newProducedAttempts: newAttempts.length,
      newOutcomeCounts: Object.fromEntries(['accepted', 'matching-unaccepted', 'infrastructure-failure', 'blocked']
        .map(outcome => [outcome, newAttempts.filter(a => a.outcome === outcome).length])),
      newStartedWithoutOutput: missingAttempts.length,
      acceptedFirstOutputs: attempts.filter(a => a.attempt === 1 && a.acceptedNow).length,
      acceptedRetries: attempts.filter(a => a.attempt === 2 && a.acceptedNow).length,
      rejectedFirstOutputs: attempts.filter(a => a.attempt === 1 && !a.equalityPassed).length,
      failedCallsAcrossNewAttempts: callFailureCounts(newAttempts.map(a => a.row)),
    },
    rows,
    rebuiltBeforeSecondAmendment: summarizeAcquisitionCell(canonical, preAccepted, isExactScore),
    rebuiltAllProducedFirstOutputs: summarizeAcquisitionCell(canonical, firsts, isExactScore),
    timingGroups: groups,
    blockedDiagnosis: blocked,
    retainedAdaptiveDiagnostic: adaptive.aggregate,
    clockComparison: clocks,
    limitations: [
      'The reported outside-load window is supplied by the reviewer. Its overlap is descriptive and does not establish a failure cause.',
      'Old UTC intervals are log bounds, including process overhead. New UTC intervals are recorded review boundaries. Monotonic review and verification times remain separate.',
      'A running metadata record describes the last saved state; this report does not establish that its process is still alive.',
      'Missing raw replays remain unknown. Saved app coverage.partial and final post-teaching deep evidence have distinct meanings.',
      'A quiet gate describes the prescribed pre-launch interval; it does not reserve the machine or prove that later load stayed low.',
      'The Python driver and Node review use different elapsed-time clocks. A wall-clock gap does not uniquely identify suspension or the cause of a reproduction mismatch.',
      'Rejected first outputs remain diagnostic evidence. Only an exactly reproducing prescribed output can be an accepted replay.',
    ],
  }
  const inputs = snap.finish()
  const finalIdentity = await helper.secondIdentity()
  insist(finalIdentity.amendmentSha256 === identity.amendmentSha256
    && finalIdentity.codeSha256 === identity.codeSha256 && same(finalIdentity.stopped, stopped),
  'frozen acquisition dependencies changed during collection')
  report.inputSnapshotSha256 = sha(JSON.stringify(inputs))
  return { report, privateReport: {
    schema: 'second-look-fresh-private-second-acquisition-report/1',
    inputSnapshotSha256: report.inputSnapshotSha256, inputs, runs: driver.privateRuns,
    attempts: attempts.map(({ row, ...a }) => ({ ...a,
      measuredReviewSeconds: row.summary.seconds, measuredVerificationSeconds: row.summary.verifySeconds,
      failedCalls: row.calls.map((call, order) => ({ ...call, order }))
        .filter(call => call.failed).map(call => ({
          order: call.order, method: call.method, stage: call.stage, seconds: call.seconds,
          startedAt: call.startedAt ?? null, endedAt: call.endedAt ?? null, error: call.error ?? null,
        })) })),
    adaptiveRetentionPrivateRows: adaptive.privateRows,
    longCallsPrivate: adaptive.privateLongCalls,
    startedWithoutOutput: missingAttempts,
  } }
}

export function secondReportMarkdown(r) {
  const f = value => value === null ? 'unknown' : value.toFixed(3)
  const groupLabels = {
    'old-first-overlaps-reported-load': 'Preserved first; log window overlaps reported load',
    'old-first-outside-reported-load': 'Preserved first; log window outside reported load',
    'new-quiet-first': 'New quiet-gated first', 'new-quiet-retry': 'New quiet-gated retry',
  }
  const latest = r.driver.quiet.latestSample
  const blocked = r.blockedDiagnosis, clock = r.clockComparison.blockedNewProcesses
  const adaptive = r.retainedAdaptiveDiagnostic
  const guardText = r.stoppedAtRegisteredAcquisitionGuard
    ? `The registered exact-reproduction gate stopped acquisition. The blocked output does not qualify for the allowed human-policy fallback retry. No further replay or retry is allowed under the current amendment. Reference processes started: ${r.referenceProcessesStarted}; analysis processes started: ${r.analysisProcessesStarted}. The reference manifest and deciding outputs are absent. This is an acquisition stop, not a verdict on the candidate.`
    : ''
  const blockedText = blocked.blockedOutputs
    ? `Across ${blocked.blockedOutputs} blocked new outputs, ${blocked.differingPositionRows} position rows and ${blocked.differingRecordRows} record rows differ from their canonical documents. The completeness guard passes for ${blocked.completeObservedVerificationLooks}/${blocked.observedVerificationLooks} raw verification looks. ${blocked.canonicalLatestVerificationReadingsEqual}/${blocked.observedVerificationLooks} latest canonical verification readings match and ${blocked.canonicalLatestVerificationReadingsDifferent} differ. There are ${blocked.calls.failedEngine} failed engine calls, ${blocked.calls.failedHumanPolicy} failed human-policy calls and ${blocked.calls.failedOther} other failed calls. ${blocked.unresolvedDifferingRows} differing rows remain outside the registered teaching-fallback explanation. Complete evidence does not imply exact reproduction.`
    : ''
  const clockText = clock.processes
    ? `The ${clock.processes} blocked new process interval(s) run from ${clock.firstStartedAt} to ${clock.lastEndedAt}. Their summed UTC duration is ${f(clock.calendarSeconds.sum)} seconds; the Python driver's time.monotonic records ${f(clock.pythonMonotonicSeconds.sum)} seconds, a difference of ${f(clock.calendarMinusPythonMonotonicSeconds.sum)} seconds. Their retained Node review clocks record ${f(r.clockComparison.blockedNewReviewNodePerformanceSeconds.sum)} seconds, beside ${f(r.clockComparison.blockedNewReviewCalendarSeconds.sum)} seconds between the journal's UTC boundaries. Node review elapsed time and Python child elapsed time remain separate. These clock differences do not uniquely establish sleep or the cause of the changed reading.`
    : ''
  const adaptiveText = adaptive.differingRawVerificationReadings
    ? `For ${adaptive.rawEqualsCanonicalInitialVerificationReading}/${adaptive.differingRawVerificationReadings} differing raw verification readings, the replay's retained reading equals the canonical history's initial verification reading. The raw retained budget(s) are ${adaptive.rawRetainedNodeBudgets.join(', ')} nodes; the latest canonical verification budget(s) are ${adaptive.canonicalLatestVerificationNodeBudgets.join(', ')} nodes. ${adaptive.differingRowsWithRecordedAdaptiveBestMoves} differing rows have a recorded adaptive bestMoves call. Across all new attempts, ${adaptive.allNewCallsOverCutoff} calls exceed the descriptive ${adaptive.longCallCutoffSeconds}-second cutoff; ${adaptive.adaptiveVerificationCallsOverCutoff} are adaptive verification calls, and ${adaptive.failedCallsOverCutoff} failed. The long-call interval runs from ${adaptive.firstLongCallStartedAt} to ${adaptive.lastLongCallEndedAt}; its Node timer totals ${f(adaptive.longCallNodePerformanceSeconds.sum)} seconds and its UTC intervals total ${f(adaptive.longCallCalendarSeconds.sum)} seconds. The call budget(s) are ${adaptive.longCallNodeBudgets.join(', ')} nodes. The app's strongerEvidence can keep the preceding reading. Returned adaptive payloads were saved for ${adaptive.differingRowsWithDiscardedAdaptivePayloadSaved} differing rows, so the exact condition that rejected the adaptive evidence remains unknown. This timing cutoff decides nothing.`
    : ''
  return `# Second acquisition report

Written by \`second-report.mjs\`. This is an acquisition and timing report. No deciding metric was read.

App \`${r.appCommit}\`; records \`${r.recordsCommit}\`. Data: ${r.games} frozen games; cases SHA256 \`${r.casesSha256}\`. Candidate SHA256 \`${r.candidateSha256}\`.

Recorded driver state: ${r.driver.runs.at(-1)?.state ?? 'not started'}. Acquisition completion manifest: ${r.complete ? 'present and verified' : 'absent'}. There are ${r.acquisition.acceptedGames} accepted routine replays and ${r.acquisition.gamesWithoutAcceptedReplay} games without one. The preserved first-output count is ${r.acquisition.preservedFirstOutputs}; the total first-output count is ${r.acquisition.allFirstOutputs}. ${r.acquisition.acceptedRetries} retries are accepted. Rejected first outputs remain preserved.

The new attempts have produced ${r.acquisition.newProducedAttempts} outputs: ${r.acquisition.newOutcomeCounts.accepted} accepted, ${r.acquisition.newOutcomeCounts['matching-unaccepted']} matching but not yet copied to the accepted namespace, ${r.acquisition.newOutcomeCounts['infrastructure-failure']} eligible infrastructure failures and ${r.acquisition.newOutcomeCounts.blocked} blocking failures. ${r.acquisition.newStartedWithoutOutput} started attempts have no saved output. These counts do not turn a missing output into an incomplete look.

${guardText}

${blockedText}

The quiet gate has ${r.driver.quiet.samples} recorded samples and ${r.driver.quiet.receipts} receipts. ${latest ? `Its latest sample is ${latest.at}: load ${latest.load1}, ${latest.blockingProcesses?.npmVerifyPr ?? 'unknown'} npm verify processes and ${latest.blockingProcesses?.vitest ?? 'unknown'} Vitest processes, with ${f(latest.quietSeconds)} continuous quiet seconds.` : 'No quiet sample is recorded.'} A running record is a saved status, not proof that the process remains alive.

Completed quiet waits total ${f(r.driver.quiet.completedWaitSeconds.sum)} monotonic seconds across ${r.driver.quiet.completedWaitSeconds.count} passages. Waits that ended before passage total ${f(r.driver.quiet.endedBeforePassWaitSeconds.sum)} monotonic seconds. The ${r.driver.quiet.recordedPendingWaits} recorded pending waits have reached at least ${f(r.driver.quiet.pendingWaitMonotonicSecondsLowerBound.sum)} monotonic seconds and ${f(r.driver.quiet.pendingWaitCalendarSecondsLowerBound.sum)} calendar seconds. Pending values are lower bounds from saved samples, not a forecast. Waiting includes time before the continuous quiet interval began.

| Driver step | Started/finished processes | Process seconds, sum | Calendar seconds per process, sum | Calendar span from first start to last finish | Nonzero exits |
| --- | ---: | ---: | ---: | ---: | ---: |
${r.driver.stageTiming.map(s => `| ${s.group} | ${s.startedProcesses}/${s.finishedProcesses} | ${f(s.monotonicSeconds.sum)} | ${f(s.calendarSeconds.sum)} | ${f(s.calendarSpanSeconds)} | ${s.nonzeroExits} |`).join('\n')}

Process-time sums include both reference workers when they run together. Calendar spans include gaps between finished processes in the same step. Unfinished processes are not assigned a completed duration.

The reviewer reported heavy outside work from ${r.reportedHeavyLoadWindow.start} to ${r.reportedHeavyLoadWindow.end}. Every preserved first interval that overlaps that window is grouped below. Old intervals are bounded by log lines; new intervals use recorded review boundaries. Overlap is not proof of causation.

| Timing group | Produced attempts | Review seconds, sum | Verification seconds, sum | Look seconds, mean | Look depth, mean | Incomplete/all raw looks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${r.timingGroups.map(g => `| ${groupLabels[g.group]} | ${g.producedAttempts} | ${f(g.measuredReviewSeconds.sum)} | ${f(g.measuredVerificationSeconds.sum)} | ${f(g.observedLookSeconds.mean)} | ${f(g.observedLookDepth.mean)} | ${g.observedGuardIncomplete}/${g.observedLooks} |`).join('\n')}

| Timing group | Recorded interval UTC seconds, sum | Recorded elapsed seconds, sum | UTC minus elapsed seconds, sum | Elapsed timer |
| --- | ---: | ---: | ---: | --- |
${r.timingGroups.map(g => `| ${groupLabels[g.group]} | ${f(g.recordedIntervalCalendarSeconds.sum)} | ${f(g.recordedIntervalMonotonicSeconds.sum)} | ${f(g.intervalCalendarMinusRecordedTimerSeconds.sum)} | ${g.intervalTimer} |`).join('\n')}

${clockText}

${adaptiveText}

The registered comparison's cost summary uses accepted observations. ${r.acquisition.acceptedRetries > 0 ? 'Its accepted pool includes accepted retries and retained first outputs whose log windows overlap the reported load. The groups above keep these timings separate; quiet retry timings do not replace retained first-output timings.' : 'No retry has entered the accepted pool in this snapshot. The groups above keep retained first-output timings separate from new quiet first attempts and retries.'}

The new attempts contain ${r.acquisition.failedCallsAcrossNewAttempts.failedEngine} failed engine calls, ${r.acquisition.failedCallsAcrossNewAttempts.failedHumanPolicy} failed human-policy calls and ${r.acquisition.failedCallsAcrossNewAttempts.failedOther} other failed calls. Exception text and per-attempt rows remain private.

| Arm/profile and batch | Saved games | Final post-teaching incomplete/all | App coverage.partial | Accepted observed games | Raw incomplete/all | Games without accepted raw evidence | Full-batch raw incomplete |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${r.rows.map(c => `| ${c.arm}/${c.profile}, ${c.acquisition} | ${c.canonicalGames} | ${c.savedPostTeachingGuardIncomplete}/${c.savedPostTeachingDeep} | ${c.savedAppCoveragePartial} | ${c.observedGames} | ${c.observedGuardIncomplete}/${c.observedLooks} | ${c.observedMissingGames} | ${c.fullBatchObservedGuardIncomplete ?? 'unknown'} |`).join('\n')}

Before the second amendment, the rebuilt routine had ${r.rebuiltBeforeSecondAmendment.observedGames} accepted replays, containing ${r.rebuiltBeforeSecondAmendment.observedGuardIncomplete}/${r.rebuiltBeforeSecondAmendment.observedLooks} incomplete/all raw looks. All its produced first outputs, including rejected outputs, now contain ${r.rebuiltAllProducedFirstOutputs.observedGuardIncomplete}/${r.rebuiltAllProducedFirstOutputs.observedLooks} incomplete/all raw looks across ${r.rebuiltAllProducedFirstOutputs.observedGames} games. The original superseded routine still has ${r.rows.find(c => c.acquisition === 'original-superseded').observedMissingGames} games without raw replay evidence; their raw completeness remains unknown.

The completeness guard uses the app's exact-score instrument and the registered evidence conditions. Its counts describe retained verification events and cannot establish completeness of a discarded adaptive result. Saved app coverage.partial is reported separately. Final post-teaching evidence is not substituted for raw verification evidence.

Second amendment SHA256 \`${r.secondAmendmentSha256}\`; code manifest SHA256 \`${r.secondAmendmentCodeSha256}\`; preserved diagnosis SHA256 \`${r.preservedDiagnosticSha256}\`; frozen binding SHA256 \`${r.frozenBindingSha256}\`; stopped manifest SHA256 \`${r.stoppedManifestSha256}\`; reporting script SHA256 \`${r.reportingScriptSha256}\`; input snapshot SHA256 \`${r.inputSnapshotSha256}\`. No lab-branch commit identity is used.
`
}

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  writeFileSync(temp, value, { flag: 'wx' }); renameSync(temp, path)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  insist(process.argv.length === 3 && ['--snapshot', '--complete'].includes(process.argv[2]),
    'use --snapshot, or --complete after acquisition finishes')
  const { report, privateReport } = await collectSecondReport()
  if (process.argv[2] === '--complete') insist(report.complete, 'acquisition is not complete')
  write(join(ROOT, 'diagnostics/second-acquisition-report.json'), json(privateReport))
  write(join(PROJECT, 'results/second-acquisition.json'), json(report))
  write(join(PROJECT, 'results/second-acquisition.md'), secondReportMarkdown(report))
  console.log(JSON.stringify({ complete: report.complete,
    recordedState: report.driver.runs.at(-1)?.state ?? 'not started', ...report.acquisition }))
}
