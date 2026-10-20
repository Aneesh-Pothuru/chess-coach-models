// Reporting only. Read the timestamped phase-two wrapper logs, never review
// documents or deciding measures. No engine or analysis is started here.
//
//   node projects/second-look-fresh/execution.mjs
//
// Stage boundaries are the last preceding stage's closing output line. The
// first CLI stage follows the last preparation line. Thus launch/exit overhead
// is included, but boundaries are approximate output-observation times. Both
// the wrapper's monotonic clock and its calendar timestamps are retained.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { RULE } from './rules.mjs'
import { verifyDesignCode } from './provenance.mjs'

const LAB = fileURLToPath(new URL('../../', import.meta.url))
const COMMAND = ['bash', 'projects/second-look-fresh/phase2.sh', '--phase2']
const AMENDED_COMMAND = ['bash', 'projects/second-look-fresh/phase2-amended.sh', '--phase2']
const ARMS = ['baseline', 'candidate']
const STAGES = [
  'preparation',
  ...ARMS.flatMap(arm => ['CLI', 'observed'].flatMap(kind => RULE.profiles.map(profile => `${arm}/${kind}/${profile}`))),
  'references', 'analysis',
]
const insist = (ok, message) => { if (!ok) throw new Error(`execution: ${message}`) }
const integer = n => Number.isInteger(n) && n >= 0
const number = n => Number.isFinite(n) && n >= 0
const date = s => typeof s === 'string' && Number.isFinite(Date.parse(s))
const json = line => { try { return JSON.parse(line) } catch { return null } }
const sameKeys = (object, keys) => object && typeof object === 'object' && !Array.isArray(object)
  && Object.keys(object).sort().join(',') === [...keys].sort().join(',')
const emptyReplayFailures = () => Object.fromEntries(ARMS.map(arm => [arm,
  Object.fromEntries(RULE.profiles.map(profile => [profile, 0]))]))
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

export function readAmendment() {
  const bytes = readFileSync(join(LAB, 'projects/second-look-fresh/amendment-manifest.json'))
  const manifest = JSON.parse(bytes)
  insist(manifest.schema === 'second-look-fresh-acquisition-amendment/1'
    && /^[0-9a-f]{64}$/.test(manifest.designSha256), 'invalid acquisition amendment manifest')
  const p = manifest.protocol
  insist(p.path === 'projects/second-look-fresh/README.md'
    && p.start === '## Acquisition amendment, approved before the comparison\n' && p.end === '## Caveats\n',
  'unexpected acquisition amendment boundaries')
  const text = readFileSync(join(LAB, p.path), 'utf8')
  const start = text.indexOf(p.start), end = text.indexOf(p.end, start)
  insist(start >= 0 && end > start && hash(text.slice(start, end)) === p.sha256,
    'approved acquisition amendment text changed')
  return { manifest, amendmentSha256: hash(bytes) }
}

