import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { MIN_CELL, PROJECT, SEED, argOf, bootOf, breakSound, byGame, readJsonl, rowsOf, sansOf, soundOf } from './lib.mjs'

const K = await chess('src/services/knowledge/index.ts')

const dir = privateDir(PROJECT)
const out = argOf('--out', resultsDir(PROJECT))
const his = rowsOf(dir, 'his', readdirSync).scored
const strong = rowsOf(dir, 'strong', readdirSync).scored
const candidates = {
  his: new Map(readJsonl(join(dir, 'his-candidates.jsonl')).map((c) => [c.id, c])),
  strong: new Map(readJsonl(join(dir, 'strong-candidates.jsonl')).map((c) => [c.id, c])),
}

const isBreak = (r, uci) => (r.breaks.includes(uci) ? 1 : 0)
const anySound = (r) => (r.breaks.some((m) => r.scores[m].sound) ? 1 : 0)
const hisBoot = (rows, valuesOf, seed) => bootOf(byGame(rows), valuesOf, seed)
const strongBoot = (rows, valuesOf, seed) => bootOf(rows.map((r) => [r]), valuesOf, seed)

const some = {
  his: [0, 1].map((h) =>
    hisBoot(his.filter((r) => r.half === h), (r) => ({ any: anySound(r), A: soundOf(r, r.played), anyMinusA: anySound(r) - soundOf(r, r.played), BminusR: breakSound(r) - soundOf(r, r.R) }), SEED + 500 + h),
  ),
  strong: strongBoot(strong, (r) => ({ any: anySound(r), S: soundOf(r, r.played), anyMinusS: anySound(r) - soundOf(r, r.played), BminusR: breakSound(r) - soundOf(r, r.R) }), SEED + 510),
}

const playedIt = his.filter((r) => isBreak(r, r.played))
const didNot = his.filter((r) => !isBreak(r, r.played))
const strongPlayed = strong.filter((r) => isBreak(r, r.played))
const strongDidNot = strong.filter((r) => !isBreak(r, r.played))
const whenPlayed = {
  his: {
    played: hisBoot(playedIt, (r) => ({ sound: soundOf(r, r.played), B: breakSound(r) }), SEED + 520),
    notPlayed: hisBoot(didNot, (r) => ({ B: breakSound(r), A: soundOf(r, r.played) }), SEED + 521),
  },
  strong: {
    played: strongBoot(strongPlayed, (r) => ({ sound: soundOf(r, r.played), B: breakSound(r) }), SEED + 522),
    notPlayed: strongBoot(strongDidNot, (r) => ({ B: breakSound(r), S: soundOf(r, r.played) }), SEED + 523),
  },
}

const bestIsBreak = (r) => r.breaks.includes(r.best)
const findValues = (r) => ({ playedBreak: isBreak(r, r.played), playedBest: r.played === r.best ? 1 : 0, massHis: r.breakMass.his, massPlus: r.breakMass.plus })
const whenBest = {
  his: {
    best: hisBoot(his.filter(bestIsBreak), findValues, SEED + 530),
    notBest: hisBoot(his.filter((r) => !bestIsBreak(r)), findValues, SEED + 531),
  },
  strong: {
    best: strongBoot(strong.filter(bestIsBreak), (r) => ({ playedBreak: isBreak(r, r.played), playedBest: r.played === r.best ? 1 : 0 }), SEED + 532),
    notBest: strongBoot(strong.filter((r) => !bestIsBreak(r)), (r) => ({ playedBreak: isBreak(r, r.played), playedBest: r.played === r.best ? 1 : 0 }), SEED + 533),
  },
}

