import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import {
  BUDGET,
  CAP,
  DRILL_FACTORS,
  MIN_HELDOUT,
  MONTHS,
  PROJECT,
  READINGS,
  RELIABLE,
  WORST_PIECE_LEAN,
  bandOf,
  gitCommit,
  keyOf,
  readJsonl,
  readingDecision,
  studyRows,
  wilson,
} from './lib.mjs'

const D = await chess('src/services/publishing/decks/evalDeck.ts')
const { LEAN_CP } = await chess('src/services/exercises/families/judge.ts')

const dir = privateDir(PROJECT)
const results = resultsDir(PROJECT)
const SPLITS = Object.keys(MONTHS)
const splitOf = Object.fromEntries(Object.entries(MONTHS).map(([s, m]) => [m, s]))
const leanOf = (reading) => (reading === 'worstPiece' ? WORST_PIECE_LEAN : LEAN_CP)

const verdicts = new Map(
  readdirSync(dir)
    .filter((f) => /^verdicts-\d+-of-\d+\.jsonl$/.test(f))
    .flatMap((f) => readJsonl(join(dir, f)))
    .map((v) => [v.key, v]),
)
const rows = studyRows(dir).map((p) => {
  const v = verdicts.get(keyOf(p))
  const value = p.readings[p.reading]
  const verdict = v ? D.verdictFor(v.cp) : undefined
  return {
    ...p,
    split: splitOf[p.month],
    band: bandOf(p.whiteElo, p.blackElo),
    value,
    favours: value > 0 ? 'white' : 'black',
    scored: Boolean(v),
    cp: v?.cp ?? null,
    verdict: verdict === undefined ? 'missing' : verdict ?? 'neither',
  }
})
const missing = rows.filter((r) => !r.scored).length
if (missing > 0) throw new Error(`${missing} positions have no verdict yet`)

const round = (x, d = 4) => (x === null || x === undefined ? null : Math.round(x * 10 ** d) / 10 ** d)
const agreement = (list) => {
  const clear = list.filter((r) => r.verdict === 'white' || r.verdict === 'black')
  const w = wilson(clear.filter((r) => r.verdict === r.favours).length, clear.length)
  return { k: w.k, n: w.n, share: round(w.share), ci: w.ci ? w.ci.map((x) => round(x)) : null }
}
const shares = (list) => {
  const n = list.length
  const count = (v) => list.filter((r) => r.verdict === v).length
  return { n, level: n ? round(count('level') / n) : null, clear: n ? round((count('white') + count('black')) / n) : null, neither: n ? round(count('neither') / n) : null }
}
const by = (list, key) => {
  const out = {}
  for (const r of list) (out[r[key]] ??= []).push(r)
  return Object.fromEntries(Object.entries(out).sort().map(([k, v]) => [k, agreement(v)]))
}
const decisive = (list) => {
  const clear = list.filter((r) => (r.verdict === 'white' || r.verdict === 'black') && (r.result === '1-0' || r.result === '0-1'))
  const winner = (r) => (r.result === '1-0' ? 'white' : 'black')
  const reading = wilson(clear.filter((r) => r.favours === winner(r)).length, clear.length)
  const engine = wilson(clear.filter((r) => r.verdict === winner(r)).length, clear.length)
  const pack = (w) => ({ k: w.k, n: w.n, share: round(w.share), ci: w.ci ? w.ci.map((x) => round(x)) : null })
  return { reading: pack(reading), engine: pack(engine) }
}

const perReading = {}
for (const reading of READINGS) {
  const mineRows = rows.filter((r) => r.reading === reading)
  const sets = Object.fromEntries(SPLITS.map((s) => [s, mineRows.filter((r) => r.split === s)]))
  const a = Object.fromEntries(SPLITS.map((s) => [s, agreement(sets[s])]))
  const decision = readingDecision(a)
  perReading[reading] = {
    lean: leanOf(reading),
    ...decision,
    agreement: a,
    verdicts: Object.fromEntries(SPLITS.map((s) => [s, shares(sets[s])])),
    byBand: Object.fromEntries(SPLITS.map((s) => [s, by(sets[s], 'band')])),
    byPhase: Object.fromEntries(SPLITS.map((s) => [s, by(sets[s], 'phase')])),
    atTwiceLean: Object.fromEntries(SPLITS.map((s) => [s, agreement(sets[s].filter((r) => Math.abs(r.value) >= 2 * leanOf(reading)))])),
    result: Object.fromEntries(SPLITS.map((s) => [s, decisive(sets[s])])),
  }
}

