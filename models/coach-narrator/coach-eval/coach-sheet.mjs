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
//   bridge/run.sh models/coach-narrator/coach-eval/coach-sheet.mjs --moments <a.jsonl,...> \
//     (--ids <id,...> | --sample <prompts.jsonl,...>) --out <sheets.jsonl> [--shard k/n]
//   bridge/run.sh models/coach-narrator/coach-eval/coach-sheet.mjs --puzzles <puzzles.json> --out <sheets.jsonl> [--shard k/n] [--rating 1350]
//   bridge/run.sh models/coach-narrator/coach-eval/coach-sheet.mjs --moments <a.jsonl,...> --rederive <sheets.jsonl,...> --out <sheets.jsonl>
//   bridge/run.sh models/coach-narrator/coach-eval/coach-sheet.mjs --moments <a.jsonl,...> --supplement <sheets.jsonl,...> --out <sheets.jsonl>
//
// --puzzles makes each puzzle's moment itself (puzzleMoment): Maia-2's likeliest error
// at the band as the move played, and the answer key as the better line.
//
// Each sheet keeps the engines' answers it was read from (`search`), and --rederive
// reads the facts again from them with no engine, after a change to how they are read.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess } from '../../../bridge/lib/chess.mjs'
import { PIECE, fenAfter, lineFacts, listOf, other, pawns, said, sanOf, toMove } from './coach-lines.mjs'

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
  const how = [...facts.idea, ...facts.also].filter((x) => x.ply === 1).map((x) => x.text)
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
  const looseText = (h) => K.HANGING_PHRASE?.[h.kind] ?? `is loose (${h.kind})`
  for (const h of K.hangingPieces(fen, them)) notice.push(`their ${PIECE[h.piece] ?? h.piece} on ${h.square} ${looseText(h)}`)
  if (safeBool(() => K.backRankWeakness(fen, them))) notice.push('their king is boxed in on its back rank by its own pieces')
  else if (theirKing?.signs?.includes('noSafeSquares')) notice.push(`their king on ${theirKing.king} has no safe square to step to`)
  const checks = legal.filter((x) => /[+#]/.test(x.san)).map((x) => x.san)
  notice.push(checks.length ? `your checks: ${checks.join(', ')}` : 'you have no checks')
  for (const h of K.hangingPieces(fen, pov)) notice.push(`your own ${PIECE[h.piece] ?? h.piece} on ${h.square} ${looseText(h)}`)
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
