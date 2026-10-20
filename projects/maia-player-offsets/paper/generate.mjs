// Result paper. Reads public aggregates only, never policies or game files.
// A new result needs an internal aggregate review before this paper changes.
//   bridge/run.sh projects/maia-player-offsets/paper/generate.mjs
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { LAB_DIR, projectDir } from '../../../bridge/lib/lab.mjs'
import { Generated, fixed, percent, word, esc } from '../../paper.mjs'
import { BASE, CANDIDATES, OFFSETS, SLOPES, DRAWS, SEED, GUARD_MARGIN } from '../design.mjs'

// Filled after inspecting the completed aggregate and outcome branches. This
// records our internal check; Claude's later review remains a separate step.
const REVIEWED_RESULT_SHA256 = 'c7c7276f9db3f5c0524822f6e06d4ac6a918135ff8d6c0c078dce29cb4b30a64'
const check = (ok, message) => { if (!ok) throw new Error(message) }
const finite = x => typeof x === 'number' && Number.isFinite(x)
const same = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= 1e-10
const exact = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const countOK = x => Number.isInteger(x) && x >= 0
const shareOK = x => finite(x) && x >= 0 && x <= 1
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const root = projectDir('maia-player-offsets')
const resultFile = join(root, 'results/offsets.json')
check(typeof REVIEWED_RESULT_SHA256 === 'string' && /^[a-f0-9]{64}$/.test(REVIEWED_RESULT_SHA256), 'result paper has no internally reviewed aggregate digest yet')
check(fs.existsSync(resultFile) && hash(resultFile) === REVIEWED_RESULT_SHA256, 'result differs from the aggregate reviewed for this paper')
const r = read(resultFile), rt = read(join(root, 'results/runtime.json')), protocol = read(join(root, 'results/phase1.json'))
const execution = read(join(root, 'results/execution.json'))
const predecessor = read(join(projectDir('maia-rating-offset'), 'results/offset.json'))
const pin = read(join(LAB_DIR, 'bridge/chess.json'))
const manifestPath = 'projects/maia-player-offsets/protocol-manifest.json'
const manifestFile = join(LAB_DIR, manifestPath)
const manifest = read(manifestFile)
const committedHash = file => createHash('sha256').update(execFileSync('git', ['show', `HEAD:${file}`], { cwd: LAB_DIR, stdio: ['ignore', 'pipe', 'ignore'] })).digest('hex')
check(r.phase === 2 && rt.phase === 2 && rt.status === 'complete' && rt.schema === 'maia-player-offsets-runtime/1', 'paper requires completed phase-2 results and runtime')
check([r, rt, protocol, manifest].every(x => x.app === pin.commit && x.records === pin.records), 'paper app or records differ from the pin')
check(predecessor.app === pin.commit && predecessor.kept === BASE && predecessor.fitted === BASE && predecessor.bestBySide.him.offset !== predecessor.bestBySide.opponents.offset && new Set(predecessor.byRating.map(g => g.best)).size > 1, 'the predecessor no longer supports the opening summary')
check(rt.resultsSha256?.offsetsJson === REVIEWED_RESULT_SHA256 && rt.resultsSha256?.offsetsMd === hash(join(root, 'results/offsets.md')), 'runtime does not bind the current result files')
check(manifest.schema === 'maia-player-offsets-protocol/1' && manifest.protocol?.file === 'projects/maia-player-offsets/protocol.md', 'invalid protocol content manifest')
check(hash(manifestFile) === committedHash(manifestPath) && rt.protocolManifestSha256 === hash(manifestFile), 'runtime protocol manifest differs from its committed contents')
check(manifest.protocol.sha256 === hash(join(LAB_DIR, manifest.protocol.file)) && manifest.protocol.sha256 === committedHash(manifest.protocol.file), 'frozen protocol differs from its committed contents')
check(rt.protocolSha256 === manifest.protocol.sha256 && protocol.provenance.sourceHashes['projects/maia-player-offsets/README.md'] === manifest.protocol.sha256, 'runtime or phase-one rule differs from the frozen protocol')
const requiredSources = [
  'bridge/chess.json', 'bridge/run.sh', 'bridge/lib/chess.mjs', 'bridge/lib/lab.mjs',
  'projects/maia-rating-offset/positions.mts', 'projects/accuracy-vs-chesscom/build-evidence.mjs', manifest.protocol.file,
  ...['run-phase2.mjs', 'prepare.mjs', 'design.mjs', 'io.mjs', 'policies.mts', 'weights.mts', 'evidence.mjs', 'review-one.mts', 'events.mjs', 'fit.mjs'].map(f => `projects/maia-player-offsets/${f}`),
]
check(exact([...requiredSources].sort(), Object.keys(rt.sourceSha256 ?? {}).sort()), 'runtime source set differs from the required protocol sources')
check(exact(Object.keys(manifest.sources).sort(), Object.keys(rt.sourceSha256).sort()) && manifest.sources[manifest.protocol.file] === manifest.protocol.sha256, 'runtime sources differ from the committed protocol manifest')
for (const [file, digest] of Object.entries(rt.sourceSha256)) {
  check(!file.startsWith('/') && !file.split('/').includes('..'), 'runtime source path leaves the clone')
  check(manifest.sources[file] === digest && hash(join(LAB_DIR, file)) === digest && committedHash(file) === digest, 'a measured source differs from the committed protocol manifest')
}
const designHash = hash(join(root, 'design.mjs'))
check(protocol.phase === 1 && protocol.decisionMetricsComputed === false && protocol.provenance.design === designHash, 'prespecified report or design differs')
check(r.sources.moves.app === pin.commit && r.sources.events.app === pin.commit && r.sources.moves.design === designHash && r.sources.events.design === designHash, 'result provenance differs from the design')
check(rt.inputSha256.positions === r.sources.moves.source && rt.inputSha256.positions === protocol.provenance.positions && rt.inputSha256.games === r.sources.gamesSha256, 'runtime inputs differ from fit or fixed position inputs')
check(r.rule.base === BASE && BASE === 250 && r.rule.draws === DRAWS && DRAWS === 1000 && r.rule.seed === SEED && SEED === 7 && r.rule.guardMargin === GUARD_MARGIN && GUARD_MARGIN === 0.005, 'baseline, bootstrap or margin changed')
check(r.rule.candidateCounts.A === CANDIDATES.A.length && r.rule.candidateCounts.B === CANDIDATES.B.length && CANDIDATES.A.length === 441 && CANDIDATES.B.length === 147, 'candidate grids changed')
check(r.rule.p === 'doubled lower-tail bootstrap p for positive gain: min(1, 2 * (1 + count(draw <= 0)) / (draws + 1))', 'directional p definition changed')
check(r.rule.quantile === 'sorted[Math.round(q * (draws.length - 1))]' && same(r.rule.pResolution, 2 / (DRAWS + 1)) && same(r.rule.minimumFirstHolmAdjustedP, 4 / (DRAWS + 1)), 'finite-draw convention changed')
const p = protocol.protocol
check(p.anchor === 1000 && p.ordinaryCI === 95 && p.adjustedCI === 97.5 && p.alpha === 0.05 && p.guardCells === 4 && p.minPly === 11 && p.minClock === 30 && p.errorLoss === 5, 'prespecified constants changed')
check(protocol.timing.review.priorityNote === 'This review timing used nice -n 10 for the coordinator as well as nice -n 10 for its workers; priority was lowered twice. Reproduction commands now lower only worker priority.', 'review timing priority caveat changed')

