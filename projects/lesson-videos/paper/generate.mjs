#!/usr/bin/env node
// Writes paper/generated.tex for the lesson-videos paper from what bin/export.py
// wrote (results/report.json and results/runs.json). It refuses to write when a
// claim the paper makes no longer holds.
//
//   bridge/run.sh projects/lesson-videos/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resultsDir } from '../../../bridge/lib/lab.mjs'
import { Generated, fixed, percent, word } from '../../paper.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (f) => JSON.parse(readFileSync(join(resultsDir('lesson-videos'), f), 'utf8'))
const R = read('report.json')
const U = read('runs.json')
const g = new Generated('projects/lesson-videos/paper/generate.mjs')
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
const points = (b) => (b ? { ...b, est: 100 * b.est, lo: 100 * b.lo, hi: 100 * b.hi } : b)
const listed = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
const short = (id) => new Date(`${id}T12:00:00Z`).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const label = (id) => new Date(`${id}T12:00:00Z`).toLocaleString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
const rep = R.report
const BASE = rep.vs
const CAND = rep.config
const CRITERIA = ['truth', 'coaching', 'listening', 'overall']
const CHANGE = 'f7a8b12'
const CAP = 216
const BUDGET = 180

// ---- what was measured ----
const days = rep.days
const all = Object.keys(R.cases)
claim(days.length === all.length && all.every((i) => R.cases[i][BASE]?.usable && R.cases[i][CAND]?.usable), 'every day has a usable case of each config and both runs')
const run = (config, i) => U.runs.find((r) => r.config === config && r.id === i)
const runsOf = (config) => days.map((i) => run(config, i))
claim(U.runs.length === 2 * days.length, 'one run per config and day')
const [baseCode] = R.configs[BASE]
const [candCode] = R.configs[CAND]
claim(R.configs[BASE].length === 1 && R.configs[CAND].length === 1, 'each config ran one commit on every day')
g.def('BaseCommit', baseCode.slice(0, 7)).def('CandCommit', candCode.slice(0, 7)).def('ChangeCommit', CHANGE)
g.def('Days', word(days.length)).def('DaysCap', Word(days.length)).def('WriterRuns', word(U.runs.length))
g.def('FirstDay', label(days[0])).def('LastDay', label(days.at(-1)))
const trainDays = days.filter((i) => R.train.includes(i))
const heldDays = days.filter((i) => R.heldOut.includes(i))
g.def('TrainN', word(trainDays.length)).def('HeldN', word(heldDays.length))
g.def('TrainDays', listed(trainDays.map(short))).def('HeldDays', listed(heldDays.map(short)))
const games = days.map((i) => R.cases[i][BASE].games)
g.def('GamesMin', word(Math.min(...games))).def('GamesMax', word(Math.max(...games))).def('GamesAll', String(sum(games)))
g.def('WordsPerSecond', String(R.method.wordsPerSecond)).def('MinDecoyWords', String(R.method.minDecoyWords))
g.def('Spent', fixed(R.spent, 0)).def('Cap', String(CAP)).def('Budget', String(BUDGET))
g.def('WriterSpend', fixed(R.spend.writer, 0)).def('GraderSpend', fixed((R.spend.grader || 0) + (R.spend.judge || 0) + (R.spend.decoy || 0) + (R.spend.probe || 0), 0))
claim(R.spent <= BUDGET, "the eval stayed inside the owner's budget")
const sd = R.usage.sevenDay
g.def('SevenDayFirst', percent(sd.first, 0)).def('SevenDayLast', percent(sd.last, 0))

