// A kept Lichess game read the app's way: as the routine's archive row (its
// moves, their evals in the player's view, whole-second clocks), built with
// the routine's own Node ports, with the book exit this study sets. facts.mjs
// and archive.mjs read games through it, and so does band-above, which
// studies the same games.
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { CHESS_DIR } from '../../bridge/lib/chess.mjs'

const ports = createRequire(import.meta.url)(join(CHESS_DIR, 'tools/coach-review/lib/facts-deps.cjs'))

/**
 * The routine's ports (tools/coach-review/lib/facts-deps.cjs): the review
 * service's archive reader classifies each move, and the knowledge service
 * counts the hanging pieces that make a position tense. The slower board
 * readings no trigger reads (loose pieces, trades, pawn weaknesses, technical
 * endgames) and the mistake themer are left out.
 */
export function routinePorts() {
  return { classifier: ports.classifier(), positions: { hanging: ports.positions().hanging } }
}

/**
 * The book exit, which the app takes from the player's own repertoire: here
 * the first move the reader does not call book (its opening book, the first
 * 12 plies at most), set on a build as its row's book would set it.
 */
export function setBookExit(p) {
  const exit = p.moves.findIndex((m) => m.cls !== 'book')
  p.hasBook = true
  p.bookExitPly = exit < 0 ? null : exit
  return p
}

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
export function parseMovetext(movetext) {
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

/**
 * Why a game's moves cannot be read, or null: every position after a move
 * needs its eval (a final mate has none) and every move its clock.
 */
export function unreadable(moves) {
  const lastMate = moves.length > 0 && moves[moves.length - 1].san.includes('#')
  if (moves.some((m, i) => m.eval === null && !(lastMate && i === moves.length - 1))) return 'an eval missing'
  if (moves.some((m) => m.clock === null)) return 'a clock missing'
  return null
}

/** The archive row of a game, with White as the player when `white`, else Black. */
export function rowOf(game, moves, white) {
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
const FLIP = { W: 'L', L: 'W', D: 'D' }
/**
 * Black's build from White's. The player's colour changes nothing in the
 * moves of a build but the view of its evals (the replay, the reader's
 * verdicts and the hanging counts are the same), so Black's build is White's
 * with the colour, the evals' sign and the result flipped. Its move facts and
 * score are those of Black's own build (band-above's primary.mjs `--check`
 * holds it to them, and facts.mjs's to the columns it writes); its other
 * game-level columns (the quality, the capture bookkeeping) stay White's, and
 * nothing here reads them.
 */
export function asBlack(white) {
  return { ...white, color: 'b', result: FLIP[white.result], eval0: neg(white.eval0), moves: white.moves.map((m) => ({ ...m, eval: neg(m.eval) })) }
}
