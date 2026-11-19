// The truth check's reading of a text, shared by review-writer's check.mjs and
// coach-eval's coach-check.mjs: what a text names (moves, squares, numbers, pieces on
// squares and their owners, where a line starts, mates and tactics) and the misses
// against a vocabulary of what the facts let it name.
import { Chess } from 'chess.js'

export const MOVE = /(?<![A-Za-z0-9])(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][18]=[QRBN])[+#]?(?![A-Za-z0-9])/g
export const SQUARE = /(?<![A-Za-z0-9])[a-h][1-8](?![A-Za-z0-9])/g
export const NUMBER = /(?<![A-Za-z0-9.])\d+(?:\.\d+)?(?![A-Za-z0-9])/g
export const PIECE_ON = /\b(king|queen|rook|bishop|knight|pawn)s?\s+(?:on|at)\s+([a-h][1-8])\b/gi
export const MATE = /\b(?:mate|mates|mated|mating|checkmate|checkmates|checkmated)\b/i
export const LETTER = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' }
// A piece the text gives an owner: "your bishop on d3", "their loose rook on a8".
export const OWNED = /\b(your opponent's|the opponent's|opponent's|your|their)\s+(?:(?:loose|undefended|unprotected|trapped|pinned|attacked|passed|isolated|weak|only|last|advanced|exposed|central)\s+)*(king|queen|rook|bishop|knight|pawn)\s+(?:on|at)\s+([a-h][1-8])\b/gi
// A line the text says starts with a move: "starting with Qxf7+".
export const STARTS = /\b(?:starting|starts|begins|beginning|begin|start)\s+with\s+((?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][1-8](?:=[QRBN])?)[+#]?)/gi
// Tactics a text may name only when the facts name them.
export const TACTICS = { trapped: /\btrap(?:s|ped|ping)?\b/i, pinned: /\bpin(?:s|ned|ning)?\b/i, forked: /\bfork(?:s|ed|ing)?\b/i, skewered: /\bskewer(?:s|ed|ing)?\b/i, discovered: /\bdiscover(?:ed|s|y)?\b/i }
export const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

export const bare = (san) => san.replace(/[+#!?]+$/, '')

export function play(fen, moves) {
  const board = new Chess(fen)
  for (const move of moves) {
    try {
      board.move(move)
    } catch {
      return null
    }
  }
  return board
}

/** Every position along a line of moves (SAN, or UCI when `uci`), the start included. */
export function walk(fen, moves, uci = false) {
  const board = new Chess(fen)
  const out = [new Chess(board.fen())]
  for (const move of moves) {
    try {
      board.move(uci ? { from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] } : move)
    } catch {
      break
    }
    out.push(new Chess(board.fen()))
  }
  return out
}

export const sansOf = (line) => (line ? line.split(/\s+/).filter((t) => t && !/^\d+\.+$/.test(t)) : [])

export function lineSans(fen, ucis) {
  const board = new Chess(fen)
  const out = []
  for (const uci of ucis) {
    try {
      out.push(board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san)
    } catch {
      break
    }
  }
  return out
}

/**
 * A text's misses against a vocabulary: { moves, squares, numbers, positions, stated,
 * mate, mover, near, starts, tactics, owned }, as check.mjs builds it from a fact sheet.
 */
export function verdictOf(text, v, tactics = TACTICS) {
  const misses = []
  for (const x of text.matchAll(MOVE)) if (!v.moves.has(bare(x[0]))) misses.push(`move ${x[0]} is not in the facts`)
  const placed = new Set()
  for (const x of text.matchAll(PIECE_ON)) {
    const type = LETTER[x[1].toLowerCase()]
    const square = x[2]
    placed.add(square)
    if (v.stated.has(`${x[1].toLowerCase()}@${square}`)) continue
    if (!v.positions.some((board) => board.get(square)?.type === type)) misses.push(`no ${x[1].toLowerCase()} stands on ${square}`)
  }
  for (const x of text.matchAll(SQUARE)) if (!v.squares.has(x[0]) && !placed.has(x[0])) misses.push(`square ${x[0]} is not in the facts`)
  for (const x of text.matchAll(NUMBER)) if (!v.numbers.has(Number(x[0]))) misses.push(`number ${x[0]} is not in the facts`)
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\s+(?:pawns?|pieces?|moves?|points?)\\b`, 'i').test(text) && !v.numbers.has(n)) misses.push(`"${word}" is not in the facts`)
  }
  if (MATE.test(text) && !v.mate) misses.push('a mate the facts do not name')
  if (v.near) {
    for (const x of text.matchAll(OWNED)) {
      const mine = x[1].toLowerCase() === 'your'
      if (v.owned.has(`${mine ? 'your' : 'their'}|${x[2].toLowerCase()}@${x[3]}`)) continue
      const color = mine ? v.mover : v.mover === 'w' ? 'b' : 'w'
      const type = LETTER[x[2].toLowerCase()]
      if (!v.near.some((board) => { const p = board.get(x[3]); return p && p.type === type && p.color === color })) {
        misses.push(`${mine ? 'your' : 'their'} ${x[2].toLowerCase()} is not on ${x[3]}`)
      }
    }
    for (const x of text.matchAll(STARTS)) if (!v.starts.has(bare(x[1]))) misses.push(`no line the facts give starts with ${x[1]}`)
    for (const [name, re] of Object.entries(tactics)) if (re.test(text) && !v.tactics.has(name)) misses.push(`a ${name} piece the facts do not name`)
  }
  return misses
}
