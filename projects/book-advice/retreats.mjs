// 1d: are backward moves the best moves his level misses most, and the
// hardest for Maia to find at the same value? By the README's rule.
//
//   bridge/run.sh projects/book-advice/retreats.mjs [--pool 4]
//
// Reads the positions scan.mjs drew (private/book-advice/scan-retreats.json),
// keeps each position's reading under private/book-advice/, and writes counts
// only to results/retreats.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { mulberry32, share } from './lib.mjs'

const C = await chess('src/core/chess/index.ts')
const Sc = await chess('src/core/score/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const ES = await chess('src/services/engine/index.ts')
const S = await chess('src/core/stats/index.ts')

const PRIVATE = privateDir('book-advice')
const ROWS = join(PRIVATE, 'retreats-rows.json')
const GROUPS = ['his', 'above', 'archive']
const arg = (name, d) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? Number(process.argv[i + 1]) : d
}
const MUST_FIND = K.JUDGMENT_THRESHOLDS.mistake
const BINS = [[10, 20], [20, 40], [40, Infinity]]
const RESAMPLES = 2000
const SEED = 20261015

function directionOf(fen, uci) {
  const board = K.tryBoard(fen)
  const mv = board?.findUci(uci)
  if (!mv) return null
  const castle = mv.flags.includes('k') || mv.flags.includes('q')
  const up = (Number(uci[3]) - Number(uci[1])) * (mv.color === 'w' ? 1 : -1)
  return {
    piece: mv.piece,
    castle,
    quiet: !mv.captured && !mv.promotion && !castle,
    direction: castle ? 'castle' : up > 0 ? 'forward' : up < 0 ? 'backward' : 'sideways',
  }
}

