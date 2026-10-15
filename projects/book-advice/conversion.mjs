// 1f: the app's conversion.sustained on Lichess player-games by rating and on
// his games, against the stage goals and the tripwire, by the README's rule.
//
//   bridge/run.sh projects/book-advice/conversion.mjs
//
// Reads band-above's builds and his archive; writes results/conversion.json
// (counts and rates only).
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, resultsDir } from '../../bridge/lib/chess.mjs'
import { archiveGames, inBand, playerGames, records, share } from './lib.mjs'

const M = await chess('src/services/metrics/index.ts')
const L = await chess('src/services/learner/index.ts')
const E = await chess('src/services/engine/index.ts')

const METRIC = 'conversion.sustained'
const def = M.registry.get(METRIC)
const ctx = { side: 'me', params: {} }
const LOOK_ABOVE = 200

const goals = L.STAGES.flatMap((s) =>
  s.skills
    .filter((k) => k.apply?.kind === 'metric' && k.apply.line.metricId === METRIC)
    .map((k) => {
      const lo = E.toLichess(s.from)
      const hi = E.toLichess(s.to) - 1
      return { stage: s.stage, skill: k.id, chesscom: [s.from, s.to], value: k.apply.line.value, band: [lo, hi], above: [lo + LOOK_ABOVE, hi + LOOK_ABOVE] }
    }),
)
const wire = def.targets.find((t) => t.kind === 'tripwire')
const HIS = [1250, 1449]
const BELOW = [HIS[0] - 200, HIS[1] - 200]

const SIX = [[850, 1049], [1050, 1249], [1250, 1449], [1450, 1649], [1650, 1849], [1850, 2049]]
const HUNDREDS = Array.from({ length: 15 }, (_, i) => [800 + 100 * i, 899 + 100 * i])
const bands = [...SIX, ...HUNDREDS, ...goals.flatMap((g) => [g.band, g.above]), BELOW]
const key = ([lo, hi]) => `${lo}-${hi}`
const tally = new Map(bands.map((b) => [key(b), { band: b, k: 0, n: 0 }]))

let playerGamesRead = 0
for await (const rec of records()) {
  for (const pg of playerGames(rec)) {
    playerGamesRead++
    if (!def.population(pg.g, ctx)) continue
    const won = def.game(pg.g, ctx).s === 1
    for (const t of tally.values()) {
      if (!inBand(pg.rating, t.band)) continue
      t.n++
      if (won) t.k++
    }
  }
}
const rate = (b) => {
  const t = tally.get(key(b))
  return share(t.k, t.n)
}

const { games, skipped } = await archiveGames()
const his = games.filter((x) => def.population(x.g, ctx))
const hisWon = his.filter((x) => def.game(x.g, ctx).s === 1).length
const newest = [...games].sort((a, b) => (b.endTime ?? 0) - (a.endTime ?? 0)).slice(0, wire.window.games)

const verdict = (value, s) => {
  if (!s.ci) return { verdict: 'no data', to: null }
  if (value >= s.ci[0] && value <= s.ci[1]) return { verdict: 'stays', to: value }
  return { verdict: 'moves', to: Math.round(100 * s.p) / 100 }
}

const out = {
  app: CHESS_DIR.split('/').pop(),
  metric: METRIC,
  playerGamesRead,
  bands: [...tally.values()].map((t) => ({ band: t.band, ...share(t.k, t.n) })),
  goals: goals.map((g) => {
    const s = rate(g.above)
    return { ...g, ownBand: rate(g.band), reach: s, ...verdict(g.value, s) }
  }),
  tripwire: { value: wire.value, window: wire.window, below: BELOW, rate: rate(BELOW), ...verdict(wire.value, rate(BELOW)) },
  books: { target: 0.7, his: rate(HIS), above: rate([1450, 1649]) },
  archive: {
    games: games.length,
    skipped,
    conversion: share(hisWon, his.length),
    lastWindow: { games: newest.length, sustained: newest.filter((x) => def.population(x.g, ctx)).length, minN: def.minN },
  },
}
writeFileSync(join(resultsDir('book-advice'), 'conversion.json'), JSON.stringify(out, null, 2) + '\n')
console.log(JSON.stringify({ goals: out.goals, tripwire: out.tripwire, books: out.books, archive: out.archive }, null, 2))
