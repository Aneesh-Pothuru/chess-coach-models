#!/usr/bin/env node
// Writes paper/generated.tex for the period-video-coaching paper from what
// bin/export.py wrote (results/report.json and results/runs.json). It refuses
// to write when a claim the paper makes no longer holds.
//
//   bridge/run.sh projects/period-video-coaching/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resultsDir } from '../../../bridge/lib/lab.mjs'
import { Generated, esc, fixed, percent, word } from '../../paper.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (f) => JSON.parse(readFileSync(join(resultsDir('period-video-coaching'), f), 'utf8'))
const R = read('report.json')
const U = read('runs.json')
const g = new Generated('projects/period-video-coaching/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase())
const Word = (n) => cap(word(n))
const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const mean = (xs) => (xs.length ? sum(xs) / xs.length : null)
const signed = (x, d = 2) => (x > 0 ? `+${fixed(x, d)}` : fixed(x, d))
const interval = (b, d = 2) => (b ? `${signed(b.est, d)} {\\footnotesize (${signed(b.lo, d)} to ${signed(b.hi, d)})}` : '--')
const ratio = (b) => `${fixed(b.est, 2)} {\\footnotesize (${fixed(b.lo, 2)} to ${fixed(b.hi, 2)})}`
const listed = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
const weekly = (id) => id.includes('-W')
const label = (id) => (weekly(id) ? `week ${Number(id.split('-W')[1])}` : new Date(`${id}-15T12:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }))
const short = (id) => (weekly(id) ? `W${Number(id.split('-W')[1])}` : new Date(`${id}-15T12:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }))
const BASE = R.report.vs
const CAND = R.report.config
const CRITERIA = ['truth', 'coaching', 'listening', 'overall']
const MOVES = ['openQuestion', 'habitNamed', 'replacement', 'thenWhat', 'level']
const TARGET = { weekly: [5, 8], monthly: [6, 9] }
const CAP = 276
const PILOT_CAP = 50
const rep = R.report

