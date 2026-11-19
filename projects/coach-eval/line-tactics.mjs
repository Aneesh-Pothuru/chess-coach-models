// The tactic a whole line carries out, read with the app's own board code. A coaching
// explanation names what the winning line does, not only its first move: the check
// that drags the king into a fork, the capture that deflects the last defender, the
// quiet move before the mate. The app's detectors read one move at a time, and its
// misses deck names the first move only (`themeOfBest`). This script runs the same
// detectors at every one of the solver's moves in a line, adds how the line ends (mate
// and the mate's shape, a promotion, material given and won back), and measures the
// words against the themes Lichess's tagger gives its puzzles.
//
//   signals   every detector's answer at every solver move of each puzzle of a set,
//             to private/coach-eval/line-tactics/signals-<set>-<k>-of-<n>.jsonl
//   score     the words a rule takes from the signals, scored per concept against the
//             puzzles' themes (precision and recall, Wilson intervals), beside the
//             app's first-move labeller and its blunder labeller; --sources breaks the
//             line rule's words down by detector and move
//
//   bridge/run.sh projects/coach-eval/line-tactics.mjs signals --set app|heldout|coach [--shard k/n] [--limit n]
//   bridge/run.sh projects/coach-eval/line-tactics.mjs score --set app|heldout|coach --shards n [--sources]
//
// Sets: app, the puzzles the app ships (the development set); heldout, the seeded
// sample line_sample.py draws (the test set); coach, coach-eval's 1,200 Lichess
// puzzles, 60 for each of 20 themes.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'

const K = await chess('src/services/knowledge/index.ts')

const PROJECT = 'coach-eval'
const OUT = join(privateDir(PROJECT), 'line-tactics')

const safe = (f) => {
  try {
    return f() ?? null
  } catch {
    return null
  }
}
const move = (board, uci) => board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/**
 * Every detector's answer at every solver move of a line. `fen` has the solver to
 * move and `pv` starts with the solver's move; `before` and `lastSan`, when known,
 * are the position before the opponent's last move and that move, which an
 * in-between move answers.
 */
