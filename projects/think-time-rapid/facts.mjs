// The app's move facts for every Lichess game stream.py kept. Each game is
// read as the routine's archive row (the moves, their evals in the player's
// view, whole-second clocks) and built by the metrics service's primaryFacts
// and deriveGameFacts with the routine's own Node ports, so every move of
// both players gets the app's facts and the method service's triggerOf from
// its own side. One CSV row per move with a think time.
//
//   bridge/run.sh projects/think-time-rapid/facts.mjs --month 2026-09 [--limit N] [--shard i/n] [--check N]
//
// The ports are the routine's (tools/coach-review/lib/facts-deps.cjs): the
// review service's archive reader classifies each move, and the knowledge
// service counts the hanging pieces that make a position tense. The slower
// board readings no trigger reads (loose pieces, trades, pawn weaknesses,
// technical endgames) and the mistake themer are left out.
//
// Black's build: primaryFacts is built once, with White as the player. The
// player's colour changes nothing in a build but the view of its evals (the
// replay, the reader's verdicts and the hanging counts are the same), so
// Black's build is White's with the colour and the evals' sign flipped.
// `--check N` builds Black's row for real on the first N games and stops on
// any move whose facts or trigger differ.
//
// The book exit, which the app takes from the player's own repertoire, is the
// first move the reader does not call book (its opening book, the first 12
// plies at most): a Lichess player's repertoire is unknown.
import { createReadStream, createWriteStream, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip, createGzip } from 'node:zlib'
import { CHESS_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'

const { primaryFacts, deriveGameFacts } = await chess('src/services/metrics/index.ts')
const { triggerOf, DEEP_THINK_SECONDS, BOOK_END_SECONDS, LEVEL_CP } = await chess('src/services/method/index.ts')
const { RUSHED_SECONDS, CLOCK_BUCKETS } = await chess('src/core/game/index.ts')
const { replayFens } = await chess('src/services/knowledge/index.ts')
const { DEFAULT_LICHESS_OFFSET } = await chess('src/services/engine/index.ts')
const ports = createRequire(import.meta.url)(join(CHESS_DIR, 'tools/coach-review/lib/facts-deps.cjs'))

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const month = arg('month')
if (!month) throw new Error('usage: facts.mjs --month YYYY-MM [--limit N] [--shard i/n] [--check N]')
const limit = Number(arg('limit', '0'))
const check = Number(arg('check', '0'))
const [shard, shards] = arg('shard', '0/1').split('/').map(Number)

const deps = { classifier: ports.classifier(), positions: { hanging: ports.positions().hanging } }

const MATE_BASE = 10000
/** A Lichess [%eval] as White's centipawns, mate in n as ±(10000 − 10n), the archive's encoding. */
function whiteCp(text) {
  if (text.startsWith('#')) {
    const n = Number(text.slice(1))
    if (!Number.isInteger(n) || n === 0) return null
    return Math.sign(n) * (MATE_BASE - 10 * Math.abs(n))
  }
  const pawns = Number(text)
  return Number.isFinite(pawns) ? Math.round(pawns * 100) : null
}

/** The moves of a Lichess movetext, each with the eval and clock its comment carries. */
function parseMovetext(movetext) {
  const moves = []
  const re = /\{([^}]*)\}|(\S+)/g
  let m
  while ((m = re.exec(movetext))) {
    if (m[1] !== undefined) {
      const last = moves[moves.length - 1]
      if (!last) continue
      const ev = /\[%eval\s+([^\]\s]+)\]/.exec(m[1])
      const clk = /\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/.exec(m[1])
      if (ev) last.eval = whiteCp(ev[1])
      if (clk) last.clock = Math.floor(Number(clk[1]) * 3600 + Number(clk[2]) * 60 + Number(clk[3]))
      continue
    }
    const tok = m[2].replace(/^\d+\.+/, '')
    if (!tok || /^(1-0|0-1|1\/2-1\/2|\*|\$\d+)$/.test(tok)) continue
    moves.push({ san: tok.replace(/[?!]+$/, ''), eval: null, clock: null })
  }
  return moves
}

