// Reading a line with the app's board code, for coach-eval's coaching sheets and the
// rewrite task: what each move does and how forced it is, the tactics the line carries
// out (line-tactics.mjs), where its material settles and what changes hands.
import { Chess } from 'chess.js'
import { chess } from '../../bridge/lib/chess.mjs'
import { lineConcepts, lineSignals, RULES } from './line-tactics.mjs'

const K = await chess('src/services/knowledge/index.ts')

export const PIECE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
export const CONCEPT_WORD = {
  checkmate: 'mate',
  'back-rank-mate': 'back-rank mate',
  fork: 'fork',
  attraction: 'attraction',
  promotion: 'promotion',
  'double-check': 'double check',
  'smothered-mate': 'smothered mate',
  'anastasia-mate': "Anastasia's mate",
  'epaulette-mate': 'epaulette mate',
  'hook-mate': 'hook mate',
  'arabian-mate': 'Arabian mate',
  'blind-swine-mate': 'blind swine mate',
  'opera-mate': 'opera mate',
  'discovered-attack': 'discovered attack',
  skewer: 'skewer',
  'trapped-piece': 'trapped piece',
  pin: 'pin',
  deflection: 'deflection',
  zwischenzug: 'in-between move',
  'hanging-piece': 'loose piece',
  'passed-pawn': 'advanced pawn',
  'quiet-move': 'quiet move',
  sacrifice: 'sacrifice',
  'removing-the-defender': 'removing the defender',
  'f7-raid': 'attack on f7',
}

// The also tier without its two vaguest readings: an advanced pawn and a quiet move say
// little a writer could teach from, and agree with the tagger least.
export const SHEET_ALSO = Object.fromEntries(Object.entries(RULES.also).filter(([source]) => !['passed', 'quiet'].includes(source)))