/** Parse a finished invocation or an explicitly censored interruption. */
export function parseInvocation(run, rows, amendment = readAmendment()) {
  insist(run.schema === 'second-look-fresh-run/2', 'run metadata needs the current hash-based schema')
  const amended = equal(run.command, AMENDED_COMMAND)
  insist(amended || equal(run.command, COMMAND), 'unexpected wrapper command')
  insist(amendment.manifest.designSha256 === run.designSha256, 'amendment identifies a different design')
  insist(amended ? run.amendmentSha256 === amendment.amendmentSha256 : run.amendmentSha256 === undefined,
    'wrapper amendment provenance does not match its command')
  insist(date(run.startedAt) && /^[0-9a-f]{64}$/.test(run.designSha256 ?? ''), 'missing start or design hash')
  insist(['finished', 'interrupted-end-unknown'].includes(run.status),
    'unfinished run metadata; wait for completion or record the verified interruption')
  const endKnown = run.status === 'finished'
  if (endKnown) {
    insist(date(run.endedAt) && number(run.seconds) && Number.isInteger(run.exitCode), 'invalid finished-run metadata')
  } else {
    insist(run.endedAt === undefined && run.seconds === undefined && run.exitCode === undefined,
      'an unknown end cannot supply an end time, exact duration or exit status')
    insist(date(run.observedThroughAt) && number(run.observedSeconds) && rows.length > 0,
      'unknown-end metadata needs the last observed output')
    insist(run.observedThroughAt === rows.at(-1).at && run.observedSeconds === rows.at(-1).seconds,
      'unknown-end boundary must equal the final timestamped output')
  }
  const throughAt = endKnown ? run.endedAt : run.observedThroughAt
  const seconds = endKnown ? run.seconds : run.observedSeconds
  const calendarSeconds = (Date.parse(throughAt) - Date.parse(run.startedAt)) / 1000
  insist(calendarSeconds >= 0, 'wrapper calendar end precedes its start')
  let lastSeconds = 0, lastAt = Date.parse(run.startedAt)
  for (const row of rows) {
    insist(date(row.at) && number(row.seconds) && typeof row.line === 'string', 'invalid output envelope')
    insist(row.seconds >= lastSeconds && row.seconds <= seconds + .01 && Date.parse(row.at) >= lastAt
      && Date.parse(row.at) <= Date.parse(throughAt),
      'output timestamps are out of order or beyond the wrapper end')
    lastSeconds = row.seconds
    lastAt = Date.parse(row.at)
  }

  const stages = []
  let replayEqualityFailures = 0
  const replayEqualityFailuresByArmProfile = emptyReplayFailures()
  let index = 0, started = 0, state = {}, previous = null, terminalFailure = false, provenance = null
  let startedAt = Date.parse(run.startedAt)
  const current = () => STAGES[index]
  const close = (ended, endedAt, status = 'complete') => {
    insist(number(ended) && ended >= started, 'negative stage duration')
    insist(date(endedAt) && Date.parse(endedAt) >= startedAt, 'negative calendar stage duration')
    insist(status !== 'complete' || !state.replayEqualityFailures,
      'an observed stage with a rejected replay cannot be complete')
    if (current()?.includes('/CLI/') && status !== 'incomplete') {
      insist((state.cliTimeoutFailures ?? 0) <= state.failedGames,
        'CLI timeout markers exceed the final failure count')
    }
    stages.push({ stage: current(), seconds: ended - started,
      calendarSeconds: (Date.parse(endedAt) - startedAt) / 1000, status, endUnknown: false, ...state })
    index++
    started = ended
    startedAt = Date.parse(endedAt)
    state = {}
  }
  const extendLast = (ended, endedAt) => {
    insist(stages.length && ended >= started, 'invalid final-stage extension')
    insist(date(endedAt) && Date.parse(endedAt) >= startedAt, 'invalid calendar final-stage extension')
    stages.at(-1).seconds += ended - started
    stages.at(-1).calendarSeconds += (Date.parse(endedAt) - startedAt) / 1000
    started = ended
    startedAt = Date.parse(endedAt)
  }
  let lastClosedCli = null
  const refLatest = new Map()

  for (const row of rows) {
    const parsed = json(row.line)
    if (current() === 'preparation' && parsed?.appCommit && parsed?.recordsCommit && integer(parsed.games)) {
      insist(parsed.games === RULE.games && /^[0-9a-f]{40}$/.test(parsed.appCommit)
        && /^[0-9a-f]{40}$/.test(parsed.recordsCommit), 'preparation provenance differs')
      provenance = { appCommit: parsed.appCommit, recordsCommit: parsed.recordsCommit, games: parsed.games }
    }
    const begin = /^\[(phone|desktop|routine)\] (\d+) of (\d+) cases to build -> .*\/(baseline|candidate)\/evidence\/(phone|desktop|routine)$/.exec(row.line)
    const progress = /^\[(phone|desktop|routine)\] (\d+)\/(\d+) done \((\d+) ok, (\d+) failed\), \d+s elapsed(?:, ~\d+s left)?$/.exec(row.line)
    const timed = /^\[(baseline|candidate)\/(phone|desktop|routine)\] case (\d+) timed; (\d+)s$/.exec(row.line)
    const rejectedReplay = /^Error: timed review does not reproduce the CLI document at case (\d+); no timing kept$/.exec(row.line)
    const cliTimeout = /^\s*\[(phone|desktop|routine)\] .+ FAILED: exceeded (\d+)s$/.exec(row.line)
    const summary = sameKeys(parsed, ['variant', 'profile', 'completed', 'resumed'])
    const reference = sameKeys(parsed, ['shard', 'finishedGameOrdinal', 'built', 'resumed', 'unresolved'])
    const analysis = sameKeys(parsed, ['narrows', 'agrees', 'qualityPasses', 'qualityWorse', 'disposition'])
    if (terminalFailure) {
      insist(!begin && !timed && !summary && !reference && !analysis && !rejectedReplay && !cliTimeout,
        'a failed CLI stage was followed by another stage')
      previous = row
      continue
    }
    if (begin) {
      if (current() === 'preparation') {
        insist(provenance && previous, 'CLI began without preparation provenance')
        close(previous.seconds, previous.at)
      }
      const [, profile, todoText, totalText, arm, pathProfile] = begin
      const todo = Number(todoText), total = Number(totalText)
      insist(current() === `${arm}/CLI/${profile}` && pathProfile === profile && !state.started,
        'CLI stages are missing, duplicated or out of order')
      insist(total === RULE.games && todo <= total, 'CLI case count differs')
      state = { started: true, requestedGames: total, pendingGames: todo, resumedGames: total - todo,
        completedGames: 0, failedGames: 0 }
      lastClosedCli = null
    } else if (cliTimeout) {
      const limit = Number(cliTimeout[2])
      insist(current()?.endsWith(`/CLI/${cliTimeout[1]}`) && state.started,
        'CLI timeout marker has no matching stage')
      insist(Number.isInteger(limit) && limit > 0, 'invalid CLI timeout limit')
      insist(state.cliTimeoutLimitSeconds === undefined || state.cliTimeoutLimitSeconds === limit,
        'CLI timeout limit changed inside a stage')
      state.cliTimeoutLimitSeconds = limit
      state.cliTimeoutFailures = (state.cliTimeoutFailures ?? 0) + 1
    } else if (progress) {
      const [, profile, doneText, totalText, okText, failedText] = progress
      const done = Number(doneText), todo = Number(totalText), ok = Number(okText), failed = Number(failedText)
      insist(done <= todo && done === ok + failed, 'CLI progress counts differ')
      if (lastClosedCli?.profile === profile && !state.started && done === todo && todo === lastClosedCli.todo) {
        // A timer tick can print the final count just before the builder's own
        // final progress line. Keep the later closing timestamp.
        insist(ok === lastClosedCli.ok && failed === lastClosedCli.failed, 'duplicate CLI closing counts differ')
        extendLast(row.seconds, row.at)
      } else {
        insist(current()?.endsWith(`/CLI/${profile}`) && state.started && todo === state.pendingGames,
          'CLI progress has no matching stage')
        state.completedGames = ok
        state.failedGames = failed
        if (done === todo) {
          const saved = { profile, todo, ok, failed }
          close(row.seconds, row.at, failed ? 'failed' : 'complete')
          lastClosedCli = saved
          terminalFailure = failed > 0
        }
      }
    } else if (rejectedReplay) {
      const observed = /^(baseline|candidate)\/observed\/(phone|desktop|routine)$/.exec(current() ?? '')
      insist(observed, 'a replay equality failure has no matching observed stage')
      insist(Number(rejectedReplay[1]) >= 1 && Number(rejectedReplay[1]) <= RULE.games,
        'rejected replay game ordinal differs')
      const [, arm, profile] = observed
      state.started = true
      state.replayEqualityFailures = (state.replayEqualityFailures ?? 0) + 1
      replayEqualityFailures++
      replayEqualityFailuresByArmProfile[arm][profile]++
    } else if (timed || summary) {
      const arm = timed ? timed[1] : parsed.variant
      const profile = timed ? timed[2] : parsed.profile
      insist(ARMS.includes(arm) && RULE.profiles.includes(profile) && current() === `${arm}/observed/${profile}`,
        'observed stages are missing, duplicated or out of order')
      state.started = true
      state.timedGames ??= 0
      state.completedGames ??= 0
      state.resumedGames ??= 0
      state.finishedWorkers ??= 0
      if (timed) {
        insist(Number(timed[3]) >= 1 && Number(timed[3]) <= RULE.games, 'observed game ordinal differs')
        state.timedGames++
      } else {
        const workers = profile === 'routine' ? 1 : 2
        insist(integer(parsed.completed) && integer(parsed.resumed)
          && parsed.completed + parsed.resumed === RULE.games / workers, 'observed summary counts differ')
        state.completedGames += parsed.completed
        state.resumedGames += parsed.resumed
        state.finishedWorkers++
        insist(state.finishedWorkers <= workers, 'too many observed worker summaries')
        if (state.finishedWorkers === workers) {
          insist(state.timedGames === state.completedGames, 'observed timed lines and summaries differ')
          close(row.seconds, row.at)
        }
      }
    } else if (reference) {
      insist(current() === 'references', 'reference stage is out of order')
      insist(/^[01]\/2$/.test(parsed.shard) && integer(parsed.built) && integer(parsed.resumed)
        && integer(parsed.finishedGameOrdinal), 'invalid reference progress')
      const shard = Number(parsed.shard[0]), ordinal = parsed.finishedGameOrdinal
      insist(ordinal >= 1 && ordinal <= RULE.games && (ordinal - 1) % 2 === shard, 'reference ordinal differs')
      const prior = refLatest.get(shard)
      insist(!prior || (ordinal > prior.ordinal && parsed.built >= prior.built && parsed.resumed >= prior.resumed),
        'reference progress went backwards')
      refLatest.set(shard, { ordinal, built: parsed.built, resumed: parsed.resumed })
      state.started = true
      state.builtPositions = [...refLatest.values()].reduce((n, r) => n + r.built, 0)
      state.resumedPositions = [...refLatest.values()].reduce((n, r) => n + r.resumed, 0)
      state.finishedWorkers = [...refLatest.entries()].filter(([s, r]) => r.ordinal === RULE.games - 1 + s).length
      if (state.finishedWorkers === 2) close(row.seconds, row.at)
    } else if (analysis) {
      insist(current() === 'analysis' && !state.outputSeen, 'analysis output is missing or duplicated')
      // Only the presence of the final output marker is used. Its values are
      // deliberately neither interpreted nor copied into this runtime report.
      state.outputSeen = true
    }
    previous = row
  }

  if (endKnown && run.exitCode === 0) {
    insist(replayEqualityFailures === 0, 'successful wrapper contains a rejected replay')
    insist(current() === 'analysis' && state.outputSeen && provenance, 'successful wrapper lacks all stage closing lines')
    close(seconds, throughAt)
    insist(index === STAGES.length, 'successful wrapper is missing a stage')
  } else if (terminalFailure) {
    extendLast(seconds, throughAt)
  } else {
    insist(current(), 'failed wrapper has unexpected trailing work')
    close(seconds, throughAt, state.replayEqualityFailures ? 'failed' : 'incomplete')
  }
  if (!endKnown) stages.at(-1).endUnknown = true
  insist(Math.abs(stages.reduce((n, s) => n + s.seconds, 0) - seconds) < .000001,
    'stage durations do not sum to invocation duration')
  insist(Math.abs(stages.reduce((n, s) => n + s.calendarSeconds, 0) - calendarSeconds) < .000001,
    'calendar stage durations do not sum to invocation duration')
  const reportedStages = stages.map(({ seconds: duration, calendarSeconds: calendarDuration, started: _started, ...stage }) => ({
    ...stage, activeWallSecondsLowerBound: duration, exactActiveWallSeconds: stage.endUnknown ? null : duration,
    calendarElapsedSecondsLowerBound: calendarDuration, exactCalendarElapsedSeconds: stage.endUnknown ? null : calendarDuration,
    observedClockDifferenceSeconds: calendarDuration - duration,
  }))
  const cliTimeoutFailures = reportedStages.reduce((n, s) => n + (s.cliTimeoutFailures ?? 0), 0)
  const cliTimeoutLimitsSeconds = [...new Set(reportedStages.filter(s => s.cliTimeoutFailures)
    .map(s => s.cliTimeoutLimitSeconds))].sort((a, b) => a - b)
  return { status: run.status, startedAt: run.startedAt, endedAt: endKnown ? run.endedAt : null,
    observedThroughAt: throughAt, activeWallSecondsLowerBound: seconds, exactActiveWallSeconds: endKnown ? seconds : null,
    calendarElapsedSecondsLowerBound: calendarSeconds, exactCalendarElapsedSeconds: endKnown ? calendarSeconds : null,
    observedClockDifferenceSeconds: calendarSeconds - seconds,
    endKnown, exitCode: endKnown ? run.exitCode : null, designSha256: run.designSha256,
    command: run.command, amendmentSha256: amended ? run.amendmentSha256 : null, provenance,
    replayEqualityFailures, replayEqualityFailuresByArmProfile, cliTimeoutFailures, cliTimeoutLimitsSeconds,
    stages: reportedStages }
}

