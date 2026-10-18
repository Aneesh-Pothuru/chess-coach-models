// Phase 2 only: fit the two prespecified families, then apply the held-game
// likelihood tests and punish guards. Policies are streamed so the full grid
// does not have to fit in memory. All persisted output is aggregate.
//
//   nice -n 10 bridge/run.sh projects/maia-player-offsets/fit.mjs --phase2
import fs from 'node:fs'
import { createInterface } from 'node:readline'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LAB_DIR, resultsDir } from '../../bridge/lib/lab.mjs'
import {
  BASE, CANDIDATES, baseline, bandsFor, pairsFor, punishBand, punishPairs,
  DRAWS, SEED, GUARD_MARGIN, mulberry32, quantile, fitTie,
} from './design.mjs'

const assert = (ok, message) => { if (!ok) throw new Error(message) }
export const interval = (sorted, tail = 0.025) => [quantile(sorted, tail), quantile(sorted, 1 - tail)]
export function bestFromGrid(grid, scoreFor) {
  let best = grid[0], score = -Infinity
  for (const c of grid) {
    const value = scoreFor(c)
    assert(Number.isFinite(value), 'nonfinite fitting likelihood')
    if (value > score || (value === score && fitTie(c, best) < 0)) { best = c; score = value }
  }
  return { best, score }
}
export function sharedSamples(heldIndices, draws = DRAWS, seed = SEED) {
  const rng = mulberry32(seed)
  return Array.from({ length: draws }, () => Uint32Array.from(heldIndices, () => heldIndices[Math.floor(rng() * heldIndices.length)]))
}
export function doubledLowerTailP(draws) {
  return Math.min(1, 2 * (1 + draws.filter(x => x <= 0).length) / (draws.length + 1))
}
export function applyHolm(tests) {
  const ordered = ['A', 'B'].sort((a, b) => (tests[a].held.p ?? 1) - (tests[b].held.p ?? 1) || a.localeCompare(b))
  let priorPass = true, priorAdjusted = 0
  ordered.forEach((kind, rank) => {
    const t = tests[kind], h = t.held
    const adjusted = Math.max(priorAdjusted, Math.min(1, (2 - rank) * (h.p ?? 1)))
    const stage = rank === 0 ? h.interval975 : h.interval95
    t.holm = { rank: rank + 1, adjustedP: adjusted, tail: rank === 0 ? 0.0125 : 0.025, interval: stage, previousPassed: priorPass }
    t.wins = priorPass && t.fitGain > 0 && h.complete && h.interval95[0] > 0 && adjusted < 0.05 && stage[0] > 0
    priorAdjusted = adjusted
    priorPass = t.wins
  })
  return ordered
}
export function summarizeGuard(perGame, samples, heldIndices, i, margin = GUARD_MARGIN) {
  let n = 0, base = 0, candidate = 0, nonemptyGames = 0
  for (const gi of heldIndices) {
    const x = perGame[gi]
    n += x.n; base += x.sums[0]; candidate += x.sums[i]; nonemptyGames += Number(x.n > 0)
  }
  const draws = []
  let emptyDraws = 0
  for (const sample of samples) {
    let sum = 0, count = 0
    for (const gi of sample) { const x = perGame[gi]; sum += x.sums[i] - x.sums[0]; count += x.n }
    if (!count) emptyDraws++
    else draws.push(sum / count)
  }
  draws.sort((a, b) => a - b)
  const complete = n > 0 && emptyDraws === 0
  const ci95 = complete ? interval(draws) : null, ci975 = complete ? interval(draws, 0.0125) : null
  return {
    events: n, games: nonemptyGames, bootstrapGames: heldIndices.length,
    base: n ? base / n : null, candidate: n ? candidate / n : null,
    difference: n ? (candidate - base) / n : null,
    interval95: ci95, interval975: ci975, emptyDraws,
    status: !complete ? 'inconclusive' : ci975[1] <= margin ? 'pass' : 'fail',
    pass: complete && ci975[1] <= margin,
  }
}
export const allGuardCellsPass = cells => cells.length === 4 && cells.every(cell => cell.pass)
export function chooseAdoption(tests) {
  return ['A', 'B'].filter(kind => tests[kind].wins && tests[kind].guardPass)
    .sort((a, b) => tests[b].held.gain - tests[a].held.gain || (a === 'B' ? -1 : 1))[0] ?? null
}
export function requireHeldCoverage(games, cases, gameIdOf) {
  const expected = new Map()
  for (const g of games.filter(g => g.half === 'held')) {
    const key = gameIdOf(g.id)
    assert(!expected.has(key), 'duplicate canonical held-out game')
    expected.set(key, g.g)
  }
  assert(Array.isArray(cases) && cases.length === expected.size, 'guard must cover every held-out game')
  const covered = new Set()
  for (const c of cases) {
    assert(expected.has(c.game), 'guard contains a game outside the held-out half')
    const index = expected.get(c.game)
    assert(!covered.has(index), 'guard contains a duplicate held-out game')
    covered.add(index)
  }
  assert(covered.size === expected.size, 'guard is missing a held-out game')
  return covered
}

