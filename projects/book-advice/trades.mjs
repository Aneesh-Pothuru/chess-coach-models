// 1c: the coach's "good trade" praise against the books' cautions, by the
// README's rule.
//
//   bridge/run.sh projects/book-advice/trades.mjs [--pool 4]
//
// Reads the trades scan.mjs drew (private/book-advice/scan-trades.json) and
// his faulted moves while ahead (scan-missed-trades.json), keeps each move's
// verdict and cases under private/book-advice/, and writes counts only to
// results/trades.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { share } from './lib.mjs'

const C = await chess('src/core/chess/index.ts')
const Sc = await chess('src/core/score/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const LC = await chess('src/services/livecoach/index.ts')
const P = await chess('src/services/livecoach/praise.ts')
const { kingFacts } = await chess('src/services/knowledge/facts/king.ts')

const PRIVATE = privateDir('book-advice')
const ROWS = join(PRIVATE, 'trades-rows.json')
const GROUPS = ['his', 'above', 'archive']
const arg = (name, d) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? Number(process.argv[i + 1]) : d
}
const POOL = arg('pool', 4)
const LIMIT = arg('limit', Infinity)
const CASES = ['activeForPassive', 'attackerTraded', 'queensOffAttacking', 'worseEnding']
const REASONS = ['takesActive', 'takesAttacker', 'onlyPawns']
const MOBILITY_GAP = 3
const SHARE_BAR = 0.05
const FAULT = K.PRAISE_LOSS_PCT
const LEAD = 2

const other = (c) => (c === 'w' ? 'b' : 'w')
const policy = LC.playPolicy({ strict: false, custom: false, tenSecondFloor: false })
const capturedOn = (san) => (san ? (/x([a-h][1-8])/.exec(san)?.[1] ?? null) : null)

/** The player's pieces (not pawns or the king) attacking the squares round `color`'s king, and those squares. */
function pressureOn(board, color) {
  const f = kingFacts(board, color)
  const by = f.ringAttackers.filter((s) => {
    const p = board.get(s)
    return p && p.type !== 'p' && p.type !== 'k'
  })
  const file = 'abcdefgh'.indexOf(f.square[0])
  const rank = Number(f.square[1])
  const ring = []
  for (let df = -1; df <= 1; df++)
    for (let dr = -1; dr <= 1; dr++) {
      const ff = file + df
      const rr = rank + dr
      if (ff >= 0 && ff < 8 && rr >= 1 && rr <= 8) ring.push(`${'abcdefgh'[ff]}${rr}`)
    }
  return { by, ring }
}

/** The books' cases against a trade, and the reasons for one, on the position before it. */
function readTrade(fen, uci) {
  const board = K.tryBoard(fen)
  const mv = board?.findUci(uci)
  if (!board || !mv || !mv.captured) return null
  const us = mv.color
  const them = other(us)
  const ours = board.movesFrom(mv.from).length
  const theirs = board.turnedTo(them).movesFrom(mv.to).length
  const attack = pressureOn(board, them)
  const attacking = attack.by.length >= 2
  const guardsTheirKing = attack.ring.some((s) => board.attackers(s, them).includes(mv.to))
  const defence = pressureOn(board, us)
  const hitsOurKing = defence.ring.some((s) => board.attackers(s, them).includes(mv.to))
  const pieces = board.pieces().filter((p) => p.type !== 'p' && p.type !== 'k').length
  return {
    mobility: { ours, theirs },
    activeForPassive: ours - theirs >= MOBILITY_GAP,
    attackerTraded: attacking && attack.by.includes(mv.from) && !guardsTheirKing,
    queensOffAttacking: mv.piece === 'q' && mv.captured === 'q' && attacking,
    takesActive: theirs - ours >= MOBILITY_GAP,
    takesAttacker: hitsOurKing,
    onlyPawns: pieces === 2,
  }
}