const unique = [...new Map(rows.map((r) => [keyOf(r), r])).values()]
const clearUnique = (s) => unique.filter((r) => r.split === s && (r.verdict === 'white' || r.verdict === 'black'))
const drillSum = Object.fromEntries(
  SPLITS.map((s) => {
    const list = clearUnique(s).filter((r) => DRILL_FACTORS.reduce((t, f) => t + r.readings[f], 0) !== 0)
    const w = wilson(list.filter((r) => (DRILL_FACTORS.reduce((t, f) => t + r.readings[f], 0) > 0 ? 'white' : 'black') === r.verdict).length, list.length)
    return [s, { k: w.k, n: w.n, share: round(w.share), ci: w.ci.map((x) => round(x)) }]
  }),
)

const FEATURES = READINGS
const scaleOf = (f) => (f === 'worstPiece' ? 1 : 100)
const xOf = (r) => [1, ...FEATURES.map((f) => (r.readings[f] ?? 0) / scaleOf(f))]
function fitLogistic(list, features = xOf, l2 = 1e-3, iterations = 50) {
  const k = features(list[0]).length
  let w = new Array(k).fill(0)
  for (let it = 0; it < iterations; it++) {
    const g = new Array(k).fill(0)
    const h = Array.from({ length: k }, () => new Array(k).fill(0))
    for (const r of list) {
      const x = features(r)
      const y = r.verdict === 'white' ? 1 : 0
      const p = 1 / (1 + Math.exp(-x.reduce((t, xi, i) => t + xi * w[i], 0)))
      for (let i = 0; i < k; i++) {
        g[i] += (p - y) * x[i]
        for (let j = 0; j < k; j++) h[i][j] += p * (1 - p) * x[i] * x[j]
      }
    }
    for (let i = 1; i < k; i++) {
      g[i] += l2 * w[i]
      h[i][i] += l2
    }
    const step = solve(h, g)
    w = w.map((wi, i) => wi - step[i])
    if (Math.max(...step.map(Math.abs)) < 1e-9) break
  }
  return w
}
function solve(a, b) {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r
    ;[m[c], m[p]] = [m[p], m[c]]
    for (let r = 0; r < n; r++) {
      if (r === c || m[c][c] === 0) continue
      const f = m[r][c] / m[c][c]
      for (let j = c; j <= n; j++) m[r][j] -= f * m[c][j]
    }
  }
  return m.map((row, i) => row[n] / row[i])
}
const accuracy = (w, list, features = xOf) => {
  const right = list.filter((r) => (features(r).reduce((t, xi, i) => t + xi * w[i], 0) > 0 ? 'white' : 'black') === r.verdict).length
  return { k: right, n: list.length, share: round(right / list.length) }
}
const weights = fitLogistic(clearUnique('train'))
const logistic = {
  features: FEATURES,
  scale: Object.fromEntries(FEATURES.map((f) => [f, scaleOf(f) === 100 ? 'per 100 centipawns' : 'per move'])),
  intercept: round(weights[0]),
  weights: Object.fromEntries(FEATURES.map((f, i) => [f, round(weights[i + 1])])),
  accuracy: Object.fromEntries(SPLITS.map((s) => [s, accuracy(weights, clearUnique(s))])),
}

