// 1e: in lost positions, does the move whose winning reply is hardest to find
// at the opponent's band save more games than the engine's top move? By the
// README's rule.
//
//   bridge/run.sh projects/book-advice/practical.mjs [--pool 4]
//
// Reads the positions scan.mjs drew (private/book-advice/scan-practical.json),
// keeps each position's reading under private/book-advice/, and writes counts
// only to results/practical.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { share } from './lib.mjs'

const C = await chess('src/core/chess/index.ts')
const Sc = await chess('src/core/score/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const ES = await chess('src/services/engine/index.ts')

const PRIVATE = privateDir('book-advice')
const ROWS = join(PRIVATE, 'practical-rows.json')
const GROUPS = ['his', 'above', 'archive']
const arg = (name, d) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? Number(process.argv[i + 1]) : d
}
const BEHIND = -250
const WITHIN = 100
const COVER = 0.85
const REPLIES = 6
const BAR = { differs: 0.25, extraSaves: 0.03 }

const other = (c) => (c === 'w' ? 'b' : 'w')
const isMate = (e, pov) => /mate/.test(Sc.evalWords(e, pov))

/** What a candidate shows of the books' resources, on the board. */
function resources(fen, uci) {
  const board = K.tryBoard(fen)
  const mv = board.findUci(uci)
  const after = board.child(mv)
  return {
    check: after.inCheck(),
    capture: Boolean(mv.captured),
    passed: mv.piece === 'p' && K.isPassed(after, mv.to, mv.color),
    stalemate: after.moves().some((r) => after.child(r).isStalemate()),
  }
}

async function chanceOf(eng, fen, uci, mover, self, oppo) {
  const after = C.position(fen, [uci])
  const h = await eng.humanPolicy(after, { bands: [oppo], opponentBand: self })
  if (h === 'unavailable') throw new Error('Maia is unavailable')
  const ranked = Object.entries(h.bands[0].policy).sort((a, b) => b[1] - a[1])
  const replies = []
  let covered = 0
  for (const [move, p] of ranked) {
    if (replies.length >= REPLIES || covered >= COVER) break
    replies.push(move)
    covered += p
  }
  if (replies.length === 0) return { chance: 0, covered: 0, replies: 0 }
  const set = await eng.bestMoves(after, { budget: 'grade', multiPv: replies.length, restrictTo: replies, priority: 'batch' })
  const policy = h.bands[0].policy
  let chance = 0
  let scored = 0
  for (const l of set.lines) {
    if (!replies.includes(l.move)) continue
    scored += policy[l.move]
    if (Sc.povCp(l.eval, mover) > BEHIND) chance += policy[l.move]
  }
  return { chance, covered: scored, replies: replies.length }
}