async function main() {
if (process.argv.slice(2).join(' ') !== '--phase2') throw new Error('fit is phase 2 only; usage: fit.mjs --phase2')
const { dir, pin, manifest, hash } = await import('./io.mjs')
const { CHESS_DIR, chess } = await import('../../bridge/lib/chess.mjs')
const parse = (text) => {
  try { return JSON.parse(text) } catch { throw new Error('invalid private JSON; inspect the private cache') }
}
const read = (file) => parse(fs.readFileSync(file, 'utf8'))
const readRows = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(parse)
const moveFile = join(dir, 'positions.jsonl')
const eventFile = join(dir, 'punish-events.json')
const moves = readRows(moveFile)
const games = read(join(dir, 'games.json'))
const eventDocument = read(eventFile)
const events = eventDocument.events
const evidenceFile = join(dir, 'evidence/manifest.json')
const evidence = read(evidenceFile)
const heldCasesFile = join(dir, 'held-cases.json')
const heldCases = read(heldCasesFile)
assert(eventDocument.app === pin.commit && eventDocument.records === pin.records && eventDocument.benchmark === false && eventDocument.coverage === 'all-held-out-games', 'punish events are not the full pinned-app extraction')
assert(eventDocument.evidenceManifest === hash(evidenceFile), 'punish events refer to different evidence')
assert(evidence.schema === 'maia-player-offsets-evidence/3' && evidence.app === pin.commit && evidence.records === pin.records && evidence.profile === 'routine', 'invalid evidence provenance')
assert(evidence.gamesSha256 === hash(join(dir, 'games.json')) && evidence.heldCasesSha256 === hash(heldCasesFile), 'evidence games or held-case selection changed')
assert(evidence.frozenHeldCasesSha256 === hash(join(dir, 'frozen-held-cases.json')), 'historical frozen-case provenance changed')
assert(evidence.runnerSha256 === hash(join(LAB_DIR, 'projects/maia-player-offsets/review-one.mts')), 'review adapter changed')
assert(evidence.predecessorBuilderSha256 === hash(join(LAB_DIR, 'projects/accuracy-vs-chesscom/build-evidence.mjs')), 'predecessor evidence builder changed')
assert(evidence.appCliSha256 === hash(join(CHESS_DIR, 'src/cli/commands/review.ts')), 'app review command changed')
assert(JSON.stringify(evidence.adapter) === JSON.stringify({ archiveKeyCache: false, reviews: false, evalCache: false, tablebase: false, pool: 1, freshProcessPerGame: true }), 'review adapter settings differ')
assert(Array.isArray(games) && games.length > 1 && moves.length > 0, 'missing games or counted moves')
assert(Array.isArray(events), 'missing punish events')
assert(Array.isArray(heldCases) && eventDocument.counts?.games === heldCases.length && eventDocument.counts?.events === events.length, 'punish extraction does not cover the selected cases')
assert(evidence.coverage?.selection === 'all-held-out-games' && evidence.coverage?.games === heldCases.length && evidence.coverage?.sourceHalf === 'held' && evidence.coverage?.includesZeroCountGames === true, 'evidence does not cover the full held-out half')
assert(new Set(games.map(g => g.id)).size === games.length, 'duplicate game identifiers')
games.forEach((g, i) => assert(g.g === i && g.half === (i % 2 === 0 ? 'fit' : 'held') && Number.isInteger(g.counted) && g.counted >= 0, 'games or halves differ from the predecessor'))
const counted = games.map(() => 0)
moves.forEach((m, i) => {
  assert(m.k === i && Number.isInteger(m.g) && games[m.g]?.half === m.half, 'move key or half does not match its game')
  assert(typeof m.me === 'boolean' && Number.isFinite(m.r) && Number.isFinite(m.ro) && typeof m.uci === 'string', 'invalid move schema')
  counted[m.g]++
})
assert(games.every((g, i) => g.counted === counted[i]), 'game move counts differ from positions')
const { gameIdOf } = await chess('src/services/archive/index.ts')
const gameById = new Map(games.map(g => [gameIdOf(g.id), g]))
assert(gameById.size === games.length, 'duplicate canonical archive identifiers')
const coveredHeld = requireHeldCoverage(games, heldCases, gameIdOf)
for (const c of heldCases) {
  const g = gameById.get(c.game)
  assert(c.playerColor === g.me && c.myRating === (g.me === 'w' ? g.white : g.black) && c.oppRating === (g.me === 'w' ? g.black : g.white), 'held-out case side or ratings differ from its archive game')
  const file = join(dir, 'evidence/routine', `${c.id}.json`)
  assert(fs.existsSync(file), 'missing routine evidence for a held-out case')
  const doc = read(file)
  assert(doc.schema === 'game-review/2' && doc.id === c.game && doc.playerColor === c.playerColor && doc.provenance?.profile === 'routine', 'held-out evidence does not match its case')
  assert(Array.isArray(doc.fens) && Array.isArray(doc.records) && doc.fens.length === doc.records.length + 1, 'incomplete held-out review evidence')
}
const eventKeys = new Set()
events.forEach((e) => {
  assert(Number.isInteger(e.k) && e.k >= 0 && !eventKeys.has(e.k), 'duplicate or invalid punish event key')
  assert(Number.isInteger(e.g) && coveredHeld.has(e.g) && games[e.g]?.half === 'held' && e.half === 'held', 'punish event is outside the held-out games')
  assert(typeof e.E1 === 'boolean' && typeof e.inExact === 'boolean' && typeof e.me === 'boolean' && Number.isFinite(e.r) && typeof e.bestUci === 'string', 'invalid punish event schema')
  assert(e.dir === (e.me ? 'opp-err' : 'player-err'), 'punish direction and replier side disagree')
  eventKeys.add(e.k)
})

const candidates = [baseline, ...CANDIDATES.A, ...CANDIDATES.B]
assert(new Set(candidates.map(c => c.id)).size === candidates.length, 'candidate identifiers are not unique')
const candidateIndex = new Map(candidates.map((c, i) => [c.id, i]))
const ratings = moves.map(m => m.r).sort((a, b) => a - b)
const cuts = [quantile(ratings, 1 / 3), quantile(ratings, 2 / 3)]
const groupOf = r => r < cuts[0] ? 0 : r < cuts[1] ? 1 : 2
const labels = ['all', 'him', 'opponents', 'ratingLow', 'ratingMiddle', 'ratingHigh']
const tally = () => ({ n: 0, sums: new Float64Array(candidates.length), hits: new Float64Array(candidates.length) })
const per = games.map(g => ({ half: g.half, parts: labels.map(tally) }))
const pairKey = p => `${p.s}/${p.o}`

/** Reject a mixed, partial or stale cache rather than silently taking its last row. */
async function scanPolicies(kind, rows, source, expectedPairs, visit) {
  const files = [0, 1].map(k => `${kind}-policies-${k}-of-2.jsonl`)
  const found = fs.readdirSync(dir).filter(f => new RegExp(`^${kind}-policies-\\d+-of-\\d+\\.jsonl$`).test(f))
  assert(found.length === files.length && found.every(f => files.includes(f)), 'missing or unexpected policy shards')
  const byKey = new Map(rows.map(r => [r.k, r]))
  const seen = new Set()
  for (let k = 0; k < 2; k++) {
    const file = join(dir, files[k])
    const metaFile = `${file}.meta.json`
    assert(fs.existsSync(metaFile), 'policy shard has no provenance')
    const expected = { ...manifest(source), benchmark: false, kind, k, n: 2 }
    assert(JSON.stringify(read(metaFile)) === JSON.stringify(expected), 'policy provenance differs from current app, inputs or design')
    const input = fs.createReadStream(file, { encoding: 'utf8' })
    const lines = createInterface({ input, crlfDelay: Infinity })
    for await (const line of lines) {
      assert(line.length > 0, 'blank policy row')
      const row = parse(line)
      assert(Number.isInteger(row.k) && row.k % 2 === k && byKey.has(row.k) && !seen.has(row.k), 'duplicate, unexpected or misplaced policy row')
      const sourceRow = byKey.get(row.k)
      const required = new Set(expectedPairs(sourceRow).map(pairKey))
      assert(Array.isArray(row.pairs) && row.pairs.length === required.size, 'policy pair count differs from the design')
      const pairs = new Map()
      for (const p of row.pairs) {
        const key = pairKey(p)
        assert(required.has(key) && !pairs.has(key), 'duplicate or unexpected policy band pair')
        assert(Array.isArray(p.ucis) && Array.isArray(p.ps) && p.ucis.length > 0 && p.ucis.length === p.ps.length, 'invalid policy arrays')
        assert(p.ucis.every(u => typeof u === 'string') && new Set(p.ucis).size === p.ucis.length, 'duplicate or invalid policy moves')
        assert(p.ps.every(q => Number.isFinite(q) && q >= 0 && q <= 1), 'invalid policy probability')
        assert(Math.abs(p.ps.reduce((s, q) => s + q, 0) - 1) <= 1e-5, 'policy probabilities do not sum to one')
        pairs.set(key, p)
      }
      visit(sourceRow, pairs)
      seen.add(row.k)
    }
  }
  assert(seen.size === rows.length, 'policy cache is incomplete')
}

await scanPolicies('move', moves, moveFile, pairsFor, (m, pairs) => {
  const scores = new Map()
  for (const [key, p] of pairs) {
    const i = p.ucis.indexOf(m.uci)
    assert(i >= 0 && p.ps[i] > 0, 'played move is missing or has zero probability; no probability floor is allowed')
    const first = p.ps.indexOf(Math.max(...p.ps))
    scores.set(key, { lp: Math.log(p.ps[i]), hit: Number(i === first) })
  }
  const parts = [0, m.me ? 1 : 2, 3 + groupOf(m.r)].map(i => per[m.g].parts[i])
  for (const part of parts) part.n++
  candidates.forEach((c, ci) => {
    const score = scores.get(pairKey(bandsFor(m, c)))
    assert(score, 'candidate band pair is absent from the move policy')
    for (const part of parts) { part.sums[ci] += score.lp; part.hits[ci] += score.hit }
  })
})

const fitIndices = games.flatMap((g, i) => g.half === 'fit' ? [i] : [])
const heldIndices = games.flatMap((g, i) => g.half === 'held' ? [i] : [])
const allIndices = games.map((_, i) => i)
function means(indices, ci, part = 0) {
  let n = 0, sum = 0, hits = 0
  for (const gi of indices) { const p = per[gi].parts[part]; n += p.n; sum += p.sums[ci]; hits += p.hits[ci] }
  return { moves: n, logLikelihood: n ? sum / n : null, firstChoice: n ? hits / n : null }
}
const fitBase = means(fitIndices, 0)
const heldBase = means(heldIndices, 0)
assert(fitBase.moves > 0 && heldBase.moves > 0, 'one half has no counted moves')
const fitted = Object.fromEntries(Object.entries(CANDIDATES).map(([kind, grid]) => {
  const { best, score } = bestFromGrid(grid, c => means(fitIndices, candidateIndex.get(c.id)).logLikelihood)
  assert(score >= fitBase.logLikelihood, 'candidate grid failed to include the baseline conversion')
  return [kind, { candidate: best, index: candidateIndex.get(best.id), fit: score, fitGain: score - fitBase.logLikelihood }]
}))

// One shared sample sequence over every held-out game, including games with
// no counted moves or no punish events. Neither family is refitted in a draw.
const samples = sharedSamples(heldIndices)
function likelihood(ci, part = 0) {
  const base = means(heldIndices, 0, part), candidate = means(heldIndices, ci, part)
  const draws = []
  let emptyDraws = 0
  for (const sample of samples) {
    let sum = 0, n = 0
    for (const gi of sample) { const p = per[gi].parts[part]; sum += p.sums[ci] - p.sums[0]; n += p.n }
    if (!n) emptyDraws++
    else draws.push(sum / n)
  }
  draws.sort((a, b) => a - b)
  const complete = base.moves > 0 && emptyDraws === 0
  const observed = base.moves ? candidate.logLikelihood - base.logLikelihood : null
  const p = complete ? doubledLowerTailP(draws) : null
  return { base, candidate, gain: observed, interval95: complete ? interval(draws) : null, interval975: complete ? interval(draws, 0.0125) : null, p, emptyDraws, complete }
}
const tests = Object.fromEntries(Object.entries(fitted).map(([kind, f]) => [kind, { fitted: f.candidate, fit: f.fit, fitGain: f.fitGain, held: likelihood(f.index) }]))
const ordered = applyHolm(tests)

const cells = [
  { key: 'verified|player-err', dir: 'player-err', exact: true },
  { key: 'verified|opp-err', dir: 'opp-err', exact: true },
  { key: 'all|player-err', dir: 'player-err', exact: false },
  { key: 'all|opp-err', dir: 'opp-err', exact: false },
]
const scoredCandidates = [baseline, fitted.A.candidate, fitted.B.candidate]
const bins = [[0, 0.1], [0.1, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1]]
const punish = games.map(() => cells.map(() => ({ n: 0, sums: [0, 0, 0] })))
const calibration = cells.map(() => scoredCandidates.map(() => bins.map(() => ({ n: 0, q: 0, y: 0 }))))
await scanPolicies('punish', events, eventFile, punishPairs, (e, pairs) => {
  const y = Number(e.E1)
  const probabilities = scoredCandidates.map(c => {
    const band = punishBand(e, c), p = pairs.get(`${band}/${band}`)
    assert(p, 'candidate band is absent from the punish policy')
    const i = p.ucis.indexOf(e.bestUci)
    assert(i >= 0, 'punishing reply is absent from the policy')
    return p.ps[i]
  })
  cells.forEach((cell, ci) => {
    if (e.dir !== cell.dir || (cell.exact && !e.inExact)) return
    const x = punish[e.g][ci]
    x.n++
    probabilities.forEach((q, i) => {
      x.sums[i] += (q - y) ** 2
      const bi = bins.findIndex(([lo, hi], j) => q >= lo && (q < hi || (j === bins.length - 1 && q <= hi)))
      assert(bi >= 0, 'punish probability lies outside calibration bins')
      const bin = calibration[ci][i][bi]
      bin.n++; bin.q += q; bin.y += y
    })
  })
})

for (const [ki, kind] of ['A', 'B'].entries()) {
  const t = tests[kind]
  t.guard = Object.fromEntries(cells.map((cell, ci) => [cell.key, summarizeGuard(punish.map(game => game[ci]), samples, heldIndices, ki + 1)]))
  t.guardPass = allGuardCellsPass(Object.values(t.guard))
  t.eligible = t.wins && t.guardPass
  t.bySide = Object.fromEntries([['him', 1], ['opponents', 2]].map(([label, part]) => [label, likelihood(fitted[kind].index, part)]))
  t.byRating = [0, 1, 2].map(group => {
    const rs = ratings.filter(r => groupOf(r) === group)
    return { from: rs[0] ?? null, to: rs.at(-1) ?? null, ...likelihood(fitted[kind].index, 3 + group) }
  })
  t.firstChoice = { fit: means(fitIndices, fitted[kind].index).firstChoice, all: means(allIndices, fitted[kind].index).firstChoice, held: t.held.candidate.firstChoice }
}

function wilson(k, n) {
  if (!n) return null
  const z = 1.959963984540054, z2 = z * z, p = k / n, denominator = 1 + z2 / n
  const centre = (p + z2 / (2 * n)) / denominator
  const width = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n)) / denominator
  return [centre - width, centre + width]
}
const adopted = chooseAdoption(tests)
const report = {
  phase: 2,
  app: pin.commit, records: pin.records,
  sources: { moves: manifest(moveFile), gamesSha256: hash(join(dir, 'games.json')), events: manifest(eventFile), evidenceManifestSha256: hash(evidenceFile) },
  data: {
    description: 'The pinned archive, predecessor positions and alternating game halves; punish events from routine reviews of every held-out game, rebuilt on the pinned app.',
    games: games.length, moves: moves.length,
    fit: { games: fitIndices.length, moves: fitBase.moves }, held: { games: heldIndices.length, moves: heldBase.moves },
    punish: { events: events.length, games: new Set(events.map(e => e.g)).size, coveredGames: coveredHeld.size, verified: events.filter(e => e.inExact).length },
    moverRating: { min: ratings[0], median: quantile(ratings, 0.5), max: ratings.at(-1), thirdsCuts: cuts },
  },
  rule: {
    base: BASE, candidateCounts: { A: CANDIDATES.A.length, B: CANDIDATES.B.length }, seed: SEED, draws: DRAWS,
    unit: 'held-out game, sampled uniformly with replacement; one shared sequence includes zero-move and zero-event games',
    estimator: 'ratio of summed log-likelihoods to counted moves; no bootstrap refitting',
    quantile: 'sorted[Math.round(q * (draws.length - 1))]',
    p: 'doubled lower-tail bootstrap p for positive gain: min(1, 2 * (1 + count(draw <= 0)) / (draws + 1))',
    pResolution: 2 / (DRAWS + 1),
    minimumFirstHolmAdjustedP: 4 / (DRAWS + 1),
    likelihood: 'positive fitting gain; positive held 95% lower bound; two-candidate Holm adjusted p < .05; first Holm stage uses the 97.5% interval, second 95%; second requires first to win; ties in p put A first',
    guard: 'candidate minus baseline Brier for E1, in each verified/all by player-err/opp-err cell; all four 97.5% upper bounds at most the margin; a missing cell or any empty draw is inconclusive',
    guardMargin: GUARD_MARGIN,
    multiplicity: 'Holm over two likelihood candidates; guard uses a two-sided 97.5% interval per candidate (Bonferroni across two candidates), with all four cells required conjunctively',
    adoption: 'eligible candidate with greatest observed held gain; an exact tie chooses B; otherwise retain the baseline',
  },
  baseline: { fit: fitBase, held: heldBase, all: means(allIndices, 0) },
  tests, holmOrder: ordered, adopted, kept: adopted ? tests[adopted].fitted : baseline,
  calibration: Object.fromEntries(cells.map((cell, ci) => [cell.key, Object.fromEntries(['base', 'A', 'B'].map((kind, i) => [kind, calibration[ci][i].map((b, bi) => {
    const mean = b.n ? b.q / b.n : null, ci95 = wilson(b.y, b.n)
    return { from: bins[bi][0], to: bins[bi][1], events: b.n,
      meanProbability: mean, observed: b.n ? b.y / b.n : null, wilson95: ci95,
      oldBinRuleTested: b.n >= 15, oldBinRuleViolation: b.n >= 15 && (mean < ci95[0] - 0.1 || mean > ci95[1] + 0.1),
    }
  })]))])),
}