async function run() {
  const E = await chess('src/adapters/node/engine/index.ts')
  const drawn = JSON.parse(readFileSync(join(PRIVATE, 'scan-retreats.json'), 'utf8'))
  const done = existsSync(ROWS) ? JSON.parse(readFileSync(ROWS, 'utf8')) : {}
  const eng = E.createNodeEngine({ root: CHESS_DIR, pool: arg('pool', 4), tablebase: false, evalCache: false })
  const t0 = Date.now()
  let n = 0
  for (const group of GROUPS) {
    done[group] ??= {}
    const elo = (r) => (group === 'archive' ? (r === null ? null : ES.toLichess(r)) : r)
    await Promise.all(
      drawn[group].slice(0, arg('limit', Infinity)).map(async (x) => {
        const k = `${x.id}:${x.color}:${x.ply}`
        if (done[group][k]) return
        const pos = C.position(x.fen)
        try {
          const set = await eng.bestMoves(pos, { budget: 'check', multiPv: 2, priority: 'batch' })
          if (set.lines.length < 2) {
            done[group][k] = { lines: set.lines.length }
          } else {
            const [b, s] = set.lines
            const gap = Sc.winPercentFor(b.eval, x.color) - Sc.winPercentFor(s.eval, x.color)
            const row = { best: b.move, gap, found: x.played === b.move, lossPct: x.lossPct }
            if (gap >= MUST_FIND) {
              Object.assign(row, directionOf(x.fen, b.move))
              const self = elo(x.rating)
              const oppo = elo(x.oppRating)
              if (self !== null && oppo !== null) {
                const h = await eng.humanPolicy(pos, { bands: [self], opponentBand: oppo })
                row.maia = h === 'unavailable' ? null : (h.bands[0].policy[b.move] ?? 0)
              }
            }
            done[group][k] = row
          }
        } catch (e) {
          console.error(`${k}: ${e.message}`)
        }
        if (++n % 500 === 0) {
          console.error(`${n} read, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
          writeFileSync(ROWS, JSON.stringify(done) + '\n')
        }
      }),
    )
    writeFileSync(ROWS, JSON.stringify(done) + '\n')
  }
  eng.dispose()
  return Math.round((Date.now() - t0) / 1000)
}

/** Newcombe's interval for a difference of two shares, from their Wilson intervals. */
function newcombe(a, b) {
  if (!a.n || !b.n) return null
  const [l1, u1] = S.wilson({ k: a.k, n: a.n })
  const [l2, u2] = S.wilson({ k: b.k, n: b.n })
  const p1 = a.k / a.n
  const p2 = b.k / b.n
  const d = p1 - p2
  const r = (x) => Math.round(x * 1e4) / 1e4
  return { d: r(d), ci: [r(d - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2)), r(d + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2))] }
}

const missed = (rows) => share(rows.filter((r) => !r.found).length, rows.length)
const binOf = (gap) => BINS.findIndex(([lo, hi]) => gap >= lo && gap < hi)
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Backward minus forward Maia probability for the best move, by margin bin, weighted by the backward moves in each. */
function maiaGap(rows) {
  const per = BINS.map((_, i) => {
    const inBin = rows.filter((r) => binOf(r.gap) === i)
    const back = inBin.filter((r) => r.direction === 'backward').map((r) => r.maia)
    const fwd = inBin.filter((r) => r.direction === 'forward').map((r) => r.maia)
    return { back: back.length, fwd: fwd.length, backMean: mean(back), fwdMean: mean(fwd) }
  })
  const usable = per.filter((b) => b.back > 0 && b.fwd > 0)
  const w = usable.reduce((a, b) => a + b.back, 0)
  const weighted = w ? usable.reduce((a, b) => a + b.back * (b.backMean - b.fwdMean), 0) / w : null
  return { per, weighted, everyBinLower: per.every((b) => b.back > 0 && b.fwd > 0 && b.backMean < b.fwdMean) }
}

function bootstrap(rows) {
  const rnd = mulberry32(SEED)
  const out = []
  for (let i = 0; i < RESAMPLES; i++) {
    const pick = Array.from({ length: rows.length }, () => rows[Math.floor(rnd() * rows.length)])
    const g = maiaGap(pick).weighted
    if (g !== null) out.push(g)
  }
  out.sort((a, b) => a - b)
  const q = (p) => out[Math.min(out.length - 1, Math.floor(p * out.length))]
  return out.length ? [q(0.025), q(0.975)] : null
}

const seconds = process.argv.includes('--summary') ? null : await run()
const done = JSON.parse(readFileSync(ROWS, 'utf8'))
const r4 = (x) => (x === null ? null : Math.round(x * 1e4) / 1e4)
const groups = {}
for (const group of GROUPS) {
  const rows = Object.values(done[group] ?? {}).filter((r) => r.best)
  const must = rows.filter((r) => r.gap >= MUST_FIND && r.direction && r.direction !== 'castle')
  const quiet = must.filter((r) => r.quiet)
  const by = (list, dir, piece) => list.filter((r) => r.direction === dir && (piece === undefined || (piece === 'n' ? r.piece === 'n' : r.piece !== 'n')))
  const withMaia = quiet.filter((r) => typeof r.maia === 'number')
  const gap = maiaGap(withMaia)
  groups[group] = {
    positions: rows.length,
    mustFind: must.length,
    quiet: {
      backward: missed(by(quiet, 'backward')),
      sideways: missed(by(quiet, 'sideways')),
      forward: missed(by(quiet, 'forward')),
      backwardMinusForward: newcombe(missed(by(quiet, 'backward')), missed(by(quiet, 'forward'))),
      knights: {
        backward: missed(by(quiet, 'backward', 'n')),
        forward: missed(by(quiet, 'forward', 'n')),
        backwardMinusForward: newcombe(missed(by(quiet, 'backward', 'n')), missed(by(quiet, 'forward', 'n'))),
        backwardKnightMinusOtherBackward: newcombe(missed(by(quiet, 'backward', 'n')), missed(by(quiet, 'backward', 'other'))),
      },
    },
    all: {
      backward: missed(by(must, 'backward')),
      sideways: missed(by(must, 'sideways')),
      forward: missed(by(must, 'forward')),
      backwardMinusForward: newcombe(missed(by(must, 'backward')), missed(by(must, 'forward'))),
    },
    maia: {
      positions: withMaia.length,
      bins: gap.per.map((b, i) => ({ margin: BINS[i], backward: b.back, forward: b.fwd, backwardMean: r4(b.backMean), forwardMean: r4(b.fwdMean) })),
      weightedBackwardMinusForward: r4(gap.weighted),
      ci: bootstrap(withMaia)?.map(r4) ?? null,
      everyBinLower: gap.everyBinLower,
    },
  }
}
const his = groups.his
const missedMore = his.quiet.backwardMinusForward !== null && his.quiet.backwardMinusForward.ci[0] > 0
const harderForMaia = his.maia.everyBinLower && his.maia.ci !== null && his.maia.ci[1] < 0
const summary = {
  app: CHESS_DIR.split('/').pop(),
  budget: 'check',
  mustFind: MUST_FIND,
  seconds,
  missedMore,
  harderForMaia,
  holds: missedMore && harderForMaia,
  groups,
}
writeFileSync(join(resultsDir('book-advice'), 'retreats.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ missedMore, harderForMaia, his: { mustFind: his.mustFind, quiet: his.quiet, maia: his.maia } }, null, 2))