// ---- the candidate, as the variant inserts it ----
const insert = JSON.parse(readFileSync(join(HERE, '..', 'variants', 'coach-moves.json'), 'utf8')).insert
claim(insert.weekly.text === insert.monthly.text, 'the weekly and monthly prompts take the same bullet')
const tex = (s) => s.split(/(`[^`]*`)/).map((part) => (part.startsWith('`') ? `\\texttt{${esc(part.slice(1, -1)).replace(/--/g, '-{}-')}}` : esc(part).replace(/"([^"]*)"/g, "``$1''"))).join('')
const bulletLines = insert.weekly.text.split('\n').filter((l) => l.trim())
claim(bulletLines.length === 6, 'the bullet is a lead and five sub-points')
g.block('CandidateBullet', [
  '\\begin{quote}\\small',
  tex(bulletLines[0].replace(/^\s*-\s*/, '')),
  '\\begin{itemize}[nosep]',
  ...bulletLines.slice(1).map((l) => `\\item ${tex(l.replace(/^\s*-\s*/, ''))}`),
  '\\end{itemize}',
  '\\end{quote}',
].join('\n'))

// ---- what was measured ----
const all = Object.keys(R.cases)
const usable = all.filter((i) => R.cases[i].usable)
const runs = U.runs
const of = (config, k = null) => runs.filter((r) => r.config === config && (k === null || r.rep === k))
const judged = U.pairs.filter((p) => p.candidate && p.rep === 1)
const periods = judged.map((p) => p.id)
const firstRuns = (config) => periods.map((i) => of(config, 1).find((r) => r.id === i))
const weeks = all.filter(weekly)
const months = all.filter((i) => !weekly(i))
const weekNos = weeks.map((i) => Number(i.split('-W')[1])).sort((a, b) => a - b)
const years = [...new Set(all.map((i) => i.slice(0, 4)))]
claim(years.length === 1, 'the periods fall in one year')
g.def('CaseSpan', `weeks ${weekNos[0]} to ${weekNos.at(-1)} and the months of ${listed(months.map(label))} ${years[0]}`)
g.def('AllPeriods', word(all.length)).def('Cases', word(periods.length)).def('CasesCap', Word(periods.length))
g.def('WeeksN', word(weeks.length)).def('MonthsN', word(months.length))
claim(periods.length === usable.length && usable.length === all.length, 'every period was usable, and written and judged under both prompts')
const commits = [...new Set(all.map((i) => R.cases[i].code))]
claim(commits.length === 1, 'every case runs the app at one commit')
g.def('AppCommit', commits[0].slice(0, 10))
const refFailed = all.filter((i) => R.cases[i].referenceErrors > 0)
const refPassed = all.filter((i) => R.cases[i].referenceErrors === 0)
claim(refPassed.length === 1 && refFailed.length === all.length - 1, 'only one published review passes today\'s strict check')
g.def('RefFailedN', word(refFailed.length)).def('RefPassed', label(refPassed[0]))
const refErrors = refFailed.map((i) => R.cases[i].referenceErrors)
g.def('RefErrorsMin', String(Math.min(...refErrors))).def('RefErrorsMax', String(Math.max(...refErrors)))
const trainPeriods = periods.filter((i) => R.train.includes(i))
const heldPeriods = periods.filter((i) => R.heldOut.includes(i))
g.def('TrainN', word(trainPeriods.length)).def('HeldN', word(heldPeriods.length))
const spanOf = (ids) => {
  const nums = ids.filter(weekly).map((i) => Number(i.split('-W')[1])).sort((a, b) => a - b).map(String)
  const ms = ids.filter((i) => !weekly(i)).map(label)
  const ws = nums.length ? `week${nums.length > 1 ? 's' : ''} ${listed(nums)}` : ''
  return ws && ms.length ? `${ws}, and ${listed(ms)}` : ws || listed(ms)
}
g.def('TrainCases', spanOf(trainPeriods)).def('HeldCases', spanOf(heldPeriods))
const games = (ids) => ids.map((i) => R.cases[i].games)
g.def('WeekGamesMin', word(Math.min(...games(weeks)))).def('WeekGamesMax', word(Math.max(...games(weeks))))
g.def('MonthGames', listed(months.map((i) => `${R.cases[i].games} (${label(i)})`)))
const nullPairs = U.pairs.filter((p) => p.null)
claim(nullPairs.every((p) => weekly(p.id)), 'the noise floor\'s second runs are weeks')
g.def('WriterRuns', String(runs.length)).def('NullN', word(nullPairs.length)).def('NullCases', spanOf(nullPairs.map((p) => p.id)))
g.def('WordsPerSecond', String(R.method.wordsPerSecond)).def('MinDecoyWords', String(R.method.minDecoyWords))
g.def('Spent', fixed(R.spent, 0)).def('Cap', String(CAP)).def('PilotCap', String(PILOT_CAP))
g.def('WriterSpend', fixed(R.spend.writer, 0)).def('GraderSpend', fixed((R.spend.grader || 0) + (R.spend.judge || 0) + (R.spend.decoy || 0), 0))
g.def('LostSpend', fixed(R.spend.lost || 0, 2))
claim(R.spent <= CAP, 'the eval stayed under its cap')
const sd = R.usage.sevenDay
g.def('SevenDayFirst', percent(sd.first, 0)).def('SevenDayLast', percent(sd.last, 0))

// ---- the coaching moves ----
const pooled = (rows, key) => {
  const made = sum(rows.map((t) => (t[key] || [0, 0])[0]))
  const owed = sum(rows.map((t) => (t[key] || [0, 0])[1]))
  return owed ? made / owed : null
}
const tallies = (config) => of(config, 1).filter((r) => periods.includes(r.id) && r.audit).map((r) => r.audit.tally)
const published = periods.map((i) => R.cases[i].published).filter(Boolean)
const pubT = published.map((a) => a.tally)
const SETS = [['Pub', pubT], ['Base', tallies(BASE)], ['Cand', tallies(CAND)]]
claim(pubT.length === periods.length && tallies(BASE).length === periods.length && tallies(CAND).length === periods.length, 'every script was audited')
g.def('PublishedN', word(pubT.length))
const NAMES = {
  openQuestion: 'Asks what he would play before any hint',
  habitNamed: 'Names the habit behind the mistake',
  replacement: 'Ends on the habit that replaces it',
  thenWhat: 'Plays out their best reply to the better move',
  level: 'Says whether the miss is normal at his level',
  levelTrue: '\\quad and that agrees with the evidence',
  praiseNamed: 'Praise names what the good move saw',
  openQuestionAll: 'Any board scene: an open question first',
}
for (const [name, ts] of SETS) {
  for (const k of [...MOVES, 'levelTrue', 'praiseNamed', 'openQuestionAll']) g.def(`${name}${cap(k)}`, percent(pooled(ts, k) ?? 0, 0))
  g.def(`${name}Moments`, fixed(mean(ts.map((t) => t.moments)), 1)).def(`${name}Scenes`, fixed(mean(ts.map((t) => t.scenes)), 1))
}
const cells = (sets, k) => sets.map(([, ts]) => {
  const owed = sum(ts.map((t) => (t[k] || [0, 0])[1]))
  return owed ? `${percent(pooled(ts, k), 0)}\\% {\\footnotesize (${owed})}` : '--'
}).join(' & ')
const movesRow = (k) => `${NAMES[k]} & ${cells(SETS, k)} \\\\`
const told = (rows) => rows.filter(Boolean)
const TOLD_SETS = [['Pub', told(periods.map((i) => R.cases[i].publishedTold))], ['Base', told(firstRuns(BASE).map((r) => r.told))], ['Cand', told(firstRuns(CAND).map((r) => r.told))]]
claim(TOLD_SETS.every(([, ts]) => ts.length === periods.length), 'every script was counted by the positions it teaches')
for (const [name, ts] of TOLD_SETS) {
  g.def(`${name}Split`, fixed(mean(ts.map((t) => t.split)), 1)).def(`${name}Positions`, fixed(mean(ts.map((t) => t.positions)), 1))
  for (const k of ['habitNamed', 'replacement', 'level']) g.def(`${name}Told${cap(k)}`, percent(pooled(ts, k) ?? 0, 0))
}
const toldRow = (k) => `${NAMES[k]} & ${cells(TOLD_SETS, k)} \\\\`
g.block('MovesTable', [
  '\\begin{tabular}{lrrr}',
  '\\toprule',
  'In the moment scenes & Published & Today\'s prompts & Candidate \\\\',
  '\\midrule',
  ...MOVES.map(movesRow),
  movesRow('levelTrue'),
  '\\midrule',
  '\\multicolumn{4}{l}{\\emph{Counted once per position taught}} \\\\',
  ...['habitNamed', 'replacement', 'level'].map(toldRow),
  '\\midrule',
  movesRow('praiseNamed'),
  movesRow('openQuestionAll'),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
g.def('ShareBase', percent(rep.all['audit.coachingShare.base'].est, 0)).def('ShareCand', percent(rep.all['audit.coachingShare'].est, 0))
g.def('ShareDiff', interval(rep.all['audit.coachingShare.minusBase']))

// ---- length, cost, the check ----
const passed = {}
const inTarget = (id, seconds) => {
  const [lo, hi] = TARGET[R.cases[id].kind]
  return seconds < lo * 60 ? 'under' : seconds > hi * 60 ? 'over' : 'in'
}
for (const [name, config] of [['Base', BASE], ['Cand', CAND]]) {
  const rs = firstRuns(config)
  g.def(`${name}Heard`, fixed(mean(rs.map((r) => r.shape.seconds)) / 60, 1)).def(`${name}Words`, String(Math.round(mean(rs.map((r) => r.shape.words)))))
  g.def(`${name}Cost`, fixed(mean(rs.map((r) => r.cost)), 2)).def(`${name}Minutes`, fixed(mean(rs.map((r) => r.minutes)), 0)).def(`${name}Rounds`, fixed(mean(rs.map((r) => r.rounds)), 1))
  g.def(`${name}Passed`, String(rs.filter((r) => r.pass).length)).def(`${name}Runs`, String(rs.length))
  passed[name] = rs.filter((r) => r.pass).length
  g.def(`${name}BoardScenes`, fixed(mean(rs.map((r) => r.shape.boardScenes)), 1)).def(`${name}Questions`, fixed(mean(rs.map((r) => r.shape.questions)), 1))
  g.def(`${name}AllScenes`, fixed(mean(rs.map((r) => r.shape.scenes)), 1))
  for (const kind of ['weekly', 'monthly']) {
    const ks = rs.filter((r) => R.cases[r.id].kind === kind)
    const Kind = kind === 'weekly' ? 'Week' : 'Month'
    g.def(`${name}${Kind}Heard`, fixed(mean(ks.map((r) => r.shape.seconds)) / 60, 1))
    for (const where of ['under', 'in', 'over']) g.def(`${name}${Kind}${cap(where)}`, word(ks.filter((r) => inTarget(r.id, r.shape.seconds) === where).length))
  }
}
const pubSeconds = periods.map((i) => [i, R.cases[i].published && R.cases[i].published.seconds]).filter(([, s]) => s)
g.def('PubHeard', fixed(mean(pubSeconds.map(([, s]) => s)) / 60, 1))
for (const kind of ['weekly', 'monthly']) {
  const Kind = kind === 'weekly' ? 'Week' : 'Month'
  const ks = pubSeconds.filter(([i]) => R.cases[i].kind === kind)
  g.def(`Pub${Kind}Heard`, fixed(mean(ks.map(([, s]) => s)) / 60, 1))
  g.def(`${Kind}TargetLo`, word(TARGET[kind][0])).def(`${Kind}TargetHi`, word(TARGET[kind][1]))
}
const RENDER_SETS = [['Base', BASE], ['Cand', CAND]]
claim(RENDER_SETS.every(([, config]) => firstRuns(config).every((r) => r.rendered && r.rendered.seconds > 0)), 'every first run was timed in the app\'s own voice')
const rendered = (rs) => rs.map((r) => r.rendered.seconds)
for (const [name, config] of RENDER_SETS) {
  const rs = firstRuns(config)
  g.def(`${name}Rendered`, fixed(mean(rendered(rs)) / 60, 1))
  for (const kind of ['weekly', 'monthly']) {
    const ks = rs.filter((r) => R.cases[r.id].kind === kind)
    const Kind = kind === 'weekly' ? 'Week' : 'Month'
    g.def(`${name}${Kind}Rendered`, fixed(mean(rendered(ks)) / 60, 1))
    for (const where of ['under', 'in', 'over']) g.def(`${name}${Kind}Rendered${cap(where)}`, word(ks.filter((r) => inTarget(r.id, r.rendered.seconds) === where).length))
  }
}
const renderedShare = mean(RENDER_SETS.flatMap(([, config]) => firstRuns(config).map((r) => r.rendered.seconds / r.shape.seconds)))
g.def('RenderedShare', percent(renderedShare, 0))
const estimateOff = Math.max(...RENDER_SETS.flatMap(([, config]) => firstRuns(config).map((r) => Math.abs(r.rendered.estimatedSeconds / r.rendered.seconds - 1))))
g.def('EstimateOff', percent(estimateOff, 0))
const renderedRatio = mean(periods.map((i) => of(CAND, 1).find((r) => r.id === i).rendered.seconds / of(BASE, 1).find((r) => r.id === i).rendered.seconds))
g.def('RenderedRatio', fixed(renderedRatio, 2))
const voice = firstRuns(CAND)[0].rendered
g.def('Voice', esc(voice.voice)).def('VoiceSpeed', String(voice.speed))
const lengthRow = (kind) => {
  const Kind = kind === 'weekly' ? 'Weeks' : 'Months'
  const [lo, hi] = TARGET[kind]
  const ids = periods.filter((i) => R.cases[i].kind === kind)
  const cell = (config) => {
    const rs = firstRuns(config).filter((r) => R.cases[r.id].kind === kind)
    const inside = rs.filter((r) => inTarget(r.id, r.rendered.seconds) === 'in').length
    return `${fixed(mean(rs.map((r) => r.shape.seconds)) / 60, 1)} & ${fixed(mean(rendered(rs)) / 60, 1)} & ${inside} of ${rs.length}`
  }
  const pub = ids.map((i) => R.cases[i].published && R.cases[i].published.seconds).filter(Boolean)
  return `${Kind} & ${lo} to ${hi} & ${fixed(mean(pub) / 60, 1)} & ${cell(BASE)} & ${cell(CAND)} \\\\`
}
g.block('LengthTable', [
  '\\begin{tabular}{lcrrrrrrr}',
  '\\toprule',
  ' & Grammar & Published & \\multicolumn{3}{c}{Today\'s prompts} & \\multicolumn{3}{c}{Candidate} \\\\',
  '\\cmidrule(lr){4-6}\\cmidrule(lr){7-9}',
  ' & minutes & heard once & heard once & rendered & inside & heard once & rendered & inside \\\\',
  '\\midrule',
  lengthRow('weekly'),
  lengthRow('monthly'),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
const monthRendered = (config) => months.map((i) => fixed(of(config, 1).find((r) => r.id === i).rendered.seconds / 60, 1))
g.def('MonthLengthText', `rendered, the candidate's ${listed(months.map(label))} videos last ${listed(monthRendered(CAND))} minutes and today's ${listed(monthRendered(BASE))}, against the grammar's ${word(TARGET.monthly[0])} to ${word(TARGET.monthly[1])}`)
const recent = weeks.slice().sort().slice(-4)
const pubRecent = mean(recent.map((i) => R.cases[i].published.seconds))
const baseRecent = mean(recent.map((i) => of(BASE, 1).find((r) => r.id === i).shape.seconds))
g.def('RecentWeeks', `weeks ${listed(recent.map((i) => String(Number(i.split('-W')[1]))))}`).def('PubRecentHeard', fixed(pubRecent / 60, 1)).def('BaseRecentHeard', fixed(baseRecent / 60, 1))
claim(Math.abs(pubRecent / baseRecent - 1) < 0.1, 'over the last four weeks the published videos run about as long heard once as today\'s replays')
const older = weeks.filter((i) => !recent.includes(i))
claim(mean(older.map((i) => R.cases[i].published.seconds)) > pubRecent, 'the earlier published weeks ran longer')
const shorter = periods.filter((i) => of(CAND, 1).find((r) => r.id === i).shape.seconds < of(BASE, 1).find((r) => r.id === i).shape.seconds)
claim(shorter.length === 1 && shorter[0] === '2026-08', 'only on August was the candidate\'s video the shorter')
const weekRendered = (config) => firstRuns(config).filter((r) => R.cases[r.id].kind === 'weekly')
claim(weekRendered(BASE).every((r) => inTarget(r.id, r.rendered.seconds) !== 'over') && weekRendered(CAND).every((r) => inTarget(r.id, r.rendered.seconds) !== 'under'), 'today\'s weeks outside the grammar\'s minutes run short and the candidate\'s run long')
claim(weekRendered(CAND).filter((r) => inTarget(r.id, r.rendered.seconds) === 'over').length === 1, 'one of the candidate\'s weeks runs past the grammar\'s minutes')
const candWeekMean = mean(rendered(weekRendered(CAND))) / 60
const baseWeekMean = mean(rendered(weekRendered(BASE))) / 60
claim(candWeekMean > TARGET.weekly[0] && candWeekMean < TARGET.weekly[1] && baseWeekMean < candWeekMean, 'rendered, the candidate\'s weekly videos average inside the grammar\'s minutes, longer than today\'s')
claim(Math.abs(renderedRatio - rep.all.lengthRatio.est) < 0.1, 'rendered, the candidate is about as much longer as heard once')
g.def('LengthCap', '1.3')
g.def('LengthRatio', fixed(rep.all.lengthRatio.est, 2)).def('LengthRatioInterval', ratio(rep.all.lengthRatio))
claim(runs.every((r) => r.pass), 'every run passed the final check')
claim(runs.every((r) => !r.forbidden.length), 'no writer ran a forbidden command')

// ---- the judge ----
for (const [name, split] of [['Train', 'train'], ['Held', 'heldOut'], ['All', 'all']]) {
  for (const c of CRITERIA) g.def(`${name}${cap(c)}`, interval(rep[split][`judge.${c}`]))
}
g.def('AllNullCoaching', interval(rep.all['null.coaching']))
const verdicts = (c) => judged.map((p) => p.candidate.final[c])
const tally = (c, v) => verdicts(c).filter((x) => x === v).length
for (const c of CRITERIA) g.def(`${cap(c)}Wins`, word(tally(c, 'candidate'))).def(`${cap(c)}Losses`, word(tally(c, 'reference'))).def(`${cap(c)}Ties`, word(tally(c, 'tie')))
const nullDecisive = nullPairs.filter((p) => p.null.final.coaching !== 'tie').length
g.def('NullDecisive', word(nullDecisive))
const decided = []
for (const v of [...judged.map((p) => p.candidate), ...nullPairs.map((p) => p.null)]) {
  for (const r of v.orders) for (const c of CRITERIA) if (r[c] !== 'tie') decided.push(r[c] === r.order[1] ? 'second' : 'first')
}
const second = decided.filter((x) => x === 'second').length
g.def('Decided', String(decided.length)).def('SecondShare', percent(second / decided.length, 0))

// ---- the controls ----
const controls = Object.entries(U.controls).filter(([i]) => periods.includes(i)).map(([, c]) => c)
const same = controls.filter((c) => c.same)
const decoy = controls.filter((c) => c.decoy)
claim(same.length === periods.length && decoy.length === periods.length, 'both controls cover every judged period')
const sameBroken = same.filter((c) => CRITERIA.some((k) => c.same.final[k] !== 'tie')).length
const decoyCoach = decoy.filter((c) => c.decoy.final.coaching === 'candidate').length
const decoyLost = (k) => decoy.filter((c) => c.decoy.final[k] === 'reference').length
g.def('SameN', word(same.length)).def('SameBroken', word(sameBroken)).def('DecoyN', word(decoy.length)).def('DecoyCoaching', word(decoyCoach))
g.def('DecoyLostListening', word(decoyLost('listening'))).def('DecoyLostOverall', word(decoyLost('overall'))).def('DecoyLostCoaching', word(decoyLost('coaching')))
const texts = controls.map((c) => c.decoyText).filter(Boolean)
g.def('DecoyAdded', String(Math.round(mean(texts.map((t) => t.added)))))

// ---- truth ----
for (const [name, config] of [['Base', BASE], ['Cand', CAND]]) {
  const as = firstRuns(config).map((r) => r.audit).filter(Boolean)
  g.def(`${name}False`, fixed(mean(as.map((a) => a.counts.false)), 2)).def(`${name}Unsupported`, fixed(mean(as.map((a) => a.counts.unsupported)), 1))
  g.def(`${name}Misleading`, fixed(mean(as.map((a) => a.counts.misleading)), 1)).def(`${name}BoardFalse`, fixed(mean(as.map((a) => a.tally.boardClaimsFalse)), 2))
}
g.def('PubFalse', fixed(mean(published.map((a) => a.counts.false)), 1)).def('PubBoardFalse', fixed(mean(published.map((a) => a.tally.boardClaimsFalse)), 1))
g.def('FalseDiff', interval(rep.all['audit.false.minusBase'])).def('BoardDiff', interval(rep.all['audit.boardClaimsFalse.minusBase']))

// ---- the pilot's first grading ----
const first = runs.find((r) => r.config === CAND && r.earlier && r.earlier['graded-v1'] && r.earlier['graded-v1']['judge-vs-baseline'])
claim(Boolean(first), "the first grading of the pilot's pair is kept")
g.def('FirstGradedPeriod', label(first.id))
const firstFinal = first.earlier['graded-v1']['judge-vs-baseline'].final
const nowFinal = judged.find((p) => p.id === first.id).candidate.final
const verdictWord = { candidate: 'preferred the candidate', reference: "preferred today's prompt", tie: 'tied' }
for (const c of CRITERIA) g.def(`First${cap(c)}`, verdictWord[firstFinal[c]]).def(`Now${cap(c)}`, verdictWord[nowFinal[c]])
const regraded = runs.filter((r) => r.audit && r.earlier && r.earlier['graded-v1'] && r.earlier['graded-v1'].audit)
const pubRegraded = periods.filter((i) => R.cases[i].published && R.cases[i].publishedEarlier && R.cases[i].publishedEarlier['graded-v1'] && R.cases[i].publishedEarlier['graded-v1']['audit-published'])
const shareMoves = [
  ...regraded.map((r) => Math.abs(r.audit.tally.coachingShare - r.earlier['graded-v1'].audit.tally.coachingShare)),
  ...pubRegraded.map((i) => Math.abs(R.cases[i].published.tally.coachingShare - R.cases[i].publishedEarlier['graded-v1']['audit-published'].tally.coachingShare)),
].filter((x) => Number.isFinite(x))
g.def('RegradedN', word(shareMoves.length)).def('RegradeShare', fixed(mean(shareMoves) * 100, 0)).def('RegradeMax', fixed(Math.max(...shareMoves) * 100, 0))

// ---- the rule ----
const RULE = rep.rule
const ruleRows = [
  ['Coaching on the train periods above 0', interval(rep.train['judge.coaching']), RULE['1 coaching better on train']],
  ['Coaching on the held-out periods above 0', interval(rep.heldOut['judge.coaching']), RULE['2 coaching better held out']],
  ['Overall not below 0', interval(rep.all['judge.overall']), RULE['3 overall not worse']],
  ['False claims per script not up', interval(rep.all['audit.false.minusBase']), !(rep.all['audit.false.minusBase'].lo > 0)],
  ['False board claims per script not up', interval(rep.all['audit.boardClaimsFalse.minusBase']), !(rep.all['audit.boardClaimsFalse.minusBase'].lo > 0)],
  ['The check passes as often', `${passed.Cand} of ${periods.length} {\\footnotesize (today's: ${passed.Base})}`, RULE['5 check passes as often']],
  ['Controls clean (noise floor: coaching)', interval(rep.all['null.coaching']), RULE['6 controls clean']],
  ['Coaching moves made more often', interval(rep.all['audit.coachingShare.minusBase']), RULE['7 coaching moves made more often']],
  ['At most 1.3 times as long', ratio(rep.all.lengthRatio), RULE['8 not much longer']],
]
g.block('RuleTable', [
  '\\begin{tabular}{lrl}',
  '\\toprule',
  'Condition & Estimate (95\\% interval) & Holds \\\\',
  '\\midrule',
  ...ruleRows.map(([what, est, ok]) => `${what} & ${est} & ${ok ? 'yes' : '\\textbf{no}'} \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
const failed = Object.entries(RULE).filter(([, ok]) => !ok).map(([k]) => k)
g.def('Kept', rep.kept ? 'yes' : 'no')

// ---- per period ----
const mark = { candidate: '+', reference: '$-$', tie: '0' }
const periodRows = periods.map((i) => {
  const p = judged.find((x) => x.id === i)
  const b = of(BASE, 1).find((r) => r.id === i)
  const t = of(CAND, 1).find((r) => r.id === i)
  return `${cap(label(i))} & ${R.cases[i].split === 'train' ? 'train' : 'held out'} & ${R.cases[i].games} & ${CRITERIA.map((c) => mark[p.candidate.final[c]]).join(' & ')} & ${fixed(b.shape.seconds / 60, 1)} & ${fixed(t.shape.seconds / 60, 1)} & ${percent(b.audit.tally.coachingShare, 0)} & ${percent(t.audit.tally.coachingShare, 0)} \\\\`
})
g.block('PeriodTable', [
  '\\begin{tabular}{llrccccrrrr}',
  '\\toprule',
  ' & & & \\multicolumn{4}{c}{Judge, from the candidate\'s side} & \\multicolumn{2}{c}{Minutes heard once} & \\multicolumn{2}{c}{Coaching share} \\\\',
  '\\cmidrule(lr){4-7}\\cmidrule(lr){8-9}\\cmidrule(lr){10-11}',
  'Period & Split & Games & Truth & Coaching & Listening & Overall & Today & Candidate & Today & Candidate \\\\',
  '\\midrule',
  ...periodRows,
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))

// ---- the claims the paper's prose makes ----
claim(Object.entries(RULE).every(([k, ok]) => ok === !k.startsWith('8')) && !rep.kept, 'every condition but the length held, so the rule keeps today\'s prompts')
claim(tally('coaching', 'candidate') === periods.length, 'the judge preferred the candidate\'s coaching on every period')
claim(rep.all['judge.overall'].lo > 0 && tally('overall', 'candidate') > tally('overall', 'reference'), 'the judge preferred the candidate overall')
claim(rep.all['judge.truth'].lo < 0 && rep.all['judge.truth'].hi > 0 && tally('truth', 'candidate') === tally('truth', 'reference'), 'truth was even')
claim(rep.all['judge.listening'].lo < 0 && rep.all['judge.listening'].hi > 0 && tally('listening', 'reference') < periods.length / 2, 'listening was no worse beyond the noise')
claim(['candidate', 'reference'].every((v) => nullPairs.some((p) => p.null.final.coaching === v)), 'the noise floor splits coaching each way at least once')
claim(sameBroken === 0, 'the same script on both sides ties on every criterion')
claim(decoyCoach === 0, 'the decoy never won coaching')
claim(decoyLost('listening') === decoy.length && decoyLost('overall') === decoy.length, 'the decoy lost listening and overall on every period')
for (const k of ['openQuestion', 'thenWhat', 'level']) claim(pooled(tallies(BASE), k) < 0.3 && pooled(tallies(CAND), k) > 0.6, `today's prompts rarely make the move ${k} and the candidate makes it in most moment scenes`)
for (const k of ['habitNamed', 'replacement']) claim(pooled(tallies(CAND), k) < pooled(tallies(BASE), k) && pooled(TOLD_SETS[2][1], k) >= pooled(TOLD_SETS[1][1], k), `scene by scene the candidate makes ${k} less often, and counted once per position as often or more`)
claim(mean(TOLD_SETS[2][1].map((t) => t.split)) > mean(TOLD_SETS[1][1].map((t) => t.split)) + 0.5, 'the candidate tells a position in two scenes more often')
claim(mean(firstRuns(CAND).map((r) => r.shape.boardScenes)) > mean(firstRuns(BASE).map((r) => r.shape.boardScenes)), 'the candidate shows more board scenes')
claim(mean(firstRuns(CAND).map((r) => r.shape.questions)) > mean(firstRuns(BASE).map((r) => r.shape.questions)), 'the candidate asks more')
claim(rep.all['audit.false.minusBase'].est < 0 && rep.all['audit.false.minusBase'].hi > 0, 'fewer false claims a script, within the noise')
claim(rep.all['audit.boardClaimsFalse.minusBase'].lo <= 0 && rep.all['audit.boardClaimsFalse.minusBase'].hi >= 0, 'false board claims within the noise')
claim(mean(firstRuns(CAND).map((r) => r.audit.counts.unsupported)) > mean(firstRuns(BASE).map((r) => r.audit.counts.unsupported)), 'the candidate\'s scripts carry more unsupported lines')
claim(rep.all.lengthRatio.lo > 1, 'the candidate is longer')
claim(CRITERIA.every((c) => firstFinal[c] === nowFinal[c]), 'the regrade left the pilot\'s verdicts as they were')
claim(rep.all['audit.coachingShare.minusBase'].lo > mean(shareMoves), 'the pooled coaching-share difference is beyond the regrade\'s movement')

g.write(join(HERE, 'generated.tex'))
console.log(JSON.stringify({ wrote: 'generated.tex', kept: rep.kept, failed }))
