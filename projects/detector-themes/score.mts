// Score the app's motif labels against Lichess's puzzle themes.
//
// A Lichess puzzle is a blunder (its first move) and the line that punishes it
// (the rest), tagged with themes by Lichess's own tagger. That is exactly what
// three of the app's labellers read:
//
//   best      themeOfBest(position, solution)  the misses deck's theme for the
//             best move he missed (one word)
//   blunder   blunderMotifs(before, blunder, after, score, refutation)  the
//             review scan's motif tags for a bad move: the weakness profile,
//             the metrics, the pattern census
//   move      describeMove(position, solution, { replyPv }).findings  what the
//             explanations say the move does (gain findings for the solver)
//
// Both sides are mapped to the catalogue's concept ids through the app's own
// VOCABULARY, so a Lichess word and an app word name one concept the way the
// app itself resolves them. Per concept: true and false positives, misses,
// precision and recall with Wilson intervals.
//
//   bridge/run.sh projects/detector-themes/score.mts app|heldout
//
// Writes results/score-<set>.json (counts only) and the per-puzzle labels to
// data/processed/ (public puzzles, rebuilt rather than committed).
import fs from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CHESS_DIR, LAB_DIR, resultsDir } from '../../bridge/lib/chess.mjs'
import { Chess } from 'chess.js'

const load = (rel: string) => import(pathToFileURL(join(CHESS_DIR, rel)).href)
const K = await load('src/services/knowledge/index.ts')
const { VOCABULARY } = K

const set = process.argv[2] ?? 'app'
const puzzles: any[] = (() => {
  if (set === 'app') {
    const b = JSON.parse(fs.readFileSync(join(CHESS_DIR, 'src/data/puzzles.json'), 'utf8'))
    const all = Array.isArray(b) ? b : Object.values(b).flat()
    const byId = new Map(all.map((p: any) => [p.id, p]))
    return [...byId.values()]
  }
  if (set === 'heldout') return JSON.parse(fs.readFileSync(join(LAB_DIR, 'data/processed/detector-themes-heldout.json'), 'utf8'))
  throw new Error(`unknown set ${set}`)
})()

/** A word's concept, or null when the vocabulary does not resolve it. */
const conceptOf = (word: string): string | null => VOCABULARY[word] ?? null

const labelers = ['best', 'blunder', 'move'] as const
type Labeler = (typeof labelers)[number]
const counts: Record<Labeler, Record<string, { tp: number; fp: number; fn: number }>> = { best: {}, blunder: {}, move: {} }
const bump = (l: Labeler, c: string, k: 'tp' | 'fp' | 'fn') => ((counts[l][c] ??= { tp: 0, fp: 0, fn: 0 })[k]++)
const unmapped: Record<string, number> = {}
const bestWords: Record<string, number> = {}
const rows: any[] = []
let skipped = 0
const t0 = Date.now()

for (const p of puzzles) {
  const ucis: string[] = p.moves.split(' ')
  const themes: string[] = p.themes.split(' ').filter(Boolean)
  let san0: string, fen1: string, san1: string, color0: 'w' | 'b'
  try {
    const c = new Chess(p.fen)
    color0 = c.turn()
    san0 = c.move({ from: ucis[0].slice(0, 2), to: ucis[0].slice(2, 4), promotion: ucis[0][4] }).san
    fen1 = c.fen()
    san1 = new Chess(fen1).move({ from: ucis[1].slice(0, 2), to: ucis[1].slice(2, 4), promotion: ucis[1][4] }).san
  } catch {
    skipped++
    continue
  }
  const solver = color0 === 'w' ? 'b' : 'w'
  const mateN = themes.map((t) => /^mateIn(\d)$/.exec(t)).find(Boolean)
  const sign = solver === 'w' ? 1 : -1
  const afterScore = mateN ? { cp: null, mate: sign * Number(mateN[1]) } : { cp: sign * 500, mate: null }

  // Lichess's side, as concepts.
  const truth = new Set<string>()
  for (const t of themes) {
    const c = conceptOf(t)
    if (c) truth.add(c)
    else unmapped[t] = (unmapped[t] ?? 0) + 1
  }

  const best = K.themeOfBest(fen1, san1) as string
  bestWords[best] = (bestWords[best] ?? 0) + 1
  const bestC = conceptOf(best)
  const blunderWords: string[] = K.blunderMotifs(p.fen, san0, fen1, afterScore, ucis.slice(1), color0)
  const blunderC = new Set(blunderWords.map(conceptOf).filter((x): x is string => x !== null))
  const facts = K.describeMove(fen1, ucis[1], { replyPv: ucis.slice(2) })
  const moveC = new Set<string>((facts?.findings ?? []).filter((f: any) => f.tone === 'gain' && f.actor === solver).map((f: any) => f.conceptId))

  const said: Record<Labeler, Set<string>> = { best: new Set(bestC ? [bestC] : []), blunder: blunderC, move: moveC }
  for (const l of labelers) {
    for (const c of said[l]) bump(l, c, truth.has(c) ? 'tp' : 'fp')
    for (const c of truth) if (!said[l].has(c)) bump(l, c, 'fn')
  }
  rows.push({ id: p.id, rating: p.rating, themes, truth: [...truth], best, blunder: blunderWords, move: [...moveC] })
}

const wilson = (k: number, n: number) => {
  if (!n) return null
  const z = 1.959964
  const ph = k / n
  const d = 1 + (z * z) / n
  const c = (ph + (z * z) / (2 * n)) / d
  const h = (z * Math.sqrt((ph * (1 - ph)) / n + (z * z) / (4 * n * n))) / d
  return [c - h, c + h]
}
const table: any = {}
for (const l of labelers) {
  table[l] = {}
  for (const [c, x] of Object.entries(counts[l])) {
    const said = x.tp + x.fp
    const real = x.tp + x.fn
    table[l][c] = { ...x, precision: said ? x.tp / said : null, precisionCi: wilson(x.tp, said), recall: real ? x.tp / real : null, recallCi: wilson(x.tp, real) }
  }
}
const out = {
  project: 'detector-themes',
  set,
  app: (await import('node:child_process')).execFileSync('git', ['-C', CHESS_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  candidate: process.env.CANDIDATE ?? null,
  puzzles: rows.length,
  skipped,
  themePuzzles: Object.fromEntries(Object.entries(rows.reduce((m: any, r: any) => { for (const t of r.themes) m[t] = (m[t] ?? 0) + 1; return m }, {})).sort((a: any, b: any) => b[1] - a[1])),
  unmappedThemes: Object.fromEntries(Object.entries(unmapped).sort((a, b) => b[1] - a[1])),
  bestWords,
  table,
}
const tag = process.env.CANDIDATE ? `-${process.env.CANDIDATE}` : ''
fs.writeFileSync(join(resultsDir('detector-themes'), `score-${set}${tag}.json`), JSON.stringify(out, null, 1) + '\n')
fs.mkdirSync(join(LAB_DIR, 'data/processed'), { recursive: true })
fs.writeFileSync(join(LAB_DIR, 'data/processed', `detector-themes-labels-${set}${tag}.json`), JSON.stringify(rows))
console.error(`${set}: ${rows.length} puzzles scored, ${skipped} skipped, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
