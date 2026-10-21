// Reporting checks, written before reading the phase-two effects. This module
// opens no result or per-game file and computes no chess judgment or bootstrap.
// It checks the aggregate schema and independently applies the registered rule
// to stored estimates. Outcome-specific prose still needs its own claim checks.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ARMS = ['baseline', 'candidate']
const COMMAND = ['bash', 'projects/second-look-fresh/phase2.sh', '--phase2']
const AMENDED_COMMAND = ['bash', 'projects/second-look-fresh/phase2-amended.sh', '--phase2']
const MEASUREMENT_PATHS = ['rules.mjs', 'prepare.mjs', 'candidate.mjs', 'runtime.mjs', 'build.mjs',
  'probe.mjs', 'common.mjs', 'reference.mjs', 'analyze.mjs', 'phase2.sh']
  .map(file => `projects/second-look-fresh/${file}`)
  .concat('projects/accuracy-vs-chesscom/build-evidence.mjs')
const APP = 'f4bd63f19b343f686fb97ea4cf70b211c0bddc0a'
const GAME_REVIEW_SHA256 = 'c85a8c3e8988d60a14045a7d30bf4932b1eb2045e0e18f4f0c6cf7967cf2947d'

export function claim(ok, message) {
  if (!ok) throw new Error(`second-look-fresh paper claim failed: ${message}`)
}
const integer = (n, label) => claim(Number.isInteger(n) && n >= 0, `${label}: nonnegative integer`)
const finite = (n, label, nonnegative = true) => claim(Number.isFinite(n) && (!nonnegative || n >= 0), `${label}: finite${nonnegative ? ' nonnegative' : ''} number`)
const same = (a, b, label) => claim(JSON.stringify(a) === JSON.stringify(b), label)
const near = (a, b, label) => claim(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b)), label)
const bounded = (n, lo, hi, label) => claim(Number.isFinite(n) && n >= lo && n <= hi, `${label}: within bounds`)
const hash = value => createHash('sha256').update(value).digest('hex')
const digest = (value, label, length = 64) => claim(typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(value), `${label}: digest`)
const sum = (rows, key) => rows.reduce((n, r) => n + r[key], 0)
const object = (value, label) => claim(value && typeof value === 'object' && !Array.isArray(value), `${label}: object`)
function keys(value, expected, label) {
  object(value, label)
  same(Object.keys(value).sort(), [...expected].sort(), `${label}: expected keys`)
}
function onlyKeys(value, allowed, label) {
  object(value, label)
  claim(Object.keys(value).every(key => allowed.includes(key)), `${label}: only aggregate schema fields`)
}

// The committed manifest is identified by its canonical file contents, not a
// commit on this research branch. This is the same pretty-JSON-plus-newline
// encoding of the committed manifest, hashed by readDesign().
export function validateDesign(design, compare) {
  object(design, 'approved design')
  const { manifest, designSha256 } = design
  object(manifest, 'design manifest')
  claim(manifest.schema === 'second-look-fresh-design/1', 'design manifest schema')
  digest(designSha256, 'design content digest')
  same(designSha256, hash(JSON.stringify(manifest, null, 2) + '\n'), 'design manifest content hash')
  for (const k of ['appCommit', 'recordsCommit']) same(manifest[k], compare[k], `design ${k} matches comparison`)
  keys(manifest.files, MEASUREMENT_PATHS, 'registered measurement source paths')
  for (const path of MEASUREMENT_PATHS) digest(manifest.files[path], `${path}: registered content hash`)
  claim(manifest.protocol.path === 'projects/second-look-fresh/README.md'
    && manifest.protocol.start === '## The data\n' && manifest.protocol.end === '## What the app would take\n',
    'registered protocol section boundaries')
  digest(manifest.protocol.sha256, 'registered protocol content hash')
  return design
}

export function validateAmendment(amendment, design) {
  object(amendment, 'approved acquisition amendment')
  const { manifest, amendmentSha256 } = amendment
  keys(manifest, ['schema', 'designSha256', 'originalAcquisitionManifestSha256', 'replacement', 'frozen', 'protocol'],
    'acquisition amendment manifest')
  claim(manifest.schema === 'second-look-fresh-acquisition-amendment/1', 'acquisition amendment schema')
  digest(amendmentSha256, 'acquisition amendment content digest')
  same(amendmentSha256, hash(JSON.stringify(manifest, null, 2) + '\n'), 'acquisition amendment manifest content hash')
  same(manifest.designSha256, design.designSha256, 'acquisition amendment preserves the registered design')
  digest(manifest.originalAcquisitionManifestSha256, 'original acquisition manifest digest')
  same(manifest.replacement, { arm: 'candidate', profile: 'routine', games: 60,
    namespace: 'private/second-look-fresh/acquisition-amended' }, 'only the full candidate routine acquisition is replaced')
  same(manifest.frozen, [{ arm: 'baseline', profiles: ['phone', 'desktop', 'routine'] },
    { arm: 'candidate', profiles: ['phone', 'desktop'] }], 'baseline and candidate device acquisitions are frozen')
  keys(manifest.protocol, ['path', 'start', 'end', 'sha256'], 'amendment protocol location')
  claim(manifest.protocol.path === 'projects/second-look-fresh/README.md'
    && manifest.protocol.start === '## Acquisition amendment, approved before the comparison\n'
    && manifest.protocol.end === '## Caveats\n', 'approved amendment section boundaries')
  digest(manifest.protocol.sha256, 'approved amendment text digest')
}

function interval(value, label, lo, hi) {
  object(value, label)
  bounded(value.lo, lo, hi, `${label}.lo`)
  bounded(value.hi, lo, hi, `${label}.hi`)
  claim(value.lo <= value.hi, `${label}: ordered endpoints`)
}

// Null is an unresolved estimate, never a zero. A finite point value may still
// have invalid bootstrap draws, so valid:false need not imply value:null.
function estimate(value, rule, label, { decision = false, ratio = false } = {}) {
  object(value, label)
  claim(typeof value.valid === 'boolean', `${label}: validity flag`)
  integer(value.validDraws, `${label}.validDraws`)
  claim(value.validDraws <= rule.draws, `${label}: at most the fixed draws`)
  const lo = ratio ? 0 : -1
  if (value.value !== null) bounded(value.value, lo, 1, `${label}.value`)
  if (value.valid) {
    claim(value.value !== null && value.validDraws === rule.draws, `${label}: all draws valid`)
    interval(value.interval95, `${label}.interval95`, lo, 1)
    if (decision) {
      interval(value.corrected, `${label}.corrected`, lo, 1)
      claim(value.corrected.lo <= value.interval95.lo && value.corrected.hi >= value.interval95.hi,
        `${label}: corrected interval contains ordinary interval`)
    } else claim(value.corrected === null, `${label}: descriptive estimate has no decision interval`)
  } else claim(value.interval95 === null && value.corrected === null, `${label}: invalid estimate has no interval`)
  if (ratio) {
    integer(value.num, `${label}.num`)
    integer(value.den, `${label}.den`)
    claim(value.num <= value.den, `${label}: numerator no larger than denominator`)
    if (!value.den) claim(!value.valid && value.value === null, `${label}: zero denominator cannot pass`)
    if (value.value !== null) near(value.value, value.num / value.den, `${label}: ratio of sums`)
  }
}