// ---- the check, length and cost ----
for (const [name, config] of [['Base', BASE], ['Cand', CAND]]) {
  const rs = runsOf(config)
  g.def(`${name}Passed`, word(rs.filter((r) => r.pass).length)).def(`${name}Rounds`, fixed(mean(rs.map((r) => r.rounds)), 1))
  g.def(`${name}Heard`, fixed(mean(rs.map((r) => r.shape.seconds)) / 60, 1)).def(`${name}Words`, String(Math.round(mean(rs.map((r) => r.shape.words)))))
  g.def(`${name}Scenes`, fixed(mean(rs.map((r) => r.shape.scenes)), 1)).def(`${name}BoardScenes`, fixed(mean(rs.map((r) => r.shape.boardScenes)), 1))
  g.def(`${name}Questions`, fixed(mean(rs.map((r) => r.shape.questions)), 1)).def(`${name}Teach`, fixed(mean(rs.map((r) => r.teachCalls)), 1))
  g.def(`${name}Cost`, fixed(mean(rs.map((r) => r.cost)), 2)).def(`${name}Minutes`, fixed(mean(rs.map((r) => r.minutes)), 0))
  g.def(`${name}VerdictLines`, fixed(mean(rs.map((r) => r.verdictLines)), 1))
  g.def(`${name}VerdictMin`, word(Math.min(...rs.map((r) => r.verdictLines)))).def(`${name}VerdictMax`, word(Math.max(...rs.map((r) => r.verdictLines))))
  const moments = sum(rs.map((r) => r.lessonLinks.moments))
  const linked = sum(rs.map((r) => r.lessonLinks.withLesson))
  g.def(`${name}Linked`, percent(linked / moments, 0)).def(`${name}LinkedN`, String(linked)).def(`${name}MomentsN`, String(moments))
}
claim(U.runs.every((r) => r.pass), 'every run passed the final check')
claim(U.runs.every((r) => !r.forbidden.length && !r.otherFiles), 'no writer ran a forbidden command or changed a file it should not')
claim(runsOf(CAND).every((r) => r.verdictLines === 0) && runsOf(BASE).every((r) => r.verdictLines > 0), "the candidate spoke no verdict line on any day, and today's code did on every day")
g.def('LengthCap', '1.3').def('LengthRatio', ratio(rep.all.lengthRatio))

// ---- the judge ----
for (const [name, split] of [['Train', 'train'], ['Held', 'heldOut'], ['All', 'all']]) {
  for (const c of CRITERIA) g.def(`${name}${cap(c)}`, interval(rep[split][`judge.${c}`]))
}
const pairs = days.map((i) => U.pairs.find((p) => p.id === i))
claim(pairs.every(Boolean), 'every day was judged')
const tally = (c, v) => pairs.filter((p) => p.candidate.final[c] === v).length
for (const c of CRITERIA) g.def(`${cap(c)}Wins`, word(tally(c, 'candidate'))).def(`${cap(c)}Losses`, word(tally(c, 'reference'))).def(`${cap(c)}Ties`, word(tally(c, 'tie')))
const decided = []
for (const p of pairs) for (const r of p.candidate.orders) for (const c of CRITERIA) if (r[c] !== 'tie') decided.push(r[c] === r.order[1] ? 'second' : 'first')
g.def('Decided', String(decided.length)).def('SecondShare', percent(decided.filter((x) => x === 'second').length / decided.length, 0))

// ---- the controls ----
const controls = days.map((i) => U.controls[i]).filter(Boolean)
const same = controls.filter((c) => c.same)
const decoy = controls.filter((c) => c.decoy)
claim(same.length === days.length && decoy.length === days.length, 'both controls cover every day')
const sameBroken = same.filter((c) => CRITERIA.some((k) => c.same.final[k] !== 'tie')).length
const decoyWon = (k) => decoy.filter((c) => c.decoy.final[k] === 'candidate').length
const decoyLost = (k) => decoy.filter((c) => c.decoy.final[k] === 'reference').length
g.def('SameBroken', word(sameBroken)).def('DecoyCoaching', word(decoyWon('coaching')))
g.def('DecoyLostListening', word(decoyLost('listening'))).def('DecoyLostOverall', word(decoyLost('overall')))
g.def('DecoyAdded', String(Math.round(mean(controls.map((c) => c.decoyText?.added).filter((x) => x != null)))))

