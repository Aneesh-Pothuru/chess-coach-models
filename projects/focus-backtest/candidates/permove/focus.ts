// ONE focus at a time, chosen by code and graded by code (report 15 §8, the
// proposal's §4 steps 2-4). Every candidate is a leak from the metrics
// service's ledger (points given away per game on one kind of move, against
// his opponents on the same kind of move in the same games), scored
//
//   score = gainElo × P(real) × result-relevance × actionability × freshness
//
// and the focus switches only when a challenger scores 1.5 times the current
// one AND the current 40-game window has finished (or its CUSUM already
// signalled). A focus is pre-registered with a frozen baseline, a target, a
// window and a success test, so the reviews grade the recommender itself.

import { cusum, ewma, linearTrend, normalCdf, seededRng, summarize } from '../../core/stats'
import { bandExpected, LEAK_CAUSES, type GameFacts, type Leak, type LeakCause, type Metrics } from '../metrics'
import type { ConceptKey } from '../learner'

/** Games a focus runs for before it is graded and may be replaced: long enough to see a quarter of the loss go. */
export const FOCUS_WINDOW = 120
/** Games the frozen baseline is measured over. */
export const BASELINE_GAMES = 100
/** A challenger must score this many times the current focus to replace it. */
export const SWITCH_RATIO = 1.5
/** Games the freshness term's recent EWMA reads. */
export const FRESH_GAMES = 20
/** The posterior probability of improvement that counts as success. */
export const SUCCESS_P = 0.9
/** Shuffles of the permutation test that grades a focus. */
export const PERMUTATIONS = 1000
/** Above this p-value the window shows no sign of improvement: not met. Between it and 1 - SUCCESS_P: unclear. */
export const NOT_MET_P = 0.5

/** How much a focus on each cause can be acted on (habit 0.9, drillable 0.6, judgement 0.3). */
export const ACTIONABILITY: Readonly<Record<string, number>> = {
  'fast.tense': 0.9,
  'clock.low': 0.9,
  'after.gift': 0.6,
  'opening.tense': 0.6,
  'opening.quiet': 0.6,
  'middlegame.tense': 0.6,
  'endgame.tense': 0.6,
  'endgame.quiet': 0.6,
  'middlegame.quiet': 0.3,
  late: 0.3,
}

/** The concept a leak cause is taught under. */
export const CAUSE_CONCEPT: Readonly<Record<string, ConceptKey>> = {
  'fast.tense': 'K10',
  'clock.low': 'K10',
  'after.gift': 'K2',
  'opening.tense': 'K8',
  'opening.quiet': 'K8',
  'middlegame.tense': 'K1',
  'middlegame.quiet': 'K4',
  'endgame.tense': 'K6',
  'endgame.quiet': 'K6',
  late: 'K6',
}

export interface FocusCandidate {
  cause: string
  label: string
  concept: ConceptKey | null
  leak: Leak
  gainElo: number
  pReal: number | null
  /** 1 when the per-game loss predicts the result (90% interval of the slope below 0), 0.3 when unclear. */
  relevance: number
  relevanceSlope: number | null
  actionability: number
  /** 1.25 when the recent games run worse than the baseline window, else 1. */
  freshness: number
  score: number
}

export interface FocusHistoryEntry {
  cause: string
  outcome: 'met' | 'not-met' | 'running' | 'replaced'
  id?: string
  startedOn?: string
  endedOn?: string
  /** The grade's line when it ended. */
  line?: string
}

/** One game's points given away on a cause (him and his opponents), on the band-fitted curve. */
export function causeLoss(g: GameFacts, cause: LeakCause, k: number): { mine: number; theirs: number; moves: number } | null {
  let mine = 0
  let theirs = 0
  let moves = 0
  for (const m of g.moves) {
    if (!cause.test(m, g) || m.evalBefore === null || m.evalAfter === null) continue
    const lost = Math.max(0, 100 * (bandExpected(m.evalBefore, k) - bandExpected(m.evalAfter, k)))
    if (m.mover === 'me') {
      mine += lost
      moves++
    } else theirs += lost
  }
  return g.moves.length ? { mine, theirs, moves } : null
}

/** The per-game series of points given away on a cause, him only, oldest first (null for a game without moves). */
export function causeSeries(games: readonly GameFacts[], cause: LeakCause, k: number): Array<number | null> {
  return games.map((g) => causeLoss(g, cause, k)?.mine ?? null)
}

