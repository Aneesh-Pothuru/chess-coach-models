#!/usr/bin/env node
// A round's padding control (plan.md, "What follows"): moments the round does
// not change, each shown as it is against itself with filler as long as the
// round's change, in the section the change grows: the better move's points,
// or with --section allowed, the points of "What X allowed", where the
// eligible moments are those whose section has no point and the round leaves
// it so, or with --section difference, a sentence after "The difference". The
// filler is as long as the round's median growth of that section, or with
// --growth total, of the whole card, for a round that grows several sections.
// It writes a variant whose cases differ from the old variant's only in
// those moments, so pairwise.mjs makes the control's items exactly as it makes
// the round's, and mix.mjs deals both into the same judges' batches.
//
//   node projects/explain-top-move/judge/controls/pad-variant.mjs --old DIR --round ROUND_DIR --out DIR [--moments 10] [--seed N] [--section better|allowed|difference] [--growth section|total]
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
const part = opt('--section', 'better')
if (!['better', 'allowed', 'difference'].includes(part)) throw new Error(`--section is better, allowed or difference, not ${part}`)
const measure = opt('--growth', 'section')
if (measure !== 'section' && measure !== 'total') throw new Error(`--growth is section or total, not ${measure}`)
const rng = mulberry32(seed)
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

// The round's change: how much it grows the padded section, median over its items.
const items = J(join(roundDir, 'items-r1.json')).items
const key = J(join(roundDir, 'key-r1.json'))
const headed = part === 'allowed' ? (h) => /^What .* allowed: /.test(h) : part === 'difference' ? (h) => h === 'The difference' : (h) => / does instead$/.test(h)
const section = (v) => v.find((s) => headed(s.heading))?.text ?? ''
const size = (v) => (measure === 'total' ? v.reduce((a, s) => a + s.heading.length + s.text.length, 0) : section(v).length)
const growth = items.map((it) => {
  const [nw, od] = key[it.id].X === 'new' ? [it.versionX, it.versionY] : [it.versionY, it.versionX]
  return size(nw) - size(od)
}).sort((a, b) => a - b)
const target = growth[growth.length >> 1]

const cases = J(join(oldDir, 'cases.json'))
const changed = new Set(Object.keys(key))
const fits = part === 'allowed' ? (L) => L.allowed?.san && L.allowed.points.length === 0 : part === 'difference' ? (L) => L.difference?.length > 0 : (L) => L.better
const eligible = cases.filter((c) => c.texts?.cardShows === 'lesson' && c.texts?.lessonFor && fits(c.texts.lessonFor) && !changed.has(c.id)).map((c) => c.id)
const chosen = shuffle(eligible).slice(0, n).sort()
const kinds = shuffle(chosen.map((_, i) => (i % 2 ? 'restate' : 'generic')))

const padding = []
// The section's text as pairwise.mjs lays it out, for the characters the filler adds.
const laidOut = (points, line) => [points.join('; '), line ?? ''].filter(Boolean).join(' · ')
for (const [i, id] of chosen.entries()) {
  const c = cases.find((x) => x.id === id)
  const L = c.texts.lessonFor
  if (part === 'difference') {
    const ctx = { sectionLine: '', bestLine: L.better?.line ?? '', bestBare: c.bestSan }
    const best = candidates(kinds[i], 'The difference', ctx)
      .map((pieces) => { const filler = joined(pieces, false); return { filler, added: 1 + filler.length } })
      .sort((a, b) => Math.abs(a.added - target) - Math.abs(b.added - target))[0]
    L.difference = [...L.difference, best.filler]
    padding.push({ moment: id, kind: kinds[i], added: best.added, target, filler: best.filler })
    continue
  }
  if (part === 'allowed') {
    const allowed = L.allowed
    const ctx = { sectionLine: allowed.line ?? '', bestLine: L.better?.line ?? '', bestBare: c.bestSan }
    const before = laidOut(allowed.points, allowed.line).length
    const best = candidates(kinds[i], `What ${c.san} allowed: ${allowed.san}`, ctx)
      .map((pieces) => { const filler = joined(pieces, true); return { filler, added: laidOut([...allowed.points, filler], allowed.line).length - before } })
      .sort((a, b) => Math.abs(a.added - target) - Math.abs(b.added - target))[0]
    allowed.points = [...allowed.points, best.filler]
    padding.push({ moment: id, kind: kinds[i], added: best.added, target, filler: best.filler })
    continue
  }
  const better = L.better
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
writeFileSync(join(out, 'padding.json'), `${JSON.stringify(part === 'better' && measure === 'section' ? { seed, target, growth, padding } : { seed, section: part, ...(measure === 'total' ? { growthOf: 'the whole card' } : {}), target, growth, padding }, null, 1)}\n`)
console.log(JSON.stringify({ out, target, moments: padding.length, eligible: eligible.length }, null, 1))