function distribution(value, label, { maxN = Infinity, exactN, signed = false, total } = {}) {
  object(value, label)
  integer(value.n, `${label}.n`)
  claim(value.n <= maxN && (exactN === undefined || value.n === exactN), `${label}: observation count`)
  if (value.n === 0) {
    claim(value.mean === null && value.median === null && value.p90 === null, `${label}: empty distribution is null`)
    if (total !== undefined) near(total, 0, `${label}: empty total`)
    return
  }
  for (const k of ['mean', 'median', 'p90']) finite(value[k], `${label}.${k}`, !signed)
  claim(value.median <= value.p90, `${label}: ordered quantiles`)
  if (total !== undefined) near(value.mean * value.n, total, `${label}: mean reconciles to sum`)
}

// Fixed rule, independent of analyze.mjs's booleans and status strings. This
// does not decide chess facts: it only interprets stored statistical estimates.
export function decisionFromEstimates(compare, rule) {
  const device = Object.fromEntries(rule.devices.map(p => {
    const row = compare.gaps[p]
    const changes = [row.deltaMiss, row.deltaExtra]
    const narrows = changes.every(d => d.valid && d.value < 0)
      && changes.some(d => d.corrected.hi < 0)
      && changes.every(d => d.corrected.lo <= 0)
    const labels = Object.fromEntries(ARMS.map(a => {
      const { miss, extra } = row[a]
      const status = !miss.valid || !extra.valid ? 'unresolved'
        : miss.interval95.hi < rule.agreement && extra.interval95.hi < rule.agreement ? 'agrees'
          : miss.interval95.lo > rule.agreement || extra.interval95.lo > rule.agreement ? 'differs' : 'unclear'
      return [a, status]
    }))
    return [p, { narrows, ...labels }]
  }))
  const quality = Object.fromEntries(rule.profiles.map(p => {
    const d = compare.quality[p].deltaError
    return [p, !d.valid ? 'unresolved' : d.corrected.hi < rule.qualityMargin ? 'passes'
      : d.corrected.lo > rule.qualityMargin ? 'worse beyond margin' : 'unclear']
  }))
  const narrows = rule.devices.every(p => device[p].narrows)
  const agrees = rule.devices.every(p => device[p].candidate === 'agrees')
  const qualityPasses = rule.profiles.every(p => quality[p] === 'passes')
  const qualityWorse = rule.profiles.some(p => quality[p] === 'worse beyond margin')
  const disposition = narrows && qualityPasses ? 'keep for a port'
    : qualityWorse ? 'reject: quality worse beyond margin' : 'do not keep: inconclusive'
  return { device, quality, decision: { narrows, agrees, qualityPasses, qualityWorse, disposition } }
}

function attemptCost(row, label, arm) {
  object(row, label)
  for (const k of ['attempts', 'resetCalls', 'restrictedCalls', 'restrictedAttempts', 'failedCalls']) integer(row[k], `${label}.${k}`)
  for (const k of ['seconds', 'candidateSearchSeconds', 'resetSeconds', 'restrictedSeconds']) finite(row[k], `${label}.${k}`)
  claim(row.restrictedAttempts <= row.attempts && row.restrictedCalls >= row.restrictedAttempts,
    `${label}: restricted search counts`)
  claim(row.failedCalls <= row.attempts + row.resetCalls + row.restrictedCalls, `${label}: failed calls bounded by calls`)
  claim(row.resetCalls === (arm === 'candidate' ? row.attempts : 0), `${label}: only the candidate resets every attempt`)
  if (!row.resetCalls) near(row.resetSeconds, 0, `${label}: no reset time without resets`)
  if (!row.restrictedCalls) near(row.restrictedSeconds, 0, `${label}: no restricted time without calls`)
  if (row.attempts) near(row.restrictedShare, row.restrictedAttempts / row.attempts, `${label}: restricted share`)
  else claim(row.restrictedShare === null, `${label}: empty restricted share`)
  near(row.seconds, row.candidateSearchSeconds + row.resetSeconds + row.restrictedSeconds, `${label}: search and reset cost`)
  distribution(row.secondsPerAttempt, `${label}.secondsPerAttempt`, { exactN: row.attempts, total: row.seconds })
  distribution(row.candidateDepth, `${label}.candidateDepth`, { maxN: row.attempts })
  distribution(row.restrictedDepth, `${label}.restrictedDepth`, { maxN: row.restrictedAttempts })
}

