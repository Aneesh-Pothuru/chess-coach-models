// Coaching sheets: the facts a puzzle-book explanation of a moment rests on, read with
// the app's own code and engines, so a writer can coach the moment without judging the
// chess itself. For a moment (the position, the side to move and the move played) the
// sheet holds
// - what to notice before choosing a move: the opponent's loose pieces, a king boxed in
//   on its back rank or with no safe square, the checks and captures the player has,
//   the player's own loose pieces, and the opponent's threat: the line they would play
//   if it were their move, when it mates or wins at least two points;
// - the candidates a player at the band would weigh: Maia-2's likeliest moves, the
//   engine's best three and the move played, each with the engine's verdict and, for a
//   move that fails, the reply that refutes it, the line, what the line wins and the
//   tactic it carries out (line-tactics.mjs);
// - the better move's line move by move, with what each move does, the idea of the line
//   (line-tactics.mjs's point tier), what else it does (its also tier) and how it ends.
// A line is cut where its material settles or it mates, so the tactic named is the one
// that wins, not one ten moves later. The position and the move played are searched at
// the app's teaching budget (deep), the other candidates and the threat at its sweep
// budget, and the engine's best three at its verify budget.
//
//   bridge/run.sh projects/coach-eval/coach-sheet.mjs --moments <a.jsonl,...> \
//     (--ids <id,...> | --sample <prompts.jsonl,...>) --out <sheets.jsonl> [--shard k/n]
//   bridge/run.sh projects/coach-eval/coach-sheet.mjs --puzzles <puzzles.json> --out <sheets.jsonl> [--shard k/n] [--rating 1350]
//   bridge/run.sh projects/coach-eval/coach-sheet.mjs --moments <a.jsonl,...> --rederive <sheets.jsonl,...> --out <sheets.jsonl>
//   bridge/run.sh projects/coach-eval/coach-sheet.mjs --moments <a.jsonl,...> --supplement <sheets.jsonl,...> --out <sheets.jsonl>
//
// --puzzles makes each puzzle's moment itself (puzzleMoment): Maia-2's likeliest error
// at the band as the move played, and the answer key as the better line.
//
// Each sheet keeps the engines' answers it was read from (`search`), and --rederive
// reads the facts again from them with no engine, after a change to how they are read.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess } from '../../bridge/lib/chess.mjs'
import { lineConcepts, lineSignals, RULES } from './line-tactics.mjs'

