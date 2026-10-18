import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { DRAWS, KINDS, LICHESS_BANDS, PROJECT, SEED, argOf, mulberry32, readJsonl } from './lib.mjs'

const dir = privateDir(PROJECT)
const out = argOf('--out', resultsDir(PROJECT))
const K = KINDS.length
const HALVES = [0, 1]
const bit = (k) => 1 << k
const FLOOR = 1e-6

const rowsOf = (prefix) =>
  readdirSync(dir)
    .filter((f) => f.startsWith(`${prefix}-`) && /-of-\d+\.jsonl$/.test(f))
    .flatMap((f) => readJsonl(join(dir, f)))
const hisRows = rowsOf('his').sort((a, b) => a.id - b.id)
const lichessRows = rowsOf('lichess').sort((a, b) => a.k - b.k)

const sumInto = (acc, x) => {
  for (let i = 0; i < acc.length; i++) acc[i] += x[i]
}
const vec = () => new Float64Array(K)

const games = new Map()
for (const r of hisRows) {
  let g = games.get(r.gi)
  if (!g) {
    g = { half: r.half, n: 0, N: vec(), eHis: vec(), ePlus: vec(), llHis: 0, llPlus: 0, plusMore: 0, zeros: 0 }
    games.set(r.gi, g)
  }
  g.n++
  for (let k = 0; k < K; k++) if (r.maskP & bit(k)) g.N[k]++
  sumInto(g.eHis, r.eHis)
  sumInto(g.ePlus, r.ePlus)
  if (!(r.pHisP > 0) || !(r.pPlusP > 0)) g.zeros++
  g.llHis += Math.log(Math.max(r.pHisP, FLOOR))
  g.llPlus += Math.log(Math.max(r.pPlusP, FLOOR))
  if (r.pPlusP > r.pHisP) g.plusMore++
}
const byHalf = HALVES.map((h) => [...games.values()].filter((g) => g.half === h))

const units = new Map(LICHESS_BANDS.map((b) => [b, []]))
for (const r of lichessRows) {
  if (r.positions.length === 0) continue
  const u = { n: r.positions.length, N: vec(), E: vec() }
  for (const p of r.positions) {
    for (let k = 0; k < K; k++) if (p.maskReal & bit(k)) u.N[k]++
    sumInto(u.E, p.e)
  }
  units.get(r.band).push(u)
}

function hisStats(list) {
  const n = list.reduce((s, g) => s + g.n, 0)
  const N = vec()
  const eHis = vec()
  const ePlus = vec()
  for (const g of list) {
    sumInto(N, g.N)
    sumInto(eHis, g.eHis)
    sumInto(ePlus, g.ePlus)
  }
  const llHis = list.reduce((s, g) => s + g.llHis, 0) / n
  const llPlus = list.reduce((s, g) => s + g.llPlus, 0) / n
  return {
    positions: n,
    rate: [...N].map((x) => x / n),
    maiaHis: [...eHis].map((x) => x / n),
    maiaPlus: [...ePlus].map((x) => x / n),
    llHis,
    llPlus,
    llGain: llPlus - llHis,
    plusMore: list.reduce((s, g) => s + g.plusMore, 0) / n,
    zeros: list.reduce((s, g) => s + g.zeros, 0),
  }
}

function bandStats(list) {
  const n = list.reduce((s, u) => s + u.n, 0)
  const N = vec()
  const E = vec()
  for (const u of list) {
    sumInto(N, u.N)
    sumInto(E, u.E)
  }
  return { positions: n, rate: [...N].map((x) => x / n), maia: [...E].map((x) => x / n) }
}

const resample = (list, rnd) => list.map(() => list[Math.floor(rnd() * list.length)])
const interval = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (s.length < 0.95 * xs.length) return null
  return [s[Math.floor(0.025 * (s.length - 1))], s[Math.ceil(0.975 * (s.length - 1))]]
}