function phaseOne(phase1, compare, rule) {
  claim(phase1.phase === 1 && phase1.comparisonComputed === false, 'phase one contains no comparison')
  same(phase1.rule, rule, 'phase-one rule matches the approved rule')
  for (const k of ['appCommit', 'recordsCommit', 'candidateSha256', 'casesSha256', 'engine', 'data'])
    same(phase1[k], compare[k], `phase-one and comparison ${k} match`)
  same(phase1.nodeOptions, compare.nodeOptions, 'phase-one and comparison engine options match')
  const c = phase1.counts
  for (const k of ['games', 'plies', 'positions', 'nonterminalPositions', 'tablebasePositions', 'partialGames', 'minPlies', 'maxPlies']) integer(c[k], `phase1.counts.${k}`)
  claim(c.games === rule.games && c.partialGames === 0 && c.positions === c.plies + c.games,
    'the entire frozen sample replays')
  claim(c.plies > 0 && c.minPlies > 0 && c.maxPlies >= c.minPlies && c.plies >= c.games * c.minPlies && c.plies <= c.games * c.maxPlies,
    'sample ply counts reconcile')
  claim(c.nonterminalPositions <= c.positions && c.tablebasePositions <= c.positions, 'position subsets are bounded')
  for (const [label, rows] of [['time controls', c.timeControls], ['lengths', c.lengths]]) {
    object(rows, `phase1 ${label}`)
    Object.values(rows).forEach(n => integer(n, `phase1 ${label} count`))
    claim(Object.values(rows).reduce((a, b) => a + b, 0) === rule.games, `${label} cover all games`)
  }
  const d = phase1.determinism
  claim(d.passed === true && d.identical === d.pairedComparisons && d.candidateSha256 === compare.candidateSha256,
    'the same candidate passed the permitted raw-search determinism gate')
  claim(d.positions === 2 && d.profiles === rule.profiles.length && d.budgets.length === 2,
    'determinism uses the fixed positions, profiles and budgets')
  claim(d.budgets[0] > 0 && d.budgets[1] === 2 * d.budgets[0] && rule.referenceNodes === 10 * d.budgets[0],
    'nominal, adaptive and reference budgets match the design')
  claim(d.searches === d.positions * d.budgets.length * d.profiles
    && d.pairedComparisons === d.positions * d.budgets.length * (d.profiles - 1), 'determinism counts reconcile')
  claim(phase1.sample.games === 1 && phase1.sample.plies > 0, 'the timing slice is one game')
  claim(Array.isArray(phase1.timing) && phase1.timing.length === ARMS.length * rule.profiles.length, 'all phase-one timing arms and profiles exist')
  const seen = new Set()
  for (const t of phase1.timing) {
    claim(ARMS.includes(t.arm) && rule.profiles.includes(t.profile) && !seen.has(`${t.arm}/${t.profile}`), 'phase-one timing identities are unique')
    seen.add(`${t.arm}/${t.profile}`)
    claim(t.games === 1 && t.plies === phase1.sample.plies, 'every timing slice uses the same game')
    for (const k of ['looks', 'initialSearches', 'adaptiveSearches', 'restrictedSearches', 'resetCalls', 'failedCalls', 'flags']) integer(t[k], `phase1 timing ${k}`)
    for (const k of ['seconds', 'verifySeconds', 'resetSeconds']) finite(t[k], `phase1 timing ${k}`)
    claim(t.initialSearches === t.looks && t.adaptiveSearches <= t.looks, 'slice initial and adaptive counts')
    claim(t.resetCalls === (t.arm === 'candidate' ? t.initialSearches + t.adaptiveSearches : 0), 'slice reset count')
    claim(t.seconds + 1e-6 >= t.verifySeconds && t.verifySeconds + 1e-6 >= t.resetSeconds, 'slice cost ordering')
    distribution(t.secondsPerLook, 'phase1 seconds per look', { exactN: t.looks, total: t.verifySeconds })
    distribution(t.depth, 'phase1 retained depth', { maxN: t.looks })
  }
  const e = phase1.estimate
  claim(e.canonicalDocuments === rule.games * rule.profiles.length * ARMS.length && e.observedReplays === e.canonicalDocuments,
    'planned document and observed replay counts')
  for (const k of ['totalWallHours', 'totalProcessHours', 'canonicalWallHours', 'observedWallHours', 'referenceWallHours', 'allPliesTwoAttemptsWallHours', 'planningHoursAtOneAndHalfSpeedCost']) finite(e[k], `phase1 estimate ${k}`)
  near(e.totalWallHours, e.canonicalWallHours + e.observedWallHours + e.referenceWallHours, 'planned wall time components')
  near(e.planningHoursAtOneAndHalfSpeedCost, 1.5 * e.totalWallHours, 'phase-one slowdown allowance')
  claim(e.totalWallHours > 0 && e.allPliesTwoAttemptsWallHours >= e.totalWallHours, 'phase-one estimate and work envelope')
  const reference = phase1.referenceTiming
  claim(reference.positions === 2 && reference.nodes === rule.referenceNodes, 'fixed reference timing slice')
  finite(reference.seconds, 'phase-one reference search seconds')
  finite(reference.resetSeconds, 'phase-one reference reset seconds')
  distribution(reference.depth, 'phase-one reference depth', { maxN: reference.positions })
  near(e.referenceSecondsPerPosition, (reference.seconds + reference.resetSeconds) / reference.positions, 'phase-one reference rate includes reset time')
  claim(phase1.packagesInstalled === false, 'phase one installed no packages')
  return c
}

