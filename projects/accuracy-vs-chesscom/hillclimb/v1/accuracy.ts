// Accuracy, both sides: a Lichess-derived per-move curve, weighted by the
// game's volatility and blended with the harmonic mean, per side and per
// division slice. The instrument's name (ACCURACY_MODEL) travels with every
// summary, so a change of curve, window or exclusions marks a boundary in
// trend data instead of silently mixing two scales.

import type { Division } from '../../core/phase'
import { cpOf, isExactScore } from '../../core/score'
import type { ReviewClass } from './classify/refine'
import type { PlayerSummary, PlyRecord } from './types'

/**
 * Per-move win%-loss to a 0-100 score: Lichess's curve shape and offsets (the
 * flat +1 uncertainty bonus keeps a perfectly held move from grading 99.99 for
 * rounding reasons) with a steeper decay, so a plain mean of these scores
 * tracks chess.com's game accuracy. Not a claim of Lichess parity.
 */
export function moveAccuracy(lossPct: number): number {
  const a = 103.1668100711649 * Math.exp(-0.14 * lossPct) - 3.166924740191411 + 1
  return Math.max(0, Math.min(100, a))
}

/** The scoring instrument's identity, stored with every summary. */
export const ACCURACY_MODEL = 'coach-accuracy/3-plain-mean-steep'

/** Sample standard deviation; 0 below two points. */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const varSum = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0)
  return Math.sqrt(varSum / (xs.length - 1))
}

/** Window size for the volatility weighting: a tenth of the graded moves, clamped to [2, 8]. */
export function accuracyWindowSize(gradedMoves: number): number {
  return Math.max(2, Math.min(8, Math.floor(gradedMoves / 10)))
}

/**
 * One volatility weight per ply: the win% standard deviation of a sliding
 * window over the position sequence, clamped to [0.5, 12]. The first window
 * is repeated so every ply has one aligned with it (the lichess alignment).
 * `winSeq` holds positions (one more entry than plies), White POV: a POV
 * flip mirrors values around 50 and leaves every deviation unchanged.
 */
export function volatilityWeights(winSeq: number[], windowSize: number): number[] {
  const plies = Math.max(0, winSeq.length - 1)
  const size = Math.max(2, Math.min(windowSize, Math.max(2, winSeq.length)))
  const slide: number[][] = []
  for (let i = 0; i + size <= winSeq.length; i++) slide.push(winSeq.slice(i, i + size))
  if (slide.length === 0) slide.push([...winSeq])
  const windows: number[][] = []
  for (let k = 0; k < size - 2; k++) windows.push(slide[0])
  windows.push(...slide)
  const out: number[] = []
  for (let i = 0; i < plies; i++) {
    const w = windows[Math.min(i, windows.length - 1)]
    out.push(Math.max(0.5, Math.min(12, stdev(w))))
  }
  return out
}

/**
 * Game accuracy: the plain mean of per-move accuracies. The volatility weights
 * are no longer applied here: under the steep per-move curve their weighted
 * mean falls far below the plain mean, so they are not part of this instrument.
 */
export function gameAccuracy(pairs: Array<{ acc: number; weight: number }>): number | null {
  if (pairs.length === 0) return null
  let sum = 0
  for (const { acc } of pairs) sum += acc
  return sum / pairs.length
}

export function emptyCounts(): Record<ReviewClass, number> {
  return {
    brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0, forced: 0,
    inaccuracy: 0, mistake: 0, miss: 0, blunder: 0, unknown: 0,
  }
}

/**
 * Is this ply in the accuracy/ACPL denominator? Book carries no information
 * about the player, a forced move CANNOT be wrong, and an unknown ply has no
 * evidence: counting any of them inflates accuracy with moves that were
 * never decisions or never measured.
 */
export function graded(r: PlyRecord): boolean {
  return r.cls !== 'book' && r.cls !== 'forced' && r.cls !== 'unknown' && isExactScore(r.before) && isExactScore(r.after)
}

/**
 * The position sequence the volatility windows read: root value, then the
 * value after each ply. Unknown positions carry the last known value forward
 * (a window needs a number; a gap is not a swing), and the root is the actual
 * initial position's value when the caller has it, never a seeded 50.
 */
export function winSequence(records: PlyRecord[], rootWin: number | null): number[] {
  let last = rootWin ?? 50
  const seq = [last]
  for (const r of records) {
    if (r.winAfter !== null && r.winAfter !== undefined) last = r.winAfter
    seq.push(last)
  }
  return seq
}

/** Accuracy for one side over the ply-index range [lo, hi). */
function sideAccuracyOver(records: PlyRecord[], color: 'w' | 'b', winSeq: number[], lo: number, hi: number): number | null {
  const mine: Array<{ index: number; acc: number }> = []
  for (let i = Math.max(0, lo); i < Math.min(records.length, hi); i++) {
    if (records[i].mover !== color) continue
    if (!graded(records[i])) continue
    mine.push({ index: i, acc: moveAccuracy(records[i].lossPct) })
  }
  if (mine.length === 0) return null
  const weights = volatilityWeights(winSeq.slice(lo, hi + 1), accuracyWindowSize(mine.length))
  return gameAccuracy(mine.map((m) => ({ acc: m.acc, weight: weights[m.index - lo] ?? 0.5 })))
}

/** One side's summary: accuracy (whole game and per division slice), ACPL and class counts. */
export function summarizeSide(
  records: PlyRecord[],
  color: 'w' | 'b',
  division?: Division,
  rootWin: number | null = null,
  model: string = ACCURACY_MODEL,
): PlayerSummary {
  const counts = emptyCounts()
  let gradedCount = 0
  let ungraded = 0
  let cpSum = 0
  const sign = color === 'w' ? 1 : -1
  for (const r of records) {
    if (r.mover !== color) continue
    counts[r.cls]++
    if (r.cls === 'unknown') ungraded++
    if (!graded(r)) continue
    gradedCount++
    cpSum += Math.min(1000, Math.max(0, (cpOf(r.before!) - cpOf(r.after!)) * sign))
  }
  const winSeq = winSequence(records, rootWin)
  const n = records.length
  const div = division ?? { middle: null, end: null }
  const midAt = div.middle ?? div.end ?? n
  const endAt = div.end ?? n
  return {
    accuracy: sideAccuracyOver(records, color, winSeq, 0, n),
    acpl: gradedCount > 0 ? cpSum / gradedCount : null,
    counts,
    gradedMoves: gradedCount,
    ungradedMoves: ungraded,
    phases: {
      opening: sideAccuracyOver(records, color, winSeq, 0, midAt),
      middlegame: div.middle !== null ? sideAccuracyOver(records, color, winSeq, div.middle, endAt) : null,
      endgame: div.end !== null ? sideAccuracyOver(records, color, winSeq, div.end, n) : null,
    },
    model,
  }
}