const rnd = mulberry32(SEED + 5)
const hisPoint = byHalf.map(hisStats)
const bandPoint = LICHESS_BANDS.map((b) => bandStats(units.get(b)))
const hisDraws = byHalf.map(() => [])
const bandDraws = LICHESS_BANDS.map(() => [])
for (let d = 0; d < DRAWS; d++) {
  byHalf.forEach((list, h) => hisDraws[h].push(hisStats(resample(list, rnd))))
  LICHESS_BANDS.forEach((b, i) => bandDraws[i].push(bandStats(resample(units.get(b), rnd))))
}

const report = {
  note: 'Descriptions added after the rule was applied; none was named before the run.',
  his: HALVES.map((h) => {
    const p = hisPoint[h]
    const ds = hisDraws[h]
    return {
      half: h,
      positions: p.positions,
      likelihood: {
        his: p.llHis,
        above: p.llPlus,
        gain: p.llGain,
        ciGain: interval(ds.map((x) => x.llGain)),
        aboveMoreLikely: p.plusMore,
        floored: p.zeros,
      },
      kinds: KINDS.map((kind, k) => ({
        kind,
        rate: p.rate[k],
        ciRate: interval(ds.map((x) => x.rate[k])),
        maiaHis: p.maiaHis[k],
        maiaAbove: p.maiaPlus[k],
        maiaStep: p.maiaPlus[k] / p.maiaHis[k],
        ciMaiaStep: interval(ds.map((x) => x.maiaPlus[k] / x.maiaHis[k])),
      })),
    }
  }),
  lichess: LICHESS_BANDS.map((band, i) => ({
    band,
    positions: bandPoint[i].positions,
    kinds: KINDS.map((kind, k) => ({
      kind,
      rate: bandPoint[i].rate[k],
      ciRate: interval(bandDraws[i].map((x) => x.rate[k])),
      maia: bandPoint[i].maia[k],
    })),
  })),
}

writeFileSync(join(out, 'descriptions.json'), JSON.stringify(report, null, 2) + '\n')
const pct = (x) => (x === null || !Number.isFinite(x) ? '--' : (100 * x).toFixed(1))
const lines = ['# His habits: descriptions added after the run', '', report.note, '']
lines.push('## Which band reads his moves better', '', '| Half | Positions | Mean log-likelihood, his band | The band above | Gain | 95% interval | Positions where the band above gives his move more |', '|---|---|---|---|---|---|---|')
for (const h of report.his) {
  const l = h.likelihood
  lines.push(`| ${h.half === 0 ? 'First' : 'Second'} | ${h.positions} | ${l.his.toFixed(3)} | ${l.above.toFixed(3)} | ${l.gain.toFixed(3)} | ${l.ciGain ? l.ciGain.map((x) => x.toFixed(3)).join(' to ') : '--'} | ${pct(l.aboveMoreLikely)}% |`)
}
lines.push('', '## His rate of each kind, and Maia-2\'s in his positions (% of positions)', '', '| Kind | His, first | Maia his band | Maia above | His, second | Maia his band | Maia above |', '|---|---|---|---|---|---|---|')
KINDS.forEach((kind, k) => {
  const [a, b] = report.his.map((h) => h.kinds[k])
  lines.push(`| ${kind} | ${pct(a.rate)} | ${pct(a.maiaHis)} | ${pct(a.maiaAbove)} | ${pct(b.rate)} | ${pct(b.maiaHis)} | ${pct(b.maiaAbove)} |`)
})
lines.push('', '## Lichess players: the rate of each kind at each band (% of positions), with Maia-2\'s', '', `| Kind | ${LICHESS_BANDS.join(' | ')} |`, `|---|${LICHESS_BANDS.map(() => '---').join('|')}|`)
KINDS.forEach((kind, k) => {
  lines.push(`| ${kind} | ${report.lichess.map((b) => `${pct(b.kinds[k].rate)} (${pct(b.kinds[k].maia)})`).join(' | ')} |`)
})
writeFileSync(join(out, 'descriptions.md'), lines.join('\n') + '\n')
console.error(lines.slice(0, 8).join('\n'))