// Rejected replays and CLI timeouts are execution events, not chess findings.
// The public breakdown contains only stage counts and timeout limits. Case ordinals, identifiers,
// raw exception text and research-branch identities have no schema field.
// This helper also accepts an unfinished aggregate for nondeciding log QA.
export function validateReplayEqualityFailures(execution, rule) {
  const countKeys = ['requestedGames', 'pendingGames', 'completedGames', 'failedGames', 'resumedGames',
    'timedGames', 'finishedWorkers', 'builtPositions', 'resumedPositions', 'replayEqualityFailures', 'cliTimeoutFailures']
  keys(execution, ['schema', 'appCommit', 'recordsCommit', 'games', 'designSha256', 'command', 'amendmentSha256', 'amendedInvocations',
    'invocations', 'successfulInvocations', 'failedInvocations', 'unknownEndInvocations', 'lastInvocationSucceeded',
    'startedAt', 'endedAt', 'observedThroughAt', 'activeWallSecondsLowerBound', 'exactActiveWallSeconds',
    'calendarElapsedSecondsLowerBound', 'exactCalendarElapsedSeconds', 'observedClockDifferenceSeconds',
    'timingIsLowerBound', 'calendarObservedSeconds', 'knownBetweenInvocationSeconds', 'unallocatedGapSeconds',
    'replayEqualityFailures', 'replayEqualityFailuresByArmProfile', 'cliTimeoutFailures', 'cliTimeoutLimitsSeconds', 'method', 'stages', 'runs',
    'measurementCodeUnchanged', 'measurementSourceHashes', 'protocolUnchanged', 'protocolSha256'],
  'execution report')
  const breakdown = (row, label) => {
    integer(row.replayEqualityFailures, `${label}: rejected replays`)
    const map = row.replayEqualityFailuresByArmProfile
    keys(map, ARMS, `${label}: rejection arms`)
    let total = 0
    for (const arm of ARMS) {
      keys(map[arm], rule.profiles, `${label}: rejection profiles`)
      for (const profile of rule.profiles) {
        integer(map[arm][profile], `${label}: ${arm}/${profile} rejections`)
        total += map[arm][profile]
      }
    }
    claim(total === row.replayEqualityFailures, `${label}: rejection breakdown sums to its total`)
  }
  const sortedLimits = rows => [...new Set(rows)].sort((a, b) => a - b)
  const timeoutSummary = (row, count, limits, label) => {
    integer(row.cliTimeoutFailures, `${label}: CLI timeouts`)
    claim(row.cliTimeoutFailures === count, `${label}: timeout count reconciles`)
    claim(Array.isArray(row.cliTimeoutLimitsSeconds), `${label}: timeout limits array`)
    for (const limit of row.cliTimeoutLimitsSeconds) claim(Number.isInteger(limit) && limit > 0, `${label}: positive integer timeout limit`)
    same(row.cliTimeoutLimitsSeconds, sortedLimits(limits), `${label}: sorted distinct timeout limits reconcile`)
    claim((row.cliTimeoutLimitsSeconds.length > 0) === (count > 0), `${label}: timeout limits only describe recorded timeouts`)
  }
  breakdown(execution, 'execution')
  claim(Array.isArray(execution.runs) && Array.isArray(execution.stages), 'execution event arrays')
  for (const run of execution.runs) {
    keys(run, ['status', 'startedAt', 'endedAt', 'observedThroughAt', 'activeWallSecondsLowerBound',
      'calendarElapsedSecondsLowerBound', 'exactCalendarElapsedSeconds', 'observedClockDifferenceSeconds',
      'exactActiveWallSeconds', 'endKnown', 'exitCode', 'designSha256', 'command', 'amendmentSha256', 'provenance',
      'replayEqualityFailures', 'replayEqualityFailuresByArmProfile', 'cliTimeoutFailures', 'cliTimeoutLimitsSeconds', 'stages'], 'invocation report')
    if (run.provenance !== null) keys(run.provenance, ['appCommit', 'recordsCommit', 'games'], 'invocation provenance')
    breakdown(run, 'invocation')
    claim(Array.isArray(run.stages), 'invocation stages')
    for (const stage of run.stages) {
      onlyKeys(stage, ['stage', 'status', 'endUnknown', 'activeWallSecondsLowerBound', 'exactActiveWallSeconds',
        'calendarElapsedSecondsLowerBound', 'exactCalendarElapsedSeconds', 'observedClockDifferenceSeconds',
        'outputSeen', 'cliTimeoutLimitSeconds', ...countKeys], 'invocation stage')
      const failures = stage.replayEqualityFailures ?? 0
      integer(failures, 'stage rejected replays')
      if (failures) claim(ARMS.some(arm => rule.profiles.some(profile => stage.stage === `${arm}/observed/${profile}`))
        && stage.status === 'failed', 'rejected replays belong to a failed observed stage')
      const timeouts = stage.cliTimeoutFailures ?? 0
      integer(timeouts, 'stage CLI timeouts')
      if (timeouts) {
        claim(ARMS.some(arm => rule.profiles.some(profile => stage.stage === `${arm}/CLI/${profile}`))
          && ['failed', 'incomplete'].includes(stage.status), 'timeouts belong to a failed or incomplete CLI stage')
        claim(Number.isInteger(stage.cliTimeoutLimitSeconds) && stage.cliTimeoutLimitSeconds > 0, 'stage timeout has a positive integer limit')
        if (stage.status !== 'incomplete') {
          integer(stage.failedGames, 'completed CLI stage failed-game count')
          claim(timeouts <= stage.failedGames, 'CLI timeout markers do not exceed the final failure count')
        }
      } else claim(stage.cliTimeoutLimitSeconds === undefined, 'a stage without timeouts has no timeout limit')
    }
    const stageTotal = run.stages.reduce((n, stage) => n + (stage.replayEqualityFailures ?? 0), 0)
    claim(stageTotal === run.replayEqualityFailures, 'invocation rejections reconcile to observed stages')
    for (const arm of ARMS) for (const profile of rule.profiles) {
      const total = run.stages.filter(stage => stage.stage === `${arm}/observed/${profile}`)
        .reduce((n, stage) => n + (stage.replayEqualityFailures ?? 0), 0)
      claim(total === run.replayEqualityFailuresByArmProfile[arm][profile], 'invocation rejection arm/profile matches its stage')
    }
    if (run.exitCode === 0) claim(run.replayEqualityFailures === 0, 'a successful invocation contains no rejected replay')
    timeoutSummary(run, run.stages.reduce((n, stage) => n + (stage.cliTimeoutFailures ?? 0), 0),
      run.stages.filter(stage => stage.cliTimeoutFailures).map(stage => stage.cliTimeoutLimitSeconds), 'invocation')
    if (run.exitCode === 0) claim(run.cliTimeoutFailures === 0, 'a successful invocation contains no CLI timeouts')
  }
  claim(sum(execution.runs, 'replayEqualityFailures') === execution.replayEqualityFailures,
    'execution rejections sum across invocations')
  for (const arm of ARMS) for (const profile of rule.profiles) {
    const total = execution.runs.reduce((n, run) => n + run.replayEqualityFailuresByArmProfile[arm][profile], 0)
    claim(total === execution.replayEqualityFailuresByArmProfile[arm][profile], 'execution rejection breakdown sums across invocations')
  }
  let stageTotal = 0
  for (const stage of execution.stages) {
    keys(stage, ['stage', 'activeWallSecondsLowerBound', 'exactActiveWallSeconds', 'endUnknown',
      'calendarElapsedSecondsLowerBound', 'exactCalendarElapsedSeconds', 'observedClockDifferenceSeconds',
      'completeInvocations', 'failedInvocations', 'incompleteInvocations', 'cliTimeoutLimitsSeconds', 'countsAcrossInvocations'], 'aggregate stage')
    onlyKeys(stage.countsAcrossInvocations, countKeys, 'aggregate stage counts')
    const rows = execution.runs.flatMap(run => run.stages.filter(row => row.stage === stage.stage))
    const failures = stage.countsAcrossInvocations.replayEqualityFailures ?? 0
    integer(failures, 'aggregate stage rejected replays')
    claim(failures === rows.reduce((n, row) => n + (row.replayEqualityFailures ?? 0), 0), 'aggregate stage rejections sum across invocations')
    if (failures) claim(stage.failedInvocations > 0, 'aggregate replay rejections include a failed stage')
    stageTotal += failures
    const timeouts = stage.countsAcrossInvocations.cliTimeoutFailures ?? 0
    timeoutSummary({ cliTimeoutFailures: timeouts, cliTimeoutLimitsSeconds: stage.cliTimeoutLimitsSeconds },
      rows.reduce((n, row) => n + (row.cliTimeoutFailures ?? 0), 0),
      rows.filter(row => row.cliTimeoutFailures).map(row => row.cliTimeoutLimitSeconds), 'aggregate stage')
    if (timeouts) claim(stage.failedInvocations + stage.incompleteInvocations > 0, 'aggregate CLI timeouts include a failed or incomplete stage')
  }
  claim(stageTotal === execution.replayEqualityFailures, 'aggregate stage rejections equal the execution total')
  timeoutSummary(execution, sum(execution.runs, 'cliTimeoutFailures'), execution.runs.flatMap(run => run.cliTimeoutLimitsSeconds), 'execution')
  claim(execution.stages.reduce((n, stage) => n + (stage.countsAcrossInvocations.cliTimeoutFailures ?? 0), 0)
    === execution.cliTimeoutFailures, 'aggregate stage timeouts equal the execution total')
}

// These are two clocks over the same observed window. Their signed difference
// is retained without attributing it to sleep, CPU use, downtime or a failure.
function elapsedClocks(row, censored, label) {
  finite(row.activeWallSecondsLowerBound, `${label}: observed monotonic elapsed`)
  finite(row.calendarElapsedSecondsLowerBound, `${label}: observed calendar elapsed`)
  finite(row.observedClockDifferenceSeconds, `${label}: signed clock difference`, false)
  near(row.observedClockDifferenceSeconds, row.calendarElapsedSecondsLowerBound - row.activeWallSecondsLowerBound,
    `${label}: calendar minus monotonic elapsed`)
  if (censored) claim(row.exactActiveWallSeconds === null && row.exactCalendarElapsedSeconds === null,
    `${label}: unknown end leaves both exact durations null`)
  else {
    near(row.exactActiveWallSeconds, row.activeWallSecondsLowerBound, `${label}: observed monotonic endpoint`)
    near(row.exactCalendarElapsedSeconds, row.calendarElapsedSecondsLowerBound, `${label}: observed calendar endpoint`)
  }
}

/** Monotonic and calendar elapsed time are exact only where an exit was observed. An
 * interrupted invocation ends at its last logged observation for accounting;
 * each clock's elapsed duration is then a lower bound under that clock,
 * never an invented exit time or a claim about CPU or awake time.
 */
