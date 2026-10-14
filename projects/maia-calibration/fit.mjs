// The rule in README.md: a temperature for each Maia band, fitted on the
// Lichess sample's fitting half, and the three tests that decide it (the
// Lichess held-out half, the player's games, the punish events), each with a
// bootstrap over games. Also each band's temperature, the top choice's
// confidence against how often it is the move played, before and after, and
// how often the first choice is the move played over the whole sample.
//
//   bridge/run.sh projects/maia-calibration/fit.mjs
import fs from 'node:fs'
import { join } from 'node:path'
import { chess, LAB_DIR, privateDir, projectDir, resultsDir } from '../../bridge/lib/chess.mjs'

const { defaultMaiaElo, maiaBands } = await chess('src/services/engine/index.ts')

const SEED = 7
const B = 1000
const MIN_FIT_MOVES = 300

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
const readJsonl = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))

/** A policy at temperature T: p^(1/T), divided by the same sum over the legal moves. */
function tempered(ps, T) {
  if (T === 1) return ps
  const w = ps.map((p) => Math.pow(Math.max(p, 1e-300), 1 / T))
  const z = w.reduce((a, b) => a + b, 0)
  return w.map((x) => x / z)
}
/** Log of the played move's probability at temperature T, computed in log space. */
function logp(ps, i, T) {
  const beta = 1 / T
  const zs = ps.map((p) => beta * Math.log(Math.max(p, 1e-300)))
  const m = Math.max(...zs)
  return zs[i] - (m + Math.log(zs.reduce((a, z) => a + Math.exp(z - m), 0)))
}
const nll = (rows, T) => -rows.reduce((a, r) => a + logp(r.ps, r.i, T), 0)

/** The maximum-likelihood temperature: golden-section search on 1/T, where the loss is convex. */
function fitTemperature(rows) {
  let lo = 0.2, hi = 3
  const g = (Math.sqrt(5) - 1) / 2
  let a = hi - g * (hi - lo), b = lo + g * (hi - lo)
  let fa = nll(rows, 1 / a), fb = nll(rows, 1 / b)
  while (hi - lo > 1e-6) {
    if (fa < fb) { hi = b; b = a; fb = fa; a = hi - g * (hi - lo); fa = nll(rows, 1 / a) }
    else { lo = a; a = b; fa = fb; b = lo + g * (hi - lo); fb = nll(rows, 1 / b) }
  }
  return 1 / ((lo + hi) / 2)
}

// The Lichess sample, scored.
const cal = privateDir('maia-calibration')
const sample = readJsonl(join(cal, 'lichess-sample.jsonl'))
const lichessPolicies = new Map()
for (const f of fs.readdirSync(cal).filter((f) => /^lichess-policies-\d+-of-\d+\.jsonl$/.test(f))) for (const p of readJsonl(join(cal, f))) lichessPolicies.set(p.k, p)
const unscored = sample.filter((m) => !lichessPolicies.has(m.k)).length
if (unscored) throw new Error(`${unscored} of ${sample.length} Lichess moves are not scored yet: run lichess-policies.mts`)
const lichess = sample.map((m) => ({ ...m, ...lichessPolicies.get(m.k) }))

// Each band's temperature, from the movers in that band in the fitting half.
const bands = maiaBands()
const temperature = {}
const fitMoves = {}
for (const band of bands) {
  const rows = lichess.filter((m) => m.half === 'fit' && m.s === band)
  fitMoves[band] = rows.length
  temperature[band] = rows.length >= MIN_FIT_MOVES ? fitTemperature(rows) : 1
}
const T = (band) => temperature[band] ?? 1

