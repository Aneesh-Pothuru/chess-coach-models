// Writes the held-out sample (private/review-walk/heldout.json) from the app's
// game list, and reviews every game of it that has no review yet, as the
// phone's Game Review does (`coach review <game> --profile phone`), into
// private/review-walk/phone/. Resumes where it stopped.
//
//   bridge/run.sh projects/review-walk/games.mjs [--concurrency N]
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { CHESS_DIR, privateDir } from '../../bridge/lib/chess.mjs'
import { PROJECT, gitCommit, heldoutOf, reviewPath } from './lib.mjs'

const run = promisify(execFile)
const at = process.argv.indexOf('--concurrency')
const concurrency = at > 0 ? Number(process.argv[at + 1]) : 2
const dir = privateDir(PROJECT)
mkdirSync(join(dir, 'phone'), { recursive: true })
const coach = (args) => ['run', '--silent', 'coach', '--', ...args]
const list = JSON.parse(execFileSync('npm', coach(['games', 'list']), { cwd: CHESS_DIR, encoding: 'utf8', maxBuffer: 1 << 26 }))
const heldout = heldoutOf(list.games.map((g) => ({ id: g.gameId, date: g.date })))
writeFileSync(join(dir, 'heldout.json'), JSON.stringify({ app: gitCommit(CHESS_DIR), games: heldout }, null, 1))
const todo = heldout.filter((g) => !existsSync(reviewPath(dir, g.id)))
console.error(`${heldout.length} held-out games; ${todo.length} to review`)
let next = 0
let failed = 0
async function worker() {
  while (next < todo.length) {
    const g = todo[next++]
    const out = reviewPath(dir, g.id)
    try {
      const { stdout } = await run('npm', coach(['review', g.id, '--profile', 'phone', '--json']), { cwd: CHESS_DIR, maxBuffer: 1 << 28 })
      JSON.parse(stdout)
      writeFileSync(`${out}.tmp`, stdout)
      renameSync(`${out}.tmp`, out)
    } catch (e) {
      failed++
      console.error(`${g.id}: ${e.message.split('\n')[0]}`)
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))
console.error(`done, ${failed} failed`)
process.exit(failed ? 1 : 0)
