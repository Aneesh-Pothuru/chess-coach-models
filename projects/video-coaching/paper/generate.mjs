#!/usr/bin/env node
// Writes paper/generated.tex for the video-coaching paper from what bin/export.py
// wrote (results/report.json and results/runs.json). It refuses to write when a
// claim the paper makes no longer holds.
//
//   bridge/run.sh projects/video-coaching/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resultsDir } from '../../../bridge/lib/lab.mjs'
import { Generated, esc, fixed, percent, word } from '../../paper.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (f) => JSON.parse(readFileSync(join(resultsDir('video-coaching'), f), 'utf8'))
const R = read('report.json')
const U = read('runs.json')
const g = new Generated('projects/video-coaching/paper/generate.mjs')
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
const label = (id) => new Date(`${id}T12:00:00Z`).toLocaleString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
const short = (id) => new Date(`${id}T12:00:00Z`).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const BASE = R.report.vs
const CAND = R.report.config
const CRITERIA = ['truth', 'coaching', 'listening', 'overall']
const MOVES = ['openQuestion', 'habitNamed', 'replacement', 'thenWhat', 'level']
const rep = R.report

// ---- the candidate, as the variant inserts it ----
const variant = JSON.parse(readFileSync(join(HERE, '..', 'variants', 'coach-moves.json'), 'utf8')).insert.daily.text
const tex = (s) => s.split(/(`[^`]*`)/).map((part) => (part.startsWith('`') ? `\\texttt{${esc(part.slice(1, -1))}}` : esc(part).replace(/"([^"]*)"/g, "``$1''"))).join('')
const bulletLines = variant.split('\n').filter((l) => l.trim())
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
const unusable = all.filter((i) => !R.cases[i].usable)
const runs = U.runs
const of = (config, k = null) => runs.filter((r) => r.config === config && (k === null || r.rep === k))
const judged = U.pairs.filter((p) => p.candidate && p.rep === 1)
const days = judged.map((p) => p.id)
const firstRuns = (config) => days.map((i) => of(config, 1).find((r) => r.id === i))
const commits = [...new Set(all.map((i) => R.cases[i].code))]
const onCommit = (c) => all.filter((i) => R.cases[i].code === c && days.includes(i))
commits.sort((a, b) => onCommit(b).length - onCommit(a).length)
claim(commits.length === 2 && commits.every((c) => onCommit(c).length > 0), 'the cases were built at two app commits, both with judged days')
g.def('AppCommit', commits[0].slice(0, 10)).def('AppCommitDays', word(onCommit(commits[0]).length))
g.def('LaterCommit', commits[1].slice(0, 10)).def('LaterCommitDays', word(onCommit(commits[1]).length)).def('LaterCommitList', listed(onCommit(commits[1]).map(short)))
g.def('PinMovePR', '136').def('PortPR', '161').def('AllDays', word(all.length)).def('Cases', word(days.length)).def('CasesCap', Word(days.length))
g.def('UnusableN', word(unusable.length)).def('Unusable', listed(unusable.map(label)))
g.def('FirstDay', label(all[0])).def('LastDay', label(all.at(-1)))
const trainDays = days.filter((i) => R.train.includes(i))
const heldDays = days.filter((i) => R.heldOut.includes(i))
g.def('TrainN', word(trainDays.length)).def('HeldN', word(heldDays.length))
g.def('TrainCases', listed(trainDays.map(short))).def('HeldCases', listed(heldDays.map(short)))
claim(days.length === usable.length, 'every usable day was written and judged under both prompts')
const games = days.map((i) => R.cases[i].games)
g.def('GamesMin', word(Math.min(...games))).def('GamesMax', word(Math.max(...games)))
const nullPairs = U.pairs.filter((p) => p.null)
g.def('WriterRuns', String(runs.length)).def('NullN', word(nullPairs.length)).def('NullDays', listed(nullPairs.map((p) => short(p.id))))
g.def('WordsPerSecond', String(R.method.wordsPerSecond)).def('MinDecoyWords', String(R.method.minDecoyWords))
g.def('Spent', fixed(R.spent, 0)).def('Cap', '240').def('PilotCap', '60')
g.def('WriterSpend', fixed(R.spend.writer, 0)).def('GraderSpend', fixed((R.spend.grader || 0) + (R.spend.judge || 0) + (R.spend.decoy || 0), 0))
claim(R.spent <= 240, 'the eval stayed under its cap')
const sd = R.usage.sevenDay
g.def('SevenDayFirst', percent(sd.first, 0)).def('SevenDayLast', percent(sd.last, 0))

// ---- the coaching moves ----
const pooled = (rows, key) => {
  const made = sum(rows.map((t) => (t[key] || [0, 0])[0]))
  const owed = sum(rows.map((t) => (t[key] || [0, 0])[1]))
  return owed ? made / owed : null
}
const tallies = (config) => of(config, 1).filter((r) => days.includes(r.id) && r.audit).map((r) => r.audit.tally)
const published = days.map((i) => R.cases[i].published).filter(Boolean)
const pubT = published.map((a) => a.tally)
const SETS = [['Pub', pubT], ['Base', tallies(BASE)], ['Cand', tallies(CAND)]]
claim(pubT.length === days.length && tallies(BASE).length === days.length && tallies(CAND).length === days.length, 'every script was audited')
g.def('PublishedN', word(pubT.length))
const NAMES = {
  openQuestion: 'Asks what he would play before any hint',
  habitNamed: 'Names the habit behind the mistake',
  replacement: 'Ends on the habit that replaces it',
  thenWhat: "Plays out their best reply to the better move",
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
const TOLD_SETS = [['Pub', told(days.map((i) => R.cases[i].publishedTold))], ['Base', told(firstRuns(BASE).map((r) => r.told))], ['Cand', told(firstRuns(CAND).map((r) => r.told))]]
claim(TOLD_SETS.every(([, ts]) => ts.length === days.length), 'every script was counted by the positions it teaches')
for (const [name, ts] of TOLD_SETS) {
  g.def(`${name}Split`, fixed(mean(ts.map((t) => t.split)), 1)).def(`${name}Positions`, fixed(mean(ts.map((t) => t.positions)), 1))
  for (const k of ['habitNamed', 'replacement', 'level']) g.def(`${name}Told${cap(k)}`, percent(pooled(ts, k) ?? 0, 0))
}
const [, baseTold] = TOLD_SETS[1]
const [, candTold] = TOLD_SETS[2]
claim(pooled(candTold, 'habitNamed') >= pooled(baseTold, 'habitNamed') - 0.05, 'counted once per position, the candidate names the habit about as often as today\'s prompt')
claim(mean(candTold.map((t) => t.split)) > mean(baseTold.map((t) => t.split)) + 1, 'the candidate tells a position in two scenes far more often')
claim(pooled(candTold, 'replacement') < pooled(baseTold, 'replacement') && pooled(candTold, 'replacement') > pooled(baseTold, 'replacement') - 0.1, 'counted once per position, the candidate ends on the replacement a little less often')
const toldRow = (k) => `${NAMES[k]} & ${cells(TOLD_SETS, k)} \\\\`
g.block('MovesTable', [
  '\\begin{tabular}{lrrr}',
  '\\toprule',
  'In the moment scenes & Published & Today\'s prompt & Candidate \\\\',
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
for (const k of ['openQuestion', 'thenWhat', 'level']) claim(pooled(pubT, k) < 0.25 && pooled(tallies(BASE), k) < 0.25, `the published scripts and today's prompt rarely make the move ${k}`)
claim(pooled(pubT, 'level') === 0 && pooled(tallies(BASE), 'level') === 0, 'the published scripts and today\'s prompt never place a miss at his level')
for (const k of ['habitNamed', 'replacement']) claim(pooled(tallies(CAND), k) < pooled(tallies(BASE), k) && pooled(pubT, k) > 0.5 && pooled(tallies(BASE), k) > 0.5, `scene by scene, the candidate makes ${k} less often than today's prompt, which makes it in most moment scenes`)
for (const k of ['openQuestion', 'thenWhat', 'level']) claim(pooled(tallies(CAND), k) > 0.5, `the candidate makes ${k} in most moment scenes`)
for (const k of ['openQuestion', 'thenWhat', 'level']) claim(pooled(tallies(CAND), k) > pooled(tallies(BASE), k) + 0.2, `the candidate makes ${k} far more often`)
g.def('ShareBase', percent(rep.all['audit.coachingShare.base'].est, 0)).def('ShareCand', percent(rep.all['audit.coachingShare'].est, 0))
g.def('ShareDiff', interval(rep.all['audit.coachingShare.minusBase']))

// ---- length, cost, the check ----
const passed = {}
for (const [name, config] of [['Base', BASE], ['Cand', CAND]]) {
  const rs = firstRuns(config)
  g.def(`${name}Heard`, fixed(mean(rs.map((r) => r.shape.seconds)) / 60, 1)).def(`${name}Words`, String(Math.round(mean(rs.map((r) => r.shape.words)))))
  g.def(`${name}Cost`, fixed(mean(rs.map((r) => r.cost)), 2)).def(`${name}Minutes`, fixed(mean(rs.map((r) => r.minutes)), 0)).def(`${name}Rounds`, fixed(mean(rs.map((r) => r.rounds)), 1))
  g.def(`${name}Passed`, String(rs.filter((r) => r.pass).length)).def(`${name}Runs`, String(rs.length))
  passed[name] = rs.filter((r) => r.pass).length
  g.def(`${name}BoardScenes`, fixed(mean(rs.map((r) => r.shape.boardScenes)), 1)).def(`${name}Questions`, fixed(mean(rs.map((r) => r.shape.questions)), 1))
}
g.def('PubHeard', fixed(mean(published.map((a) => a.seconds)) / 60, 1))
claim(rep.all.lengthRatio.lo > 1, 'the candidate is longer')
claim(mean(firstRuns(CAND).map((r) => r.shape.questions)) > mean(firstRuns(BASE).map((r) => r.shape.questions)), 'the candidate asks more')
claim(mean(firstRuns(CAND).map((r) => r.shape.boardScenes)) > mean(firstRuns(BASE).map((r) => r.shape.boardScenes)), 'the candidate shows more board scenes')
claim(mean(published.map((a) => a.seconds)) < Math.min(...[BASE, CAND].map((c) => mean(firstRuns(c).map((r) => r.shape.seconds)))), 'the published videos are shorter than either prompt\'s replays')
g.def('LengthCap', '1.3')
g.def('LengthRatio', fixed(rep.all.lengthRatio.est, 2)).def('LengthRatioInterval', ratio(rep.all.lengthRatio))
claim(runs.every((r) => r.pass), 'every run passed the final check')
claim(runs.every((r) => !r.forbidden.length && !r.otherFiles), 'no writer ran a forbidden command or changed a file besides the video script')

// ---- the judge ----
for (const [name, split] of [['Train', 'train'], ['Held', 'heldOut'], ['All', 'all']]) {
  for (const c of CRITERIA) g.def(`${name}${cap(c)}`, interval(rep[split][`judge.${c}`]))
}
g.def('AllNullCoaching', interval(rep.all['null.coaching']))
const verdicts = (c) => judged.map((p) => p.candidate.final[c])
const tally = (c, v) => verdicts(c).filter((x) => x === v).length
for (const c of CRITERIA) g.def(`${cap(c)}Wins`, word(tally(c, 'candidate'))).def(`${cap(c)}Losses`, word(tally(c, 'reference'))).def(`${cap(c)}Ties`, word(tally(c, 'tie')))
const nullDecisive = nullPairs.filter((p) => p.null.final.coaching !== 'tie').length
claim(['candidate', 'reference'].every((v) => nullPairs.some((p) => p.null.final.coaching === v)), 'the noise floor splits coaching each way at least once')
claim(tally('coaching', 'reference') === 0 && tally('listening', 'candidate') === 0, 'the candidate never lost coaching and never won listening')
claim(tally('truth', 'candidate') === tally('truth', 'reference'), 'truth was even')
claim(R.report.rule['1 coaching better on train'] && R.report.rule['2 coaching better held out'] && R.report.kept, 'the rule kept the candidate, on train and held out alike')
g.def('NullDecisive', word(nullDecisive))
const decided = []
for (const v of [...judged.map((p) => p.candidate), ...nullPairs.map((p) => p.null)]) {
  for (const r of v.orders) for (const c of CRITERIA) if (r[c] !== 'tie') decided.push(r[c] === r.order[1] ? 'second' : 'first')
}
const second = decided.filter((x) => x === 'second').length
g.def('Decided', String(decided.length)).def('SecondShare', percent(second / decided.length, 0))
const split = (c) => judged.filter((p) => p.candidate.orders.every((o) => o[c] !== 'tie') && p.candidate.orders[0][c] !== p.candidate.orders[1][c]).length
g.def('CoachingSplit', word(split('coaching')))

// ---- the controls ----
const controls = Object.entries(U.controls).filter(([i]) => days.includes(i)).map(([, c]) => c)
const same = controls.filter((c) => c.same)
const decoy = controls.filter((c) => c.decoy)
claim(same.length === days.length && decoy.length === days.length, 'both controls cover every judged day')
const sameBroken = same.filter((c) => CRITERIA.some((k) => c.same.final[k] !== 'tie')).length
const decoyCoach = decoy.filter((c) => c.decoy.final.coaching === 'candidate').length
const decoyLost = (k) => decoy.filter((c) => c.decoy.final[k] === 'reference').length
g.def('SameN', word(same.length)).def('SameBroken', word(sameBroken)).def('DecoyN', word(decoy.length)).def('DecoyCoaching', word(decoyCoach))
g.def('DecoyLostListening', word(decoyLost('listening'))).def('DecoyLostOverall', word(decoyLost('overall')))
const texts = controls.map((c) => c.decoyText).filter(Boolean)
g.def('DecoyAdded', String(Math.round(mean(texts.map((t) => t.added)))))
claim(sameBroken === 0, 'the same script on both sides ties on every criterion')
claim(decoyCoach === 0, 'the decoy never won coaching')
claim(decoyLost('listening') === decoy.length && decoyLost('overall') === decoy.length, 'the decoy lost listening and overall on every day')

// ---- truth ----
for (const [name, config] of [['Base', BASE], ['Cand', CAND]]) {
  const as = firstRuns(config).map((r) => r.audit).filter(Boolean)
  g.def(`${name}False`, fixed(mean(as.map((a) => a.counts.false)), 2)).def(`${name}Unsupported`, fixed(mean(as.map((a) => a.counts.unsupported)), 1))
  g.def(`${name}Misleading`, fixed(mean(as.map((a) => a.counts.misleading)), 1)).def(`${name}BoardFalse`, fixed(mean(as.map((a) => a.tally.boardClaimsFalse)), 2))
}
g.def('PubFalse', fixed(mean(published.map((a) => a.counts.false)), 1)).def('PubBoardFalse', fixed(mean(published.map((a) => a.tally.boardClaimsFalse)), 1))
g.def('FalseDiff', interval(rep.all['audit.false.minusBase'])).def('BoardDiff', interval(rep.all['audit.boardClaimsFalse.minusBase']))
for (const k of ['false', 'boardClaimsFalse']) claim(rep.all[`audit.${k}.minusBase`].lo <= 0 && rep.all[`audit.${k}.minusBase`].hi >= 0, `the ${k} difference is within the noise`)
for (const k of ['unsupported', 'misleading']) claim(Math.abs(mean(firstRuns(CAND).map((r) => r.audit.counts[k])) - mean(firstRuns(BASE).map((r) => r.audit.counts[k]))) < 0.5, `${k} lines are about as common under both prompts`)

// ---- the graders measured twice ----
const retest = runs.filter((r) => r.audit && r.earlier && r.earlier['graded-v2'] && r.earlier['graded-v2'].audit)
const shareDiffs = retest.map((r) => Math.abs(r.audit.tally.coachingShare - r.earlier['graded-v2'].audit.tally.coachingShare))
claim(rep.all['audit.coachingShare.minusBase'].lo > mean(shareDiffs), 'the pooled coaching-share difference is beyond the audit\'s retest noise')
g.def('RetestN', word(retest.length)).def('RetestShare', fixed(mean(shareDiffs) * 100, 0)).def('RetestMax', fixed(Math.max(...shareDiffs) * 100, 0))
const first = runs.find((r) => r.config === CAND && r.earlier && r.earlier['graded-v1'] && r.earlier['graded-v1']['judge-vs-baseline'])
claim(Boolean(first), "the first grading of the pilot's first pair is kept")
g.def('FirstGradedDay', label(first.id)).def('FirstCoaching', first.earlier['graded-v1']['judge-vs-baseline'].final.coaching === 'candidate' ? 'preferred the candidate' : 'did not prefer the candidate')

// ---- the rule ----
const RULE = rep.rule
const CandPassedN = passed.Cand
const BasePassedN = passed.Base
const ruleRows = [
  ['Coaching on the train days above 0', interval(rep.train['judge.coaching']), RULE['1 coaching better on train']],
  ['Coaching on the held-out days above 0', interval(rep.heldOut['judge.coaching']), RULE['2 coaching better held out']],
  ['Overall not below 0', interval(rep.all['judge.overall']), RULE['3 overall not worse']],
  ['False claims per script not up', interval(rep.all['audit.false.minusBase']), !(rep.all['audit.false.minusBase'].lo > 0)],
  ['False board claims per script not up', interval(rep.all['audit.boardClaimsFalse.minusBase']), !(rep.all['audit.boardClaimsFalse.minusBase'].lo > 0)],
  ['The check passes as often', `${CandPassedN} of ${days.length} {\\footnotesize (today's: ${BasePassedN})}`, RULE['5 check passes as often']],
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
g.def('Kept', R.report.kept ? 'yes' : 'no')

// ---- per day ----
const mark = { candidate: '+', reference: '$-$', tie: '0' }
const dayRows = days.map((i) => {
  const p = judged.find((x) => x.id === i)
  const b = of(BASE, 1).find((r) => r.id === i)
  const t = of(CAND, 1).find((r) => r.id === i)
  return `${short(i)} & ${R.cases[i].split === 'train' ? 'train' : 'held out'} & ${R.cases[i].games} & ${CRITERIA.map((c) => mark[p.candidate.final[c]]).join(' & ')} & ${fixed(t.shape.seconds / b.shape.seconds, 2)} & ${percent(b.audit.tally.coachingShare, 0)} & ${percent(t.audit.tally.coachingShare, 0)} \\\\`
})
g.block('DayTable', [
  '\\begin{tabular}{llrccccrrr}',
  '\\toprule',
  ' & & & \\multicolumn{4}{c}{Judge, from the candidate\'s side} & Length & \\multicolumn{2}{c}{Coaching share} \\\\',
  '\\cmidrule(lr){4-7}\\cmidrule(lr){9-10}',
  'Day & Split & Games & Truth & Coaching & Listening & Overall & ratio & Today & Candidate \\\\',
  '\\midrule',
  ...dayRows,
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))

g.write(join(HERE, 'generated.tex'))
console.log('wrote generated.tex')