const sideOf = (r) => (r.fen.split(' ')[1] === 'w' ? 'white' : 'black')
const sideFor = (x) => (x > 0 ? 'white' : 'black')
const leansIn = (r, f) => (f === 'worstPiece' ? r.readings.worstPiece !== null && Math.abs(r.readings.worstPiece) >= WORST_PIECE_LEAN : Math.abs(r.readings[f]) >= LEAN_CP)
const isClear = (r) => r.verdict === 'white' || r.verdict === 'black'
const pack = (w) => ({ k: w.k, n: w.n, share: round(w.share), ci: w.ci ? w.ci.map((x) => round(x)) : null })
const agreeOn = (list, f) => pack(wilson(list.filter((r) => r.verdict === sideFor(r.readings[f])).length, list.length))
const xMove = (r) => [...xOf(r), sideOf(r) === 'white' ? 1 : -1]
const weightsMove = fitLogistic(clearUnique('train'), xMove)
const added = {
  note: 'Added after the run, once the verdicts were read: not among the descriptions the README named before it.',
  baseline: Object.fromEntries(
    SPLITS.map((s) => {
      const clear = clearUnique(s)
      const quiet = clear.filter((r) => !leansIn(r, 'threats'))
      return [s, { white: pack(wilson(clear.filter((r) => r.verdict === 'white').length, clear.length)), sideToMoveWhenNothingLoose: pack(wilson(quiet.filter((r) => r.verdict === sideOf(r)).length, quiet.length)) }]
    }),
  ),
  bySideToMove: Object.fromEntries(
    READINGS.map((f) => [
      f,
      Object.fromEntries(
        SPLITS.map((s) => {
          const mineRows = rows.filter((r) => r.reading === f && r.split === s)
          const clear = mineRows.filter(isClear)
          return [s, { favoursMover: round(mineRows.filter((r) => sideFor(r.value) === sideOf(r)).length / mineRows.length), forMover: agreeOn(clear.filter((r) => sideFor(r.value) === sideOf(r)), f), forOther: agreeOn(clear.filter((r) => sideFor(r.value) !== sideOf(r)), f) }]
        }),
      ),
    ]),
  ),
  alone: Object.fromEntries(
    READINGS.map((f) => [f, Object.fromEntries(SPLITS.map((s) => [s, agreeOn(rows.filter((r) => r.reading === f && r.split === s && isClear(r) && DRILL_FACTORS.filter((g) => g !== f).every((g) => !leansIn(r, g))), f)]))]),
  ),
  conflicts: READINGS.flatMap((f, i) =>
    READINGS.slice(i + 1).map((g) => ({
      first: f,
      second: g,
      ...Object.fromEntries(SPLITS.map((s) => [s, agreeOn(clearUnique(s).filter((r) => leansIn(r, f) && leansIn(r, g) && sideFor(r.readings[f]) !== sideFor(r.readings[g])), f)])),
    })),
  ),
  logisticWithMove: {
    features: [...FEATURES, 'whiteToMove'],
    intercept: round(weightsMove[0]),
    weights: Object.fromEntries([...FEATURES, 'whiteToMove'].map((f, i) => [f, round(weightsMove[i + 1])])),
    accuracy: Object.fromEntries(SPLITS.map((s) => [s, accuracy(weightsMove, clearUnique(s), xMove)])),
  },
}