/** The archive row of a game, with White as the player when `white`, else Black. */
function rowOf(game, moves, white) {
  const sign = white ? 1 : -1
  const result = game.result === '1-0' ? (white ? 'W' : 'L') : game.result === '0-1' ? (white ? 'L' : 'W') : 'D'
  return {
    sans: moves.map((m) => m.san),
    // The start position carries no eval in a Lichess game: honest absence.
    evals: [null, ...moves.map((m) => (m.eval === null ? null : sign * m.eval))],
    clocks: moves.map((m) => m.clock),
    meIsWhite: white,
    time_control: game.tc,
    result,
    myRating: white ? game.whiteElo : game.blackElo,
    oppRating: white ? game.blackElo : game.whiteElo,
    ...(game.termination === 'Time forfeit' ? { termination: 'timeout' } : {}),
  }
}

const neg = (x) => (x === null ? null : -x)
/** Black's build from White's (see the note at the top). */
function asBlack(white) {
  return { ...white, color: 'b', eval0: neg(white.eval0), moves: white.moves.map((m) => ({ ...m, eval: neg(m.eval) })) }
}

const COLUMNS = [
  'game', 'bin', 'tc', 'rating', 'oppRating', 'ply', 'moveNo', 'color', 'san', 'piece', 'captured', 'check',
  'think', 'clockBefore', 'oppThink', 'oppClock', 'cls', 'judged', 'serious', 'lossPct', 'cpLoss',
  'evalBefore', 'evalAfter', 'wpBefore', 'wpAfter', 'book', 'forced', 'graded', 'nonTrivial', 'phase',
  'material', 'legalMoves', 'forcing', 'hangingOwn', 'hangingOpp', 'inCheck', 'prevCapture', 'tense',
  'afterOppError', 'afterOwnError', 'chance', 'bookExitPly', 'trigger', 'fen',
]
const cell = (v) => (v === null || v === undefined ? '' : v === true ? '1' : v === false ? '0' : String(v))
const r2 = (x) => (x === null ? null : Math.round(x * 100) / 100)

/** The CSV record of one of the player's moves in a derived game; `fens` are the positions before each ply. */
function recordOf(game, g, m, fens) {
  const prev = m.ply > 0 ? g.moves[m.ply - 1] : null
  const white = m.color === 'w'
  const trigger = triggerOf(m, g)
  return {
    game: game.id,
    bin: game.bin,
    tc: game.tc,
    rating: white ? game.whiteElo : game.blackElo,
    oppRating: white ? game.blackElo : game.whiteElo,
    ply: m.ply,
    moveNo: m.moveNo,
    color: m.color,
    san: m.san,
    piece: m.piece,
    captured: m.captured,
    check: m.check,
    think: m.think,
    clockBefore: m.clockBefore,
    oppThink: prev ? prev.think : null,
    oppClock: prev ? prev.clock : null,
    cls: m.cls,
    judged: m.judged,
    serious: m.serious,
    lossPct: r2(m.lossPct),
    cpLoss: m.cpLoss,
    evalBefore: m.evalBefore,
    evalAfter: m.evalAfter,
    wpBefore: r2(m.wpBefore),
    wpAfter: r2(m.wpAfter),
    book: m.book,
    forced: m.forced,
    graded: m.graded,
    nonTrivial: m.nonTrivial,
    phase: m.phase,
    material: m.material,
    legalMoves: m.legalMoves,
    forcing: m.forcing,
    hangingOwn: m.hangingOwn,
    hangingOpp: m.hangingOpp,
    inCheck: m.inCheck,
    prevCapture: m.prevCapture,
    tense: m.tense,
    afterOppError: m.afterOppError,
    afterOwnError: m.afterOwnError,
    chance: m.chance,
    bookExitPly: g.bookExitPly,
    trigger,
    // The position before a book-end move (FEN without the move counters), so the
    // same position can be compared across games.
    fen: trigger === 'book-end' && fens[m.ply] ? fens[m.ply].split(' ').slice(0, 4).join(' ') : null,
  }
}

/** The records of the player's timed moves in a build. */
function recordsOf(game, p, fens) {
  const g = deriveGameFacts(p)
  return g.moves.filter((m) => m.mover === 'me' && m.think !== null).map((m) => recordOf(game, g, m, fens))
}

