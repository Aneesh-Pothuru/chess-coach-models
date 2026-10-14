#!/usr/bin/env node
// Programmatic graders for the explain-top-move eval: how the app explains the
// engine's best move, checked against the board (chess.js) and the stored
// engine evidence. Three verdicts per key moment:
//
//   faithful     1 unless a checkable claim in the visible text is false.
//   concrete     1 when the better move's explanation names a consequence
//                (material, a mate, a named threat, a prevented reply) and the
//                text says what the played move allowed or missed.
//   named_deep   1 when every move the text names as best rests on a search at
//                the best budget (pass 2, or >= 600k nodes): budgets.ts `best`.
//
// The visible text is what the player reads: the lesson fields when the card
// shows the lesson, the comment otherwise, and the retry hint and reveal. The
// Why sheet also shows the lesson on comment-card moments; those claims are
// graded too, as `faithfulAll`, so the spec's visible set stays exact.
//
// Claims come from the templates the review and knowledge services write
// (review/prose.ts, review/lessons.ts, knowledge/detectors/*.ts). A clause no
// template recognises is reported as unparsed, never graded as true. An "if
// they take it with" answer is replayed on the engine line it comes from: the
// best line, a searched capture (the case's `probes`, probes.mjs), or the
// played line. An "if they move the queen (Qe3)" or "if they block with c6"
// answer is replayed the same way after the better move: the best line, or
// the searched defense (the case's `defenses`, defenses.mjs).
//
//   bridge/run.sh projects/explain-top-move/grade.mjs [cases.json] [--out grades.json]
//
// cases.json defaults to private/explain-top-move/cases.json, --out to
// private/explain-top-move/grades.json. Writes grades.json (per moment) and
// grades.md beside --out; both name moments, so neither leaves private/. The
// hand-check table in grades.md is read from the research records'
// handcheck.json when it exists. The grader loads no app code (bridge/run.sh
// only lends it the app's chess.js), and other scripts may import it.

import { Chess } from 'chess.js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { privateDir, records } from '../../bridge/lib/lab.mjs'

// ---------------------------------------------------------------- constants

/** Standard values, as the app's material count uses them (kings do not count). */
export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const TYPE_OF_WORD = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' }
const WORD_OF_TYPE = Object.fromEntries(Object.entries(TYPE_OF_WORD).map(([w, t]) => [t, w]))
/** The lesson's read of an engine line: 10 plies, then the quiet tail (knowledge/detectors/lesson.ts). */
const LINE_PLIES = 10
const QUIET_EXTENSION = 6
const other = (c) => (c === 'w' ? 'b' : 'w')
const SIDE_NAME = { w: 'White', b: 'Black' }

// Regex pieces. A SAN token in prose has no spaces, commas, colons, periods or brackets.
// A SAN token always carries a rank digit (or is a castle): "it", "they" and other words do not match.
const TOKR = String.raw`((?=[^\s,:.()]*[1-8])[^\s,:.()]+|O-O(?:-O)?)`
const WHO2 = String.raw`(You|They|you|they)`
const RESTRAINT = String.raw`(?::\s*it cannot (?:move|advance|leave the line))?`
const PIECE = String.raw`(pawn|knight|bishop|rook|queen|king)`
const SQ = String.raw`([a-h][1-8])`
const AMT = String.raw`(a pawn|two pawns' worth of material|a piece and a pawn|a piece and \d+ pawns|a piece|a rook|a queen|about \d+ pawns of material|nothing)`
const WHO = String.raw`(you|they)`
const ATTACK_ITEM = String.raw`(?:(?:their|your|the) )?(?:pawn|knight|bishop|rook|queen|king) on [a-h][1-8](?: \(undefended\))?`

// ---------------------------------------------------------------- verdicts

const T = (reason) => ({ v: 'true', reason })
const F = (reason) => ({ v: 'false', reason })
const U = (reason) => ({ v: 'unverified', reason })

// ---------------------------------------------------------------- chess helpers

function load(fen) {
  try {
    return new Chess(fen)
  } catch {
    return null
  }
}

/** Plays a UCI move on `g` (mutating it); the move object, or null when illegal. */
function playUci(g, uci) {
  if (!g || typeof uci !== 'string' || uci.length < 4) return null
  try {
    return g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined })
  } catch {
    return null
  }
}

/**
 * A SAN the text writes must carry the suffix the position gives: chess.js
 * ignores a wrong '+' or '#', so the grader checks it.
 */
function suffixAgrees(token, after) {
  if (token.endsWith('#')) return after.isCheckmate()
  if (token.endsWith('+')) return after.inCheck() && !after.isCheckmate()
  return true
}