export function aggregateInvocations(invocations, amendment = readAmendment()) {
  insist(invocations.length > 0, 'no completed wrapper invocations')
  const runs = [...invocations].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
  for (let i = 1; i < runs.length; i++) {
    insist(Date.parse(runs[i].startedAt) >= Date.parse(runs[i - 1].observedThroughAt), 'observed invocation intervals overlap')
    insist(runs[i].designSha256 === runs[0].designSha256, 'invocations used different design hashes')
  }
  insist(amendment.manifest.designSha256 === runs[0].designSha256, 'amendment identifies a different design')
  let amendmentSeen = false
  for (const run of runs) {
    const amended = equal(run.command, AMENDED_COMMAND)
    insist(amended || equal(run.command, COMMAND), 'unexpected invocation command')
    insist(amended ? run.amendmentSha256 === amendment.amendmentSha256 : run.amendmentSha256 === null,
      'invocation amendment provenance differs from its command')
    insist(amended || !amendmentSeen, 'original acquisition resumed after the amendment began')
    amendmentSeen ||= amended
  }
  const provenance = runs.find(r => r.provenance)?.provenance
  insist(provenance, 'no preparation provenance')
  for (const r of runs) if (r.provenance) insist(JSON.stringify(r.provenance) === JSON.stringify(provenance), 'run provenance changed')
  for (const r of runs) {
    const calendar = (Date.parse(r.observedThroughAt) - Date.parse(r.startedAt)) / 1000
    insist(number(r.calendarElapsedSecondsLowerBound) && Math.abs(r.calendarElapsedSecondsLowerBound - calendar) < .000001,
      'invocation calendar duration differs from its timestamps')
    insist(r.exactCalendarElapsedSeconds === (r.endKnown ? r.calendarElapsedSecondsLowerBound : null),
      'invocation exact calendar duration disagrees with censoring')
    for (const s of r.stages) {
      insist(number(s.calendarElapsedSecondsLowerBound)
        && s.exactCalendarElapsedSeconds === (s.endUnknown ? null : s.calendarElapsedSecondsLowerBound),
      'invalid or incorrectly censored calendar stage duration')
      insist(Number.isFinite(s.observedClockDifferenceSeconds)
        && Math.abs(s.observedClockDifferenceSeconds - (s.calendarElapsedSecondsLowerBound - s.activeWallSecondsLowerBound)) < .000001,
      'stage clock difference does not reconcile')
    }
    insist(Math.abs(r.stages.reduce((n, s) => n + s.calendarElapsedSecondsLowerBound, 0) - calendar) < .000001,
      'invocation calendar stage durations do not reconcile')
    insist(Number.isFinite(r.observedClockDifferenceSeconds)
      && Math.abs(r.observedClockDifferenceSeconds - (calendar - r.activeWallSecondsLowerBound)) < .000001,
    'invocation clock difference does not reconcile')
  }
  const counted = ['requestedGames', 'pendingGames', 'completedGames', 'failedGames', 'resumedGames',
    'timedGames', 'finishedWorkers', 'builtPositions', 'resumedPositions', 'replayEqualityFailures', 'cliTimeoutFailures']
  const stages = STAGES.map(stage => {
    const rows = runs.flatMap(r => r.stages.filter(s => s.stage === stage))
    const activeWallSecondsLowerBound = rows.reduce((n, r) => n + r.activeWallSecondsLowerBound, 0)
    const calendarElapsedSecondsLowerBound = rows.reduce((n, r) => n + r.calendarElapsedSecondsLowerBound, 0)
    const endUnknown = rows.some(r => r.endUnknown)
    return { stage, activeWallSecondsLowerBound, exactActiveWallSeconds: endUnknown ? null : activeWallSecondsLowerBound, endUnknown,
      calendarElapsedSecondsLowerBound, exactCalendarElapsedSeconds: endUnknown ? null : calendarElapsedSecondsLowerBound,
      observedClockDifferenceSeconds: calendarElapsedSecondsLowerBound - activeWallSecondsLowerBound,
      completeInvocations: rows.filter(r => r.status === 'complete').length,
      failedInvocations: rows.filter(r => r.status === 'failed').length,
      incompleteInvocations: rows.filter(r => r.status === 'incomplete').length,
      cliTimeoutLimitsSeconds: [...new Set(rows.filter(r => r.cliTimeoutFailures)
        .map(r => r.cliTimeoutLimitSeconds))].sort((a, b) => a - b),
      countsAcrossInvocations: Object.fromEntries(counted.filter(k => rows.some(r => k in r))
        .map(k => [k, rows.reduce((n, r) => n + (r[k] ?? 0), 0)])) }
  })
  const activeWallSecondsLowerBound = runs.reduce((n, r) => n + r.activeWallSecondsLowerBound, 0)
  const calendarElapsedSecondsLowerBound = runs.reduce((n, r) => n + r.calendarElapsedSecondsLowerBound, 0)
  const timingIsLowerBound = runs.some(r => !r.endKnown)
  const calendarObservedSeconds = (Date.parse(runs.at(-1).observedThroughAt) - Date.parse(runs[0].startedAt)) / 1000
  let knownBetweenInvocationSeconds = 0, unallocatedGapSeconds = 0
  for (let i = 1; i < runs.length; i++) {
    const gap = (Date.parse(runs[i].startedAt) - Date.parse(runs[i - 1].observedThroughAt)) / 1000
    if (runs[i - 1].endKnown) knownBetweenInvocationSeconds += gap
    else unallocatedGapSeconds += gap
  }
  insist(Math.abs(calendarElapsedSecondsLowerBound + knownBetweenInvocationSeconds + unallocatedGapSeconds - calendarObservedSeconds) < .000001,
    'calendar invocation windows and between-invocation gaps do not reconcile')
  const replayEqualityFailuresByArmProfile = emptyReplayFailures()
  for (const r of runs) {
    insist(integer(r.replayEqualityFailures), 'invalid invocation replay failure count')
    let total = 0
    for (const arm of ARMS) for (const profile of RULE.profiles) {
      const n = r.replayEqualityFailuresByArmProfile?.[arm]?.[profile]
      insist(integer(n), 'invalid invocation replay failure breakdown')
      const stageTotal = r.stages.filter(s => s.stage === `${arm}/observed/${profile}`)
        .reduce((sum, s) => sum + (s.replayEqualityFailures ?? 0), 0)
      insist(n === stageTotal, 'invocation replay failures differ from stage counts')
      replayEqualityFailuresByArmProfile[arm][profile] += n
      total += n
    }
    insist(total === r.replayEqualityFailures, 'invocation replay failure counts do not sum')
  }
  const replayEqualityFailures = runs.reduce((n, r) => n + r.replayEqualityFailures, 0)
  for (const r of runs) {
    insist(integer(r.cliTimeoutFailures)
      && r.cliTimeoutFailures === r.stages.reduce((n, s) => n + (s.cliTimeoutFailures ?? 0), 0),
    'CLI timeout counts do not reconcile')
    const limits = [...new Set(r.stages.filter(s => s.cliTimeoutFailures)
      .map(s => s.cliTimeoutLimitSeconds))].sort((a, b) => a - b)
    insist(JSON.stringify(r.cliTimeoutLimitsSeconds) === JSON.stringify(limits), 'CLI timeout limits do not reconcile')
  }
  const cliTimeoutFailures = runs.reduce((n, r) => n + r.cliTimeoutFailures, 0)
  const cliTimeoutLimitsSeconds = [...new Set(runs.flatMap(r => r.cliTimeoutLimitsSeconds))].sort((a, b) => a - b)
  return { schema: 'second-look-fresh-execution/3', ...provenance, designSha256: runs[0].designSha256,
    amendmentSha256: amendment.amendmentSha256,
    amendedInvocations: runs.filter(r => r.amendmentSha256 !== null).length,
    command: runs.at(-1).command, invocations: runs.length, successfulInvocations: runs.filter(r => r.exitCode === 0).length,
    failedInvocations: runs.filter(r => r.endKnown && r.exitCode !== 0).length,
    unknownEndInvocations: runs.filter(r => !r.endKnown).length, lastInvocationSucceeded: runs.at(-1).exitCode === 0,
    startedAt: runs[0].startedAt, endedAt: runs.at(-1).endedAt, observedThroughAt: runs.at(-1).observedThroughAt,
    activeWallSecondsLowerBound, exactActiveWallSeconds: timingIsLowerBound ? null : activeWallSecondsLowerBound,
    calendarElapsedSecondsLowerBound, exactCalendarElapsedSeconds: timingIsLowerBound ? null : calendarElapsedSecondsLowerBound,
    observedClockDifferenceSeconds: calendarElapsedSecondsLowerBound - activeWallSecondsLowerBound,
    timingIsLowerBound, calendarObservedSeconds, knownBetweenInvocationSeconds, unallocatedGapSeconds,
    replayEqualityFailures, replayEqualityFailuresByArmProfile,
    cliTimeoutFailures, cliTimeoutLimitsSeconds,
    method: 'Output-observation boundaries: preparation ends at the last line before the first CLI start; every later stage begins at the preceding stage closing line. Each boundary uses both the exact logged calendar timestamp and the wrapper monotonic timestamp. The legacy activeWallSecondsLowerBound and exactActiveWallSeconds fields measure monotonic elapsed time, not CPU time or guaranteed awake time. Calendar elapsed is measured over the same observed windows. observedClockDifferenceSeconds is calendar minus monotonic elapsed; it is an unattributed clock difference, consistent with sleep but not proof of sleep, CPU use or downtime. A recorded wrapper end closes analysis or an interrupted stage. An interruption with an unknown end is censored at its last output: both elapsed totals and its final stage durations are lower bounds. The clock difference describes only the observed windows and is not a bound on any unobserved difference. Time after the last output and before the next invocation is unallocated, not asserted idle; it can contain unlogged runtime. Known end-to-next-start gaps are reported separately. Calendar invocation windows plus both kinds of between-invocation gap equal the full observed calendar span. Launch and exit overhead are included when observed. Stage times are approximate output-observation intervals, not summed worker seconds. Counts sum logged attempts and resumptions, not distinct games or positions; interrupted work after the final line may first be counted on resumption.',
    stages, runs }
}

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, text)
  renameSync(temp, file)
}

