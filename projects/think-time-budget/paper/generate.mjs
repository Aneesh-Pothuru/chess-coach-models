// Publication only: every number comes from saved aggregates or the frozen rule.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Generated, esc, fixed } from '../../paper.mjs'
import { loadReport, claim, names, triggerOrder, candidateOrder } from '../publication.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const { analysis: a, phase1: r, cohort: c, rule: p } = loadReport()
const order = ['after-opp-error', ...triggerOrder, ...candidateOrder.filter(k => k !== 'after-opp-error')]
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y)
const n = x => x.toLocaleString('en-US')
const sign = (x, digits = 3) => `${x >= 0 ? '+' : ''}${fixed(x, digits)}`
const checkedInterval = x => {
  if (x === null) return null
  claim(x !== undefined, 'printed interval exists in the saved report')
  claim(['value','lo','hi'].every(k => typeof x[k] === 'number' && Number.isFinite(x[k])), 'printed interval has finite saved endpoints')
  claim(x.lo <= x.hi, 'printed interval endpoints are ordered')
  return x
}
const ci = (value, scale = 1) => {
  const x = checkedInterval(value)
  return x == null ? 'cannot tell' : `${sign(scale*x.value)} (${sign(scale*x.lo)} to ${sign(scale*x.hi)})`
}
const cell = (value, scale = 1) => {
  const x = checkedInterval(value)
  return x == null ? 'cannot tell' : `\\shortstack{${sign(scale*x.value)}\\\\(${sign(scale*x.lo)}, ${sign(scale*x.hi)})}`
}
const label = k => `${esc(names[k])}\\textsuperscript{${triggerOrder.includes(k) ? 'T' : 'C'}}`
const g = new Generated('projects/think-time-budget/paper/generate.mjs')

// Protocol claims. The loader also checks original hashes, unchanged rule,
// input identities, support and the stored decision logic.
claim(r.gamesBuilt === Object.values(c.exports).reduce((s,x) => s+Object.values(x.games).reduce((v,w) => v+w,0),0), 'every selected game built')
claim(r.blackBuildsChecked > 0 && r.clockMovesChecked > 0, 'reader and clock checks ran')
claim(Object.values(c.sources).every(s => !s.complete && s.filters.everyMoveEvalAndClock && s.filters.eventPrefix === 'Rated Rapid'), 'rapid prefixes with complete annotations')
claim(Object.values(c.sources).every(s => s.filters.fast === '600+0' && s.filters.minPlies === 20 && s.filters.maxRatingGap === 300), 'common game filters')
claim(p.strata === 5 && p.folds === 5 && p.draws === 4000 && p.seed === 20261018, 'registered strata and bootstrap')
claim(p.minPlayers === 200 && p.minCoverage === .8 && p.thinkFloorSeconds === 2 && p.placeboSeconds === 5 && p.placeboMargin === .01 && p.alpha === .05, 'registered decision bars')
claim(p.model.n_jobs === 1 && p.model.n_estimators === 400 && p.model.random_state === 0, 'fixed single-worker danger model')
claim(p.features.every(k => !/(clock|think|budget|base|increment|timeControl|^tc$)/i.test(k)), 'danger excludes clocks and budget')
claim(same(r.danger.features,p.features) && same(r.danger.params,p.model), 'fitted danger follows the rule')
claim(r.danger.folds.length === p.folds && r.danger.folds.reduce((s,f) => s+f.scoredMoves,0) === r.overall.eligible.fast.moves+r.overall.eligible.slow.moves, 'every eligible move scored once')
claim(p.defendingCp === -300 && p.earlyOwnMoves === 4 && p.highDangerQuantile === .8, 'candidate definitions')
claim(c.selectedK === 2 && c.selected.primaryPlayers >= c.selectionRule.targetPrimaryPlayers, 'count-selected minimum games and target')
claim(same(Object.keys(a.trend),['900-1099','1100-1299','1300-1499','1500-1699','1700-1899','1900-2099']), 'registered rating bands')

