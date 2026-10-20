import { interval, mulberry32 } from '../positions-like-this/lib.mjs'

export { argOf, byGame, gitCommit, interval, mulberry32, readJsonl } from '../positions-like-this/lib.mjs'
export { lostOf, soundOf } from '../structure-breaks/lib.mjs'

export const PROJECT = 'central-strike'
export const SOURCE = 'structure-breaks'
export const SEED = 20261020
export const DRAWS = 2000
export const MIN_GAMES = 30
export const CENTRE_FILES = ['d', 'e', 'f']
export const CENTRAL_FILES = ['d', 'e']

export const landsCentral = (uci) => CENTRAL_FILES.includes(uci[2])
export const centralBreaks = (row) => row.breaks.filter(landsCentral)
export const flankBreaks = (row) => row.breaks.filter((m) => !landsCentral(m))

export function kingSquare(fen, color) {
  const king = color === 'w' ? 'K' : 'k'
  const ranks = fen.split(' ')[0].split('/')
  for (let r = 0; r < 8; r++) {
    let f = 0
    for (const ch of ranks[r]) {
      if (/\d/.test(ch)) f += Number(ch)
      else {
        if (ch === king) return 'abcdefgh'[f] + String(8 - r)
        f++
      }
    }
  }
  return null
}

const otherColor = (fen) => (fen.split(' ')[1] === 'w' ? 'b' : 'w')

export function otherKingInCentre(fen) {
  const sq = kingSquare(fen, otherColor(fen))
  return sq !== null && CENTRE_FILES.includes(sq[0])
}

export function otherKingOnStart(fen) {
  const color = otherColor(fen)
  return kingSquare(fen, color) === (color === 'w' ? 'e1' : 'e8')
}

export function queensOn(fen) {
  const board = fen.split(' ')[0]
  return board.includes('Q') && board.includes('q')
}

const meanOf = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

function statOf(units, stat) {
  return stat(units.flat())
}

export function bootStat(units, stat, seed, draws = DRAWS) {
  const value = statOf(units, stat)
  if (value === null) return { value: null, ci: null }
  const rnd = mulberry32(seed)
  const samples = []
  for (let d = 0; d < draws; d++) samples.push(statOf(units.map(() => units[Math.floor(rnd() * units.length)]), stat))
  return { value, ci: interval(samples.map((x) => (x === null ? NaN : x))) }
}

export const meanStat = (valueOf, keep = () => true) => (positions) => meanOf(positions.filter(keep).map(valueOf))

export function liftStat(valueOf, inGroup, keep = () => true) {
  return (positions) => {
    const kept = positions.filter(keep)
    const a = meanOf(kept.filter(inGroup).map(valueOf))
    const b = meanOf(kept.filter((p) => !inGroup(p)).map(valueOf))
    return a === null || b === null ? null : a - b
  }
}

export const above0 = (s) => !!s?.ci && s.ci[0] > 0
export const below0 = (s) => !!s?.ci && s.ci[1] < 0

export function verdictOf({ controls, halves, minGames }) {
  const thin = halves.find((h) => Math.min(h.games.centre, h.games.away) < minGames)
  if (thin) return `not enough data (n=${Math.min(thin.games.centre, thin.games.away)})`
  if (!controls.referee || !controls.null) return 'no verdict: a control failed'
  const lifts = halves.map((h) => h.lift)
  if (lifts.every(above0)) return halves.some((h) => below0(h.gain)) ? 'the king marks the moment, but the break trails his move' : 'the strike holds'
  if (lifts.every(below0)) return 'the king misleads'
  return 'no signal'
}

export function strongReading(lift, verdict) {
  const side = verdict === 'the king misleads' ? 'below' : verdict.startsWith('the strike holds') || verdict.startsWith('the king marks') ? 'above' : null
  if (above0(lift)) return side === 'below' ? 'disagree' : side === 'above' ? 'agree' : 'lift above 0'
  if (below0(lift)) return side === 'above' ? 'disagree' : side === 'below' ? 'agree' : 'lift below 0'
  return 'silent'
}
