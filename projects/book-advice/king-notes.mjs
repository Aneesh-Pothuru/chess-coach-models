// 1b, after the result: how the signs that clear the bar score inside the
// plies the opening book decides and after them, which of them clear the same
// bar on the positions after those plies (where a warning in a game from the
// start can speak, since it waits out the book's plies: the engine service's
// BOOK_PLY_CAP), and how often a warning built from those would speak in a
// game, under two ways of saying it. The bar is king.json's, applied again to
// the later positions; the rest is reported without a rule, for the port's
// design.
//
//   bridge/run.sh projects/book-advice/king-notes.mjs
//
// Reads his games and a seeded sample of his band's player-games, and the
// engine's reading of the positions king.mjs scored
// (private/book-advice/king-rows.json); writes counts only to
// results/king-notes.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { MONTH, archiveGames, bandOf, playerGames, records, sample, share } from './lib.mjs'
import { signsOf } from './signs.mjs'

const K = await chess('src/services/knowledge/index.ts')
const BOOK_PLY_CAP = (await chess('src/services/engine/index.ts')).BOOK_PLY_CAP ?? (await chess('src/services/review/index.ts')).BOOK_PLY_CAP

const king = JSON.parse(readFileSync(join(resultsDir('book-advice'), 'king.json'), 'utf8'))
const rows = JSON.parse(readFileSync(join(privateDir('book-advice'), 'king-rows.json'), 'utf8'))
const WARNINGS = king.warnings
const PLY_BINS = [[BOOK_PLY_CAP + 1, 20], [21, 30], [31, 40], [41, Infinity]]
const SEED = 20261016
const LICHESS_GAMES = 2000
const WAYS = ['onset', 'oncePerGame']

function notesOf(g, warned) {
  const fens = K.replayFens(g.moves.map((m) => m.san))
  if (fens.length !== g.moves.length + 1) return null
  const out = []
  const seen = new Set()
  let prev = null
  for (const m of g.moves) {
    if (m.mover !== 'me' || m.ply <= BOOK_PLY_CAP || m.inCheck || m.phase === 'endgame') continue
    const s = signsOf(fens[m.ply])
    const now = warned.filter((w) => s[w])
    const onset = now.filter((w) => !prev || !prev.includes(w))
    const first = now.filter((w) => !seen.has(w))
    for (const w of now) seen.add(w)
    out.push({ ply: m.ply, now, onset, first })
    prev = now
  }
  return out
}

const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null
}
const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null)

function report(games, scored) {
  const positions = games.flat()
  const per = (way) => games.map((ps) => ps.filter((p) => (way === 'onset' ? p.onset : p.first).length > 0).length)
  const ways = Object.fromEntries(
    WAYS.map((way) => {
      const counts = per(way)
      return [way, { notesPerGame: mean(counts), median: quantile(counts, 0.5), p90: quantile(counts, 0.9), silentGames: share(counts.filter((c) => c === 0).length, counts.length) }]
    }),
  )
  const read = scored.filter((x) => x.row)
  const precision = (pick) => share(read.filter(pick).filter((x) => danger(x.row)).length, read.filter(pick).length)
  return {
    games: games.length,
    positions: positions.length,
    showing: share(positions.filter((p) => p.now.length > 0).length, positions.length),
    ways,
    scored: {
      positions: read.length,
      onset: precision((x) => x.p.onset.length > 0),
      persisting: precision((x) => x.p.now.length > 0 && x.p.onset.length === 0),
      none: precision((x) => x.p.now.length === 0),
    },
  }
}

const danger = (r) => r.mateThreat || r.swing
const drawn = JSON.parse(readFileSync(join(privateDir('book-advice'), 'scan-king.json'), 'utf8'))
const readOf = (group) => drawn[group].map((p) => ({ p, row: rows[group]?.[`${p.id}:${p.color}:${p.ply}`] })).filter((x) => x.row)

