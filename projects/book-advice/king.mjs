// 1b: the books' warning signs of danger to one's own king, scored against
// the engine by the README's rule.
//
//   bridge/run.sh projects/book-advice/king.mjs [--pool 4]
//
// Reads the positions scan.mjs drew (private/book-advice/scan-king.json),
// keeps each position's signs and threat under private/book-advice/, and
// writes counts only to results/king.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { share } from './lib.mjs'

const C = await chess('src/core/chess/index.ts')
const Sc = await chess('src/core/score/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const { kingFacts } = await chess('src/services/knowledge/facts/king.ts')

const PRIVATE = privateDir('book-advice')
const ROWS = join(PRIVATE, 'king-rows.json')
const GROUPS = ['his', 'above', 'archive']
const arg = (name, d) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? Number(process.argv[i + 1]) : d
}
const SIGNS = ['noSafeSquares', 'queenOnExits', 'bishopAimedIn', 'approachingKnight', 'rookLift', 'hookPawn', 'oppositeStorm', 'plusTwo']
const BAR = { shows: 0.02, lift: 1.5, floor: 1.25 }

const FILES = 'abcdefgh'
const sq = (f, r) => (f >= 0 && f < 8 && r >= 0 && r < 8 ? `${FILES[f]}${r + 1}` : null)
const fileOf = (s) => FILES.indexOf(s[0])
const rankOf = (s) => Number(s[1]) - 1
const other = (c) => (c === 'w' ? 'b' : 'w')
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]]

function zoneOf(king, color) {
  const f = fileOf(king)
  const r = rankOf(king)
  const dir = color === 'w' ? 1 : -1
  const out = new Set()
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) out.add(sq(f + df, r + dr))
    out.add(sq(f + df, r + 2 * dir))
  }
  out.delete(null)
  return out
}

/** Squares a rook on `from` attacks over `occupied`. */
function rookRays(from, occupied) {
  const out = []
  for (const [df, dr] of ROOK) {
    let f = fileOf(from) + df
    let r = rankOf(from) + dr
    while (sq(f, r)) {
      const s = sq(f, r)
      out.push(s)
      if (occupied.has(s)) break
      f += df
      r += dr
    }
  }
  return out
}

/** The squares a pawn of `color` on `s` attacks. */
const pawnHits = (s, color) => [sq(fileOf(s) - 1, rankOf(s) + (color === 'w' ? 1 : -1)), sq(fileOf(s) + 1, rankOf(s) + (color === 'w' ? 1 : -1))].filter(Boolean)