export function lineSignals({ fen, pv, before = null, lastSan = null }) {
  const board = new Chess(fen)
  const solver = board.turn()
  const fens = [fen]
  const sans = []
  const mvs = []
  for (const uci of pv) {
    const mv = safe(() => move(board, uci))
    if (!mv) break
    mvs.push(mv)
    sans.push(mv.san)
    fens.push(board.fen())
  }
  const n = sans.length
  const start = K.materialFor(fen, solver)
  let low = 0
  const steps = []
  for (let i = 0; i < n; i++) {
    const f = fens[i]
    const net = K.materialFor(fens[i + 1], solver) - start
    if (new Chess(f).turn() !== solver) {
      low = Math.min(low, net)
      continue
    }
    const uci = pv[i]
    const san = sans[i]
    const rest = pv.slice(i, n)
    const prevFen = i === 0 ? before : fens[i - 1]
    const prevSan = i === 0 ? lastSan : sans[i - 1]
    const fork = safe(() => K.detectFork(f, san))
    const describe = safe(() => K.describeMove(f, uci, { replyPv: rest.slice(1) })?.findings) ?? []
    const checkers = checkersAfter(fens[i + 1], solver)
    const reply = mvs[i + 1]
    steps.push({
      k: steps.length,
      ply: i + 1,
      san,
      uci,
      best: safe(() => K.themeOfBest(f, san, rest)),
      fork: fork ? { by: fork.bySquare, targets: fork.targets } : null,
      themes: (safe(() => K.tacticalThemes(f, uci)) ?? []).map((t) => t.kind),
      describe: [...new Set(describe.filter((x) => x.tone === 'gain' && x.actor === solver).map((x) => x.conceptId))],
      deflection: rest.length >= 3 ? safe(() => K.detectDeflection(f, rest)) : null,
      attraction: rest.length >= 3 ? safe(() => K.detectAttraction(f, rest)) : null,
      capturingDefender: rest.length >= 3 ? safe(() => K.detectCapturingDefender(f, rest)) : null,
      intermezzo: prevFen && prevSan && rest.length >= 3 ? safe(() => K.detectIntermezzo(prevFen, prevSan, rest)) : null,
      quiet: safe(() => K.quietMove(f, uci)) === true,
      promotion: uci.length === 5,
      check: /[+#]/.test(san),
      capture: san.includes('x'),
      checkers: checkers.length,
      discoveredCheck: checkers.some((s) => s !== uci.slice(2, 4)),
      taken: !!reply?.captured && reply.to === mvs[i].to,
      gave: VALUE[mvs[i].promotion ?? mvs[i].piece] - (mvs[i].captured ? VALUE[mvs[i].captured] : 0),
      kept: K.materialFor(fens[Math.min(i + 3, n)], solver) - K.materialFor(f, solver),
      net,
    })
  }
  const end = new Chess(fens[n])
  const mate = end.isCheckmate() && end.turn() !== solver
  return {
    plies: n,
    complete: n === pv.length,
    solverMoves: steps.length,
    mate,
    shape: mate ? safe(() => K.nameMate(fens[n]))?.id ?? null : null,
    backRank: mate ? boxedOnBackRank(fens[n]) : false,
    net: K.materialFor(fens[n], solver) - start,
    low,
    steps,
  }
}

const kingOf = (g, color) => g.board().flat().find((c) => c && c.type === 'k' && c.color === color)?.square

/** The squares the side not to move checks the king from. */
function checkersAfter(fen, by) {
  const g = new Chess(fen)
  if (!g.inCheck() || g.turn() === by) return []
  return g.attackers(kingOf(g, g.turn()), by)
}

/**
 * A back-rank mate in the teaching sense: a rook or queen mates along the king's back
 * rank, and every square in front of the king holds one of its own pieces, none of
 * which the mating side attacks, so the king's own pieces are what box it in.
 */
export function boxedOnBackRank(fen) {
  const g = new Chess(fen)
  if (!g.isCheckmate()) return false
  const loser = g.turn()
  const winner = loser === 'w' ? 'b' : 'w'
  const king = kingOf(g, loser)
  const back = loser === 'w' ? '1' : '8'
  if (king[1] !== back) return false
  const along = g.attackers(king, winner).some((s) => ['r', 'q'].includes(g.get(s).type) && s[1] === back)
  if (!along) return false
  const front = loser === 'w' ? '2' : '7'
  const file = king.charCodeAt(0) - 97
  const fronts = [file - 1, file, file + 1].filter((f) => f >= 0 && f < 8).map((f) => String.fromCharCode(97 + f) + front)
  return fronts.every((s) => g.get(s)?.color === loser && !g.isAttacked(s, winner))
}

/** The solver moves a rule reads a source at: the first, the later ones, or all of them. */
const at = (steps, where) => (where === 'first' ? steps.slice(0, 1) : where === 'later' ? steps.slice(1) : steps)

// The mate shapes the app's namer and Lichess's tagger agree on at least four times in
// five on both the development and the held-out set.
const AGREED_MATES = new Set(['smothered-mate', 'anastasia-mate', 'epaulette-mate', 'hook-mate'])
// The shapes that agree on the development set only.
const LOOSER_MATES = new Set(['arabian-mate', 'blind-swine-mate', 'opera-mate'])

/**
 * The concepts a line carries out, in two tiers. `point` holds the readings that agree
 * with Lichess's tagger at least four times in five on the held-out set, so a coaching
 * text can call them the idea of the line. `also` holds the other readings: what a
 * move does on the board, which the tagger often does not name as the puzzle's theme,
 * so a text may say it but not call it the point. The tiers were first fixed on the
 * development set (the app's pool; line-tactics-dev.mjs); the discovered attack, the
 * skewer, the trapped piece and three mate shapes then fell below four in five on the
 * held-out set and moved to `also` (results/line-tactics.md). The sacrifice joined
 * `point` once it counted only material still given up after the solver's next move.
 * Each entry names a source and the solver moves it is read at.
 */
export const RULES = {
  point: {
    mate: 'line',
    backRank: 'line',
    shape: 'line',
    promotion: 'all',
    fork: 'all',
    doubleCheck: 'all',
    attraction: 'all',
    sacrifice: 'all',
  },
  also: {
    discovered: 'all',
    skewerFirst: 'first',
    skewerLater: 'later',
    trapped: 'all',
    looserShape: 'line',
    pin: 'all',
    deflection: 'all',
    intermezzo: 'first',
    hanging: 'first',
    passed: 'all',
    quiet: 'later',
    capturingDefender: 'all',
    f2f7: 'first',
  },
}

/** Each source's concepts at one solver move. */
const SOURCES = {
  promotion: (s) => (s.promotion ? ['promotion'] : []),
  fork: (s) => (s.fork && !s.san.endsWith('#') ? ['fork'] : []),
  doubleCheck: (s) => (s.checkers >= 2 ? ['double-check'] : []),
  discovered: (s) => (s.discoveredCheck || s.themes.includes('discoveredAttack') || s.themes.includes('discoveredCheck') ? ['discovered-attack'] : []),
  skewerFirst: (s) => (s.themes.includes('skewer') ? ['skewer'] : []),
  skewerLater: (s) => (s.describe.includes('skewer') ? ['skewer'] : []),
  trapped: (s) => (s.best === 'trappedPiece' ? ['trapped-piece'] : []),
  attraction: (s) => (s.attraction?.attracted === 'k' ? ['attraction'] : []),
  pin: (s) => (s.themes.includes('pinAbsolute') ? ['pin'] : []),
  deflection: (s) => (s.deflection ? ['deflection'] : []),
  intermezzo: (s) => (s.intermezzo && !s.deflection && !s.capturingDefender && !s.attraction ? ['zwischenzug'] : []),
  hanging: (s) => (s.best === 'hangingPiece' ? ['hanging-piece'] : []),
  passed: (s) => (s.promotion || s.describe.includes('passed-pawn') ? ['passed-pawn'] : []),
  quiet: (s, i, steps) => (s.quiet && i < steps.length - 1 ? ['quiet-move'] : []),
  sacrifice: (s) => (s.taken && s.gave >= 2 && s.kept <= -2 ? ['sacrifice'] : []),
  capturingDefender: (s) => (s.capturingDefender ? ['removing-the-defender'] : []),
  f2f7: (s) => (s.best === 'attackingF2F7' ? ['f7-raid'] : []),
}

/** Concepts read off the whole line rather than one move. */
const LINE_SOURCES = {
  mate: (l) => (l.mate ? ['checkmate'] : []),
  backRank: (l) => (l.mate && l.backRank ? ['back-rank-mate'] : []),
  shape: (l) => (l.mate && AGREED_MATES.has(l.shape) ? [l.shape] : []),
  looserShape: (l) => (l.mate && LOOSER_MATES.has(l.shape) ? [l.shape] : []),
}

/** The concepts a tier takes from a line's signals, each with the source and the solver move it came from. */
export function lineConcepts(signals, rule = RULES.point) {
  const out = new Map()
  const add = (concept, from) => {
    if (!out.has(concept)) out.set(concept, from)
  }
  for (const [source, where] of Object.entries(rule)) {
    if (LINE_SOURCES[source]) {
      for (const c of LINE_SOURCES[source](signals)) add(c, { source, k: null })
      continue
    }
    const steps = at(signals.steps, where)
    for (const s of steps) {
      for (const c of SOURCES[source](s, s.k, signals.steps)) add(c, { source, k: s.k })
    }
  }
  return out
}

// Lichess's words for concepts the app's vocabulary does not resolve: the mates the
// app's catalogue names, and two words this script adds concepts for.
const EXTRA = {
  mate: 'checkmate',
  mateIn4: 'checkmate',
  mateIn5: 'checkmate',
  smotheredMate: 'smothered-mate',
  arabianMate: 'arabian-mate',
  anastasiaMate: 'anastasia-mate',
  bodenMate: 'bodens-mate',
  epauletteMate: 'epaulette-mate',
  hookMate: 'hook-mate',
  operaMate: 'opera-mate',
  cornerMate: 'corner-mate',
  killBoxMate: 'kill-box-mate',
  blindSwineMate: 'blind-swine-mate',
  morphysMate: 'morphy-mate',
  swallowstailMate: 'swallowtail-mate',
  sacrifice: 'sacrifice',
  quietMove: 'quiet-move',
}
const conceptOf = (word) => K.VOCABULARY[word] ?? EXTRA[word] ?? null

function puzzlesOf(set) {
  if (set === 'app') {
    const b = JSON.parse(readFileSync(join(CHESS_DIR, 'src/data/puzzles.json'), 'utf8'))
    const all = Array.isArray(b) ? b : Object.values(b).flat()
    return [...new Map(all.map((p) => [p.id, p])).values()].map((p) => ({ id: p.id, rating: p.rating, fen: p.fen, moves: p.moves.split(' '), themes: p.themes.split(' ').filter(Boolean) }))
  }
  if (set === 'heldout') {
    return JSON.parse(readFileSync(join(OUT, 'heldout.json'), 'utf8')).map((p) => ({ id: p.id, rating: p.rating, fen: p.fen, moves: p.moves.split(' '), themes: p.themes.split(' ').filter(Boolean) }))
  }
  if (set === 'coach') {
    const all = JSON.parse(readFileSync(join(privateDir(PROJECT), 'lichess-puzzles', 'puzzles.json'), 'utf8'))
    return all.map((p) => {
      const b = new Chess(p.start)
      const moves = []
      for (const san of p.main) {
        const mv = safe(() => b.move(san))
        if (!mv) break
        moves.push(`${mv.from}${mv.to}${mv.promotion ?? ''}`)
      }
      return { id: p.id, rating: p.rating, start: p.start, moves, themes: p.themes }
    })
  }
  throw new Error(`unknown set ${set}`)
}

/** A puzzle as the solver faces it: the position, the solution, and the blunder before it. */
function faced(p) {
  if (p.start) return { fen: p.start, pv: p.moves, before: null, lastSan: null, blunder: null }
  const b = new Chess(p.fen)
  const color = b.turn()
  const mv = move(b, p.moves[0])
  return { fen: b.fen(), pv: p.moves.slice(1), before: p.fen, lastSan: mv.san, blunder: { san: mv.san, color } }
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const isMain = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
const mode = isMain ? process.argv[2] : null
const set = arg('set', 'app')

if (mode === 'signals') {
  const [k, n] = arg('shard', '0/1').split('/').map(Number)
  const limit = Number(arg('limit', 'Infinity'))
  mkdirSync(OUT, { recursive: true })
  const path = join(OUT, `signals-${set}-${k}-of-${n}.jsonl`)
  const done = new Set(existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : [])
  let fresh = 0
  const t0 = Date.now()
  for (const [index, p] of puzzlesOf(set).entries()) {
    if (index % n !== k || done.has(p.id)) continue
    if (fresh >= limit) break
    const face = safe(() => faced(p))
    if (!face) {
      appendFileSync(path, JSON.stringify({ id: p.id, themes: p.themes, skip: 'does not replay' }) + '\n')
      continue
    }
    const row = { id: p.id, rating: p.rating, themes: p.themes, signals: lineSignals(face) }
    if (face.blunder) {
      const sign = face.blunder.color === 'w' ? -1 : 1
      const mateN = p.themes.map((t) => /^mateIn(\d)$/.exec(t)).find(Boolean)
      const afterScore = mateN ? { cp: null, mate: sign * Number(mateN[1]) } : { cp: sign * 500, mate: null }
      row.firstMove = row.signals.steps[0]?.best ?? null
      row.blunder = safe(() => K.blunderMotifs(face.before, face.blunder.san, face.fen, afterScore, face.pv, face.blunder.color)) ?? []
    } else {
      row.firstMove = row.signals.steps[0]?.best ?? null
    }
    appendFileSync(path, JSON.stringify(row) + '\n')
    fresh++
    if (fresh % 200 === 0) console.error(`${set} shard ${k}/${n}: ${done.size + fresh} done, ${((Date.now() - t0) / fresh).toFixed(0)} ms a puzzle`)
  }
  console.error(`${set} shard ${k}/${n}: ${fresh} new, ${done.size} before`)
} else if (mode === 'score') {
  const n = Number(arg('shards', '1'))
  const rows = []
  for (let k = 0; k < n; k++) {
    const path = join(OUT, `signals-${set}-${k}-of-${n}.jsonl`)
    rows.push(...readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
  }
  const ids = new Set(rows.map((r) => r.id))
  if (ids.size !== rows.length) throw new Error('duplicate puzzle rows')
  const scored = rows.filter((r) => !r.skip)
  const labellers = ['firstMove', 'blunder', 'point', 'all']
  const counts = Object.fromEntries(labellers.map((l) => [l, {}]))
  const bump = (l, c, key) => ((counts[l][c] ??= { tp: 0, fp: 0, fn: 0 })[key]++)
  const sources = {}
  const unmapped = {}
  const shapes = {}
  for (const r of scored) {
    const truth = new Set()
    for (const t of r.themes) {
      const c = conceptOf(t)
      if (c) truth.add(c)
      else unmapped[t] = (unmapped[t] ?? 0) + 1
    }
    if (r.signals.shape) shapes[r.signals.shape] = (shapes[r.signals.shape] ?? 0) + 1
    const point = new Set(lineConcepts(r.signals, RULES.point).keys())
    const said = {
      firstMove: new Set([conceptOf(r.firstMove)].filter(Boolean)),
      blunder: r.blunder ? new Set(r.blunder.map(conceptOf).filter(Boolean)) : null,
      point,
      all: new Set([...point, ...lineConcepts(r.signals, RULES.also).keys()]),
    }
    for (const l of labellers) {
      if (!said[l]) continue
      for (const c of said[l]) bump(l, c, truth.has(c) ? 'tp' : 'fp')
      for (const c of truth) if (!said[l].has(c)) bump(l, c, 'fn')
    }
    if (process.argv.includes('--sources')) {
      for (const [tier, rule] of Object.entries(RULES)) {
        for (const [source, where] of Object.entries(rule)) {
          const found = LINE_SOURCES[source]
            ? LINE_SOURCES[source](r.signals).map((c) => [c, 'line'])
            : at(r.signals.steps, where).flatMap((s) => SOURCES[source](s, s.k, r.signals.steps).map((c) => [c, s.k === 0 ? 'first' : 'later']))
          for (const [c, place] of found) {
            const x = (sources[`${tier} ${source}@${place} ${c}`] ??= { tp: 0, fp: 0 })
            x[truth.has(c) ? 'tp' : 'fp']++
          }
        }
      }
    }
  }
  const wilson = (k, n) => {
    if (!n) return null
    const z = 1.959964
    const ph = k / n
    const d = 1 + (z * z) / n
    const c = (ph + (z * z) / (2 * n)) / d
    const h = (z * Math.sqrt((ph * (1 - ph)) / n + (z * z) / (4 * n * n))) / d
    return [Math.round((c - h) * 1000) / 1000, Math.round((c + h) * 1000) / 1000]
  }
  const table = {}
  for (const l of labellers) {
    table[l] = {}
    for (const [c, x] of Object.entries(counts[l]).sort((a, b) => b[1].tp + b[1].fn - (a[1].tp + a[1].fn))) {
      const said = x.tp + x.fp
      const real = x.tp + x.fn
      table[l][c] = { ...x, precision: said ? x.tp / said : null, precisionCi: wilson(x.tp, said), recall: real ? x.tp / real : null, recallCi: wilson(x.tp, real) }
    }
  }
  const out = {
    project: PROJECT,
    analysis: 'line-tactics',
    set,
    app: CHESS_DIR.split('/').pop(),
    puzzles: scored.length,
    skipped: rows.length - scored.length,
    mates: Object.fromEntries(Object.entries(shapes).sort((a, b) => b[1] - a[1])),
    unmappedThemes: Object.fromEntries(Object.entries(unmapped).sort((a, b) => b[1] - a[1])),
    table,
  }
  if (process.argv.includes('--sources')) out.sources = Object.fromEntries(Object.entries(sources).sort((a, b) => a[0].localeCompare(b[0])))
  const dir = resultsDir(PROJECT)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `line-tactics-${set}.json`), JSON.stringify(out, null, 1) + '\n')
  for (const l of labellers) {
    console.log(`== ${l}`)
    for (const [c, x] of Object.entries(table[l])) {
      if (x.tp + x.fn === 0 && x.fp < 5) continue
      console.log(`${c.padEnd(24)} tp ${String(x.tp).padStart(5)} fp ${String(x.fp).padStart(5)} fn ${String(x.fn).padStart(5)}  P ${x.precision?.toFixed(2) ?? '  - '}  R ${x.recall?.toFixed(2) ?? '  - '}`)
    }
  }
  if (out.sources) {
    console.log('== sources (precision of each detector at the first or a later solver move)')
    for (const [s, x] of Object.entries(out.sources)) console.log(`${s.padEnd(48)} tp ${String(x.tp).padStart(5)} fp ${String(x.fp).padStart(5)}  P ${(x.tp / (x.tp + x.fp)).toFixed(2)}`)
  }
  console.log(JSON.stringify({ set, puzzles: out.puzzles, skipped: out.skipped, mates: out.mates }))
} else if (isMain) {
  throw new Error('usage: line-tactics.mjs signals|score --set app|heldout|coach')
}
if (isMain) process.exit(0)