/** The legal move a SAN token names in `fen`, with its suffix checked. */
function resolveSan(fen, token) {
  const g = load(fen)
  if (!g || !token) return { ok: false, reason: 'no position' }
  const bare = token.replace(/[+#]+$/, '')
  const hit = g.moves({ verbose: true }).find((m) => m.san.replace(/[+#]+$/, '') === bare)
  if (!hit) return { ok: false, reason: `${token} is not a legal move here` }
  const uci = hit.from + hit.to + (hit.promotion ?? '')
  const after = load(fen)
  playUci(after, uci)
  if (!suffixAgrees(token, after)) {
    const got = after.isCheckmate() ? 'mate' : after.inCheck() ? 'check' : 'no check'
    return { ok: false, reason: `${token} is written with a suffix the move does not have (it gives ${got})`, uci }
  }
  return { ok: true, uci, san: hit.san }
}

/** The move `uci` from `fen`, with the board after it; null when illegal. */
function moveAt(fen, uci) {
  const g = load(fen)
  const m = g ? playUci(g, uci) : null
  if (!m) return null
  return {
    fen,
    uci,
    san: m.san,
    color: m.color,
    piece: m.piece,
    captured: m.captured ?? null,
    to: m.to,
    from: m.from,
    promotion: m.promotion ?? null,
    flags: m.flags,
    board: g,
    afterFen: g.fen(),
  }
}

/** A SAN line from `fen` as UCI moves; stops at the first token that is not legal. */
function sansToUcis(fen, sans) {
  const out = []
  let cur = fen
  for (let i = 0; i < sans.length; i++) {
    const r = resolveSan(cur, sans[i])
    if (!r.ok) return { ucis: out, illegalAt: i, reason: r.reason }
    out.push(r.uci)
    const g = load(cur)
    playUci(g, r.uci)
    cur = g.fen()
  }
  return { ucis: out, illegalAt: null, reason: null }
}

function material(g, color) {
  let s = 0
  for (const row of g.board()) for (const cell of row) if (cell && cell.color === color) s += VALUE[cell.type]
  return s
}

function balance(g, side) {
  return material(g, side) - material(g, other(side))
}

/**
 * The lesson's read of an engine line for `side`: the material change, the
 * captures, and how the read ended. A line that mates is read to the mate.
 */
function windowRead(fen, ucis, side) {
  const g = load(fen)
  if (!g) return null
  const start = balance(g, side)
  const probe = load(fen)
  let toMate = 0
  for (let i = 0; i < ucis.length; i++) {
    if (!playUci(probe, ucis[i])) break
    if (probe.isCheckmate()) {
      toMate = i + 1
      break
    }
  }
  const cap = toMate || Math.min(ucis.length, LINE_PLIES + QUIET_EXTENSION)
  let read = 0
  let state = 'exhausted'
  let last = null
  const captures = []
  for (let i = 0; i < cap; i++) {
    const m = playUci(g, ucis[i])
    if (!m) {
      state = 'illegal'
      break
    }
    read++
    last = m
    if (m.captured) captures.push({ by: m.color, piece: m.captured, square: m.to, ply: i })
    if (g.isCheckmate()) {
      state = 'mate'
      break
    }
    if (!toMate && read >= LINE_PLIES) {
      const next = ucis[i + 1]
      const nextCaptures = !!next && !!g.get(next.slice(2, 4))
      if (!m.captured && !g.inCheck() && !nextCaptures) {
        state = 'quiet'
        break
      }
    }
  }
  // The visible end is quiet when the last move neither captured nor gave check.
  const endQuiet = !!last && !last.captured && !g.inCheck()
  // Settled: nothing is pending at the window's end (no check, no recapture on
  // the last capture's square, no capture next in the line).
  const pendingRecapture = !!last?.captured && g.moves({ verbose: true }).some((m) => m.captured && m.to === last.to)
  const next = ucis[read]
  const probe2 = next && !g.isGameOver() ? load(g.fen()) : null
  const nextMove = probe2 ? playUci(probe2, next) : null
  const pendingContinuation = !!next && !g.isGameOver() && (!nextMove || !!nextMove.captured)
  const settled = state !== 'illegal' && read > 0 && (g.isGameOver() || (!g.inCheck() && !pendingRecapture && !pendingContinuation))
  return { net: balance(g, side) - start, state, plies: read, captures, endQuiet, settled }
}

/** The mate a UCI line delivers from `fen`: who gives it, and how many of `side`'s moves it takes. */
function mateInLine(fen, ucis, side) {
  const g = load(fen)
  if (!g) return { illegal: true }
  const colours = []
  for (let i = 0; i < ucis.length; i++) {
    const m = playUci(g, ucis[i])
    if (!m) return { illegal: true, at: i }
    colours.push(m.color)
    if (g.isCheckmate()) return { mate: true, by: m.color, plies: i + 1, sideMoves: colours.filter((c) => c === side).length }
  }
  return { mate: false }
}

/** Engine mate from a White-POV score: who gives it and at what distance; null for a centipawn score. */
function scoreMate(score) {
  if (!score || score.mate === null || score.mate === undefined) return null
  return { winner: score.mate > 0 ? 'w' : 'b', dist: Math.abs(score.mate) }
}

/**
 * A claim "side mates in n", counted from the position `fen` the claim is about.
 * The line decides when it reaches a mate; otherwise the engine's mate distance
 * for that position does. A centipawn score is no mate.
 */
function checkMate(side, n, fen, ucis, score) {
  if (ucis && ucis.length) {
    const r = mateInLine(fen, ucis, side)
    if (r.mate) {
      if (r.by !== side) return F(`the line gives mate for ${SIDE_NAME[r.by]}, not ${SIDE_NAME[side]}`)
      return r.sideMoves === n ? T(`the line mates in ${n}`) : F(`the line mates in ${r.sideMoves}, the text says ${n}`)
    }
  }
  const sm = scoreMate(score)
  if (sm) {
    if (sm.winner !== side) return F(`the engine has ${SIDE_NAME[sm.winner]} mating, not ${SIDE_NAME[side]}`)
    return sm.dist === n ? T(`engine mate distance ${sm.dist}`) : F(`engine mate distance is ${sm.dist}, the text says ${n}`)
  }
  if (score && score.cp !== null && score.cp !== undefined) return F('the engine score for that position is not a mate')
  return U('no mate line or engine mate score to check against')
}

/** The app's materialPhrase words, read back to the amount they name ({min,max}). */
function parseMaterialPhrase(s) {
  const t = s.trim()
  if (t === 'a queen') return { min: 9, max: Infinity }
  if (t === 'a rook') return { min: 5, max: 5 }
  if (t === "two pawns' worth of material") return { min: 2, max: 2 }
  if (t === 'a piece') return { min: 3, max: 3 }
  if (t === 'a piece and a pawn') return { min: 4, max: 4 }
  if (t === 'a pawn') return { min: 1, max: 1 }
  if (t === 'nothing') return { min: 0, max: 0 }
  let m = t.match(/^a piece and (\d+) pawns$/)
  if (m) return { min: 3 + +m[1], max: 3 + +m[1] }
  m = t.match(/^about (\d+) pawns of material$/)
  if (m) return { min: +m[1], max: +m[1] }
  return null
}

// ---------------------------------------------------------------- the claim record

/**
 * One claim: what the text said, where it was shown, and the verdict.
 * `shown` is 'card' (the spec's visible set) or 'sheet' (only in the Why sheet).
 */
function claim(type, surface, shown, span, result, extra = {}) {
  return { type, surface, shown, text: span, verdict: result.v, reason: result.reason, ...extra }
}

/** A move's attachment: the position it is played from, the move, its maker, and the engine line and score that count its mate. */
function attachment(fen, uci, mateLine = [], mateScore = null) {
  const mv = uci ? moveAt(fen, uci) : null
  return { fen, uci, mover: mv ? mv.color : null, mv, mateLine, mateScore }
}

// ---------------------------------------------------------------- claim checks

/** A SAN the text names: legal in `fen`, and (when given) the move the clause is about. */
function checkSan(token, fen, shown, surface, expectUci = null) {
  const r = resolveSan(fen, token)
  if (!r.ok) return claim('san', surface, shown, token, F(r.reason))
  if (expectUci && r.uci !== expectUci) return claim('san', surface, shown, token, F(`${token} is a different move from the one the text attaches it to`))
  return claim('san', surface, shown, token, T(`${token} is legal here`))
}

function checkLine(sans, fen, shown, surface, span) {
  const r = sansToUcis(fen, sans)
  if (r.illegalAt !== null) return claim('line', surface, shown, span, F(`line stops being legal at "${sans[r.illegalAt]}": ${r.reason}`))
  return claim('line', surface, shown, span, T(`the line of ${sans.length} moves replays`))
}

function recaptured(mv) {
  return mv.board.moves({ verbose: true }).some((m) => m.to === mv.to && m.captured)
}

/** "wins the P": the move captures a P; "outright" adds no legal recapture; "for the Q" adds the recapture and the worth. */
function checkWins(att, pieceType, span, shown, surface, { outright = false, forPiece = null } = {}) {
  const mv = att.mv
  if (!mv) return claim('wins', surface, shown, span, F('the move does not replay'))
  if (!mv.captured) return claim('wins', surface, shown, span, F(`${mv.san} captures nothing`))
  if (mv.captured !== pieceType) return claim('wins', surface, shown, span, F(`${mv.san} captures a ${WORD_OF_TYPE[mv.captured]}, not a ${WORD_OF_TYPE[pieceType]}`))
  const rec = recaptured(mv)
  if (outright && rec) return claim('wins', surface, shown, span, F(`${mv.san} can be recaptured on ${mv.to}, so the win is not outright`))
  if (forPiece) {
    if (mv.piece !== forPiece) return claim('wins', surface, shown, span, F(`${mv.san} is made by a ${WORD_OF_TYPE[mv.piece]}, the text says a ${WORD_OF_TYPE[forPiece]}`))
    if (!rec) return claim('wins', surface, shown, span, F(`${mv.san} is not recaptured, so nothing is given up`))
    if (VALUE[pieceType] <= VALUE[mv.piece]) return claim('wins', surface, shown, span, F(`a ${WORD_OF_TYPE[pieceType]} (${VALUE[pieceType]}) does not beat a ${WORD_OF_TYPE[mv.piece]} (${VALUE[mv.piece]})`))
  }
  return claim('wins', surface, shown, span, T(`${mv.san} takes the ${WORD_OF_TYPE[pieceType]}${outright ? ', and nothing takes it back' : ''}`))
}

/** "takes the P back": the move captures a P. The recapture on the same square is not checked: the case holds no earlier move. */
function checkTakesBack(att, pieceType, span, shown, surface) {
  const mv = att.mv
  if (!mv || mv.captured !== pieceType) return claim('takes_back', surface, shown, span, F(`${att.mv ? att.mv.san : att.uci} does not capture a ${WORD_OF_TYPE[pieceType]}`))
  return claim('takes_back', surface, shown, span, T(`${mv.san} captures the ${WORD_OF_TYPE[pieceType]}; the earlier capture it answers is not in the case`))
}

/** "trades off the P": the move captures a P of its own worth and the other side recaptures on that square. */
function checkTrade(att, pieceType, span, shown, surface) {
  const mv = att.mv
  if (!mv || !mv.captured) return claim('trades', surface, shown, span, F(`${att.mv ? att.mv.san : att.uci} captures nothing`))
  if (mv.captured !== pieceType) return claim('trades', surface, shown, span, F(`${mv.san} captures a ${WORD_OF_TYPE[mv.captured]}, not a ${WORD_OF_TYPE[pieceType]}`))
  if (!recaptured(mv)) return claim('trades', surface, shown, span, F(`${mv.san} is not recaptured: nothing is traded`))
  if (VALUE[mv.piece] !== VALUE[pieceType]) return claim('trades', surface, shown, span, F(`a ${WORD_OF_TYPE[mv.piece]} for a ${WORD_OF_TYPE[pieceType]} is not an even trade`))
  return claim('trades', surface, shown, span, T(`${mv.san} takes a ${WORD_OF_TYPE[pieceType]} and is recaptured`))
}

/** "takes the P, and nothing takes back": the capture, with no legal recapture. */
function checkNothingBack(att, pieceType, span, shown, surface) {
  const mv = att.mv
  if (!mv || mv.captured !== pieceType) return claim('nothing_takes_back', surface, shown, span, F(`${att.mv ? att.mv.san : att.uci} does not capture a ${WORD_OF_TYPE[pieceType]}`))
  return recaptured(mv)
    ? claim('nothing_takes_back', surface, shown, span, F(`${mv.san} can be recaptured on ${mv.to}`))
    : claim('nothing_takes_back', surface, shown, span, T(`${mv.san} captures the ${WORD_OF_TYPE[pieceType]} and nothing recaptures`))
}

/** "attacks the P on S": S holds that piece of the other side, a piece of the mover attacks S, and "(undefended)" means no defender. */
function checkAttack(att, pieceType, sq, undefended, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('attacks', surface, shown, span, F('the move does not replay'))
  const b = mv.board
  const victim = other(mv.color)
  const cell = b.get(sq)
  if (!cell || cell.type !== pieceType || cell.color !== victim) {
    return claim('attacks', surface, shown, span, F(`after ${mv.san} there is no ${WORD_OF_TYPE[pieceType]} of ${SIDE_NAME[victim]} on ${sq}`))
  }
  if (!b.attackers(sq, mv.color).length) return claim('attacks', surface, shown, span, F(`after ${mv.san} nothing of ${SIDE_NAME[mv.color]}'s attacks ${sq}`))
  if (undefended && legalDefenders(b, sq, victim).length) return claim('undefended', surface, shown, span, F(`${sq} is defended after ${mv.san}`))
  if (undefended) return claim('undefended', surface, shown, span, T(`${sq} is attacked and undefended after ${mv.san}`))
  return claim('attacks', surface, shown, span, T(`after ${mv.san} the ${WORD_OF_TYPE[pieceType]} on ${sq} is attacked`))
}

function checkCheck(att, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('check', surface, shown, span, F('the move does not replay'))
  return mv.board.inCheck()
    ? claim('check', surface, shown, span, T(`${mv.san} gives check`))
    : claim('check', surface, shown, span, F(`${mv.san} gives no check`))
}

function flipFen(fen) {
  const p = fen.split(' ')
  p[1] = p[1] === 'w' ? 'b' : 'w'
  p[3] = '-'
  return p.join(' ')
}

/** "threatens mate with X": if the side that just moved had the move again, X would be legal and mate. */
function checkThreatMate(att, token, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('threat_mate', surface, shown, span, F('the move does not replay'))
  if (mv.board.inCheck()) return claim('threat_mate', surface, shown, span, U('the opponent is in check after the move: no threat is defined'))
  const g = load(flipFen(mv.afterFen))
  if (!g) return claim('threat_mate', surface, shown, span, U('no flipped position'))
  const bare = token.replace(/[+#]+$/, '')
  const hit = g.moves({ verbose: true }).find((m) => m.san.replace(/[+#]+$/, '') === bare)
  if (!hit) return claim('threat_mate', surface, shown, span, F(`${token} is not a legal move for ${SIDE_NAME[mv.color]} after ${mv.san}`))
  playUci(g, hit.from + hit.to + (hit.promotion ?? ''))
  return g.isCheckmate()
    ? claim('threat_mate', surface, shown, span, T(`${token} mates if ${SIDE_NAME[mv.color]} had the move`))
    : claim('threat_mate', surface, shown, span, F(`${token} does not mate after ${mv.san}`))
}

/** "forks X and Y": the moved piece attacks a piece of each named type on the other side. */
function checkFork(att, listText, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('forks', surface, shown, span, F('the move does not replay'))
  const b = mv.board
  const victim = other(mv.color)
  const items = listText.split(/, | and /).map((s) => s.trim()).filter(Boolean)
  for (const it of items) {
    const m = it.match(/(?:(?:your|their|the) )?(king|queen|rook|bishop|knight|pawn)(?: on ([a-h][1-8]))?/)
    if (!m) return claim('forks', surface, shown, span, U(`fork item "${it}" not parsed`))
    const type = TYPE_OF_WORD[m[1]]
    const sq = m[2] ?? findPieceAttackedBy(b, victim, type, mv.to)
    if (!sq) return claim('forks', surface, shown, span, F(`${mv.san} attacks no ${m[1]} of ${SIDE_NAME[victim]}`))
    const cell = b.get(sq)
    if (!cell || cell.type !== type || cell.color !== victim) return claim('forks', surface, shown, span, F(`after ${mv.san} there is no ${m[1]} of ${SIDE_NAME[victim]} on ${sq}`))
    if (!b.attackers(sq, mv.color).includes(mv.to)) return claim('forks', surface, shown, span, F(`${mv.san} does not attack the ${m[1]} on ${sq}`))
  }
  return claim('forks', surface, shown, span, T(`${mv.san} attacks each piece named`))
}

function findPieceAttackedBy(b, color, type, attackerSq) {
  for (const row of b.board()) for (const cell of row) if (cell && cell.color === color && cell.type === type && b.attackers(cell.square, b.get(attackerSq)?.color ?? 'w').includes(attackerSq)) return cell.square
  return null
}

function checkPromotes(att, pieceWord, sq, span, shown, surface) {
  const mv = att.mv
  if (!mv || !mv.promotion) return claim('promotes', surface, shown, span, F(`${att.mv ? att.mv.san : att.uci} is not a promotion`))
  if (pieceWord && TYPE_OF_WORD[pieceWord] !== mv.promotion) return claim('promotes', surface, shown, span, F(`${mv.san} promotes to a ${WORD_OF_TYPE[mv.promotion]}`))
  if (sq && sq !== mv.to) return claim('promotes', surface, shown, span, F(`${mv.san} promotes on ${mv.to}, not ${sq}`))
  return claim('promotes', surface, shown, span, T(`${mv.san} promotes`))
}

function findKing(b, color) {
  for (const row of b.board()) for (const cell of row) if (cell && cell.type === 'k' && cell.color === color) return cell.square
  return null
}

/**
 * A pin. Absolute ("to the king"): lifting the piece exposes the king to the
 * mover. Relative ("against the Q"): lifting it exposes the named piece.
 * `pinnerWord` names the moved piece when the text names it.
 */
function checkPin(att, pieceWord, sq, targetWord, span, shown, surface, pinnerWord = null) {
  const mv = att.mv
  if (!mv) return claim('pin', surface, shown, span, F('the move does not replay'))
  const b = mv.board
  const victim = other(mv.color)
  const cell = b.get(sq)
  if (!cell || cell.type !== TYPE_OF_WORD[pieceWord] || cell.color !== victim) return claim('pin', surface, shown, span, F(`after ${mv.san} there is no ${pieceWord} of ${SIDE_NAME[victim]} on ${sq}`))
  if (pinnerWord && WORD_OF_TYPE[mv.piece] !== pinnerWord) return claim('pin', surface, shown, span, F(`${mv.san} is a ${WORD_OF_TYPE[mv.piece]}, the text says a ${pinnerWord} pins`))
  const before = load(mv.afterFen)
  const lifted = load(mv.afterFen)
  lifted.remove(sq)
  if (!targetWord) {
    const king = findKing(b, victim)
    if (before.isAttacked(king, mv.color)) return claim('pin', surface, shown, span, F(`${SIDE_NAME[victim]}'s king is already attacked, so the piece is not pinned`))
    return lifted.isAttacked(king, mv.color)
      ? claim('pin', surface, shown, span, T(`${sq} is pinned to the king after ${mv.san}`))
      : claim('pin', surface, shown, span, F(`lifting the ${pieceWord} on ${sq} does not expose the king`))
  }
  // The piece the pin shields is the first one behind the pinned piece, seen from the pinner.
  const behind = pieceBeyond(b, mv.to, sq)
  if (behind) {
    const bc = b.get(behind)
    if (bc.type !== TYPE_OF_WORD[targetWord] || bc.color !== victim) return claim('pin', surface, shown, span, F(`the piece behind ${sq} is a ${WORD_OF_TYPE[bc.type]} on ${behind}, not a ${targetWord}`))
  }
  const target = behind ?? findPieceOfType(b, victim, TYPE_OF_WORD[targetWord], sq)
  if (!target) return claim('pin', surface, shown, span, F(`no ${targetWord} of ${SIDE_NAME[victim]} to pin against`))
  return !before.isAttacked(target, mv.color) && lifted.isAttacked(target, mv.color)
    ? claim('pin', surface, shown, span, T(`${sq} shields the ${targetWord} on ${target}`))
    : claim('pin', surface, shown, span, F(`lifting the ${pieceWord} on ${sq} does not expose the ${targetWord} on ${target}`))
}

/** The first occupied square beyond `sq` on the line from `from` through `sq` (null when they are not on a line, or nothing is there). */
function pieceBeyond(b, from, sq) {
  const df = Math.sign(sq.charCodeAt(0) - from.charCodeAt(0))
  const dr = Math.sign(+sq[1] - +from[1])
  const fdf = Math.abs(sq.charCodeAt(0) - from.charCodeAt(0))
  const fdr = Math.abs(+sq[1] - +from[1])
  if ((!df && !dr) || !(fdf === 0 || fdr === 0 || fdf === fdr)) return null
  let f = sq.charCodeAt(0) - 97 + df
  let r = +sq[1] - 1 + dr
  while (f >= 0 && f < 8 && r >= 0 && r < 8) {
    const s = String.fromCharCode(97 + f) + (r + 1)
    if (b.get(s)) return s
    f += df
    r += dr
  }
  return null
}

/**
 * The pieces of `victim` that can recapture on `sq`: an attacker that is not
 * pinned to its king, and a king only where the square is not attacked. This
 * is the pin-aware sense of "undefended" the app uses.
 */
function legalDefenders(b, sq, victim) {
  const enemy = other(victim)
  // An enemy piece on sq is the one that captures; the king may recapture only when no
  // other enemy piece also covers sq after that capture.
  const enemyCovering = b.attackers(sq, enemy).length
  return b.attackers(sq, victim).filter((s) => {
    const cell = b.get(s)
    if (!cell) return false
    if (cell.type === 'k') return enemyCovering < 2
    return !pinnedToKing(b, s, victim)
  })
}

function pinnedToKing(b, s, color) {
  const king = findKing(b, color)
  if (!king) return false
  const h = load(b.fen())
  if (!h) return false
  const enemy = other(color)
  const before = h.isAttacked(king, enemy)
  h.remove(s)
  return !before && h.isAttacked(king, enemy)
}

function findPieceOfType(b, color, type, exclude) {
  for (const row of b.board()) for (const cell of row) if (cell && cell.color === color && cell.type === type && cell.square !== exclude) return cell.square
  return null
}

/** Two of the named pieces of the mover's side on one line, nothing between them, one of them the moved piece. */
function checkBattery(att, w1, w2, lineText, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('battery', surface, shown, span, F('the move does not replay'))
  const b = mv.board
  const types = [TYPE_OF_WORD[w1], TYPE_OF_WORD[w2]]
  const onLine = lineMatch(lineText.trim(), mv.to)
  if (!onLine) return claim('battery', surface, shown, span, U(`line "${lineText}" not parsed`))
  const landing = b.get(mv.to)
  if (!landing || !types.includes(landing.type)) return claim('battery', surface, shown, span, F(`${mv.san} does not move a ${w1} or a ${w2}`))
  for (const row of b.board()) for (const c of row) {
    if (!c || c.color !== mv.color || c.square === mv.to || !types.includes(c.type)) continue
    if (onLine(c.square) && clearBetween(b, mv.to, c.square)) return claim('battery', surface, shown, span, T(`${mv.san} lines up with the ${WORD_OF_TYPE[c.type]} on ${c.square}`))
  }
  return claim('battery', surface, shown, span, F(`after ${mv.san} no battery stands on ${lineText.trim()}`))
}

/** The line a battery sentence names ("the f-file", "the fifth rank", "the long diagonal through c2"): a predicate on squares. */
function lineMatch(name, through) {
  const f = through.charCodeAt(0) - 97
  const r = +through[1] - 1
  let m = name.match(/^([a-h])-file$/)
  if (m) return (sq) => sq.charCodeAt(0) - 97 === m[1].charCodeAt(0) - 97 && m[1].charCodeAt(0) - 97 === f
  const ords = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth']
  m = name.match(/^(first|second|third|fourth|fifth|sixth|seventh|eighth) rank$/)
  if (m) return (sq) => +sq[1] - 1 === ords.indexOf(m[1]) && ords.indexOf(m[1]) === r
  m = name.match(/^long diagonal through ([a-h][1-8])$/)
  if (m) {
    const c0 = m[1].charCodeAt(0) - 97
    const r0 = +m[1][1] - 1
    return (sq) => {
      const c = sq.charCodeAt(0) - 97
      const rr = +sq[1] - 1
      return c - c0 === rr - r0 || c - c0 === r0 - rr
    }
  }
  return null
}

function clearBetween(b, a, c) {
  const fa = a.charCodeAt(0) - 97
  const ra = +a[1] - 1
  const fc = c.charCodeAt(0) - 97
  const rc = +c[1] - 1
  if (!(fa === fc || ra === rc || Math.abs(fc - fa) === Math.abs(rc - ra))) return false
  const df = Math.sign(fc - fa)
  const dr = Math.sign(rc - ra)
  let f = fa + df
  let r = ra + dr
  while (f !== fc || r !== rc) {
    if (b.get(String.fromCharCode(97 + f) + (r + 1))) return false
    f += df
    r += dr
  }
  return true
}

function pawnsOnFile(b, color, f) {
  let n = 0
  for (let r = 1; r <= 8; r++) {
    const cell = b.get(String.fromCharCode(97 + f) + r)
    if (cell && cell.type === 'p' && cell.color === color) n++
  }
  return n
}

/** "the rook takes the open/half-open X-file": the file holds none of the mover's pawns, and an enemy pawn only for half-open. */
function checkOpenFile(att, kind, file, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('open_file', surface, shown, span, F('the move does not replay'))
  if (mv.to[0] !== file) return claim('open_file', surface, shown, span, F(`${mv.san} does not land on the ${file}-file`))
  const f = file.charCodeAt(0) - 97
  if (pawnsOnFile(mv.board, mv.color, f) > 0) return claim('open_file', surface, shown, span, F(`the ${file}-file holds a pawn of the mover's`))
  const real = pawnsOnFile(mv.board, other(mv.color), f) === 0 ? 'open' : 'half-open'
  return real === kind
    ? claim('open_file', surface, shown, span, T(`the ${file}-file is ${kind} after ${mv.san}`))
    : claim('open_file', surface, shown, span, F(`the ${file}-file is ${real} after ${mv.san}, the text says ${kind}`))
}

function checkDoubled(att, file, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('doubled_pawns', surface, shown, span, F('the move does not replay'))
  const n = pawnsOnFile(mv.board, mv.color, file.charCodeAt(0) - 97)
  return n >= 2
    ? claim('doubled_pawns', surface, shown, span, T(`${n} of the mover's pawns on the ${file}-file`))
    : claim('doubled_pawns', surface, shown, span, F(`${n} of the mover's pawn(s) on the ${file}-file after ${mv.san}`))
}

function checkIsolated(att, file, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('isolated_pawn', surface, shown, span, F('the move does not replay'))
  const f = file.charCodeAt(0) - 97
  const here = pawnsOnFile(mv.board, mv.color, f)
  const near = (f > 0 ? pawnsOnFile(mv.board, mv.color, f - 1) : 0) + (f < 7 ? pawnsOnFile(mv.board, mv.color, f + 1) : 0)
  if (!here) return claim('isolated_pawn', surface, shown, span, F(`no pawn of the mover's on the ${file}-file`))
  return near === 0
    ? claim('isolated_pawn', surface, shown, span, T(`the ${file}-pawn has no neighbour`))
    : claim('isolated_pawn', surface, shown, span, F(`the ${file}-pawn has ${near} neighbouring pawn(s)`))
}

/** "pressure on the king's shelter: N of the squares around it are now attacked": N is the count of the eight squares round the enemy king that the mover attacks. */
function checkShelter(att, n, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('shelter', surface, shown, span, F('the move does not replay'))
  const b = mv.board
  const king = findKing(b, other(mv.color))
  if (!king) return claim('shelter', surface, shown, span, U('no king'))
  const kf = king.charCodeAt(0) - 97
  const kr = +king[1] - 1
  let hit = 0
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (!df && !dr) continue
      const f = kf + df
      const r = kr + dr
      if (f < 0 || f > 7 || r < 0 || r > 7) continue
      if (b.attackers(String.fromCharCode(97 + f) + (r + 1), mv.color).length) hit++
    }
  }
  return hit === n
    ? claim('shelter', surface, shown, span, T(`${hit} squares round the king are attacked`))
    : claim('shelter', surface, shown, span, F(`${hit} squares round the king are attacked, the text says ${n}`))
}

/** The rook lands on the seventh (for Black the second) rank and hits each named enemy pawn. */
function checkSeventh(att, squares, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('seventh_rank', surface, shown, span, F('the move does not replay'))
  if (mv.piece !== 'r' || mv.to[1] !== (mv.color === 'w' ? '7' : '2')) return claim('seventh_rank', surface, shown, span, F(`${mv.san} does not land a rook on the seventh rank`))
  for (const sq of squares) {
    const cell = mv.board.get(sq)
    if (!cell || cell.type !== 'p' || cell.color !== other(mv.color)) return claim('seventh_rank', surface, shown, span, F(`no enemy pawn on ${sq}`))
    if (!mv.board.attackers(sq, mv.color).includes(mv.to)) return claim('seventh_rank', surface, shown, span, F(`the rook on ${mv.to} does not hit ${sq}`))
  }
  return claim('seventh_rank', surface, shown, span, T(`${mv.san} is on the seventh rank and hits ${squares.length} pawn(s)`))
}

function pawnAt(b, f, r, color) {
  const cell = b.get(String.fromCharCode(97 + f) + (r + 1))
  return !!cell && cell.type === 'p' && cell.color === color
}

/** An outpost: a guarded knight or bishop that no enemy pawn on a neighbouring file can come to attack. */
function checkOutpost(att, pieceType, sq, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('outpost', surface, shown, span, F('the move does not replay'))
  const b = mv.board
  const cell = b.get(sq)
  if (!cell || cell.type !== pieceType || cell.color !== mv.color) return claim('outpost', surface, shown, span, F(`no ${WORD_OF_TYPE[pieceType]} of the mover's on ${sq}`))
  const f = sq.charCodeAt(0) - 97
  const r = +sq[1] - 1
  const back = mv.color === 'w' ? r - 1 : r + 1
  const guarded = [f - 1, f + 1].some((ff) => ff >= 0 && ff <= 7 && back >= 0 && back <= 7 && pawnAt(b, ff, back, mv.color))
  if (!guarded) return claim('outpost', surface, shown, span, F(`no pawn guards ${sq}`))
  for (const ff of [f - 1, f + 1]) {
    if (ff < 0 || ff > 7) continue
    for (let rr = 0; rr < 8; rr++) {
      if (pawnAt(b, ff, rr, other(mv.color)) && (mv.color === 'w' ? rr > r : rr < r)) return claim('outpost', surface, shown, span, F(`an enemy pawn can still come to attack ${sq}`))
    }
  }
  return claim('outpost', surface, shown, span, T(`${sq} is guarded and no enemy pawn can attack it`))
}

/** "a pawn break: the X-pawn strikes at S": a pawn of the mover on that file attacks S, which an enemy piece holds. */
function checkPawnBreak(att, file, sq, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('pawn_break', surface, shown, span, F('the move does not replay'))
  const cell = mv.board.get(sq)
  if (!cell || cell.color !== other(mv.color)) return claim('pawn_break', surface, shown, span, F(`no enemy piece on ${sq}`))
  const strikes = mv.board.attackers(sq, mv.color).some((s) => s[0] === file && mv.board.get(s)?.type === 'p')
  return strikes
    ? claim('pawn_break', surface, shown, span, T(`the ${file}-pawn strikes ${sq}`))
    : claim('pawn_break', surface, shown, span, F(`no ${file}-pawn of the mover strikes ${sq}`))
}

/** "the N on S is not safe on S: the capture there wins it": the piece is attacked and undefended, or the cheapest attacker is worth less. */
function checkHangs(att, pieceType, sq, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('hangs', surface, shown, span, F('the move does not replay'))
  const b = mv.board
  const cell = b.get(sq)
  if (!cell || cell.type !== pieceType || cell.color !== other(mv.color)) return claim('hangs', surface, shown, span, F(`no ${WORD_OF_TYPE[pieceType]} of ${SIDE_NAME[other(mv.color)]} on ${sq}`))
  const attackers = b.attackers(sq, mv.color)
  if (!attackers.length) return claim('hangs', surface, shown, span, F(`${sq} is not attacked`))
  const defended = b.attackers(sq, other(mv.color)).length > 0
  const cheapest = Math.min(...attackers.map((s) => VALUE[b.get(s)?.type ?? 'k']))
  return !defended || cheapest < VALUE[pieceType]
    ? claim('hangs', surface, shown, span, T(`the ${WORD_OF_TYPE[pieceType]} on ${sq} is lost to a capture`))
    : claim('hangs', surface, shown, span, F(`the ${WORD_OF_TYPE[pieceType]} on ${sq} is defended and the capture does not win it`))
}

function isPassed(b, sq, color) {
  const f = sq.charCodeAt(0) - 97
  const r = +sq[1] - 1
  for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
    for (let rr = 0; rr < 8; rr++) {
      const ahead = color === 'w' ? rr > r : rr < r
      if (ahead && pawnAt(b, ff, rr, other(color))) return false
    }
  }
  return true
}

function checkPassed(att, sq, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('passed_pawn', surface, shown, span, F('the move does not replay'))
  const cell = mv.board.get(sq)
  if (!cell || cell.type !== 'p' || cell.color !== mv.color) return claim('passed_pawn', surface, shown, span, F(`no pawn of the mover's on ${sq}`))
  return isPassed(mv.board, sq, mv.color)
    ? claim('passed_pawn', surface, shown, span, T(`${sq} is passed`))
    : claim('passed_pawn', surface, shown, span, F(`${sq} is not a passed pawn`))
}

function checkPassedFile(att, file, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('passed_pawn', surface, shown, span, F('the move does not replay'))
  for (let r = 1; r <= 8; r++) {
    const sq = file + r
    const cell = mv.board.get(sq)
    if (cell && cell.type === 'p' && cell.color === mv.color && isPassed(mv.board, sq, mv.color)) return claim('passed_pawn', surface, shown, span, T(`the ${file}-pawn on ${sq} is passed`))
  }
  return claim('passed_pawn', surface, shown, span, F(`no passed pawn of the mover's on the ${file}-file`))
}

/** "it delivers double check": two of the mover's pieces give check. */
function checkDoubleCheck(att, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('check', surface, shown, span, F('the move does not replay'))
  const king = findKing(mv.board, other(mv.color))
  const n = king ? mv.board.attackers(king, mv.color).length : 0
  return n >= 2
    ? claim('check', surface, shown, span, T(`${n} pieces give check`))
    : claim('check', surface, shown, span, F(`${n} piece(s) give check`))
}

/** "bishop takes knight, and the bishop pair goes with it once they recapture": the bishop takes a knight and is recaptured. */
function checkBishopPairTake(att, span, shown, surface) {
  const mv = att.mv
  if (!mv || mv.piece !== 'b' || mv.captured !== 'n') return claim('trades', surface, shown, span, F(`${att.mv ? att.mv.san : att.uci} is not a bishop taking a knight`))
  return recaptured(mv)
    ? claim('trades', surface, shown, span, T(`${mv.san} takes the knight and is recaptured`))
    : claim('trades', surface, shown, span, F(`${mv.san} is not recaptured`))
}

/** "a piece is attacked" (the threat): the best move's piece attacks an enemy piece other than the king. */
function checkThreatens(att, span, shown, surface) {
  const mv = att.mv
  if (!mv) return claim('attacks', surface, shown, span, F('the move does not replay'))
  const victim = other(mv.color)
  for (const row of mv.board.board()) for (const c of row) {
    if (c && c.color === victim && c.type !== 'k' && mv.board.attackers(c.square, mv.color).includes(mv.to)) {
      return claim('attacks', surface, shown, span, T(`${mv.san} attacks the ${WORD_OF_TYPE[c.type]} on ${c.square}`))
    }
  }
  return claim('attacks', surface, shown, span, F(`${mv.san} attacks no enemy piece other than the king`))
}

/**
 * "X comes in the engine's line too, a move (two moves) later": the best line
 * plays the played move at the mover's next (second) turn, and the quoted line,
 * when given, is the best line up to it.
 */
function checkLater(M, when, sans, e) {
  const k = when === 'a move' ? 2 : 4
  if (M.bestPv[k] !== M.playedUci) return claim('move_order', e.surface, e.shown, e.whole, F(`the best line does not play ${M.san} ${when} later`))
  if (sans) {
    const r = sansToUcis(M.F0, sans)
    if (r.illegalAt !== null) return claim('move_order', e.surface, e.shown, e.whole, F(`the quoted line stops being legal at "${sans[r.illegalAt]}"`))
    if (r.ucis.length !== k + 1 || r.ucis.some((u, i) => u !== M.bestPv[i])) return claim('move_order', e.surface, e.shown, e.whole, F('the quoted line is not the best line up to the move'))
  }
  return claim('move_order', e.surface, e.shown, e.whole, T(`the best line plays ${M.san} at ply ${k + 1}`))
}

/**
 * An answer to "why not just take it?": "if they take it with X, [M1 M2 ..., then] Y ...".
 * "It" is the piece the better move moved (the best line, or a searched capture
 * of it) or the reply moved (the played line). The text's moves must be the
 * engine line's moves, from X on, and the claim at Y must hold on the board: a
 * mate; a piece taken on a square; a recapture that wins the taker's piece for
 * the one it took, with no recapture after it; or the material once the
 * exchange is over: "have won N" counted from before the move, "are N up" the
 * balance on the board, for the side named.
 */
function checkTakeAnswer(g, e) {
  const [who, x, lead, y, isMate, backWho, backVerb, backAmt, winP, forQ, takesP, takesSq, afterWho, z, upWho, upVerb, upAmt] = g
  const { M, surface, shown, whole } = e
  void who
  const contexts = []
  if (M.attBest?.mv) contexts.push({ fen: M.attBest.mv.afterFen, sq: M.attBest.mv.to, lines: [M.bestPv.slice(1), ...M.probes] })
  if (M.attReply?.mv) contexts.push({ fen: M.attReply.mv.afterFen, sq: M.attReply.mv.to, lines: [M.lineUcis.slice(2)] })
  const sans = [x, ...(lead ? lead.trim().split(/\s+/) : []), y]
  let reason = `${x} does not take the piece the move put there`
  for (const ctx of contexts) {
    const first = resolveSan(ctx.fen, x)
    if (!first.ok) continue
    const take = moveAt(ctx.fen, first.uci)
    if (!take || take.to !== ctx.sq || !take.captured) continue
    reason = `no engine line here plays ${x} ${sans.slice(1).join(' ')}`
    for (const line of ctx.lines.filter((l) => l[0] === first.uci)) {
      const r = sansToUcis(ctx.fen, sans)
      if (r.illegalAt !== null || r.ucis.some((u, i) => u !== line[i])) continue
      // Replay the text's moves; `at` is Y, `next` the line's move after it.
      const game = load(ctx.fen)
      let at = null
      for (const u of r.ucis) at = playUci(game, u)
      const afterY = game.fen()
      const nextUci = line[r.ucis.length] ?? null
      const next = nextUci ? moveAt(afterY, nextUci) : null
      const sideOf = (word) => (word === 'you' ? M.pov : other(M.pov))
      const upBy = (word, verb, amt, g2) => {
        const want = parseMaterialPhrase(amt)
        const side = sideOf(word)
        const got = verb === 'are' ? balance(g2, side) : balance(g2, side) - balance(load(M.F0), side)
        return want && got >= want.min && got <= want.max ? null : verb === 'are' ? `${SIDE_NAME[side]} is ${got} up on the board there, not ${amt}` : `${SIDE_NAME[side]} has won ${got} there, not ${amt}`
      }
      let bad = null
      if (isMate) bad = game.isCheckmate() ? null : `${y} is not mate`
      else if (backAmt) {
        bad = at.to !== take.to || !at.captured ? `${y} does not take back on ${take.to}` : upBy(backWho, backVerb, backAmt, game)
      } else if (winP) {
        if (at.to !== take.to || !at.captured) bad = `${y} does not take back on ${take.to}`
        else if (take.piece !== TYPE_OF_WORD[winP] || take.captured !== TYPE_OF_WORD[forQ]) bad = `${x} is a ${WORD_OF_TYPE[take.piece]} taking a ${WORD_OF_TYPE[take.captured]}`
        else if (VALUE[take.piece] <= VALUE[take.captured]) bad = `a ${winP} for a ${forQ} wins nothing`
        else if (next && next.captured && next.to === take.to) bad = `${next.san} takes back on ${take.to}`
      } else if (takesP) {
        if (!at.captured || at.captured !== TYPE_OF_WORD[takesP] || at.to !== takesSq) bad = `${y} does not take a ${takesP} on ${takesSq}`
        else if (afterWho !== undefined) {
          if (!next || !next.captured || next.to !== at.to) bad = `nothing takes back on ${at.to} after ${y}`
          else if (z && next.san !== z) bad = `the line takes back with ${next.san}, not ${z}`
          else bad = upBy(upWho, upVerb, upAmt, next.board)
        } else if (upAmt) bad = upBy(upWho, upVerb, upAmt, game)
      }
      return [claim('take_answer', surface, shown, whole, bad ? F(bad) : T(`${sans.join(' ')} is the engine line, and it holds`))]
    }
  }
  return [claim('take_answer', surface, shown, whole, F(reason))]
}

/**
 * Whether `defense` lands between the bishop, rook or queen the better move
 * moved (`best`) and a piece of the defender's that it attacks along that
 * line: the squares from the slider to the block are empty, and the first
 * piece behind the block is the defender's.
 */
function blocksSlider(board, best, defense) {
  if (!'brq'.includes(best.piece)) return false
  const fx = best.to.charCodeAt(0) - 97, fy = +best.to[1] - 1
  const tx = defense.to.charCodeAt(0) - 97, ty = +defense.to[1] - 1
  const straight = fx === tx || fy === ty
  const diagonal = Math.abs(tx - fx) === Math.abs(ty - fy)
  if ((!straight && !diagonal) || (fx === tx && fy === ty)) return false
  if ((straight && best.piece === 'b') || (!straight && best.piece === 'r')) return false
  const dx = Math.sign(tx - fx), dy = Math.sign(ty - fy)
  let past = false
  for (let x = fx + dx, y = fy + dy; x >= 0 && x < 8 && y >= 0 && y < 8; x += dx, y += dy) {
    const sq = String.fromCharCode(97 + x) + (y + 1)
    if (sq === defense.to) {
      past = true
      continue
    }
    const cell = board.get(sq)
    if (cell) return past && cell.color === defense.color
  }
  return false
}

/**
 * An answer to "what if they just defend?": "if they move the X (D), M1 M2
 * ..., and you have won N", "if they block with D, ...", or the mate form
 * "if ..., [M1 M2 ..., then] Y is mate". D is played after the better move:
 * it is legal there, it is the defender's move, and it moves the piece named
 * from a square the better move's side attacks, or it lands between the
 * better move's bishop, rook or queen and a piece of the defender's that the
 * slider attacks along that line. The text's moves must be an engine line's
 * moves after D (the best line, or the searched defense), and the claim must
 * hold where they end: a mate, or the material counted from before the
 * better move for the side named, with the line's next move not a capture.
 */
function checkDefenseAnswer(g, e) {
  const [who, piece, moved, blocked, mateLead, mateY, line, wonWho, amt] = g
  const { M, surface, shown, whole } = e
  const no = (reason) => [claim('defense_answer', surface, shown, whole, F(reason))]
  const best = M.attBest?.mv
  if (!best) return no('no better move for a defense to answer')
  const token = moved ?? blocked
  const d = resolveSan(best.afterFen, token)
  if (!d.ok) return no(d.reason)
  const defense = moveAt(best.afterFen, d.uci)
  const sideOf = (word) => (word === 'you' ? M.pov : other(M.pov))
  if (defense.color !== sideOf(who)) return no(`${token} is ${SIDE_NAME[defense.color]}'s move, not ${who === 'you' ? 'yours' : 'theirs'}`)
  const board = load(best.afterFen)
  if (moved) {
    if (defense.piece !== TYPE_OF_WORD[piece]) return no(`${token} moves a ${WORD_OF_TYPE[defense.piece]}, not the ${piece}`)
    if (!board.isAttacked(defense.from, best.color)) return no(`nothing attacks the ${piece} on ${defense.from} after ${best.san}`)
  } else if (!blocksSlider(board, best, defense)) return no(`${token} does not block the ${WORD_OF_TYPE[best.piece]} on ${best.to}`)
  const sans = line ? line.trim().split(/\s+/) : [...(mateLead ? mateLead.trim().split(/\s+/) : []), mateY]
  const r = sansToUcis(defense.afterFen, sans)
  if (r.illegalAt !== null) return no(`the line after ${token} stops being legal at "${sans[r.illegalAt]}"`)
  const hit = [M.bestPv.slice(1), ...M.defenses].find((l) => l[0] === d.uci && r.ucis.every((u, i) => u === l[i + 1]))
  if (!hit) return no(`no engine line here plays ${token} ${sans.join(' ')}`)
  const game = load(defense.afterFen)
  for (const u of r.ucis) playUci(game, u)
  let bad = null
  if (mateY) bad = game.isCheckmate() ? null : `${mateY} is not mate`
  else {
    const want = parseMaterialPhrase(amt)
    const side = sideOf(wonWho)
    const got = balance(game, side) - balance(load(M.F0), side)
    const nextUci = hit[r.ucis.length + 1] ?? null
    const next = nextUci ? moveAt(game.fen(), nextUci) : null
    if (!want || got < want.min || got > want.max) bad = `${SIDE_NAME[side]} has won ${got} there, not ${amt}`
    else if (next?.captured) bad = `the line goes on with ${next.san}, a capture`
  }
  return [claim('defense_answer', surface, shown, whole, bad ? F(bad) : T(`${token} ${sans.join(' ')} is the engine line, and it holds`))]
}

// ---------------------------------------------------------------- clauses

/** The attacked pieces in an "attacks ..." list: "the pawn on f7 (undefended) and the knight on c3". */
function attackItems(list) {
  const out = []
  const re = /(?:(?:their|your|the) )?(pawn|knight|bishop|rook|queen|king) on ([a-h][1-8])( \(undefended\))?/g
  let m
  while ((m = re.exec(list))) out.push({ type: TYPE_OF_WORD[m[1]], sq: m[2], undefended: !!m[3], span: m[0] })
  return out
}

/**
 * Every clause the templates write about one move, each checked on that move.
 * `attOf(index)` says which move a clause at that index is about. Returns the
 * claims and the text with the matched clauses blanked out.
 */
function clauseClaims(text, attOf, surface, shown) {
  const attAt = typeof attOf === 'function' ? attOf : () => attOf
  const claims = []
  let rest = text
  const take = (re, run) => {
    rest = rest.replace(re, (whole, ...tail) => {
      const offset = tail[tail.length - 2]
      const groups = tail.slice(0, -2)
      const made = run(groups, whole, attAt(offset))
      for (const x of [].concat(made ?? []).flat()) if (x && x.type) claims.push(x)
      return ' '.repeat(whole.length)
    })
  }
  // A mate the move gives, or the reply gives.
  take(/\bit is checkmate\b/g, (_g, whole, att) => claim('mate_move', surface, shown, whole, att.mv && att.mv.board.isCheckmate() ? T(`${att.mv.san} is checkmate`) : F(`${att.mv ? att.mv.san : att.uci} is not checkmate`)))
  take(/\bit forces mate in (\d+)\b/g, ([n], whole, att) => claim('mate', surface, shown, whole, checkMate(att.mover, +n, att.fen, att.mateLine, att.mateScore), { n: +n }))
  take(new RegExp(String.raw`\bit threatens mate with ([^\s,.;:()]+)`, 'g'), ([tok], whole, att) => checkThreatMate(att, tok, whole, shown, surface))
  take(new RegExp(String.raw`\b(?:it )?wins the ${PIECE} outright\b`, 'g'), ([p], whole, att) => checkWins(att, TYPE_OF_WORD[p], whole, shown, surface, { outright: true }))
  take(new RegExp(String.raw`\b(?:it )?wins the ${PIECE} for the ${PIECE}\b`, 'g'), ([p, by], whole, att) => checkWins(att, TYPE_OF_WORD[p], whole, shown, surface, { forPiece: TYPE_OF_WORD[by] }))
  take(new RegExp(String.raw`\bbishop takes knight, and the bishop pair (?:goes with it|passes to them) once they recapture\b`, 'g'), (_g, whole, att) => checkBishopPairTake(att, whole, shown, surface))
  take(new RegExp(String.raw`\b(?:it )?trades off the ${PIECE}\b`, 'g'), ([p], whole, att) => checkTrade(att, TYPE_OF_WORD[p], whole, shown, surface))
  take(new RegExp(String.raw`\btakes the ${PIECE}, and nothing takes back\b`, 'g'), ([p], whole, att) => checkNothingBack(att, TYPE_OF_WORD[p], whole, shown, surface))
  take(new RegExp(String.raw`\b(?:it )?takes the ${PIECE} back\b`, 'g'), ([p], whole, att) => checkTakesBack(att, TYPE_OF_WORD[p], whole, shown, surface))
  take(/\b(?:it )?comes with check\b/g, (_g, whole, att) => checkCheck(att, whole, shown, surface))
  take(/\bit delivers double check, and only a king move answers it\b/g, (_g, whole, att) => checkDoubleCheck(att, whole, shown, surface))
  take(/\bforks ((?:(?:your|their|the) )?(?:king|queen|rook|bishop|knight|pawn)(?: on [a-h][1-8])?(?:, (?:(?:your|their|the) )?(?:king|queen|rook|bishop|knight|pawn)(?: on [a-h][1-8])?)*(?: and (?:(?:your|their|the) )?(?:king|queen|rook|bishop|knight|pawn)(?: on [a-h][1-8])?)?)/g, ([list], whole, att) => checkFork(att, list, whole, shown, surface))
  take(/\bgets the king safe\b/g, (_g, whole, att) =>
    att.mv && (att.mv.flags.includes('k') || att.mv.flags.includes('q'))
      ? claim('castles', surface, shown, whole, T(`${att.mv.san} castles`))
      : claim('castles', surface, shown, whole, F(`${att.mv ? att.mv.san : att.uci} is not a castle`)))
  take(/\bpromotes(?: to a (queen|rook|bishop|knight) on ([a-h][1-8]))?\b/g, ([p, sq], whole, att) => checkPromotes(att, p, sq, whole, shown, surface))
  take(new RegExp(String.raw`\bopens an attack on (?:(?:their|your) )?${PIECE} on ${SQ}\b`, 'g'), ([p, sq], whole, att) => checkAttack(att, TYPE_OF_WORD[p], sq, false, whole, shown, surface))
  take(new RegExp(String.raw`\b(?:it )?attacks (${ATTACK_ITEM}(?: and ${ATTACK_ITEM})?)`, 'g'), ([list], whole, att) => attackItems(list).map((it) => checkAttack(att, it.type, it.sq, it.undefended, it.span, shown, surface)))
  // Pins: the pinner named first, then the forms without it.
  take(new RegExp(String.raw`\b(rook|bishop|knight|queen|pawn) pins the ${PIECE} on ${SQ} (?:against|to) the ${PIECE}\b${RESTRAINT}`, 'g'), ([pinner, p, sq, target], whole, att) =>
    checkPin(att, p, sq, target === 'king' ? null : target, whole, shown, surface, pinner))
  take(new RegExp(String.raw`\bpins the ${PIECE} on ${SQ} (?:against|to) the ${PIECE}(?: on [a-h][1-8])?(?: behind it)?${RESTRAINT}`, 'g'), ([p, sq, target], whole, att) =>
    checkPin(att, p, sq, target === 'king' ? null : target, whole, shown, surface))
  take(new RegExp(String.raw`\bpins the ${PIECE} on ${SQ} to the king\b${RESTRAINT}`, 'g'), ([p, sq], whole, att) => checkPin(att, p, sq, null, whole, shown, surface))
  take(/\b(?:the )?(\w+) and (\w+) are doubled on the ([^:]+): a battery/g, ([w1, w2, line], whole, att) => checkBattery(att, w1, w2, line, whole, shown, surface))
  take(/\b(?:the )?(\w+)s are doubled on the ([^:]+): a battery/g, ([w, line], whole, att) => checkBattery(att, w, w, line, whole, shown, surface))
  take(new RegExp(String.raw`\bthe ${PIECE} takes the (open|half-open) ([a-h])-file\b`, 'g'), ([_p, kind, f], whole, att) => checkOpenFile(att, kind, f, whole, shown, surface))
  take(/\bthis doubles the ([a-h])-pawns\b/g, ([f], whole, att) => checkDoubled(att, f, whole, shown, surface))
  take(/\bthe ([a-h])-pawn is isolated now\b[^.]*/g, ([f], whole, att) => checkIsolated(att, f, whole, shown, surface))
  take(/\bpressure on the king's shelter: (\d+) of the squares around it are now attacked\b/g, ([n], whole, att) => checkShelter(att, +n, whole, shown, surface))
  take(/\bthe rook lands on the seventh rank, hitting the pawns? on ((?:[a-h][1-8] ?)+?)(?: and boxing the king in)?(?=[.,;:]|$)/g, ([sqs], whole, att) => checkSeventh(att, sqs.trim().split(/\s+/), whole, shown, surface))
  take(/\bthe rook lands on the seventh rank and boxes the king in on its back rank\b/g, (_g, whole, att) => checkSeventh(att, [], whole, shown, surface))
  take(new RegExp(String.raw`\bthe (knight|bishop) settles on ${SQ}: a pawn-guarded outpost, and no enemy pawn is placed to attack it\b`, 'g'), ([p, sq], whole, att) => checkOutpost(att, TYPE_OF_WORD[p], sq, whole, shown, surface))
  take(new RegExp(String.raw`\ba pawn break: the ([a-h])-pawn strikes at ${SQ}\b[^.]*`, 'g'), ([f, sq], whole, att) => checkPawnBreak(att, f, sq, whole, shown, surface))
  take(new RegExp(String.raw`\bthe ${PIECE} is not safe on ${SQ}: the capture there wins it\b`, 'g'), ([p, sq], whole, att) => checkHangs(att, TYPE_OF_WORD[p], sq, whole, shown, surface))
  take(new RegExp(String.raw`\bthe ${PIECE} is not safe on ${SQ}: the exchanges there come out \d+ ahead for them\b`, 'g'), (_g, whole) => claim('exchange', surface, shown, whole, U('exchange count after the capture: not checked')))
  take(new RegExp(String.raw`\bthis leaves the ${PIECE} on ${SQ} standing to be taken\b`, 'g'), ([p, sq], whole, att) => checkHangs(att, TYPE_OF_WORD[p], sq, whole, shown, surface))
  take(new RegExp(String.raw`\bcreates a passed pawn on ${SQ}\b`, 'g'), ([sq], whole, att) => checkPassed(att, sq, whole, shown, surface))
  take(/\bthe ([a-h])-pawn is passed(?: by structure)?(?:: no enemy pawn stands in its way or beside its path to [a-h][1-8])?/g, ([f], whole, att) => checkPassedFile(att, f, whole, shown, surface))
  take(new RegExp(String.raw`\bthe ${PIECE} on ${SQ} is trapped\b[^.]*`, 'g'), (_g, whole) => claim('trapped', surface, shown, whole, U('trapped piece: not checked')))
  take(new RegExp(String.raw`\b(?:it |${PIECE} )?skewers the ${PIECE}(?: on ${SQ})?(?:,| and|:)[^.]*`, 'g'), (_g, whole) => claim('skewer', surface, shown, whole, U('skewer: not checked')))
  take(/\bit uncovers a discovered (?:check|attack)[^.]*/g, (_g, whole) => claim('discovered', surface, shown, whole, U('discovered line: not checked')))
  take(new RegExp(String.raw`\bit forms a battery with the ${PIECE} on ${SQ} down the [^,]+?, aimed at the ${PIECE}`, 'g'), (_g, whole) => claim('battery', surface, shown, whole, U('tactic battery: not checked')))
  return { claims, rest }
}

// ---------------------------------------------------------------- moment context

/**
 * What a moment's texts refer to: the played move, the best move, the reply the
 * played move allows, and the engine lines. Each move is an attachment that
 * carries the line and score that count its mate.
 */
function momentContext(c) {
  const F0 = c.fenBefore
  const mover = c.mover
  const L = c.texts?.lessonFor ?? null
  const playedUci = c.uci
  const bestUci = c.bestUci || null
  const playedLine = L?.allowed?.line ? sansToUcis(F0, L.allowed.line.split(' ')) : { ucis: [], illegalAt: null, reason: null }
  const played = moveAt(F0, playedUci)
  const F1 = played ? played.afterFen : null
  const reply = L?.allowed?.san && F1 ? resolveSan(F1, L.allowed.san) : null
  const replyUci = reply && reply.ok ? reply.uci : null
  const bestPv = Array.isArray(c.bestPvUci) ? c.bestPvUci : []
  const sameAsBest = bestUci === playedUci
  const attPlayed = attachment(F0, playedUci, playedLine.ucis, sameAsBest ? c.before : null)
  const attBest = bestUci ? attachment(F0, bestUci, bestPv, c.before) : null
  const attReply = replyUci && F1 ? attachment(F1, replyUci, playedLine.ucis.slice(1), c.after) : null
  const M = {
    F0,
    F1,
    mover,
    san: c.san,
    playedUci,
    bestSan: c.bestSan,
    bestUci,
    before: c.before,
    after: c.after,
    sameAsBest,
    replySan: L?.allowed?.san ?? null,
    replyUci,
    lineUcis: playedLine.ucis,
    bestPv,
    // The searched captures of the best move (probes.mjs): lines from the position after it.
    probes: Array.isArray(c.probes) ? c.probes.map((p) => p.pv) : [],
    // The searched natural defenses to the best move's threat (defenses.mjs): lines from the position after it.
    defenses: Array.isArray(c.defenses) ? c.defenses.map((d) => d.pv) : [],
    pov: c.playerColor ?? mover,
    attPlayed,
    attBest,
    attReply,
    playedRead: playedLine.ucis.length ? windowRead(F0, playedLine.ucis, mover) : null,
    bestRead: bestPv.length ? windowRead(F0, bestPv, mover) : null,
    // The engine line's material over the lesson's window, as the app read it: the played line
    // beyond the 7 plies the lesson shows, and the best line (checked against the replay below).
    playedNetStored: typeof L?.allowed?.material === 'number' ? L.allowed.material : null,
    bestNetStored: typeof L?.better?.material === 'number' ? L.better.material : null,
  }
  M.bestNetAgrees = M.bestRead && M.bestNetStored !== null ? M.bestRead.net === M.bestNetStored : null
  /** The attachment of any move the text names, by where it is played from. */
  M.attFor = (fen, uci) => {
    if (fen === F0 && uci === playedUci) return attPlayed
    if (fen === F0 && uci === bestUci && attBest) return attBest
    if (fen === F1 && uci === replyUci && attReply) return attReply
    return attachment(fen, uci, [], null)
  }
  return M
}

// ---------------------------------------------------------------- mentions

/** Words that put a square or a piece in front of a token: "on e4", "the b5 pawn". */
const NOT_A_MOVE_BEFORE = new Set(['on', 'the', 'against', 'to', 'at', 'from', 'behind', 'of', 'a', 'an', 'its', 'your', 'their', 'and', 'or', 'is', 'was', 'with', 'for'])

/**
 * The moves a text names, by position: a token that is the played move, the
 * best move, the reply, or any legal move from either position. A clause is
 * about the last move named before it, so "Y was the answer to X, and it ..."
 * is answered by the templates that handle that shape.
 */
function findMentions(text, M) {
  const out = []
  const re = /[^\s,:()]+/g
  let m
  let prev = ''
  let prev2 = ''
  while ((m = re.exec(text))) {
    const tok = m[0].replace(/\.+$/, '')
    // "A concrete feature of Nd5: it ..." names the move its clause is about.
    const featureOf = prev.toLowerCase() === 'of' && prev2.toLowerCase() === 'feature'
    if (tok && (featureOf || !NOT_A_MOVE_BEFORE.has(prev.toLowerCase()))) {
      const att = attForToken(tok, M)
      if (att) out.push({ idx: m.index, att })
    }
    prev2 = prev
    prev = tok
  }
  return out
}

function attForToken(tok, M) {
  if (tok === M.san) return M.attPlayed
  if (tok === M.bestSan && M.attBest) return M.attBest
  if (tok === M.replySan && M.attReply) return M.attReply
  if (!/^[KQRBNa-hO0-9x=+#-]+$/.test(tok)) return null
  const a = resolveSan(M.F0, tok)
  if (a.ok) return M.attFor(M.F0, a.uci)
  if (M.F1) {
    const b = resolveSan(M.F1, tok)
    if (b.ok) return M.attFor(M.F1, b.uci)
  }
  return null
}

// ---------------------------------------------------------------- templates

/**
 * Runs the templates over a field, in order. Each template matches a whole
 * shape (a mate sentence, "X allows Y, and ...") and returns its claims; the
 * matched text is blanked so later templates do not read it again. A template
 * that returns null leaves its text in place.
 */
function applyTemplates(text, templates, M, surface, shown) {
  const claims = []
  let rest = text
  const env = {
    M,
    surface,
    shown,
    san: (tok, fen, uci = null) => checkSan(tok, fen, shown, surface, uci),
    mate: (side, n, fen, ucis, score, span) => claim('mate', surface, shown, span, checkMate(side, n, fen, ucis, score), { n }),
    clauses: (t, att) => clauseClaims(t, att, surface, shown).claims,
    lineOf: (t, fen) => (t ? sansToUcis(fen, t.split(' ')).ucis : null),
    amount: (phrase, sign, span, read) => materialAmount(phrase, sign, span, read, surface, shown),
    presence: (fen, ucis, piece, sq, byColour, span) => materialPresence(fen, ucis, piece, sq, byColour, span, surface, shown),
    played: (phrase, expectSign, span) => playedMaterial(M, phrase, expectSign, span, surface, shown),
    playedNoGain: (span) => playedNoGain(M, span, surface, shown),
    diff: (phrase, sign, span) => lineDiffClaim(M, phrase, sign, span, surface, shown),
    diffBelow: (span) => lineDiffClaim(M, null, -1, span, surface, shown),
    diffAbove: (span) => lineGainClaim(M, span, surface, shown),
  }
  for (const t of templates) {
    rest = rest.replace(t.re, (whole, ...tail) => {
      const groups = tail.slice(0, -2)
      const made = t.run(groups, { ...env, whole })
      if (made === null) return whole
      for (const x of [].concat(made ?? []).flat()) if (x && x.type) claims.push(x)
      return ' '.repeat(whole.length)
    })
  }
  return { claims, rest }
}

/**
 * The gap the lesson words as "gives up N": the best line's material change
 * minus the played line's, the same difference the app computes. With no
 * phrase, the claim is "the gap is at least one point down".
 */
function lineDiffClaim(M, phrase, sign, span, surface, shown) {
  if (!M.bestRead || M.playedNetStored === null) return claim('material', surface, shown, span, U('no best line or no stored played net'))
  const diff = M.bestRead.net - M.playedNetStored
  if (phrase === null) return claim('material', surface, shown, span, diff <= -1 ? T(`best minus played: ${diff}`) : F(`best minus played is ${diff}, not a loss`))
  const want = parseMaterialPhrase(phrase)
  if (!want) return claim('material', surface, shown, span, U(`amount "${phrase}" not recognised`))
  const amount = diff * sign
  return amount >= want.min && amount <= want.max
    ? claim('material', surface, shown, span, T(`best minus played: ${diff}`))
    : claim('material', surface, shown, span, F(`best minus played is ${diff}, the text says ${phrase}`))
}

/** "the threat wins more material than X": the best line's material change exceeds the played line's by a point or more. */
function lineGainClaim(M, span, surface, shown) {
  if (!M.bestRead || M.playedNetStored === null) return claim('material', surface, shown, span, U('no best line or no stored played net'))
  const diff = M.bestRead.net - M.playedNetStored
  return diff >= 1
    ? claim('material', surface, shown, span, T(`best minus played: +${diff}`))
    : claim('material', surface, shown, span, F(`best minus played is ${diff}, not a gain`))
}

/** "A capture with check", "A capture", "A check": what the played move is. */
function checkForcing(att, kind, span, shown, surface) {
  const mv = att?.mv
  if (!mv) return claim('forcing', surface, shown, span, F('the move does not replay'))
  const is = mv.captured ? (mv.board.inCheck() ? 'A capture with check' : 'A capture') : mv.board.inCheck() ? 'A check' : 'a quiet move'
  return is === kind ? claim('forcing', surface, shown, span, T(`${mv.san} is ${kind.toLowerCase()}`)) : claim('forcing', surface, shown, span, F(`${mv.san} is ${is.toLowerCase()}, not ${kind.toLowerCase()}`))
}

/**
 * "The material is not compared: the engine's line after X is too short, and
 * the engine's line after Y stops in the middle of a forcing sequence". A short
 * line has fewer than two plies; an open one is not settled at its window's
 * end. The played line beyond the plies the case shows is not in the case.
 */
function notComparedClaims(body, e) {
  const out = []
  const part = new RegExp(String.raw`the engine's lines? after ${TOKR}(?: and ${TOKR})? (?:is|are) (too short)|the engine's lines? after ${TOKR}(?: and ${TOKR})? stops? in the middle of a (forcing sequence)`, 'g')
  let m
  while ((m = part.exec(body))) {
    const short = !!m[3]
    const toks = short ? [m[1], m[2]] : [m[4], m[5]]
    for (const tok of toks.filter(Boolean)) {
      const isPlayed = tok === e.M.san
      const isBest = tok === e.M.bestSan
      if (!isPlayed && !isBest) {
        out.push(claim('line_state', e.surface, e.shown, m[0], F(`${tok} is neither the played move nor the better move`)))
        continue
      }
      out.push(e.san(tok, e.M.F0, isPlayed ? e.M.playedUci : e.M.bestUci))
      if (short) {
        const n = isPlayed ? e.M.lineUcis.length : e.M.bestPv.length
        out.push(claim('line_state', e.surface, e.shown, m[0], n < 2 ? T(`the line after ${tok} has ${n} plies`) : F(`the line after ${tok} has ${n} plies, not too short`)))
      } else if (isBest) {
        const r = e.M.bestRead
        out.push(claim('line_state', e.surface, e.shown, m[0], !r ? U('no best line to read') : !r.settled ? T(`the best line is not settled after ${r.plies} plies`) : F(`the best line is settled after ${r.plies} plies`)))
      } else {
        out.push(claim('line_state', e.surface, e.shown, m[0], U('the played line beyond the plies shown is not in the case')))
      }
    }
  }
  return out
}

/** A material amount on the best line: the lesson's read of the full engine line, exact. */
function materialAmount(phrase, sign, span, read, surface, shown) {
  if (!read) return claim('material', surface, shown, span, U('no engine line to read'))
  const want = parseMaterialPhrase(phrase)
  if (!want) return claim('material', surface, shown, span, U(`amount "${phrase}" not recognised`))
  const amount = read.net * sign
  const label = `best line (${read.plies} plies, ${read.state})`
  return amount >= want.min && amount <= want.max
    ? claim('material', surface, shown, span, T(`${label}: net ${read.net >= 0 ? '+' : ''}${read.net}`))
    : claim('material', surface, shown, span, F(`${label}: net ${read.net >= 0 ? '+' : ''}${read.net}, the text says ${phrase}`))
}

/**
 * A material statement about the played line. The window net is the stored
 * engine line's (lesson `allowed.material`): the lesson reads the reply line
 * beyond the 7 plies the case shows, so the replay of those plies alone is
 * not conclusive (it agrees with the window in most quiet cases, not all).
 */
function playedMaterial(M, phrase, sign, span, surface, shown) {
  if (M.playedNetStored === null) return claim('material', surface, shown, span, U('no stored net for the played line'))
  const want = parseMaterialPhrase(phrase)
  if (!want) return claim('material', surface, shown, span, U(`amount "${phrase}" not recognised`))
  const amount = M.playedNetStored * sign
  const net = `${M.playedNetStored >= 0 ? '+' : ''}${M.playedNetStored}`
  return amount >= want.min && amount <= want.max
    ? claim('material', surface, shown, span, T(`the played line's stored net is ${net}`))
    : claim('material', surface, shown, span, F(`the played line's stored net is ${net}, the text says ${phrase}`))
}

/** "no material is won" on the played line: the stored net gives the mover nothing. */
function playedNoGain(M, span, surface, shown) {
  if (M.playedNetStored === null) return claim('material', surface, shown, span, U('no stored net for the played line'))
  return M.playedNetStored <= 0
    ? claim('material', surface, shown, span, T(`the played line's stored net is ${M.playedNetStored}, no gain`))
    : claim('material', surface, shown, span, F(`the played line's stored net is +${M.playedNetStored}: the mover gains`))
}

/** A capture the text names, found on the line: byColour is the side that captures. */
function materialPresence(fen, ucis, piece, sq, byColour, span, surface, shown) {
  const r = ucis && ucis.length ? replayCaptures(fen, ucis) : null
  if (!r) return claim('material', surface, shown, span, U('no line to read'))
  const hit = r.captures.some((c) => c.by === byColour && c.square === sq && (piece === null || c.piece === TYPE_OF_WORD[piece]))
  return hit
    ? claim('material', surface, shown, span, T(`the line captures on ${sq}`))
    : claim('material', surface, shown, span, U(`no capture on ${sq} in the ${r.plies} plies shown`))
}

function replayCaptures(fen, ucis) {
  const g = load(fen)
  if (!g) return null
  const captures = []
  let plies = 0
  for (const u of ucis) {
    const m = playUci(g, u)
    if (!m) break
    plies++
    if (m.captured) captures.push({ by: m.color, piece: m.captured, square: m.to })
  }
  return { captures, plies }
}

// Lesson templates: the sentence shapes lesson.ts and prose.ts write.
const LESSON_TEMPLATES = [
  // The move order: the played move comes in the engine's best line too, one or two of the mover's moves later.
  {
    re: new RegExp(String.raw`\bThe order matters: ${TOKR} comes in the engine's line too, (a move|two moves) later \(([^)]*)\)`, 'g'),
    run: ([x, when, line], e) => [e.san(x, e.M.F0, e.M.playedUci), checkLater(e.M, when, line.split(' '), e)],
  },
  {
    re: new RegExp(String.raw`\b${TOKR} still comes, (a move|two moves) later, in the engine's line\b`, 'g'),
    run: ([x, when], e) => [e.san(x, e.M.F0, e.M.playedUci), checkLater(e.M, when, null, e)],
  },
  // "Why not take it?": the capture of the move's piece and what follows, on the engine line.
  {
    re: new RegExp(
      String.raw`\b[Ii]f ${WHO} take it with ${TOKR}, (?:([^,.:()]+?), then )?${TOKR} (?:(is mate)|takes back, and ${WHO} (are|have won) ${AMT}(?: up)?|wins (?:their|your) ${PIECE} for (?:your|their) ${PIECE}|takes (?:their|your) ${PIECE} on ${SQ}(?:, and (?:after ${WHO} take back(?: with ${TOKR})? )?${WHO} (are|have won) ${AMT}(?: up)?)?)`,
      'g',
    ),
    run: (g, e) => checkTakeAnswer(g, e),
  },
  // "What if they defend?": the natural defense to the better move's threat and what it costs, on the engine line.
  {
    re: new RegExp(
      String.raw`\b[Ii]f ${WHO} (?:move the ${PIECE} \(${TOKR}\)|block with ${TOKR}), (?:(?:([^,.:()]+?), then )?${TOKR} is mate|([^,.:()]+?), and ${WHO} have won ${AMT})`,
      'g',
    ),
    run: (g, e) => checkDefenseAnswer(g, e),
  },
  // Mates: the better move, the played move, and the reply.
  {
    re: new RegExp(String.raw`\b${TOKR} mates in (\d+)\. ${TOKR} misses it\b`, 'g'),
    run: ([b, n, p], e) => [e.san(b, e.M.F0, e.M.bestUci), e.mate(e.M.mover, +n, e.M.F0, e.M.bestPv, e.M.before, e.whole), e.san(p, e.M.F0, e.M.playedUci)],
  },
  {
    re: new RegExp(String.raw`\b${TOKR} mates in (\d+)\. ${TOKR} still mates, but in (\d+)\b`, 'g'),
    run: ([b, n, p, m2], e) => [e.san(b, e.M.F0, e.M.bestUci), e.mate(e.M.mover, +n, e.M.F0, e.M.bestPv, e.M.before, e.whole), e.san(p, e.M.F0, e.M.playedUci), e.mate(e.M.mover, +m2, e.M.F0, e.M.lineUcis, null, e.whole)],
  },
  {
    re: new RegExp(String.raw`\b${TOKR} mates in (\d+), but ${TOKR} allows mate in (\d+)\b`, 'g'),
    run: ([b, n, p, m2], e) => [
      e.san(b, e.M.F0, e.M.bestUci),
      e.mate(e.M.mover, +n, e.M.F0, e.M.bestPv, e.M.before, e.whole),
      e.san(p, e.M.F0, e.M.playedUci),
      e.mate(other(e.M.mover), +m2, e.M.F1, e.M.attReply?.mateLine ?? [], e.M.after, e.whole),
    ],
  },
  {
    re: new RegExp(String.raw`\b${TOKR} mates too, in (\d+)\b`, 'g'),
    run: ([p, n], e) => [e.san(p, e.M.F0, e.M.playedUci), e.mate(e.M.mover, +n, e.M.F0, e.M.lineUcis, null, e.whole)],
  },
  {
    re: new RegExp(String.raw`\b${TOKR} wins by force: ${WHO} mate in (\d+)(?: \(([^)]*)\))?`, 'g'),
    run: ([b, who, n, line], e) => {
      const side = who === 'you' ? e.M.mover : other(e.M.mover)
      const ucis = line ? e.lineOf(line, e.M.F0) : e.M.bestPv
      return [e.san(b, e.M.F0, e.M.bestUci), e.mate(side, +n, e.M.F0, ucis, e.M.before, e.whole)]
    },
  },
  {
    re: new RegExp(String.raw`\b${TOKR} mates in (\d+)\b`, 'g'),
    run: ([p, n], e) => [e.san(p, e.M.F0, e.M.playedUci), e.mate(e.M.mover, +n, e.M.F0, e.M.lineUcis, null, e.whole)],
  },
  // After the played move: the reply mates (counted from the position after it).
  {
    re: new RegExp(String.raw`\bAfter ${TOKR}, ${WHO} mate in (\d+)(?: \(([^)]*)\))?( instead)?`, 'g'),
    run: ([x, who, n, line], e) => {
      const side = who === 'you' ? e.M.mover : other(e.M.mover)
      const ucis = line ? e.lineOf(line, e.M.F1) : e.M.attReply?.mateLine ?? []
      return [e.san(x, e.M.F0, e.M.playedUci), e.mate(side, +n, e.M.F1, ucis, e.M.after, e.whole)]
    },
  },
  {
    re: new RegExp(String.raw`\bAfter ${TOKR}, ${WHO} have a forced mate in (\d+)\b`, 'g'),
    run: ([x, who, n], e) => {
      const side = who === 'you' ? e.M.mover : other(e.M.mover)
      return [e.san(x, e.M.F0, e.M.playedUci), e.mate(side, +n, e.M.F1, e.M.attReply?.mateLine ?? [], e.M.after, e.whole)]
    },
  },
  {
    re: new RegExp(String.raw`\bAfter ${TOKR}, ${TOKR} is mate\b`, 'g'),
    run: ([x, y], e) => {
      const r = resolveSan(e.M.F1, y)
      const mateClaim = r.ok
        ? (() => {
            const g = load(e.M.F1)
            playUci(g, r.uci)
            return g.isCheckmate() ? claim('mate_move', e.surface, e.shown, e.whole, T(`${r.san} is mate`)) : claim('mate_move', e.surface, e.shown, e.whole, F(`${y} is not mate after ${x}`))
          })()
        : claim('san', e.surface, e.shown, y, F(r.reason))
      return [e.san(x, e.M.F0, e.M.playedUci), mateClaim]
    },
  },
  {
    // The played move's mate in the difference: "a5 wins by force ... . axb5 still mates, but in 10."
    re: new RegExp(String.raw`\b${TOKR} still mates, but in (\d+)\b`, 'g'),
    run: ([x, n], e) => [e.san(x, e.M.F0, e.M.playedUci), e.mate(e.M.mover, +n, e.M.F0, e.M.lineUcis, null, e.whole)],
  },
  {
    re: new RegExp(String.raw`\b${TOKR} threatens mate with ([^\s,.;:()]+)`, 'g'),
    run: ([x, y], e) => {
      const r = resolveSan(e.M.F0, x)
      if (!r.ok) return [claim('san', e.surface, e.shown, x, F(r.reason))]
      return [e.san(x, e.M.F0, r.uci), checkThreatMate(e.M.attFor(e.M.F0, r.uci), y, e.whole, e.shown, e.surface)]
    },
  },
  {
    // "after X, FACT" in the difference: the fact is the best move's (or the played move's) own clause.
    re: new RegExp(String.raw`\bafter ${TOKR}, ([^.]*)`, 'g'),
    run: ([x, fact], e) => {
      const r = resolveSan(e.M.F0, x)
      if (!r.ok) return [claim('san', e.surface, e.shown, x, F(r.reason))]
      return [e.san(x, e.M.F0, r.uci), e.clauses(fact, e.M.attFor(e.M.F0, r.uci))]
    },
  },
  // Technique sentences the templates do not check: endgame and sacrifice wording.
  { re: /\bThe Greek gift was on the board here: [^.]*\./g, run: (_g, e) => [claim('sacrifice', e.surface, e.shown, e.whole, U('sacrifice pattern: not checked'))] },
  { re: /\bthe king walks toward the pawns: [^.]*/g, run: (_g, e) => [claim('technique', e.surface, e.shown, e.whole, U('endgame technique: not checked'))] },
  { re: /\bthe rook goes behind the passed [a-h]-pawn: [^.]*/g, run: (_g, e) => [claim('technique', e.surface, e.shown, e.whole, U('technique: not checked'))] },
  { re: /\bThe catch: [^.]*\./g, run: (_g, e) => [claim('technique', e.surface, e.shown, e.whole, U('the reply named in a technique sentence: not checked'))] },
  {
    re: new RegExp(String.raw`\bAfter ${TOKR}, ${TOKR} starts a forced mate in (\d+)\b`, 'g'),
    run: ([x, y, n], e) => [e.san(x, e.M.F0, e.M.playedUci), e.san(y, e.M.F1, e.M.replyUci), e.mate(other(e.M.mover), +n, e.M.F1, e.M.attReply?.mateLine ?? [], e.M.after, e.whole)],
  },
  {
    re: new RegExp(String.raw`\b${TOKR} starts a forced mate in (\d+)\b`, 'g'),
    run: ([x, n], e) => {
      const isBest = x === e.M.bestSan
      return [e.san(x, e.M.F0, null), e.mate(e.M.mover, +n, e.M.F0, isBest ? e.M.bestPv : e.M.lineUcis, isBest ? e.M.before : null, e.whole)]
    },
  },
  {
    re: new RegExp(String.raw`\bEven after ${TOKR}, ${WHO} mate in (\d+)\b`, 'g'),
    run: ([x, who, n], e) => {
      const side = who === 'you' ? e.M.mover : other(e.M.mover)
      const after = e.M.attBest ? e.M.attBest.mv?.afterFen : null
      return [e.san(x, e.M.F0, e.M.bestUci), e.mate(side, +n, after, e.M.bestPv.slice(1), null, e.whole)]
    },
  },
  {
    re: new RegExp(String.raw`\b${TOKR} holds out longer, but ${WHO} still mate in (\d+)\b`, 'g'),
    run: ([x, who, n], e) => {
      const side = who === 'you' ? e.M.mover : other(e.M.mover)
      const after = e.M.attBest?.mv?.afterFen ?? null
      return [e.san(x, e.M.F0, e.M.bestUci), e.mate(side, +n, after, e.M.bestPv.slice(1), null, e.whole)]
    },
  },
  {
    re: new RegExp(String.raw`\bAfter ${TOKR}, ${WHO} mate in (\d+) too\b`, 'g'),
    run: ([x, who, n], e) => {
      const side = who === 'you' ? e.M.mover : other(e.M.mover)
      const after = e.M.attBest?.mv?.afterFen ?? null
      return [e.san(x, e.M.F0, e.M.bestUci), e.mate(side, +n, after, e.M.bestPv.slice(1), null, e.whole)]
    },
  },
  {
    re: new RegExp(String.raw`\b${TOKR} allows mate in (\d+)(?:, starting with ${TOKR}| with ${TOKR})?`, 'g'),
    run: ([x, n, y1, y2], e) => {
      const out = [e.san(x, e.M.F0, e.M.playedUci), e.mate(other(e.M.mover), +n, e.M.F1, e.M.attReply?.mateLine ?? [], e.M.after, e.whole)]
      const y = y1 ?? y2
      if (y) out.push(e.san(y, e.M.F1, e.M.replyUci))
      return out
    },
  },
  {
    re: new RegExp(String.raw`\b${TOKR} is checkmate\b`, 'g'),
    run: ([x], e) => {
      const r = resolveSan(e.M.F0, x)
      if (!r.ok) return [e.san(x, e.M.F0, null)]
      const g = load(e.M.F0)
      playUci(g, r.uci)
      return [e.san(x, e.M.F0, e.M.playedUci), g.isCheckmate() ? claim('mate_move', e.surface, e.shown, e.whole, T(`${x} is checkmate`)) : claim('mate_move', e.surface, e.shown, e.whole, F(`${x} is not checkmate`))]
    },
  },
  {
    re: new RegExp(String.raw`\b${TOKR} is mate on the spot\b`, 'g'),
    run: ([x], e) => {
      const g = load(e.M.F0)
      const r = resolveSan(e.M.F0, x)
      if (r.ok) playUci(g, r.uci)
      return [e.san(x, e.M.F0, e.M.bestUci), r.ok && g.isCheckmate() ? claim('mate_move', e.surface, e.shown, e.whole, T(`${x} is mate`)) : claim('mate_move', e.surface, e.shown, e.whole, F(`${x} is not mate`))]
    },
  },
  {
    re: new RegExp(String.raw`\b${TOKR} is mate\b`, 'g'),
    run: ([x], e) => {
      const r0 = resolveSan(e.M.F0, x)
      const fen = r0.ok ? e.M.F0 : e.M.F1
      const r = r0.ok ? r0 : fen ? resolveSan(fen, x) : r0
      if (!r.ok) return [claim('san', e.surface, e.shown, x, F(r.reason))]
      const g = load(fen)
      playUci(g, r.uci)
      return [claim('mate_move', e.surface, e.shown, e.whole, g.isCheckmate() ? T(`${x} is mate`) : F(`${x} is not mate`))]
    },
  },
  {
    re: new RegExp(String.raw`\b${TOKR} avoids it\b`, 'g'),
    run: ([x], e) => [e.san(x, e.M.F0, e.M.bestUci)],
  },
  {
    re: new RegExp(String.raw`\b${TOKR} misses it\b`, 'g'),
    run: ([x], e) => [e.san(x, e.M.F0, e.M.playedUci)],
  },
  {
    // The "no forced mate" is said of the played move (the score after it) or of the best move (no score in the case).
    re: new RegExp(String.raw`\bAfter ${TOKR} there is no forced mate\b`, 'g'),
    run: ([x], e) => {
      if (x === e.M.san) {
        const hasMate = e.M.after && e.M.after.mate !== null && e.M.after.mate !== undefined
        return [e.san(x, e.M.F0, e.M.playedUci), claim('no_mate', e.surface, e.shown, e.whole, hasMate ? F(`the engine has a mate after ${x}`) : U('no mate in the engine score after the move: a no-mate claim is not settled by a score'))]
      }
      if (x === e.M.bestSan) return [e.san(x, e.M.F0, e.M.bestUci), claim('no_mate', e.surface, e.shown, e.whole, U('no engine score after the best move in the case'))]
      return [claim('san', e.surface, e.shown, x, F(`${x} is neither the played move nor the best move`))]
    },
  },
  // Material: the amounts on the best line are exact; on the played line they are bounded by the 7 visible plies.
  {
    re: new RegExp(String.raw`\bwins ${AMT} in the engine's line\b`, 'g'),
    run: ([phrase], e) => [e.amount(phrase, 1, e.whole, e.M.bestRead)],
  },
  {
    re: new RegExp(String.raw`\b${WHO2} lose ${AMT} in the engine's line\b`, 'g'),
    run: ([who, phrase], e) => [e.played(phrase, who.toLowerCase() === 'you' ? -1 : 1, e.whole)],
  },
  {
    re: new RegExp(String.raw`\b${TOKR} gives up ${AMT} in the engine's line(?: and is still better)?`, 'g'),
    run: ([x, phrase], e) => [e.san(x, e.M.F0, e.M.bestUci), e.diff(phrase, -1, e.whole)],
  },
  {
    re: new RegExp(String.raw`\bAfter ${TOKR} the ${PIECE} on ${SQ} falls, and you stay ${AMT} up at the end of the engine's line`, 'g'),
    run: ([x, p, sq, phrase], e) => [
      e.san(x, e.M.F0, e.M.bestUci),
      e.presence(e.M.F0, e.M.bestPv, p, sq, e.M.mover, e.whole),
      e.amount(phrase, 1, e.whole, e.M.bestRead),
    ],
  },
  {
    re: new RegExp(String.raw`\bAfter ${TOKR}, ${WHO} win ${AMT}(?: \((?:your|their) ${PIECE} on ${SQ}\))? in the engine's line(?:\. ${TOKR} keeps it)?`, 'g'),
    run: ([x, who, phrase, p, sq, y], e) => {
      const out = [e.san(x, e.M.F0, e.M.playedUci), e.played(phrase, who === 'they' ? -1 : 1, e.whole)]
      if (p) out.push(e.presence(e.M.F0, e.M.lineUcis, p, sq, other(e.M.mover), e.whole))
      if (y) out.push(e.san(y, e.M.F0, e.M.bestUci))
      return out
    },
  },
  {
    re: new RegExp(String.raw`\b${TOKR} improves the position more\b`, 'g'),
    run: ([x], e) => [e.san(x, e.M.F0, e.M.bestUci), claim('positional', e.surface, e.shown, e.whole, U('positional judgement: not on the board'))],
  },
  {
    re: new RegExp(String.raw`\bNeither line wins material in the next (\d+) moves, so the difference is positional:`, 'g'),
    run: ([_n], e) => {
      const out = []
      if (e.M.bestRead) out.push(claim('material', e.surface, e.shown, e.whole, e.M.bestRead.net === 0 ? T('the best line nets 0') : F(`the best line nets ${e.M.bestRead.net >= 0 ? '+' : ''}${e.M.bestRead.net}`)))
      out.push(e.playedNoGain(e.whole))
      return out
    },
  },
  {
    re: new RegExp(String.raw`\bAfter ${TOKR}, no material is won \((?:they|you) plays? ${TOKR} first\)`, 'g'),
    run: ([x, y], e) => [e.san(x, e.M.F0, e.M.playedUci), e.san(y, e.M.F1, e.M.replyUci), e.playedNoGain(e.whole)],
  },
  {
    re: new RegExp(String.raw`\bAfter ${TOKR}, the best ${WHO} get is ${AMT} \((?:they|you) plays? ${TOKR} first\)`, 'g'),
    run: ([x, _who, phrase, y], e) => [e.san(x, e.M.F0, e.M.playedUci), e.san(y, e.M.F1, e.M.replyUci), e.played(phrase, 1, e.whole)],
  },
  {
    re: new RegExp(String.raw`\bAfter ${TOKR} you stay ${AMT} up at the end of the engine's line`, 'g'),
    run: ([x, phrase], e) => [e.san(x, e.M.F0, e.M.bestUci), e.amount(phrase, 1, e.whole, e.M.bestRead)],
  },
  {
    re: new RegExp(String.raw`\b${TOKR} starts a forcing line, and`, 'g'),
    run: ([x], e) => [e.san(x, e.M.F0, e.M.bestUci)],
  },
  {
    re: new RegExp(String.raw`\b${TOKR} forks ([^:]+): whatever they save, the other falls`, 'g'),
    run: ([x, list], e) => {
      const r = resolveSan(e.M.F0, x)
      if (!r.ok) return [claim('san', e.surface, e.shown, x, F(r.reason))]
      return [e.san(x, e.M.F0, r.uci), checkFork(e.M.attFor(e.M.F0, r.uci), list, e.whole, e.shown, e.surface)]
    },
  },
  // The reply's sentences: "After X, they can answer Y, and POINT" and "X allows Y, and POINT".
  {
    re: new RegExp(String.raw`\bAfter ${TOKR}, ${WHO} (?:can answer|have time for) ${TOKR}(?:, and ([^.]*))?`, 'g'),
    run: ([x, _who, y, point], e) => [e.san(x, e.M.F0, e.M.playedUci), e.san(y, e.M.F1, e.M.replyUci), point ? e.clauses(point, e.M.attReply) : []],
  },
  {
    re: new RegExp(String.raw`\b${TOKR} was the answer to ${TOKR}, and ([^.]*)`, 'g'),
    run: ([y, x, point], e) => [e.san(y, e.M.F1, e.M.replyUci), e.san(x, e.M.F0, e.M.playedUci), e.clauses(point, e.M.attReply)],
  },
  {
    re: new RegExp(String.raw`\b${TOKR} allows ${TOKR}, and ([^.]*)`, 'g'),
    run: ([x, y, point], e) => [e.san(x, e.M.F0, e.M.playedUci), e.san(y, e.M.F1, e.M.replyUci), e.clauses(point, e.M.attReply)],
  },
  // The better move's shape: "Y was better: FACT, even though it gives up material."
  {
    re: new RegExp(String.raw`\b${TOKR} was better(?::\s*([^.]*?))?(, even though it gives up material)?(?=\.|$)`, 'g'),
    run: ([x, fact, giveUp], e) => {
      const out = [e.san(x, e.M.F0, e.M.bestUci)]
      if (fact) out.push(e.clauses(fact, e.M.attBest))
      if (giveUp) out.push(e.diffBelow(giveUp.trim()))
      return out
    },
  },
  {
    re: new RegExp(String.raw`\b${TOKR} is fine, but ${TOKR} was a touch stronger(?::\s*([^.]*))?`, 'g'),
    run: ([x, y, fact], e) => [e.san(x, e.M.F0, e.M.playedUci), e.san(y, e.M.F0, e.M.bestUci), fact ? e.clauses(fact, e.M.attBest) : []],
  },
  {
    re: new RegExp(String.raw`\bLook for the more active move first: ${TOKR}:? ([^.]*)\. ${TOKR} can often still be played a move later`, 'g'),
    run: ([y, fact, x], e) => [e.san(y, e.M.F0, e.M.bestUci), e.clauses(fact, e.M.attBest), e.san(x, e.M.F0, e.M.playedUci)],
  },
  {
    re: new RegExp(String.raw`\bRun the scan first: checks, captures, attacks\. ${TOKR} starts a sequence that wins material\. ${TOKR} lets the chance pass`, 'g'),
    run: ([y, x], e) => [
      e.san(y, e.M.F0, e.M.bestUci),
      claim('material', e.surface, e.shown, e.whole, e.M.bestRead && e.M.bestRead.net >= 1 ? T(`the best line nets +${e.M.bestRead.net}`) : F(`the best line nets ${e.M.bestRead?.net}, not a win`)),
      e.san(x, e.M.F0, e.M.playedUci),
    ],
  },
  {
    re: new RegExp(String.raw`\bThreats before plans\. ${TOKR} attacks a piece that has no comfortable square, and the threat wins material\. A quiet improvement like ${TOKR}(?: \(([^)]*)\))? can wait one move, but the threat cannot`, 'g'),
    run: ([y, x, paren], e) => [
      e.san(y, e.M.F0, e.M.bestUci),
      e.M.attBest ? checkThreatens(e.M.attBest, e.whole, e.shown, e.surface) : null,
      claim('material', e.surface, e.shown, e.whole, e.M.bestRead && e.M.bestRead.net >= 1 ? T(`the best line nets +${e.M.bestRead.net}`) : F(`the best line nets ${e.M.bestRead?.net}, not a win`)),
      e.san(x, e.M.F0, e.M.playedUci),
      paren ? walkField(paren, e.M, e.surface, e.shown, e.M.attPlayed).claims : [],
    ],
  },
  {
    re: new RegExp(String.raw`\b(A capture with check|A capture|A check) is not always the strongest move\. ${TOKR} attacks a piece that has no comfortable square, and the threat wins more material than ${TOKR} in the engine's lines`, 'g'),
    run: ([kind, y, x], e) => [
      e.san(y, e.M.F0, e.M.bestUci),
      e.M.attBest ? checkThreatens(e.M.attBest, e.whole, e.shown, e.surface) : null,
      e.diffAbove(e.whole),
      e.san(x, e.M.F0, e.M.playedUci),
      checkForcing(e.M.attPlayed, kind, e.whole, e.shown, e.surface),
    ],
  },
  {
    re: /\bThe material is not compared: ([^.]*)\./g,
    run: ([body], e) => notComparedClaims(body, e),
  },
  // Generic principles state no fact of the position.
  { re: /\bBefore you move, (?:ask what|look at every check|look at the forcing)[^.]*\./g, run: () => [] },
  { re: /\bTake what is offered first\. A capture that wins material comes before any improving move\./g, run: () => [] },
  { re: /\bLook at (?:every check you have|the forcing moves) first[^.]*\./g, run: () => [] },
  { re: /\bThe position it reaches is worth more than the material\b/g, run: () => [] },
  { re: /\bthe position it reaches is worth more than the material\b/g, run: () => [] },
  // A move's name at the head of a clause: "Qxe1: it wins ..." and "Bf5 attacks ...".
  {
    re: /^([^\s:]+)(?::\s| )(?=it |attacks |takes |wins |the |this |pressure|queen|bishop|rook|knight|pawn|a pawn|two |\w+ and )/g,
    run: ([tok], e) => {
      const named = resolveSan(e.M.F0, tok)
      if (!named.ok) return null
      return [e.san(tok, e.M.F0, named.uci)]
    },
  },
]

// Comment templates: the sentences prose.ts writes when the card shows the comment.
const COMMENT_TEMPLATES = [
  { re: new RegExp(String.raw`^${TOKR} is checkmate\.`, 'g'), run: ([x], e) => [e.san(x, e.M.F0, e.M.playedUci), claim('mate_move', e.surface, e.shown, e.whole, e.M.attPlayed.mv && e.M.attPlayed.mv.board.isCheckmate() ? T('checkmate') : F('not checkmate'))] },
  { re: new RegExp(String.raw`^${TOKR} is (the only move that keeps [^.]*|the strongest line found[^.]*)\.`, 'g'), run: ([x], e) => [e.san(x, e.M.F0, e.M.playedUci), claim('engine_claim', e.surface, e.shown, e.whole, U('only-move or strongest-line verdict: engine, not on the board'))] },
  { re: /The next-best choice gives up \d+% of the game\./g, run: (_g, e) => [claim('percent', e.surface, e.shown, e.whole, U('percentage: excluded'), { excluded: true })] },
  { re: /\b(?:You|They) found it\./g, run: (_g, e) => [claim('found_it', e.surface, e.shown, e.whole, e.M.sameAsBest ? T("the played move is the engine's best") : F('the played move differs from the best move'))] },
  { re: new RegExp(String.raw`^${TOKR} is the engine's own choice\.`, 'g'), run: ([x], e) => [e.san(x, e.M.F0, e.M.playedUci), claim('own_choice', e.surface, e.shown, e.whole, e.M.sameAsBest ? T('the played move is the best move') : F('the played move differs from the best move'))] },
  { re: /The point: ([^.]*)\./g, run: ([fact], e) => [e.clauses(fact, e.M.attPlayed)] },
  { re: new RegExp(String.raw`${TOKR} keeps what (?:you|they) had\. Nothing thrown away here\.`, 'g'), run: ([x], e) => [e.san(x, e.M.F0, e.M.playedUci), claim('engine_claim', e.surface, e.shown, e.whole, U('"keeps what you had": engine words'))] },
  { re: new RegExp(String.raw`${TOKR} is fine\.`, 'g'), run: ([x], e) => [e.san(x, e.M.F0, e.M.playedUci)] },
  { re: new RegExp(String.raw`A touch stronger was ${TOKR}(?:: ([^.]*))?\.`, 'g'), run: ([y, fact], e) => [e.san(y, e.M.F0, e.M.bestUci), fact ? e.clauses(fact, e.M.attBest) : []] },
  {
    re: new RegExp(String.raw`Better was ${TOKR}(?:: ([^.]*?))?(?:\. The line: ([^.]*))?\.`, 'g'),
    run: ([y, fact, line], e) => [e.san(y, e.M.F0, e.M.bestUci), fact ? e.clauses(fact, e.M.attBest) : [], line ? checkLine(line.split(' '), e.M.F0, e.shown, e.surface, line) : []],
  },
  { re: new RegExp(String.raw`${TOKR} was the only move that held\.`, 'g'), run: ([y], e) => [e.san(y, e.M.F0, e.M.bestUci), claim('engine_claim', e.surface, e.shown, e.whole, U('only-move verdict: engine, not on the board'))] },
  { re: /The eval moved to ([^.]*)\./g, run: ([v], e) => [claim('eval', e.surface, e.shown, e.whole, evalCheck(v, e.M.after, e.M.mover))] },
  { re: new RegExp(String.raw`${TOKR} takes you from ([^.]*?)(?: \(about \d+% of your winning chances\))?\.`, 'g'), run: ([x], e) => [e.san(x, e.M.F0, e.M.playedUci), claim('engine_claim', e.surface, e.shown, e.whole, U('eval words: not on the board'))] },
  { re: new RegExp(String.raw`${TOKR} costs you about \d+% of your winning chances\.`, 'g'), run: ([x], e) => [e.san(x, e.M.F0, e.M.playedUci), claim('percent', e.surface, e.shown, e.whole, U('percentage: excluded'), { excluded: true })] },
  { re: new RegExp(String.raw`${TOKR} is slightly loose(?:: it costs you about \d+% of your winning chances)?\.`, 'g'), run: ([x], e) => [e.san(x, e.M.F0, e.M.playedUci)] },
  { re: new RegExp(String.raw`${TOKR} gives a little away\.`, 'g'), run: ([x], e) => [e.san(x, e.M.F0, e.M.playedUci)] },
  { re: new RegExp(String.raw`${TOKR} lets it go(?:: it costs you about \d+% of your winning chances)?\.`, 'g'), run: ([x], e) => [e.san(x, e.M.F0, e.M.playedUci)] },
  {
    re: new RegExp(String.raw`${TOKR} still wins, but the fast finish was ${TOKR}(?: \(([^)]*)\))?\.`, 'g'),
    run: ([x, y, line], e) => [e.san(x, e.M.F0, e.M.playedUci), e.san(y, e.M.F0, e.M.bestUci), line ? checkLine(line.split(' '), e.M.F0, e.shown, e.surface, line) : []],
  },
  {
    re: new RegExp(String.raw`Their last move walked into mate in (\d+), and ${TOKR} lets it go\.`, 'g'),
    run: ([n, x], e) => [e.mate(e.M.mover, +n, e.M.F0, e.M.bestPv, e.M.before, e.whole), e.san(x, e.M.F0, e.M.playedUci)],
  },
  {
    re: new RegExp(String.raw`Collect first: ${TOKR}(?: \(([^)]*)\))?\.`, 'g'),
    run: ([y, line], e) => [e.san(y, e.M.F0, e.M.bestUci), line ? checkLine(line.split(' '), e.M.F0, e.shown, e.surface, line) : []],
  },
  {
    re: new RegExp(String.raw`Their last move left a piece to collect: ${TOKR} wins the ${PIECE}( outright)?, and ${TOKR} lets it go\.`, 'g'),
    run: ([y, p, outright, x], e) => [e.san(y, e.M.F0, e.M.bestUci), e.clauses(`wins the ${p}${outright ? ' outright' : ''}`, e.M.attBest), e.san(x, e.M.F0, e.M.playedUci)],
  },
  { re: new RegExp(String.raw`Their last move handed (?:you|them) ([^,]*), and ${TOKR} lets it go\.`, 'g'), run: ([_w, x], e) => [e.san(x, e.M.F0, e.M.playedUci), claim('engine_claim', e.surface, e.shown, e.whole, U('what the opponent handed: not on the board'))] },
  { re: /(?:You|They) had a forced mate in (\d+)\./g, run: ([n], e) => [e.mate(e.M.mover, +n, e.M.F0, e.M.bestPv, e.M.before, e.whole)] },
  // A good move's sentence opens with the move: "Qxe1 wins the rook outright."
  { re: new RegExp(String.raw`^${TOKR} (?=[a-z])`, 'g'), run: ([x], e) => {
      const r = resolveSan(e.M.F0, x)
      if (!r.ok) return null
      return [e.san(x, e.M.F0, r.uci)]
    } },
  { re: /Nothing thrown away here\./g, run: () => [] },
]

/** The eval after the move in the card's words: pawns from the mover's side, or M<n>. */
function evalCheck(text, after, pov) {
  if (!after) return U('no engine score after the move')
  const want = evalString(after, pov)
  return text === want ? T(`${text} matches the engine score after the move`) : F(`the engine score for the mover is ${want}, the text says ${text}`)
}

/** The app's eval string for a score (core/score evalFor): pawns to one decimal with a sign, or M<n> for mate. */
function evalString(score, pov) {
  if (score.mate !== null && score.mate !== undefined) {
    const x = pov === 'w' ? score.mate : -score.mate
    return `${x < 0 ? '-' : ''}M${Math.abs(x)}`
  }
  const cp = pov === 'w' ? score.cp : -score.cp
  const pawns = Math.round(cp / 10) / 10
  if (pawns === 0) return '0.0'
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`
}

// Words that carry no claim: they only connect the clauses.
const CONNECTIVES = new Set(['and', 'it', 'the', 'a', 'an', 'of', 'in', 'to', 'is', 'was', 'but', 'so', 'then', 'that', 'this', 'with', 'for', 'on', 'at', 'by', 'or', 'as', 'be', 'he', 'they', 'you', 'your', 'their', 'engine', 'line'])

/** What is left of a field after the templates and clauses: content words that nothing recognised. */
function unparsedOf(rest) {
  const words = rest.replace(/[^A-Za-z0-9'+#=-]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  const content = words.filter((w) => !CONNECTIVES.has(w.toLowerCase()) && !/^[a-h][1-8]$/.test(w))
  return content.length >= 2 ? [rest.trim()] : []
}

/**
 * Walks a whole field: templates first (whole shapes), then the clauses, each
 * clause attached to the move it names.
 */
function walkField(text, M, surface, shown, defaultAtt, templates = LESSON_TEMPLATES) {
  const mentions = findMentions(text, M)
  const attOf = (idx) => {
    let a = defaultAtt
    for (const m of mentions) {
      if (m.idx <= idx) a = m.att
      else break
    }
    return a
  }
  const tpl = applyTemplates(text, templates, M, surface, shown)
  const cl = clauseClaims(tpl.rest, attOf, surface, shown)
  return { claims: [...tpl.claims, ...cl.claims], unparsed: unparsedOf(cl.rest) }
}

// ---------------------------------------------------------------- field walkers

function lessonClaims(L, M, shown) {
  const claims = []
  const unparsed = []
  const add = (r) => {
    claims.push(...r.claims)
    unparsed.push(...r.unparsed)
  }
  if (L.headline) add(walkField(L.headline, M, 'headline', shown, M.attBest))
  if (L.takeaway) add(walkField(L.takeaway, M, 'takeaway', shown, M.attBest))
  if (L.allowed) {
    if (M.replySan && M.F1) claims.push(checkSan(M.replySan, M.F1, shown, 'allowed.san', M.replyUci))
    if (L.allowed.line) claims.push(checkLine(L.allowed.line.split(' '), M.F0, shown, 'allowed.line', L.allowed.line))
  }
  if (L.better) {
    if (M.bestUci) claims.push(checkSan(L.better.san, M.F0, shown, 'better.san', M.bestUci))
    if (L.better.line) claims.push(checkLine(L.better.line.split(' '), M.F0, shown, 'better.line', L.better.line))
  }
  for (const y of L.yourMove ?? []) add(walkYourMove(y, M, shown))
  for (const p of L.allowed?.points ?? []) add(walkField(p, M, 'allowed.points', shown, M.attReply))
  for (const p of L.better?.points ?? []) add(walkField(p, M, 'better.points', shown, M.attBest))
  for (const d of L.difference ?? []) add(walkField(d, M, 'difference', shown, M.attBest))
  return { claims, unparsed }
}

/** A yourMove item: "Qxe1: it wins ..." or "Bf5 attacks ..." names its move; an insight is the played move's. */
function walkYourMove(item, M, shown) {
  return walkField(item, M, 'yourMove', shown, M.attPlayed)
}

function commentClaims(text, M, shown) {
  return walkField(text, M, 'commentFor', shown, M.attPlayed, COMMENT_TEMPLATES)
}

function retryClaims(t, M, shown) {
  const claims = []
  const unparsed = []
  if (t.answer) claims.push(checkSan(t.answer.san, M.F0, shown, 'retry.answer', t.answer.uci))
  for (const [field, text] of [['retry.hint', t.hint], ['retry.reason', t.reason]]) {
    if (!text) continue
    // The reason's later sentences open with a capital ("The rook takes the
    // open e-file"); the clause readers read the words in lower case. A move
    // (Be4, Qxd4, O-O) is never a plain word, and "If" reads either way.
    const read = field === 'retry.reason' ? text.replace(/([.!?] )(?!If\b)([A-Z])([a-z]+)\b/g, (_m, stop, c, rest) => stop + c.toLowerCase() + rest) : text
    const r = walkField(read, M, field, shown, M.attBest)
    claims.push(...r.claims)
    unparsed.push(...r.unparsed)
  }
  return { claims, unparsed }
}

// ---------------------------------------------------------------- the three verdicts

/** Phrases that name a consequence for the better move (positive), as the rule's list. */
const CONCRETE_POSITIVE = [
  { name: 'material won or saved', re: /\bwins? (?:the |a |an |two |\d+ )?(?:pawn|knight|bishop|rook|queen|piece|pawns|material)|\bwins? material\b|\btakes the (?:pawn|knight|bishop|rook|queen) (?:back|outright)|\bstay (?:a|two|about) .*? up\b|\bsaves\b/i },
  { name: 'mate', re: /\bmates? (?:in|too)\b|\bforced mate\b|\bcheckmate\b|\bis mate\b|\bmate in \d|\bfast finish\b/i },
  { name: 'check that wins something', re: /\bwith check\b[^.]*\bwins?\b|\bwins?\b[^.]*\bwith check\b|\bforks?\b[^.]*\bcheck\b/i },
  { name: 'named threat', re: /\battacks (?:the |their |your )?(?:king|queen|rook|bishop|knight|pawn) on [a-h][1-8]|\bthreatens?\b|\bforks?\b|\bpins? the\b|\bskewers\b/i },
  { name: 'prevents or keeps', re: /\bavoids it\b|\bkeeps it\b|\bprevents?\b|\bstops\b/i },
]
/** Phrases that carry no consequence: the generic fallbacks. */
const CONCRETE_GENERIC = [/a stronger continuation/i, /\bpositional\b/i, /improves the position/i, /Neither line wins material/i, /the position it reaches is worth more than the material/i]
/** Phrases that name what the played move allowed or missed. */
const PLAYED_NAMED = [
  { name: 'allowed a reply that does something', re: /\ballows\b|\b(?:has|have) time for\b|\bcan answer\b|\blets it go\b/i },
  { name: 'material lost in the line', re: /\byou lose\b|\bthey win\b|\bwin \S+ in the engine's line\b|\bfalls\b/i },
  { name: 'material missed: no gain after the played move', re: /\bno material is won\b|\bthe best you get is\b/i },
  { name: 'a missed mate or win', re: /\bwalked into\b|\bhad a forced mate\b|\bleft a piece to collect\b|\bhanded (?:you|them)\b/i },
]

function escapeRe(x) {
  return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The better move's explanation as text: the lesson's better points, difference and headline; or the comment's "Better was" clause. */
function betterText(c) {
  const L = c.texts?.lessonFor
  if (c.texts?.cardShows === 'lesson' && L) {
    // The better move's explanation: its points, the headline's part before the reply, and the difference
    // sentences about the better move (not the played move's "After X" sentences).
    const head = (L.headline ?? '').split(/\. After /)[0]
    const diffs = (L.difference ?? []).filter((d) => !new RegExp(`^After ${escapeRe(c.san)}\\b`).test(d))
    const takeaway = /^Look for the more active move first/.test(L.takeaway ?? '') ? L.takeaway : ''
    return [...(L.better?.points ?? []), head, ...diffs, takeaway].join(' ')
  }
  // The comment's sentences about the better move: the Better clause, the fast finish, and the collect line.
  const cm = c.texts?.commentFor ?? ''
  const sentences = cm.split(/(?<=\.)\s+/)
  return sentences.filter((s) => /Better was|A touch stronger was|fast finish was|Collect first|walked into mate|left a piece to collect/.test(s)).join(' ')
}

/** The played move's consequence as text: the allowed reply, the difference, the headline, or the missed chance. */
function playedText(c) {
  const L = c.texts?.lessonFor
  const parts = []
  if (c.texts?.cardShows === 'lesson' && L) {
    if (L.allowed?.points?.length) parts.push(`allows ${L.allowed.san} ${L.allowed.points.join(' ')}`)
    // The played move's consequences: the headline's reply sentence and the difference sentences about it.
    const reply = (L.headline ?? '').split(/\. After /).slice(1).map((s) => 'After ' + s).join(' ')
    parts.push(reply, ...(L.difference ?? []).filter((d) => new RegExp(`^After ${escapeRe(c.san)}\\b`).test(d)), ...(L.difference ?? []).filter((d) => /you lose|they win|allows|mate in/.test(d)))
  }
  const cm = c.texts?.commentFor ?? ''
  if (/walked into|lets it go|had a forced mate|left a piece to collect|handed (?:you|them)/.test(cm)) parts.push(cm)
  if (c.whatWasMissed && c.whatWasMissed !== 'a stronger continuation') parts.push(`missed: ${c.whatWasMissed}`)
  return parts.join(' ')
}

/**
 * concrete = 1 when the better move's explanation names a consequence (one of
 * the positive phrases, not only a generic fallback) AND the text names what
 * the played move allowed or missed.
 */
export function concreteOf(c) {
  const better = betterText(c)
  const cleaned = better.replace(/Neither line wins material in the next \d+ moves, so the difference is positional: [^.]*\./g, '')
  const matched = CONCRETE_POSITIVE.filter((p) => p.re.test(cleaned)).map((p) => p.name)
  const generic = CONCRETE_GENERIC.filter((g) => g.test(better)).map((g) => g.source)
  const played = playedText(c)
  const playedMatched = PLAYED_NAMED.filter((p) => p.re.test(played)).map((p) => p.name)
  if (c.texts?.lessonFor?.allowed?.points?.length && !playedMatched.includes('allowed a reply that does something')) playedMatched.push('allowed point present')
  const failures = []
  if (!matched.length) failures.push(generic.length ? `better move explained only generically (${generic.join(', ')})` : 'better move names no consequence')
  if (!playedMatched.length) failures.push('nothing names what the played move allowed or missed')
  const value = matched.length && playedMatched.length ? 1 : 0
  return { value, matchedBetter: matched, matchedPlayed: playedMatched, failures }
}

/** named_deep = 1 when the best move the text names came from pass 2 (or a scan of >= 600k nodes). */
export function namedDeepOf(c) {
  const deep = c.bestFromPass2 === true || (typeof c.scanNodes === 'number' && c.scanNodes >= 600000)
  return {
    value: deep ? 1 : 0,
    reason: deep ? `best move searched at ${c.verifyNodes} nodes (pass 2)` : `best move from a ${c.scanNodes}-node scan only (pass 2 did not finish)`,
  }
}

// ---------------------------------------------------------------- grade

/**
 * Grades one key moment: the three verdicts, every claim with its verdict, and
 * the failures in plain words.
 */
export function gradeMoment(c) {
  const M = momentContext(c)
  const T_ = c.texts ?? {}
  const claims = []
  const unparsed = []
  const cardLesson = T_.cardShows === 'lesson' && T_.lessonFor
  if (cardLesson) {
    const r = lessonClaims(T_.lessonFor, M, 'card')
    claims.push(...r.claims)
    unparsed.push(...r.unparsed)
  } else if (T_.commentFor) {
    const r = commentClaims(T_.commentFor, M, 'card')
    claims.push(...r.claims)
    unparsed.push(...r.unparsed)
  }
  if (!cardLesson && T_.lessonFor) {
    const r = lessonClaims(T_.lessonFor, M, 'sheet')
    claims.push(...r.claims)
    unparsed.push(...r.unparsed)
  }
  if (T_.retryTeaching) {
    const r = retryClaims(T_.retryTeaching, M, 'retry')
    claims.push(...r.claims)
    unparsed.push(...r.unparsed)
  }
  const flat = claims.flat().filter((x) => x && x.type)
  const decided = flat.filter((x) => (x.verdict === 'true' || x.verdict === 'false') && !x.excluded)
  const spec = flat.filter((x) => x.shown !== 'sheet')
  const specFalse = spec.filter((x) => x.verdict === 'false')
  const allFalse = flat.filter((x) => x.verdict === 'false')
  const concrete = concreteOf(c)
  const deep = namedDeepOf(c)
  const failures = []
  for (const f of allFalse) failures.push({ dimension: 'faithful', type: f.type, text: f.text, reason: f.reason, surface: f.surface, shown: f.shown })
  if (!concrete.value) for (const f of concrete.failures) failures.push({ dimension: 'concrete', reason: f })
  if (!deep.value) failures.push({ dimension: 'named_deep', reason: deep.reason })
  return {
    id: c.id,
    cls: c.cls,
    cardShows: T_.cardShows,
    faithful: specFalse.length === 0 ? 1 : 0,
    faithfulAll: allFalse.length === 0 ? 1 : 0,
    concrete: concrete.value,
    named_deep: deep.value,
    checkable: decided.length > 0,
    claims: flat.map((x) => ({ type: x.type, surface: x.surface, shown: x.shown, text: x.text, verdict: x.verdict, reason: x.reason })),
    claimCounts: {
      total: flat.length,
      checkable: decided.length,
      true: flat.filter((x) => x.verdict === 'true' && !x.excluded).length,
      false: allFalse.length,
      unverified: flat.filter((x) => x.verdict === 'unverified').length,
    },
    concreteDetail: { matchedBetter: concrete.matchedBetter, matchedPlayed: concrete.matchedPlayed },
    namedDeep: deep,
    unparsed: [...new Set(unparsed)],
    failures,
  }
}

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const home = privateDir('explain-top-move')
  const args = { cases: join(home, 'cases.json'), out: join(home, 'grades.json'), corrupt: true }
  const pos = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = resolve(argv[++i])
    else if (argv[i] === '--no-corruption') args.corrupt = false
    else pos.push(argv[i])
  }
  if (pos[0]) args.cases = resolve(pos[0])
  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const cases = JSON.parse(readFileSync(args.cases, 'utf8'))
  const grades = cases.map((c) => {
    try {
      return gradeMoment(c)
    } catch (e) {
      return { id: c.id, cls: c.cls, error: e?.message ?? String(e), faithful: 0, faithfulAll: 0, concrete: 0, named_deep: 0, checkable: false, claims: [], failures: [{ dimension: 'grader', reason: e?.message ?? String(e) }] }
    }
  })
  writeFileSync(args.out, JSON.stringify(grades, null, 2) + '\n')
  const mdPath = join(dirname(args.out), 'grades.md')
  const handcheckPath = join(records(), 'evals', 'explain-top-move', 'handcheck.json')
  const handcheck = existsSync(handcheckPath) ? JSON.parse(readFileSync(handcheckPath, 'utf8')) : null
  const corruption = args.corrupt ? runCorruption(cases) : null
  writeFileSync(mdPath, renderMarkdown(grades, handcheck, corruption))
  const sum = (k) => grades.reduce((a, g) => a + (g[k] ? 1 : 0), 0)
  console.log(JSON.stringify({ moments: grades.length, faithful: sum('faithful'), faithfulAll: sum('faithfulAll'), concrete: sum('concrete'), named_deep: sum('named_deep'), checkable: sum('checkable'), errors: grades.filter((g) => g.error).length, out: args.out, markdown: mdPath }, null, 2))
}

// ---------------------------------------------------------------- corruption test

/**
 * Three corrupted copies of real moments, one fact changed each. The grader
 * must flag each copy on the corrupted claim; the baseline stays as it was.
 */
function runCorruption(cases) {
  const results = []
  const q = cases.find((c) => c.texts?.lessonFor?.allowed?.points?.some((p) => /wins the queen outright/.test(p)))
  if (q) {
    const copy = structuredClone(q)
    copy.texts.lessonFor.allowed.points = copy.texts.lessonFor.allowed.points.map((p) => p.replace('wins the queen outright', 'wins the rook outright'))
    results.push(corruptionRow('"it wins the queen outright" -> "it wins the rook outright"', q, copy, /wins the rook outright/))
  }
  const mm = cases.find((c) => c.texts?.lessonFor?.allowed?.points?.some((p) => /forces mate in 3/.test(p)))
  if (mm) {
    const copy = structuredClone(mm)
    copy.texts.lessonFor.allowed.points = copy.texts.lessonFor.allowed.points.map((p) => p.replace('forces mate in 3', 'forces mate in 2'))
    results.push(corruptionRow('"it forces mate in 3" -> "it forces mate in 2"', mm, copy, /forces mate in 2/))
  }
  const sq = cases.find((c) => c.texts?.lessonFor?.better?.points?.some((p) => /attacks the knight on [a-h][1-8]/.test(p)))
  if (sq) {
    const copy = structuredClone(sq)
    copy.texts.lessonFor.better.points = copy.texts.lessonFor.better.points.map((p) => p.replace(/attacks the knight on ([a-h])([1-8])/, (_w, f, r) => `attacks the knight on ${f}${r === '8' ? '7' : +r + 1}`))
    results.push(corruptionRow('"attacks the knight on X" -> one rank up', sq, copy, /attacks the knight on/))
  }
  const tk = cases.find((c) => c.texts?.lessonFor?.better?.points?.some((p) => /wins their queen for your rook\b/.test(p)))
  if (tk) {
    const copy = structuredClone(tk)
    copy.texts.lessonFor.better.points = copy.texts.lessonFor.better.points.map((p) => p.replace(/wins their queen for your rook\b/, 'wins their queen for your bishop'))
    results.push(corruptionRow('"wins their queen for your rook" -> "... for your bishop"', tk, copy, /for your bishop/))
  }
  const order = cases.find((c) => c.texts?.lessonFor?.difference?.some((d) => /comes in the engine's line too, two moves later/.test(d)))
  if (order) {
    const copy = structuredClone(order)
    copy.texts.lessonFor.difference = copy.texts.lessonFor.difference.map((d) => d.replace("comes in the engine's line too, two moves later", "comes in the engine's line too, a move later"))
    results.push(corruptionRow('"two moves later" -> "a move later" (the move order)', order, copy, /a move later/))
  }
  const up = cases.find((c) => c.texts?.lessonFor?.better?.points?.some((p) => /\byou have won a piece\b/.test(p)))
  if (up) {
    const copy = structuredClone(up)
    copy.texts.lessonFor.better.points = copy.texts.lessonFor.better.points.map((p) => p.replace(/\byou have won a piece\b/, 'you have won a rook'))
    results.push(corruptionRow('"you have won a piece" -> "you have won a rook" (after a take-answer)', up, copy, /won a rook/))
  }
  // The defense answers (defenses.mjs): the amount, and the piece the defense moves.
  const isDefense = (p) => /^if (?:they|you) (?:move the|block with)\b/.test(p)
  const df = cases.find((c) => c.texts?.lessonFor?.better?.points?.some((p) => isDefense(p) && /have won (?!a queen)/.test(p)))
  if (df) {
    const copy = structuredClone(df)
    copy.texts.lessonFor.better.points = copy.texts.lessonFor.better.points.map((p) => (isDefense(p) ? p.replace(/have won .*$/, 'have won a queen') : p))
    results.push(corruptionRow('"have won N" -> "have won a queen" (after a defense answer)', df, copy, /won a queen/))
  }
  const dm = cases.find((c) => c.texts?.lessonFor?.better?.points?.some((p) => /^if (?:they|you) move the (?!rook)\w+ \(/.test(p)))
  if (dm) {
    const copy = structuredClone(dm)
    copy.texts.lessonFor.better.points = copy.texts.lessonFor.better.points.map((p) => p.replace(/^(if (?:they|you) move the )(?!rook)\w+/, '$1rook'))
    results.push(corruptionRow('"move the queen (Qe3)" -> "move the rook (Qe3)" (the defense)', dm, copy, /move the rook/))
  }
  return results
}

function corruptionRow(label, original, copy, pattern) {
  const before = gradeMoment(original)
  const after = gradeMoment(copy)
  const hit = after.failures.find((f) => f.dimension === 'faithful' && pattern.test(f.text ?? ''))
  return {
    label,
    id: original.id,
    baselineFaithful: before.faithful,
    corruptedFaithful: after.faithful,
    caught: after.faithful === 0 && !!hit,
    caughtClaim: hit ? `${hit.type}: "${hit.text}" (${hit.reason})` : null,
  }
}

// ---------------------------------------------------------------- markdown

function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a'
}

function renderMarkdown(grades, handcheck, corruption) {
  const L = []
  const ok = grades.filter((g) => !g.error)
  const N = ok.length
  const sum = (arr, k) => arr.reduce((a, g) => a + (g[k] ? 1 : 0), 0)
  L.push('# explain-top-move: programmatic grades', '')
  L.push(`Graded ${N} key moments with \`grade.mjs\` (chess.js; no engine run). Errors: ${grades.length - N}.`, '')
  L.push('## Overall', '')
  L.push('| metric | count | rate |', '|---|---|---|')
  L.push(`| faithful (spec visible set: card + retry) | ${sum(ok, 'faithful')} / ${N} | ${pct(sum(ok, 'faithful'), N)} |`)
  L.push(`| faithful, also the Why-sheet lesson on comment cards | ${sum(ok, 'faithfulAll')} / ${N} | ${pct(sum(ok, 'faithfulAll'), N)} |`)
  L.push(`| concrete | ${sum(ok, 'concrete')} / ${N} | ${pct(sum(ok, 'concrete'), N)} |`)
  L.push(`| named_deep | ${sum(ok, 'named_deep')} / ${N} | ${pct(sum(ok, 'named_deep'), N)} |`)
  L.push(`| moments with at least one checkable claim | ${sum(ok, 'checkable')} / ${N} | ${pct(sum(ok, 'checkable'), N)} |`, '')

  L.push('## By class', '')
  L.push('| cls | moments | faithful | concrete | named_deep | checkable |', '|---|---|---|---|---|---|')
  for (const cls of [...new Set(ok.map((g) => g.cls))].sort()) {
    const arr = ok.filter((g) => g.cls === cls)
    L.push(`| ${cls} | ${arr.length} | ${sum(arr, 'faithful')} (${pct(sum(arr, 'faithful'), arr.length)}) | ${sum(arr, 'concrete')} (${pct(sum(arr, 'concrete'), arr.length)}) | ${sum(arr, 'named_deep')} (${pct(sum(arr, 'named_deep'), arr.length)}) | ${sum(arr, 'checkable')} (${pct(sum(arr, 'checkable'), arr.length)}) |`)
  }
  L.push('')

  const types = new Map()
  for (const g of ok) for (const cl of g.claims) {
    const t = types.get(cl.type) ?? { n: 0, checkable: 0, false: 0, unverified: 0 }
    t.n++
    if (cl.verdict === 'true' || cl.verdict === 'false') t.checkable++
    if (cl.verdict === 'false') t.false++
    if (cl.verdict === 'unverified') t.unverified++
    types.set(cl.type, t)
  }
  L.push('## Claim types found', '')
  L.push('| type | claims | checkable | false | unverified |', '|---|---|---|---|---|')
  for (const [t, v] of [...types.entries()].sort((a, b) => b[1].n - a[1].n)) L.push(`| ${t} | ${v.n} | ${v.checkable} | ${v.false} | ${v.unverified} |`)
  L.push('')

  const failCounts = new Map()
  for (const g of ok) for (const f of g.failures ?? []) {
    const key = `${f.dimension}: ${f.reason ?? f.type}`
    failCounts.set(key, (failCounts.get(key) ?? 0) + 1)
  }
  L.push('## Most common failure reasons', '')
  L.push('| count | dimension and reason |', '|---|---|')
  for (const [k, n] of [...failCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) L.push(`| ${n} | ${k.replace(/\|/g, '/')} |`)
  L.push('')

  if (corruption) {
    L.push('## Corruption test', '')
    L.push('| corruption | moment | baseline faithful | corrupted faithful | caught |', '|---|---|---|---|---|')
    for (const r of corruption) L.push(`| ${r.label} | ${r.id} | ${r.baselineFaithful} | ${r.corruptedFaithful} | ${r.caught ? 'yes' : 'NO'} |`)
    for (const r of corruption) L.push('', `- ${r.label}: ${r.caughtClaim ?? 'not caught'}`)
    L.push('')
  }

  if (handcheck) {
    L.push('## Hand-check (my verdicts, written before the grader was run on these moments)', '')
    L.push('| moment | class | my faithful | grader faithful | my concrete | grader concrete | my named_deep | grader named_deep | agree |', '|---|---|---|---|---|---|---|---|---|')
    for (const h of handcheck.moments) {
      const g = ok.find((x) => x.id === h.id)
      const same = g && g.faithful === h.faithful && g.concrete === h.concrete && g.named_deep === h.named_deep
      L.push(`| ${h.id} | ${h.cls} | ${h.faithful} | ${g ? g.faithful : 'n/a'} | ${h.concrete} | ${g ? g.concrete : 'n/a'} | ${h.named_deep} | ${g ? g.named_deep : 'n/a'} | ${same ? 'yes' : 'NO'} |`)
    }
    L.push('')
    // Claim level: each of my claims is matched to the grader's claim whose span contains it (or is contained in it).
    let agree = 0
    let disagree = 0
    let notFound = 0
    const side = []
    for (const h of handcheck.moments) {
      const g = ok.find((x) => x.id === h.id)
      if (!g) continue
      side.push(`#### ${h.id} (${h.cls}, ${h.cardShows})`, '')
      if (h.note) side.push(h.note, '')
      side.push('| my verdict | grader verdict | claim type | my phrase | grader span | grader reason |', '|---|---|---|---|---|---|')
      const used = new Set()
      for (const mine of h.claims ?? []) {
        const idx = g.claims.findIndex((cl, i) => !used.has(i) && cl.verdict !== 'unverified' && (cl.text.includes(mine.text) || mine.text.includes(cl.text)))
        const cl = idx >= 0 ? g.claims[idx] : null
        if (cl) used.add(idx)
        if (!cl) notFound++
        else if (mine.verdict === 'unverified' || cl.verdict === 'unverified') {
          // an unverified verdict on either side is not a disagreement
        } else if (cl.verdict === mine.verdict) agree++
        else disagree++
        side.push(`| ${mine.verdict} | ${cl ? cl.verdict : 'no matching claim'} | ${cl ? cl.type : '-'} | ${mine.text.replace(/\|/g, '/')} | ${cl ? cl.text.replace(/\|/g, '/') : '-'} | ${cl ? cl.reason.replace(/\|/g, '/') : '-'} |`)
      }
      g.claims.forEach((cl, i) => {
        if (used.has(i) || cl.verdict === 'unverified') return
        side.push(`| not listed | ${cl.verdict} | ${cl.type} | - | ${cl.text.replace(/\|/g, '/')} | ${cl.reason.replace(/\|/g, '/')} |`)
      })
      side.push('')
    }
    L.push(`Claim-level agreement on claims both sides decide: ${agree} agree, ${disagree} disagree; ${notFound} of my claims found no grader claim.`, '')
    L.push(...side)
  }

  L.push('## Scope and limits', '')
  L.push("- The spec's visible set: the lesson fields when the card shows the lesson, otherwise commentFor, plus the retry hint and reveal. The Why sheet also shows the lesson on comment-card moments; `faithfulAll` grades those as well.")
  L.push('- Percentages ("about N% of your winning chances", "gives up 48% of the game") are excluded. Eval words ("worse to much worse") and only-move verdicts are engine claims: unverified.')
  L.push("- Material on the best line uses the lesson's read of the full engine line (10 plies, then the quiet tail). Material on the played line uses the 7 plies the lesson shows: a positive claim is true only when the capture is in those plies; a claim is false only when the visible line ends quietly and contradicts it.")
  L.push('- "Outright" means no legal recapture on the square right after the capture. "Undefended" means no piece of the attacked side attacks the square (pins are not considered).')
  L.push("- Mate claims are checked on the line when it mates, else on the engine's mate distance for the position the count starts from.")
  return L.join('\n') + '\n'
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
