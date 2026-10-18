// Phase 1 aggregates only. Never opens policy payloads or scores outcomes.
import fs from 'node:fs'
import { join } from 'node:path'
import { chess, records, resultsDir, LAB_DIR } from '../../bridge/lib/chess.mjs'
import { CANDIDATES, OFFSETS, SLOPES, pairsFor, punishPairs, BASE, DRAWS, SEED, GUARD_MARGIN, mulberry32 } from './design.mjs'
import { dir, pin, read, jsonl, hash, manifest } from './io.mjs'
const assert = (ok, message) => { if (!ok) throw new Error(message) }
const prepared = read(join(dir, 'prepare.json'))
if (prepared.app !== pin.commit || prepared.records !== pin.records) throw new Error('prepare does not match pin')
const moves = jsonl(join(dir, 'positions.jsonl')), games = read(join(dir, 'games.json'))
const heldGames = games.filter(g => g.half === 'held')
const heldPlies = heldGames.reduce((s, g) => s + g.plies, 0)
const byShard = [0, 0], histogram = {}
for (const m of moves) { const n = pairsFor(m).length; byShard[m.k % 2] += n; histogram[n] = (histogram[n] ?? 0) + 1 }
const { gameIdOf } = await chess('src/services/archive/index.ts')
const halves = new Map(games.map(g => [gameIdOf(g.id), g.half]))
const recorded = read(join(records(), 'evals/maia-punish/events.json')).events
let punishCalls = 0
for (const e of recorded) if (halves.get(`cc:${e.game}`) === 'held') punishCalls += punishPairs({ r: e.rating, me: e.dir === 'opp-err' }).length
const timings = [0, 1].map(k => read(join(dir, `benchmark-move-policies-${k}-of-2-timing.json`)))
const order = [...moves], rng = mulberry32(SEED)
for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
for (let k = 0; k < 2; k++) {
  const file = join(dir, `benchmark-move-policies-${k}-of-2.jsonl`)
  const expected = { ...manifest(join(dir, 'positions.jsonl')), benchmark: true, kind: 'move', k, n: 2 }
  assert(JSON.stringify(read(file + '.meta.json')) === JSON.stringify(expected), 'stale policy timing provenance')
  const sampleRows = order.slice(0, 32).filter((_, i) => i % 2 === k)
  assert(timings[k].rows === sampleRows.length && timings[k].calls === sampleRows.reduce((s, m) => s + pairsFor(m).length, 0), 'policy timing slice differs')
  assert(timings[k].bytes === fs.statSync(file).size, 'policy timing byte count differs from completed cache')
}
// A no-op resume is not a new measurement. Keep the complete measured run.
const evidenceRuns = jsonl(join(dir, 'evidence-runs.jsonl'))
const evidence = evidenceRuns.find(e => e.mode === 'benchmark' && e.status === 0 && e.completedBefore === 0 && e.completedAfter === 2)
assert(evidence, 'need one completed two-worker review timing run; interrupted runs require a separately reported timing')
if (evidence.status !== 0 || evidence.completedAfter !== 2) throw new Error('review timing did not complete')
const evidenceManifest = read(join(dir, 'evidence/manifest.json'))
for (const key of ['app', 'records', 'profile', 'runnerSha256', 'predecessorBuilderSha256', 'appCliSha256', 'benchmarkCasesSha256', 'gamesSha256', 'adapter']) {
  assert(JSON.stringify(evidence.sources[key]) === JSON.stringify(evidenceManifest[key]), 'review timing instrument or sample changed')
}
assert(evidenceManifest.app === pin.commit && evidenceManifest.records === pin.records && evidenceManifest.gamesSha256 === hash(join(dir, 'games.json')) && evidenceManifest.heldCasesSha256 === hash(join(dir, 'held-cases.json')) && evidenceManifest.benchmarkCasesSha256 === hash(join(dir, 'benchmark-cases.json')), 'review timing inputs changed')
assert(evidenceManifest.runnerSha256 === hash(join(LAB_DIR, 'projects/maia-player-offsets/review-one.mts')), 'review runner changed after timing')
const reviewTimings = jsonl(join(dir, 'evidence/routine/_timing.jsonl'))
const sample = read(join(dir, 'benchmark-cases.json'))
const sampleIds = new Set(sample.map(c => String(c.id)))
const reviews = reviewTimings.filter(t => sampleIds.has(String(t.id)))
if (reviews.length !== 2) throw new Error('need exactly two completed review timings')
const startup = Math.max(...timings.map(t => t.firstSeconds))
const secondsPerCall = timings.reduce((s, t) => s + t.seconds - t.firstSeconds, 0) / timings.reduce((s, t) => s + t.calls - 1, 0)
const reviewSecondsPerPly = reviews.reduce((s, t) => s + t.seconds, 0) / reviews.reduce((s, t) => s + t.plies, 0)
const calls = byShard.reduce((a, b) => a + b, 0)
const moveSeconds = Math.max(...byShard) * secondsPerCall + startup
const reviewSeconds = heldPlies * reviewSecondsPerPly / 2
const estimatedPunishCalls = Math.ceil(punishCalls * heldPlies / prepared.benchmark.heldPlies)
const punishSeconds = estimatedPunishCalls * secondsPerCall / 2 + startup
const sampleBytes = timings.reduce((s, t) => s + t.bytes, 0), sampleCalls = timings.reduce((s, t) => s + t.calls, 0)
const totalSeconds = moveSeconds + reviewSeconds + punishSeconds
const weights = read(join(dir, 'weights.json'))
const benchmarkEvents = read(join(dir, 'benchmark-events.json'))
assert(benchmarkEvents.benchmark && benchmarkEvents.app === pin.commit && benchmarkEvents.records === pin.records && benchmarkEvents.counts.games === 2 && benchmarkEvents.evidenceManifest === hash(join(dir, 'evidence/manifest.json')), 'benchmark event count provenance differs')
const sourceFiles = ['README.md', 'design.mjs', 'fit.mjs', 'events.mjs', 'policies.mts', 'review-one.mts', 'evidence.mjs', 'count.mjs', 'paper/generate.mjs', 'paper/paper.tex'].map(f => `projects/maia-player-offsets/${f}`).concat('projects/maia-rating-offset/positions.mts')
const sourceHashes = Object.fromEntries(sourceFiles.map(f => [f, hash(join(LAB_DIR, f))]))
const positionsSource = fs.readFileSync(join(LAB_DIR, 'projects/maia-rating-offset/positions.mts'), 'utf8')
const minPly = Number(/const MIN_PLY = (\d+)/.exec(positionsSource)?.[1]), minClock = Number(/const MIN_CLOCK = (\d+)/.exec(positionsSource)?.[1])
assert(minPly === 11 && minClock === 30, 'predecessor eligibility changed')
assert(fs.readFileSync(join(LAB_DIR, 'projects/maia-player-offsets/design.mjs'), 'utf8').includes('(r - 1000)'), 'rating anchor changed')
assert(fs.readFileSync(join(LAB_DIR, 'projects/maia-player-offsets/events.mjs'), 'utf8').includes('r.lossPct >= 5'), 'event threshold changed')
const report = {
  phase: 1, decisionMetricsComputed: false, app: pin.commit, records: pin.records,
  data: { ...prepared.positions, zeroMoveGames: games.filter(g => !g.counted).length,
    playerMoves: moves.filter(m => m.me).length, opponentMoves: moves.filter(m => !m.me).length,
    frozenCases: prepared.frozenCases, recordedEvents: prepared.recordedEvents, benchmarkEvents: benchmarkEvents.counts,
    guard: { games: heldGames.length, plies: heldPlies, coverage: 'all-held-out' },
    note: 'Recorded events describe the frozen subset only. The guard uses new reviews of every held-out game; its event counts are not yet known.' },
  design: { A: CANDIDATES.A.length, B: CANDIDATES.B.length, baseline: BASE, offsets: OFFSETS, slopes: SLOPES, draws: DRAWS, seed: SEED, guardMargin: GUARD_MARGIN },
  protocol: { anchor: 1000, minPly, minClock, errorLoss: 5, ordinaryCI: 95, adjustedCI: 97.5, alpha: 0.05, guardCells: 4, allowance: 1.5 },
  work: { movePolicyCalls: calls, byShard, pairsPerMoveHistogram: histogram, recordedHeldPunishCalls: punishCalls, estimatedFullPunishCalls: estimatedPunishCalls,
    heldReviewGames: heldGames.length, heldReviewPlies: heldPlies },
  timing: { positionsSeconds: prepared.positionsSeconds, policies: timings, secondsPerCall, startupSeconds: startup,
    review: { games: reviews.length, plies: reviews.reduce((s, t) => s + t.plies, 0), workerSeconds: reviews.reduce((s, t) => s + t.seconds, 0),
      wallSeconds: evidence.seconds, secondsPerPly: reviewSecondsPerPly, gameSecondsRange: { min: Math.min(...reviews.map(t => t.seconds)), max: Math.max(...reviews.map(t => t.seconds)) },
      priorityNote: 'This review timing used nice -n 10 for the coordinator as well as nice -n 10 for its workers; priority was lowered twice. Reproduction commands now lower only worker priority.' } },
  cost: { processes: 2, nice: 10, moveSeconds, reviewSeconds, punishSeconds, totalHours: totalSeconds / 3600,
    planningHours: 1.5 * totalSeconds / 3600, estimatedPolicyBytes: (calls + estimatedPunishCalls) * sampleBytes / sampleCalls,
    excludes: 'Small data preparation, streaming aggregation and bootstrap passes; no model inference in fit. Punish-policy workload scales the frozen-subset calls by held-out plies and may change. Short-slice timing does not measure sustained fanless throttling or competing projects.' },
  weights, packagesInstalled: [],
  provenance: { sourceHashes, prepared: hash(join(dir, 'prepare.json')), design: hash(new URL('./design.mjs', import.meta.url)),
    positions: hash(join(dir, 'positions.jsonl')), evidence: hash(join(dir, 'evidence/manifest.json')) },
}
const f = (x, n = 2) => x.toFixed(n)
const md = [
  '# Maia player offsets: phase 1', '',
  `Written by count.mjs. App commit ${pin.commit}; records commit ${pin.records}. Data: the pinned archive and the accuracy project's frozen cases. No candidate likelihood, fit, first-choice share, Brier score, interval or verdict was computed.`, '',
  `${report.data.games} usable games, ${moves.length} moves: fitting ${report.data.fit.games} games / ${report.data.fit.moves} moves; held-out ${report.data.held.games} / ${report.data.held.moves}. ${report.data.zeroMoveGames} games have no counted moves and remain bootstrap units. Player moves ${report.data.playerMoves}; opponent moves ${report.data.opponentMoves}.`, '',
  `The frozen ${prepared.frozenCases.total} cases join without missing games or rating/side mismatches: ${prepared.frozenCases.overlap.fit} fitting and ${prepared.frozenCases.overlap.held} held out. Old recorded events in the held subset: ${prepared.recordedEvents.held.events} all, ${prepared.recordedEvents.held.exact} verified. These are planning counts, not current-pin guard evidence.`, '',
  `Before any effect, the reviewer expanded the guard to all ${heldGames.length} held-out games (${heldPlies} plies), including games with no counted move. The margin, intervals, four cells and all other decision rules are unchanged. The frozen subset supplies historical timing and workload estimates only.`, '',
  `The ${benchmarkEvents.counts.games} newly rebuilt timing reviews yield ${benchmarkEvents.counts.events} events, ${benchmarkEvents.counts.exact} verified. Event extraction was exercised without scoring their outcomes.`, '',
  '| Direction | Recorded held events | Verified |', '|---|---:|---:|',
  ...Object.entries(prepared.recordedEvents.held.directions).map(([d, x]) => `| ${d} | ${x.events} | ${x.exact} |`), '',
  `A has ${CANDIDATES.A.length} parameter pairs; B has ${CANDIDATES.B.length}. Their union and baseline need ${calls} move policies (${byShard.join(' and ')} per shard). The old frozen held-out events imply ${punishCalls} diagonal policies; scaling by plies gives ${estimatedPunishCalls} for the full guard as a cost estimate, not an event count. No effect is needed to count them.`, '',
  '| Step | Slice | Elapsed | Full run with two workers |', '|---|---|---:|---:|',
  `| Position rebuild | All games | ${f(prepared.positionsSeconds)} s | ${f(prepared.positionsSeconds)} s |`,
  `| Node Maia | ${timings.reduce((s, t) => s + t.rows, 0)} moves, ${sampleCalls} pairs | ${f(Math.max(...timings.map(t => t.seconds)))} s (longer worker) | ${f(moveSeconds / 3600)} h |`,
  `| Routine reviews | ${reviews.length} games, ${report.timing.review.plies} plies | ${f(evidence.seconds)} s | ${f(reviewSeconds / 60)} min for ${heldGames.length} games |`,
  `| Punish policies | Projected from Node timing and scaled frozen workload | not separately timed | ${f(punishSeconds)} s |`, '',
  `Node startup/first call takes up to ${f(startup, 3)} s; subsequent work averages ${f(secondsPerCall * 1000, 2)} ms per pair with both workers active. Review durations range from ${f(report.timing.review.gameSecondsRange.min)} to ${f(report.timing.review.gameSecondsRange.max)} worker seconds, or ${f(reviewSecondsPerPly, 3)} s per ply together.`, '',
  report.timing.review.priorityNote, '',
  `Estimated inference and review time: ${f(report.cost.totalHours)} hours; allow ${f(report.cost.planningHours)} hours (1.5x) for sustained load on the fanless laptop. Policy storage projects to ${f(report.cost.estimatedPolicyBytes / 1e6, 0)} MB. This excludes small preparation and fit/bootstrap passes. No Python backend is needed.`, '',
  `The app's Maia weights were ${weights.wasCached ? 'already cached' : 'downloaded into this clone'}: ${weights.bytes} bytes, SHA-256 ${weights.sha256}, ${f(weights.seconds)} seconds to fetch/check. No packages were installed.`, '',
  'The guard preserves equal-band opponent conditioning. Routine review uses the app service with one engine per worker, no tablebase requests, eval cache or review-store writes; all game files stay in this project’s private directory. The app pin and all shared project files stay unchanged.', '',
  'Limits: the predecessor explored these games already; this is a held-out fit comparison, not fresh confirmation. The punish guard covers all held-out games but the verified replies remain selected partly on outcome. Actual phase-2 event counts are not yet known. Timings are small-slice projections, not a sustained benchmark; other projects may stretch them.', '',
]
const out = resultsDir('maia-player-offsets')
fs.writeFileSync(join(out, 'phase1.json'), JSON.stringify(report, null, 2) + '\n')
fs.writeFileSync(join(out, 'phase1.md'), md.join('\n'))
console.log(md.join('\n'))