const causeById = (id: string): LeakCause | null => LEAK_CAUSES.find((c) => c.id === id) ?? null

/**
 * Past focuses teach how actionable a cause really is: the prior (by kind) is
 * updated with the share of past focuses on it that passed, at a strength of
 * two focuses.
 */
function learnedActionability(cause: string, history: readonly FocusHistoryEntry[]): number {
  const prior = ACTIONABILITY[cause] ?? 0.3
  const graded = history.filter((h) => h.cause === cause && (h.outcome === 'met' || h.outcome === 'not-met'))
  const passed = graded.filter((h) => h.outcome === 'met').length
  return (2 * prior + passed) / (2 + graded.length)
}

/**
 * Every candidate focus over the recent games, best first. `history` is the
 * focus log's past focuses (their outcomes adjust actionability).
 */
export function rankFocus(metrics: Metrics, o: { asOf?: string; history?: readonly FocusHistoryEntry[] } = {}): FocusCandidate[] {
  const curve = metrics.winCurve()
  if (!curve) return []
  const window = { games: BASELINE_GAMES }
  const leaks = metrics.leakLedger({ window, asOf: o.asOf })
  const facts = metrics.facts().filter((g) => !o.asOf || g.ptDay === null || g.ptDay <= o.asOf)
  const recent = facts.slice(-BASELINE_GAMES).filter((g) => g.moves.length > 0)
  const out: FocusCandidate[] = []
  for (const leak of leaks) {
    const cause = causeById(leak.id)
    if (!cause) continue
    const series = recent.map((g) => ({ loss: causeLoss(g, cause, curve.k)?.mine ?? null, score: g.score }))
    const pts = series.filter((p): p is { loss: number; score: number } => p.loss !== null)
    const fit = linearTrend(
      pts.map((p) => p.loss),
      pts.map((p) => p.score),
    )
    // A 90% interval on the slope: the loss predicts the result when its upper end is below zero.
    const relevant = fit !== null && fit.slope + 1.645 * fit.se < 0
    const relevance = relevant ? 1 : 0.3
    const act = learnedActionability(leak.id, o.history ?? [])
    const all = pts.map((p) => p.loss)
    const base = summarize(all)
    const fresh = summarize(all.slice(-FRESH_GAMES))
    const freshness = base && fresh && fresh.mean > base.mean ? 1.25 : 1
    const score = leak.gainElo * (leak.pReal ?? 0) * relevance * act * freshness
    out.push({
      cause: leak.id,
      label: leak.label,
      concept: CAUSE_CONCEPT[leak.id] ?? null,
      leak,
      gainElo: leak.gainElo,
      pReal: leak.pReal,
      relevance,
      relevanceSlope: fit ? fit.slope : null,
      actionability: act,
      freshness,
      score,
    })
  }
  return out.sort((a, b) => b.score - a.score || b.gainElo - a.gainElo)
}

/** A pre-registered focus: what is measured, from where, to where, for how long, and how it passes. */
export interface Focus {
  id: string
  cause: string
  label: string
  concept: ConceptKey | null
  /** The PT day it started, and how many games the archive held then (games after it count). */
  startedOn: string
  startGames: number
  window: number
  /** Points given away per game on the cause, over the BASELINE_GAMES before the start: frozen. */
  baseline: { mean: number; sd: number; games: number }
  /** What the baseline would read with half the gap to his opponents closed. */
  target: number
  /** The success test, in words and numbers: CUSUM on a fall of `shift`, or P(improved) ≥ 0.9 at the end. */
  test: { kind: 'cusum-or-posterior'; shift: number; h: number; p: number }
  /** The score it won with, and the leak's numbers at the start. */
  score: number
  gainElo: number
  pReal: number | null
}