export function validateExecutionReport(execution, compare, rule, design, amendment) {
  validateDesign(design, compare)
  validateAmendment(amendment, design)
  validateReplayEqualityFailures(execution, rule)
  claim(execution.schema === 'second-look-fresh-execution/3', 'execution report schema')
  for (const k of ['appCommit', 'recordsCommit', 'games']) same(execution[k], compare[k], `execution ${k} matches comparison`)
  same(execution.designSha256, design.designSha256, 'execution identifies the registered design contents')
  same(execution.amendmentSha256, amendment.amendmentSha256, 'execution identifies the approved acquisition amendment')
  same(execution.command, AMENDED_COMMAND, 'final comparison uses the authorized amended acquisition')
  for (const k of ['invocations', 'successfulInvocations', 'failedInvocations', 'unknownEndInvocations', 'amendedInvocations']) integer(execution[k], `execution ${k}`)
  claim(execution.amendedInvocations > 0 && execution.amendedInvocations <= execution.invocations,
    'execution includes the approved acquisition amendment')
  claim(execution.invocations > 0 && execution.invocations === execution.successfulInvocations + execution.failedInvocations + execution.unknownEndInvocations,
    'finished and interrupted wrapper invocation counts')
  claim(execution.lastInvocationSucceeded === true && execution.successfulInvocations > 0, 'the comparison run finished successfully')
  for (const k of ['calendarObservedSeconds', 'knownBetweenInvocationSeconds', 'unallocatedGapSeconds']) finite(execution[k], `execution ${k}`)
  const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  claim(date(execution.startedAt) && date(execution.observedThroughAt), 'execution observation timestamps')
  near(execution.calendarObservedSeconds, (Date.parse(execution.observedThroughAt) - Date.parse(execution.startedAt)) / 1000,
    'calendar span ends at the last observation')
  const lowerBound = execution.unknownEndInvocations > 0
  same(execution.timingIsLowerBound, lowerBound, 'unknown exits make both elapsed totals lower bounds')
  elapsedClocks(execution, lowerBound, 'execution')
  const stages = ['preparation', ...ARMS.flatMap(a => ['CLI', 'observed'].flatMap(k => rule.profiles.map(p => `${a}/${k}/${p}`))), 'references', 'analysis']
  claim(Array.isArray(execution.runs) && execution.runs.length === execution.invocations, 'execution includes every observed invocation')
  const runs = execution.runs
  same(execution.command, runs.at(-1).command, 'execution command describes the final invocation')
  claim(runs.filter(r => r.amendmentSha256 !== null).length === execution.amendedInvocations,
    'amended invocation count reconciles')
  claim(runs.filter(r => r.exitCode === 0).length === execution.successfulInvocations
    && runs.filter(r => r.endKnown && Number.isInteger(r.exitCode) && r.exitCode !== 0).length === execution.failedInvocations
    && runs.filter(r => !r.endKnown).length === execution.unknownEndInvocations
    && runs.at(-1).exitCode === 0, 'execution outcomes match invocation records')
  same(execution.startedAt, runs[0].startedAt, 'execution begins with the first invocation')
  same(execution.endedAt, runs.at(-1).endedAt, 'execution exit timestamp is the last known wrapper exit')
  same(execution.observedThroughAt, runs.at(-1).observedThroughAt, 'execution observation endpoint matches its last invocation')
  let knownGaps = 0, unallocatedGaps = 0, amendmentSeen = false
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]
    same(r.designSha256, execution.designSha256, 'all invocations identify the same design contents')
    const amended = r.amendmentSha256 !== null
    same(r.command, amended ? AMENDED_COMMAND : COMMAND, 'invocation command matches its acquisition identity')
    if (amended) same(r.amendmentSha256, amendment.amendmentSha256, 'amended invocation identifies the approved contents')
    claim(amended || !amendmentSeen, 'original acquisition does not resume after amended acquisition begins')
    amendmentSeen ||= amended
    claim(date(r.startedAt) && date(r.observedThroughAt) && Date.parse(r.observedThroughAt) >= Date.parse(r.startedAt), 'invocation observation window')
    claim(typeof r.endKnown === 'boolean', 'invocation exit-known flag')
    elapsedClocks(r, !r.endKnown, 'invocation')
    if (r.endKnown) {
      claim(r.status === 'finished' && Number.isInteger(r.exitCode) && date(r.endedAt), 'finished invocation has an observed exit')
      same(r.observedThroughAt, r.endedAt, 'finished observation endpoint is the observed exit')
    } else {
      claim(r.status === 'interrupted-end-unknown' && r.exitCode === null && r.endedAt === null,
        'an unknown exit stays unknown')
    }
    near(r.calendarElapsedSecondsLowerBound, (Date.parse(r.observedThroughAt) - Date.parse(r.startedAt)) / 1000,
      'invocation calendar window matches its observed timestamps')
    if (i) {
      const previous = runs[i - 1]
      const gap = (Date.parse(r.startedAt) - Date.parse(previous.observedThroughAt)) / 1000
      claim(gap >= 0, 'logged invocation observation windows do not overlap')
      // A gap after an unknown exit may contain more runtime. It is not
      // identified as idle time or as a known between-invocation interval.
      if (previous.endKnown) knownGaps += gap
      else unallocatedGaps += gap
    }
    if (r.provenance) for (const k of ['appCommit', 'recordsCommit', 'games']) same(r.provenance[k], compare[k], `invocation ${k} matches comparison`)
    claim(Array.isArray(r.stages) && r.stages.length > 0 && r.stages.length <= stages.length, 'invocation stage sequence')
    same(r.stages.map(s => s.stage), stages.slice(0, r.stages.length), 'invocation stages are an ordered prefix')
    for (const [index, s] of r.stages.entries()) {
      claim(['complete', 'failed', 'incomplete'].includes(s.status) && typeof s.endUnknown === 'boolean', 'invocation stage status')
      elapsedClocks(s, s.endUnknown, 'invocation stage')
      if (s.endUnknown) {
        claim(!r.endKnown && index === r.stages.length - 1 && s.status !== 'complete',
          'only the last interrupted stage has an unknown end')
      }
    }
    claim(r.stages.some(s => s.endUnknown) === !r.endKnown, 'unknown invocation end is carried by its last stage')
    if (r.exitCode === 0) claim(r.stages.length === stages.length && r.stages.every(s => s.status === 'complete'), 'successful invocation finished every stage')
    near(sum(r.stages, 'activeWallSecondsLowerBound'), r.activeWallSecondsLowerBound, 'invocation monotonic stage windows reconcile')
    near(sum(r.stages, 'calendarElapsedSecondsLowerBound'), r.calendarElapsedSecondsLowerBound, 'invocation calendar stage windows reconcile')
    near(sum(r.stages, 'observedClockDifferenceSeconds'), r.observedClockDifferenceSeconds, 'invocation signed clock differences reconcile')
  }
  near(knownGaps, execution.knownBetweenInvocationSeconds, 'known between-invocation intervals use observed exits')
  near(unallocatedGaps, execution.unallocatedGapSeconds, 'unknown post-output gaps remain unallocated')
  near(sum(runs, 'activeWallSecondsLowerBound'), execution.activeWallSecondsLowerBound, 'invocation monotonic lower bounds reconcile')
  near(sum(runs, 'calendarElapsedSecondsLowerBound'), execution.calendarElapsedSecondsLowerBound, 'invocation calendar lower bounds reconcile')
  near(sum(runs, 'observedClockDifferenceSeconds'), execution.observedClockDifferenceSeconds, 'signed invocation clock differences reconcile')
  near(execution.calendarObservedSeconds, execution.calendarElapsedSecondsLowerBound + knownGaps + unallocatedGaps,
    'observed calendar horizon equals invocation calendar windows and both kinds of gap')

  same(execution.stages.map(s => s.stage), stages, 'complete ordered execution stages')
  for (const s of execution.stages) {
    const rows = runs.flatMap(r => r.stages.filter(row => row.stage === s.stage))
    same(s.endUnknown, rows.some(row => row.endUnknown), `${s.stage}: interrupted contribution remains marked`)
    elapsedClocks(s, s.endUnknown, s.stage)
    near(s.activeWallSecondsLowerBound, sum(rows, 'activeWallSecondsLowerBound'), `${s.stage}: monotonic durations reconcile`)
    near(s.calendarElapsedSecondsLowerBound, sum(rows, 'calendarElapsedSecondsLowerBound'), `${s.stage}: calendar durations reconcile`)
    near(s.observedClockDifferenceSeconds, sum(rows, 'observedClockDifferenceSeconds'), `${s.stage}: signed clock differences reconcile`)
    for (const [key, status] of [['completeInvocations', 'complete'], ['failedInvocations', 'failed'], ['incompleteInvocations', 'incomplete']]) {
      integer(s[key], `${s.stage}: ${key}`)
      claim(s[key] === rows.filter(row => row.status === status).length, `${s.stage}: ${status} count reconciles`)
    }
    claim(s.completeInvocations >= 1, `${s.stage}: comparison has completed every stage`)
    object(s.countsAcrossInvocations, `${s.stage}: logged counts`)
    for (const [key, count] of Object.entries(s.countsAcrossInvocations)) {
      integer(count, `${s.stage}: ${key}`)
      near(count, rows.reduce((n, row) => n + (row[key] ?? 0), 0), `${s.stage}: ${key} sums logged attempts and resumptions`)
    }
  }
  near(sum(execution.stages, 'activeWallSecondsLowerBound'), execution.activeWallSecondsLowerBound, 'stage monotonic lower bounds sum to execution monotonic lower bound')
  near(sum(execution.stages, 'calendarElapsedSecondsLowerBound'), execution.calendarElapsedSecondsLowerBound, 'stage calendar lower bounds sum to execution calendar lower bound')
  near(sum(execution.stages, 'observedClockDifferenceSeconds'), execution.observedClockDifferenceSeconds, 'stage signed clock differences sum to the observed execution difference')
  claim(execution.measurementCodeUnchanged === true && execution.protocolUnchanged === true, 'measurement sources and protocol match their registered contents')
  same(execution.protocolSha256, design.manifest.protocol.sha256, 'execution protocol hash matches the manifest')
  keys(execution.measurementSourceHashes, MEASUREMENT_PATHS, 'all registered measurement source hashes')
  for (const path of MEASUREMENT_PATHS) {
    const pair = execution.measurementSourceHashes[path]
    same(pair.expectedSha256, design.manifest.files[path], `${path}: expected hash comes from the manifest`)
    same(pair.actualSha256, pair.expectedSha256, `${path}: measured source contents unchanged`)
  }
}

