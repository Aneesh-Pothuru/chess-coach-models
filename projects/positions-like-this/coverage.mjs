import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import {
  ARM,
  PROJECT,
  SEED,
  argOf,
  armsOf,
  legalCodes,
  linesOf,
  linesOfAll,
  loadIndex,
  materialKey,
  mulberry32,
  normalBoard,
  readJsonl,
  shardFiles,
  seedOf,
} from './lib.mjs'

const dir = privateDir(PROJECT)
const strongSample = Number(argOf('--strong', '3000'))
const his = readJsonl(join(dir, 'his-candidates.jsonl'))

const heldRows = new Map()
for await (const line of linesOfAll(shardFiles(dir, 'heldout', readdirSync))) {
  const row = JSON.parse(line)
  const list = heldRows.get(row[0])
  if (list) list.push(row)
  else heldRows.set(row[0], [row])
}
const rnd = mulberry32(seedOf('coverage', SEED))
const heldGames = [...heldRows.keys()].sort((a, b) => seedOf('game', a, SEED) - seedOf('game', b, SEED)).slice(0, strongSample)
const strong = heldGames.map((g) => {
  const rows = heldRows.get(g)
  return rows[Math.floor(rnd() * rows.length)]
})

const wanted = new Set([...his.map((p) => materialKey(normalBoard(p.fen))), ...strong.map((r) => materialKey(r[2]))])
const started = Date.now()
const { buckets, rows } = await loadIndex(argOf('--index', null) ?? shardFiles(dir, 'index', readdirSync), wanted)
console.error(JSON.stringify({ loaded: rows, buckets: buckets.size, seconds: Math.round((Date.now() - started) / 1000) }))

function cover(board, legal, seed) {
  const a = armsOf(buckets, board, legal, seed)
  return { bucket: a.size, T: a.T, R: a.R, R2: a.R2 }
}

const quantiles = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  if (s.length === 0) return null
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  return { n: s.length, p10: q(0.1), p25: q(0.25), median: q(0.5), p75: q(0.75), p90: q(0.9) }
}

const hisOut = [0, 1].map(() => ({ candidates: 0, noBucket: 0, covered: 0, nearestD: [], meanTD: [], bucketSizes: [] }))
for (const p of his) {
  const h = hisOut[p.half]
  h.candidates++
  const board = normalBoard(p.fen)
  const legal = legalCodes(p.fen, Chess)
  const c = cover(board, legal, seedOf('his', p.id, SEED))
  if (c.bucket === 0) {
    h.noBucket++
    continue
  }
  h.bucketSizes.push(c.bucket)
  if (c.T.length < ARM || c.R.length < ARM || c.R2.length < ARM) continue
  h.covered++
  h.nearestD.push(c.T[0].d)
  h.meanTD.push(c.T.reduce((s, m) => s + m.d, 0) / ARM)
}

const strongOut = { candidates: 0, noBucket: 0, covered: 0, nearestD: [], meanTD: [] }
for (const row of strong) {
  strongOut.candidates++
  const board = row[2]
  const bucket = buckets.get(materialKey(board))
  if (!bucket) {
    strongOut.noBucket++
    continue
  }
  const turnFen = `${boardToPlacement(board)} w - - 0 1`
  const legal = legalCodes(turnFen, Chess)
  const c = cover(board, legal, seedOf('strong', row[0], row[1], SEED))
  if (c.T.length < ARM || c.R.length < ARM) continue
  strongOut.covered++
  strongOut.nearestD.push(c.T[0].d)
  strongOut.meanTD.push(c.T.reduce((s, m) => s + m.d, 0) / ARM)
}

function boardToPlacement(board) {
  const ranks = []
  for (let r = 7; r >= 0; r--) {
    let s = ''
    let empty = 0
    for (let f = 0; f < 8; f++) {
      const ch = board[r * 8 + f]
      if (ch === '.') {
        empty++
        continue
      }
      if (empty) s += empty
      empty = 0
      s += ch
    }
    if (empty) s += empty
    ranks.push(s)
  }
  return ranks.join('/')
}

const summary = {
  note: 'Coverage only: no move was scored.',
  index: { positions: rows, buckets: buckets.size },
  his: hisOut.map((h, half) => ({
    half,
    candidates: h.candidates,
    noBucket: h.noBucket,
    covered: h.covered,
    share: h.covered / h.candidates,
    nearestD: quantiles(h.nearestD),
    meanTopD: quantiles(h.meanTD),
    bucketSize: quantiles(h.bucketSizes),
  })),
  strong: {
    candidates: strongOut.candidates,
    noBucket: strongOut.noBucket,
    covered: strongOut.covered,
    share: strongOut.covered / strongOut.candidates,
    nearestD: quantiles(strongOut.nearestD),
    meanTopD: quantiles(strongOut.meanTD),
  },
}
writeFileSync(argOf('--out', join(resultsDir(PROJECT), 'coverage.json')), JSON.stringify(summary, null, 2) + '\n')
console.error(JSON.stringify(summary, null, 1))
