// Helpers for a project's paper/generate.mjs. A paper prints no number by
// hand: its generator writes every number, table and position into
// paper/generated.tex from what the project's scripts wrote (results/) and
// from the records, and paper.tex only says what they mean.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Chess } from 'chess.js'

const ESCAPES = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', $: '\\$', '&': '\\&', '#': '\\#', '^': '\\^{}', _: '\\_', '%': '\\%', '~': '\\~{}' }
/** Text as LaTeX prints it. */
export const esc = (s) => String(s).replace(/[\\{}$&#^_%~]/g, (c) => ESCAPES[c]).replace(/−/g, '$-$').replace(/→/g, '$\\to$').replace(/–/g, '--').replace(/·/g, '\\textperiodcentered{}').replace(/…/g, '\\ldots{}')

/** A fixed number of decimals, with a real minus sign. */
export const fixed = (x, d = 1) => (x == null || !Number.isFinite(x) ? '--' : x.toFixed(d).replace(/^-/, '$-$'))

/** A share as a percentage with d decimals. */
export const percent = (x, d = 1) => fixed(100 * x, d)

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
/** A count as prose writes it: a word up to twelve, digits past it. */
export const word = (n) => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n))

/** Collects \newcommand definitions and LaTeX blocks, and writes them to one file. */
export class Generated {
  constructor(source) {
    this.source = source
    this.parts = [`% Written by ${source}; do not edit by hand.`, '']
    this.files = new Map()
  }
  /** \name expands to value. Names are letters only, as LaTeX wants. */
  def(name, value) {
    if (!/^[A-Za-z]+$/.test(name)) throw new Error(`not a LaTeX command name: ${name}`)
    this.parts.push(`\\newcommand{\\${name}}{${value}}`)
    return this
  }
  /**
   * \name expands to a block (a table, a figure, an example). A bare # (a mate
   * in a move list) is doubled, as a macro's body needs it.
   */
  block(name, latex) {
    if (!/^[A-Za-z]+$/.test(name)) throw new Error(`not a LaTeX command name: ${name}`)
    this.parts.push(`\\newcommand{\\${name}}{%`, latex.replace(/(?<!\\)#/g, '##'), '}')
    return this
  }
  /**
   * \name inputs a file of its own, written beside generated.tex: for a block
   * with moves for xskak, which reads a move list (a mate's #) by its own
   * rules only when the file is read, not from a macro's body.
   */
  input(name, file, latex) {
    if (!/^[A-Za-z]+$/.test(name)) throw new Error(`not a LaTeX command name: ${name}`)
    if (!/^[a-z0-9-]+$/.test(file)) throw new Error(`not a plain file name: ${file}`)
    this.files.set(`${file}.tex`, latex)
    this.parts.push(`\\newcommand{\\${name}}{\\input{${file}}}`)
    return this
  }
  /** Writes generated.tex (path) and the files input() named, beside it. */
  write(path) {
    writeFileSync(path, `${this.parts.join('\n')}\n`)
    for (const [file, latex] of this.files) writeFileSync(join(dirname(path), file), `% Written by ${this.source}; do not edit by hand.\n${latex}\n`)
  }
}

/** The move number and side of a position, as xskak's moveid wants them: "27b". */
export function moveId(fen) {
  const [, side, , , , full] = fen.split(' ')
  return `${full}${side}`
}

/** UCI moves from a position as numbered SAN ("27... h6 28. Qb6 Kh7"), and the UCI and SAN lists. */
export function line(fen, ucis) {
  const game = new Chess(fen)
  const sans = []
  for (const uci of ucis) {
    const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    sans.push(move.san)
  }
  return { sans, ucis: [...ucis], text: numbered(fen, sans) }
}

/** SAN moves from a position as UCI, checked on the board. */
export function ucisOf(fen, sans) {
  const game = new Chess(fen)
  return sans.map((san) => {
    const move = game.move(san)
    return `${move.from}${move.to}${move.promotion ?? ''}`
  })
}

/** Numbered SAN for xskak's \mainline: "27... h6 28. Qb6 Kh7". */
export function numbered(fen, sans) {
  let [, side, , , , full] = fen.split(' ')
  let n = Number(full)
  const parts = []
  sans.forEach((san, i) => {
    if (side === 'w') parts.push(`${n}. ${san}`)
    else parts.push(i === 0 ? `${n}... ${san}` : san)
    if (side === 'b') n++
    side = side === 'w' ? 'b' : 'w'
  })
  return parts.join(' ')
}

const FIGURINE = { K: '\\symking{}', Q: '\\symqueen{}', R: '\\symrook{}', B: '\\symbishop{}', N: '\\symknight{}' }

/** One SAN move as LaTeX, its pieces as figurines. */
export const figurine = (san) => san.replace(/^[KQRBN]/, (p) => FIGURINE[p]).replace(/=([QRBN])/, (_, p) => `=${FIGURINE[p]}`).replace(/#/g, '\\#')

/** SAN moves from a position as numbered LaTeX with figurines: "27\ldots\symknight{}xc2 28.~\symqueen{}g5\#". */
export function movesTex(fen, sans) {
  let [, side, , , , full] = fen.split(' ')
  let n = Number(full)
  const parts = []
  sans.forEach((san, i) => {
    if (side === 'w') parts.push(`${n}.~${figurine(san)}`)
    else parts.push(i === 0 ? `${n}\\ldots{}${figurine(san)}` : figurine(san))
    if (side === 'b') n++
    side = side === 'w' ? 'b' : 'w'
  })
  return parts.join(' ')
}

/** SAN as read from a line like "27...h6 28.Qb6 Kh7": the moves without their numbers. */
export function sansOf(text) {
  return text.trim().split(/\s+/).map((t) => t.replace(/^\d+\.(\.\.)?/, '')).filter(Boolean)
}

/**
 * A board for a position with the move played (red) and the better move
 * (green) drawn as arrows. xskak prints the board from the FEN, so the
 * position is the one the FEN names.
 */
export function board(fen, { played = null, better = null, size = '14pt' } = {}) {
  const arrows = []
  if (played) arrows.push(`pgfstyle=straightmove, arrow=to, linewidth=0.07em, color=red!75!black, markmoves={${played.slice(0, 2)}-${played.slice(2, 4)}}`)
  if (better) arrows.push(`pgfstyle=straightmove, arrow=to, linewidth=0.07em, color=green!50!black, markmoves={${better.slice(0, 2)}-${better.slice(2, 4)}}`)
  return `\\chessboard[setfen={${fen}}, boardfontsize=${size}${arrows.length ? `, ${arrows.join(', ')}` : ''}]`
}