function signsOf(fen) {
  const board = K.tryBoard(fen)
  const me = board.turn
  const them = other(me)
  const king = board.king(me)
  const enemyKing = board.king(them)
  const zone = zoneOf(king, me)
  const ring = [...zone].filter((s) => Math.max(Math.abs(fileOf(s) - fileOf(king)), Math.abs(rankOf(s) - rankOf(king))) === 1)
  const theirs = board.pieces(them)
  const mine = board.pieces(me)
  const occupied = new Set([...theirs, ...mine].map((p) => p.square))
  const hitsZone = (b, from, color) => [...zone].some((z) => b.attackers(z, color).includes(from))
  const themToMove = board.turnedTo(them)
  const theirMoves = themToMove.moves()
  const joins = (b, mv) => hitsZone(b.child(mv), mv.to, mv.color)

  const facts = kingFacts(board, me)
  const noSafeSquares = facts.escapes.length === 0

  const queens = theirs.filter((p) => p.type === 'q').map((p) => p.square)
  const queenOnExits = ring.some((s) => board.get(s)?.color !== me && queens.some((q) => board.attackers(s, them).includes(q)))

  let bishopAimedIn = false
  for (const b of theirs.filter((p) => p.type === 'b')) {
    for (const [df, dr] of BISHOP) {
      let pawns = 0
      let f = fileOf(b.square) + df
      let r = rankOf(b.square) + dr
      while (sq(f, r) && !bishopAimedIn) {
        const s = sq(f, r)
        if (zone.has(s)) bishopAimedIn = true
        const on = board.get(s)
        if (on) {
          if (on.type !== 'p' || pawns > 0) break
          pawns++
        }
        f += df
        r += dr
      }
    }
  }

  const knights = theirs.filter((p) => p.type === 'n').map((p) => p.square)
  const knightReach = (s) => KNIGHT.map(([df, dr]) => sq(fileOf(s) + df, rankOf(s) + dr)).filter(Boolean)
  const approachingKnight = knights.some((n) => knightReach(n).some((t) => zone.has(t)) || theirMoves.some((mv) => mv.from === n && knightReach(mv.to).some((t) => zone.has(t))))

  let rookLift = false
  for (const rook of theirs.filter((p) => p.type === 'r').map((p) => p.square)) {
    const open = new Set(occupied)
    open.delete(rook)
    const reach = (from, dirs) => {
      const out = []
      for (const [df, dr] of dirs) {
        let f = fileOf(from) + df
        let r = rankOf(from) + dr
        while (sq(f, r)) {
          const s = sq(f, r)
          const on = board.get(s)
          if (on && s !== rook && on.color === them) break
          out.push(s)
          if (open.has(s)) break
          f += df
          r += dr
        }
      }
      return out
    }
    const lifted = reach(rook, [[0, 1], [0, -1]])
    const second = [rook, ...lifted, ...lifted.flatMap((s) => reach(s, ROOK))]
    if (second.some((s) => rookRays(s, open).some((t) => zone.has(t)))) {
      rookLift = true
      break
    }
  }

  const start = me === 'w' ? 1 : 6
  const kf = fileOf(king)
  const theirPawns = theirs.filter((p) => p.type === 'p').map((p) => p.square)
  const step = them === 'w' ? 1 : -1
  const pawnCanReach = (p, target) => {
    if (fileOf(p) !== fileOf(target)) return false
    if (p === target) return true
    const dist = (rankOf(target) - rankOf(p)) * step
    if (dist <= 0) return false
    for (let k = 1; k <= dist; k++) if (board.get(sq(fileOf(p), rankOf(p) + k * step))) return false
    return true
  }
  const hookPawn = mine
    .filter((p) => p.type === 'p' && Math.abs(fileOf(p.square) - kf) <= 1 && rankOf(p.square) !== start)
    .some((p) => {
      const contact = [sq(fileOf(p.square) - 1, rankOf(p.square) + (me === 'w' ? 1 : -1)), sq(fileOf(p.square) + 1, rankOf(p.square) + (me === 'w' ? 1 : -1))].filter(Boolean)
      return contact.some((c) => theirPawns.some((tp) => pawnCanReach(tp, c)))
    })

  const wing = (s) => (fileOf(s) <= 2 ? 'q' : fileOf(s) >= 5 ? 'k' : null)
  const theirStart = them === 'w' ? 1 : 6
  const oppositeStorm =
    wing(king) !== null &&
    wing(enemyKing) !== null &&
    wing(king) !== wing(enemyKing) &&
    theirPawns.some((p) => Math.abs(fileOf(p) - kf) <= 1 && (rankOf(p) - theirStart) * step >= 2)

  const attackers = new Set()
  for (const p of theirs) {
    if (p.type === 'k') continue
    if (hitsZone(board, p.square, them)) attackers.add(p.square)
  }
  for (const mv of theirMoves) {
    if (mv.piece === 'k' || attackers.has(mv.from)) continue
    if (mv.piece === 'p' && mv.isCapture()) continue
    if (joins(themToMove, mv)) attackers.add(mv.from)
  }
  const defenders = new Set()
  for (const p of mine) {
    if (p.type === 'k' || p.type === 'p') continue
    if (hitsZone(board, p.square, me)) defenders.add(p.square)
  }
  for (const mv of board.moves()) {
    if (mv.piece === 'k' || mv.piece === 'p' || defenders.has(mv.from)) continue
    if (joins(board, mv)) defenders.add(mv.from)
  }
  const plusTwo = attackers.size - defenders.size >= 2

  return {
    noSafeSquares,
    queenOnExits,
    bishopAimedIn,
    approachingKnight,
    rookLift,
    hookPawn,
    oppositeStorm,
    plusTwo,
    attackers: attackers.size,
    defenders: defenders.size,
  }
}