async function run() {
  const E = await chess('src/adapters/node/engine/index.ts')
  const drawn = JSON.parse(readFileSync(join(PRIVATE, 'scan-practical.json'), 'utf8'))
  const done = existsSync(ROWS) ? JSON.parse(readFileSync(ROWS, 'utf8')) : {}
  const eng = E.createNodeEngine({ root: CHESS_DIR, pool: arg('pool', 4), tablebase: false, evalCache: false })
  const t0 = Date.now()
  let n = 0
  for (const group of GROUPS) {
    done[group] ??= {}
    const elo = (r) => (group === 'archive' ? (r === null ? null : ES.toLichess(r)) : r)
    await Promise.all(
      drawn[group].slice(0, arg('limit', Infinity)).map(async (x) => {
        const k = `${x.id}:${x.color}:${x.ply}`
        if (done[group][k]) return
        const self = elo(x.rating)
        const oppo = elo(x.oppRating)
        if (self === null || oppo === null) return
        try {
          const set = await eng.bestMoves(C.position(x.fen), { budget: 'verify', multiPv: 3, priority: 'batch' })
          const top = set.lines[0]
          if (!top) return
          const topCp = Sc.povCp(top.eval, x.color)
          if (isMate(top.eval, x.color) || topCp > BEHIND) {
            done[group][k] = { kept: false, topCp }
            return
          }
          const near = set.lines.filter((l) => !isMate(l.eval, x.color) && topCp - Sc.povCp(l.eval, x.color) <= WITHIN).map((l) => l.move)
          const moves = [...new Set([...near, x.played])]
          const reads = {}
          for (const m of moves) reads[m] = { ...(await chanceOf(eng, x.fen, m, x.color, self, oppo)), ...resources(x.fen, m) }
          let practical = top.move
          for (const m of near) if (reads[m].chance > reads[practical].chance) practical = m
          done[group][k] = {
            kept: true,
            topCp,
            top: top.move,
            practical,
            near: near.length,
            reads,
            played: x.played,
            saved: x.saved,
            threwAway: x.threwAway,
          }
        } catch (e) {
          console.error(`${k}: ${e.message}`)
        }
        if (++n % 100 === 0) {
          console.error(`${n} read, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
          writeFileSync(ROWS, JSON.stringify(done) + '\n')
        }
      }),
    )
    writeFileSync(ROWS, JSON.stringify(done) + '\n')
  }
  eng.dispose()
  return Math.round((Date.now() - t0) / 1000)
}

const seconds = process.argv.includes('--summary') ? null : await run()
const done = JSON.parse(readFileSync(ROWS, 'utf8'))
const r4 = (x) => (x === null ? null : Math.round(x * 1e4) / 1e4)
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

function report(rows) {
  const kept = rows.filter((r) => r.kept)
  const observed = kept.filter((r) => r.threwAway !== null)
  const s1 = share(observed.filter((r) => r.threwAway && r.saved).length, observed.filter((r) => r.threwAway).length)
  const s0 = share(observed.filter((r) => !r.threwAway && r.saved).length, observed.filter((r) => !r.threwAway).length)
  const lift = s1.p !== null && s0.p !== null ? s1.p - s0.p : null

  const calib = [...observed].sort((a, b) => a.reads[a.played].chance - b.reads[b.played].chance)
  const thirds = [0, 1, 2].map((i) => {
    const part = calib.slice(Math.floor((i * calib.length) / 3), Math.floor(((i + 1) * calib.length) / 3))
    const obs = share(part.filter((r) => r.threwAway).length, part.length)
    const predicted = mean(part.map((r) => r.reads[r.played].chance))
    return { n: part.length, predicted: r4(predicted), observed: obs, inside: obs.ci !== null && predicted !== null && predicted >= obs.ci[0] && predicted <= obs.ci[1] }
  })
  const fair = thirds[0].observed.ci !== null && thirds[2].observed.ci !== null && thirds[2].observed.ci[0] > thirds[0].observed.ci[1] && thirds.filter((t) => t.inside).length >= 2

  const differ = kept.filter((r) => r.practical !== r.top)
  const gain = differ.map((r) => r.reads[r.practical].chance - r.reads[r.top].chance)
  const extraSaves = lift === null || !gain.length ? null : mean(gain) * lift
  const byPlayed = (pick) => share(kept.filter(pick).filter((r) => r.saved).length, kept.filter(pick).length)
  const res = (key, pick) => share(differ.filter(pick).length, differ.length)
  return {
    positions: rows.length,
    kept: kept.length,
    s1,
    s0,
    calibration: thirds,
    fair,
    differs: share(differ.length, kept.length),
    meanGain: r4(mean(gain)),
    extraSavesPerPosition: r4(extraSaves),
    meanChance: { top: r4(mean(kept.map((r) => r.reads[r.top].chance))), practical: r4(mean(kept.map((r) => r.reads[r.practical].chance))) },
    covered: r4(mean(kept.flatMap((r) => Object.values(r.reads).map((x) => x.covered)))),
    savedByPlayed: {
      top: byPlayed((r) => r.played === r.top),
      practical: byPlayed((r) => r.practical !== r.top && r.played === r.practical),
      other: byPlayed((r) => r.played !== r.top && r.played !== r.practical),
    },
    resources: {
      check: res('check', (r) => r.reads[r.practical].check),
      keepsPiecesOn: res('keeps', (r) => r.reads[r.top].capture && !r.reads[r.practical].capture),
      passed: res('passed', (r) => r.reads[r.practical].passed),
      stalemate: res('stalemate', (r) => r.reads[r.practical].stalemate),
    },
  }
}

const groups = Object.fromEntries(GROUPS.map((g) => [g, report(Object.values(done[g] ?? {}))]))
const his = groups.his
const savesMore = his.fair && his.differs.p !== null && his.differs.p >= BAR.differs && his.extraSavesPerPosition !== null && his.extraSavesPerPosition >= BAR.extraSaves
const summary = {
  app: CHESS_DIR.split('/').pop(),
  budgets: { lines: 'verify', replies: 'grade' },
  behindCp: BEHIND,
  withinCp: WITHIN,
  replies: { cover: COVER, most: REPLIES },
  bar: BAR,
  seconds,
  savesMore,
  groups,
}
writeFileSync(join(resultsDir('book-advice'), 'practical.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ savesMore, his }, null, 2))