/** Freeze a candidate into a focus as of `asOf` (the last day in the facts). */
export function preregister(candidate: FocusCandidate, metrics: Metrics, asOf: string): Focus | null {
  const curve = metrics.winCurve()
  const cause = causeById(candidate.cause)
  if (!curve || !cause) return null
  const facts = metrics.facts().filter((g) => g.ptDay === null || g.ptDay <= asOf)
  const window = facts.slice(-BASELINE_GAMES)
  const base = summarize(causeSeries(window, cause, curve.k).filter((x): x is number => x !== null))
  if (!base) return null
  const gap = Math.max(0, candidate.leak.gap)
  const shift = Math.max(gap / 2, base.sd / 4)
  return {
    id: `focus-${asOf}-${candidate.cause}`,
    cause: candidate.cause,
    label: candidate.label,
    concept: candidate.concept,
    startedOn: asOf,
    startGames: facts.length,
    window: FOCUS_WINDOW,
    baseline: { mean: base.mean, sd: base.sd, games: base.n },
    target: base.mean - gap / 2,
    test: { kind: 'cusum-or-posterior', shift, h: 4 * base.sd, p: SUCCESS_P },
    score: candidate.score,
    gainElo: candidate.gainElo,
    pReal: candidate.pReal,
  }
}

export interface FocusGrade {
  focusId: string
  /** Games played since the start, and the window. */
  games: number
  window: number
  /** Mean points given away per game since the start, and its standard error. */
  mean: number | null
  se: number | null
  /** The EWMA of the per-game values against the frozen baseline's limits, at the last game. */
  ewma: number | null
  ewmaSignal: 'above' | 'below' | null
  /** The lower CUSUM sum (evidence of a fall) and the game it crossed h, if it has. */
  cusum: number
  alarmAt: number | null
  /** P(the window's true mean is below the baseline mean). */
  pImproved: number | null
  /** P(it is at or below the target). */
  pTarget: number | null
  state: 'running' | 'met' | 'not-met' | 'unclear' | 'thin'
  /** The permutation test's one-sided p-value: the window's points per move on the cause against the reference games'. */
  p: number | null
  /** Points given away per move on the cause in the window and in the reference games. */
  rate: number | null
  referenceRate: number | null
  /** One line, the numbers in it: "18 of 40 games · 6.1 → 4.9 a game · P(improved) 0.72". */
  line: string
}

/** Points per move over a set of games' {mine, moves} rows, or null without a move on the cause. */
function perMove(rows: ReadonlyArray<{ mine: number; moves: number }>): number | null {
  let mine = 0
  let moves = 0
  for (const r of rows) {
    mine += r.mine
    moves += r.moves
  }
  return moves > 0 ? mine / moves : null
}

/**
 * One-sided permutation p-value that the window's points per move are below
 * the reference's: games are the units shuffled, so a game with many moves on
 * the cause and a game with one keep their own weight. Seeded by the focus, so
 * a grade repeats.
 */
function permutationP(reference: ReadonlyArray<{ mine: number; moves: number }>, window: ReadonlyArray<{ mine: number; moves: number }>, seed: string): number | null {
  const ref = perMove(reference)
  const win = perMove(window)
  if (ref === null || win === null) return null
  const observed = ref - win
  const all = [...reference, ...window]
  let h = 0
  for (const ch of seed) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0
  const rng = seededRng(h)
  let hits = 0
  for (let i = 0; i < PERMUTATIONS; i++) {
    for (let j = all.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1))
      const t = all[j]
      all[j] = all[k]
      all[k] = t
    }
    const a = perMove(all.slice(0, reference.length))
    const b = perMove(all.slice(reference.length))
    if (a !== null && b !== null && a - b >= observed) hits++
  }
  return (1 + hits) / (1 + PERMUTATIONS)
}

/**
 * Grade a focus over the games played since it started, against the reference
 * games: the BASELINE_GAMES before the ones the choice read (the choice reads
 * its baseline at its worst, so grading against it credits regression to the
 * mean), or the baseline itself when the archive is too short.
 */