export const toMove = (fen, uci) => new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
export const sanOf = (fen, uci) => toMove(fen, uci).san
export const fenAfter = (fen, uci) => {
  const b = new Chess(fen)
  b.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  return b.fen()
}
export const other = (c) => (c === 'w' ? 'b' : 'w')
export const whose = (color, pov) => (color === pov ? 'your' : 'their')
export const pieceAt = (fen, sq, pov) => {
  const p = new Chess(fen).get(sq)
  return p ? `${whose(p.color, pov)} ${PIECE[p.type]} on ${sq}` : `the square ${sq}`
}
export const pawns = (score, mover) => {
  if (!score) return null
  if (score.mate !== null && score.mate !== undefined) {
    const m = mover === 'w' ? score.mate : -score.mate
    return m > 0 ? `mate in ${m} for you` : `mate in ${-m} for them`
  }
  const cp = mover === 'w' ? score.cp : -score.cp
  return `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)} for you`
}
export const said = (fen, uci, pov, recapture = false) => K.moveReasons(fen, uci, recapture).map((r) => K.reasonText(r, 'clause', pov))
export const listOf = (xs) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
export const COUNT = ['', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']
/** Pieces in words, like ones counted together: "a rook and two pawns". */
export const piecesOf = (types) => {
  const order = ['q', 'r', 'b', 'n', 'p']
  const words = order.filter((t) => types.includes(t)).map((t) => {
    const n = types.filter((x) => x === t).length
    return n === 1 ? (t === 'q' ? 'the queen' : `a ${PIECE[t]}`) : `${COUNT[n] ?? n} ${PIECE[t]}s`
  })
  return listOf(words)
}

/**
 * The material a sequence of moves changes hands, from the player's side: the pieces
 * each side takes, with like for like set against each other, in words.
 */
export function exchangeText(fen, ucis, pov) {
  const b = new Chess(fen)
  const yours = []
  const theirs = []
  const promotes = { you: 0, they: 0 }
  for (const u of ucis) {
    let mv
    try {
      mv = b.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
    } catch {
      break
    }
    if (mv.captured) (mv.color === pov ? yours : theirs).push(mv.captured)
    if (mv.promotion) promotes[mv.color === pov ? 'you' : 'they'] += VALUE[mv.promotion] - 1
  }
  for (const t of [...yours]) {
    const i = theirs.indexOf(t)
    if (i >= 0) {
      theirs.splice(i, 1)
      yours.splice(yours.indexOf(t), 1)
    }
  }
  const net = yours.reduce((s, t) => s + VALUE[t], 0) - theirs.reduce((s, t) => s + VALUE[t], 0) + promotes.you - promotes.they
  const won = piecesOf(yours)
  const lost = piecesOf(theirs)
  const mate = b.isCheckmate()
  const mated = mate ? (b.turn() === pov ? 'they mate you' : 'you mate') : null
  const parts = []
  if (net > 0 && won) parts.push(lost ? `you win ${won} for ${lost}` : `you win ${won}`)
  else if (net < 0 && lost) parts.push(won ? `you lose ${lost} for ${won}` : `you lose ${lost}`)
  else if (won || lost) parts.push(won && lost ? `the material stays even: ${won} for ${lost}` : won ? `you win ${won}` : `you lose ${lost}`)
  if (promotes.you) parts.push('you promote a pawn')
  if (promotes.they) parts.push('they promote a pawn')
  let text = parts.length ? listOf(parts) : 'no material changes hands for good'
  return { text: mated ? `${mated}${won || lost || promotes.you || promotes.they ? `, and before that ${text}` : ''}` : text, net, mate }
}

/**
 * The part of a line that carries its point: up to its mate, or to the first position
 * after the opponent's reply where the solver's material gain is at its highest within
 * the first `cap` plies, and never fewer than `min` plies. A line that wins nothing
 * keeps its first six plies.
 */
export function settle(fen, pv, cap = 12, min = 0) {
  const b = new Chess(fen)
  const solver = b.turn()
  const start = K.materialFor(fen, solver)
  let best = { at: Math.min(Math.max(6, min), pv.length), net: 0 }
  for (let i = 0; i < Math.min(pv.length, Math.max(cap, min)); i++) {
    try {
      b.move({ from: pv[i].slice(0, 2), to: pv[i].slice(2, 4), promotion: pv[i][4] })
    } catch {
      return { pv: pv.slice(0, i), net: best.net, mate: false }
    }
    if (b.isCheckmate()) return { pv: pv.slice(0, i + 1), net: K.materialFor(b.fen(), solver) - start, mate: true }
    if (b.turn() === solver) {
      const net = K.materialFor(b.fen(), solver) - start
      if (net > best.net) best = { at: i + 1, net }
    }
  }
  return { pv: pv.slice(0, Math.max(best.at, Math.min(min, pv.length))), net: best.net, mate: false }
}

/** A sentence for each concept a line carries out, naming the move and the pieces. */
export function conceptSentences(fen, pv, signals, rule, pov, lastTo = null) {
  const fens = [fen]
  for (const u of pv) fens.push(fenAfter(fens[fens.length - 1], u))
  const lineMover = new Chess(fen).turn()
  const out = []
  for (const [concept, from] of lineConcepts(signals, rule)) {
    const step = from.k === null ? null : signals.steps[from.k]
    if (concept === 'hanging-piece' && step) {
      const landed = step.ply === 1 ? lastTo : toMove(fens[step.ply - 2], pv[step.ply - 2]).captured ? pv[step.ply - 2].slice(2, 4) : null
      if (step.capture && step.uci.slice(2, 4) === landed) continue
    }
    const after = step ? fens[step.ply] : fens[fens.length - 1]
    const before = step ? fens[step.ply - 1] : null
    const by = step?.san
    const word = CONCEPT_WORD[concept] ?? concept
    let text
    if (concept === 'checkmate') text = `the line ends in mate after ${signals.solverMoves} move${signals.solverMoves === 1 ? '' : 's'} by ${lineMover === pov ? 'you' : 'them'}`
    else if (concept === 'back-rank-mate') {
      const g = new Chess(after)
      const king = g.board().flat().find((c) => c && c.type === 'k' && c.color === g.turn()).square
      const front = g.turn() === 'w' ? '2' : '7'
      const file = king.charCodeAt(0) - 97
      const blockers = [file - 1, file, file + 1].filter((f) => f >= 0 && f < 8).map((f) => String.fromCharCode(97 + f) + front)
      text = `a back-rank mate: the king on ${king} is trapped on its back rank, boxed in by its own pieces on ${blockers.join(', ')}`
    } else if (concept === 'fork') text = `${by} forks ${step.fork.targets.map((t) => pieceAt(after, t, pov)).join(' and ')}`
    else if (concept === 'attraction') text = `${by} is a sacrifice that draws ${lineMover === pov ? 'their' : 'your'} king to ${step.attraction.square}: the king takes it there, and the next move hits the king`
    else if (concept === 'double-check') text = `${by} gives double check, so only a king move answers it`
    else if (concept === 'promotion') text = `${by} promotes a pawn`
    else if (concept.endsWith('-mate')) text = `the mate is ${/^[aeiouAEIOU]/.test(word) ? 'an' : 'a'} ${word}`
    else if (['discovered-attack', 'skewer', 'pin'].includes(concept)) {
      const t = (K.tacticalThemes(before, step.uci) ?? []).find((x) => (concept === 'pin' ? x.kind === 'pinAbsolute' : concept === 'skewer' ? x.kind === 'skewer' : x.kind.startsWith('discovered')))
      if (t) text = `${by} ${t.text}`
      else if (concept === 'discovered-attack' && step.discoveredCheck) text = `${by} uncovers a discovered check`
      else text = `${by} sets up a ${word}`
    } else if (concept === 'deflection') text = `${by} drags ${pieceAt(before, step.deflection.defender, pov)} away from guarding ${step.deflection.square}`
    else if (concept === 'removing-the-defender') text = `${by} takes the piece that guarded ${step.capturingDefender.square}`
    else if (concept === 'zwischenzug') text = `${by} is an in-between move before the recapture on ${step.intermezzo.square}`
    else if (concept === 'trapped-piece') text = `${by} wins a piece that has no safe square`
    else if (concept === 'hanging-piece') text = `${by} takes a loose piece`
    else if (concept === 'passed-pawn') text = `${by} pushes or uses an advanced pawn`
    else if (concept === 'quiet-move') text = `${by} is a quiet move: no check, no capture, and nothing loose to take, yet the threat behind it decides`
    else if (concept === 'sacrifice') text = `${by} gives up the ${PIECE[toMove(before, step.uci).piece]}: it is taken where it lands`
    else if (concept === 'f7-raid') text = `${by} hits the weak square next to the king (f2 or f7)`
    else text = `${by ?? 'the line'} carries out a ${word}`
    out.push({ tactic: word, at: by ?? null, ply: step ? step.ply : null, text })
  }
  return out
}

/**
 * A short line's length: at least `min` plies, and on through any recapture that
 * answers the last move shown, so a short line never stops in the middle of a trade.
 */
export function settledLength(fen, pv, min) {
  const b = new Chess(fen)
  const tos = []
  const captures = []
  for (const u of pv.slice(0, min + 6)) {
    let mv
    try {
      mv = b.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
    } catch {
      break
    }
    tos.push(mv.to)
    captures.push(!!mv.captured)
  }
  let n = Math.min(min, tos.length)
  while (n < tos.length && captures[n] && tos[n] === tos[n - 1]) n++
  return n
}

/**
 * How forced a move is, from the rules alone: the only legal move, the king's only
 * squares out of a check, or one of a few answers to a check. A reply the rules leave
 * free is not called forced, however clearly it is best.
 */
export function forcedness(fen) {
  const b = new Chess(fen)
  const legal = b.moves({ verbose: true })
  if (legal.length === 1) return b.inCheck() ? 'forced: the only legal answer to the check' : 'forced: the only legal move'
  if (!b.inCheck() || legal.length > 3) return null
  if (legal.every((x) => x.piece === 'k')) return `it is check, and the king has only ${legal.length} squares`
  return `it is check, with only ${legal.length} legal answers`
}

/**
 * A line move by move, with what each move does and, for a move made in check or with
 * no other legal move, how forced it is; a capture on the square where the move before
 * it captured is a recapture, and says so. `lastTo` is where the move before the line
 * captured, if it did.
 */
export function annotate(fen, pv, pov, lastTo = null) {
  const out = []
  let f = fen
  let prev = lastTo
  for (const uci of pv) {
    let mv
    try {
      mv = toMove(f, uci)
    } catch {
      break
    }
    const forced = forcedness(f)
    out.push({ move: mv.san, by: mv.color === pov ? 'you' : 'they', does: said(f, uci, pov, !!mv.captured && mv.to === prev), ...(forced ? { forced } : {}) })
    prev = mv.captured ? mv.to : null
    f = fenAfter(f, uci)
  }
  return out
}

/** A line taken as given, such as a puzzle's answer key: its moves, its mate and its material, with no cut. */
export function exactLine(fen, pv) {
  const b = new Chess(fen)
  const solver = b.turn()
  const start = K.materialFor(fen, solver)
  const kept = []
  for (const u of pv) {
    try {
      b.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
    } catch {
      break
    }
    kept.push(u)
  }
  return { pv: kept, net: K.materialFor(b.fen(), solver) - start, mate: b.isCheckmate() }
}

/**
 * A line's tactics: its point and what else it does, with the line it was read on and
 * what it changes hands. `before` and `lead` are the position before the move that
 * the line answers and that move, whose own capture the material count includes. A
 * line that neither mates nor changes material keeps only its first two moves.
 */
export function lineFacts(fen, pv, pov, before = null, lead = null, short = false, exact = false, min = 0) {
  const settled = exact ? exactLine(fen, pv) : settle(fen, pv, 12, min)
  const leadSan = lead ? sanOf(before, lead) : null
  const count = (ucis) => exchangeText(before ?? fen, [...(lead ? [lead] : []), ...ucis], pov)
  const full = count(settled.pv)
  const shown = exact || min > 0 || (!short && (full.mate || full.net !== 0)) ? settled.pv : settled.pv.slice(0, settledLength(fen, settled.pv, 2))
  const material = shown === settled.pv ? full : count(shown)
  const signals = lineSignals({ fen, pv: shown, before, lastSan: leadSan })
  const lastTo = lead && toMove(before, lead).captured ? lead.slice(2, 4) : null
  return {
    line: annotate(fen, shown, pov, lastTo),
    idea: conceptSentences(fen, shown, signals, RULES.point, pov, lastTo),
    also: conceptSentences(fen, shown, signals, SHEET_ALSO, pov, lastTo),
    result: material.text,
    gain: settled.mate ? 'mate' : settled.net,
  }
}
