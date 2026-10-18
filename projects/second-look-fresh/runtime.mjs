// Keep the app CLI's own caches physically under the project's private tree.
// This changes no app source or cache contents. Run between engine jobs.
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { LAB_DIR, privateDir } from '../../bridge/lib/lab.mjs'

export function privateRuntime(arm) {
  if (!['baseline', 'candidate'].includes(arm)) throw new Error('unknown arm')
  const pin = JSON.parse(readFileSync(join(LAB_DIR, 'bridge/chess.json'), 'utf8'))
  const app = join(LAB_DIR, '.cache/chess', arm === 'baseline' ? pin.commit : 'candidates/second-look-fresh')
  const cache = join(app, 'tools/coach-review/.cache')
  const target = join(privateDir('second-look-fresh'), arm, 'runtime-cache')
  mkdirSync(dirname(target), { recursive: true })
  if (existsSync(cache)) {
    if (lstatSync(cache).isSymbolicLink()) {
      if (resolve(dirname(cache), readlinkSync(cache)) !== target) throw new Error('unexpected runtime cache symlink')
      return app
    }
    if (existsSync(target)) throw new Error('two runtime caches exist; inspect privately instead of merging')
    renameSync(cache, target)
  }
  mkdirSync(target, { recursive: true })
  mkdirSync(dirname(cache), { recursive: true })
  symlinkSync(target, cache, 'dir')
  return app
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  console.log(privateRuntime(process.argv[2]))
}