const scans = Object.fromEntries(
  Object.entries(MONTHS).map(([s, month]) => {
    const parts = readdirSync(dir)
      .filter((f) => f.startsWith(`scan-${month}-`) && f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    const games = JSON.parse(readFileSync(join(dir, `games-${month}.json`), 'utf8'))
    const sum = (f) => parts.reduce((t, p) => t + f(p), 0)
    const drops = {}
    for (const p of parts) for (const [k, v] of Object.entries(p.drops)) drops[k] = (drops[k] ?? 0) + v
    const available = Object.fromEntries(
      READINGS.map((r) => [r, readdirSync(dir).filter((f) => f.startsWith(`positions-${month}-`) && f.endsWith('.jsonl')).flatMap((f) => readJsonl(join(dir, f))).filter((p) => p.reading === r).length]),
    )
    return [s, { month, games: games.kept, gamesRead: games.gamesRead, positions: sum((p) => p.positions), qualifying: sum((p) => p.qualifying), drops, gamesWithLean: available, kept: Object.fromEntries(READINGS.map((r) => [r, Math.min(CAP, available[r])])) }]
  }),
)

const report = {
  question: "With material level, does each of the Judge the position drill's other readings point to the side Stockfish says is better, on Lichess 10-minute games at his band and the band above?",
  app: { commit: gitCommit(CHESS_DIR) },
  design: { months: MONTHS, budget: BUDGET, leanCp: LEAN_CP, worstPieceLean: WORST_PIECE_LEAN, cap: CAP, levelCp: D.EVAL_LEVEL_CP, clearCp: D.EVAL_CLEAR_CP, minHeldout: MIN_HELDOUT, reliable: round(RELIABLE) },
  scans,
  positions: { rows: rows.length, unique: unique.length },
  readings: perReading,
  drillSum,
  logistic,
  added,
}
writeFileSync(join(results, 'judge-factors.json'), JSON.stringify(report, null, 2) + '\n')

const pct = (x) => (x === null ? 'n/a' : `${(100 * x).toFixed(1)}%`)
const ci = (a) => (a.ci ? `${pct(a.share)} (${pct(a.ci[0])} to ${pct(a.ci[1])}), n=${a.n}` : `not enough data (n=${a.n})`)
const NAMES = { kingSafety: 'King safety', activity: 'Activity and space', structure: 'Pawn structure', threats: 'Something loose', worstPiece: 'The worst piece' }
const md = [
  '# Judge factors: results',
  '',
  `Written by \`projects/judge-factors/analyze.mjs\` on app commit \`${report.app.commit.slice(0, 7)}\`, from ${rows.length} positions (${unique.length} distinct) in Lichess 10-minute games, August 2026 (train) and September 2026 (held out); verdicts by Stockfish at the \`${BUDGET}\` budget.`,
  '',
  '| Reading | Verdict | Train agreement | Held-out agreement |',
  '|---|---|---|---|',
  ...READINGS.map((r) => `| ${NAMES[r]} | ${perReading[r].verdict}${perReading[r].reliable ? ', reliable on its own' : ''} | ${ci(perReading[r].agreement.train)} | ${ci(perReading[r].agreement.heldout)} |`),
  '',
  'Agreement: the share of positions with a clear verdict where the side the reading favours is the side the engine says is better, with the 95% Wilson interval. The rule is in the README.',
  '',
  '## Described, not tested',
  '',
  ...READINGS.map((r) => {
    const x = perReading[r]
    return `- ${NAMES[r]}: the engine calls ${pct(x.verdicts.heldout.level)} of its held-out positions level and ${pct(x.verdicts.heldout.clear)} clear; at twice the lean, held-out agreement ${ci(x.atTwiceLean.heldout)}; in decisive held-out games its side won ${ci(x.result.heldout.reading)}, the engine's side ${ci(x.result.heldout.engine)}.`
  }),
  `- The drill's sum of the four factors favours the engine's side in ${ci(drillSum.train)} of train positions and ${ci(drillSum.heldout)} held out.`,
  `- A logistic model of the clear verdict on all five readings, fitted on train: accuracy ${pct(logistic.accuracy.train.share)} on train and ${pct(logistic.accuracy.heldout.share)} held out; weights ${FEATURES.map((f) => `${NAMES[f].toLowerCase()} ${logistic.weights[f]} ${logistic.scale[f]}`).join(', ')}.`,
  '',
  '## Added after the run',
  '',
  `${added.note} Held-out positions.`,
  '',
  `- The engine's side is White in ${ci(added.baseline.heldout.white)} of clear positions, and the side to move in ${ci(added.baseline.heldout.sideToMoveWhenNothingLoose)} of those where something loose does not lean.`,
  ...READINGS.map((r) => {
    const x = added.bySideToMove[r].heldout
    return `- ${NAMES[r]} favours the side to move in ${pct(x.favoursMover)} of its positions; agreement when it does ${ci(x.forMover)}, when it favours the other side ${ci(x.forOther)}; when no other drill factor leans ${ci(added.alone[r].heldout)}.`
  }),
  ...added.conflicts.filter((c) => c.heldout.n > 0).map((c) => `- ${NAMES[c.first]} against ${NAMES[c.second].toLowerCase()}, both leaning opposite ways: the engine sides with ${NAMES[c.first].toLowerCase()} in ${ci(c.heldout)}.`),
  `- With the side to move as a sixth input, the logistic model's accuracy is ${pct(added.logisticWithMove.accuracy.train.share)} on train and ${pct(added.logisticWithMove.accuracy.heldout.share)} held out; the move weighs ${added.logisticWithMove.weights.whiteToMove} for White to move.`,
  '',
]
writeFileSync(join(results, 'judge-factors.md'), md.join('\n'))
console.error(`judge-factors: wrote results (${rows.length} rows)`)
