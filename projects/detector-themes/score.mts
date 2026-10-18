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
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { CHESS_DIR, LAB_DIR, resultsDir } from '../../bridge/lib/chess.mjs'
import { Chess } from 'chess.js'

const load = (rel: string) => import(pathToFileURL(join(CHESS_DIR, rel)).href)
const K = await load('src/services/knowledge/index.ts')
const { VOCABULARY } = K

const set = process.argv[2] ?? 'app'
const round2 = process.argv.includes('--round2')
const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1]
const limit = process.argv.includes('--limit') ? Number(arg('--limit')) : Infinity
const shard = process.argv.includes('--shard') ? arg('--shard').split('/').map(Number) : [0, 1]
const merge = process.argv.includes('--merge')
const shards = merge ? Number(arg('--merge')) : shard[1]
if (!Number.isInteger(shards) || shards < 1 || shards > 2 || !Number.isInteger(shard[0]) || shard[0] < 0 || shard[0] >= shard[1]) throw new Error('use at most two shards, numbered from zero')
if ((merge || shards > 1 || limit !== Infinity) && !round2) throw new Error('resuming, slices and shards require --round2')
if (!(limit > 0)) throw new Error('limit must be positive')
const candidate = process.env.CANDIDATE ?? null
if (candidate && !/^[a-z0-9-]+$/.test(candidate)) throw new Error('invalid candidate name')
const tag = candidate ? `-${candidate}` : ''
const app = (await import('node:child_process')).execFileSync('git', ['-C', CHESS_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const outputDir = join(resultsDir('detector-themes'), ...(round2 ? ['round2'] : []))
const rowDir = join(LAB_DIR, round2 ? 'private/detector-themes/round2' : 'data/processed')
fs.mkdirSync(outputDir, { recursive: true })
fs.mkdirSync(rowDir, { recursive: true })
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
let rows: any[] = []
let skipped = 0
const t0 = Date.now()
const datasetSha256 = digest(JSON.stringify(puzzles))
const instrumentFiles = ['src/services/knowledge/detectors/theme.ts', 'src/services/knowledge/detectors/motifs.ts', 'src/services/knowledge/catalogue/vocabulary.ts']
const sourceSha256 = Object.fromEntries(instrumentFiles.map((path) => [path, digest(fs.readFileSync(join(CHESS_DIR, path), 'utf8'))]))
const identity = { app, candidate, set, datasetSha256, sourceSha256, scorerSha256: digest(fs.readFileSync(new URL(import.meta.url), 'utf8')), shards }
const cachePath = (k: number) => join(rowDir, `work-${set}${tag}-${k}-of-${shards}.jsonl`)
const metaPath = (k: number) => `${cachePath(k)}.meta.json`
const readWork = (k: number): any[] => {
  if (!fs.existsSync(cachePath(k))) return []
  if (JSON.stringify(JSON.parse(fs.readFileSync(metaPath(k), 'utf8'))) !== JSON.stringify(identity)) throw new Error('cached work belongs to different data or code; use a new candidate name or remove only its work files')
  const text = fs.readFileSync(cachePath(k), 'utf8')
  const end = text.lastIndexOf('\n') + 1
  if (end !== text.length) fs.truncateSync(cachePath(k), Buffer.byteLength(text.slice(0, end)))
  return text.slice(0, end).split('\n').filter(Boolean).map((s) => JSON.parse(s))
}
let work: any[] = round2 ? (merge ? Array.from({ length: shards }, (_, k) => readWork(k)).flat() : readWork(shard[0])) : []
if (round2 && !merge && !fs.existsSync(cachePath(shard[0]))) fs.writeFileSync(metaPath(shard[0]), JSON.stringify(identity))
const done = new Set(work.map((r) => r.id))
if (done.size !== work.length) throw new Error('duplicate cached puzzle')
let fresh = 0
for (const [index, p] of puzzles.entries()) {
  if (merge || (round2 && (index % shards !== shard[0] || done.has(p.id)))) continue
  if (fresh >= limit) break
  const rowStart = performance.now()
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
    if (round2) throw new Error('a puzzle did not replay; no partial aggregate is written')
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

  const best = (round2 ? K.themeOfBest(fen1, san1, ucis.slice(1)) : K.themeOfBest(fen1, san1)) as string
  const blunderWords: string[] = K.blunderMotifs(p.fen, san0, fen1, afterScore, ucis.slice(1), color0)
  const facts = K.describeMove(fen1, ucis[1], { replyPv: ucis.slice(2) })
  const moveC = new Set<string>((facts?.findings ?? []).filter((f: any) => f.tone === 'gain' && f.actor === solver).map((f: any) => f.conceptId))

  const row = { id: p.id, rating: p.rating, themes, truth: [...truth], best, blunder: blunderWords, move: [...moveC] }
  if (round2) {
    const cached = { ...row, milliseconds: performance.now() - rowStart }
    fs.appendFileSync(cachePath(shard[0]), JSON.stringify(cached) + '\n')
    work.push(cached)
  } else rows.push(row)
  fresh++
  if (round2 && fresh % 100 === 0) console.error(`${set}${tag}: ${done.size + fresh} in shard ${shard[0]}/${shards}`)
}
if (round2) {
  const byId = new Map(work.map((r) => [r.id, r]))
  if (byId.size !== puzzles.length) {
    console.error(`${set}${tag}: ${byId.size} cached rows; ${fresh} new in ${((Date.now() - t0) / 1000).toFixed(1)} s; aggregate waits for all puzzles`)
    if (merge) throw new Error('incomplete merge')
    process.exit(0)
  }
  rows = puzzles.map((p) => {
    const r = byId.get(p.id)
    if (!r) throw new Error('cached puzzle set mismatch')
    const { milliseconds, ...row } = r
    return row
  })
}
for (const r of rows) {
  bestWords[r.best] = (bestWords[r.best] ?? 0) + 1
  const truth = new Set<string>(r.truth)
  const said: Record<Labeler, Set<string>> = {
    best: new Set(conceptOf(r.best) ? [conceptOf(r.best)!] : []),
    blunder: new Set(r.blunder.map(conceptOf).filter(Boolean)),
    move: new Set(r.move),
  }
  for (const l of labelers) {
    for (const c of said[l]) bump(l, c, truth.has(c) ? 'tp' : 'fp')
    for (const c of truth) if (!said[l].has(c)) bump(l, c, 'fn')
  }
}
// Rebuild these counts from complete rows too, so resumed runs have the same result.
for (const key of Object.keys(unmapped)) delete unmapped[key]
for (const r of rows) for (const t of r.themes) if (!conceptOf(t)) unmapped[t] = (unmapped[t] ?? 0) + 1

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
const labelsText = JSON.stringify(rows)
const out = {
  project: 'detector-themes',
  set,
  app,
  candidate,
  ...(round2 ? { round: 2, datasetSha256, labelsSha256: digest(labelsText), sourceSha256, scorerSha256: identity.scorerSha256, timing: { puzzleSeconds: work.reduce((s, r) => s + r.milliseconds, 0) / 1000, shards } } : {}),
  puzzles: rows.length,
  skipped,
  themePuzzles: Object.fromEntries(Object.entries(rows.reduce((m: any, r: any) => { for (const t of r.themes) m[t] = (m[t] ?? 0) + 1; return m }, {})).sort((a: any, b: any) => b[1] - a[1])),
  unmappedThemes: Object.fromEntries(Object.entries(unmapped).sort((a, b) => b[1] - a[1])),
  bestWords,
  table,
}
const atomicWrite = (path: string, text: string) => {
  fs.writeFileSync(`${path}.partial`, text)
  fs.renameSync(`${path}.partial`, path)
}
atomicWrite(join(rowDir, `detector-themes-labels-${set}${tag}.json`), labelsText)
atomicWrite(join(outputDir, `score-${set}${tag}.json`), JSON.stringify(out, null, 1) + '\n')
console.error(`${set}: ${rows.length} puzzles scored, ${skipped} skipped, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