const d = r.data
check(d.games === d.fit.games + d.held.games && d.moves === d.fit.moves + d.held.moves && d.fit.games === d.held.games, 'data partition claim failed')
check(d.held.games === 324 && d.punish.coveredGames === d.held.games && protocol.work.heldReviewGames === d.held.games && protocol.data.guard.coverage === 'all-held-out', 'paper requires the full held-out guard')
check(d.games === protocol.data.games && d.moves === protocol.data.moves && d.fit.moves === protocol.data.fit.moves && d.held.moves === protocol.data.held.moves, 'data differ from the prespecified pipeline')
check(countOK(d.punish.events) && countOK(d.punish.verified) && d.punish.verified <= d.punish.events && d.punish.games <= d.punish.coveredGames, 'invalid punish counts')
for (const half of ['fit', 'held', 'all']) {
  const b = r.baseline[half]
  check(countOK(b.moves) && finite(b.logLikelihood) && b.logLikelihood <= 0 && shareOK(b.firstChoice), 'invalid baseline aggregate')
}
check(r.baseline.fit.moves === d.fit.moves && r.baseline.held.moves === d.held.moves && r.baseline.all.moves === d.moves, 'baseline counts differ')
const ivOK = (iv, lo = -Infinity, hi = Infinity) => Array.isArray(iv) && iv.length === 2 && iv.every(finite) && lo - 1e-12 <= iv[0] && iv[0] <= iv[1] && iv[1] <= hi + 1e-12
function checkGain(g) {
  check(countOK(g.base.moves) && g.base.moves === g.candidate.moves && countOK(g.emptyDraws), 'invalid likelihood counts')
  check(g.complete === (g.base.moves > 0 && g.emptyDraws === 0), 'likelihood completeness flag differs')
  if (g.base.moves) check(same(g.gain, g.candidate.logLikelihood - g.base.logLikelihood) && shareOK(g.base.firstChoice) && shareOK(g.candidate.firstChoice), 'likelihood difference or first-choice share is inconsistent')
  if (g.complete) {
    check(ivOK(g.interval95) && ivOK(g.interval975) && g.interval975[0] <= g.interval95[0] && g.interval975[1] >= g.interval95[1] && shareOK(g.p), 'invalid likelihood interval or p-value')
    check(g.p === 1 || same(g.p / r.rule.pResolution, Math.round(g.p / r.rule.pResolution)), 'p-value is off the draw grid')
  } else check(g.interval95 === null && g.interval975 === null && g.p === null, 'inconclusive comparison reports an interval')
}
const keys = ['verified|player-err', 'verified|opp-err', 'all|player-err', 'all|opp-err']
for (const kind of ['A', 'B']) {
  const t = r.tests[kind]
  check(CANDIDATES[kind].some(c => exact(c, t.fitted)), 'fitted parameters are outside the family')
  check(finite(t.fit) && t.fitGain >= 0 && same(t.fitGain, t.fit - r.baseline.fit.logLikelihood), 'fitting gain is inconsistent')
  checkGain(t.held)
  check(t.held.base.moves === d.held.moves && same(t.held.base.logLikelihood, r.baseline.held.logLikelihood), 'held baseline differs')
  check(exact(Object.keys(t.guard), keys), 'guard cells changed')
  for (const key of keys) {
    const g = t.guard[key], complete = g.events > 0 && g.emptyDraws === 0
    check(countOK(g.events) && countOK(g.games) && countOK(g.emptyDraws) && g.bootstrapGames === d.held.games, 'guard bootstrap is not the full held half')
    if (g.events) check(shareOK(g.base) && shareOK(g.candidate) && same(g.difference, g.candidate - g.base), 'Brier difference is inconsistent')
    else check(g.base === null && g.candidate === null && g.difference === null, 'empty guard cell reports a score')
    if (complete) check(ivOK(g.interval95, -1, 1) && ivOK(g.interval975, -1, 1) && g.interval975[0] <= g.interval95[0] && g.interval975[1] >= g.interval95[1], 'invalid guard intervals')
    else check(g.interval95 === null && g.interval975 === null, 'inconclusive guard reports an interval')
    const pass = complete && g.interval975[1] <= GUARD_MARGIN
    check(g.pass === pass && g.status === (!complete ? 'inconclusive' : pass ? 'pass' : 'fail'), 'guard verdict does not follow the margin')
  }
  check(t.guardPass === keys.every(key => t.guard[key].pass), 'guard does not require every cell')
  check(t.bySide.him.base.moves + t.bySide.opponents.base.moves === d.held.moves && t.byRating.length === 3 && t.byRating.reduce((sum, g) => sum + g.base.moves, 0) === d.held.moves, 'descriptive groups do not partition held moves')
  for (const g of [...Object.values(t.bySide), ...t.byRating]) checkGain(g)
  for (const groups of [Object.values(t.bySide), t.byRating]) check(same(groups.reduce((sum, g) => sum + (g.gain ?? 0) * g.base.moves, 0) / d.held.moves, t.held.gain), 'group gains do not reproduce the overall held gain')
  check(['fit', 'held', 'all'].every(half => shareOK(t.firstChoice[half])) && same(t.firstChoice.held, t.held.candidate.firstChoice), 'invalid first-choice shares')
  check(same(t.firstChoice.all * d.moves, t.firstChoice.fit * d.fit.moves + t.firstChoice.held * d.held.moves), 'first-choice partitions are inconsistent')
}
const order = ['A', 'B'].sort((a, b) => (r.tests[a].held.p ?? 1) - (r.tests[b].held.p ?? 1) || a.localeCompare(b))
check(exact(order, r.holmOrder), 'Holm ordering is inconsistent')
let priorPass = true, priorAdjusted = 0
order.forEach((kind, i) => {
  const t = r.tests[kind], h = t.held, adjusted = Math.max(priorAdjusted, Math.min(1, (2 - i) * (h.p ?? 1)))
  const stage = i === 0 ? h.interval975 : h.interval95
  const wins = priorPass && t.fitGain > 0 && h.complete && h.interval95[0] > 0 && adjusted < 0.05 && stage[0] > 0
  check(t.holm.rank === i + 1 && same(t.holm.adjustedP, adjusted) && exact(t.holm.interval, stage) && t.holm.tail === (i === 0 ? 0.0125 : 0.025) && t.holm.previousPassed === priorPass, 'Holm stage differs from the rule')
  check(t.wins === wins && t.eligible === (wins && t.guardPass), 'win or eligibility differs from the rule')
  priorAdjusted = adjusted; priorPass = wins
})
const eligible = ['A', 'B'].filter(kind => r.tests[kind].eligible).sort((a, b) => r.tests[b].held.gain - r.tests[a].held.gain || (a === 'B' ? -1 : 1))
check(r.adopted === (eligible[0] ?? null) && exact(r.kept, r.adopted ? r.tests[r.adopted].fitted : { kind: 'base', id: 'base' }), 'adoption does not follow the rule')
for (const key of keys) {
  const a = r.tests.A.guard[key], b = r.tests.B.guard[key]
  check(a.events === b.events && a.games === b.games && (a.base === null ? b.base === null : same(a.base, b.base)), 'candidates do not share guard events')
}
check(r.tests.A.guard['all|player-err'].events + r.tests.A.guard['all|opp-err'].events === d.punish.events && r.tests.A.guard['verified|player-err'].events + r.tests.A.guard['verified|opp-err'].events === d.punish.verified, 'guard totals differ')
for (const dir of ['player-err', 'opp-err']) check(r.tests.A.guard[`verified|${dir}`].events <= r.tests.A.guard[`all|${dir}`].events, 'verified replies are not a subset')
const bins = [[0, .1], [.1, .2], [.2, .4], [.4, .6], [.6, .8], [.8, 1]]
for (const key of keys) for (const kind of ['base', 'A', 'B']) {
  const rows = r.calibration[key][kind]
  check(rows.length === bins.length && rows.reduce((sum, b) => sum + b.events, 0) === r.tests.A.guard[key].events, 'calibration bins do not partition the cell')
  rows.forEach((b, i) => {
    check(b.from === bins[i][0] && b.to === bins[i][1] && countOK(b.events), 'calibration bins changed')
    if (b.events) check(shareOK(b.meanProbability) && shareOK(b.observed) && ivOK(b.wilson95, 0, 1), 'invalid bin aggregate')
    else check(b.meanProbability === null && b.observed === null && b.wilson95 === null, 'empty bin reports an estimate')
    const tested = b.events >= 15, violation = tested && (b.meanProbability < b.wilson95[0] - .1 || b.meanProbability > b.wilson95[1] + .1)
    check(b.oldBinRuleTested === tested && b.oldBinRuleViolation === violation, 'old bin-rule descriptive changed')
  })
}