function leverMoves(who, r) {
  const c = candidates[who].get(r.id)
  const sans = sansOf(c.history)
  const meIsWhite = c.fen.split(' ')[1] === 'w'
  const board = new Chess(c.fen)
  const sanOf = (uci) => board.moves({ verbose: true }).find((m) => m.from + m.to + (m.promotion ?? '') === uci).san
  return c.levers.map((lever) => ({ lever, moves: r.breaks.filter((m) => K.playedLever([...sans, sanOf(m)], meIsWhite, [lever], sans.length)) }))
}
function perLever(who, rows, seed) {
  const groups = new Map()
  for (const r of rows) {
    for (const { lever, moves } of leverMoves(who, r)) {
      if (!moves.length) continue
      const key = `${r.structure}|${lever}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push({ ...r, leverMoves: moves })
    }
  }
  const values = (r) => {
    const L = r.leverMoves.reduce((s, m) => s + soundOf(r, m), 0) / r.leverMoves.length
    const own = soundOf(r, r.played)
    return { L, own, gain: L - own }
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([key, list], i) => {
      const [structure, lever] = key.split('|')
      const stats = list.length >= MIN_CELL ? (who === 'his' ? hisBoot(list, values, seed + i) : strongBoot(list, values, seed + i)) : null
      return {
        structure,
        lever,
        positions: list.length,
        ...(who === 'his' ? { games: new Set(list.map((r) => r.gi)).size } : {}),
        ...(stats ? { stats } : { stats: null, note: `not enough data (n=${list.length})` }),
      }
    })
}
const levers = { his: perLever('his', his, SEED + 600), strong: perLever('strong', strong, SEED + 700) }

const strongByStructure = [...Map.groupBy(strong, (r) => r.structure).entries()]
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  .map(([structure, list], i) => ({
    structure,
    positions: list.length,
    ...(list.length >= MIN_CELL
      ? { stats: strongBoot(list, (r) => ({ B: breakSound(r), S: soundOf(r, r.played), gain: breakSound(r) - soundOf(r, r.played) }), SEED + 800 + i) }
      : { stats: null, note: `not enough data (n=${list.length})` }),
  }))

const report = { some, whenPlayed, whenBest, levers, strongByStructure }
writeFileSync(join(out, 'descriptions.json'), JSON.stringify(report, null, 2) + '\n')

const pct = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '--' : (100 * x).toFixed(1))
const cell = (s) => (s ? `${pct(s.value)} (${s.ci ? `${pct(s.ci[0])} to ${pct(s.ci[1])}` : '--'})` : '--')
const lines = ['# Added after the run: what the breaks describe', '', 'None of this was named before the run; it describes and decides nothing.', '']
lines.push('## Some break sound, and the breaks against a random move (%)', '', '| Positions | n | Some break sound | His or the strong player\'s move | Difference (points) | B minus R (points) |', '|---|---|---|---|---|---|')
some.his.forEach((s, h) => lines.push(`| His, ${h ? 'second' : 'first'} half | ${s?.n ?? 0} | ${cell(s?.any)} | ${cell(s?.A)} | ${cell(s?.anyMinusA)} | ${cell(s?.BminusR)} |`))
lines.push(`| Strong players | ${some.strong?.n ?? 0} | ${cell(some.strong?.any)} | ${cell(some.strong?.S)} | ${cell(some.strong?.anyMinusS)} | ${cell(some.strong?.BminusR)} |`)
lines.push('', '## When the break was played (%)', '', '| Positions | n | The break played, sound | The breaks, sound | The move played, sound |', '|---|---|---|---|---|')
lines.push(`| His, he played a break | ${whenPlayed.his.played?.n ?? 0} | ${cell(whenPlayed.his.played?.sound)} | ${cell(whenPlayed.his.played?.B)} | |`)
lines.push(`| His, he did not | ${whenPlayed.his.notPlayed?.n ?? 0} | | ${cell(whenPlayed.his.notPlayed?.B)} | ${cell(whenPlayed.his.notPlayed?.A)} |`)
lines.push(`| Strong, played a break | ${whenPlayed.strong.played?.n ?? 0} | ${cell(whenPlayed.strong.played?.sound)} | ${cell(whenPlayed.strong.played?.B)} | |`)
lines.push(`| Strong, did not | ${whenPlayed.strong.notPlayed?.n ?? 0} | | ${cell(whenPlayed.strong.notPlayed?.B)} | ${cell(whenPlayed.strong.notPlayed?.S)} |`)
lines.push('', '## When a break is the referee\'s best (%)', '', '| Positions | n | Played a break | Played the best | Maia-2 at his band gives the breaks | At the band above |', '|---|---|---|---|---|---|')
for (const [name, s] of [['His, a break is best', whenBest.his.best], ['His, no break is best', whenBest.his.notBest], ['Strong, a break is best', whenBest.strong.best], ['Strong, no break is best', whenBest.strong.notBest]]) {
  lines.push(`| ${name} | ${s?.n ?? 0} | ${cell(s?.playedBreak)} | ${cell(s?.playedBest)} | ${cell(s?.massHis)} | ${cell(s?.massPlus)} |`)
}
lines.push('', '## Strong players\' positions by structure (%)', '', '| Structure | Positions | B | S | B minus S (points) |', '|---|---|---|---|---|')
for (const c of strongByStructure) lines.push(`| ${c.structure} | ${c.positions} | ${c.stats ? cell(c.stats.B) : c.note} | ${c.stats ? cell(c.stats.S) : ''} | ${c.stats ? cell(c.stats.gain) : ''} |`)
for (const who of ['his', 'strong']) {
  lines.push('', `## Each break of each structure, ${who === 'his' ? 'his positions, halves pooled' : 'strong players\' positions'} (%)`, '', '| Structure | Break | Positions | The break, sound | The move played, sound | Difference (points) |', '|---|---|---|---|---|---|')
  for (const c of levers[who]) lines.push(`| ${c.structure} | ${c.lever} | ${c.positions} | ${c.stats ? cell(c.stats.L) : c.note} | ${c.stats ? cell(c.stats.own) : ''} | ${c.stats ? cell(c.stats.gain) : ''} |`)
}
writeFileSync(join(out, 'descriptions.md'), lines.join('\n') + '\n')
console.error(lines.join('\n'))