// Refuse to publish if any result-specific sentence needs rewriting.
claim(a.checks.overallPass && a.checks.all.err.hi < 0, 'overall interval below zero')
claim(a.checks.placeboStatus === 'inconclusive' && !a.checks.gatesPass, 'placebo blocks changes')
claim(a.checks.placebo.err.lo < -p.placeboMargin && a.checks.placebo.err.hi > -p.placeboMargin && a.checks.placebo.err.hi < 0, 'placebo crosses its lower tolerance boundary')
claim(order.every(k => a.comparisons[k].verdict === 'cannot tell; leave unchanged'), 'every app verdict leaves triggers unchanged')
const failed = order.filter(k => !a.comparisons[k].support.sufficient)
claim(same([...failed].sort(),['book-end','structure','in-check','defending'].sort()), 'exact coverage failures')
claim(failed.every(k => a.comparisons[k].support.supportedPlayers >= p.minPlayers && Math.min(...a.comparisons[k].support.coverage) < p.minCoverage), 'coverage fails, not the player floor')
claim(order.every(k => a.comparisons[k].moment.ratioIdentified && a.comparisons[k].noneSamePlayers.ratioIdentified), 'extra-think floor met at every moment and paired none')
const advantages = order.filter(k => a.comparisons[k].contrast?.value > 0 && a.comparisons[k].pHolm < p.alpha)
claim(same([...advantages].sort(),['forcing','high-danger'].sort()), 'only forcing and high danger survive Holm with positive advantages')
claim(advantages.every(k => a.comparisons[k].moment.err.hi < 0), 'those moments also have below-zero error intervals')
const after = a.comparisons['after-opp-error']
claim(after.support.sufficient && after.moment.err.lo < 0 && after.moment.err.hi > 0 && after.contrast.lo < 0 && after.contrast.hi > 0 && after.pHolm >= p.alpha, 'leading candidate error and advantage unresolved')
claim(['tenStrata','zeroIncrementSlow'].every(k => a.sensitivity[k].all.err.lo < 0 && a.sensitivity[k].all.err.hi > 0), 'both sensitivity overall intervals cross zero')
claim(Object.values(a.dangerDiagnostics).every(v => Number.isInteger(v.moves) && v.moves > 0 && Number.isFinite(v.brier) && v.brier >= 0 && Number.isFinite(v.auc) && v.auc >= 0 && v.auc <= 1), 'saved danger diagnostics are defined')

const defs = {
  AppCommit: esc(a.appCommit), InputFingerprint: esc(a.fingerprint), Months: esc(a.months.join(' and ')),
  FastControl: esc(Object.values(c.sources)[0].filters.fast), MinBase: p.slowMinBase,
  IncrementMultiplier: p.budgetIncrementMultiplier, MinBudget: p.slowMinBudget,
  PrimaryPlayers: n(c.selected.primaryPlayers), SelectedPlayers: n(c.selected.players),
  MinimumGames: c.selectedK, BuiltGames: n(r.gamesBuilt),
  MinPlies: Object.values(c.sources)[0].filters.minPlies, RatingGap: Object.values(c.sources)[0].filters.maxRatingGap,
  RatingLo: p.primaryLo, RatingHi: p.primaryHiExclusive, MinClock: p.minClock,
  BlackChecked: n(r.blackBuildsChecked), ClockChecked: n(r.clockMovesChecked),
  FoldCount: p.folds, StrataCount: p.strata, TreeCount: p.model.n_estimators,
  Draws: n(p.draws), Seed: p.seed, MinPlayers: p.minPlayers, Coverage: 100*p.minCoverage,
  Confidence: 95, ThinkFloor: p.thinkFloorSeconds, PlaceboSeconds: p.placeboSeconds,
  PlaceboPoints: 100*p.placeboMargin, Alpha: p.alpha, SecondsPerMinute: 60,
  TriggerCount: triggerOrder.length, CandidateCount: candidateOrder.length, ComparisonCount: order.length,
  FailedCoverageCount: failed.length, DeepSeconds: r.appConstants.DEEP_THINK_SECONDS,
  BookSeconds: r.appConstants.BOOK_END_SECONDS, QuickSeconds: r.appConstants.RUSHED_SECONDS,
  DefendingCp: fixed(p.defendingCp,0), EarlyMoves: p.earlyOwnMoves, HighQuantile: 100*p.highDangerQuantile,
  PrimaryFastMoves: n(r.overall.primary.fast.moves), PrimarySlowMoves: n(r.overall.primary.slow.moves),
  FastThink: fixed(r.overall.primary.fast.meanThinkSeconds,2), SlowThink: fixed(r.overall.primary.slow.meanThinkSeconds,2),
  OverallError: ci(a.checks.all.err,100), PlaceboError: ci(a.checks.placebo.err,100),
  AfterError: ci(after.moment.err,100), AfterThink: ci(after.moment.think),
  AfterValue: ci(after.moment.valuePerMinute), AfterContrast: ci(after.contrast), AfterP: fixed(after.pHolm,5),
  ForcingP: fixed(a.comparisons.forcing.pHolm,5), DangerP: fixed(a.comparisons['high-danger'].pHolm,5),
  TenStrata: 10, TenOverallError: ci(a.sensitivity.tenStrata.all.err,100),
  ZeroOverallError: ci(a.sensitivity.zeroIncrementSlow.all.err,100),
  BridgeMinutes: fixed(r.timing.bridgeWorkerSeconds/60,1), Workers: 2,
  BridgeTwoMinutes: fixed(r.timing.bridgeTwoProcessIdealSeconds/60,1), DangerSeconds: fixed(r.danger.seconds,1),
}
for (const [key,value] of Object.entries(defs)) {
  claim(value !== undefined && !String(value).includes('NaN'), `defined generated number: ${key}`)
  g.def(key,String(value))
}
const table = (command,columns,header,rows) => g.block(command,[
  `\\begin{tabularx}{\\linewidth}{${columns}}`, '\\toprule', `${header} \\\\`, '\\midrule',
  ...rows.map(row => `${row.join(' & ')} \\\\`), '\\bottomrule', '\\end{tabularx}',
].join('\n'))
table('SourceTable','Lrrr','month & source games & fast kept & slow kept',
  Object.entries(c.sources).map(([m,s]) => [esc(m),n(s.counts.gamesRead),n(s.counts.kept.fast),n(s.counts.kept.slow)]))