const dir = privateDir('think-time-rapid')
// The app's own numbers the analysis reads (analyze.py never types them).
writeFileSync(join(privateDir('think-time-rapid'), 'app-constants.json'), JSON.stringify({
  appCommit: CHESS_DIR.split('/').pop(),
  RUSHED_SECONDS, DEEP_THINK_SECONDS, BOOK_END_SECONDS, LEVEL_CP,
  CLOCK_BUCKETS: CLOCK_BUCKETS.map((b) => ({ label: b.label, maxSeconds: Number.isFinite(b.maxSeconds) ? b.maxSeconds : null })),
  DEFAULT_LICHESS_OFFSET,
}, null, 2) + '\n')
const suffix = shards > 1 ? `-${shard}of${shards}` : ''
const outPath = join(dir, `moves-${month}${suffix}.csv.gz`)
const gz = createGzip({ level: 6 })
const out = createWriteStream(`${outPath}.partial`)
gz.pipe(out)
gz.write(COLUMNS.join(',') + '\n')

const skipped = {}
const skip = (why) => (skipped[why] = (skipped[why] ?? 0) + 1)
let read = 0
let built = 0
let rows = 0
let checked = 0
const started = Date.now()

const lines = createInterface({ input: createReadStream(join(dir, `games-${month}.jsonl.gz`)).pipe(createGunzip()), crlfDelay: Infinity })
for await (const line of lines) {
  if (!line) continue
  const index = read++
  if (index % shards !== shard) continue
  if (limit && built >= limit) break
  const game = JSON.parse(line)
  const moves = parseMovetext(game.movetext)
  // Every position after a move needs its eval, except a final mate, which has none.
  const lastMate = moves.length > 0 && moves[moves.length - 1].san.includes('#')
  if (moves.some((m, i) => m.eval === null && !(lastMate && i === moves.length - 1))) { skip('an eval missing'); continue }
  if (moves.some((m) => m.clock === null)) { skip('a clock missing'); continue }

  const white = primaryFacts(rowOf(game, moves, true), deps)
  if (!white || !white.replayed) { skip('does not replay'); continue }
  if (white.moves.some((m) => m.cls === null)) { skip('not classified'); continue }
  // The first move the reader does not call book.
  const exit = white.moves.findIndex((m) => m.cls !== 'book')
  white.hasBook = true
  white.bookExitPly = exit < 0 ? null : exit
  const black = asBlack(white)
  // The positions up to both book-end moves (each side's first move at or after the exit).
  const fens = replayFens(moves.slice(0, (white.bookExitPly ?? 0) + 2).map((m) => m.san))
  built++

  if (checked < check) {
    const real = primaryFacts(rowOf(game, moves, false), deps)
    real.hasBook = true
    real.bookExitPly = white.bookExitPly
    const want = JSON.stringify(recordsOf(game, real, fens))
    if (JSON.stringify(recordsOf(game, black, fens)) !== want) throw new Error(`Black's flipped build differs from its own build in game ${game.id}`)
    checked++
  }

  for (const p of [white, black]) {
    for (const rec of recordsOf(game, p, fens)) {
      if (!gz.write(COLUMNS.map((c) => cell(rec[c])).join(',') + '\n')) await new Promise((r) => gz.once('drain', r))
      rows++
    }
  }
  if (built % 2000 === 0) {
    const s = (Date.now() - started) / 1000
    process.stderr.write(`built ${built} games (${(built / s).toFixed(1)}/s), ${rows} moves, skipped ${JSON.stringify(skipped)}\n`)
  }
}
gz.end()
await new Promise((r) => out.on('finish', r))
renameSync(`${outPath}.partial`, outPath)
const seconds = Math.round((Date.now() - started) / 1000)
const summary = { month, shard, shards, gamesRead: read, gamesBuilt: built, blackBuildsChecked: checked, moves: rows, skipped, seconds }
writeFileSync(join(dir, `moves-${month}${suffix}.json`), JSON.stringify(summary, null, 2) + '\n')
process.stderr.write(JSON.stringify(summary) + '\n')
