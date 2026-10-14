#!/usr/bin/env node
// A round's padding control (plan.md, "What follows"): moments the round does
// not change, each shown as it is against itself with filler as long as the
// round's change, in the better move's points, where the change grows the
// text. It writes a variant whose cases differ from the old variant's only in
// those moments, so pairwise.mjs makes the control's items exactly as it makes
// the round's, and mix.mjs deals both into the same judges' batches.
//
//   node projects/explain-top-move/judge/controls/pad-variant.mjs --old DIR --round ROUND_DIR --out DIR [--moments 10] [--seed N]
//
// Its files name moments, so DIR belongs under private/explain-top-move/.
//
// DIR/cases.json is the old variant's cases with the filler; DIR/padding.json
// lists the chosen moments, the kind of filler and its length against the
// round's median growth.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { candidates, joined, mulberry32 } from './filler.mjs'

const J = (p) => JSON.parse(readFileSync(p, 'utf8'))
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const oldDir = resolve(opt('--old'))
const roundDir = resolve(opt('--round'))
const out = resolve(opt('--out'))
const n = Number(opt('--moments', 10))
const seed = Number(opt('--seed', 20261014))
const rng = mulberry32(seed)
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

// The round's change: how much it grows the better move's section, median over its items.
const items = J(join(roundDir, 'items-r1.json')).items
const key = J(join(roundDir, 'key-r1.json'))
const section = (v) => v.find((s) => / does instead$/.test(s.heading))?.text ?? ''
const growth = items.map((it) => {
  const [nw, od] = key[it.id].X === 'new' ? [it.versionX, it.versionY] : [it.versionY, it.versionX]
  return section(nw).length - section(od).length
}).sort((a, b) => a - b)
const target = growth[growth.length >> 1]

const cases = J(join(oldDir, 'cases.json'))
const changed = new Set(Object.keys(key))
const eligible = cases.filter((c) => c.texts?.cardShows === 'lesson' && c.texts?.lessonFor?.better && !changed.has(c.id)).map((c) => c.id)
const chosen = shuffle(eligible).slice(0, n).sort()
const kinds = shuffle(chosen.map((_, i) => (i % 2 ? 'restate' : 'generic')))

const padding = []
for (const [i, id] of chosen.entries()) {
  const c = cases.find((x) => x.id === id)
  const better = c.texts.lessonFor.better
  const sep = better.points.length ? 2 : 0
  const ctx = { sectionLine: better.line ?? '', bestLine: better.line ?? '', bestBare: c.bestSan }
  const best = candidates(kinds[i], `What ${c.bestSan} does instead`, ctx)
    .map((pieces) => { const filler = joined(pieces, true); return { filler, added: sep + filler.length } })
    .sort((a, b) => Math.abs(a.added - target) - Math.abs(b.added - target))[0]
  better.points = [...better.points, best.filler]
  padding.push({ moment: id, kind: kinds[i], added: best.added, target, filler: best.filler })
}

mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'cases.json'), `${JSON.stringify(cases, null, 1)}\n`)
writeFileSync(join(out, 'padding.json'), `${JSON.stringify({ seed, target, growth, padding }, null, 1)}\n`)
console.log(JSON.stringify({ out, target, moments: padding.length, eligible: eligible.length }, null, 1))
