// The rule in README.md over the rows replay.mjs wrote: round 1's two
// verdicts on the rebuilt record (whether the headline rating's solve chances
// are calibrated within the noise, and whether the view of a set's own channel
// predicts his first tries better on both halves of the days), how the misses
// sit on the memory cards that record was rebuilt from, and the same looks on
// the profile as the app holds it.
//
//   bridge/run.sh projects/learner-solve-chance/fit.mjs
import fs from 'node:fs'
import { join } from 'node:path'
import { privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { B, SEED, aimTable, byDay, f3, iv, lookTables, looks, pct, pp, rule1, rule2, shiftText } from './lib.mjs'

const dir = privateDir('learner-solve-chance')
const rows = fs.readFileSync(join(dir, 'rows.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const state = JSON.parse(fs.readFileSync(join(dir, 'state.json'), 'utf8'))

// ---------------------------------------------------------------- round 1, on the rebuilt record
const R = rows.filter((r) => r.record === 'rebuilt')
const days = byDay(R)
const { gap: headGap, verdict: verdict1 } = rule1(days)
const { halves: halfTests, passes } = rule2(days)

const held = rows.filter((r) => r.record === 'held')
const report = {
  app: state.app,
  seed: SEED,
  draws: B,
  record: {
    cards: state.checks.cards,
    once: state.checks.once,
    more: state.checks.more,
    fromEvents: state.checks.fromEvents,
    rebuilt: state.checks.rebuilt,
    log: state.log,
    firstTries: state.shape.firstTries,
    firstTriesByBucket: state.shape.firstTriesByBucket,
    span: state.shape.span,
    heldPuzzleTotals: state.shape.heldPuzzleTotals,
    profile: state.shape.profile,
    lastAttempt: state.shape.lastAttempt,
    syncedOn: state.shape.syncedOn,
  },
  // A miss comes back as a redemption card, so the cards reviewed once, the
  // only ones round 1's record keeps, hold almost none of the misses.
  selection: state.selection,
  round1: { verdict1: { gap: headGap, verdict: verdict1 }, verdict2: { halves: halfTests, passes }, looks: looks(R) },
  held: looks(held),
  selfCheck: state.selfCheck,
  today: state.today,
}

// ---------------------------------------------------------------- the report
const sel = report.selection
const H = report.held
const md = [
  '# The learner\'s solve chances: results',
  '',
  `Written by fit.mjs. App commit ${state.app}, reading the profile at ${report.record.profile}, the commit round 1 measured. Bootstrap: ${B} draws over days, seed ${SEED}.`,
  '',
  '## Round 1, on the rebuilt record',
  '',
  `His puzzle first tries rebuilt from ${report.record.cards} memory cards: the ${report.record.once} reviewed once (${report.record.fromEvents} of them with the app's own event), ${report.record.firstTries} first tries from ${report.record.span.from} to ${report.record.span.to}; ${R.length} scored on ${days.length} days. The ${report.record.more} cards reviewed more than once are left out.`,
  '',
  `**Verdict 1, as computed.** He solved ${pct(report.round1.looks.solved)} of the scored first tries; the headline rating's mean solve chance was ${pct(report.round1.looks.headline.meanChance)}, a gap of ${pp(headGap.value)} points (95% interval ${iv(headGap.interval)}): by the rule, the headline ${verdict1 === 'calibrated' ? 'is calibrated within the noise' : verdict1}.`,
  '',
  `**Verdict 2, as computed.** Mean log loss per attempt, the view of the set's own channel against the headline: ${halfTests.map((t, i) => `half ${i + 1} (${t.days} days, ${t.attempts} attempts) ${f3(t.view)} against ${f3(t.head)}, a difference of ${f3(t.value)} (95% interval ${f3(t.interval[0])} to ${f3(t.interval[1])})`).join('; ')}. By the rule, ${passes ? 'both halves pass' : 'it does not pass'}.`,
  '',
  `**Neither verdict stands.** A miss comes back as a redemption card, so a card reviewed once is nearly always a solve: the ${sel.once.cards} cards reviewed once hold ${sel.once.fails} miss${sel.once.fails === 1 ? '' : 'es'}, the ${sel.more.cards} reviewed more than once hold ${sel.more.fails} on ${sel.more.withFail} cards. Leaving those cards out kept his solves and dropped his misses, which is the outcome the rule measures.`,
  '',
  '## The profile as the app held it for round 1',
  '',
  `The legacy log, the puzzle totals as the seed and the events, as the app folds them: ${H.attempts} scored attempts on ${H.days} days (${H.dayRange[0]} to ${H.dayRange[1]}), ${H.misses} misses, ${pct(H.solved)} solved. Every attempt in this record was logged when it was played, so nothing in it selects on the result. Named before the run, deciding nothing.`,
  '',
  `The headline's mean solve chance was ${pct(H.headline.meanChance)} (gap ${pp(H.headline.gap.value)}, 95% interval ${iv(H.headline.gap.interval)}); the view's ${pct(H.view.meanChance)} (gap ${pp(H.view.gap.value)}, ${iv(H.view.gap.interval)}). The view's log loss minus the headline's: ${f3(H.candidate.value)} (${f3(H.candidate.interval[0])} to ${f3(H.candidate.interval[1])}). The shift that best fits the headline's chances takes ${shiftText(H.shift.head)} points off every item's rating; the view's, ${shiftText(H.shift.view)}.`,
  '',
  ...lookTables(H),
  '',
  `The learner's own self-check on this profile: ${report.selfCheck.n} held-out attempts, Brier ${report.selfCheck.brier} against ${report.selfCheck.baseline.brier} for its constant, log loss ${report.selfCheck.logLoss} against ${report.selfCheck.baseline.logLoss}; mean predicted ${report.selfCheck.meanPredicted}, observed ${report.selfCheck.meanObserved}.`,
  '',
  `## What each estimate would aim a set at on ${report.record.syncedOn}, when the profile round 1 read was synced`,
  '',
  ...aimTable(report.today),
  '',
  '## Round 1\'s rebuilt record, for completeness',
  '',
  ...lookTables(report.round1.looks),
  '',
]
const out = resultsDir('learner-solve-chance')
fs.writeFileSync(join(out, 'solve.json'), JSON.stringify(report, null, 1) + '\n')
fs.writeFileSync(join(out, 'solve.md'), md.join('\n'))
console.log(md.join('\n'))