const stageNames = ['move-policies', 'reviews', 'events', 'punish-policies', 'fit']
check(exact(rt.stages.map(s => s.stage), stageNames) && rt.stages.every(s => s.status === 'complete'), 'runtime stages are incomplete')
check(rt.maximumHeavyWorkers === 2 && rt.workerNiceIncrement === 10 && rt.coordinatorPriority === 0, 'compute limits changed')
check(Array.isArray(rt.sessions) && countOK(rt.unmeasuredInterruptedSessions) && rt.unmeasuredInterruptedSessions === rt.sessions.filter(s => !finite(s.seconds)).length, 'runtime session coverage differs')
for (const s of rt.stages) {
  check(finite(s.measuredAttemptWallSeconds) && s.measuredAttemptWallSeconds >= 0 && countOK(s.unmeasuredInterruptedAttempts), 'invalid stage timing')
  check(s.attempts.length > 0 && s.attempts.some(a => a.status === 'complete' && a.results.every(x => x.ok && x.code === 0)), 'stage lacks a successful attempt')
  check(same(s.measuredAttemptWallSeconds, s.attempts.reduce((sum, a) => sum + (a.seconds ?? 0), 0)), 'stage timing sum differs')
  check(s.unmeasuredInterruptedAttempts === s.attempts.filter(a => !finite(a.seconds)).length && s.attempts.every(a => typeof a.recovered === 'boolean'), 'runtime attempt coverage differs')
  for (const a of s.attempts.filter(a => a.recovered)) {
    check(a.status === 'interrupted' && finite(a.seconds) && a.seconds >= 0 && a.timingBasis === 'recovered from the measured session finish, bounded by measured session duration; includes shutdown time', 'reconstructed attempt timing basis differs')
    check(rt.sessions.some(session => {
      const start = Date.parse(a.startedAt), end = Date.parse(a.finishedAt), sessionStart = Date.parse(session.startedAt)
      return session.finishedAt === a.finishedAt && finite(session.seconds) && session.seconds >= 0 && [start, end, sessionStart].every(finite) && sessionStart <= start && start <= end && same(a.seconds, Math.min(session.seconds, (end - start) / 1000))
    }), 'reconstructed attempt is not bounded by its recorded session')
  }
}
const stages = Object.fromEntries(rt.stages.map(s => [s.stage, s])), mt = stages['move-policies'].timing, pt = stages['punish-policies'].timing, review = stages.reviews.timing
check(mt.rows === d.moves && mt.calls === protocol.work.movePolicyCalls && pt.rows === d.punish.events, 'policy timing coverage differs')
check(review.selected === d.held.games && review.completed === d.held.games && review.reusedReviews + review.newlyCompletedReviews === d.held.games && review.coordinatorPriority === 0 && review.workerNiceIncrement === 10, 'review coverage or priority differs')
for (const t of [mt, pt]) check(countOK(t.timedRows) && countOK(t.untimedRows) && t.timedRows + t.untimedRows === t.rows && countOK(t.calls) && finite(t.committedWorkerSeconds) && t.committedWorkerSeconds >= 0, 'policy timing coverage differs')
check(countOK(review.recoveredTimings) && review.recoveredTimings <= review.completed && review.basis === 'one latest completed timing per selected game; reused reviews counted separately; recovered timings retain the evidence journal basis', 'invalid recovered review timing count or basis')
check(same(rt.measuredAttemptWallSeconds, rt.stages.reduce((sum, s) => sum + s.measuredAttemptWallSeconds, 0)), 'overall timing sum differs')
check([rt.overallElapsedSeconds, rt.measuredActiveSeconds, rt.gapsAndUnmeasuredSeconds].every(x => finite(x) && x >= 0) && same(rt.gapsAndUnmeasuredSeconds, Math.max(0, rt.overallElapsedSeconds - rt.measuredActiveSeconds)), 'runtime span is inconsistent')

