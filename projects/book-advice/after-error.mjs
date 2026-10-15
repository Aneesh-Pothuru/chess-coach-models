// 1a: the move after the opponent's serious error, by the README's rule.
//
//   bridge/run.sh projects/book-advice/after-error.mjs facts
//   bridge/run.sh projects/book-advice/after-error.mjs engine [--pool 4]
//
// `facts` splits every event into punished, trap, missed and other from the
// move facts alone, and keeps the misses and the offers (an opponent's quiet
// move that left a piece of theirs newly hanging) for the engine, under
// private/book-advice/. `engine` searches a seeded sample of them with the
// app's Node engine service and names what each miss missed. Both write
// counts only to results/after-error.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { archiveGames, bandOf, playerGames, records, share } from './lib.mjs'

const K = await chess('src/services/knowledge/index.ts')
const C = await chess('src/core/chess/index.ts')

const PRIVATE = privateDir('book-advice')
const RESULTS = join(resultsDir('book-advice'), 'after-error.json')
const CANDIDATES = join(PRIVATE, 'after-error-candidates.json')
const ROWS = join(PRIVATE, 'after-error-engine.json')
const mode = process.argv[2]
const arg = (name, d) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? Number(process.argv[i + 1]) : d
}

const OFFERED = new Set(['n', 'b', 'r', 'q'])
const GIFT_FLOOR = 20
const HIGH_WP = 75
const SAMPLE = { misses: 2000, offers: 3000 }
const SEED = 20261015
const GROUPS = ['his', 'above', 'archive']

const blank = () => ({ events: 0, other: 0, punished: 0, trap: 0, missed: 0 })
function outcomeOf(m, prev) {
  if (m.forced) return 'other'
  if (m.lossPct <= prev.lossPct / 2) return 'punished'
  if (m.captured !== null && m.serious) return 'trap'
  return 'missed'
}

/** Pieces of `color` hanging in `fen`, by square. */
const hangingOf = (fen, color) => new Map(K.hangingPieces(fen, color).map((h) => [h.square, h]))

function offersIn(g, fens, mover) {
  const out = []
  for (const m of g.moves) {
    if (m.mover !== mover || m.ply === 0) continue
    const prev = g.moves[m.ply - 1]
    if (prev.captured !== null || !prev.uci || !fens[m.ply] || !fens[m.ply - 1]) continue
    const opp = prev.color
    const before = hangingOf(fens[m.ply - 1], opp)
    const after = hangingOf(fens[m.ply], opp)
    const from = prev.uci.slice(0, 2)
    const to = prev.uci.slice(2, 4)
    for (const [sq, h] of after) {
      if (!OFFERED.has(h.piece)) continue
      const was = before.get(sq === to ? from : sq)
      if (was && was.piece === h.piece) continue
      out.push({ ply: m.ply, fen: fens[m.ply], square: sq, piece: h.piece, kind: h.kind, played: m.uci, took: m.uci !== null && m.uci.slice(2, 4) === sq, lossPct: m.lossPct, judged: m.judged, serious: m.serious, wpBefore: m.wpBefore })
    }
  }
  return out
}

