// Coaching sheets: the facts a puzzle-book explanation of a moment rests on, read with
// the app's own code and engines, so a writer can coach the moment without judging the
// chess itself. For a moment (the position, the side to move and the move played) the
// sheet holds
// - what to notice before choosing a move: the opponent's loose pieces, a king boxed in
//   on its back rank or with no safe square, the checks and captures the player has,
//   and the player's own loose pieces;
// - the candidates a player at the band would weigh: Maia-2's likeliest moves, the
//   engine's best three and the move played, each with the engine's verdict and, for a
//   move that fails, the reply that refutes it, the line, what the line wins and the
//   tactic it carries out (line-tactics.mjs);
// - the better move's line move by move, with what each move does, the idea of the line
//   (line-tactics.mjs's point tier), what else it does (its also tier) and how it ends.
// A line is cut where its material settles or it mates, so the tactic named is the one
// that wins, not one ten moves later.
//
//   bridge/run.sh projects/coach-eval/coach-sheet.mjs --moments <a.jsonl,...> \
//     (--ids <id,...> | --sample <prompts.jsonl,...>) --out <sheets.jsonl> [--shard k/n]
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
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
const said = (fen, uci, pov) => K.moveReasons(fen, uci).map((r) => K.reasonText(r, 'clause', pov))

/**
 * The part of a line that carries its point: up to its mate, or to the first position
 * after the opponent's reply where the solver's material gain is at its highest within
 * the first `cap` plies. A line that wins nothing keeps its first six plies.
 */