/** Validate completed aggregate reports without opening them or per-game data.
 * Returns independently derived labels for the generator's outcome checks.
 * Missing reference evidence and empty denominators remain legitimate
 * unresolved outcomes; this validator never demands a favorable result.
 */
export function validateReports({ compare, phase1, execution, rule, design, amendment }) {
  object(compare, 'comparison')
  object(rule, 'rule')
  validateDesign(design, compare)
  same(rule.profiles, ['phone', 'desktop', 'routine'], 'fixed profile family')
  same(rule.devices, ['phone', 'desktop'], 'fixed device family')
  claim(rule.effects === 2 * rule.devices.length + rule.profiles.length, 'the seven-effect decision family')
  for (const k of ['games', 'draws', 'seed', 'effects', 'referenceNodes', 'referenceMultiPv', 'referenceAttempts']) integer(rule[k], `rule.${k}`)
  claim(rule.games > 0 && rule.draws > 0 && rule.referenceAttempts === 2, 'positive fixed sample/draw counts and one reference retry')
  for (const k of ['alpha', 'agreement', 'qualityMargin']) claim(rule[k] > 0 && rule[k] < 1, `rule.${k}: positive fraction`)
  claim(compare.phase === 2 && compare.games === rule.games, 'phase two uses every fixed game')
  same(compare.rule, rule, 'comparison rule matches the approved rule')
  near(compare.correctedCoverage, 1 - rule.alpha / rule.effects, 'Bonferroni interval coverage')
  for (const k of ['appCommit', 'recordsCommit']) digest(compare[k], k, 40)
  for (const k of ['candidateSha256', 'casesSha256']) digest(compare[k], k)
  claim(typeof compare.engine === 'string' && compare.engine.length > 0 && typeof compare.data === 'string' && compare.data.length > 0, 'engine and data are named')
  claim(compare.nodeOptions.Threads === 1 && compare.nodeOptions.Hash === 128, 'measured Node thread and hash settings')
  const counts = phaseOne(phase1, compare, rule)
  keys(compare.gaps, rule.devices, 'device results')
  keys(compare.quality, rule.profiles, 'quality results')
  keys(compare.coverage, rule.profiles, 'coverage results')
  keys(compare.cost, rule.profiles, 'cost results')

  for (const p of rule.devices) {
    const row = compare.gaps[p]
    for (const a of ARMS) {
      const g = row[a], label = `${p}/${a}`
      claim(g.games === rule.games && g.plies === counts.plies, `${label}: all games and plies`)
      for (const k of ['miss', 'extra', 'classesDiffer']) estimate(g[k], rule, `${label}.${k}`, { ratio: true })
      for (const kind of ['blunders', 'inaccuracies']) for (const k of ['miss', 'extra']) estimate(g[kind][k], rule, `${label}.${kind}.${k}`, { ratio: true })
      for (const r of [g, g.blunders, g.inaccuracies]) {
        claim(r.miss.den <= counts.plies && r.extra.den <= counts.plies, `${label}: class sets bounded by plies`)
        claim(r.miss.den - r.miss.num === r.extra.den - r.extra.num, `${label}: shared class intersection reconciles`)
      }
      claim(g.classesDiffer.den === counts.plies, `${label}: class changes use every ply`)
      for (const k of ['missed', 'extra']) {
        const w = g.where[k], n = k === 'missed' ? g.miss.num : g.extra.num
        for (const [name, value] of Object.entries(w)) { integer(value, `${label}.${k}.${name}`); claim(value <= n, `${label}: disagreement attribution bounded`) }
        claim(w.deviceAttempted + w.deviceNotAttempted === n && w.deviceVerified + w.deviceNotVerified === n,
          `${label}: attempted and retained evidence attribution reconcile separately`)
      }
      integer(g.accuracy.sides, `${label}: accuracy sides`)
      claim(g.accuracy.sides <= 2 * rule.games, `${label}: at most both sides of each game`)
      if (g.accuracy.sides) {
        finite(g.accuracy.bias, `${label}: accuracy bias`, false)
        finite(g.accuracy.mae, `${label}: accuracy MAE`)
        finite(g.accuracy.largest, `${label}: accuracy largest gap`)
        claim(Math.abs(g.accuracy.bias) <= g.accuracy.mae + 1e-10 && g.accuracy.mae <= g.accuracy.largest + 1e-10,
          `${label}: accuracy summaries reconcile`)
      } else claim(g.accuracy.bias === null && g.accuracy.mae === null && g.accuracy.largest === null, `${label}: absent accuracy is null`)
    }
    for (const [key, share] of [['deltaMiss', 'miss'], ['deltaExtra', 'extra']]) {
      estimate(row[key], rule, `${p}.${key}`, { decision: true })
      if (row[key].value !== null) near(row[key].value, row.candidate[share].num / row.candidate[share].den - row.baseline[share].num / row.baseline[share].den,
        `${p}.${key}: paired difference of pooled shares`)
    }
  }
  for (const a of ARMS) {
    const [first, ...rest] = rule.devices.map(p => compare.gaps[p][a])
    for (const g of rest) {
      claim(g.miss.den === first.miss.den, `${a}: devices use the same arm's routine serious set`)
      for (const k of ['blunders', 'inaccuracies']) claim(g[k].miss.den === first[k].miss.den, `${a}: common routine ${k} set`)
    }
  }

  for (const p of rule.profiles) {
    const q = compare.quality[p]
    for (const k of ['common', 'referenceUnresolved', 'baselineIncomplete', 'candidateIncomplete']) integer(q[k], `${p} quality.${k}`)
    claim(q.common <= counts.plies && q.referenceUnresolved <= q.common, `${p}: common/reference sets bounded by plies`)
    for (const a of ARMS) {
      const e = q[`${a}Error`], incomplete = q[`${a}Incomplete`]
      estimate(e, rule, `${p}.${a}Error`, { ratio: true })
      claim(e.den === q.common && incomplete <= q.common, `${p}/${a}: quality denominator includes common attempts`)
      claim(e.num <= q.common - q.referenceUnresolved && e.num >= Math.max(0, incomplete - q.referenceUnresolved),
        `${p}/${a}: wrong verdicts and incomplete looks respect unresolved references`)
      if (q.referenceUnresolved) claim(!e.valid && e.value === null, `${p}: unresolved reference prevents an arm error estimate`)
    }
    estimate(q.deltaError, rule, `${p}.deltaError`, { decision: true })
    if (q.referenceUnresolved) claim(!q.deltaError.valid && q.deltaError.value === null, `${p}: unresolved reference prevents a guard decision`)
    if (q.deltaError.value !== null) near(q.deltaError.value, (q.candidateError.num - q.baselineError.num) / q.common, `${p}: paired quality difference`)
    keys(compare.coverage[p], ARMS, `${p} coverage arms`)
    for (const a of ARMS) {
      const v = compare.coverage[p][a], c = compare.cost[p][a], label = `${p}/${a}`
      for (const [k, value] of Object.entries(v)) if (k !== 'recordEvidence') integer(value, `${label} coverage.${k}`)
      claim(v.games === rule.games && v.plies === counts.plies && v.positions === counts.positions && c.games === rule.games,
        `${label}: coverage and cost include the entire sample`)
      for (const k of ['flags', 'initialLooks', 'unknownRecords', 'tablebaseRecords']) claim(v[k] <= counts.plies, `${label}: ${k} bounded by plies`)
      claim(v.flaggedNotAttempted <= v.flags && v.adaptiveRetries <= v.initialLooks && v.incompleteSecondLooks <= v.initialLooks
        && v.tablebasePositions <= counts.positions, `${label}: coverage subsets bounded`)
      Object.values(v.recordEvidence).forEach(n => integer(n, `${label}: record evidence count`))
      claim(Object.values(v.recordEvidence).reduce((a, b) => a + b, 0) === counts.plies, `${label}: record evidence covers all plies`)
      integer(c.looks, `${label}: looks`)
      claim(c.looks === v.initialLooks && q.common <= c.looks && q[`${a}Incomplete`] <= v.incompleteSecondLooks, `${label}: common and all look counts reconcile`)
      for (const k of ['fullReviewSeconds', 'secondLookSeconds']) finite(c[k], `${label}.${k}`)
      claim(c.fullReviewSeconds + 1e-6 >= c.secondLookSeconds, `${label}: second looks fit within review duration`)
      distribution(c.secondsPerLook, `${label}.secondsPerLook`, { exactN: c.looks, total: c.secondLookSeconds })
      distribution(c.acceptedDepth, `${label}.acceptedDepth`, { maxN: c.looks })
      for (const kind of ['initial', 'adaptive', 'allAttempts']) attemptCost(c[kind], `${label}.${kind}`, a)
      claim(c.initial.attempts === c.looks && c.adaptive.attempts === v.adaptiveRetries, `${label}: attempt counts match coverage`)
      for (const k of ['attempts', 'seconds', 'candidateSearchSeconds', 'resetCalls', 'resetSeconds', 'restrictedCalls', 'restrictedAttempts', 'restrictedSeconds', 'failedCalls'])
        near(c.allAttempts[k], c.initial[k] + c.adaptive[k], `${label}: initial and adaptive ${k} reconcile`)
      near(c.allAttempts.seconds, c.secondLookSeconds, `${label}: all attempt seconds equal second-look seconds`)
    }
    distribution(compare.cost[p].commonLookChange.seconds, `${p}: paired common-look seconds`, { exactN: q.common, signed: true })
    distribution(compare.cost[p].commonLookChange.acceptedDepth, `${p}: paired retained depth`, { maxN: q.common, signed: true })
  }
  const ref = compare.reference
  for (const k of ['positions', 'attempts', 'unresolved']) integer(ref[k], `reference.${k}`)
  const common = rule.profiles.map(p => compare.quality[p].common)
  const unresolved = rule.profiles.map(p => compare.quality[p].referenceUnresolved)
  claim(ref.positions >= Math.max(...common) && ref.positions <= Math.min(counts.plies, common.reduce((a, b) => a + b, 0)), 'reference positions form the union of common sets')
  claim(ref.unresolved >= Math.max(...unresolved) && ref.unresolved <= Math.min(ref.positions, unresolved.reduce((a, b) => a + b, 0)), 'unresolved references form the union of profile uses')
  claim(ref.attempts >= ref.positions + ref.unresolved && ref.attempts <= rule.referenceAttempts * ref.positions, 'fixed reference retry allowance')
  finite(ref.seconds, 'reference seconds')
  distribution(ref.secondsPerAttempt, 'reference seconds per attempt', { exactN: ref.attempts, total: ref.seconds })
  distribution(ref.depth, 'reference depth', { maxN: ref.attempts })

  const derived = decisionFromEstimates(compare, rule)
  for (const p of rule.devices) {
    same(compare.gaps[p].narrows, derived.device[p].narrows, `${p}: independent narrowing rule`)
    for (const a of ARMS) same(compare.gaps[p][a].predecessorStatus, derived.device[p][a], `${p}/${a}: independent agreement bar`)
  }
  for (const p of rule.profiles) same(compare.quality[p].status, derived.quality[p], `${p}: independent quality rule`)
  same(compare.decision, derived.decision, 'independent final disposition')
  // The original execution report is a preserved stopped checkpoint. The
  // final paper validates the later completed acquisition separately; passing
  // the old report here must still satisfy the original complete-run checks.
  if (execution !== undefined) validateExecutionReport(execution, compare, rule, design, amendment)
  return derived
}

