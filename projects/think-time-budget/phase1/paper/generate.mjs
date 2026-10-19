// Phase-one paper only: refuses effect reports or unsupported count claims.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Generated, esc, fixed } from '../../paper.mjs'
import { resultsDir } from '../../../bridge/lib/lab.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const r = JSON.parse(readFileSync(join(resultsDir('think-time-budget'), 'phase1.json')))
const c = JSON.parse(readFileSync(join(resultsDir('think-time-budget'), 'cohort-counts.json')))
const claim = (ok, text) => { if (!ok) throw new Error(`paper claim no longer holds: ${text}`) }
const n = (x) => x.toLocaleString('en-US')
claim(r.phase === 1 && r.effectsComputed === false, 'only counts were computed')
claim(c.appCommit === r.appCommit, 'same app')
claim(c.fingerprint === r.cohortFingerprint, 'same frozen cohort')
claim(JSON.stringify(c.months) === JSON.stringify(r.months), 'same months')
claim(r.gamesBuilt === Object.values(c.exports).reduce((s, x) => s + Object.values(x.games).reduce((a,b)=>a+b,0), 0), 'every selected game built')
claim(r.blackBuildsChecked > 0 && r.clockMovesChecked > 0, 'both reader checks ran')
claim(c.sources && Object.values(c.sources).every(x => !x.complete), 'sources are prefixes')
claim(c.sources && Object.values(c.sources).every(x => x.filters.everyMoveEvalAndClock), 'strict move annotation filter')
const p = r.rule
claim(p.strata === 5, 'matching uses danger quintiles')
claim(p.model.n_jobs === 1, 'danger uses one worker')
claim(p.features.every(k => !/(clock|think|budget|base|increment|timeControl|^tc$)/i.test(k)),
  'danger omits clocks, opponent think and budget fields')
claim(JSON.stringify(r.danger.features) === JSON.stringify(p.features), 'fitted danger inputs match the rule')
claim(JSON.stringify(r.danger.params) === JSON.stringify(p.model), 'fitted danger settings match the rule')
claim(r.danger.folds.length === p.folds, 'every player fold was fitted')
claim(r.danger.folds.reduce((s, f) => s + f.scoredMoves, 0) ===
  r.overall.eligible.fast.moves + r.overall.eligible.slow.moves, 'every eligible move was scored once')
const g = new Generated('projects/think-time-budget/paper/generate.mjs')
const defs = { AppCommit: r.appCommit, Months: r.months.join(' and '), FastControl: '600+0',
  MinBase: p.slowMinBase, IncrementMultiplier: p.budgetIncrementMultiplier, MinBudget: p.slowMinBudget,
  PrimaryPlayers: n(c.selected.primaryPlayers), MinimumGames: c.selectedK, BuiltGames: n(r.gamesBuilt),
  MinPlies: Object.values(c.sources)[0].filters.minPlies, RatingGap: Object.values(c.sources)[0].filters.maxRatingGap,
  RatingLo: p.primaryLo, RatingHi: p.primaryHiExclusive, MinClock: p.minClock, BlackChecked: n(r.blackBuildsChecked),
  FoldCount: p.folds, Draws: n(p.draws), Seed: p.seed, MinPlayers: p.minPlayers, Coverage: 100*p.minCoverage,
  Confidence: 95, ThinkFloor: p.thinkFloorSeconds, PlaceboSeconds: p.placeboSeconds, PlaceboPoints: 100*p.placeboMargin,
  Alpha: p.alpha, TriggerCount: p.triggers.length, CandidateCount: p.candidates.length,
  DeepSeconds: r.appConstants.DEEP_THINK_SECONDS, BookSeconds: r.appConstants.BOOK_END_SECONDS,
  FastThink: fixed(r.overall.primary.fast.meanThinkSeconds, 2), SlowThink: fixed(r.overall.primary.slow.meanThinkSeconds, 2),
  BridgeMinutes: fixed(r.timing.bridgeWorkerSeconds/60, 1), Workers: 2,
  BridgeTwoMinutes: fixed(r.timing.bridgeTwoProcessIdealSeconds/60, 1), DangerSeconds: fixed(r.danger.seconds, 1) }
for (const [k,v] of Object.entries(defs)) g.def(k, esc(v))
g.block('SourceTable', ['\\begin{tabular}{lrrr}', '\\toprule', 'month & source games & fast kept & slow kept \\\\', '\\midrule',
  ...Object.entries(c.sources).map(([m,s])=>`${esc(m)} & ${n(s.counts.gamesRead)} & ${n(s.counts.kept.fast)} & ${n(s.counts.kept.slow)} \\\\`), '\\bottomrule', '\\end{tabular}'].join('\n'))
g.block('MomentTable', ['\\begin{tabular}{lrrr}', '\\toprule', 'moment & fast & slow & players in both budgets \\\\', '\\midrule',
  ...[...p.triggers,'none',...p.candidates].map(k=>{const v=r.moments.primary[k]; return `${esc(k)} & ${n(v.fast)} & ${n(v.slow)} & ${n(v.playersBothBudgets)} \\\\`}), '\\bottomrule', '\\end{tabular}'].join('\n'))
g.write(join(HERE, 'generated.tex'))
console.error('wrote projects/think-time-budget/paper/generated.tex')