export function gradeFocus(focus: Focus, metrics: Metrics, asOf?: string): FocusGrade {
  const curve = metrics.winCurve()
  const cause = causeById(focus.cause)
  const facts = metrics.facts().filter((g) => !asOf || g.ptDay === null || g.ptDay <= asOf)
  const since = facts.slice(focus.startGames).slice(0, focus.window)
  const rowsOf = (games: readonly GameFacts[]) =>
    curve && cause ? games.map((g) => causeLoss(g, cause, curve.k)).filter((x): x is { mine: number; theirs: number; moves: number } => x !== null) : []
  const windowRows = rowsOf(since)
  const before = facts.slice(Math.max(0, focus.startGames - 2 * BASELINE_GAMES), Math.max(0, focus.startGames - BASELINE_GAMES))
  const referenceRows = rowsOf(before.length >= BASELINE_GAMES / 2 ? before : facts.slice(Math.max(0, focus.startGames - BASELINE_GAMES), focus.startGames))
  const values = windowRows.map((r) => r.mine)
  const n = values.length
  const s = summarize(values)
  const mean = n ? values.reduce((a, b) => a + b, 0) / n : null
  const se = s ? s.sd / Math.sqrt(s.n) : n === 1 ? focus.baseline.sd : null
  const path = ewma(values, 0.15, { baseline: { mean: focus.baseline.mean, sd: focus.baseline.sd } })
  const last = path[path.length - 1]
  const cs = cusum(values, { mean: focus.baseline.mean, k: focus.test.shift / 2, h: focus.test.h })
  const lower = cs.lower[cs.lower.length - 1] ?? 0
  const alarm = cs.firstAlarm && cs.firstAlarm.direction === 'down' ? cs.firstAlarm.index + 1 : null
  const pTarget = mean !== null && se !== null && se > 0 ? normalCdf((focus.target - mean) / se) : null
  const rate = perMove(windowRows)
  const referenceRate = perMove(referenceRows)
  const p = n >= focus.window ? permutationP(referenceRows, windowRows, focus.id) : null
  const pImproved = p === null ? null : 1 - p
  let state: FocusGrade['state'] = 'running'
  if (n === 0) state = 'thin'
  else if (n >= focus.window) state = p === null ? 'thin' : p <= 1 - focus.test.p ? 'met' : p >= NOT_MET_P ? 'not-met' : 'unclear'
  const f1 = (x: number | null) => (x === null ? 'n/a' : x.toFixed(1))
  const f2 = (x: number | null) => (x === null ? 'n/a' : x.toFixed(2))
  const line = `${Math.min(n, focus.window)} of ${focus.window} games · ${f2(referenceRate)} → ${f2(rate)} a move${p === null ? '' : ` · p ${p.toFixed(2)}`} (${f1(focus.baseline.mean)} → ${f1(mean)} a game)`
  return {
    focusId: focus.id,
    games: n,
    window: focus.window,
    mean,
    se,
    ewma: last?.z ?? null,
    ewmaSignal: last?.signal ?? null,
    cusum: lower,
    alarmAt: alarm,
    pImproved,
    pTarget,
    state,
    p,
    rate,
    referenceRate,
    line,
  }
}

export interface FocusChoice {
  /** The focus to run: the current one kept, or a new pre-registration. */
  focus: Focus | null
  switched: boolean
  why: string
  grade: FocusGrade | null
  candidates: FocusCandidate[]
}

/**
 * Keep or switch, with hysteresis: a challenger replaces the current focus only
 * when it scores SWITCH_RATIO times as much and the current window is done (or
 * its CUSUM already signalled). A missing current focus takes the best candidate.
 */
export function chooseFocus(metrics: Metrics, current: Focus | null, asOf: string, history: readonly FocusHistoryEntry[] = []): FocusChoice {
  const candidates = rankFocus(metrics, { asOf, history })
  const best = candidates[0] ?? null
  if (!current) {
    const focus = best ? preregister(best, metrics, asOf) : null
    return { focus, switched: focus !== null, why: focus ? `no focus was running; ${best!.label} scores highest` : 'no candidate has enough data', grade: null, candidates }
  }
  const grade = gradeFocus(current, metrics, asOf)
  const mine = candidates.find((c) => c.cause === current.cause)
  const done = grade.games >= current.window
  const ratio = best && mine && mine.score > 0 ? best.score / mine.score : best && best.score > 0 ? Infinity : 0
  if (best && best.cause !== current.cause && done && ratio >= SWITCH_RATIO) {
    const focus = preregister(best, metrics, asOf)
    if (focus) {
      return {
        focus,
        switched: true,
        why: `${current.label} finished its window (${grade.state}); ${best.label} scores ${ratio === Infinity ? 'above zero against zero' : `${ratio.toFixed(1)} times as much`}`,
        grade,
        candidates,
      }
    }
  }
  const why = !done
    ? `${current.label} is ${grade.games} of ${current.window} games in; a focus runs its window`
    : best && best.cause !== current.cause
      ? `${best.label} scores ${ratio === Infinity ? 'more' : `${ratio.toFixed(1)} times`}, short of the ${SWITCH_RATIO} needed to switch`
      : `${current.label} still scores highest`
  return { focus: current, switched: false, why, grade, candidates }
}
