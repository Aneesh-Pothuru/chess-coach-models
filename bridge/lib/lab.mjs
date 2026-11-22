// Where the lab keeps what it reads and writes, for scripts that need no app
// code. bridge/lib/chess.mjs re-exports all of this beside the app import.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
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

/** Where a set of scripts writes per-game data: private/<project>/, which git ignores. */
export function privateDir(project) {
  const out = join(LAB_DIR, 'private', project)
  mkdirSync(out, { recursive: true })
  return out
}

/**
 * The folder a set of scripts lives in, by its name: models/<name>/, a folder
 * inside a model (models/<model>/<name>/), or projects/<name>/. The name stays
 * the same wherever the folder sits, since private/<name>/ and the splits
 * hashed from it are keyed by it.
 */
export function projectDir(project) {
  const direct = [join(LAB_DIR, 'models', project), join(LAB_DIR, 'projects', project)]
  for (const dir of direct) if (existsSync(dir)) return dir
  const models = join(LAB_DIR, 'models')
  if (existsSync(models)) {
    for (const model of readdirSync(models)) {
      const dir = join(models, model, project)
      if (existsSync(dir)) return dir
    }
  }
  return direct[0]
}

/** A hill-climb record: <its folder>/hillclimb/ (the changes tried and their aggregates). */
export function hillclimbDir(project) {
  return join(projectDir(project), 'hillclimb')
}

/** Where a folder's scripts write their aggregates: <its folder>/results/. */
export function resultsDir(project) {
  const out = join(projectDir(project), 'results')
  mkdirSync(out, { recursive: true })
  return out
}
