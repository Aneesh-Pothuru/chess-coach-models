// Inspect by default. Only --resume authorizes one reviewed timeout-only restart.
// This operational helper does not change the frozen protocol or instruments.
//   node projects/maia-player-offsets/recover-review-timeouts.mjs
//   node projects/maia-player-offsets/recover-review-timeouts.mjs --resume
//   node projects/maia-player-offsets/recover-review-timeouts.mjs --report
import fs from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPriority } from 'node:os'

const project = dirname(fileURLToPath(import.meta.url)), lab = dirname(dirname(project))
const home = join(lab, 'private/maia-player-offsets'), stateFile = join(home, 'phase2-run.json')
const ownFile = relative(lab, fileURLToPath(import.meta.url)), launchFile = 'projects/maia-player-offsets/launch.py'
const manifestFile = 'projects/maia-player-offsets/protocol-manifest.json'
const inputFiles = ['positions.jsonl', 'games.json', 'held-cases.json', 'benchmark-cases.json', 'prepare.json']
const locks = ['phase2-run.lock', 'evidence-coordinator.lock', 'timeout-recovery.lock']
const args = process.argv.slice(2), mode = args[0] ?? '--inspect'
if (args.length > 1 || !['--inspect', '--resume', '--report'].includes(mode)) throw new Error('usage: recover-review-timeouts.mjs [--inspect|--resume|--report]')
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const hash = file => sha(fs.readFileSync(file))
const exists = file => fs.existsSync(file)
const now = () => new Date().toISOString()
const fail = message => { const error = new Error(message); error.safeOperationalMessage = true; throw error }
const assert = (condition, message) => { if (!condition) fail(message) }
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const atomic = (file, value) => {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); fs.renameSync(tmp, file)
}
const rows = file => {
  if (!exists(file)) return []
  const text = fs.readFileSync(file, 'utf8')
  assert(!text || text.endsWith('\n'), 'an operational journal has an incomplete final row; no restart authorized')
  return text.split('\n').filter(Boolean).map(JSON.parse)
}
const committedHash = file => sha(execFileSync('git', ['show', `HEAD:${file}`], { cwd: lab, stdio: ['ignore', 'pipe', 'ignore'] }))
const alive = pid => {
  if (!Number.isInteger(pid) || pid < 2) fail('an operational process identity is invalid')
  try { process.kill(pid, 0); return true } catch (e) { if (e.code === 'ESRCH') return false; throw e }
}
const groupAlive = pid => {
  try { process.kill(-pid, 0); return true } catch (e) { if (e.code === 'ESRCH') return false; throw e }
}
const marker = pid => {
  try { return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null }
  catch { return null }
}
const ownExecution = randomUUID(), ownedLocks = new Set()
function stopped(record, group = false) {
  assert(Number.isInteger(record.pid) && record.pid > 1 && typeof record.pidStarted === 'string' && record.pidStarted.length > 0, 'a recorded process identity is ambiguous')
  if (record.pid === process.pid && record.executionId === ownExecution) return
  if (!alive(record.pid)) {
    assert(!group || !groupAlive(record.pid), 'a recorded process group survives without its leader')
    return
  }
  const current = marker(record.pid)
  assert(current !== null, 'a live recorded process identity cannot be verified')
  assert(current !== record.pidStarted, 'a coordinator or worker is still running; inspection does not authorize a restart')
  // A different start marker proves PID reuse. Do not signal that process.
}
function requireStopped(state) {
  for (const name of locks) if (exists(join(home, name))) stopped(read(join(home, name)))
  for (const job of state.jobs ?? []) stopped(job, true)
  if (exists(join(home, 'phase2-launch.json'))) {
    const launched = read(join(home, 'phase2-launch.json'))
    assert(launched.pgid === launched.pid, 'the recorded launcher process group is ambiguous')
    stopped(launched, true)
  }
  const groups = new Map(rows(join(home, 'evidence-worker-groups.jsonl')).map(r => [`${r.pid}/${r.pidStarted}`, r]))
  for (const r of groups.values()) {
    stopped({ pid: r.coordinatorPid, pidStarted: r.coordinatorStarted })
    stopped(r, true)
  }
}
function provenance(state, requireOperationalCommit = false) {
  const pin = read(join(lab, 'bridge/chess.json')), manifest = read(join(lab, manifestFile))
  assert(state.schema === 'maia-player-offsets-run/2' && manifest.schema === 'maia-player-offsets-protocol/1', 'unexpected run or protocol schema')
  const manifestSha256 = hash(join(lab, manifestFile))
  assert(committedHash(manifestFile) === manifestSha256, 'the protocol manifest differs from committed content')
  assert(manifest.app === pin.commit && manifest.records === pin.records && state.snapshot.app === pin.commit && state.snapshot.records === pin.records, 'app or record pins changed')
  assert(equal(manifest.sources, state.snapshot.sources), 'the run source set differs from the frozen manifest')
  for (const [file, expected] of Object.entries(manifest.sources)) {
    assert(/^[a-f0-9]{64}$/.test(expected) && hash(join(lab, file)) === expected && committedHash(file) === expected, 'a frozen source differs from committed content')
  }
  assert(manifest.protocol?.file === 'projects/maia-player-offsets/protocol.md' && manifest.protocol.sha256 === manifest.sources[manifest.protocol.file], 'the frozen protocol text differs')
  assert(manifestSha256 === state.snapshot.protocolManifestSha256 && manifest.protocol.sha256 === state.snapshot.protocolSha256, 'the run protocol fingerprint differs')
  assert(equal(Object.keys(state.snapshot.inputs).sort(), [...inputFiles].sort()), 'unexpected prepared input set')
  for (const file of inputFiles) assert(hash(join(home, file)) === state.snapshot.inputs[file], 'a prepared input changed')
  const actualApp = execFileSync('git', ['-C', join(lab, '.cache/chess', pin.commit), 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  assert(actualApp === pin.commit, 'the cached app differs from the pin')
  const operationalSourceSha256 = Object.fromEntries([ownFile, launchFile].map(file => [file, hash(join(lab, file))]))
  if (requireOperationalCommit) for (const [file, expected] of Object.entries(operationalSourceSha256)) assert(committedHash(file) === expected, 'the recovery helper and launcher must be reviewed and committed before use')
  return { app: pin.commit, records: pin.records, protocolManifestSha256: manifestSha256,
    protocolSha256: manifest.protocol.sha256, sourceSha256: manifest.sources,
    inputSha256: state.snapshot.inputs, operationalSourceSha256 }
}
function preEffectReview(state) {
  assert(state.currentStage === 'reviews' && state.stages.reviews.status === 'failed' && state.status === 'failed', 'the review stage has not finished as a failed attempt')
  assert(state.stages['move-policies'].status === 'complete', 'move policies are not complete')
  for (const name of ['events', 'punish-policies', 'fit']) assert(state.stages[name]?.attempts?.length === 0, 'a later-stage attempt already exists; this helper cannot authorize recovery')
  for (const file of ['offsets.json', 'offsets.md']) assert(!exists(join(project, 'results', file)), 'a fit result exists; this helper cannot authorize recovery')
  assert(!exists(join(home, 'punish-events.json')), 'event extraction already wrote output; this helper cannot authorize recovery')
  const attempts = state.stages.reviews.attempts, attempt = attempts.at(-1)
  assert(attempt?.status === 'failed' && attempt.finishedAt && Number.isFinite(attempt.seconds), 'the current review attempt is unfinished or lacks a measured duration')
  const result = attempt.results?.[0]
  assert(attempt.results?.length === 1 && result.code === 1 && result.signal === null && result.spawnError === false && result.groupSurvives === false && result.ok === false, 'the review command did not finish with an ordinary evidence failure')
  assert(state.failure?.stage === 'reviews' && state.failure.reason === 'worker failed; details are in private logs', 'the current failure is not the expected review-command failure')
  const session = state.sessions.find(s => s.executionId === attempt.executionId)
  assert(session?.status === 'failed' && session.finishedAt && Number.isFinite(session.seconds), 'the failed review session is unfinished')
  return attempt
}
function timeoutProof(state, attempt, requireLatest = true) {
  const lower = Date.parse(attempt.startedAt), upper = Date.parse(attempt.finishedAt)
  assert(Number.isFinite(lower) && Number.isFinite(upper) && upper >= lower, 'invalid attempt timestamps')
  const within = at => Number.isFinite(Date.parse(at)) && Date.parse(at) >= lower && Date.parse(at) <= upper
  const batches = rows(join(home, 'evidence-runs.jsonl')).filter(r => r.mode === 'full' && within(r.startedAt) && within(r.finishedAt))
  assert(batches.length === 1, 'the review attempt does not identify exactly one finished evidence batch')
  const batch = batches[0], manifest = read(join(home, 'evidence/manifest.json'))
  if (requireLatest) assert(equal(read(join(home, 'evidence-full.json')), batch), 'the latest evidence report does not match this attempt')
  assert(equal(batch.sources, manifest) && batch.app === state.snapshot.app && batch.records === state.snapshot.records, 'review batch provenance changed')
  assert(batch.sources.heldCasesSha256 === state.snapshot.inputs['held-cases.json'] && batch.sources.gamesSha256 === state.snapshot.inputs['games.json'] && batch.sources.runnerSha256 === state.snapshot.sources['projects/maia-player-offsets/review-one.mts'], 'review batch inputs or instrument changed')
  const selected = new Set(read(join(home, 'held-cases.json')).map(c => String(c.id)))
  assert(batch.cases === selected.size && batch.sources.coverage?.selection === 'all-held-out-games' && batch.sources.coverage.games === selected.size && batch.status === 1 && batch.failed > 0 && batch.concurrency === 2 && batch.niceIncrement === 10 && batch.coordinatorPriority === 0 && batch.timeoutSeconds === 3600, 'unexpected review batch coverage, settings or status')
  // Only rows in this attempt decide restart eligibility. Earlier errors remain untouched.
  const errors = rows(join(home, 'evidence/routine/_errors.jsonl')).filter(r => within(r.at))
  const starts = rows(join(home, 'evidence/routine/_starts.jsonl')).filter(r => r.startedMs >= lower && r.startedMs <= upper)
  const successes = rows(join(home, 'evidence/routine/_timing.jsonl')).filter(r => within(r.at) && r.recovered === false)
  const startIds = new Set(starts.map(r => String(r.id))), errorIds = new Set(errors.map(r => String(r.id))), successIds = new Set(successes.map(r => String(r.id)))
  assert(starts.length === batch.cases - batch.completedBefore && starts.length === batch.written + batch.failed && startIds.size === starts.length && errors.length === batch.failed && errorIds.size === errors.length && successes.length === batch.written && successIds.size === successes.length, 'review attempt journals do not exactly account for its starts and outcomes')
  assert(starts.every(r => selected.has(String(r.id)) && r.mode === 'full' && r.coordinatorPriority === 0 && r.niceIncrement === 10) && errors.every(r => startIds.has(String(r.id)) && !successIds.has(String(r.id))) && successes.every(r => startIds.has(String(r.id))), 'review attempt outcomes do not match its starts')
  assert(errors.every(r => r.failure_class === 'timeout' && r.status === null && Number.isFinite(r.seconds) && r.seconds >= 0), 'this review attempt includes a substantive or ambiguous error')
  const wallSeconds = errors.reduce((n, r) => n + r.seconds, 0)
  return { attemptNumber: attempt.number, attemptStartedAt: attempt.startedAt, attemptFinishedAt: attempt.finishedAt,
    attemptSha256: sha(JSON.stringify(attempt)), batchSha256: sha(JSON.stringify(batch)),
    currentAttemptErrorRowsSha256: sha(JSON.stringify(errors)),
    errors: { count: errors.length, timeoutCount: errors.length, wallSeconds,
      minimumWallSeconds: Math.min(...errors.map(r => r.seconds)), maximumWallSeconds: Math.max(...errors.map(r => r.seconds)) },
    batch: { selected: batch.cases, completedBefore: batch.completedBefore, completedAfter: batch.completedAfter,
      newlyWritten: batch.written, failed: batch.failed, measuredWallSeconds: batch.seconds } }
}
function executionReport(state, bound, currentProof = null) {
  const cases = read(join(home, 'held-cases.json')), selected = new Set(cases.map(c => String(c.id)))
  const reused = new Set(state.stages.reviews.reviewBefore.ids.map(String))
  const times = new Map(rows(join(home, 'evidence/routine/_timing.jsonl')).filter(t => selected.has(String(t.id))).map(t => [String(t.id), t]))
  const completed = new Set()
  for (const c of cases) {
    const file = join(home, 'evidence/routine', `${c.id}.json`)
    if (!exists(file)) { assert(!times.has(String(c.id)), 'a completed timing has no review document'); continue }
    const doc = read(file)
    assert(doc.schema === 'game-review/2' && doc.id === c.game && doc.playerColor === c.playerColor && doc.provenance?.profile === 'routine' && Array.isArray(doc.records) && doc.fens?.length === doc.records.length + 1, 'a selected review document fails the frozen shape checks')
    const timing = times.get(String(c.id))
    assert(!timing || timing.plies === doc.records.length, 'completed review timing and document ply counts differ')
    completed.add(String(c.id))
  }
  assert([...reused].every(id => selected.has(id) && completed.has(id)), 'an originally retained review is missing')
  if (state.status === 'complete') assert(completed.size === selected.size && times.size === selected.size, 'a completed run lacks full review documents or timing')
  let successfulWorkerSeconds = 0, newSuccessfulWorkerSeconds = 0, completedPlies = 0, newCompletedPlies = 0, recoveredTimingRecords = 0
  for (const [id, t] of times) {
    assert(Number.isFinite(t.seconds) && t.seconds >= 0 && Number.isInteger(t.plies) && t.plies >= 0, 'invalid completed review timing')
    successfulWorkerSeconds += t.seconds; completedPlies += t.plies; recoveredTimingRecords += Number(t.recovered === true)
    if (!reused.has(id)) { newSuccessfulWorkerSeconds += t.seconds; newCompletedPlies += t.plies }
  }
  const reviewedRestarts = (state.reviewedRestarts ?? []).map(r => ({ at: r.at, kind: r.kind,
    status: exists(join(home, 'timeout-recoveries', r.recoveryId, 'receipt.json')) ? read(join(home, 'timeout-recoveries', r.recoveryId, 'receipt.json')).status : r.status,
    attemptNumber: r.proof.attemptNumber, attemptStartedAt: r.proof.attemptStartedAt, errors: r.proof.errors,
    batch: r.proof.batch, provenance: r.provenance, originalFailure: { stage: r.originalFailure.stage, transient: r.originalFailure.transient } }))
  const proofs = new Map()
  for (const r of state.reviewedRestarts ?? []) {
    const attempt = state.stages.reviews.attempts.find(a => sha(JSON.stringify(a)) === r.proof.attemptSha256)
    assert(attempt && equal(timeoutProof(state, attempt, false), r.proof), 'a retained timeout-only proof no longer matches its attempt journals')
    proofs.set(r.proof.attemptSha256, r.proof)
  }
  if (currentProof) proofs.set(currentProof.attemptSha256, currentProof)
  const firstReviewStart = Date.parse(state.stages.reviews.attempts[0]?.startedAt)
  assert(Number.isFinite(firstReviewStart), 'the review stage has no recorded start')
  const errorRows = rows(join(home, 'evidence/routine/_errors.jsonl'))
  assert(errorRows.every(r => Number.isFinite(Date.parse(r.at))), 'an error journal timestamp is ambiguous; failure coverage cannot be established')
  const phase2Errors = errorRows.filter(r => Date.parse(r.at) >= firstReviewStart)
  assert(phase2Errors.every(r => [...proofs.values()].filter(p => Date.parse(r.at) >= Date.parse(p.attemptStartedAt) && Date.parse(r.at) <= Date.parse(p.attemptFinishedAt)).length === 1) && phase2Errors.length === [...proofs.values()].reduce((n, p) => n + p.errors.count, 0), 'some phase-2 review errors lack an individually verified timeout-only proof; the aggregate report would omit failures')
  const timeoutAttempts = [...proofs.values()].map(p => ({ attemptNumber: p.attemptNumber, startedAt: p.attemptStartedAt,
    finishedAt: p.attemptFinishedAt, errors: p.errors, batch: p.batch }))
  const stages = Object.entries(state.stages).map(([stage, r]) => ({ stage, status: r.status,
    attempts: r.attempts.map(a => ({ number: a.number, status: a.status ?? 'unfinished', startedAt: a.startedAt,
      finishedAt: a.finishedAt ?? null, measuredWallSeconds: a.seconds ?? null })) }))
  const endedAt = state.finishedAt ?? state.sessions.at(-1)?.finishedAt ?? now()
  const report = { schema: 'maia-player-offsets-execution/1', generatedAt: now(), status: state.status,
    provenance: bound, stateSha256: hash(stateFile),
    journalSha256: Object.fromEntries(['evidence-runs.jsonl', 'evidence/routine/_timing.jsonl', 'evidence/routine/_errors.jsonl', 'evidence/routine/_starts.jsonl'].map(file => [file, exists(join(home, file)) ? hash(join(home, file)) : null])),
    maximumHeavyWorkers: 2, workerNiceIncrement: 10, coordinatorPriority: 0,
    review: { selected: selected.size, completed: completed.size, timedCompletedReviews: times.size,
      untimedCompletedReviews: completed.size - times.size, reusedReviews: reused.size,
      newlyCompletedReviews: [...completed].filter(id => !reused.has(id)).length,
      timedCompletedPlies: completedPlies, newTimedCompletedPlies: newCompletedPlies,
      successfulWorkerSeconds, newSuccessfulWorkerSeconds, recoveredTimingRecords,
      timeoutAttempts, timeoutCount: timeoutAttempts.reduce((n, r) => n + r.errors.count, 0),
      timeoutWallSeconds: timeoutAttempts.reduce((n, r) => n + r.errors.wallSeconds, 0),
      recordedStageWallSeconds: state.stages.reviews.attempts.reduce((n, a) => n + (a.seconds ?? 0), 0) },
    reviewedRestartCount: reviewedRestarts.length, reviewedRestarts, stages,
    sessions: state.sessions.map(s => ({ startedAt: s.startedAt, finishedAt: s.finishedAt ?? null, status: s.status, measuredWallSeconds: s.seconds ?? null })),
    elapsedSpanSeconds: Math.max(0, (Date.parse(endedAt) - Date.parse(state.createdAt)) / 1000),
    measuredSessionWallSeconds: state.sessions.reduce((n, s) => n + (s.seconds ?? 0), 0),
    acAwakeRecordSha256: exists(join(home, 'ac-awake.json')) ? hash(join(home, 'ac-awake.json')) : null,
    notes: 'Successful review worker seconds retain one latest timing per completed selected document, with the original reused reviews separated. Completed ply totals include only documents with timing. Ordinary timings run from spawn to child close; recovered timings run from the journaled start to the document modification time and omit later disposal. A worker can write a valid document before timing out, so its recovered completed-document interval can overlap a timeout interval. Timeout wall seconds sum failed child durations only for the individually verified timeout-only attempts shown here. Concurrent workers also overlap. These worker durations must not be added to infer stage wall time. Stage and session wall times count their elapsed intervals once and may include scheduling delays or machine suspension. None of these measures is CPU-active time. Untimed or unfinished attempts are not assigned invented durations. Historical errors, attempts, sessions and successful documents are retained. The AC watcher record hash establishes only that an operational record exists.' }
  const out = join(project, 'results'); fs.mkdirSync(out, { recursive: true })
  atomic(join(out, 'execution.json'), report)
  const f = n => n.toFixed(2), r = report.review
  fs.writeFileSync(join(out, 'execution.md'), ['# Maia player offsets: execution and recovery', '',
    `Written by recover-review-timeouts.mjs. App ${bound.app}; records ${bound.records}. Protocol manifest SHA-256 ${bound.protocolManifestSha256}; frozen protocol SHA-256 ${bound.protocolSha256}.`, '',
    `Status: ${report.status}. Reviewed timeout-only restarts: ${report.reviewedRestartCount}. Completed review documents: ${r.completed} of ${r.selected}; ${r.newlyCompletedReviews} newly completed and ${r.reusedReviews} retained from the benchmark. Timing records: ${r.timedCompletedReviews}; completed documents awaiting timing recovery: ${r.untimedCompletedReviews}.`, '',
    '| Measure | Seconds |', '|---|---:|',
    `| Newly completed review worker time | ${f(r.newSuccessfulWorkerSeconds)} |`,
    `| Completed review worker time including retained reviews | ${f(r.successfulWorkerSeconds)} |`,
    `| Failed timeout wall time (${r.timeoutCount} failures) | ${f(r.timeoutWallSeconds)} |`,
    `| Recorded review stage wall time | ${f(r.recordedStageWallSeconds)} |`, '', report.notes, ''].join('\n'))
  return { status: report.status, completedReviews: r.completed, selectedReviews: r.selected,
    reviewedRestarts: report.reviewedRestartCount, timeoutCount: r.timeoutCount,
    timeoutWallSeconds: r.timeoutWallSeconds, newSuccessfulWorkerSeconds: r.newSuccessfulWorkerSeconds }
}
function acquireLocks() {
  const identity = { pid: process.pid, pidStarted: marker(process.pid), executionId: ownExecution, startedAt: now() }
  assert(identity.pidStarted, 'cannot establish recovery helper identity')
  for (const name of [...locks].reverse()) {
    const file = join(home, name)
    // Ordinary completed failures release both coordinator locks. A leftover
    // lock needs separate inspection; never unlink a possibly replaced lock.
    assert(!exists(file), 'a coordinator or recovery lock remains; inspect it before recovery')
    const fd = fs.openSync(file, 'wx'); fs.writeFileSync(fd, JSON.stringify(identity) + '\n'); fs.closeSync(fd); ownedLocks.add(name)
  }
}
function releaseLocks(names = [...ownedLocks]) {
  for (const name of names) if (ownedLocks.has(name)) {
    const file = join(home, name)
    if (exists(file) && read(file).executionId === ownExecution) fs.unlinkSync(file)
    ownedLocks.delete(name)
  }
}
try {
  let state = read(stateFile)
  requireStopped(state)
  const bound = provenance(state, mode === '--resume' || mode === '--report')
  if (mode === '--report') {
    const beforeHash = hash(stateFile)
    acquireLocks(); state = read(stateFile); requireStopped(state)
    assert(hash(stateFile) === beforeHash && equal(provenance(state, true), bound), 'the stopped run changed during report inspection')
    let proof = null
    if (state.currentStage === 'reviews' && state.status === 'failed') proof = timeoutProof(state, preEffectReview(state))
    console.log(JSON.stringify({ report: executionReport(state, bound, proof) }))
  } else {
    const attempt = preEffectReview(state), proof = timeoutProof(state, attempt)
    assert(!(state.reviewedRestarts ?? []).some(r => r.proof.attemptSha256 === proof.attemptSha256), 'this failed attempt already has a reviewed restart record; inspect its launch record before another action')
    if (mode === '--inspect') console.log(JSON.stringify({ eligible: true, action: 'inspection only; no files changed', attemptNumber: proof.attemptNumber, ...proof.batch, errors: proof.errors }))
    else {
      assert(getPriority() === 0, 'run the lightweight recovery helper at normal priority')
      const beforeHash = hash(stateFile)
      acquireLocks()
      state = read(stateFile); requireStopped(state)
      assert(hash(stateFile) === beforeHash && equal(provenance(state, true), bound) && equal(timeoutProof(state, preEffectReview(state)), proof), 'the stopped run changed during recovery inspection')
      // Verify full report accounting before making the failure retryable.
      executionReport(state, bound, proof)
      const record = { at: now(), kind: 'reviewed-timeout-only-restart', status: 'prepared',
        recoveryId: ownExecution, originalFailure: structuredClone(state.failure), proof, provenance: bound, stateBeforeSha256: beforeHash }
      const audit = join(home, 'timeout-recoveries', ownExecution); fs.mkdirSync(audit, { recursive: true })
      fs.copyFileSync(stateFile, join(audit, 'state-before.json'), fs.constants.COPYFILE_EXCL)
      for (const name of ['phase2-launch.json', 'ac-awake.json']) if (exists(join(home, name))) fs.copyFileSync(join(home, name), join(audit, name), fs.constants.COPYFILE_EXCL)
      state.reviewedRestarts ??= []; state.reviewedRestarts.push(record)
      state.failure.transient = true; state.updatedAt = now()
      atomic(stateFile, state)
      executionReport(state, bound, proof)
      // The unchanged launcher starts a detached session. Its controller must
      // acquire its own lock and recheck all frozen hashes before any worker.
      releaseLocks(['phase2-run.lock', 'evidence-coordinator.lock'])
      const output = fs.openSync(join(audit, 'launch.log'), 'a')
      try {
        execFileSync(join(lab, '.venv/bin/python'), [join(lab, launchFile)], { cwd: lab, stdio: ['ignore', output, output] })
      } finally { fs.closeSync(output) }
      const launch = read(join(home, 'phase2-launch.json'))
      fs.copyFileSync(join(home, 'phase2-launch.json'), join(audit, 'launch.json'), fs.constants.COPYFILE_EXCL)
      assert(launch.independentSession === true && launch.pgid === launch.pid && launch.pidStarted && !launch.exitedDuringLaunch, 'detached launch did not confirm an independent process identity; inspect the retained recovery record')
      // Do not rewrite the live controller state. The immutable launch receipt
      // is a separate private journal; the prepared review record stays intact.
      atomic(join(audit, 'receipt.json'), { at: now(), status: 'launched', pid: launch.pid, pidStarted: launch.pidStarted, launcherRecordSha256: hash(join(audit, 'launch.json')) })
      console.log(JSON.stringify({ eligible: true, action: 'reviewed timeout-only restart launched', pid: launch.pid, attemptNumber: proof.attemptNumber, timeoutCount: proof.errors.count }))
    }
  }
} catch (error) {
  // Never echo raw private records, filenames, worker logs or exception stacks.
  const safe = error.safeOperationalMessage ? error.message : 'an operational read or command failed; inspect private state before recovery'
  console.error(JSON.stringify({ eligible: false, action: mode === '--inspect' ? 'inspection only; no files changed' : 'stopped', reason: safe }))
  process.exitCode = 1
} finally { releaseLocks() }
