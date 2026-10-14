// The chess app an eval measures: the commit bridge/chess.json pins, or the
// candidate copy CHESS_DIR names. Evals run through bridge/run.sh, which sets
// CHESS_DIR and runs them under the app's own tsx, so a .ts module of the app
// compiles here the way it does for the app's own tools.
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = process.env.CHESS_DIR
if (!dir) throw new Error('CHESS_DIR is not set: run evals through bridge/run.sh')

export const CHESS_DIR = dir

/** Imports a module of the app by its path in the chess repo, such as 'src/core/score/index.ts'. */
export function chess(path) {
  return import(pathToFileURL(join(dir, path)).href)
}