async function facts() {
  const split = Object.fromEntries(GROUPS.map((k) => [k, { all: blank(), gift20: blank(), afterPunish: { next: 0, nextSerious: 0, highOther: 0, highOtherSerious: 0 } }]))
  const misses = Object.fromEntries(GROUPS.map((k) => [k, []]))
  const offers = Object.fromEntries(GROUPS.map((k) => [k, []]))

  const read = (group, g, id) => {
    const s = split[group]
    let fens = null
    const fensOf = () => (fens ??= K.replayFens(g.moves.map((m) => m.san)))
    const punishedPly = new Set()
    for (const m of g.moves) {
      if (m.mover !== 'me' || !m.afterOppError) continue
      const prev = g.moves[m.ply - 1]
      if (m.lossPct === null || prev.lossPct === null) continue
      const o = outcomeOf(m, prev)
      s.all.events++
      s.all[o]++
      if (prev.lossPct >= GIFT_FLOOR) {
        s.gift20.events++
        s.gift20[o]++
      }
      if (o === 'punished') punishedPly.add(m.ply)
      if (o === 'missed') misses[group].push({ id, ply: m.ply, fen: fensOf()[m.ply], played: m.uci, gift: prev.lossPct, lossPct: m.lossPct })
    }
    for (const m of g.moves) {
      if (m.mover !== 'me' || !m.graded) continue
      if (punishedPly.has(m.ply - 2)) {
        s.afterPunish.next++
        if (m.serious) s.afterPunish.nextSerious++
      } else if (m.wpBefore !== null && m.wpBefore >= HIGH_WP) {
        s.afterPunish.highOther++
        if (m.serious) s.afterPunish.highOtherSerious++
      }
    }
    for (const o of offersIn(g, fensOf(), 'me')) offers[group].push({ id, ...o })
  }

  let playerGamesRead = 0
  for await (const rec of records()) {
    for (const pg of playerGames(rec)) {
      playerGamesRead++
      const band = bandOf(pg.rating)
      if (band) read(band, pg.g, pg.id)
    }
  }
  const { games, skipped } = await archiveGames()
  for (const x of games) read('archive', x.g, x.id)

  writeFileSync(CANDIDATES, JSON.stringify({ misses, offers }) + '\n')
  const summary = {
    app: CHESS_DIR.split('/').pop(),
    playerGamesRead,
    archive: { games: games.length, skipped },
    groups: Object.fromEntries(GROUPS.map((k) => [k, report(split[k], misses[k].length, offers[k].length)])),
  }
  writeFileSync(RESULTS, JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify(summary, null, 2))
}

function report(s, nMisses, nOffers) {
  const view = (b) => {
    const failures = b.trap + b.missed
    return {
      events: b.events,
      other: share(b.other, b.events),
      punished: share(b.punished, b.events),
      trap: share(b.trap, b.events),
      missed: share(b.missed, b.events),
      trapOfFailures: share(b.trap, failures),
      missedOfFailures: share(b.missed, failures),
    }
  }
  return {
    all: view(s.all),
    gift20: view(s.gift20),
    afterPunish: { nextSerious: share(s.afterPunish.nextSerious, s.afterPunish.next), highOtherSerious: share(s.afterPunish.highOtherSerious, s.afterPunish.highOther) },
    misses: nMisses,
    offers: nOffers,
  }
}

/** A seeded shuffle (mulberry32), so a sample is the same on every run. */
function sample(list, n, seed) {
  let a = seed >>> 0
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const xs = [...list]
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return n >= xs.length ? xs : xs.slice(0, n)
}

/** The cheapest attacker's capture of `square` in `fen`, as UCI. */
function cheapestCapture(fen, square) {
  const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
  const caps = new Chess(fen).moves({ verbose: true }).filter((mv) => mv.to === square)
  if (caps.length === 0) return null
  caps.sort((a, b) => VALUE[a.piece] - VALUE[b.piece])
  return caps[0].from + caps[0].to + (caps[0].promotion ?? '')
}

