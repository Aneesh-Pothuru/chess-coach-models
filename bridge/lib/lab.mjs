// Where the lab keeps what it reads and writes, for scripts that need no app
// code. bridge/lib/chess.mjs re-exports all of this beside the app import.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LAB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

let recordsDir = process.env.CHESS_RECORDS_DIR
/**
 * The research records kept in the app's repository (bridge/chess.json's
 * `records` commit), fetched on first use. Per-game cases and results are read
 * from there at run time rather than copied here.
 */
export function records() {
  recordsDir ??= execFileSync(join(LAB_DIR, 'bridge', 'checkout.sh'), ['records'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim()
  return recordsDir
}

/** Where a project writes per-game data: private/<project>/, which git ignores. */
export function privateDir(project) {
  const out = join(LAB_DIR, 'private', project)
  mkdirSync(out, { recursive: true })
  return out
}

/** A research project's folder: projects/<project>/. */
export function projectDir(project) {
  return join(LAB_DIR, 'projects', project)
}

/** A project's hill-climb record: projects/<project>/hillclimb/ (the changes tried and their aggregates). */
export function hillclimbDir(project) {
  return join(projectDir(project), 'hillclimb')
}

/** Where a project's scripts write the results its paper cites: projects/<project>/results/. */
export function resultsDir(project) {
  const out = join(projectDir(project), 'results')
  mkdirSync(out, { recursive: true })
  return out
}
