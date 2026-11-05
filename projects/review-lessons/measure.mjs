// The moments of each split, the chapter each matcher names (B, the daily's;
// C, the candidate), and the aggregates the README's rule reads, except the
// judge's verdicts (judge.mjs). Reads the reviews games.mjs wrote.
//
//   bridge/run.sh projects/review-lessons/measure.mjs
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { PROJECT, gitCommit, readJson, reviewPath } from './lib.mjs'

const { lessonFor, lessonReading } = await chess('src/services/review/index.ts')
const { momentLesson } = await chess('src/services/study/index.ts')
const { readChapters } = await chess('src/adapters/content/study.ts')
const { buildStudyFromDisk } = await chess('src/adapters/node/study/index.ts')

const ERRORS = new Set(['inaccuracy', 'mistake', 'miss', 'blunder'])
const dir = privateDir(PROJECT)
const split = readJson(join(dir, 'split.json'))
if (!split) throw new Error('no split: run games.mjs first')
const study = buildStudyFromDisk(CHESS_DIR)
const chapters = readChapters(study.lessons)
const key = (m) => (m ? `${m.lesson}:${m.chapter}` : null)
const pick = (m) => (m ? { lesson: m.lesson, chapter: m.chapter, idea: m.idea, title: m.title, via: m.via } : null)

function momentsOf(games) {
  const rows = []
  let missing = 0
  for (const g of games) {
    const doc = readJson(reviewPath(dir, g.id))
    if (!doc) {
      missing++
      continue
    }
    for (const index of doc.moments) {
      const r = doc.records[index]
      if (r.mover !== doc.playerColor || !ERRORS.has(r.cls) || !lessonFor(doc, index)) continue
      const reading = lessonReading(doc, index)
      if (!reading) continue
      const b = momentLesson(chapters, { ...reading, mistake: null })
      const c = momentLesson(chapters, reading)
      rows.push({
        game: g.id,
        date: g.date,
        index,
        san: r.san,
        cls: r.cls,
        mistake: reading.mistake ? { kind: reading.mistake.kind, idea: reading.mistake.idea } : null,
        b: pick(b),
        c: pick(c),
      })
    }
  }
  return { rows, missing }
}

function spread(rows, side) {
  const named = rows.filter((r) => r[side])
  const counts = new Map()
  for (const r of named) counts.set(key(r[side]), (counts.get(key(r[side])) ?? 0) + 1)
  const top = [...counts].sort((a, b) => b[1] - a[1])[0] ?? null
  return {
    named: named.length,
    coverage: rows.length ? named.length / rows.length : null,
    chapters: counts.size,
    lessons: new Set(named.map((r) => r[side].lesson)).size,
    top: top ? { chapter: top[0], title: named.find((r) => key(r[side]) === top[0])[side].idea, moments: top[1], share: top[1] / named.length } : null,
  }
}

const tally = (rows, f) => Object.fromEntries([...rows.reduce((m, r) => m.set(f(r), (m.get(f(r)) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1]))

const out = { app: { commit: gitCommit(CHESS_DIR), lessons: study.lessons.length, chapters: chapters.length, withMistakes: chapters.filter((c) => c.mistakes.length).length }, splits: {} }
for (const name of ['train', 'heldout']) {
  const { rows, missing } = momentsOf(split[name])
  writeFileSync(join(dir, `rows-${name}.json`), JSON.stringify(rows, null, 1))
  const differ = rows.filter((r) => key(r.b) !== key(r.c))
  out.splits[name] = {
    games: split[name].length,
    missing,
    moments: rows.length,
    b: spread(rows, 'b'),
    c: spread(rows, 'c'),
    differ: differ.length,
    mistakes: tally(rows, (r) => (r.mistake ? r.mistake.kind : 'none')),
    via: tally(rows, (r) => (r.c ? r.c.via : 'none')),
  }
}
const res = resultsDir(PROJECT)
writeFileSync(join(res, 'measure.json'), `${JSON.stringify(out, null, 1)}\n`)
const pct = (x) => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`)
const lines = [
  '# Review lessons: what each matcher names',
  '',
  `Written by \`measure.mjs\` on the app at \`${out.app.commit}\`: ${out.app.lessons} lessons, ${out.app.chapters} chapters, ${out.app.withMistakes} of them with a wrong move the board code reads as a mistake.`,
  '',
  '| | train | held out |',
  '|---|---|---|',
]
const row = (label, f) => lines.push(`| ${label} | ${f(out.splits.train)} | ${f(out.splits.heldout)} |`)
row('games (reviews missing)', (s) => `${s.games} (${s.missing})`)
row('moments', (s) => s.moments)
row('B names a chapter', (s) => `${s.b.named} (${pct(s.b.coverage)})`)
row('C names a chapter', (s) => `${s.c.named} (${pct(s.c.coverage)})`)
row('B chapters / lessons', (s) => `${s.b.chapters} / ${s.b.lessons}`)
row('C chapters / lessons', (s) => `${s.c.chapters} / ${s.c.lessons}`)
row("B's most named chapter", (s) => (s.b.top ? `${s.b.top.chapter} "${s.b.top.title}", ${pct(s.b.top.share)}` : 'none'))
row("C's most named chapter", (s) => (s.c.top ? `${s.c.top.chapter} "${s.c.top.title}", ${pct(s.c.top.share)}` : 'none'))
row('moments where B and C differ', (s) => s.differ)
row('his mistake, read', (s) => Object.entries(s.mistakes).map(([k, v]) => `${k} ${v}`).join(', '))
row("C's chapter, from", (s) => Object.entries(s.via).map(([k, v]) => `${k} ${v}`).join(', '))
writeFileSync(join(res, 'measure.md'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
