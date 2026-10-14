// The CSV row facts.mjs (Lichess games) and archive.mjs (his games) write:
// one row per move from the app's derived facts and triggerOf.
import { chess } from '../../bridge/lib/chess.mjs'

const { deriveGameFacts } = await chess('src/services/metrics/index.ts')
const { triggerOf } = await chess('src/services/method/index.ts')

export const COLUMNS = [
  'game', 'bin', 'tc', 'rating', 'oppRating', 'ply', 'moveNo', 'color', 'san', 'piece', 'captured', 'check',
  'think', 'clockBefore', 'oppThink', 'oppClock', 'cls', 'judged', 'serious', 'lossPct', 'cpLoss',
  'evalBefore', 'evalAfter', 'wpBefore', 'wpAfter', 'book', 'forced', 'graded', 'nonTrivial', 'phase',
  'material', 'legalMoves', 'forcing', 'hangingOwn', 'hangingOpp', 'inCheck', 'prevCapture', 'tense',
  'afterOppError', 'afterOwnError', 'chance', 'bookExitPly', 'trigger', 'fen',
]
const cell = (v) => (v === null || v === undefined ? '' : v === true ? '1' : v === false ? '0' : String(v))
const r2 = (x) => (x === null ? null : Math.round(x * 100) / 100)

/** A record as its CSV line. */
export const csvLine = (rec) => COLUMNS.map((c) => cell(rec[c])).join(',') + '\n'

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

/**
 * The records of the player's timed moves in a build. `game` carries the id,
 * bin, time control and both ratings; `fens` reach at least each side's
 * book-end move.
 */
export function recordsOf(game, p, fens) {
  const g = deriveGameFacts(p)
  return g.moves.filter((m) => m.mover === 'me' && m.think !== null).map((m) => recordOf(game, g, m, fens))
}
