// Whether each line a review's board exhibit tags "Played" follows the game, as
// the archive replays it, from the exhibit's position: the strict check replays
// every line for legality but does not compare a Played line with the game. No
// model reads anything here. Run from a case checkout with its tsx:
//   (cd <case>/repo && node_modules/.bin/tsx <bin>/played-lines.mts <annotations.json> ...)
// Prints one JSON object per file: {file, played, follows, diverges, short}.
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const req = createRequire(join(root, 'package.json'))
const { Chess } = req('chess.js')
const review = await import(pathToFileURL(join(root, 'src/services/review/index.ts')).href)

const days = new Map<string, any[] | null>()
function day(date: string): any[] | null {
  if (!days.has(date)) {
    const f = join(root, 'coach-log', 'review-analysis', `${date}.json`)
    days.set(date, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null)
  }
  return days.get(date) ?? null
}

const bare = (san: string) => san.replace(/[+#?!]+$/g, '')

function moves(fen: string, text: string): string[] {
  const game = new Chess(fen)
  const out: string[] = []
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^\d+\.(\.\.)?/, '').replace(/^\.+/, '')
    if (!token) continue
    try {
      out.push(bare(game.move(token).san))
    } catch {
      break
    }
  }
  return out
}

for (const file of process.argv.slice(2)) {
  const a = JSON.parse(readFileSync(file, 'utf8'))
  const row = { file, played: 0, follows: 0, diverges: 0, short: 0 }
  for (const s of a.sections || []) {
    for (const b of s.boards || []) {
      const lines = (b.lines || []).filter((l: any) => l?.tag === 'Played')
      if (!lines.length) continue
      const ref = review.splitGameRef(String(b?.board?.game ?? ''))
      const rows = ref.date ? day(ref.date) : null
      const hit = rows ? review.resolveGameRef(rows, ref.which, { date: ref.date }) : null
      const ply = Number(b?.board?.ply)
      if (!hit?.game || !Number.isFinite(ply)) continue
      const sans: string[] = (hit.game.sans || []).map(bare)
      for (const l of lines) {
        const said = moves(b.board.fen, String(l.line || ''))
        if (!said.length) continue
        row.played++
        const game = sans.slice(ply, ply + said.length)
        if (said.every((m, i) => m === game[i])) row.follows++
        else if (game.length < said.length && said.slice(0, game.length).every((m, i) => m === game[i])) row.short++
        else row.diverges++
      }
    }
  }
  console.log(JSON.stringify(row))
}