export function main() {
  const root = join(LAB, 'private/second-look-fresh/run-log')
  insist(existsSync(root), 'no wrapper log directory')
  const names = readdirSync(root).filter(f => f.endsWith('-run.json')).sort()
  const amendment = readAmendment()
  const runs = names.map(file => {
    const meta = JSON.parse(readFileSync(join(root, file), 'utf8'))
    const output = join(root, file.replace(/-run\.json$/, '-output.jsonl'))
    insist(existsSync(output), 'wrapper output log is missing')
    const rows = readFileSync(output, 'utf8').split('\n').filter(Boolean).map((line, i) => {
      try { return JSON.parse(line) } catch { throw new Error(`execution: malformed output envelope ${i + 1}`) }
    })
    return parseInvocation(meta, rows, amendment)
  })
  const aggregated = aggregateInvocations(runs, amendment)
  const verified = verifyDesignCode()
  insist(verified.designSha256 === aggregated.designSha256, 'run logs identify a different design manifest')
  const out = { ...aggregated, ...verified }
  const pin = JSON.parse(readFileSync(join(LAB, 'bridge/chess.json'), 'utf8'))
  insist(out.appCommit === pin.commit && out.recordsCommit === pin.records, 'execution report does not match the pin')
  const result = join(LAB, 'projects/second-look-fresh/results')
  writeAtomic(join(result, 'execution.json'), JSON.stringify(out, null, 2) + '\n')
  const seconds = n => n.toFixed(2)
  const md = [
    '# Phase-two execution time', '',
    `Written by execution.mjs. App \`${out.appCommit}\`; records \`${out.recordsCommit}\`; design manifest SHA-256 \`${out.designSha256}\`. ${out.games} frozen games.`, '',
    `At report generation, all ${Object.keys(out.measurementSourceHashes).length} measurement source files and the fixed protocol match the committed design manifest. execution.json records the expected and actual SHA-256 digests. A mismatch stops the report.`, '',
    `${out.invocations} wrapper invocations: ${out.successfulInvocations} succeeded, ${out.failedInvocations} have known unsuccessful ends, and ${out.unknownEndInvocations} have unknown interruption times. The last invocation succeeded: ${out.lastInvocationSucceeded}.`, '',
    `${out.amendedInvocations} invocations used the separately approved candidate routine acquisition amendment, SHA-256 \`${out.amendmentSha256}\`. Each invocation retains its command and amendment identity. Earlier acquisition logs retain their original identity.`, '',
    `The unchanged replay equality check rejected ${out.replayEqualityFailures} attempts. No accepted timing file was kept for a rejected attempt. The amendment separately retains each first observed output before that check. Counts identify the arm and profile, not the game. The log establishes the rejection, not its cause.`, '',
    '| Rejected replay attempts | Phone | Desktop | Routine |',
    '|---|---:|---:|---:|',
    ...ARMS.map(arm => `| ${arm} | ${RULE.profiles.map(profile => out.replayEqualityFailuresByArmProfile[arm][profile]).join(' | ')} |`), '',
    `The CLI logged ${out.cliTimeoutFailures} timeout failures.${out.cliTimeoutLimitsSeconds.length ? ` Their configured per-game limits were ${out.cliTimeoutLimitsSeconds.join(', ')} seconds.` : ''} These are logged timeout outcomes, not measurements of CPU use or the cause of delay.`, '',
    '| CLI stage | Logged timeout failures | Configured limits in seconds |',
    '|---|---:|---:|',
    ...out.stages.filter(s => s.stage.includes('/CLI/')).map(s => `| ${s.stage} | ${s.countsAcrossInvocations.cliTimeoutFailures ?? 0} | ${s.cliTimeoutLimitsSeconds.join(', ') || 'none logged'} |`), '',
    `${out.timingIsLowerBound ? 'Logged monotonic elapsed lower bound' : 'Monotonic elapsed'}: ${seconds(out.activeWallSecondsLowerBound)} seconds (${(out.activeWallSecondsLowerBound / 3600).toFixed(2)} hours). ${out.timingIsLowerBound ? 'Logged calendar elapsed lower bound' : 'Calendar elapsed'} across invocation windows: ${seconds(out.calendarElapsedSecondsLowerBound)} seconds. Calendar minus monotonic elapsed across those observed windows: ${seconds(out.observedClockDifferenceSeconds)} seconds. This is an unattributed clock difference; it does not measure CPU time or establish downtime.`, '',
    `Full calendar span through the last observation: ${seconds(out.calendarObservedSeconds)} seconds. Known gaps between invocations: ${seconds(out.knownBetweenInvocationSeconds)} seconds. Unallocated gaps after unknown ends: ${seconds(out.unallocatedGapSeconds)} seconds; these are not asserted idle and are separate from the within-invocation clock difference. Started ${out.startedAt}; observed through ${out.observedThroughAt}.`, '',
    '| Stage | Monotonic seconds | Calendar seconds | Calendar minus monotonic | Complete invocations | Failed invocations | Incomplete invocations |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...out.stages.map(s => `| ${s.stage} | ${s.endUnknown ? 'at least ' : ''}${seconds(s.activeWallSecondsLowerBound)} | ${s.endUnknown ? 'at least ' : ''}${seconds(s.calendarElapsedSecondsLowerBound)} | ${seconds(s.observedClockDifferenceSeconds)} | ${s.completeInvocations} | ${s.failedInvocations} | ${s.incompleteInvocations} |`), '',
    out.method, '',
    'The script refuses running metadata, undocumented unknown ends, missing or out-of-order stage markers, overlapping observed intervals, inconsistent counts or changed provenance. It reads no review document and interprets no deciding measure. Per-invocation stage counts are in execution.json; raw logs remain private.', '',
  ]
  writeAtomic(join(result, 'execution.md'), md.join('\n'))
  console.log(`Wrote execution aggregates for ${out.invocations} finished or censored invocations.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
