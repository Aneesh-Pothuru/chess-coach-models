#!/usr/bin/env node
// Deals a round's items and its padding control's into the same judges'
// batches, and splits the answers back, so a judge cannot tell a control from
// the round and pairwise.mjs --score scores each directory unchanged. Each run
// (r1, and r2 with X and Y reversed) is cut into batches in game and ply order,
// as rounds 7 and 8 cut theirs; a moment is in one batch of each run.
//
//   node projects/explain-top-move/judge/controls/mix.mjs --round ROUND_DIR --control CONTROL_DIR --out DIR [--batch 30]
//   node projects/explain-top-move/judge/controls/mix.mjs --split DIR --round ROUND_DIR --control CONTROL_DIR
//
// Its batches name moments, so DIR belongs under private/explain-top-move/.
//
// The batches are DIR/<run>-<n>.json; their answers DIR/out-<run>-<n>.judge.json
// ({ answers: [{ id, choice, reason }] }). --split checks that every item has
// exactly one answer of X, Y or same with a reason, then writes each
// directory's out-<run>.judge.json.

import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const J = (p) => JSON.parse(readFileSync(p, 'utf8'))
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const roundDir = resolve(opt('--round'))
const controlDir = resolve(opt('--control'))
const RUNS = ['r1', 'r2']
const order = (a, b) => { const [ga, pa] = a.id.split('-').map(Number); const [gb, pb] = b.id.split('-').map(Number); return ga - gb || pa - pb }

if (opt('--split')) {
  const dir = resolve(opt('--split'))
  for (const run of RUNS) {
    const owner = new Map()
    for (const d of [roundDir, controlDir]) for (const id of Object.keys(J(join(d, `key-${run}.json`)))) owner.set(id, d)
    const answers = new Map()
    for (const f of readdirSync(dir).filter((x) => x.startsWith(`out-${run}-`) && x.endsWith('.judge.json'))) {
      for (const a of J(join(dir, f)).answers) {
        if (!owner.has(a.id)) throw new Error(`${f}: ${a.id} is no item of ${run}`)
        if (answers.has(a.id)) throw new Error(`${f}: ${a.id} answered twice`)
        if (!['X', 'Y', 'same'].includes(a.choice) || !String(a.reason ?? '').trim()) throw new Error(`${f}: ${a.id} has no valid choice and reason`)
        answers.set(a.id, a)
      }
    }
    const missing = [...owner.keys()].filter((id) => !answers.has(id))
    if (missing.length) throw new Error(`${run}: no answer for ${missing.join(', ')}`)
    for (const d of [roundDir, controlDir]) {
      const mine = [...answers.values()].filter((a) => owner.get(a.id) === d).sort(order)
      writeFileSync(join(d, `out-${run}.judge.json`), `${JSON.stringify({ run, answers: mine }, null, 1)}\n`)
    }
    console.log(`${run}: ${answers.size} answers split`)
  }
  process.exit(0)
}

const out = resolve(opt('--out'))
const batch = Number(opt('--batch', 30))
mkdirSync(out, { recursive: true })
const made = {}
for (const run of RUNS) {
  const all = [roundDir, controlDir].flatMap((d) => J(join(d, `items-${run}.json`)).items).sort(order)
  const parts = Math.ceil(all.length / batch)
  const size = Math.ceil(all.length / parts)
  for (let p = 0; p < parts; p++) {
    const name = `${run}-${p + 1}`
    writeFileSync(join(out, `${name}.json`), `${JSON.stringify({ run: name, items: all.slice(p * size, (p + 1) * size) }, null, 1)}\n`)
    made[name] = all.slice(p * size, (p + 1) * size).length
  }
}
copyFileSync(join(roundDir, 'instructions.md'), join(out, 'instructions.md'))
console.log(JSON.stringify({ out, batches: made }, null, 1))
