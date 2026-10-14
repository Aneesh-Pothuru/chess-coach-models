// The rule in README.md, over the policies policies.mts wrote: the offset with
// the highest mean log-likelihood per move on the fitting half, and whether it
// beats the app's 250 on the held-out half, with a bootstrap over games. Also
// the curve over every offset; the best offset with its bootstrap interval over
// all the games, for each side and for each third of the movers' ratings; and
// how often the move played is Maia-2's first choice.
//
//   bridge/run.sh projects/maia-rating-offset/fit.mjs
import fs from 'node:fs'
import { join } from 'node:path'
import { chess, LAB_DIR, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'

const { defaultMaiaElo, DEFAULT_LICHESS_OFFSET, LICHESS_OFFSET_RANGE } = await chess('src/services/engine/index.ts')

const STEP = 25
const OFFSETS = []
for (let o = LICHESS_OFFSET_RANGE.min; o <= LICHESS_OFFSET_RANGE.max; o += STEP) OFFSETS.push(o)
const BASE = DEFAULT_LICHESS_OFFSET
if (!OFFSETS.includes(BASE)) throw new Error(`the app's offset ${BASE} is not on the grid`)
const SEED = 7
const B = 1000

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const quantile = (sorted, q) => sorted[Math.round(q * (sorted.length - 1))]

const dir = privateDir('maia-rating-offset')
const moves = fs.readFileSync(join(dir, 'positions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const games = JSON.parse(fs.readFileSync(join(dir, 'games.json'), 'utf8'))
const policies = new Map()
for (const f of fs.readdirSync(dir).filter((f) => /^policies-\d+-of-\d+\.jsonl$/.test(f))) {
  for (const l of fs.readFileSync(join(dir, f), 'utf8').split('\n')) if (l) { const p = JSON.parse(l); policies.set(p.k, p.pairs) }
}
const missing = moves.filter((m) => !policies.has(m.k)).length
if (missing) throw new Error(`${missing} of ${moves.length} moves have no policies yet: run policies.mts`)

// Per move and offset: the log of the played move's probability, and whether it was Maia-2's first choice.
const ll = moves.map((m) => {
  const pairs = policies.get(m.k)
  return OFFSETS.map((off) => {
    const s = defaultMaiaElo(m.r, off)
    const o = defaultMaiaElo(m.ro, off)
    const p = pairs.find((x) => x.s === s && x.o === o)
    if (!p) throw new Error(`move ${m.k}: no policy for bands ${s}/${o}`)
    const top = p.ps.indexOf(Math.max(...p.ps))
    return { lp: Math.log(p.ps[p.i]), hit: top === p.i ? 1 : 0 }
  })
})

// The movers' ratings in thirds, for a look by level that decides nothing.
const ratings = moves.map((m) => m.r).sort((a, b) => a - b)
const cuts = [quantile(ratings, 1 / 3), quantile(ratings, 2 / 3)]
const groupOf = (r) => (r < cuts[0] ? 0 : r < cuts[1] ? 1 : 2)

// Per game: the sum of log-likelihoods and of first-choice hits at each offset, and the move count.
const tally = () => ({ n: 0, sum: OFFSETS.map(() => 0) })
const per = games.map((g) => ({ g: g.g, half: g.half, n: 0, me: tally(), opp: tally(), groups: [tally(), tally(), tally()], sum: OFFSETS.map(() => 0), hits: OFFSETS.map(() => 0) }))
moves.forEach((m, j) => {
  const x = per[m.g]
  if (x.g !== m.g) throw new Error('games out of order')
  x.n++
  const side = m.me ? x.me : x.opp
  const group = x.groups[groupOf(m.r)]
  side.n++
  group.n++
  ll[j].forEach((v, oi) => { x.sum[oi] += v.lp; x.hits[oi] += v.hit; side.sum[oi] += v.lp; group.sum[oi] += v.lp })
})

const meanAt = (set, oi, pick = (x) => x) => { let s = 0, n = 0; for (const x of set) { const y = pick(x); s += y.sum[oi]; n += y.n } return s / n }
const curve = (set, pick) => OFFSETS.map((_, oi) => meanAt(set, oi, pick))
const best = (c) => {
  let bi = 0
  c.forEach((v, oi) => { if (v > c[bi] || (v === c[bi] && Math.abs(OFFSETS[oi] - BASE) < Math.abs(OFFSETS[bi] - BASE))) bi = oi })
  return bi
}

const fitSet = per.filter((x) => x.half === 'fit')
const heldSet = per.filter((x) => x.half === 'held')
const fitCurve = curve(fitSet)
const heldCurve = curve(heldSet)
const allCurve = curve(per)
const fi = best(fitCurve)
const bi = OFFSETS.indexOf(BASE)
const fitted = OFFSETS[fi]

// The held-out difference, fitted minus 250, over bootstrap draws of the held-out games.
const rng = mulberry32(SEED)
const diffs = []
for (let b = 0; b < B; b++) {
  let s = 0, n = 0
  for (let t = 0; t < heldSet.length; t++) { const x = heldSet[Math.floor(rng() * heldSet.length)]; s += x.sum[fi] - x.sum[bi]; n += x.n }
  diffs.push(s / n)
}
diffs.sort((a, b) => a - b)
const heldDiff = heldCurve[fi] - heldCurve[bi]
const interval = [quantile(diffs, 0.025), quantile(diffs, 0.975)]
const replaces = fitted !== BASE && interval[0] > 0

// The best offset over bootstrap draws of all the games, for all the moves or a part of them.
function bestInterval(pick) {
  const r = mulberry32(SEED)
  const argmaxes = []
  for (let b = 0; b < B; b++) {
    const draw = []
    for (let t = 0; t < per.length; t++) draw.push(per[Math.floor(r() * per.length)])
    argmaxes.push(OFFSETS[best(curve(draw, pick))])
  }
  argmaxes.sort((a, b) => a - b)
  return [quantile(argmaxes, 0.025), quantile(argmaxes, 0.975)]
}

const hitShare = (set, oi) => { let h = 0, n = 0; for (const x of set) { h += x.hits[oi]; n += x.n } return h / n }
const meCurve = curve(per, (x) => x.me)
const oppCurve = curve(per, (x) => x.opp)
const pin = JSON.parse(fs.readFileSync(join(LAB_DIR, 'bridge', 'chess.json'), 'utf8'))
const byRating = [0, 1, 2].map((gi) => {
  const c = curve(per, (x) => x.groups[gi])
  const rs = ratings.filter((r) => groupOf(r) === gi)
  return { from: rs[0], to: rs[rs.length - 1], moves: rs.length, curve: c, best: OFFSETS[best(c)], interval: bestInterval((x) => x.groups[gi]) }
})

const report = {
  app: pin.commit,
  data: {
    games: per.length,
    moves: moves.length,
    fit: { games: fitSet.length, moves: fitSet.reduce((a, x) => a + x.n, 0) },
    held: { games: heldSet.length, moves: heldSet.reduce((a, x) => a + x.n, 0) },
    himMoves: per.reduce((a, x) => a + x.me.n, 0),
    moverRating: { min: ratings[0], median: ratings[Math.floor(ratings.length / 2)], max: ratings[ratings.length - 1] },
  },
  offsets: OFFSETS,
  base: BASE,
  seed: SEED,
  draws: B,
  curve: { fit: fitCurve, held: heldCurve, all: allCurve, him: meCurve, opponents: oppCurve },
  top1: { all: OFFSETS.map((_, oi) => hitShare(per, oi)), held: OFFSETS.map((_, oi) => hitShare(heldSet, oi)) },
  fitted,
  held: { diff: heldDiff, interval, best: OFFSETS[best(heldCurve)] },
  replaces,
  kept: replaces ? fitted : BASE,
  bestOverAll: { offset: OFFSETS[best(allCurve)], interval: bestInterval((x) => x) },
  bestBySide: { him: { offset: OFFSETS[best(meCurve)], interval: bestInterval((x) => x.me) }, opponents: { offset: OFFSETS[best(oppCurve)], interval: bestInterval((x) => x.opp) } },
  byRating,
}

const f4 = (x) => x.toFixed(4)
const pct = (x) => (100 * x).toFixed(1) + '%'
const md = [
  '# Maia-2 rating offset: results',
  '',
  `Written by fit.mjs. App commit ${pin.commit}; ${report.data.games} games and ${report.data.moves} counted moves from its archive (fitting half ${report.data.fit.games} games, ${report.data.fit.moves} moves; held-out half ${report.data.held.games} games, ${report.data.held.moves} moves). Bootstrap: ${B} draws over games, seed ${SEED}.`,
  '',
  fitted === BASE
    ? `**Verdict.** The fitting half's best offset is ${BASE}, the app's own, so ${BASE} stays. The held-out half's best is ${OFFSETS[best(heldCurve)]}.`
    : `**Verdict.** The fitting half's best offset is ${fitted}. On the held-out half its mean log-likelihood per move is ${heldDiff >= 0 ? 'above' : 'below'} ${BASE}'s by ${f4(Math.abs(heldDiff))} (95% interval ${f4(interval[0])} to ${f4(interval[1])}), so ${replaces ? `${fitted} replaces ${BASE}` : `${BASE} stays`}.`,
  '',
  `Beside it: the best offset over all the games is ${report.bestOverAll.offset} (95% interval over draws ${report.bestOverAll.interval[0]} to ${report.bestOverAll.interval[1]}); for the player's own moves alone ${report.bestBySide.him.offset} (${report.bestBySide.him.interval[0]} to ${report.bestBySide.him.interval[1]}), for his opponents' ${report.bestBySide.opponents.offset} (${report.bestBySide.opponents.interval[0]} to ${report.bestBySide.opponents.interval[1]}). By the mover's chess.com rating, in thirds: ${byRating.map((x) => `${x.from} to ${x.to}, ${x.best} (${x.interval[0]} to ${x.interval[1]})`).join('; ')}.`,
  '',
  '| Offset | Mean log-likelihood, fitting half | Held-out half | All games | Maia-2\'s first choice, all games |',
  '|---:|---:|---:|---:|---:|',
  ...OFFSETS.map((o, oi) => `| ${o}${o === BASE ? ' (app)' : ''}${o === fitted ? ' (fitted)' : ''} | ${f4(fitCurve[oi])} | ${f4(heldCurve[oi])} | ${f4(allCurve[oi])} | ${pct(report.top1.all[oi])} |`),
  '',
]
const out = resultsDir('maia-rating-offset')
fs.writeFileSync(join(out, 'offset.json'), JSON.stringify(report, null, 1) + '\n')
fs.writeFileSync(join(out, 'offset.md'), md.join('\n'))
console.log(md.slice(0, 5).join('\n'))