async function run() {
  const E = await chess('src/adapters/node/engine/index.ts')
  const drawn = JSON.parse(readFileSync(join(PRIVATE, 'scan-king.json'), 'utf8'))
  const done = existsSync(ROWS) ? JSON.parse(readFileSync(ROWS, 'utf8')) : {}
  const eng = E.createNodeEngine({ root: CHESS_DIR, pool: arg('pool', 4), tablebase: false, evalCache: false, human: false })
  const t0 = Date.now()
  let n = 0
  for (const group of GROUPS) {
    done[group] ??= {}
    await Promise.all(
      drawn[group].slice(0, arg('limit', Infinity)).map(async (x) => {
        const k = `${x.id}:${x.color}:${x.ply}`
        if (done[group][k]) return
        const flipped = K.flipTurn(x.fen)
        if (!flipped) return
        try {
          const r = await eng.evaluate(C.position(flipped), 'check', { priority: 'batch' })
          const words = Sc.evalWords(r.eval, other(x.fen.split(' ')[1]))
          done[group][k] = { ...signsOf(x.fen), mateThreat: words.startsWith('mate in'), swing: x.swing }
        } catch (e) {
          console.error(`${k}: ${e.message}`)
        }
        if (++n % 500 === 0) {
          console.error(`${n} read, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
          writeFileSync(ROWS, JSON.stringify(done) + '\n')
        }
      }),
    )
    writeFileSync(ROWS, JSON.stringify(done) + '\n')
  }
  eng.dispose()

  const truths = {
    danger: (r) => r.mateThreat || r.swing,
    mateThreat: (r) => r.mateThreat,
    swing: (r) => r.swing,
  }
  const lift = (p, base) => (p === null || base === null || base === 0 ? null : Math.round((p / base) * 1000) / 1000)
  const groups = {}
  for (const group of GROUPS) {
    const rows = Object.values(done[group])
    const out = { positions: rows.length, base: {}, signs: {} }
    for (const [t, isTrue] of Object.entries(truths)) out.base[t] = share(rows.filter(isTrue).length, rows.length)
    for (const s of [...SIGNS, 'any']) {
      const has = (r) => (s === 'any' ? SIGNS.some((x) => r[x]) : r[s])
      const shown = rows.filter(has)
      const sign = { shows: share(shown.length, rows.length) }
      for (const [t, isTrue] of Object.entries(truths)) {
        const precision = share(shown.filter(isTrue).length, shown.length)
        const recall = share(shown.filter(isTrue).length, rows.filter(isTrue).length)
        sign[t] = { precision, recall, lift: lift(precision.p, out.base[t].p) }
      }
      const base = out.base.danger
      sign.clears =
        group === 'his'
          ? sign.shows.p !== null &&
            sign.shows.p >= BAR.shows &&
            sign.danger.lift !== null &&
            sign.danger.lift >= BAR.lift &&
            sign.danger.precision.ci !== null &&
            sign.danger.precision.ci[0] >= BAR.floor * base.p
          : null
      out.signs[s] = sign
    }
    const counts = rows.map((r) => r.attackers - r.defenders)
    out.attackersMinusDefenders = Object.fromEntries([...new Set(counts)].sort((a, b) => a - b).map((d) => [d, share(rows.filter((r, i) => counts[i] === d && truths.danger(r)).length, rows.filter((r, i) => counts[i] === d).length)]))
    groups[group] = out
  }
  const summary = {
    app: CHESS_DIR.split('/').pop(),
    budget: 'check',
    bar: BAR,
    seconds: Math.round((Date.now() - t0) / 1000),
    warnings: SIGNS.filter((s) => groups.his.signs[s].clears),
    groups,
  }
  writeFileSync(join(resultsDir('book-advice'), 'king.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify({ warnings: summary.warnings, base: groups.his.base, his: Object.fromEntries(Object.entries(groups.his.signs).map(([k, v]) => [k, { shows: v.shows.p, precision: v.danger.precision.p, lift: v.danger.lift, mateLift: v.mateThreat.lift, swingLift: v.swing.lift }])) }, null, 2))
}

if (process.argv[2] === 'signs') {
  for (const fen of process.argv.slice(3)) console.log(fen, JSON.stringify(signsOf(fen)))
} else await run()