function settle(fen, pv, cap = 12) {
  const b = new Chess(fen)
  const solver = b.turn()
  const start = K.materialFor(fen, solver)
  let best = { at: Math.min(6, pv.length), net: 0 }
  for (let i = 0; i < Math.min(pv.length, cap); i++) {
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
  return { pv: pv.slice(0, best.at), net: best.net, mate: false }
}

/** A sentence for each concept a line carries out, naming the move and the pieces. */
function conceptSentences(fen, pv, signals, rule, pov) {
  const fens = [fen]
  for (const u of pv) fens.push(fenAfter(fens[fens.length - 1], u))
  const lineMover = new Chess(fen).turn()
  const out = []
  for (const [concept, from] of lineConcepts(signals, rule)) {
    const step = from.k === null ? null : signals.steps[from.k]
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

/** A line move by move, with what each move does. */
function annotate(fen, pv, pov) {
  const out = []
  let f = fen
  for (const uci of pv) {
    let mv
    try {
      mv = toMove(f, uci)
    } catch {
      break
    }
    out.push({ move: mv.san, by: mv.color === pov ? 'you' : 'they', does: said(f, uci, pov) })
    f = fenAfter(f, uci)
  }
  return out
}

/** What a line wins, from the side that plays it. */
function outcome(settled, mover, pov) {
  const who = mover === pov ? 'you' : 'they'
  if (settled.mate) return `${who} mate`
  if (settled.net >= 1) return `${who} come out ${settled.net} point${settled.net === 1 ? '' : 's'} of material ahead of where the line starts`
  return 'no material changes hands for good in the line'
}

/** A line's tactics: its point and what else it does, with the line it was read on. */
function lineFacts(fen, pv, pov, before = null, lastSan = null) {
  const settled = settle(fen, pv)
  const signals = lineSignals({ fen, pv: settled.pv, before, lastSan })
  return {
    line: annotate(fen, settled.pv, pov),
    idea: conceptSentences(fen, settled.pv, signals, RULES.point, pov),
    also: conceptSentences(fen, settled.pv, signals, SHEET_ALSO, pov),
    result: outcome(settled, new Chess(fen).turn(), pov),
  }
}

async function sheetOf(engine, m) {
  const fen = m.fen
  const pov = m.mover
  const them = other(pov)
  const band = defaultMaiaElo((m.rating ?? 1350) - DEFAULT_LICHESS_OFFSET, DEFAULT_LICHESS_OFFSET)
  const start = position(fen)
  const root = await engine.evaluate(start, 'deep', { cache: 'bypass', priority: 'batch' })
  const set = await engine.bestMoves(start, { budget: 'deep', multiPv: 3, cache: 'bypass', priority: 'batch' })
  const top = (set.lines.length ? set.lines : set.provisional ?? []).filter((l) => l.pv?.length)
  const hp = await engine.humanPolicy(start, { bands: [band], opponentBand: band })
  const likely = hp === 'unavailable' ? [] : Object.entries(hp.bands[0].policy).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const engineLines = new Map(top.map((l, k) => [l.pv[0], { ...l, rank: k + 1 }]))
  const order = [...new Set([...top.map((l) => l.pv[0]), ...likely.map(([u]) => u), m.played.uci])]
  const candidates = []
  for (const uci of order) {
    const line = engineLines.get(uci)
    let score = line?.score ?? null
    let pv = line?.pv ?? null
    if (!line) {
      const after = await engine.evaluate(child(start, uci), 'deep', { cache: 'bypass', priority: 'batch' })
      score = after.score
      pv = [uci, ...(after.pv ?? [])]
    }
    const graded = classifyPly({ ply: 40, fenAfter: fenAfter(fen, uci), uci, bestUci: root.best, before: root.score, after: score, standardStart: false })
    const san = sanOf(fen, uci)
    const c = {
      move: san,
      played: uci === m.played.uci,
      engine_rank: line ? line.rank : null,
      share_of_players_at_your_level: Math.round((likely.find(([u]) => u === uci)?.[1] ?? 0) * 100) / 100,
      verdict: graded.cls,
      evaluation: pawns(score, pov),
      what_it_does: said(fen, uci, pov),
    }
    if (['inaccuracy', 'mistake', 'blunder', 'miss'].includes(graded.cls)) {
      const f1 = fenAfter(fen, uci)
      const answer = line ? await engine.evaluate(child(start, uci), 'deep', { cache: 'bypass', priority: 'batch' }) : null
      const replyPv = answer?.pv?.length ? answer.pv : pv.slice(1)
      if (replyPv.length) {
        const reply = lineFacts(f1, replyPv, pov, fen, san)
        c.why_not = { reply: reply.line[0]?.move ?? null, ...reply }
      }
    }
    candidates.push(c)
  }
  const bestPv = root.pv?.length && (!top[0] || root.pv[0] === top[0].pv[0]) ? root.pv : top[0]?.pv ?? []
  const legal = new Chess(fen).moves({ verbose: true })
  const theirKing = K.kingDanger(fen, them)
  const notice = []
  for (const h of K.hangingPieces(fen, them)) notice.push(`their ${PIECE[h.piece] ?? h.piece} on ${h.square} is loose (${h.kind})`)
  if (safeBool(() => K.backRankWeakness(fen, them))) notice.push('their king is boxed in on its back rank by its own pieces')
  else if (theirKing?.signs?.includes('noSafeSquares')) notice.push(`their king on ${theirKing.king} has no safe square to step to`)
  const checks = legal.filter((x) => /[+#]/.test(x.san)).map((x) => x.san)
  notice.push(checks.length ? `your checks: ${checks.join(', ')}` : 'you have no checks')
  const captures = legal.filter((x) => x.captured).map((x) => x.san)
  if (captures.length) notice.push(`your captures: ${captures.join(', ')}`)
  for (const h of K.hangingPieces(fen, pov)) notice.push(`your ${PIECE[h.piece] ?? h.piece} on ${h.square} is loose (${h.kind})`)
  const best = lineFacts(fen, bestPv, pov)
  return {
    id: `${m.game}:${m.index}`,
    you_play: pov === 'w' ? 'White' : 'Black',
    level: m.rating ?? null,
    fen,
    move_played: m.played.san,
    what_to_notice: notice,
    candidates,
    better_move: { move: bestPv.length ? sanOf(fen, bestPv[0]) : null, evaluation: pawns(top[0]?.score ?? root.score, pov), ...best },
    engine: { lines: set.lines.length, provisional: set.provisional?.length ?? 0, maia_band: band },
    source: m.source ?? null,
  }
}

function safeBool(f) {
  try {
    return !!f()
  } catch {
    return false
  }
}

const momentId = (m) => `${m.game}:${m.index}`
const moments = (arg('moments') ?? '').split(',').filter(Boolean).flatMap(readJsonl)
const wanted = arg('ids')
  ? (arg('ids') ?? '').split(',').filter(Boolean)
  : (arg('sample') ?? '').split(',').filter(Boolean).flatMap((p) => readJsonl(p).map((x) => x.id))
const byId = new Map(moments.map((m) => [momentId(m), m]))
const [k, n] = (arg('shard') ?? '0/1').split('/').map(Number)
const out = arg('out')
const done = new Set(out && existsSync(out) ? readJsonl(out).map((s) => s.id) : [])
const todo = [...new Set(wanted)].filter((id, i) => i % n === k && byId.has(id) && !done.has(id))
const engine = createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false })
try {
  let made = 0
  const t0 = Date.now()
  for (const id of todo) {
    let sheet
    try {
      sheet = await sheetOf(engine, byId.get(id))
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