/** Per game: the summed log-likelihood of the moves played, raw and tempered, and the move count. */
function perGame(rows, bandOf) {
  const games = new Map()
  for (const r of rows) {
    const x = games.get(r.game) ?? { raw: 0, tempered: 0, n: 0 }
    x.raw += logp(r.ps, r.i, 1)
    x.tempered += logp(r.ps, r.i, T(bandOf(r)))
    x.n++
    games.set(r.game, x)
  }
  return [...games.values()]
}
/** The mean per move of `delta` summed over a bootstrap draw of the units, and the observed value. */
function bootstrap(units, delta, weight) {
  const rng = mulberry32(SEED)
  const draws = []
  for (let b = 0; b < B; b++) {
    let s = 0, n = 0
    for (let t = 0; t < units.length; t++) { const u = units[Math.floor(rng() * units.length)]; s += delta(u); n += weight(u) }
    draws.push(s / n)
  }
  draws.sort((a, b) => a - b)
  const observed = units.reduce((a, u) => a + delta(u), 0) / units.reduce((a, u) => a + weight(u), 0)
  return { observed, interval: [quantile(draws, 0.025), quantile(draws, 0.975)] }
}
const llTest = (games) => ({
  raw: games.reduce((a, g) => a + g.raw, 0) / games.reduce((a, g) => a + g.n, 0),
  tempered: games.reduce((a, g) => a + g.tempered, 0) / games.reduce((a, g) => a + g.n, 0),
  ...bootstrap(games, (g) => g.tempered - g.raw, (g) => g.n),
})

// 1. The Lichess held-out half.
const lichessHeld = lichess.filter((m) => m.half === 'held')
const test1 = llTest(perGame(lichessHeld, (r) => r.s))

// 2. The player's games, at the offset maia-rating-offset keeps.
const offsetReport = JSON.parse(fs.readFileSync(join(projectDir('maia-rating-offset'), 'results', 'offset.json'), 'utf8'))
const kept = offsetReport.kept
const mro = privateDir('maia-rating-offset')
const his = readJsonl(join(mro, 'positions.jsonl'))
const hisPolicies = new Map()
for (const f of fs.readdirSync(mro).filter((f) => /^policies-\d+-of-\d+\.jsonl$/.test(f))) for (const p of readJsonl(join(mro, f))) hisPolicies.set(p.k, p.pairs)
const hisRows = his.map((m) => {
  const s = defaultMaiaElo(m.r, kept)
  const o = defaultMaiaElo(m.ro, kept)
  const pair = (hisPolicies.get(m.k) ?? []).find((p) => p.s === s && p.o === o)
  if (!pair) throw new Error(`move ${m.k}: no policy at bands ${s}/${o}`)
  return { game: m.g, s, i: pair.i, ps: pair.ps, me: m.me }
})
const test2 = llTest(perGame(hisRows, (r) => r.s))

// 3. The punish events: the Brier score of the punish odds against whether the punishing reply was played.
const punish = JSON.parse(fs.readFileSync(join(cal, 'punish-policies.json'), 'utf8'))
if (punish.offset !== kept) throw new Error(`the punish events were priced at offset ${punish.offset}, not ${kept}: rerun punish-policies.mts`)
function brierTest(rows) {
  const games = new Map()
  for (const r of rows) {
    const x = games.get(r.game) ?? { raw: 0, tempered: 0, n: 0 }
    const q = r.ps[r.best]
    const qT = tempered(r.ps, T(r.band))[r.best]
    const y = r.E1 ? 1 : 0
    x.raw += (q - y) ** 2
    x.tempered += (qT - y) ** 2
    x.n++
    games.set(r.game, x)
  }
  const units = [...games.values()]
  const n = units.reduce((a, g) => a + g.n, 0)
  return { events: n, games: units.length, raw: units.reduce((a, g) => a + g.raw, 0) / n, tempered: units.reduce((a, g) => a + g.tempered, 0) / n, ...bootstrap(units, (g) => g.tempered - g.raw, (g) => g.n) }
}
const test3 = brierTest(punish.rows.filter((r) => r.inExact))
const test3All = brierTest(punish.rows)

const pass1 = test1.interval[0] > 0
const pass2 = test2.interval[0] > 0
const pass3 = !(test3.interval[0] > 0)
const adopted = pass1 && pass2 && pass3

/** The top choice's mean probability and how often it is the move played, per band, raw and tempered. */
function confidence(rows) {
  const out = {}
  for (const band of bands) {
    const rs = rows.filter((r) => r.s === band)
    if (rs.length === 0) continue
    let hit = 0, raw = 0, temp = 0
    for (const r of rs) {
      const top = r.ps.indexOf(Math.max(...r.ps))
      if (top === r.i) hit++
      raw += r.ps[top]
      temp += tempered(r.ps, T(band))[top]
    }
    out[band] = { moves: rs.length, played: hit / rs.length, raw: raw / rs.length, tempered: temp / rs.length }
  }
  return out
}

// Beside the rule: how often the app's Maia-2 has the move played as its first choice over the whole
// sample, the number the lab's benchmark reports for its own Maia-2 on the same moves.
const firstChoice = lichess.filter((m) => m.ps.indexOf(Math.max(...m.ps)) === m.i).length