const f = x => x === null ? 'inconclusive' : x.toFixed(6)
const iv = x => x === null ? 'inconclusive' : `${f(x[0])} to ${f(x[1])}`
const parameter = c => c.kind === 'A' ? `player ${c.him}, opponents ${c.opp}` : `a = ${c.a}, b = ${c.b}`
const md = [
  '# Maia-2 player offsets: results', '',
  `Written by fit.mjs. App commit ${pin.commit}; records commit ${pin.records}. The archive contributes ${games.length} games and ${moves.length} moves: ${fitIndices.length} fitting games (${fitBase.moves} moves), ${heldIndices.length} held-out games (${heldBase.moves} moves). Punish reviews cover all ${report.data.punish.coveredGames} held-out games and contribute ${report.data.punish.events} events (${report.data.punish.verified} verified) in ${report.data.punish.games} games. All ${heldIndices.length} held-out games enter each of ${DRAWS} shared bootstrap draws, seed ${SEED}.`, '',
  `**Verdict.** ${adopted ? `Candidate ${adopted} is adopted (${parameter(tests[adopted].fitted)}).` : `The app's ${BASE} stays.`}`, '',
  `The likelihood tests use doubled lower-tail bootstrap p-values for positive gain, Holm over two candidates, positive fitting gains, and positive stage interval lower bounds. The punish guard requires each of four Brier-difference upper bounds from the 97.5% intervals to be at most ${GUARD_MARGIN}. A missing cell or empty bootstrap denominator cannot pass.`, '',
  '| Candidate | Fitted values | Fitting gain | Held gain (95% interval) | Holm adjusted p | Likelihood wins | Punish guard |',
  '|---|---|---:|---|---:|---|---|',
  ...['A', 'B'].map(kind => { const t = tests[kind]; return `| ${kind} | ${parameter(t.fitted)} | ${f(t.fitGain)} | ${f(t.held.gain)} (${iv(t.held.interval95)}) | ${f(t.holm.adjustedP)} | ${t.wins} | ${t.guardPass} |` }), '',
  '| Candidate | Guard cell | Events | Baseline Brier | Candidate Brier | Difference (95% interval) | 97.5% interval | Status |',
  '|---|---|---:|---:|---:|---|---|---|',
  ...['A', 'B'].flatMap(kind => Object.entries(tests[kind].guard).map(([key, g]) => `| ${kind} | ${key.replace('|', ', ')} | ${g.events} | ${f(g.base)} | ${f(g.candidate)} | ${f(g.difference)} (${iv(g.interval95)}) | ${iv(g.interval975)} | ${g.status} |`)), '',
  'The following descriptive comparisons do not decide the result.', '',
  '| Candidate | Held moves | Count | Gain (95% interval) |', '|---|---|---:|---|',
  ...['A', 'B'].flatMap(kind => {
    const t = tests[kind]
    return [...Object.entries(t.bySide), ...t.byRating.map(g => [`rating ${g.from} to ${g.to}`, g])].map(([name, g]) => `| ${kind} | ${name} | ${g.base.moves} | ${f(g.gain)} (${iv(g.interval95)}) |`)
  }), '',
  '| Conversion | First-choice share, fitting moves | Held-out moves | All moves |', '|---|---:|---:|---:|',
  `| ${BASE} | ${f(report.baseline.fit.firstChoice)} | ${f(report.baseline.held.firstChoice)} | ${f(report.baseline.all.firstChoice)} |`,
  ...['A', 'B'].map(kind => `| ${kind} | ${f(tests[kind].firstChoice.fit)} | ${f(tests[kind].firstChoice.held)} | ${f(tests[kind].firstChoice.all)} |`), '',
  'The JSON report includes fixed-bin calibration descriptives, the exact numerical rule, all intervals, and input and design hashes.', '',
]
const out = resultsDir('maia-player-offsets')
fs.writeFileSync(join(out, 'offsets.json'), JSON.stringify(report, null, 2) + '\n')
fs.writeFileSync(join(out, 'offsets.md'), md.join('\n'))
console.log(md.slice(0, 5).join('\n'))
}

// Importing these statistical helpers never opens the player's private files.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
