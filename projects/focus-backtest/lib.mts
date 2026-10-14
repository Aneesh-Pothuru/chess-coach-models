// Shared pieces of the focus backtest: the archive's facts through the app's
// own loader, the app's focus functions, and a seeded random source.
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CHESS_DIR } from '../../bridge/lib/chess.mjs'

const load = (rel: string) => import(pathToFileURL(join(CHESS_DIR, rel)).href)

export const app = {
  nodeMetrics: await load('src/adapters/node/metrics/index.ts'),
  factsDeps: await load('src/cli/factsDeps.ts'),
  metrics: await load('src/services/metrics/index.ts'),
  method: await load('src/services/method/index.ts'),
  time: await load('src/core/time/index.ts'),
}

export { CHESS_DIR }

/** Every archived game's facts, linked and oldest first: what the routine's metrics instance holds. */
export function archiveGames(): any[] {
  const arch = app.nodeMetrics.archiveFacts({ root: CHESS_DIR, deps: app.factsDeps.loadFactsDeps(CHESS_DIR, false) })
  return arch.games
}

/** A metrics instance over a fixed list of games, the way the routine builds one. */
export function metricsOver(games: readonly any[]): any {
  return app.metrics.createMetrics({ facts: app.metrics.staticFacts(games) })
}

/** The method service over a metrics instance, with an in-memory focus log. */
export function methodOver(metrics: any, log: { current: any; history: any[] }): any {
  const store = { read: () => log, write: (next: any) => { log.current = next.current; log.history = next.history } }
  return app.method.createMethod({ metrics, ledger: { read: () => null, write() {} }, focus: store, registers: {} })
}

/** mulberry32: a small seeded generator, so every simulation reruns byte for byte. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The app commit these numbers measure (the checkout's HEAD). */
export async function appCommit(): Promise<string> {
  const { execFileSync } = await import('node:child_process')
  return execFileSync('git', ['-C', CHESS_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}
