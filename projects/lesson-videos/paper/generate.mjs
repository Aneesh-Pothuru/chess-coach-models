#!/usr/bin/env node
// Writes paper/generated.tex for the lesson-videos paper from what bin/export.py
// wrote (results/report.json and results/runs.json for round 1, the same files
// with -lesson-moves-2 for round 2) and bin/scenes.py wrote (results/scenes.json).
// It refuses to write when a claim the paper makes no longer holds.
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
const TWO_CHANGE = '284a31b'
const TWO_CAP = 205

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

// ---- round 2 ----
const R2 = read('report-lesson-moves-2.json')
const U2 = read('runs-lesson-moves-2.json')
const SC = read('scenes.json')
const rep2 = R2.report
const TWO = rep2.config
claim(TWO === 'lesson-moves-2' && rep2.vs === BASE, 'round 2 compares lesson-moves-2 with the same baseline')
claim(JSON.stringify(rep2.days) === JSON.stringify(days), 'round 2 reads the same days')
const [twoCode] = R2.configs[TWO]
claim(R2.configs[TWO].length === 1 && R2.configs[BASE].length === 1 && R2.configs[BASE][0] === baseCode, 'round 2 ran one commit on every day, against the same baseline commit')
g.def('TwoCommit', twoCode.slice(0, 7)).def('TwoChangeCommit', TWO_CHANGE).def('TwoCap', String(TWO_CAP))
const run2 = (config, i) => U2.runs.find((r) => r.config === config && r.id === i)
const runs2 = (config) => days.map((i) => run2(config, i))
claim(runs2(TWO).every(Boolean), 'round 2 has a run on every day')
claim(runs2(BASE).every((r, k) => r && JSON.stringify(r.audit) === JSON.stringify(runsOf(BASE)[k].audit)), "round 2 reads round 1's baseline runs unchanged")
claim(runs2(TWO).every((r) => r.audit), 'every round-2 script was audited')
g.def('TwoSpent', fixed(R2.round.spent, 0)).def('BothSpent', fixed(R2.spent, 0))
claim(R2.spent <= TWO_CAP, 'both rounds stayed under the cap the owner approved')
g.def('TwoSevenDayLast', percent(R2.round.sevenDay.last, 0))

