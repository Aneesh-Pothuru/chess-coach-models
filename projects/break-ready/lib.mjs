import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { interval, mulberry32, readJsonl } from '../positions-like-this/lib.mjs'
import { rowsOf, sansOf } from '../structure-breaks/lib.mjs'

export { argOf, byGame, gitCommit, interval, mulberry32, readJsonl, seedOf } from '../positions-like-this/lib.mjs'
export { rowsOf, sansOf, soundOf } from '../structure-breaks/lib.mjs'

export const PROJECT = 'break-ready'
export const SOURCE = 'structure-breaks'
export const SEED = 20261020
export const DRAWS = 2000
export const AIMED_MIN = 2
export const MIN_ARM = 60
export const MIN_CELL = 30
export const CHECKS = ['aimed', 'rooks', 'purpose', 'force', 'safe']
export const PIECE_CHECKS = ['aimed', 'rooks', 'force']

const FILES = 'abcdefgh'
const fileOf = (s) => s.charCodeAt(0) - 97
const rankOf = (s) => Number(s[1])
const squareAt = (f, r) => (f >= 0 && f < 8 && r >= 1 && r <= 8 ? `${FILES[f]}${r}` : null)
const HOME = { w: { n: ['b1', 'g1'], b: ['c1', 'f1'] }, b: { n: ['b8', 'g8'], b: ['c8', 'f8'] } }
const isPiece = (p) => p.type === 'n' || p.type === 'b' || p.type === 'r' || p.type === 'q'

export function checksOf(fen, uci, K) {
  const board = K.boardOf(fen)
  const mv = board.findUci(uci)
  if (!mv) throw new Error(`not legal: ${uci} in ${fen}`)
  const us = board.turn
  const them = us === 'w' ? 'b' : 'w'
  const after = board.child(mv)
  const ahead = rankOf(mv.to) + (us === 'w' ? 1 : -1)
  const targets = [-1, 1]
    .map((df) => squareAt(fileOf(mv.to) + df, ahead))
    .filter((s) => s && after.get(s)?.type === 'p' && after.get(s).color === them)
  const files = new Set([fileOf(mv.from), fileOf(mv.to), ...targets.map(fileOf)])
  const sector = new Set([-1, 0, 1].map((d) => fileOf(mv.to) + d).filter((f) => f >= 0 && f < 8))
  const piecesOf = (color) => board.pieces(color).filter(isPiece)

  const undeveloped = piecesOf(us).filter((p) => HOME[us][p.type]?.includes(p.square)).map((p) => p.square)
  const aimedAt = new Set([mv.to, ...targets])
  const aimedBy = piecesOf(us)
    .filter((p) => ((p.type === 'r' || p.type === 'q') && files.has(fileOf(p.square))) || K.pieceSight(board, p.square).sees.some((s) => aimedAt.has(s)))
    .map((p) => p.square)

  const rookSquares = board.pieces(us, 'r').map((p) => p.square)
  const rooksReady = rookSquares.filter((s) => files.has(fileOf(s)) || board.movesFrom(s).some((m) => files.has(fileOf(m.to))))

  const passedBefore = new Set(K.passedPawns(board, us))
  const newPassers = (b) => K.passedPawns(b, us).filter((s) => !passedBefore.has(s) && !(s === mv.to && passedBefore.has(mv.from)))
  const shelterBefore = K.shelterOf(board, them)
  const outcomes = [after, ...targets.map((t) => after.without(mv.to, t))]
  const passer = outcomes.some((b) => newPassers(b).length > 0)
  const exposed = outcomes.some((b) => K.shelterOf(b, them) < shelterBefore)

  const forceOf = (color) => piecesOf(color).filter((p) => sector.has(fileOf(p.square))).reduce((s, p) => s + K.PIECE_VALUE[p.type], 0)
  const force = { us: forceOf(us), them: forceOf(them) }
  const verdict = K.safetyCheck(fen, uci)?.verdict ?? null

  return {
    targets,
    files: [...files].sort().map((f) => FILES[f]),
    undeveloped,
    aimedBy,
    rooks: rookSquares.length,
    rooksReady,
    passer,
    exposed,
    force,
    verdict,
    checks: {
      aimed: undeveloped.length === 0 && aimedBy.length >= AIMED_MIN,
      rooks: rookSquares.length === 0 || rooksReady.length > 0,
      purpose: passer || exposed,
      force: force.us >= force.them,
      safe: verdict === 'safe',
    },
  }
}

export const passed = (checks, names = CHECKS) => names.filter((c) => checks[c]).length
export const ready = (checks) => passed(checks) === CHECKS.length
export const piecesReady = (checks) => passed(checks, PIECE_CHECKS) === PIECE_CHECKS.length

export function leverOf(c, uci, K) {
  const sans = sansOf(c.history)
  const meIsWhite = c.fen.split(' ')[1] === 'w'
  const board = new Chess(c.fen)
  const san = board.moves({ verbose: true }).find((m) => m.from + m.to + (m.promotion ?? '') === uci).san
  return c.levers.find((lever) => K.playedLever([...sans, san], meIsWhite, [lever], sans.length)) ?? null
}

export function analysisPositions(sourceDir) {
  const out = {}
  for (const who of ['his', 'strong']) {
    const ids = new Set(rowsOf(sourceDir, who, readdirSync).scored.map((r) => r.id))
    out[who] = readJsonl(join(sourceDir, `${who}-candidates.jsonl`)).filter((c) => ids.has(c.id))
  }
  return out
}

export function leverWeighted(rows, armOf, valueOf) {
  const groups = new Map()
  for (const r of rows) {
    const arm = armOf(r)
    if (arm === null) continue
    const key = r.group
    if (!groups.has(key)) groups.set(key, { yes: [0, 0], no: [0, 0] })
    const g = groups.get(key)[arm ? 'yes' : 'no']
    g[0] += valueOf(r)
    g[1] += 1
  }
  let num = 0
  let den = 0
  for (const { yes, no } of groups.values()) {
    if (!yes[1] || !no[1]) continue
    const w = (yes[1] * no[1]) / (yes[1] + no[1])
    num += w * (yes[0] / yes[1] - no[0] / no[1])
    den += w
  }
  return den ? num / den : null
}

export function bootStat(units, statOf, seed) {
  if (!units.length) return null
  const flat = (list) => list.flat()
  const point = statOf(flat(units))
  const names = Object.keys(point)
  const rnd = mulberry32(seed)
  const draws = []
  for (let d = 0; d < DRAWS; d++) draws.push(statOf(flat(units.map(() => units[Math.floor(rnd() * units.length)]))))
  return Object.fromEntries([
    ['units', units.length],
    ['n', flat(units).length],
    ...names.map((k) => [k, { value: point[k], ci: point[k] === null ? null : interval(draws.map((x) => x[k] ?? NaN)) }]),
  ])
}