// ---- the audit ----
const pooled = (rs, key) => {
  const made = sum(rs.map((r) => (r.audit.tally[key] || [0, 0])[0]))
  const owed = sum(rs.map((r) => (r.audit.tally[key] || [0, 0])[1]))
  return owed ? { p: made / owed, owed } : { p: null, owed: 0 }
}
claim(U.runs.every((r) => r.audit), 'every script was audited')
const ITEMS = {
  aboutFirst: 'Says what the position is about before the move',
  purposeNamed: 'Says what the better move does on the board',
  takeaway: 'Gives an idea to reuse',
  lessonNamed: 'Names a study lesson',
  lessonFits: '\\quad and the lesson teaches what the scene teaches',
  betterSound: 'The better move is sound by the evidence',
  engineRecital: 'Recites an engine line without saying what it does',
  thenWhat: 'Follows the better move to their best reply',
  habitNamed: 'Names the habit behind his move',
  replacement: 'Ends on the habit that replaces it',
  openQuestionAll: 'Any board scene: asks his move openly first',
  praiseNamed: 'Praise names what the good move saw',
}
for (const [name, config] of [['Base', BASE], ['Cand', CAND]]) {
  const rs = runsOf(config)
  for (const k of Object.keys(ITEMS)) {
    const v = pooled(rs, k)
    g.def(`${name}${cap(k)}`, v.p == null ? '--' : percent(v.p, 0))
  }
  g.def(`${name}Moments`, fixed(mean(rs.map((r) => r.audit.tally.moments)), 1))
  g.def(`${name}VerdictScenes`, fixed(mean(rs.map((r) => r.audit.tally.verdictScenes)), 1))
  for (const k of ['false', 'unsupported', 'misleading']) g.def(`${name}${cap(k)}`, fixed(mean(rs.map((r) => r.audit.counts[k])), 2))
  g.def(`${name}BoardFalse`, fixed(mean(rs.map((r) => r.audit.tally.boardClaimsFalse)), 2))
  g.def(`${name}Asked`, percent(mean(rs.map((r) => r.audit.tally.askedShare).filter((x) => x != null)), 0))
}
const cell = (config, k) => {
  const v = pooled(runsOf(config), k)
  return v.owed ? `${percent(v.p, 0)}\\% {\\footnotesize (${v.owed})}` : '--'
}
g.block('ItemsTable', [
  '\\begin{tabular}{lrr}',
  '\\toprule',
  "In the moment scenes & Today's code & The change \\\\",
  '\\midrule',
  ...['aboutFirst', 'purposeNamed', 'takeaway'].map((k) => `${ITEMS[k]} & ${cell(BASE, k)} & ${cell(CAND, k)} \\\\`),
  '\\midrule',
  ...['lessonNamed', 'lessonFits', 'betterSound', 'engineRecital', 'thenWhat', 'habitNamed', 'replacement'].map((k) => `${ITEMS[k]} & ${cell(BASE, k)} & ${cell(CAND, k)} \\\\`),
  '\\midrule',
  ...['openQuestionAll', 'praiseNamed'].map((k) => `${ITEMS[k]} & ${cell(BASE, k)} & ${cell(CAND, k)} \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
g.def('FalseDiff', interval(rep.all['audit.false.minusBase'])).def('BoardDiff', interval(rep.all['audit.boardClaimsFalse.minusBase']))
g.def('AskedDiff', interval(points(rep.all['audit.askedShare.minusBase']), 0)).def('UnsoundDiff', interval(points(rep.all['audit.unsound.minusBase']), 0))
g.def('VerdictDiff', interval(rep.all['verdictLines.minusBase'], 1))

// ---- the rule ----
const RULE = rep.rule
const passed = (config) => runsOf(config).filter((r) => r.pass).length
const ruleRows = [
  ['Coaching on the train days above 0', interval(rep.train['judge.coaching']), RULE['1 coaching better on train']],
  ['Coaching on the held-out days above 0', interval(rep.heldOut['judge.coaching']), RULE['2 coaching better held out']],
  ['Overall not below 0', interval(rep.all['judge.overall']), RULE['3 overall not worse']],
  ['False claims per script not up', interval(rep.all['audit.false.minusBase']), !(rep.all['audit.false.minusBase'].lo > 0)],
  ['False board claims per script not up', interval(rep.all['audit.boardClaimsFalse.minusBase']), !(rep.all['audit.boardClaimsFalse.minusBase'].lo > 0)],
  ['The check passes as often', `${passed(CAND)} of ${days.length} {\\footnotesize (today's: ${passed(BASE)})}`, RULE['5 check passes as often']],
  ['Controls clean', `same: ${sameBroken} broken; decoy: ${decoyWon('coaching')} coaching wins`, RULE['6 controls clean']],
  ['Verdict lines per script down', interval(rep.all['verdictLines.minusBase'], 1), rep.all['verdictLines.minusBase'].hi < 0],
  ['\\quad and the asked moves made more often, points', interval(points(rep.all['audit.askedShare.minusBase']), 0), rep.all['audit.askedShare.minusBase'].lo > 0],
  ['At most 1.3 times as long', ratio(rep.all.lengthRatio), RULE['8 not much longer']],
  ['Better moves as sound, points', interval(points(rep.all['audit.unsound.minusBase']), 0), RULE['9 better moves as sound']],
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
claim(RULE['7 writing changed as asked'] === (rep.all['verdictLines.minusBase'].hi < 0 && rep.all['audit.askedShare.minusBase'].lo > 0), "the rule's seventh condition is its two rows together")
g.def('Kept', rep.kept ? 'yes' : 'no')
const failed = Object.entries(RULE).filter(([, ok]) => !ok).map(([k]) => k)
claim(!rep.kept && failed.length === 1 && failed[0] === '7 writing changed as asked', 'the rule fails on its seventh condition alone')
claim(rep.all['verdictLines.minusBase'].hi < 0 && !(rep.all['audit.askedShare.minusBase'].lo > 0) && rep.all['audit.askedShare.minusBase'].est > 0, 'the verdict lines fell, and the asked share rose without its interval clearing zero')
claim(tally('coaching', 'candidate') === days.length && tally('overall', 'candidate') === days.length, 'the judge preferred the change on coaching and overall on every day')
claim(tally('truth', 'reference') === 0 && tally('listening', 'reference') === 0, 'the judge never preferred today\'s code on truth or listening')
claim(rep.all['audit.false.minusBase'].hi < 0, 'the change carried fewer false claims')
const items = (config, k) => pooled(runsOf(config), k).p
claim(items(CAND, 'aboutFirst') > items(BASE, 'aboutFirst') + 0.1 && Math.abs(items(CAND, 'purposeNamed') - items(BASE, 'purposeNamed')) < 0.05 && items(CAND, 'takeaway') > items(BASE, 'takeaway'), 'the change opened moments with the position more often and gave an idea more often, but said what the better move does no more often')
claim(items(CAND, 'lessonNamed') > 2 * items(BASE, 'lessonNamed') && Math.abs(items(CAND, 'lessonFits') - items(BASE, 'lessonFits')) < 0.05, 'the change named lessons far more often, fitting as often')
const meanOf = (config, f) => mean(runsOf(config).map(f))
claim(meanOf(CAND, (r) => r.audit.counts.misleading) > meanOf(BASE, (r) => r.audit.counts.misleading), 'the change carried more misleading claims')
claim(meanOf(CAND, (r) => r.audit.tally.verdictScenes) < meanOf(BASE, (r) => r.audit.tally.verdictScenes) / 4, 'the audit found far fewer verdict scenes in the change')
claim(decoyWon('coaching') === 0 && sameBroken === 0, 'the controls held on every day')

// ---- per day ----
const mark = { candidate: '+', reference: '$-$', tie: '0' }
const dayRows = days.map((i) => {
  const p = pairs.find((x) => x.id === i)
  const b = run(BASE, i)
  const t = run(CAND, i)
  return `${short(i)} & ${R.cases[i].split === 'train' ? 'train' : 'held out'} & ${R.cases[i][BASE].games} & ${CRITERIA.map((c) => mark[p.candidate.final[c]]).join(' & ')} & ${fixed(t.shape.seconds / b.shape.seconds, 2)} & ${b.verdictLines} & ${t.verdictLines} & ${percent(b.audit.tally.askedShare ?? 0, 0)} & ${percent(t.audit.tally.askedShare ?? 0, 0)} \\\\`
})
g.block('DayTable', [
  '\\begin{tabular}{llrccccrrrrr}',
  '\\toprule',
  " & & & \\multicolumn{4}{c}{Judge, from the change's side} & Length & \\multicolumn{2}{c}{Verdict lines} & \\multicolumn{2}{c}{Asked moves} \\\\",
  '\\cmidrule(lr){4-7}\\cmidrule(lr){9-10}\\cmidrule(lr){11-12}',
  "Day & Split & Games & Truth & Coaching & Listening & Overall & ratio & Today & Change & Today & Change \\\\",
  '\\midrule',
  ...dayRows,
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))

g.write(join(HERE, 'generated.tex'))
console.log('wrote generated.tex')
