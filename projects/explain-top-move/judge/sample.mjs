#!/usr/bin/env node
// A seeded sample of a round's changed moments for the judge, for a round
// that changes more moments than its judges can read, drawn from their ids
// alone: in each --from directory (pairwise.mjs's items of one set) and each
// split, the ids sorted as text, shuffled by Fisher–Yates on a fresh
// mulberry32 seeded --seed, and the first --per taken. --also adds changed
// moments the draw left out, judged in the same batches and listed apart, so
// the round's score can leave them out (pairwise.mjs --score --only).
//
//   node projects/explain-top-move/judge/sample.mjs --from DIR [--from DIR ...] --out ROUND_DIR [--all DIR] [--per 20] [--seed 20261015] [--also id,id]
//
// ROUND_DIR gets the sample's items and keys as pairwise.mjs writes them, and
// sample.json: the drawn ids by directory and split, the counted ids and the
// extras. --all DIR gets every --from moment's items and keys in one
// directory, the round whose growth pad-variant.mjs measures. Both name
// moments, so they belong under private/explain-top-move/.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mulberry32 } from './controls/filler.mjs'

const J = (p) => JSON.parse(readFileSync(p, 'utf8'))
const RUNS = ['r1', 'r2']

/** One cell's draw: the ids sorted as text, shuffled by Fisher–Yates on a fresh mulberry32 seeded `seed`, the first `per` taken, sorted again. */
export function draw(ids, seed, per) {
  const order = [...ids].sort()
  const rng = mulberry32(seed)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order.slice(0, per).sort()
}

function main(args) {
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
  const from = args.flatMap((a, i) => (a === '--from' ? [resolve(args[i + 1])] : []))
  if (!from.length || !opt('--out')) throw new Error('usage: sample.mjs --from DIR [--from DIR ...] --out ROUND_DIR [--all DIR] [--per 20] [--seed N] [--also id,id]')
  const out = resolve(opt('--out'))
  const allDir = opt('--all') ? resolve(opt('--all')) : null
  const per = Number(opt('--per', 20))
  const seed = Number(opt('--seed', 20261015))
  const also = String(opt('--also', '')).split(',').filter(Boolean)

  const items = { r1: new Map(), r2: new Map() }
  const keys = { r1: {}, r2: {} }
  const cells = {}
  for (const dir of from) {
    for (const run of RUNS) {
      for (const it of J(join(dir, `items-${run}.json`)).items) {
        if (items[run].has(it.id)) throw new Error(`${it.id} is in two --from directories`)
        items[run].set(it.id, it)
      }
      Object.assign(keys[run], J(join(dir, `key-${run}.json`)))
    }
    const key = J(join(dir, 'key-r1.json'))
    for (const split of ['train', 'test']) {
      const ids = Object.keys(key).filter((id) => key[id].split === split)
      cells[`${basename(dir)} ${split}`] = { of: ids.length, drawn: draw(ids, seed, per) }
    }
  }
  const counted = Object.values(cells).flatMap((c) => c.drawn)
  for (const id of also) if (!items.r1.has(id)) throw new Error(`--also ${id} is no changed moment`)
  const extras = also.filter((id) => !counted.includes(id))

  const write = (dir, ids) => {
    mkdirSync(dir, { recursive: true })
    for (const run of RUNS) {
      writeFileSync(join(dir, `items-${run}.json`), JSON.stringify({ items: [...items[run].values()].filter((it) => ids.has(it.id)) }, null, 1))
      writeFileSync(join(dir, `key-${run}.json`), JSON.stringify(Object.fromEntries(Object.entries(keys[run]).filter(([id]) => ids.has(id))), null, 1))
    }
    for (const f of ['rule.txt', 'instructions.md']) if (existsSync(join(from[0], f))) copyFileSync(join(from[0], f), join(dir, f))
  }
  write(out, new Set([...counted, ...extras]))
  writeFileSync(join(out, 'sample.json'), `${JSON.stringify({ seed, per, cells, counted, extras }, null, 1)}\n`)
  if (allDir) write(allDir, new Set(items.r1.keys()))
  console.log(JSON.stringify({ counted: counted.length, extras: extras.length, cells: Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, `${c.drawn.length} of ${c.of}`])), out, all: allDir }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