/** Local source facts only. Call with the exact pinned/candidate directories,
 * manifest and candidate recipe; this does not import or run app instruments.
 * A matching source hash binds the saved-review prose to the measured pin.
 */
export function validateSourceClaims({ appDir, candidateDir, candidateManifest, recipePath, pin }) {
  claim(pin.commit === APP, 'source claims apply to the measured app pin')
  const git = (directory, args, label) => {
    const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' })
    claim(result.status === 0, `${label}: local git check succeeds`)
    return result.stdout.trim()
  }
  // Tracked source only. Private runtime caches and ignored build products do
  // not change this check; no diff content or local path is printed.
  const expectedPaths = ['src/services/review/pipeline/run.ts', 'src/services/review/ports.ts']
  for (const [label, directory] of [['pinned app', appDir], ['candidate', candidateDir]]) {
    same(git(directory, ['rev-parse', 'HEAD'], label), pin.commit, `${label}: HEAD equals the measured pin`)
    const changed = git(directory, ['diff', '--name-only', 'HEAD'], label).split('\n').filter(Boolean).sort()
    same(changed, label === 'candidate' ? expectedPaths : [], `${label}: exactly the registered tracked changes`)
  }
  same(candidateManifest.appCommit, pin.commit, 'candidate source pin')
  same(candidateManifest.recordsCommit, pin.records, 'candidate records pin')
  const { candidateSha256, ...payload } = candidateManifest
  same(candidateSha256, hash(JSON.stringify(payload)), 'candidate manifest digest')
  same(candidateManifest.recipeSha256, hash(readFileSync(recipePath)), 'candidate recipe unchanged')
  same(candidateManifest.replacements.map(r => r.path).sort(), expectedPaths, 'candidate changes exactly the registered source files')
  for (const r of candidateManifest.replacements) {
    same(hash(readFileSync(join(appDir, r.path))), r.sourceSha256, `pinned ${r.path} unchanged`)
    same(hash(readFileSync(join(candidateDir, r.path))), r.candidateSha256, `candidate ${r.path} matches recipe output`)
  }
  const source = path => readFileSync(join(appDir, path), 'utf8')
  const patched = path => readFileSync(join(candidateDir, path), 'utf8')
  const addedPort = "  newGame?: EngineService['newGame']\n"
  const addedGuard = "  if (!engine.newGame) throw new Error('second-look-fresh requires engine.newGame')\n"
  const runPath = 'src/services/review/pipeline/run.ts'
  const portPath = 'src/services/review/ports.ts'
  claim(patched(portPath).split(addedPort).length === 2
    && patched(portPath).replace(addedPort, '') === source(portPath), 'the review port only exposes the existing reset')
  let restored = patched(runPath)
  for (const added of [addedGuard, "    await engine.newGame('analyst')\n", "      await engine.newGame('analyst')\n"]) {
    // Match whole lines: the adaptive indentation also contains the initial
    // indentation as a suffix, so a plain substring count would be ambiguous.
    const lines = restored.split('\n')
    const target = added.slice(0, -1)
    claim(lines.filter(l => l === target).length === 1, 'one required initial/adaptive reset or availability guard')
    restored = lines.filter(l => l !== target).join('\n')
  }
  claim(restored === source(runPath), 'the pipeline only adds the guard and the initial/adaptive resets')
  claim(patched(runPath).includes("    await engine.newGame('analyst')\n    const ev = await gatherDeepEvidence(")
    && patched(runPath).includes("      await engine.newGame('analyst')\n      const next = await gatherDeepEvidence("), 'each reset immediately precedes its complete second look')
  const gameReview = source('src/features/gamereview/GameReview.tsx')
  same(hash(gameReview), GAME_REVIEW_SHA256, 'saved-device default and optional coach comparison source')
  claim(gameReview.includes('setShowCoach(false)') && gameReview.includes('const kept = await reviewService.stored(key)')
    && gameReview.includes('if (!kept || !madeOnDevice(kept)) return')
    && gameReview.includes('if (coach && gen === runGen.current) setCoachReview(coach)')
    && gameReview.includes('onClick: toggleCoach'), 'Game Review opens saved device evidence and offers a coach comparison')
  const session = source('src/services/engine/uci/session.ts')
  claim(session.includes("await this.control(['ucinewgame', 'isready'], (line) => line === 'readyok', 20000)"), 'newGame clears UCI memory and waits for readiness')
  const service = source('src/services/engine/service.ts')
  claim(service.includes("if (scope !== 'opponent') for (const l of pool) jobs.push(l.get().then((s) => s.newGame()))")
    && service.includes("if (scope !== 'analyst' && opponent) jobs.push(opponent.get().then((s) => s.newGame()))"), 'analyst reset targets the analyst pool')
  const build = source('src/services/engine/buildManifest.ts')
  claim(/ANALYST_OPTIONS[^=]*=\s*\{\s*Threads: 1,\s*Hash: 64,/.test(build)
    && /NODE_ANALYST_OPTIONS[^=]*=\s*\{\s*Threads: 1,\s*Hash: 128,/.test(build), 'device and Node hashes differ')
  claim(source('src/services/review/pipeline/evidence.ts').includes("cache: opts.cache ?? 'use'"), 'evidence gathering retains its cache policy')
  claim(source('src/adapters/node/engine/index.ts').includes("store: opts.evalCache === false ? null : jsonlEvalStore"), 'Node evaluation cache can be disabled by the study')
  claim(source('src/adapters/browser/engine/index.ts').includes('store: idbEvalStore()'), 'browser devices retain their evaluation store')
  const metrics = source('src/services/metrics/facts/derive.ts')
  claim(metrics.includes("const SERIOUS_CLASSES = new Set<MoveClass>(['blunder', 'mistake', 'miss'])")
    && metrics.includes('if (cls !== null) return SERIOUS_CLASSES.has(cls)'), 'the app does not count an unknown final class as serious')
  return { appCommit: APP, candidateSha256, gameReviewSha256: GAME_REVIEW_SHA256,
    savedDeviceFirst: true, coachComparisonAvailable: true, deviceHash: 64, nodeHash: 128 }
}