const ep = execution.provenance, er = execution.review
const digestOK = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
check(execution.schema === 'maia-player-offsets-execution/1' && execution.status === 'complete', 'paper requires the completed execution report')
check(ep.app === pin.commit && ep.records === pin.records && ep.protocolManifestSha256 === rt.protocolManifestSha256 && ep.protocolSha256 === rt.protocolSha256 && exact(ep.sourceSha256, rt.sourceSha256), 'execution provenance differs from the measured study')
check(exact(Object.keys(ep.inputSha256).sort(), ['benchmark-cases.json', 'games.json', 'held-cases.json', 'positions.jsonl', 'prepare.json']) && Object.values(ep.inputSha256).every(digestOK), 'execution input fingerprint set differs')
check(ep.inputSha256['positions.jsonl'] === rt.inputSha256.positions && ep.inputSha256['games.json'] === rt.inputSha256.games && ep.inputSha256['held-cases.json'] === rt.inputSha256.heldCases, 'execution inputs differ from runtime')
check(exact(Object.keys(ep.operationalSourceSha256).sort(), ['projects/maia-player-offsets/launch.py', 'projects/maia-player-offsets/recover-review-timeouts.mjs']), 'execution operational source set differs')
for (const [file, digest] of Object.entries(ep.operationalSourceSha256)) check(digestOK(digest) && hash(join(LAB_DIR, file)) === digest && committedHash(file) === digest, 'execution helper differs from its committed contents')
check(digestOK(execution.stateSha256) && exact(Object.keys(execution.journalSha256).sort(), ['evidence-runs.jsonl', 'evidence/routine/_errors.jsonl', 'evidence/routine/_starts.jsonl', 'evidence/routine/_timing.jsonl']) && Object.values(execution.journalSha256).every(value => value === null || digestOK(value)), 'invalid execution journal fingerprints')
check(execution.maximumHeavyWorkers === rt.maximumHeavyWorkers && execution.workerNiceIncrement === rt.workerNiceIncrement && execution.coordinatorPriority === rt.coordinatorPriority, 'execution compute limits differ')
// The writers use different defaults for an attempt left without a status.
// Align only the unclosed, untimed form; preserve every other field.
function normalizeUnclosedAttempt(a) {
  return { ...a, status: a.status === 'unfinished' && a.finishedAt === null && a.measuredWallSeconds === null ? 'interrupted' : a.status }
}
check(exact(execution.stages.map(s => ({ ...s, attempts: s.attempts.map(normalizeUnclosedAttempt) })), rt.stages.map(s => ({ stage: s.stage, status: s.status, attempts: s.attempts.map(a => ({ number: a.number, status: a.status, startedAt: a.startedAt, finishedAt: a.finishedAt, measuredWallSeconds: a.seconds })) }))), 'execution stage history differs from runtime')
check(exact(execution.sessions, rt.sessions.map(s => ({ startedAt: s.startedAt, finishedAt: s.finishedAt, status: s.status, measuredWallSeconds: s.seconds }))), 'execution session history differs from runtime')
check(same(execution.elapsedSpanSeconds, rt.overallElapsedSeconds) && same(execution.measuredSessionWallSeconds, rt.measuredActiveSeconds) && Date.parse(execution.generatedAt) >= Date.parse(rt.endedAt), 'execution report is stale or its wall-time totals differ')
check(er.selected === review.selected && er.completed === review.completed && er.timedCompletedReviews === er.selected && er.untimedCompletedReviews === 0 && er.reusedReviews === review.reusedReviews && er.newlyCompletedReviews === review.newlyCompletedReviews && er.timedCompletedPlies === review.plies && er.recoveredTimingRecords === review.recoveredTimings, 'execution completed-review counts differ')
check(countOK(er.newTimedCompletedPlies) && er.newTimedCompletedPlies <= er.timedCompletedPlies && same(er.successfulWorkerSeconds, review.workerSeconds) && same(er.newSuccessfulWorkerSeconds, review.newWorkerSeconds) && er.newSuccessfulWorkerSeconds >= 0 && er.newSuccessfulWorkerSeconds <= er.successfulWorkerSeconds && same(er.recordedStageWallSeconds, stages.reviews.measuredAttemptWallSeconds), 'execution review timing differs')
check(countOK(execution.reviewedRestartCount) && execution.reviewedRestartCount === execution.reviewedRestarts.length && execution.reviewedRestartCount === er.timeoutAttempts.length, 'timeout restart coverage differs')
check(new Set(er.timeoutAttempts.map(t => `${t.attemptNumber}|${t.startedAt}`)).size === er.timeoutAttempts.length, 'execution duplicates a timeout attempt')
for (const t of er.timeoutAttempts) {
  const errors = t.errors, batch = t.batch
  check(stages.reviews.attempts.some(a => a.number === t.attemptNumber && a.startedAt === t.startedAt && a.finishedAt === t.finishedAt && a.status === 'failed'), 'a timeout proof does not match a failed review stage attempt')
  check(countOK(errors.count) && errors.count > 0 && errors.timeoutCount === errors.count && [errors.wallSeconds, errors.minimumWallSeconds, errors.maximumWallSeconds].every(x => finite(x) && x >= 0) && errors.minimumWallSeconds <= errors.maximumWallSeconds && errors.wallSeconds >= errors.count * errors.minimumWallSeconds - 1e-8 && errors.wallSeconds <= errors.count * errors.maximumWallSeconds + 1e-8, 'invalid timeout duration aggregate')
  check(batch.selected === d.held.games && [batch.completedBefore, batch.completedAfter, batch.newlyWritten, batch.failed].every(countOK) && batch.completedBefore + batch.newlyWritten <= batch.completedAfter && batch.completedAfter <= batch.selected && batch.completedBefore + batch.newlyWritten + batch.failed === batch.selected && batch.failed === errors.count && finite(batch.measuredWallSeconds) && batch.measuredWallSeconds >= 0, 'timeout batch accounting differs')
  const restarts = execution.reviewedRestarts.filter(s => s.attemptNumber === t.attemptNumber && s.attemptStartedAt === t.startedAt)
  check(restarts.length === 1 && restarts[0].kind === 'reviewed-timeout-only-restart' && restarts[0].status === 'launched' && restarts[0].originalFailure.stage === 'reviews' && exact(restarts[0].errors, errors) && exact(restarts[0].batch, batch), 'a timeout attempt lacks its reviewed restart')
  const bound = restarts[0].provenance
  check(bound.app === ep.app && bound.records === ep.records && bound.protocolManifestSha256 === ep.protocolManifestSha256 && bound.protocolSha256 === ep.protocolSha256 && exact(bound.sourceSha256, ep.sourceSha256) && exact(bound.inputSha256, ep.inputSha256), 'a restart changed the study protocol or inputs')
}
check(er.timeoutCount === er.timeoutAttempts.reduce((sum, t) => sum + t.errors.count, 0) && same(er.timeoutWallSeconds, er.timeoutAttempts.reduce((sum, t) => sum + t.errors.wallSeconds, 0)), 'timeout totals differ from their verified attempts')

