// The weekly replay: run the ONE-focus choice every Sunday of the archive, the
// way the weekly review runs it (the brief's chooseFocus, then the log's
// commit), on a metrics instance that holds only the games played by then, so
// the win curve and the ledger see nothing from the future. Then read every
// choice against the games that followed it.
//
//   bridge/run.sh projects/focus-backtest/replay.mts
//
// Writes results/replay.json (weekly aggregates: causes, scores, verdicts; no
// game ids, no positions).
import fs from 'node:fs'
import { join } from 'node:path'
import { app, appCommit, archiveGames, methodOver, metricsOver } from './lib.mts'
import { resultsDir } from '../../bridge/lib/chess.mjs'

const { addDays, weekdayOf } = app.time
const { rankFocus, preregister, gradeFocus, BASELINE_GAMES, FOCUS_WINDOW } = app.method
const { leakLedgerOf } = app.metrics

const games = archiveGames().filter((g: any) => g.ptDay !== null)
const first = games[0].ptDay as string
const last = games[games.length - 1].ptDay as string

// Sundays: the weekly reads the week up to its Sunday.
const sundays: string[] = []
for (let d = first; d <= last; d = addDays(d, 1)) if (weekdayOf(d) === 0) sundays.push(d)
if (!sundays.length) throw new Error('no Sundays found: weekdayOf returned an unexpected shape')

const full = metricsOver(games)
const fullK = full.winCurve().k
const upto = (day: string) => games.filter((g: any) => g.ptDay <= day)
const after = (day: string) => games.filter((g: any) => g.ptDay > day)

const log = { current: null as any, history: [] as any[] }
const weeks: any[] = []
for (const sunday of sundays) {
  const seen = upto(sunday)
  if (seen.length < BASELINE_GAMES) continue
  const m = metricsOver(seen)
  const method = methodOver(m, log)
  const running = log.current
  const choice = method.focus.choose(sunday)
  method.focus.commit(choice, sunday)
  const next = after(sunday)
  // Every candidate, pre-registered as if it had been chosen, and graded on the
  // games that really followed (the placebo: the same test on causes not picked).
  const k = m.winCurve().k
  const nextWindow = next.slice(0, FOCUS_WINDOW)
  const nextLeaks = nextWindow.length ? leakLedgerOf(nextWindow, k, { window: 'career' }) : []
  const candidates = choice.candidates.map((c: any, rank: number) => {
    const f = preregister(c, m, sunday)
    const g = f && nextWindow.length >= FOCUS_WINDOW ? gradeFocus(f, full, last) : null
    const nl = nextLeaks.find((l: any) => l.id === c.cause) ?? null
    return {
      rank: rank + 1,
      cause: c.cause,
      score: c.score,
      gainElo: c.gainElo,
      pReal: c.pReal,
      relevance: c.relevance,
      actionability: c.actionability,
      freshness: c.freshness,
      gap: c.leak.gap,
      se: c.leak.se,
      mine: c.leak.mine,
      mirror: c.leak.mirror,
      moves: c.leak.moves,
      leakGames: c.leak.games,
      baseline: f ? f.baseline : null,
      target: f ? f.target : null,
      shift: f ? f.test.shift : null,
      h: f ? f.test.h : null,
      next40: nl ? { gap: nl.gap, se: nl.se, mine: nl.mine, mirror: nl.mirror, moves: nl.moves, games: nl.games } : null,
      grade: g ? { state: g.state, mean: g.mean, se: g.se, pImproved: g.pImproved, pTarget: g.pTarget, alarmAt: g.alarmAt, games: g.games } : null,
    }
  })
  weeks.push({
    sunday,
    games: seen.length,
    gamesAfter: next.length,
    k,
    running: running ? running.cause : null,
    chosen: choice.focus ? choice.focus.cause : null,
    switched: choice.switched,
    why: choice.why,
    runningGrade: choice.grade ? { state: choice.grade.state, games: choice.grade.games, pImproved: choice.grade.pImproved } : null,
    top: choice.candidates[0]?.cause ?? null,
    candidates,
  })
  console.error(`${sunday} ${seen.length} games: ${choice.switched ? 'switch to' : 'keep'} ${choice.focus?.cause} (top ${choice.candidates[0]?.cause})`)
}

// The log's own record of each focus, graded on the full archive at its end.
const focuses = [...log.history.map((h: any) => ({ ...h })), log.current ? { cause: log.current.cause, id: log.current.id, startedOn: log.current.startedOn, outcome: 'current' } : null].filter(Boolean)

const out = {
  project: 'focus-backtest',
  app: await appCommit(),
  candidate: process.env.CANDIDATE ?? null,
  archive: { games: games.length, first, last, k: fullK },
  constants: { BASELINE_GAMES, FOCUS_WINDOW, SWITCH_RATIO: app.method.SWITCH_RATIO, SUCCESS_P: app.method.SUCCESS_P },
  weeks,
  focuses,
}
const file = join(resultsDir('focus-backtest'), process.env.CANDIDATE ? `replay-${process.env.CANDIDATE}.json` : 'replay.json')
fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n')
console.error(`wrote ${file}: ${weeks.length} weeks, ${focuses.length} focuses`)