async function verdicts(engines, list, done) {
  const t0 = Date.now()
  let n = 0
  const todo = list.filter((t) => !done[`${t.id}:${t.color}:${t.ply}`])
  await Promise.all(
    engines.map(async (engine, shard) => {
      for (let i = shard; i < todo.length; i += engines.length) {
        const t = todo[i]
        const k = `${t.id}:${t.color}:${t.ply}`
        try {
          const over = K.tryBoard(t.fenAfter)?.isGameOver() ?? false
          const f = LC.moveFindings(
            { fenBefore: t.fenBefore, fenAfter: t.fenAfter, san: t.san, color: t.color, ply: t.ply + 1, seconds: 30, over, wonGame: true, inBook: false, history: t.history },
            policy,
            new Set(),
          )
          const fires = f.findings.some((x) => x.rule === 'tradeWhileAhead' && x.praise)
          await engine.newGame()
          const lt = LC.liveTargets({ root: 'startpos', moves: t.moves, fenBefore: t.fenBefore, fenAfter: t.fenAfter })
          const reading = await LC.readLiveMove(engine, lt, () => false)
          if (!reading || reading.terminal) {
            done[k] = { fires, reading: false }
          } else {
            const v = LC.composeVerdict({
              san: t.san,
              color: t.color,
              reading,
              tablebase: null,
              loose: f.findings.some((x) => x.held),
              allowsMate: f.findings.some((x) => x.rule === 'allowsMate'),
              givenAway: f.givenAway,
              prevCapture: capturedOn(t.history[t.history.length - 2]),
            })
            const check = { fenBefore: reading.fenBefore, san: t.san, bestUci: reading.bestMove, winBefore: Sc.winPercentFor(reading.beforeScore, t.color) }
            done[k] = {
              fires,
              reading: true,
              judgment: v.judgment,
              lossWp: v.lossWp,
              praised: fires && P.confirmsPraise('tradeWhileAhead', v, check),
              lossPct: t.lossPct,
              nextPhase: t.nextPhase,
              ...readTrade(t.fenBefore, t.moves[t.moves.length - 1]),
            }
          }
        } catch (e) {
          console.error(`${k}: ${e.message}`)
        }
        if (++n % 100 === 0) {
          console.error(`${n}/${todo.length} verdicts, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
          writeFileSync(ROWS, JSON.stringify(state) + '\n')
        }
      }
    }),
  )
}

async function missedLines(engine, list, done) {
  const lead = (fen, us) => {
    const m = K.sideMaterial(fen)
    return K.pointsOf(m[us]) - K.pointsOf(m[other(us)])
  }
  const todo = list.filter((x) => !done[`${x.id}:${x.color}:${x.ply}`] && lead(x.fen, x.color) >= LEAD)
  let n = 0
  await Promise.all(
    todo.map(async (x) => {
      const k = `${x.id}:${x.color}:${x.ply}`
      try {
        const r = await engine.evaluate(C.position(x.fen), 'best', { priority: 'batch' })
        const best = r.best ?? r.pv?.[0] ?? null
        const fires = best !== null && best !== x.played && K.techniqueInsights(x.fen, x.played, { bestUci: best, lossPct: x.lossPct, winBefore: x.winBefore }).some((i) => i.id === 'missed-trade-when-ahead')
        done[k] = { best, fires, ...(fires ? readTrade(x.fen, best) : {}) }
      } catch (e) {
        console.error(`missed ${k}: ${e.message}`)
      }
      if (++n % 100 === 0) console.error(`${n}/${todo.length} missed-trade reads`)
    }),
  )
  return todo.length
}

const drawn = JSON.parse(readFileSync(join(PRIVATE, 'scan-trades.json'), 'utf8'))
const missed = JSON.parse(readFileSync(join(PRIVATE, 'scan-missed-trades.json'), 'utf8'))
const state = existsSync(ROWS) ? JSON.parse(readFileSync(ROWS, 'utf8')) : {}
const E = await chess('src/adapters/node/engine/index.ts')
const engines = Array.from({ length: POOL }, () => E.createNodeEngine({ root: CHESS_DIR, pool: 1, tablebase: false, evalCache: false, human: false }))
const t0 = Date.now()
for (const group of GROUPS) {
  state[group] ??= {}
  await verdicts(engines, drawn[group].slice(0, LIMIT), state[group])
  writeFileSync(ROWS, JSON.stringify(state) + '\n')
}
for (const engine of engines) engine.dispose()
state.missed ??= {}
const pooled = E.createNodeEngine({ root: CHESS_DIR, pool: POOL, tablebase: false, evalCache: false, human: false })
const missedRead = await missedLines(pooled, missed.slice(0, LIMIT), state.missed)
pooled.dispose()
writeFileSync(ROWS, JSON.stringify(state) + '\n')

const faulted = (r) => r.lossPct !== null && r.lossPct >= FAULT
const caseOf = (r, c) => (c === 'worseEnding' ? r.nextPhase === 'endgame' && faulted(r) : r[c])
const groups = {}
for (const group of GROUPS) {
  const rows = Object.values(state[group])
  const read = rows.filter((r) => r.reading)
  const praised = read.filter((r) => r.praised)
  const cases = {}
  for (const c of CASES) {
    const inCase = praised.filter((r) => caseOf(r, c))
    const rest = praised.filter((r) => !caseOf(r, c))
    cases[c] = { share: share(inCase.length, praised.length), faulted: share(inCase.filter(faulted).length, inCase.length), faultedOthers: share(rest.filter(faulted).length, rest.length) }
  }
  const anyCase = praised.filter((r) => CASES.some((c) => caseOf(r, c)))
  groups[group] = {
    trades: rows.length,
    read: read.length,
    fires: read.filter((r) => r.fires).length,
    praised: share(praised.length, read.length),
    faultedPraised: share(praised.filter(faulted).length, praised.length),
    anyCase: share(anyCase.length, praised.length),
    cases,
    reasons: Object.fromEntries([...REASONS, 'none'].map((x) => [x, share(praised.filter((r) => (x === 'none' ? !REASONS.some((y) => r[y]) : r[x])).length, praised.length)])),
  }
}
const tightens = CASES.filter((c) =>
  ['his', 'archive'].some((g) => {
    const x = groups[g].cases[c]
    return x.share.p !== null && x.share.p >= SHARE_BAR && x.faulted.p !== null && x.faultedOthers.p !== null && x.faulted.p >= x.faultedOthers.p
  }),
)
const lines = Object.values(state.missed)
const fired = lines.filter((r) => r.fires)
const summary = {
  app: CHESS_DIR.split('/').pop(),
  bar: { share: SHARE_BAR, faulted: FAULT, mobilityGap: MOBILITY_GAP },
  seconds: Math.round((Date.now() - t0) / 1000),
  tightens,
  replaceReason: tightens.length > 0,
  groups,
  missedTradeLine: {
    faultedWhileAhead: missedRead,
    fires: fired.length,
    cases: Object.fromEntries(CASES.filter((c) => c !== 'worseEnding').map((c) => [c, share(fired.filter((r) => r[c]).length, fired.length)])),
    reasons: Object.fromEntries(REASONS.map((x) => [x, share(fired.filter((r) => r[x]).length, fired.length)])),
  },
}
writeFileSync(join(resultsDir('book-advice'), 'trades.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ tightens, his: groups.his, archive: groups.archive, missedTradeLine: summary.missedTradeLine }, null, 2))