const out = new Generated('projects/maia-player-offsets/paper/generate.mjs')
const n = x => x.toLocaleString('en-US').replaceAll(',', '{,}')
const num = (x, dp = 5) => x === null ? 'inconclusive' : fixed(x, dp)
const iv = (x, dp = 5) => x === null ? 'inconclusive' : `[${fixed(x[0], dp)}, ${fixed(x[1], dp)}]`
const label = key => `${key.startsWith('verified') ? 'Verified' : 'All'}, ${key.endsWith('player-err') ? "player's error" : "opponent's error"}`
const table = (cols, header, rows) => ['\\begin{tabularx}{\\textwidth}{' + cols + '}', '\\toprule', header + ' \\\\', '\\midrule', ...rows.map(row => row + ' \\\\'), '\\bottomrule', '\\end{tabularx}'].join('\n')
const a = r.tests.A, b = r.tests.B
const recoveredAttempts = rt.stages.reduce((sum, s) => sum + s.attempts.filter(a => a.recovered).length, 0)
const untimedRows = mt.untimedRows + pt.untimedRows
const defs = {
  ProjectionPriorityNote: esc(protocol.timing.review.priorityNote),
  ModelName: 'Maia-2', AppCommit: `\\texttt{${r.app}}`, RecordsCommit: `\\texttt{${r.records}}`, ProtocolDigest: `\\texttt{${manifest.protocol.sha256}}`,
  Games: n(d.games), Moves: n(d.moves), FitGames: n(d.fit.games), FitMoves: n(d.fit.moves), HeldGames: n(d.held.games), HeldMoves: n(d.held.moves), EmptyGames: n(protocol.data.zeroMoveGames),
  GuardGames: n(d.punish.coveredGames), PunishGames: n(d.punish.games), PunishEvents: n(d.punish.events), PunishVerified: n(d.punish.verified),
  Base: BASE, OffsetMin: Math.min(...OFFSETS), OffsetMax: Math.max(...OFFSETS), OffsetStep: OFFSETS[1] - OFFSETS[0], ACount: n(CANDIDATES.A.length), BCount: n(CANDIDATES.B.length),
  Anchor: p.anchor, Slopes: SLOPES.map(s => fixed(s, 2)).join(', '), PlayerOffset: a.fitted.him, OpponentOffset: a.fitted.opp, Intercept: b.fitted.a, Slope: fixed(b.fitted.b, 2),
  Draws: n(DRAWS), Seed: SEED, GuardMargin: fixed(GUARD_MARGIN, 3), Alpha: fixed(p.alpha, 2), OrdinaryCI: p.ordinaryCI, AdjustedCI: p.adjustedCI, GuardCells: word(keys.length),
  MinPly: p.minPly, MinClock: p.minClock, ErrorLoss: p.errorLoss,
  GainA: num(a.held.gain), GainB: num(b.held.gain), IntervalA: iv(a.held.interval95), IntervalB: iv(b.held.interval95), PResolution: fixed(r.rule.pResolution, 6), HolmMinimum: fixed(r.rule.minimumFirstHolmAdjustedP, 6),
  RatingMin: d.moverRating.min, RatingMax: d.moverRating.max, RatingCutLow: d.moverRating.thirdsCuts[0], RatingCutHigh: d.moverRating.thirdsCuts[1],
  MaxWorkers: rt.maximumHeavyWorkers, Nice: rt.workerNiceIncrement, ElapsedHours: fixed(rt.overallElapsedSeconds / 3600, 2), SessionHours: fixed(execution.measuredSessionWallSeconds / 3600, 2), GapHours: fixed(rt.gapsAndUnmeasuredSeconds / 3600, 2),
  MoveCalls: n(mt.calls), PunishCalls: n(pt.calls), ReusedReviews: n(review.reusedReviews), NewReviews: n(review.newlyCompletedReviews), ReviewPlies: n(review.plies),
  PolicyMB: fixed((mt.bytes + pt.bytes) / 1e6, 1), ProjectedHours: fixed(protocol.cost.totalHours, 2), PlanningHours: fixed(protocol.cost.planningHours, 2), BinMinimum: 15, BinAllowance: fixed(.1, 2),
  RecoveredAttempts: n(recoveredAttempts), RecoveredReviewTimings: n(review.recoveredTimings), UntimedPolicyRows: n(untimedRows),
  TimeoutFailures: n(er.timeoutCount), ReviewedRestarts: n(execution.reviewedRestartCount),
  PredecessorPlayerOffset: predecessor.bestBySide.him.offset, OwnGainA: num(a.bySide.him.gain), OwnIntervalA: iv(a.bySide.him.interval95), OpponentGainA: num(a.bySide.opponents.gain), OpponentIntervalA: iv(a.bySide.opponents.interval95),
}
for (const [key, value] of Object.entries(defs)) out.def(key, value)
out.def('BrierFormula', '$(q-y)^2$').def('TailFormula', '$\\min\\{1,\\;2(1+\\#\\{\\Delta_b\\leq0\\})/(B+1)\\}$')
out.def('QuantileFormula', '$\\operatorname{round}(q(B-1))$').def('StageQuantiles', '$0.0125,\\;0.9875$').def('OrdinaryQuantiles', '$0.025,\\;0.975$')
let verdict, port
if (r.adopted === 'A') {
  check(a.eligible && (!b.eligible || a.held.gain > b.held.gain), 'A outcome branch no longer holds')
  verdict = 'The fixed rule selects separate offsets for the player and his opponents: \\PlayerOffset{} and \\OpponentOffset. Candidate A wins the likelihood test and passes every punish guard.'
  port = 'Candidate A is the selected port. It needs separate profile offsets and owner identity wherever a person supplies either input to Maia. Its offsets must follow the person when the side to move changes.'
} else if (r.adopted === 'B') {
  check(b.eligible && (!a.eligible || b.held.gain >= a.held.gain), 'B outcome branch no longer holds')
  verdict = 'The fixed rule selects the rating function, with intercept \\Intercept{} and slope \\Slope. Candidate B wins the likelihood test and passes every punish guard.'
  port = 'Candidate B is the selected port. It needs the rating function in the shared conversion, profile parameters, and consistent inverse labels for the Maia bot. It does not require owner identity.'
} else {
  check(!a.eligible && !b.eligible, 'baseline outcome branch no longer holds')
  verdict = 'Neither candidate meets both requirements, so the app keeps its single offset of \\Base.'
  port = 'Neither conversion qualifies for a port. The app keeps its single offset. Personal fine-tuning is a separate proposed round and was not started here.'
}
out.def('Verdict', verdict).def('PortConclusion', port)
out.def('OutcomeDetail', ['A', 'B'].map(kind => {
  const t = r.tests[kind], guard = t.guardPass ? 'passes all punish guards' : keys.some(key => t.guard[key].status === 'inconclusive') ? 'has an inconclusive punish guard' : 'fails a punish guard'
  return `Candidate ${kind} ${t.wins ? 'wins' : 'does not win'} the corrected likelihood test and ${guard}.`
}).join(' '))
out.def('SelectionDetail', eligible.length === 2 ? (a.held.gain === b.held.gain ? 'Both qualify with exactly equal observed gains. The prespecified tie-break selects B.' : 'Both qualify. The larger observed gain determines the selection; this is not a test that it beats the other candidate.') : eligible.length === 1 ? 'Only the selected candidate meets both requirements.' : 'A likelihood gain alone does not authorize adoption.')
// Reporting added after inspecting the completed aggregate. These checks bind
// the descriptive prose below; they do not enter the frozen adoption rule.
check(r.adopted === 'A' && a.fitted.him === BASE && a.fitted.opp > BASE && predecessor.bestBySide.him.offset < BASE, 'the comparison with the exploratory player offset no longer holds')
check(a.bySide.him.gain < 0 && a.bySide.him.interval95[0] < 0 && a.bySide.him.interval95[1] > 0 && a.bySide.opponents.gain > 0 && a.bySide.opponents.interval95[0] > 0, 'the descriptive side finding no longer holds')
check(['A', 'B'].every(k => r.tests[k].byRating.slice(1).every(g => r.tests[k].byRating[0].gain > g.gain && g.interval95[0] < 0 && g.interval95[1] > 0)), 'the descriptive rating finding no longer holds')
check(['verified', 'all'].every(set => a.guard[`${set}|opp-err`].difference === 0 && exact(a.guard[`${set}|opp-err`].interval975, [0, 0]) && a.guard[`${set}|player-err`].difference < 0), 'the selected guard-cell interpretation no longer holds')
check(keys.every(key => ['base', 'A', 'B'].every(k => r.calibration[key][k].every(bin => bin.oldBinRuleTested && !bin.oldBinRuleViolation))), 'the descriptive bin-rule finding no longer holds')
out.def('ExploratoryComparison', 'The selected split keeps the player\'s offset at \\Base. The predecessor\'s exploratory value was \\PredecessorPlayerOffset, from applying one shared offset to both bands and scoring only his moves across the whole archive. The joint fitting objective here is different.')
out.def('SideFinding', 'For A, the gain on the player\'s own moves is \\OwnGainA{} (ordinary interval \\OwnIntervalA); the gain on opponents\' moves is \\OpponentGainA{} (\\OpponentIntervalA). The player\'s interval includes zero; the opponents\' interval lies above it. Keeping the player\'s offset fixed does not keep his move predictions fixed: the opponent band is also an input to Maia.')
out.def('RatingFinding', 'The lowest rating third has the largest observed gain for both candidates. The ordinary intervals for the middle and highest thirds include zero. These descriptive comparisons add no selection condition.')
out.def('GuardFinding', 'For A, the opponent-error cells match the baseline exactly: the player is the replier and his converted band is unchanged. The player-error cells have lower Brier estimates. The guard decision still uses every cell\'s upper interval bound.')
out.def('BinFinding', 'Every reported bin meets the old rule\'s minimum count, and none violates that descriptive rule.')
out.def('RuntimeCaveat', rt.unmeasuredInterruptedSessions > 0 || rt.stages.some(s => s.unmeasuredInterruptedAttempts > 0) ? 'Some interrupted work has no recorded duration. The elapsed span includes resume gaps; session and stage totals cover only recorded intervals.' : 'Every recorded session and stage attempt has a duration. The elapsed span can still include gaps between sessions.')
out.def('TimeoutRecoveryNote', er.timeoutCount ? `The execution report records \\TimeoutFailures{} failed game-review attempts as timeouts across \\ReviewedRestarts{} reviewed restart${execution.reviewedRestartCount === 1 ? '' : 's'}. Repeated timeouts, if any, count as separate failed attempts. The records do not establish why the timeouts occurred.` : 'The execution report records no failed timeout attempts or reviewed timeout restarts.')
out.def('RecoveredTimingNote', [
  recoveredAttempts ? `The stage table includes reconstructed timing for \\RecoveredAttempts{} interrupted attempt${recoveredAttempts === 1 ? '' : 's'}. The reconstruction uses the recorded session finish, includes shutdown time, and is bounded by the session duration.` : 'No interrupted-attempt duration needed reconstruction.',
  review.recoveredTimings ? 'For \\RecoveredReviewTimings{} completed reviews, timing was recovered from the start journal entry to the output document\'s modification time. These records omit disposal after the write and process exit; ordinary review timings run from worker spawn to child close.' : 'No completed-review timing needed recovery from a journal.',
].join(' '))
out.def('PolicyTimingCoverageNote', untimedRows ? '\\UntimedPolicyRows{} committed policy rows lack durable timing and are omitted from the worker-time sums.' : 'Every committed policy row has durable timing.')
out.block('FitTable', table('Lrrr', 'Conversion & Fit mean log probability & Fit gain & Held mean log probability', [
  `Baseline & ${fixed(r.baseline.fit.logLikelihood, 5)} & ${fixed(0, 5)} & ${fixed(r.baseline.held.logLikelihood, 5)}`,
  ...['A', 'B'].map(k => `${k} & ${fixed(r.tests[k].fit, 5)} & ${fixed(r.tests[k].fitGain, 5)} & ${fixed(r.tests[k].held.candidate.logLikelihood, 5)}`),
]))
out.block('GainTable', table('Llll', 'Candidate & Held gain & Ordinary interval & Likelihood test', ['A', 'B'].map(k => `${k} & ${num(r.tests[k].held.gain)} & ${iv(r.tests[k].held.interval95)} & ${r.tests[k].wins ? 'passes' : 'fails'}`)))
out.block('HolmTable', table('Lrrrl', 'Candidate (step) & Raw $p$ & Adjusted $p$ & Tail & Step interval', order.map(k => { const t = r.tests[k]; return `${k} (${t.holm.rank}) & ${num(t.held.p, 6)} & ${fixed(t.holm.adjustedP, 6)} & ${fixed(t.holm.tail, 4)} & ${iv(t.holm.interval)}` })))
out.block('GuardScoreTable', table('Lrrrr', 'Candidate and cell & Events & Baseline & Candidate & Difference', ['A', 'B'].flatMap(k => keys.map(key => { const g = r.tests[k].guard[key]; return `${k}: ${label(key)} & ${n(g.events)} & ${num(g.base)} & ${num(g.candidate)} & ${num(g.difference)}` }))))
out.block('GuardIntervalTable', table('Llll', 'Candidate and cell & Ordinary interval & Guard interval & Result', ['A', 'B'].flatMap(k => keys.map(key => { const g = r.tests[k].guard[key]; return `${k}: ${label(key)} & ${iv(g.interval95)} & ${iv(g.interval975)} & ${g.status}` }))))
const groups = [["Player's moves", a.bySide.him, b.bySide.him], ["Opponents' moves", a.bySide.opponents, b.bySide.opponents], ...a.byRating.map((g, i) => [`Rating ${g.from}--${g.to}`, g, b.byRating[i]])]
groups.forEach(([, ga, gb]) => check(ga.base.moves === gb.base.moves, 'descriptive groups differ between candidates'))
a.byRating.forEach((g, i) => check(g.from === b.byRating[i].from && g.to === b.byRating[i].to, 'candidate rating ranges differ'))
out.block('GroupTable', table('Lrll', 'Held-out moves & Count & A gain (ordinary interval) & B gain (ordinary interval)', groups.map(([name, ga, gb]) => `${name} & ${n(ga.base.moves)} & ${num(ga.gain)} ${iv(ga.interval95)} & ${num(gb.gain)} ${iv(gb.interval95)}`)))
out.block('TopTable', table('Lrrr', 'Conversion & Fitting moves & Held-out moves & All moves', [
  `Baseline & ${percent(r.baseline.fit.firstChoice, 2)} & ${percent(r.baseline.held.firstChoice, 2)} & ${percent(r.baseline.all.firstChoice, 2)}`,
  ...['A', 'B'].map(k => `${k} & ${percent(r.tests[k].firstChoice.fit, 2)} & ${percent(r.tests[k].firstChoice.held, 2)} & ${percent(r.tests[k].firstChoice.all, 2)}`),
]))
const stageLabels = { 'move-policies': 'Move policies', reviews: 'Routine reviews', events: 'Event extraction', 'punish-policies': 'Punish policies', fit: 'Fitting and bootstrap' }
out.block('TimingTable', table('Lrrr', 'Stage & Attempts & Recorded wall seconds & Unmeasured attempts', rt.stages.map(s => `${stageLabels[s.stage]} & ${n(s.attempts.length)} & ${fixed(s.measuredAttemptWallSeconds, 2)} & ${n(s.unmeasuredInterruptedAttempts)}`)))
out.block('ReviewTimingTable', table('Lr', 'Review measure & Recorded seconds', [
  `Completed-review workers, new reviews & ${fixed(er.newSuccessfulWorkerSeconds, 2)}`,
  `Completed-review workers, including reused reviews & ${fixed(er.successfulWorkerSeconds, 2)}`,
  `Failed timeout attempts & ${fixed(er.timeoutWallSeconds, 2)}`,
  `Review stage wall time & ${fixed(er.recordedStageWallSeconds, 2)}`,
]))
out.block('PolicyTimingTable', table('Lrrr', 'Policies & Calls & First calls with restarts & Committed worker seconds', [['Move', mt], ['Punish', pt]].map(([name, t]) => `${name} & ${n(t.calls)} & ${n(t.firstCalls)} & ${fixed(t.committedWorkerSeconds, 2)}`)))
out.block('CalibrationTables', keys.map(key => [
  `\\subsection*{${label(key)}}`,
  table('Lrrrll', 'Model / bin & Events & Mean $q$ & Observed & Wilson interval & Old rule', ['base', 'A', 'B'].flatMap(k => r.calibration[key][k].map((b, i) => `${k === 'base' ? 'Baseline' : k}: [${fixed(b.from, 1)},${fixed(b.to, 1)}${i === bins.length - 1 ? ']' : ')'} & ${n(b.events)} & ${num(b.meanProbability, 3)} & ${num(b.observed, 3)} & ${iv(b.wilson95, 3)} & ${b.oldBinRuleTested ? b.oldBinRuleViolation ? 'violation' : 'within' : 'untested'}`))),
].join('\n')).join('\n\\medskip\n'))
check(!/[0-9]/.test(fs.readFileSync(join(root, 'paper/paper.tex'), 'utf8')), 'paper.tex contains a literal number; move it to the generator')
out.write(join(root, 'paper/generated.tex'))
console.log('wrote result generated.tex after provenance, rule and outcome checks')