async function engine() {
  const E = await chess('src/adapters/node/engine/index.ts')
  const { misses, offers } = JSON.parse(readFileSync(CANDIDATES, 'utf8'))
  const done = existsSync(ROWS) ? JSON.parse(readFileSync(ROWS, 'utf8')) : { misses: {}, offers: {} }
  const eng = E.createNodeEngine({ root: CHESS_DIR, pool: arg('pool', 4), tablebase: false, evalCache: false, human: false })
  const t0 = Date.now()
  let n = 0
  const tick = () => {
    if (++n % 200 === 0) {
      console.error(`${n} searched, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
      writeFileSync(ROWS, JSON.stringify(done) + '\n')
    }
  }
  for (const group of GROUPS) {
    const ms = group === 'archive' ? misses[group] : sample(misses[group], SAMPLE.misses, SEED)
    done.misses[group] ??= {}
    await Promise.all(
      ms.map(async (x) => {
        const k = `${x.id}:${x.ply}`
        if (done.misses[group][k]) return
        try {
          const r = await eng.evaluate(C.position(x.fen), 'best', { priority: 'batch' })
          const best = r.best ?? r.pv?.[0] ?? null
          done.misses[group][k] = { best, theme: best ? K.themeOfBest(x.fen, best) : null, gift: x.gift, lossPct: x.lossPct }
        } catch (e) {
          console.error(`miss ${k}: ${e.message}`)
        }
        tick()
      }),
    )
    const os = group === 'archive' ? offers[group] : sample(offers[group], SAMPLE.offers, SEED + 1)
    done.offers[group] ??= {}
    await Promise.all(
      os.map(async (x) => {
        const k = `${x.id}:${x.ply}:${x.square}`
        if (done.offers[group][k]) return
        const uci = cheapestCapture(x.fen, x.square)
        if (!uci) return
        const pos = C.position(x.fen)
        const mover = x.fen.split(' ')[1]
        try {
          const [here, take] = await Promise.all([eng.evaluate(pos, 'best', { priority: 'batch' }), eng.scoreMove(pos, uci, { budget: 'best', priority: 'batch' })])
          done.offers[group][k] = { piece: x.piece, kind: x.kind, took: x.took, serious: x.serious, capture: uci, judged: K.judgeMove(here.eval, take.eval, mover) }
        } catch (e) {
          console.error(`offer ${k}: ${e.message}`)
        }
        tick()
      }),
    )
    writeFileSync(ROWS, JSON.stringify(done) + '\n')
  }
  eng.dispose()

  const summary = JSON.parse(readFileSync(RESULTS, 'utf8'))
  for (const group of GROUPS) {
    const rows = Object.values(done.misses[group] ?? {})
    const themes = {}
    for (const r of rows) themes[r.theme ?? 'none'] = (themes[r.theme ?? 'none'] ?? 0) + 1
    const of = (...ids) => share(rows.filter((r) => ids.includes(r.theme)).length, rows.length)
    const os = Object.values(done.offers[group] ?? {})
    const trap = (r) => r.judged === 'mistake' || r.judged === 'blunder'
    summary.groups[group].missesSearched = rows.length
    summary.groups[group].missedThemes = themes
    summary.groups[group].missedKinds = {
      hangingPiece: of('hangingPiece'),
      mate: of('mateIn1', 'backRankMate'),
      fork: of('fork'),
      pinSkewerDiscovered: of('pin', 'skewer', 'discoveredAttack'),
      attackingF2F7: of('attackingF2F7'),
      defensiveMove: of('defensiveMove'),
      unnamed: of('opening', 'middlegame', 'endgame', 'tactics', null),
    }
    summary.groups[group].offered = {
      searched: os.length,
      traps: share(os.filter(trap).length, os.length),
      tookTrap: share(os.filter((r) => trap(r) && r.took).length, os.filter(trap).length),
      leftGift: share(os.filter((r) => !trap(r) && !r.took).length, os.filter((r) => !trap(r)).length),
      byPiece: Object.fromEntries(['n', 'b', 'r', 'q'].map((p) => [p, share(os.filter((r) => r.piece === p && trap(r)).length, os.filter((r) => r.piece === p).length)])),
    }
  }
  summary.engine = { budget: 'best', seconds: Math.round((Date.now() - t0) / 1000), sample: SAMPLE, seed: SEED }
  writeFileSync(RESULTS, JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify(summary, null, 2))
}

if (mode === 'facts') await facts()
else if (mode === 'engine') await engine()
else throw new Error('usage: after-error.mjs facts|engine [--pool N]')