const common = Object.entries(c.selectedSlowTimeControls).sort(([,x],[,y]) => y.games-x.games).slice(0,3)
claim(common[0][1].gamesShare > .5, 'one slow control supplies most selected slow games')
table('ControlTable','Lrr','slow control & selected games & share (\\%)',
  [...common.map(([control,v]) => [esc(control),n(v.games),fixed(v.gamesShare*100,2)]),
   ['Other controls',n(Object.values(c.selectedSlowTimeControls).reduce((s,v)=>s+v.games,0)-common.reduce((s,[,v])=>s+v.games,0)),
    fixed(100*(1-common.reduce((s,[,v])=>s+v.gamesShare,0)),2)]])
table('CheckTable','Lcrr','set & $\\Delta$ errors (pp) & players & coverage (\\%)',
  [['All eligible moves',cell(a.checks.all.err,100),n(a.checks.all.support.supportedPlayers),fixed(100*a.checks.all.support.coverage[0],1)],
   ['Under the placebo time limit',cell(a.checks.placebo.err,100),n(a.checks.placebo.support.supportedPlayers),fixed(100*a.checks.placebo.support.coverage[0],1)]])
table('EstimateTable','Lccc','moment & $\\Delta$ errors (pp) & $\\Delta$ think (s) & $v_T$',
  order.map(k => [label(k),cell(a.comparisons[k].moment.err,100),cell(a.comparisons[k].moment.think),cell(a.comparisons[k].moment.valuePerMinute)]))
table('ContrastTable','Lccr','moment & paired $v_{\\rm none}$ & $v_T-v_{\\rm none}$ & Holm $p$',
  order.map(k => [label(k),cell(a.comparisons[k].noneSamePlayers.valuePerMinute),cell(a.comparisons[k].contrast),fixed(a.comparisons[k].pHolm,5)]))
table('SupportTable','Lrrcc','moment & before & matched & coverage T / none (\\%) & sufficient',
  order.map(k => {const s=a.comparisons[k].support; return [label(k),n(s.pairedPlayers),n(s.supportedPlayers),s.coverage.map(x=>fixed(100*x,1)).join(' / '),s.sufficient?'yes':'no']}))
table('NoneTable','Lcc','moment paired to none & none $\\Delta$ errors (pp) & none $\\Delta$ think (s)',
  order.map(k => [label(k),cell(a.comparisons[k].noneSamePlayers.err,100),cell(a.comparisons[k].noneSamePlayers.think)]))
table('SensitivityTable','Lcc','moment & finer strata: $\\Delta$ errors (pp) & no increment: $\\Delta$ errors (pp)',
  [...order,'none'].map(k => [k==='none'?esc(names[k]):label(k),cell(a.sensitivity.tenStrata[k].err,100),cell(a.sensitivity.zeroIncrementSlow[k].err,100)]))
table('TrendTable','Lccc','mean rating & after opponent error & forcing & no trigger',
  Object.entries(a.trend).map(([band,row]) => [esc(band),cell(row['after-opp-error'].err,100),cell(row.forcing.err,100),cell(row.none.err,100)]))
table('DiagnosticsTable','Lrrr','quick budget & moves & Brier score & AUC',
  Object.entries(a.dangerDiagnostics).map(([budget,v]) => [esc(budget),n(v.moves),fixed(v.brier,4),fixed(v.auc,4)]))
g.write(join(HERE,'generated.tex'))
console.error('wrote projects/think-time-budget/paper/generated.tex from saved phase-two aggregates')
