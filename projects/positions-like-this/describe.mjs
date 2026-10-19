import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import {
  DISTANCE_BINS,
  PROJECT,
  SEED,
  argOf,
  boot,
  byGame,
  featuresOf,
  legalCodes,
  loadIndex,
  materialKey,
  normalBoard,
  readJsonl,
  rowsOf,
  shardFiles,
  shareOf,
  soundOf,
  transfers,
} from './lib.mjs'

const dir = privateDir(PROJECT)
const out = argOf('--out', resultsDir(PROJECT))
const { his, strong } = rowsOf(dir, readdirSync)

const binOf = (d) => DISTANCE_BINS.findIndex(([lo, hi]) => d >= lo && d <= hi)
const nearestOf = (r) => soundOf(r, r.T[0].move)
const hisValues = (r) => ({
  nearest: nearestOf(r),
  T: shareOf(r, 'T'),
  R: shareOf(r, 'R'),
  A: soundOf(r, r.played),
  N: soundOf(r, r.natural),
  nearestMinusR: nearestOf(r) - shareOf(r, 'R'),
  nearestMinusA: nearestOf(r) - soundOf(r, r.played),
  nearestMinusN: nearestOf(r) - soundOf(r, r.natural),
})
const strongValues = (r) => ({
  nearest: nearestOf(r),
  T: shareOf(r, 'T'),
  R: shareOf(r, 'R'),
  twin: soundOf(r, r.twin),
  nearestMinusR: nearestOf(r) - shareOf(r, 'R'),
  nearestMinusTwin: nearestOf(r) - soundOf(r, r.twin),
})

function byNearest(rows, valuesOf, unitsOf, seed) {
  return DISTANCE_BINS.map(([lo, hi], b) => {
    const sub = rows.filter((r) => binOf(r.T[0].d) === b)
    const stats = sub.length ? boot(unitsOf(sub), valuesOf, seed + b) : null
    return { bin: [lo, Number.isFinite(hi) ? hi : null], positions: sub.length, share: rows.length ? sub.length / rows.length : null, ...(stats ?? {}) }
  })
}

const SIZES = [25000, 50000, 100000, 200000, 400000]
const candidates = new Map(readJsonl(join(dir, 'his-candidates.jsonl')).map((c) => [c.id, c]))
const boards = new Map(his.map((r) => [r.id, normalBoard(candidates.get(r.id).fen)]))
const { buckets } = await loadIndex(shardFiles(dir, 'index', readdirSync), new Set([...boards.values()].map(materialKey)))
const nearestBySize = his.map((r) => {
  const c = candidates.get(r.id)
  const board = boards.get(r.id)
  const bucket = buckets.get(materialKey(board))
  const dist = bucket.distancesTo(featuresOf(board))
  const legal = legalCodes(c.fen, Chess)
  const best = SIZES.map(() => Infinity)
  for (let i = 0; i < bucket.n; i++) {
    if (!transfers(legal, board, bucket, i)) continue
    for (let k = 0; k < SIZES.length; k++) if (bucket.game[i] < SIZES[k] && dist[i] < best[k]) best[k] = dist[i]
  }
  if (best.at(-1) !== r.T[0].d) throw new Error(`position ${r.id}: the nearest match over the whole index is not T's first`)
  return { half: r.half, best }
})
const indexGamesUnder = (n) => {
  const games = new Set()
  for (const b of buckets.values()) for (let i = 0; i < b.n; i++) if (b.game[i] < n) games.add(b.game[i])
  return games.size
}
const medianOf = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length && Number.isFinite(s[Math.floor(s.length / 2)]) ? s[Math.floor(s.length / 2)] : null
}
const scale = SIZES.map((n, k) => {
  const ds = nearestBySize.map((x) => x.best[k])
  const within = (cap) => ds.filter((d) => d <= cap).length / ds.length
  return { streamGames: n, indexGamesWithThesePieces: indexGamesUnder(n), positions: ds.length, none: ds.filter((d) => !Number.isFinite(d)).length, median: medianOf(ds), within2: within(2), within5: within(5), within9: within(9) }
})

const halves = [0, 1].map((h) => his.filter((r) => r.half === h))
const report = {
  added: 'After the run: these descriptions were not named before the rule was applied.',
  his: [
    ...halves.map((rows, h) => ({ half: h, positions: rows.length, bins: byNearest(rows, hisValues, byGame, SEED + 300 + 10 * h) })),
    { half: 'both', positions: his.length, bins: byNearest(his, hisValues, byGame, SEED + 320) },
  ],
  strong: { positions: strong.length, bins: byNearest(strong, strongValues, (rows) => rows.map((r) => [r]), SEED + 330) },
  scale,
}
writeFileSync(join(out, 'descriptions.json'), JSON.stringify(report, null, 2) + '\n')

const pct = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '--' : (100 * x).toFixed(1))
const cell = (s) => (s ? `${pct(s.value)} (${s.ci ? `${pct(s.ci[0])} to ${pct(s.ci[1])}` : '--'})` : '--')
const binText = (b) => `${b.bin[0]}${b.bin[1] === null ? '+' : ` to ${b.bin[1]}`}`
const lines = ['# Positions like this: added after the run', '', report.added, '']
lines.push('## His positions by the distance of their nearest match (%)', '', '| Half | Nearest | Positions | Share | Nearest move | T | R | His move | N | Nearest minus R | Nearest minus his | Nearest minus N |', '|---|---|---|---|---|---|---|---|---|---|---|---|')
for (const h of report.his) {
  for (const b of h.bins) lines.push(`| ${h.half === 'both' ? 'Both' : h.half === 0 ? 'First' : 'Second'} | ${binText(b)} | ${b.positions} | ${pct(b.share)} | ${cell(b.nearest)} | ${cell(b.T)} | ${cell(b.R)} | ${cell(b.A)} | ${cell(b.N)} | ${cell(b.nearestMinusR)} | ${cell(b.nearestMinusA)} | ${cell(b.nearestMinusN)} |`)
}
lines.push('', '## Strong players\' held-out positions by the distance of their nearest match (%)', '', '| Nearest | Positions | Share | Nearest move | T | R | Twin | Nearest minus R | Nearest minus twin |', '|---|---|---|---|---|---|---|---|---|')
for (const b of report.strong.bins) lines.push(`| ${binText(b)} | ${b.positions} | ${pct(b.share)} | ${cell(b.nearest)} | ${cell(b.T)} | ${cell(b.R)} | ${cell(b.twin)} | ${cell(b.nearestMinusR)} | ${cell(b.nearestMinusTwin)} |`)
lines.push('', '## The nearest match of his scored positions as the index grows', '', '| Stream games | Index games with his pieces | Positions | No match | Median distance | Within 2 (%) | Within 5 (%) | Within 9 (%) |', '|---|---|---|---|---|---|---|---|')
for (const x of scale) lines.push(`| ${x.streamGames} | ${x.indexGamesWithThesePieces} | ${x.positions} | ${x.none} | ${x.median} | ${pct(x.within2)} | ${pct(x.within5)} | ${pct(x.within9)} |`)
writeFileSync(join(out, 'descriptions.md'), lines.join('\n') + '\n')
console.error(lines.join('\n'))