const { createNodeEngine } = await chess('src/adapters/node/engine/index.ts')
const { position, child } = await chess('src/core/chess/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const { classifyPly } = await chess('src/services/review/index.ts')
const { defaultMaiaElo, DEFAULT_LICHESS_OFFSET } = await chess('src/services/engine/index.ts')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const readJsonl = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const PIECE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const CONCEPT_WORD = {
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
const SHEET_ALSO = Object.fromEntries(Object.entries(RULES.also).filter(([source]) => !['passed', 'quiet'].includes(source)))

const toMove = (fen, uci) => new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
const sanOf = (fen, uci) => toMove(fen, uci).san
const fenAfter = (fen, uci) => {
  const b = new Chess(fen)
  b.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  return b.fen()
}
const other = (c) => (c === 'w' ? 'b' : 'w')
const whose = (color, pov) => (color === pov ? 'your' : 'their')
const pieceAt = (fen, sq, pov) => {
  const p = new Chess(fen).get(sq)
  return p ? `${whose(p.color, pov)} ${PIECE[p.type]} on ${sq}` : `the square ${sq}`
}
const pawns = (score, mover) => {
  if (!score) return null
  if (score.mate !== null && score.mate !== undefined) {
    const m = mover === 'w' ? score.mate : -score.mate
    return m > 0 ? `mate in ${m} for you` : `mate in ${-m} for them`
  }
  const cp = mover === 'w' ? score.cp : -score.cp
  return `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)} for you`
}
const said = (fen, uci, pov, recapture = false) => K.moveReasons(fen, uci, recapture).map((r) => K.reasonText(r, 'clause', pov))
const listOf = (xs) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const COUNT = ['', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']
/** Pieces in words, like ones counted together: "a rook and two pawns". */
const piecesOf = (types) => {
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
function exchangeText(fen, ucis, pov) {
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
function settle(fen, pv, cap = 12, min = 0) {
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
function conceptSentences(fen, pv, signals, rule, pov, lastTo = null) {
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
      text = `a back-rank mate: the king on ${king} is boxed in by its own pieces on ${blockers.join(', ')}`
    } else if (concept === 'fork') text = `${by} forks ${step.fork.targets.map((t) => pieceAt(after, t, pov)).join(' and ')}`
    else if (concept === 'attraction') text = `${by} draws ${lineMover === pov ? 'their' : 'your'} king to ${step.attraction.square}, where the next move hits it`
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
    out.push({ tactic: word, at: by ?? null, text })
  }
  return out
}

/**
 * A short line's length: at least `min` plies, and on through any recapture that
 * answers the last move shown, so a short line never stops in the middle of a trade.
 */
function settledLength(fen, pv, min) {
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
function forcedness(fen) {
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
function annotate(fen, pv, pov, lastTo = null) {
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
function exactLine(fen, pv) {
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
function lineFacts(fen, pv, pov, before = null, lead = null, short = false, exact = false, min = 0) {
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

/** The flipped position, with the opponent to move, or null when the player is in check. */
function flippedOf(fen) {
  if (new Chess(fen).inCheck()) return null
  try {
    return K.flipTurn(fen) || null
  } catch {
    return null
  }
}

/**
 * Everything a sheet takes from the engines, kept with the sheet so its facts can be
 * read again without searching: the root's line, the engine's best three, Maia-2's
 * likeliest moves, each candidate's score and the line that answers it, and the
 * opponent's line in the flipped position.
 */
async function searchOf(engine, m) {
  const fen = m.fen
  const band = defaultMaiaElo((m.rating ?? 1350) - DEFAULT_LICHESS_OFFSET, DEFAULT_LICHESS_OFFSET)
  const start = position(fen)
  const opts = { cache: 'bypass', priority: 'batch' }
  const root = await engine.evaluate(start, 'deep', opts)
  const set = await engine.bestMoves(start, { budget: 'verify', multiPv: 3, ...opts })
  const top = (set.lines.length ? set.lines : set.provisional ?? []).filter((l) => l.pv?.length).map((l) => ({ score: l.score, pv: l.pv }))
  const hp = await engine.humanPolicy(start, { bands: [band], opponentBand: band })
  const likely = hp === 'unavailable' ? [] : Object.entries(hp.bands[0].policy).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const order = [...new Set([...top.map((l) => l.pv[0]), ...likely.map(([u]) => u), m.played.uci])]
  const candidates = []
  for (const uci of order) {
    const after = await engine.evaluate(child(start, uci), uci === m.played.uci ? 'deep' : 'sweep', opts)
    const listed = top.find((l) => l.pv[0] === uci)
    candidates.push({ uci, score: listed?.score ?? after.score, reply: after.pv ?? [] })
  }
  const flipped = flippedOf(fen)
  const threat = flipped ? await engine.evaluate(position(flipped), 'sweep', opts) : null
  return {
    band,
    root: { score: root.score, best: root.best, pv: root.pv ?? [] },
    top,
    likely,
    candidates,
    threat: threat?.pv?.length ? { fen: flipped, pv: threat.pv } : null,
    afterKey: await afterKeyOf(engine, m),
    lines: set.lines.length,
    provisional: set.provisional?.length ?? 0,
  }
}

/** The engine's line from the end of a puzzle's answer key, so the key can be carried on to what it wins. */
async function afterKeyOf(engine, m) {
  const key = Array.isArray(m.best?.solution) ? m.best.solution : null
  if (!key?.length) return null
  const b = new Chess(m.fen)
  for (const u of key) {
    try {
      b.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
    } catch {
      return null
    }
  }
  if (b.isGameOver()) return { pv: [] }
  const r = await engine.evaluate(position(b.fen()), 'sweep', { cache: 'bypass', priority: 'batch' })
  return { pv: r.pv ?? [] }
}

/** The opponent's threat, read from the flipped position's line: a check or capture that mates or wins two points. */
function threatFacts(t, pov) {
  if (!t) return null
  const first = toMove(t.fen, t.pv[0])
  const facts = lineFacts(t.fen, t.pv, pov)
  if (facts.gain !== 'mate' && (facts.gain < 2 || !(first.captured || /[+#]/.test(first.san)))) return null
  const how = [...facts.idea, ...facts.also].filter((x) => x.at === first.san).map((x) => x.text)
  return { move: first.san, text: how.length ? how.join('; ') : `${first.san}, after which ${facts.result}`, facts }
}

/** A moment's coaching sheet, read from its search with the app's board code. */
function sheetFrom(m, s) {
  const fen = m.fen
  const pov = m.mover
  const them = other(pov)
  const candidates = []
  for (const x of s.candidates) {
    const rank = s.top.findIndex((l) => l.pv[0] === x.uci)
    const graded = classifyPly({ ply: 40, fenAfter: fenAfter(fen, x.uci), uci: x.uci, bestUci: s.root.best, before: s.root.score, after: x.score, standardStart: false })
    const c = {
      move: sanOf(fen, x.uci),
      played: x.uci === m.played.uci,
      engine_rank: rank >= 0 ? rank + 1 : null,
      share_of_players_at_your_level: Math.round((s.likely.find(([u]) => u === x.uci)?.[1] ?? 0) * 100) / 100,
      verdict: graded.cls,
      evaluation: pawns(x.score, pov),
      what_it_does: said(fen, x.uci, pov),
    }
    if (['inaccuracy', 'mistake', 'blunder', 'miss'].includes(graded.cls) && x.reply.length) {
      const reply = lineFacts(fenAfter(fen, x.uci), x.reply, pov, fen, x.uci, graded.cls === 'inaccuracy')
      c.why_not = { reply: reply.line[0]?.move ?? null, ...reply }
    }
    candidates.push(c)
  }
  // A puzzle's answer key is the line to coach from, carried on by the engine's line
  // when that line plays the whole key first, so a key that stops before its point is
  // cashed in still shows what it wins; a game moment's line is the engine's.
  const answerKey = Array.isArray(m.best?.solution) && m.best.solution.length ? m.best.solution : null
  const carried = answerKey && s.afterKey?.pv?.length ? [...answerKey, ...s.afterKey.pv] : null
  const keyGoesOn = !!answerKey && (!!carried || (s.root.pv.length > answerKey.length && answerKey.every((u, i) => s.root.pv[i] === u)))
  const bestPv = answerKey ? (carried ?? (keyGoesOn ? s.root.pv : answerKey)) : s.root.pv.length && (!s.top[0] || s.root.pv[0] === s.top[0].pv[0]) ? s.root.pv : s.top[0]?.pv ?? []
  const board = new Chess(fen)
  const legal = board.moves({ verbose: true })
  const theirKing = K.kingDanger(fen, them)
  const notice = []
  if (board.inCheck()) {
    const king = board.board().flat().find((c) => c && c.type === 'k' && c.color === pov).square
    notice.push(`you are in check from ${listOf(board.attackers(king, them).map((sq) => `their ${PIECE[board.get(sq).type]} on ${sq}`))}`)
  }
  for (const h of K.hangingPieces(fen, them)) notice.push(`their ${PIECE[h.piece] ?? h.piece} on ${h.square} is loose (${h.kind})`)
  if (safeBool(() => K.backRankWeakness(fen, them))) notice.push('their king is boxed in on its back rank by its own pieces')
  else if (theirKing?.signs?.includes('noSafeSquares')) notice.push(`their king on ${theirKing.king} has no safe square to step to`)
  const checks = legal.filter((x) => /[+#]/.test(x.san)).map((x) => x.san)
  notice.push(checks.length ? `your checks: ${checks.join(', ')}` : 'you have no checks')
  for (const h of K.hangingPieces(fen, pov)) notice.push(`your ${PIECE[h.piece] ?? h.piece} on ${h.square} is loose (${h.kind})`)
  const threat = threatFacts(s.threat, pov)
  if (threat) notice.push(`their threat, if it were their move: ${threat.text}${threat.facts.gain === 'mate' ? ', and their line mates' : ''}`)
  const best = answerKey ? lineFacts(fen, bestPv, pov, null, null, false, !keyGoesOn, answerKey.length) : lineFacts(fen, bestPv, pov)
  return {
    id: `${m.game}:${m.index}`,
    you_play: pov === 'w' ? 'White' : 'Black',
    level: m.rating ?? null,
    fen,
    move_played: m.played.san,
    what_to_notice: notice,
    their_threat: threat ? { move: threat.move, line: threat.facts.line.map((p) => p.move), idea: threat.facts.idea, also: threat.facts.also, result: threat.facts.result } : null,
    candidates,
    better_move: { move: bestPv.length ? sanOf(fen, bestPv[0]) : null, evaluation: pawns(s.top[0]?.score ?? s.root.score, pov), from: answerKey ? 'the puzzle\'s answer key' : 'the engine', ...best },
    engine: { lines: s.lines, provisional: s.provisional, maia_band: s.band },
    source: m.source ?? null,
    search: s,
  }
}

function safeBool(f) {
  try {
    return !!f()
  } catch {
    return false
  }
}

const ERRORS = ['inaccuracy', 'mistake', 'blunder', 'miss']

/**
 * A puzzle as a moment to coach: the position after its first move, its answer key, and
 * as the move played the likeliest of Maia-2's four moves at the band, other than the
 * answer, that the engine grades an inaccuracy or worse; null when none is.
 */
async function puzzleMoment(engine, p, rating) {
  const b = new Chess(p.start)
  const mover = b.turn()
  const solution = []
  for (const san of p.main) {
    if (san === '--') break
    let mv
    try {
      mv = b.move(san)
    } catch {
      break
    }
    if (mv.from === mv.to) break
    solution.push(`${mv.from}${mv.to}${mv.promotion ?? ''}`)
  }
  if (!solution.length) return null
  const band = defaultMaiaElo(rating - DEFAULT_LICHESS_OFFSET, DEFAULT_LICHESS_OFFSET)
  const start = position(p.start)
  const opts = { cache: 'bypass', priority: 'batch' }
  const root = await engine.evaluate(start, 'sweep', opts)
  const hp = await engine.humanPolicy(start, { bands: [band], opponentBand: band })
  if (hp === 'unavailable') throw new Error('Maia-2 is unavailable')
  const likely = Object.entries(hp.bands[0].policy).sort((a, b) => b[1] - a[1]).slice(0, 4)
  for (const [uci] of likely) {
    if (uci === solution[0]) continue
    const after = await engine.evaluate(child(start, uci), 'sweep', opts)
    const graded = classifyPly({ ply: 40, fenAfter: fenAfter(p.start, uci), uci, bestUci: root.best, before: root.score, after: after.score, standardStart: false })
    if (!ERRORS.includes(graded.cls)) continue
    return {
      game: p.id,
      index: 0,
      fen: p.start,
      mover,
      rating,
      played: { uci, san: sanOf(p.start, uci) },
      best: { uci: solution[0], san: sanOf(p.start, solution[0]), solution },
      source: { course: p.course, chapter: p.chapter, title: p.title, themes: p.themes ?? null, rating: p.rating ?? null },
    }
  }
  return null
}

const momentId = (m) => `${m.game}:${m.index}`
const moments = (arg('moments') ?? '').split(',').filter(Boolean).flatMap(readJsonl)
const wanted = arg('ids')
  ? (arg('ids') ?? '').split(',').filter(Boolean)
  : (arg('sample') ?? '').split(',').filter(Boolean).flatMap((p) => readJsonl(p).map((x) => x.id))
const byId = new Map(moments.map((m) => [momentId(m), m]))
const out = arg('out')
if (arg('rederive')) {
  // Reads every sheet's facts again from its stored search, with no engine. A sheet
  // made from a puzzle carries its own moment.
  const rows = arg('rederive').split(',').filter(Boolean).flatMap(readJsonl)
  const lines = rows.map((s) => {
    if (s.skip || !s.search) return JSON.stringify(s)
    try {
      const m = s.moment ?? byId.get(s.id)
      const sheet = sheetFrom(m, s.search)
      if (s.moment) sheet.moment = s.moment
      return JSON.stringify(sheet)
    } catch (e) {
      return JSON.stringify({ id: s.id, skip: String(e.message ?? e).slice(0, 120) })
    }
  })
  writeFileSync(out, lines.join('\n') + '\n')
  console.error(`rederived ${rows.length} sheets into ${out}`)
  process.exit(0)
}
if (arg('supplement')) {
  // Adds the searches a stored sheet lacks (the line after a puzzle's answer key), so
  // --rederive can read it with the current code.
  const rows = arg('supplement').split(',').filter(Boolean).flatMap(readJsonl)
  const engine = createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false })
  try {
    const lines = []
    for (const s of rows) {
      if (!s.skip && s.search && s.search.afterKey === undefined) s.search.afterKey = await afterKeyOf(engine, s.moment ?? byId.get(s.id))
      lines.push(JSON.stringify(s))
    }
    writeFileSync(out, lines.join('\n') + '\n')
  } finally {
    engine.dispose()
  }
  console.error(`supplemented ${rows.length} sheets into ${out}`)
  process.exit(0)
}
const [k, n] = (arg('shard') ?? '0/1').split('/').map(Number)
const done = new Set(out && existsSync(out) ? readJsonl(out).map((s) => s.id) : [])
// --puzzles reads puzzles in lichess_puzzles.py's shape and makes their moments here.
const puzzles = arg('puzzles') ? JSON.parse(readFileSync(arg('puzzles'), 'utf8')) : null
const puzzleById = new Map((puzzles ?? []).map((p) => [`${p.id}:0`, p]))
const todo = puzzles
  ? [...puzzleById.keys()].filter((id, i) => i % n === k && !done.has(id))
  : [...new Set(wanted)].filter((id, i) => i % n === k && byId.has(id) && !done.has(id))
const engine = createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false })
try {
  let made = 0
  const t0 = Date.now()
  for (const id of todo) {
    let sheet
    try {
      const m = puzzles ? await puzzleMoment(engine, puzzleById.get(id), Number(arg('rating', '1350'))) : byId.get(id)
      if (m && puzzles) m.split = 'train'
      sheet = m ? sheetFrom(m, await searchOf(engine, m)) : { id, skip: 'no likely error at the band' }
      if (m && puzzles) sheet.moment = m
    } catch (e) {
      if (String(e).includes('Maia-2 is unavailable')) throw e
      sheet = { id, skip: String(e.message ?? e).slice(0, 120) }
    }
    if (out) appendFileSync(out, JSON.stringify(sheet) + '\n')
    else console.log(JSON.stringify(sheet, null, 1))
    made++
    console.error(`shard ${k}/${n}: ${made} of ${todo.length} sheets, ${((Date.now() - t0) / made / 1000).toFixed(1)} s a sheet`)
  }
} finally {
  engine.dispose()
}
process.exit(0)