function clears(sign, base) {
  return sign.shows.p >= king.bar.shows && sign.lift !== null && sign.lift >= king.bar.lift && sign.precision.ci !== null && sign.precision.ci[0] >= king.bar.floor * base.p
}

function byBookReach() {
  const out = {}
  for (const group of Object.keys(drawn)) {
    const xs = readOf(group)
    const part = (pick) => {
      const ys = xs.filter(pick)
      const base = share(ys.filter((x) => danger(x.row)).length, ys.length)
      const sign = (has) => {
        const zs = ys.filter(has)
        const precision = share(zs.filter((x) => danger(x.row)).length, zs.length)
        const s = { shows: share(zs.length, ys.length), precision, lift: base.p && precision.p !== null ? Math.round((precision.p / base.p) * 100) / 100 : null }
        return { ...s, clears: clears(s, base) }
      }
      return { base, signs: Object.fromEntries(WARNINGS.map((w) => [w, sign((x) => x.row[w])])), any: sign((x) => WARNINGS.some((w) => x.row[w])) }
    }
    out[group] = { inReach: part((x) => x.p.ply <= BOOK_PLY_CAP), after: part((x) => x.p.ply > BOOK_PLY_CAP) }
  }
  return { plies: BOOK_PLY_CAP, groups: out }
}

function byPly() {
  const out = {}
  for (const group of Object.keys(drawn)) {
    const xs = readOf(group).filter((x) => x.p.ply > BOOK_PLY_CAP)
    const bins = PLY_BINS.map(([lo, hi]) => {
      const ys = xs.filter((x) => x.p.ply >= lo && x.p.ply <= hi)
      return { plies: [lo, hi === Infinity ? null : hi], ys, base: ys.length ? ys.filter((x) => danger(x.row)).length / ys.length : null }
    })
    const standardized = (has) => {
      let observed = 0
      let expected = 0
      for (const b of bins) {
        const zs = b.ys.filter(has)
        observed += zs.filter((x) => danger(x.row)).length
        if (b.base !== null) expected += zs.length * b.base
      }
      return { observed, expected: Math.round(expected * 10) / 10, ratio: expected > 0 ? Math.round((observed / expected) * 100) / 100 : null }
    }
    out[group] = {
      bins: bins.map((b) => ({ plies: b.plies, positions: b.ys.length, base: share(b.ys.filter((x) => danger(x.row)).length, b.ys.length) })),
      signs: Object.fromEntries(WARNINGS.map((w) => [w, standardized((x) => x.row[w])])),
    }
  }
  return out
}

const bookReach = byBookReach()
const spoken = WARNINGS.filter((w) => bookReach.groups.his.after.signs[w].clears)
const his = []
for await (const rec of records()) for (const pg of playerGames(rec)) if (bandOf(pg.rating) === 'his') his.push(pg)
const picked = sample(his, LICHESS_GAMES, SEED)
const archive = (await archiveGames()).games
const notes = {}
for (const [set, warned] of [['spoken', spoken], ['all', WARNINGS]]) {
  notes[set] = { signs: warned, groups: {} }
  for (const [group, list] of [['his', picked], ['archive', archive]]) {
    const games = []
    const scored = []
    for (const x of list) {
      const ps = notesOf(x.g, warned)
      if (!ps) continue
      games.push(ps)
      for (const p of ps) scored.push({ p, row: rows[group]?.[`${x.id}:${x.g.color}:${p.ply}`] ?? null })
    }
    notes[set].groups[group] = report(games, scored)
  }
}
const summary = { month: MONTH, warnings: WARNINGS, bar: king.bar, spoken, sample: { his: LICHESS_GAMES, seed: SEED }, bookReach, byPly: byPly(), notes }
writeFileSync(join(resultsDir('book-advice'), 'king-notes.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ spoken, after: Object.fromEntries(WARNINGS.map((w) => [w, bookReach.groups.his.after.signs[w]])) }, null, 2))