const scenesOf = (config) => Object.values(SC[config] || {}).flat()
const sceneSplit = (config) => {
  const ss = scenesOf(config)
  const better = ss.filter((x) => x.better)
  const his = ss.filter((x) => !x.better)
  return { better, his, named: (xs) => xs.filter((x) => x.purposeNamed).length }
}
for (const [name, config] of [['Base', BASE], ['Cand', CAND], ['Two', TWO]]) {
  const sp = sceneSplit(config)
  g.def(`${name}BetterScenes`, String(sp.better.length)).def(`${name}BetterNamed`, String(sp.named(sp.better)))
  g.def(`${name}HisScenes`, String(sp.his.length)).def(`${name}HisNamed`, String(sp.named(sp.his)))
}
const splitCell = (xs, named) => (xs.length ? `${percent(named / xs.length, 0)}\\% {\\footnotesize (${xs.length})}` : '--')
g.block('ScenesTable', [
  '\\begin{tabular}{lrr}',
  '\\toprule',
  'Says what the better move does, in scenes that & teach a better move & show only his move \\\\',
  '\\midrule',
  ...[["Today's code", BASE], ['The change, round 1', CAND], ['The change, round 2', TWO]].map(([labelText, config]) => {
    const sp = sceneSplit(config)
    return `${labelText} & ${splitCell(sp.better, sp.named(sp.better))} & ${splitCell(sp.his, sp.named(sp.his))} \\\\`
  }),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
const r1Split = { base: sceneSplit(BASE), cand: sceneSplit(CAND) }
claim([r1Split.base, r1Split.cand].every((sp) => sp.named(sp.his) === 0 && sp.named(sp.better) / sp.better.length > 0.85), 'in round 1, scenes that showed only his move never said what the better move does, and scenes that taught one nearly always did')

const rs2 = runs2(TWO)
g.def('TwoPassed', word(rs2.filter((r) => r.pass).length)).def('TwoRounds', fixed(mean(rs2.map((r) => r.rounds)), 1))
g.def('TwoHeard', fixed(mean(rs2.map((r) => r.shape.seconds)) / 60, 1)).def('TwoTeach', fixed(mean(rs2.map((r) => r.teachCalls)), 1))
g.def('TwoCost', fixed(mean(rs2.map((r) => r.cost)), 2)).def('TwoMinutes', fixed(mean(rs2.map((r) => r.minutes)), 0))
g.def('TwoVerdictLines', fixed(mean(rs2.map((r) => r.verdictLines)), 1))
g.def('TwoVerdictMax', word(Math.max(...rs2.map((r) => r.verdictLines))))
g.def('TwoLengthRatio', ratio(rep2.all.lengthRatio))
for (const [name, split] of [['Train', 'train'], ['Held', 'heldOut'], ['All', 'all']]) {
  for (const c of CRITERIA) g.def(`Two${name}${cap(c)}`, interval(rep2[split][`judge.${c}`]))
}
const pairs2 = days.map((i) => U2.pairs.find((p) => p.id === i))
claim(pairs2.every(Boolean), 'every round-2 day was judged')
const tally2 = (c, v) => pairs2.filter((p) => p.candidate.final[c] === v).length
for (const c of CRITERIA) g.def(`Two${cap(c)}Wins`, word(tally2(c, 'candidate'))).def(`Two${cap(c)}Losses`, word(tally2(c, 'reference'))).def(`Two${cap(c)}Ties`, word(tally2(c, 'tie')))
const controls2 = days.map((i) => U2.controls[i]).filter(Boolean)
const decoy2 = controls2.filter((c) => c.decoy)
claim(decoy2.length === days.length && controls2.every((c) => c.same), 'both controls cover every round-2 day')
const decoyWon2 = (k) => decoy2.filter((c) => c.decoy.final[k] === 'candidate').length
const decoyLost2 = (k) => decoy2.filter((c) => c.decoy.final[k] === 'reference').length
g.def('TwoDecoyCoaching', word(decoyWon2('coaching'))).def('TwoDecoyLostListening', word(decoyLost2('listening'))).def('TwoDecoyLostOverall', word(decoyLost2('overall')))
g.def('TwoDecoyAdded', String(Math.round(mean(controls2.map((c) => c.decoyText?.added).filter((x) => x != null)))))
const pooled2 = (k) => pooled(rs2, k)
for (const k of Object.keys(ITEMS)) g.def(`Two${cap(k)}`, pooled2(k).p == null ? '--' : percent(pooled2(k).p, 0))
g.def('TwoMoments', fixed(mean(rs2.map((r) => r.audit.tally.moments)), 1)).def('TwoVerdictScenes', fixed(mean(rs2.map((r) => r.audit.tally.verdictScenes)), 1))
for (const k of ['false', 'unsupported', 'misleading']) g.def(`Two${cap(k)}`, fixed(mean(rs2.map((r) => r.audit.counts[k])), 2))
g.def('TwoBoardFalse', fixed(mean(rs2.map((r) => r.audit.tally.boardClaimsFalse)), 2))
g.def('TwoAsked', percent(mean(rs2.map((r) => r.audit.tally.askedShare).filter((x) => x != null)), 0))
g.def('TwoFalseDiff', interval(rep2.all['audit.false.minusBase'])).def('TwoBoardDiff', interval(rep2.all['audit.boardClaimsFalse.minusBase']))
g.def('TwoAskedDiff', interval(points(rep2.all['audit.askedShare.minusBase']), 0)).def('TwoUnsoundDiff', interval(points(rep2.all['audit.unsound.minusBase']), 0))
const cell3 = (rows, k) => {
  const v = pooled(rows, k)
  return v.owed ? `${percent(v.p, 0)}\\% {\\footnotesize (${v.owed})}` : '--'
}
g.block('ItemsTwoTable', [
  '\\begin{tabular}{lrrr}',
  '\\toprule',
  "In the moment scenes & Today's code & Round 1 & Round 2 \\\\",
  '\\midrule',
  ...['aboutFirst', 'purposeNamed', 'takeaway'].map((k) => `${ITEMS[k]} & ${cell3(runsOf(BASE), k)} & ${cell3(runsOf(CAND), k)} & ${cell3(rs2, k)} \\\\`),
  '\\midrule',
  ...['lessonNamed', 'lessonFits', 'betterSound', 'thenWhat'].map((k) => `${ITEMS[k]} & ${cell3(runsOf(BASE), k)} & ${cell3(runsOf(CAND), k)} & ${cell3(rs2, k)} \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
const RULE2 = rep2.rule
const passed2 = rs2.filter((r) => r.pass).length
const ruleRows2 = [
  ['Coaching on the train days above 0', interval(rep2.train['judge.coaching']), RULE2['1 coaching better on train']],
  ['Coaching on the held-out days above 0', interval(rep2.heldOut['judge.coaching']), RULE2['2 coaching better held out']],
  ['Overall not below 0', interval(rep2.all['judge.overall']), RULE2['3 overall not worse']],
  ['False claims per script not up', interval(rep2.all['audit.false.minusBase']), !(rep2.all['audit.false.minusBase'].lo > 0)],
  ['False board claims per script not up', interval(rep2.all['audit.boardClaimsFalse.minusBase']), !(rep2.all['audit.boardClaimsFalse.minusBase'].lo > 0)],
  ['The check passes as often', `${passed2} of ${days.length} {\\footnotesize (today's: ${passed(BASE)})}`, RULE2['5 check passes as often']],
  ['Controls clean', `same: ${sameBroken} broken; decoy: ${decoyWon2('coaching')} coaching wins`, RULE2['6 controls clean']],
  ['Verdict lines per script down', interval(rep2.all['verdictLines.minusBase'], 1), rep2.all['verdictLines.minusBase'].hi < 0],
  ['\\quad and the asked moves made more often, points', interval(points(rep2.all['audit.askedShare.minusBase']), 0), rep2.all['audit.askedShare.minusBase'].lo > 0],
  ['At most 1.3 times as long', ratio(rep2.all.lengthRatio), RULE2['8 not much longer']],
  ['Better moves as sound, points', interval(points(rep2.all['audit.unsound.minusBase']), 0), RULE2['9 better moves as sound']],
]
g.block('TwoRuleTable', [
  '\\begin{tabular}{lrl}',
  '\\toprule',
  'Condition & Estimate (95\\% interval) & Holds \\\\',
  '\\midrule',
  ...ruleRows2.map(([what, est, ok]) => `${what} & ${est} & ${ok ? 'yes' : '\\textbf{no}'} \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
claim(RULE2['4 truth not worse'] === (ruleRows2[3][2] && ruleRows2[4][2]) && RULE2['7 writing changed as asked'] === (ruleRows2[7][2] && ruleRows2[8][2]), "round 2's split rows match the rule's fourth and seventh conditions")
g.def('TwoKept', rep2.kept ? 'yes' : 'no')
const dayRows2 = days.map((i) => {
  const p = pairs2.find((x) => x.id === i)
  const b = run2(BASE, i)
  const t = run2(TWO, i)
  return `${short(i)} & ${R.cases[i].split === 'train' ? 'train' : 'held out'} & ${CRITERIA.map((c) => mark[p.candidate.final[c]]).join(' & ')} & ${fixed(t.shape.seconds / b.shape.seconds, 2)} & ${t.verdictLines} & ${percent(b.audit.tally.askedShare ?? 0, 0)} & ${percent(t.audit.tally.askedShare ?? 0, 0)} \\\\`
})
g.block('TwoDayTable', [
  '\\begin{tabular}{llccccrrrr}',
  '\\toprule',
  " & & \\multicolumn{4}{c}{Judge, from round 2's side} & Length & Verdict & \\multicolumn{2}{c}{Asked moves} \\\\",
  '\\cmidrule(lr){3-6}\\cmidrule(lr){9-10}',
  'Day & Split & Truth & Coaching & Listening & Overall & ratio & lines & Today & Round 2 \\\\',
  '\\midrule',
  ...dayRows2,
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))

claim(rep2.kept && Object.values(RULE2).every(Boolean), 'round 2 is kept: every condition of the rule holds')
claim(rep2.all['audit.askedShare.minusBase'].lo > 0, 'round 2 raised the share of the asked moves, its interval above zero')
const sp2 = sceneSplit(TWO)
claim(sp2.his.length === 0 && sp2.named(sp2.better) === sp2.better.length, 'in round 2 every moment scene named a better move and said what it does, so the audit read none as showing only his move')
claim(pooled2('purposeNamed').p > 0.95, 'round 2 said what the better move does in nearly every moment scene')
claim(rs2.every((r) => r.verdictLines === 0), 'round 2 spoke no verdict line on any day')
const f2 = rep2.all['audit.false.minusBase']
const b2 = rep2.all['audit.boardClaimsFalse.minusBase']
claim(f2.est > 0 && f2.lo <= 0 && b2.est > 0 && b2.lo <= 0, 'round 2 carried more false claims and false board claims than today, inside the noise')
claim(mean(rs2.map((r) => r.audit.counts.false)) > meanOf(CAND, (r) => r.audit.counts.false), 'round 2 carried more false claims than round 1')
const thenMade = (rs) => Math.round(pooled(rs, 'thenWhat').p * pooled(rs, 'thenWhat').owed)
const thenOwed = (rs) => pooled(rs, 'thenWhat').owed
claim(pooled2('thenWhat').p < pooled(runsOf(BASE), 'thenWhat').p && thenOwed(rs2) > 1.5 * thenOwed(runsOf(BASE)) && Math.abs(thenMade(rs2) - thenMade(runsOf(BASE))) <= 3, "round 2's lower share of scenes following the better move to their reply comes from more scenes owing it, with about as many making it")
g.def('TwoThenMade', String(thenMade(rs2))).def('TwoThenOwed', String(thenOwed(rs2)))
g.def('BaseThenMade', String(thenMade(runsOf(BASE)))).def('BaseThenOwed', String(thenOwed(runsOf(BASE))))
claim(tally2('coaching', 'candidate') >= days.length - 1 && tally2('overall', 'candidate') >= days.length - 1, 'the judge preferred round 2 on all days but at most one')
claim(decoyWon2('coaching') === 0, "the decoy won no day's coaching in round 2")

g.write(join(HERE, 'generated.tex'))
console.log('wrote generated.tex')
