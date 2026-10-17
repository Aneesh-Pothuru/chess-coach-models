#!/usr/bin/env node
// Writes paper/generated.tex for the period-writer paper from what bin/export.py
// wrote (results/report.json and results/runs.json). It refuses to write when a
// claim the paper makes no longer holds.
//
//   bridge/run.sh projects/period-writer/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resultsDir } from '../../../bridge/lib/lab.mjs'
import { Generated, fixed, percent, word } from '../../paper.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (f) => JSON.parse(readFileSync(join(resultsDir('period-writer'), f), 'utf8'))
const R = read('report.json')
const U = read('runs.json')
const g = new Generated('projects/period-writer/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase())
const Word = (n) => cap(word(n))
const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const mean = (xs) => (xs.length ? sum(xs) / xs.length : null)
const signed = (x, d = 2) => (x > 0 ? `+${fixed(x, d)}` : fixed(x, d))
const interval = (b, d = 2) => (b ? `${signed(b.est, d)} {\\footnotesize (${signed(b.lo, d)} to ${signed(b.hi, d)})}` : '--')
const listed = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
const label = (id) => (id.includes('-W') ? `week ${Number(id.split('-W')[1])}` : new Date(`${id}-15T12:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }))
const BASE = R.report.vs
const CAND = R.report.config
const CRITERIA = ['truth', 'explanation', 'duties', 'plain', 'overall']

// ---- what was measured ----
const ids = Object.keys(R.cases)
const weeks = ids.filter((i) => R.cases[i].kind === 'weekly')
const months = ids.filter((i) => R.cases[i].kind === 'monthly')
claim(typeof R.app === 'string', 'every case ran on one app commit')
g.def('AppCommit', R.app.slice(0, 10)).def('Cases', word(ids.length)).def('Weeks', word(weeks.length)).def('Months', word(months.length))
g.def('TrainCases', listed(R.train.map(label))).def('HeldCases', listed(R.heldOut.map(label)))
g.def('TrainN', word(R.train.length)).def('HeldN', word(R.heldOut.length))
const games = ids.map((i) => R.cases[i].games)
g.def('WeekGamesMin', String(Math.min(...weeks.map((i) => R.cases[i].games)))).def('WeekGamesMax', String(Math.max(...weeks.map((i) => R.cases[i].games))))
g.def('MonthGames', listed(months.map((i) => String(R.cases[i].games))))
g.def('FrozenBriefs', word(ids.filter((i) => R.cases[i].frozenBrief).length))
claim(Math.min(...games) > 0, 'every case has games')
const weekNos = weeks.map((i) => Number(i.split('-W')[1])).sort((a, b) => a - b)
claim(weekNos.at(-1) - weekNos[0] === weekNos.length - 1, 'the weeks run in a row')
const years = [...new Set(ids.map((i) => i.slice(0, 4)))]
claim(years.length === 1, 'every case is from one year')
g.def('CaseSpan', `weeks ${weekNos[0]} to ${weekNos.at(-1)} and the months of ${listed(months.map(label))} ${years[0]}`)
g.def('CasesCap', Word(ids.length))

const runs = U.runs
const of = (config) => runs.filter((r) => r.config === config)
const reps = (i) => runs.filter((r) => r.id === i && r.config === BASE).length
const twice = ids.filter((i) => reps(i) > 1 && runs.some((r) => r.id === i && r.config === CAND && r.rep === 2))
g.def('WriterRuns', String(runs.length)).def('FirstRuns', word(of(BASE).filter((r) => r.rep === 1).length + of(CAND).filter((r) => r.rep === 1).length))
g.def('SecondPairCases', listed(twice.map(label))).def('SecondPairN', word(twice.length))
const baseOnly = ids.filter((i) => reps(i) > 1 && !twice.includes(i))
g.def('BaseOnlySecond', listed(baseOnly.map(label)))
claim(baseOnly.length > 0, "today's prompt wrote some case a second time the candidate did not")
g.def('MaxReps', word(Math.max(...runs.map((r) => r.rep))))
const candPairs = U.pairs.filter((p) => p.candidate)
const nullPairs = U.pairs.filter((p) => p.null)
g.def('CandPairs', word(candPairs.length)).def('NullPairs', word(nullPairs.length)).def('NullCases', listed(nullPairs.map((p) => label(p.id))))
claim(of(BASE).filter((r) => r.rep === 1).length === ids.length && of(CAND).filter((r) => r.rep === 1).length === ids.length, 'both prompts ran once on every case')
g.def('Spent', fixed(R.spent, 0)).def('Cap', '250')
g.def('WriterSpend', fixed(R.spend.writer, 0)).def('GraderSpend', fixed((R.spend.grader || 0) + (R.spend.judge || 0) + (R.spend.decoy || 0), 0))
claim(R.spent <= 250, 'the eval stayed under its cap')
const sd = R.usage.sevenDay
g.def('SevenDayFirst', percent(sd.first, 0)).def('SevenDayLast', percent(sd.last, 0))

// ---- the writer ----
const weekly = (config) => of(config).filter((r) => R.cases[r.id].kind === 'weekly')
const monthly = (config) => of(config).filter((r) => R.cases[r.id].kind === 'monthly')
for (const [name, config] of [['Base', BASE], ['Cand', CAND]]) {
  g.def(`${name}WeekCost`, fixed(mean(weekly(config).map((r) => r.cost)), 2)).def(`${name}MonthCost`, fixed(mean(monthly(config).map((r) => r.cost)), 2))
  g.def(`${name}Minutes`, fixed(mean(of(config).map((r) => r.minutes)), 0)).def(`${name}Rounds`, fixed(mean(of(config).map((r) => r.rounds)), 1))
  g.def(`${name}Passed`, String(of(config).filter((r) => r.pass).length)).def(`${name}Runs`, String(of(config).length))
  g.def(`${name}Boards`, String(sum(of(config).map((r) => r.boards || 0))))
  g.def(`${name}MonthBoards`, listed(monthly(config).map((r) => String(r.boards || 0))))
}
claim(runs.every((r) => r.pass), 'every run passed the strict check in the end')
g.def('BaseMonthRuns', word(monthly(BASE).length))
claim(Math.abs(mean(of(BASE).map((r) => r.minutes)) - mean(of(CAND).map((r) => r.minutes))) <= 2, 'a review takes about as long under either prompt')
claim(runs.every((r) => !r.forbidden.length), 'no writer ran a command the rehearsal forbids')
claim(Math.max(...runs.filter((r) => R.cases[r.id].kind === 'monthly').map((r) => r.boards || 0)) <= 2, 'the monthly reviews carry at most two boards')

// ---- did the sentence change the writing? ----
const audited = (config) => of(config).filter((r) => r.audit)
const pooled = (config, f) => sum(audited(config).map((r) => f(r.audit)))
const full = (config) => pooled(config, (a) => a.fullOrder) / pooled(config, (a) => a.exhibits)
for (const [name, config] of [['Base', BASE], ['Cand', CAND]]) {
  const ex = pooled(config, (a) => a.exhibits)
  g.def(`${name}Exhibits`, String(ex)).def(`${name}FullOrder`, percent(full(config), 0))
  g.def(`${name}Threat`, percent(pooled(config, (a) => a.threat) / ex, 0)).def(`${name}Refutation`, percent(pooled(config, (a) => a.refutation) / ex, 0))
  g.def(`${name}Keeps`, percent(pooled(config, (a) => a.keeps) / ex, 0))
}
claim(audited(BASE).length === of(BASE).length && audited(CAND).length === of(CAND).length, 'every run was audited')
claim(full(CAND) > full(BASE) + 0.15, 'the sentence raises the share of exhibits that give all three parts in order')

// ---- the judge ----
const rep = R.report
for (const [name, split] of [['Train', 'train'], ['Held', 'heldOut'], ['All', 'all']]) {
  for (const c of CRITERIA) g.def(`${name}${cap(c)}`, interval(rep[split][`judge.${c}`]))
  g.def(`${name}NullExplanation`, interval(rep[split]['null.explanation']))
}
const verdicts = (c) => candPairs.map((p) => p.candidate.final[c])
const tally = (c, v) => verdicts(c).filter((x) => x === v).length
g.def('CandDecided', word(tally('explanation', 'candidate') + tally('explanation', 'reference')))
g.def('ExplWins', word(tally('explanation', 'candidate'))).def('ExplLosses', word(tally('explanation', 'reference'))).def('ExplTies', word(tally('explanation', 'tie')))
g.def('OverallWins', word(tally('overall', 'candidate'))).def('OverallLosses', word(tally('overall', 'reference'))).def('OverallTies', word(tally('overall', 'tie')))
const decided = []
for (const v of [...candPairs.map((p) => p.candidate), ...nullPairs.map((p) => p.null)]) {
  for (const r of v.orders) for (const c of CRITERIA) if (r[c] !== 'tie') decided.push(r[c] === r.order[1] ? 'second' : 'first')
}
claim(decided.length > 0, 'the judge decided some criteria')
const second = decided.filter((x) => x === 'second').length
g.def('Decided', String(decided.length)).def('SecondShare', percent(second / decided.length, 0))
claim(second / decided.length > 0.6, 'the judge favours whichever review it reads second')
const nullDecisive = nullPairs.filter((p) => p.null.final.explanation !== 'tie').length
g.def('NullDecisive', word(nullDecisive))

// ---- the controls ----
const same = Object.values(U.controls).filter((c) => c.same)
const decoy = Object.values(U.controls).filter((c) => c.decoy)
const sameBroken = same.filter((c) => CRITERIA.some((k) => c.same.final[k] !== 'tie')).length
const decoyExpl = decoy.filter((c) => c.decoy.final.explanation === 'candidate').length
const decoyLost = decoy.filter((c) => c.decoy.final.overall === 'reference').length
g.def('SameN', word(same.length)).def('SameBroken', word(sameBroken)).def('DecoyN', word(decoy.length)).def('DecoyExpl', word(decoyExpl)).def('DecoyLost', word(decoyLost))
const decoyText = Object.values(U.controls).map((c) => c.decoyText).filter((t) => t && t.exhibits)
g.def('DecoyRatio', fixed(sum(decoyText.map((t) => t.decoyWords)) / sum(decoyText.map((t) => t.words)), 2))
claim(sameBroken === 0, 'the same review on both sides ties on every criterion')
claim(decoyExpl <= Math.floor(decoy.length / 4), 'the decoy wins the explanation criterion on at most a quarter of the cases')

// ---- the rule ----
const RULE = R.report.rule
const ruleRows = [
  ['Explanation on train above 0', rep.train['judge.explanation'], RULE['1 explanation on train']],
  ['Explanation held out above 0', rep.heldOut['judge.explanation'], RULE['2 explanation held out']],
  ['Overall not below 0', rep.all['judge.overall'], RULE['3 overall not worse']],
  ['False claims not up', rep.all['audit.false.minusBase'], !rep.all['audit.false.minusBase'] || rep.all['audit.false.minusBase'].lo <= 0],
  ['False board claims not up', rep.all['audit.boardClaimsFalse.minusBase'], !rep.all['audit.boardClaimsFalse.minusBase'] || rep.all['audit.boardClaimsFalse.minusBase'].lo <= 0],
  ['Check passes as often', null, RULE['5 check passes as often']],
  ['Controls clean', null, RULE['6 controls clean']],
]
g.block('RuleTable', [
  '\\begin{tabular}{lrl}',
  '\\toprule',
  'Condition & Estimate (95\\% interval) & Holds \\\\',
  '\\midrule',
  ...ruleRows.map(([what, b, ok]) => `${what} & ${b ? interval(b) : '--'} & ${ok ? 'yes' : '\\textbf{no}'} \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
const failed = ruleRows.filter(([, , ok]) => !ok).map(([what]) => what.toLowerCase())
g.def('RuleFailed', listed(failed)).def('RuleFailedN', word(failed.length))
const SCORE = { candidate: 1, reference: -1, tie: 0 }
const caseScore = (i, c) => mean(candPairs.filter((p) => p.id === i).map((p) => SCORE[p.candidate.final[c]]))
const heldTies = R.heldOut.filter((i) => caseScore(i, 'explanation') === 0)
const trainLosses = R.train.filter((i) => caseScore(i, 'explanation') < 0)
g.def('HeldTieCases', listed(heldTies.map(label))).def('HeldTieN', word(heldTies.length)).def('TrainLossCases', listed(trainLosses.map(label)))
claim(heldTies.length >= 2 && trainLosses.length >= 1, 'held-out ties and a train loss keep the intervals from clearing 0')
g.def('TrainFalseDiff', interval(rep.train['audit.false.minusBase'], 1)).def('HeldFalseDiff', interval(rep.heldOut['audit.false.minusBase'], 1))
const falseOf = (config, i) => mean(of(config).filter((r) => r.id === i).map((r) => r.audit.counts.false))
claim(rep.heldOut['audit.false.minusBase'].lo > 0 && R.heldOut.every((i) => falseOf(CAND, i) > falseOf(BASE, i)), 'held out, the candidate makes more false claims on every case')
claim(rep.train['audit.false.minusBase'].est < 0, 'on train it makes fewer')
claim(R.report.kept === false, 'the rule does not keep the candidate')
claim(!RULE['2 explanation held out'], 'the held-out explanation interval does not clear 0')

// ---- the claims the reviews get wrong ----
const perReview = (config, f) => mean(audited(config).map((r) => f(r.audit)))
for (const [name, config] of [['Base', BASE], ['Cand', CAND]]) {
  g.def(`${name}False`, fixed(perReview(config, (a) => a.counts.false), 1)).def(`${name}Unsupported`, fixed(perReview(config, (a) => a.counts.unsupported), 1))
  g.def(`${name}Misleading`, fixed(perReview(config, (a) => a.counts.misleading), 1)).def(`${name}BoardFalse`, fixed(perReview(config, (a) => a.boardClaimsFalse), 1))
}
g.def('FalseDiff', interval(rep.all['audit.false.minusBase'], 1)).def('BoardDiff', interval(rep.all['audit.boardClaimsFalse.minusBase'], 1))
const KINDS = ['count', 'result', 'board', 'engine', 'earlier', 'metric', 'clock', 'pattern', 'other']
const KIND_NAMES = { count: 'Counts and tallies', result: 'Results, records, ratings', board: 'What a piece does on the board', engine: 'Who stood better, the best move', earlier: 'What an earlier review said', metric: 'A skill, metric or focus reading', clock: 'The clock', pattern: 'Habits and trends', other: 'Other' }
const kinded = (config) => of(config).filter((r) => r.kinds)
claim(kinded(BASE).length === of(BASE).length && kinded(CAND).length === of(CAND).length, 'every audit was sorted by kind')
const kindCount = (config, kind, grades) => sum(kinded(config).map((r) => sum(grades.map((gr) => (r.kinds[gr] || {})[kind] || 0))))
const entries = (config, field, grades) => sum(kinded(config).map((r) => sum(grades.map((gr) => sum(Object.values((r[field] || {})[gr] || {}))))))
const WORDS_GRADES = ['false', 'unsupported', 'misleading']
const nb = kinded(BASE).length
const nc = kinded(CAND).length
const rows = KINDS.map((k) => [k, kindCount(BASE, k, ['false']) / nb, kindCount(BASE, k, ['unsupported', 'misleading']) / nb, kindCount(CAND, k, ['false']) / nc, kindCount(CAND, k, ['unsupported', 'misleading']) / nc])
  .filter(([, ...xs]) => xs.some((x) => x > 0))
rows.sort((a, b) => b[1] + b[3] - (a[1] + a[3]))
const totals = ['Every kind', entries(BASE, 'kinds', ['false']) / nb, entries(BASE, 'kinds', ['unsupported', 'misleading']) / nb, entries(CAND, 'kinds', ['false']) / nc, entries(CAND, 'kinds', ['unsupported', 'misleading']) / nc]
g.block('KindsTable', [
  '\\begin{tabular}{lrrrr}',
  '\\toprule',
  ` & \\multicolumn{2}{c}{Today's prompt} & \\multicolumn{2}{c}{Candidate} \\\\`,
  '\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}',
  ' & & Unsupported & & Unsupported \\\\',
  'What the claim is about & False & or misleading & False & or misleading \\\\',
  '\\midrule',
  ...rows.map(([k, ...xs]) => `${KIND_NAMES[k]} & ${xs.map((x) => fixed(x, 1)).join(' & ')} \\\\`),
  '\\midrule',
  `${totals[0]} & ${totals.slice(1).map((x) => fixed(x, 1)).join(' & ')} \\\\`,
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
const falseShare = (k) => (kindCount(BASE, k, ['false']) + kindCount(CAND, k, ['false'])) / (entries(BASE, 'kinds', ['false']) + entries(CAND, 'kinds', ['false']))
const byFalse = KINDS.filter((k) => k !== 'other').sort((a, b) => falseShare(b) - falseShare(a))
g.def('TopKind', KIND_NAMES[byFalse[0]].toLowerCase()).def('SecondKind', KIND_NAMES[byFalse[1]].toLowerCase()).def('ThirdKind', KIND_NAMES[byFalse[2]].toLowerCase())
g.def('TopThreeShare', percent(falseShare(byFalse[0]) + falseShare(byFalse[1]) + falseShare(byFalse[2]), 0))
claim(falseShare(byFalse[0]) + falseShare(byFalse[1]) + falseShare(byFalse[2]) > 0.5, 'three kinds hold most of the false claims')
const heldAll = (config) => entries(config, 'kindsHeld', WORDS_GRADES)
const listedAll = (config) => heldAll(config) + entries(config, 'kinds', WORDS_GRADES)
const heldShare = (heldAll(BASE) + heldAll(CAND)) / (listedAll(BASE) + listedAll(CAND))
g.def('HeldShare', percent(heldShare, 0)).def('HeldBoard', percent((entries(BASE, 'kindsHeld', ['board']) + entries(CAND, 'kindsHeld', ['board'])) / (entries(BASE, 'kindsHeld', ['board']) + entries(CAND, 'kindsHeld', ['board']) + entries(BASE, 'kinds', ['board']) + entries(CAND, 'kinds', ['board'])), 0))
claim(heldShare > 0.1, 'a share of what the auditor lists carries evidence that says it holds')

const walk = runs.filter((r) => 'kingWalkCalledPawnBreak' in r && R.cases[r.id].kind === 'weekly')
const walkWeeks = [...new Set(walk.map((r) => Number(r.id.split('-W')[1])))].sort((a, b) => a - b)
claim(walkWeeks.at(-1) - walkWeeks[0] === walkWeeks.length - 1, 'the weeks with the king walk alone under its concept run in a row')
const called = (rs) => rs.filter((r) => r.kingWalkCalledPawnBreak)
const walkOf = (config) => walk.filter((r) => r.config === config)
g.def('WalkReviewsCap', Word(called(walk).length))
g.def('WalkReviews', word(called(walk).length)).def('WalkOf', word(walk.length)).def('WalkFirst', String(walkWeeks[0])).def('WalkLast', String(walkWeeks.at(-1)))
g.def('WalkBase', word(called(walkOf(BASE)).length)).def('WalkBaseOf', word(walkOf(BASE).length)).def('WalkCand', word(called(walkOf(CAND)).length)).def('WalkCandOf', word(walkOf(CAND).length))
g.def('WalkFlagged', word(called(walk).filter((r) => r.kingWalkFlagged).length))
claim(called(walkOf(BASE)).length > 0 && called(walkOf(CAND)).length > 0, 'reviews under both prompts call the king walk the pawn break')
claim(called(walk).filter((r) => r.kingWalkFlagged).length * 2 > called(walk).length, 'the auditor marks most of those reviews false for it')
claim(walk.every((r) => r.kingWalkFlagged <= r.kingWalkCalledPawnBreak), 'the auditor flags the pawn break only where the review says it')

const notHeldFalse = (config) => entries(config, 'kinds', ['false']) / kinded(config).length
const lineFalse = (config) => sum(of(config).map((r) => (r.lineClaims || {}).false || 0)) / of(config).length
for (const [name, config] of [['Base', BASE], ['Cand', CAND]]) g.def(`${name}FalseNotHeld`, fixed(notHeldFalse(config), 1)).def(`${name}LineFalse`, fixed(lineFalse(config), 2))
const extraFalse = notHeldFalse(CAND) - notHeldFalse(BASE)
const extraLines = lineFalse(CAND) - lineFalse(BASE)
g.def('ExtraFalse', fixed(extraFalse, 1)).def('ExtraLines', fixed(extraLines, 1))
claim(extraFalse > 0 && extraLines >= (2 / 3) * extraFalse, "most of the candidate's extra false claims quote a line of moves")

const played = (config) => of(config).map((r) => r.playedLines).filter(Boolean)
const landed = Object.values(U.cases).map((c) => c.landedPlayedLines).filter(Boolean)
claim(played(BASE).length === of(BASE).length && played(CAND).length === of(CAND).length && landed.length === ids.length, "every review's Played lines were checked against its games")
const plTotal = (xs) => sum(xs.map((x) => x.played))
const plWrong = (xs) => sum(xs.map((x) => x.diverges + x.short))
const plReviews = (xs) => xs.filter((x) => x.diverges + x.short > 0).length
for (const [name, xs] of [['Base', played(BASE)], ['Cand', played(CAND)], ['Landed', landed]]) {
  g.def(`${name}Played`, String(plTotal(xs))).def(`${name}PlayedWrong`, word(plWrong(xs))).def(`${name}PlayedReviews`, word(plReviews(xs))).def(`${name}PlayedShare`, percent(plWrong(xs) / plTotal(xs), 0))
}
const both = [...played(BASE), ...played(CAND)]
g.def('PlayedAll', String(plTotal(both))).def('PlayedWrongAll', String(plWrong(both))).def('PlayedReviewsAll', word(plReviews(both))).def('PlayedShareAll', percent(plWrong(both) / plTotal(both), 0))
g.def('LandedReviews', word(landed.filter((x) => x.played > 0).length))
claim(plWrong(played(BASE)) > 0 && plWrong(played(CAND)) > 0 && plWrong(landed) > 0, 'reviews under both prompts, and reviews that landed, tag lines Played that the game did not play')
claim(plWrong(played(CAND)) / plTotal(played(CAND)) > plWrong(played(BASE)) / plTotal(played(BASE)), "the candidate's Played lines leave the game more often")
g.def('PlayedCheckPR', '125')

// ---- per case ----
const mark = { candidate: '+', reference: '$-$', tie: '0' }
const caseRows = ids.map((i) => {
  const c = R.cases[i]
  const b = runs.filter((r) => r.id === i && r.config === BASE)
  const t = runs.filter((r) => r.id === i && r.config === CAND)
  const ps = candPairs.filter((p) => p.id === i).sort((x, y) => x.rep - y.rep)
  const ex = (rs) => `${sum(rs.map((r) => r.audit.fullOrder))}/${sum(rs.map((r) => r.audit.exhibits))}`
  return `${cap(label(i))} & ${c.split === 'train' ? 'train' : 'held out'} & ${c.games} & ${ex(b)} & ${ex(t)} & ${ps.map((p) => mark[p.candidate.final.explanation]).join(' ')} & ${ps.map((p) => mark[p.candidate.final.overall]).join(' ')} \\\\`
})
g.block('CaseTable', [
  '\\begin{tabular}{llrrrcc}',
  '\\toprule',
  ' & & & \\multicolumn{2}{c}{Exhibits in order} & \\multicolumn{2}{c}{Judge, per pair} \\\\',
  'Period & Split & Games & Today & Candidate & Explanation & Overall \\\\',
  '\\midrule',
  ...caseRows,
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))

g.write(join(HERE, 'generated.tex'))
console.log('wrote generated.tex')