const pin = JSON.parse(fs.readFileSync(join(LAB_DIR, 'bridge', 'chess.json'), 'utf8'))
const report = {
  app: pin.commit,
  data: {
    lichess: { moves: lichess.length, games: new Set(lichess.map((m) => m.game)).size, fitMoves: lichess.filter((m) => m.half === 'fit').length, heldMoves: lichessHeld.length },
    his: { moves: hisRows.length, games: new Set(hisRows.map((r) => r.game)).size, offset: kept },
    punish: { exact: test3.events, all: test3All.events, games: test3All.games },
  },
  seed: SEED,
  draws: B,
  minFitMoves: MIN_FIT_MOVES,
  temperature,
  fitMoves,
  tests: { lichessHeld: { ...test1, pass: pass1 }, his: { ...test2, pass: pass2 }, punish: { ...test3, pass: pass3 }, punishAll: test3All },
  adopted,
  confidence: { lichessHeld: confidence(lichessHeld), his: confidence(hisRows) },
  firstChoice: { moves: lichess.length, played: firstChoice },
}

const f3 = (x) => x.toFixed(3)
const f4 = (x) => x.toFixed(4)
const pct = (x) => (100 * x).toFixed(1)
const iv = (t) => `${f4(t.interval[0])} to ${f4(t.interval[1])}`
const md = [
  '# Maia-2 calibration by band: results',
  '',
  `Written by fit.mjs. App commit ${pin.commit}. Lichess sample: ${report.data.lichess.moves} moves in ${report.data.lichess.games} games (fitting half ${report.data.lichess.fitMoves} moves, held-out half ${report.data.lichess.heldMoves}). The player's games: ${report.data.his.moves} moves in ${report.data.his.games} games, at offset ${kept}. Punish events: ${report.data.punish.exact} in the primary set, ${report.data.punish.all} in all, over ${report.data.punish.games} games. Bootstrap: ${B} draws over games, seed ${SEED}.`,
  '',
  `**Verdict.** ${adopted ? 'Adopted' : 'Not adopted'}: Lichess held-out ${pass1 ? 'passes' : 'fails'}, the player's games ${pass2 ? 'pass' : 'fail'}, the punish events ${pass3 ? 'pass' : 'fail'}.`,
  '',
  `Beside it: the app's Maia-2 has the move played as its first choice for ${firstChoice} of the ${lichess.length} Lichess moves (${pct(firstChoice / lichess.length)}%).`,
  '',
  '| Test | Raw | Tempered | Difference (95% interval) |',
  '|---|---:|---:|---:|',
  `| Lichess held-out, mean log-likelihood per move | ${f4(test1.raw)} | ${f4(test1.tempered)} | ${f4(test1.observed)} (${iv(test1)}) |`,
  `| The player's games, mean log-likelihood per move | ${f4(test2.raw)} | ${f4(test2.tempered)} | ${f4(test2.observed)} (${iv(test2)}) |`,
  `| Punish events (primary set), Brier score | ${f4(test3.raw)} | ${f4(test3.tempered)} | ${f4(test3.observed)} (${iv(test3)}) |`,
  `| Punish events (all), Brier score | ${f4(test3All.raw)} | ${f4(test3All.tempered)} | ${f4(test3All.observed)} (${iv(test3All)}) |`,
  '',
  '| Band | Fitting moves | Temperature | Lichess held-out: top choice played | mean top probability, raw | tempered | The player\'s games: moves | top choice played | raw | tempered |',
  '|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ...bands.map((band) => {
    const l = report.confidence.lichessHeld[band]
    const h = report.confidence.his[band]
    const cell = (c) => (c ? [pct(c.played) + '%', pct(c.raw) + '%', pct(c.tempered) + '%'] : ['', '', ''])
    return `| ${band} | ${fitMoves[band]} | ${f3(temperature[band])} | ${cell(l).join(' | ')} | ${h ? h.moves : 0} | ${cell(h).join(' | ')} |`
  }),
  '',
]
const out = resultsDir('maia-calibration')
fs.writeFileSync(join(out, 'calibration.json'), JSON.stringify(report, null, 1) + '\n')
fs.writeFileSync(join(out, 'calibration.md'), md.join('\n'))
console.log(md.slice(0, 5).join('\n'))
