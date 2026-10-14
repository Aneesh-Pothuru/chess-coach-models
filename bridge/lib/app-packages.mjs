// A resolve hook: a package an eval imports by name (chess.js, say) is the one
// the app has installed, so an eval and the app it measures never run two
// versions of a library. bridge/run.sh registers it through register.mjs.
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const BARE = /^(?![./]|[a-z]+:)/

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    const app = process.env.CHESS_DIR
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !app || !BARE.test(specifier)) throw error
    return nextResolve(specifier, { ...context, parentURL: pathToFileURL(join(app, 'package.json')).href })
  }
}
