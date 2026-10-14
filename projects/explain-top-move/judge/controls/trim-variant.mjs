#!/usr/bin/env node
// A round's trim control, the padding control's mirror for a round that
// shortens its texts: moments the round does not change, each shown as it is
// against itself with the last point of the better move's section removed, a
// shorter text that says less. A judge that prefers it in many comparisons
// rewards shortness itself. It writes a variant whose cases differ from the
// old variant's only in those moments, so pairwise.mjs makes the control's
// items exactly as it makes the round's, and mix.mjs deals both into the same
// judges' batches; score.mjs's roundControl scores it, the trimmed text
// being the decoy.
//
//   node projects/explain-top-move/judge/controls/trim-variant.mjs --old DIR --round ROUND_DIR --out DIR [--moments 10] [--seed N]
//
// Its files name moments, so DIR belongs under private/explain-top-move/.
//
// DIR/cases.json is the old variant's cases with the points removed;
// DIR/trim.json lists the chosen moments and the point each lost. The records
// keep trim.json beside the control's answers (judge/controls/round<N>/), which
// is how score.mjs tells a trim control from a padding control.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { mulberry32 } from './filler.mjs'

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

const cases = J(join(oldDir, 'cases.json'))
const changed = new Set(Object.keys(J(join(roundDir, 'key-r1.json'))))
const eligible = cases
  .filter((c) => c.texts?.cardShows === 'lesson' && (c.texts?.lessonFor?.better?.points?.length ?? 0) >= 2 && !changed.has(c.id))
  .map((c) => c.id)
const chosen = shuffle(eligible).slice(0, n).sort()

const trim = []
for (const id of chosen) {
  const better = cases.find((x) => x.id === id).texts.lessonFor.better
  const removed = better.points.at(-1)
  better.points = better.points.slice(0, -1)
  trim.push({ moment: id, removed, chars: removed.length })
}

mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'cases.json'), `${JSON.stringify(cases, null, 1)}\n`)
writeFileSync(join(out, 'trim.json'), `${JSON.stringify({ seed, trim }, null, 1)}\n`)
console.log(JSON.stringify({ out, moments: trim.length, eligible: eligible.length }, null, 1))
