// The rules' arithmetic on made-up attempts whose answer is known
// (bridge/run.sh --test projects/learner-solve-chance/lib.test.mjs). No
// attempt of his is read.
import assert from 'node:assert/strict'
import test from 'node:test'
import { B, CLIMB_MIN, CLIMB_WINDOW, MIN_PER_LEVEL, MIN_RAISED, RAISED_BY, SEED, byDay, climbRating, climbRule, depthOf, halvesOf, lastSetRating, levelOf, looks, round2Markdown, rule1, rule2, rule3 } from './lib.mjs'

/** `n` attempts on a day at one depth, of which the first `solved` are solved, with both estimates' chances. */
const attempts = (day, n, solved, { depth = 2, head = 0.5, view = 0.5, bucket = 'fork', rating = 1500, difficulty = 1500, inBank = true } = {}) =>
  Array.from({ length: n }, (_, i) => ({
    day,
    bucket,
    s: i < solved ? 1 : 0,
    head,
    view,
    run: 0.5,
    headRating: rating,
    viewRating: rating,
    difficulty,
    rd: 60,
    depth: inBank ? depth : null,
    level: inBank ? levelOf(depth) : null,
  }))
const day = (i) => `2026-01-${String(i + 1).padStart(2, '0')}`

test('depth is half the move list, and level two starts at two moves', () => {
  assert.equal(depthOf('e2e4 e7e5'), 1)
  assert.equal(depthOf('e2e4 e7e5 g1f3 b8c6'), 2)
  assert.equal(depthOf('a b c d e f g h'), 4)
  assert.throws(() => depthOf('e2e4 e7e5 g1f3'))
  assert.deepEqual([1, 2, 3, 4, 7].map(levelOf), [1, 2, 2, 2, 2])
})

test('the days alternate between the halves, the first day in the first', () => {
  const days = byDay([3, 0, 2, 1, 4].flatMap((i) => attempts(day(i), 1, 1)))
  assert.deepEqual(days.map((d) => d.day), [0, 1, 2, 3, 4].map(day))
  const [first, second] = halvesOf(days)
  assert.deepEqual(first.map((d) => d.day), [0, 2, 4].map(day))
  assert.deepEqual(second.map((d) => d.day), [1, 3].map(day))
})

test('rule 1 reads the headline against the share solved by the interval over the days', () => {
  const at = (solved, head) => byDay(Array.from({ length: 6 }, (_, i) => attempts(day(i), 10, solved, { head })).flat())
  const under = rule1(at(9, 0.6))
  assert.equal(under.verdict, 'under-predicts')
  assert.ok(Math.abs(under.gap.value - 0.3) < 1e-12 && under.gap.interval[0] > 0)
  assert.equal(rule1(at(3, 0.6)).verdict, 'over-predicts')
  // Days that fall on both sides of the chance: the interval holds zero.
  const mixed = byDay(Array.from({ length: 6 }, (_, i) => attempts(day(i), 10, i % 2 ? 9 : 3, { head: 0.6 })).flat())
  assert.equal(rule1(mixed).verdict, 'calibrated')
})

test('rule 2 keeps the view only when it beats the headline on both halves', () => {
  const rows = (viewOnOdd) => Array.from({ length: 8 }, (_, i) => attempts(day(i), 10, 9, { head: 0.6, view: i % 2 ? viewOnOdd : 0.9 })).flat()
  const better = rule2(byDay(rows(0.9)))
  assert.equal(better.passes, true)
  assert.deepEqual(better.halves.map((h) => [h.days, h.attempts]), [[4, 40], [4, 40]])
  assert.ok(better.halves.every((h) => h.view < h.head && h.interval[1] < 0))
  // The view is worse than the headline on the second half's days.
  const worseOnOne = rule2(byDay(rows(0.2)))
  assert.equal(worseOnOne.passes, false)
  assert.ok(worseOnOne.halves[0].value < 0 && worseOnOne.halves[1].value > 0)
})

test('rule 3 waits until each level holds its attempts, and counts what it leaves out', () => {
  const rows = [...attempts(day(0), MIN_PER_LEVEL - 1, 20, { depth: 1 }), ...attempts(day(1), 40, 20, { depth: 3 }), ...attempts(day(2), 2, 1, { inBank: false })]
  const waiting = rule3(byDay(rows), 'view')
  assert.equal(waiting.status, 'not enough data')
  assert.deepEqual(waiting.counts, { one: { attempts: MIN_PER_LEVEL - 1, days: 1 }, two: { attempts: 40, days: 1 }, notInBank: 2, needed: MIN_PER_LEVEL })
  assert.equal(waiting.statistic, undefined)
  assert.throws(() => rule3(byDay(rows), 'run'))
})

test('rule 3 shows no difference when both levels miss the chance alike', () => {
  const rows = Array.from({ length: 6 }, (_, i) => [...attempts(day(i), 10, 7, { depth: 1 }), ...attempts(day(i), 10, 7, { depth: 2 + (i % 3) })]).flat()
  const r = rule3(byDay(rows), 'view')
  assert.equal(r.status, 'ran')
  assert.equal(r.verdict, 'no difference shows')
  assert.ok(Math.abs(r.statistic.value) < 1e-12)
  assert.equal(r.term, null)
  assert.equal(r.statistic.drawnAgain, 0)
  assert.deepEqual([r.groups.one.attempts, r.groups.two.attempts, r.groups.twoOrThree.attempts, r.groups.fourOrMore.attempts], [60, 60, 40, 20])
  assert.ok(Math.abs(r.groups.one.solved.value - 0.7) < 1e-12 && Math.abs(r.groups.one.view.gap.value - 0.2) < 1e-12)
  assert.deepEqual(r.bothLevels.buckets, ['fork'])
})

test('rule 3 reads the estimate rule 2 leaves serving', () => {
  // By the view both levels are off alike, a little more or less by the day; by the headline only level one is.
  const rows = Array.from({ length: 6 }, (_, i) => [...attempts(day(i), 10, i % 2 ? 10 : 8, { depth: 1, head: 0.5, view: 0.7 }), ...attempts(day(i), 10, 7, { depth: 2, head: 0.7, view: 0.5 })]).flat()
  const byView = rule3(byDay(rows), 'view')
  assert.equal(byView.verdict, 'no difference shows')
  const byHead = rule3(byDay(rows), 'head')
  assert.equal(byHead.verdict, 'more often at one move')
  assert.ok(Math.abs(byHead.statistic.value - 0.4) < 1e-12)
  // Each run reports the other estimate's statistic beside its own, deciding nothing.
  assert.equal(byView.otherEstimate.estimate, 'head')
  assert.deepEqual(byView.otherEstimate.statistic, byHead.statistic)
  assert.deepEqual(byHead.otherEstimate, { estimate: 'view', statistic: byView.statistic })
})

test('a difference by depth fits a shift per level on the first half and tests it on both', () => {
  // He solves every one-move puzzle and half the longer ones, all rated as he is.
  const rows = Array.from({ length: 8 }, (_, i) => [...attempts(day(i), 10, 10, { depth: 1 }), ...attempts(day(i), 10, 5, { depth: 2 })]).flat()
  const r = rule3(byDay(rows), 'view')
  assert.equal(r.verdict, 'more often at one move')
  assert.ok(Math.abs(r.statistic.value - 0.5) < 1e-12)
  assert.equal(r.term.fitted, true)
  assert.deepEqual(r.term.firstHalf, { one: 40, two: 40 })
  // Taking points off a puzzle he always solves fits best at the grid's edge; a coin flip at his own rating needs none.
  assert.deepEqual(r.term.levelShifts, { one: 500, two: 0 })
  assert.ok(r.term.oneShift > 0 && r.term.oneShift < 500)
  assert.equal(r.term.difference, 500)
  assert.equal(r.term.kept, true)
  assert.ok(r.term.halves.every((h) => h.depth < h.single && h.interval[1] < 0 && h.days === 4 && h.attempts === 80))

  const less = rule3(byDay(Array.from({ length: 8 }, (_, i) => [...attempts(day(i), 10, 2, { depth: 1 }), ...attempts(day(i), 10, 5, { depth: 2 })]).flat()), 'view')
  assert.equal(less.verdict, 'less often at one move')
  assert.ok(less.term.levelShifts.one < 0)
})

test('a term that fits only the first half is not kept', () => {
  // One-move puzzles go well on the first half's days and badly on the second's.
  const rows = Array.from({ length: 8 }, (_, i) => [...attempts(day(i), 10, i % 2 ? 4 : 10, { depth: 1 }), ...attempts(day(i), 10, i % 2 ? 0 : 5, { depth: 2 })]).flat()
  const r = rule3(byDay(rows), 'view')
  assert.equal(r.verdict, 'more often at one move')
  assert.equal(r.term.fitted, true)
  assert.ok(r.term.halves[0].value < 0)
  assert.equal(r.term.kept, r.term.halves.every((h) => h.value < 0 && h.interval[1] < 0))
})

test('a draw that holds no attempt at one of the levels is drawn again', () => {
  // One-move attempts on one day of three: about three draws in ten hold none.
  const rows = [...attempts(day(0), 40, 30, { depth: 1 }), ...attempts(day(0), 10, 5), ...attempts(day(1), 20, 10), ...attempts(day(2), 20, 10)]
  const r = rule3(byDay(rows), 'view')
  assert.equal(r.status, 'ran')
  assert.ok(r.statistic.drawnAgain > 0.3 * B && r.statistic.drawnAgain < 0.6 * B)
  assert.ok(r.statistic.interval[0] <= r.statistic.value && r.statistic.value <= r.statistic.interval[1])
  assert.equal(r.groups.two.solved.drawnAgain, 0)
  assert.equal(r.groups.fourOrMore.attempts, 0)
})

test('attempts the bank no longer holds are left out of rule 3, and the halves stay rule 2\'s', () => {
  // The second day holds only attempts out of the bank: it still takes its turn in the halves.
  const rows = [
    ...attempts(day(0), 20, 20, { depth: 1 }),
    ...attempts(day(0), 20, 10),
    ...attempts(day(1), 5, 5, { inBank: false }),
    ...attempts(day(2), 20, 20, { depth: 1 }),
    ...attempts(day(2), 20, 10),
    ...attempts(day(3), 20, 20, { depth: 1, bucket: 'mateIn1' }),
    ...attempts(day(3), 20, 10, { bucket: 'pin' }),
  ]
  const r = rule3(byDay(rows), 'view')
  assert.equal(r.counts.notInBank, 5)
  assert.deepEqual([r.counts.one, r.counts.two], [{ attempts: 60, days: 3 }, { attempts: 60, days: 3 }])
  assert.equal(r.verdict, 'more often at one move')
  // Days 1 and 3 are the first half, days 2 and 4 the second: the fourth day's attempts are tested, not fitted.
  assert.deepEqual(r.term.firstHalf, { one: 40, two: 40 })
  assert.deepEqual(r.term.halves.map((h) => [h.days, h.attempts]), [[2, 80], [1, 40]])
  assert.deepEqual(r.bothLevels.buckets, ['fork'])
  assert.deepEqual([r.bothLevels.one, r.bothLevels.two], [40, 40])
})

/** A report as round2.mjs builds one, from made-up attempts. */
function reportOf(rows, serving) {
  const days = byDay(rows)
  const side = (set) => ({ attempts: set.length, days: byDay(set).length })
  const counts = { ...side(rows), dayRange: [days[0].day, days.at(-1).day], one: side(rows.filter((r) => r.level === 1)), two: side(rows.filter((r) => r.level === 2)), notInBank: rows.filter((r) => r.level === null).length }
  const attempts = { ...counts, attempts: rows.length + 3, scored: counts, leftOut: { notFirst: 2, otherChannel: 0 } }
  const third = rule3(days, serving)
  const aim = { puzzles: 12, lowest: 600, highest: 1900, aim: 1450 }
  return {
    round1: 'r'.repeat(40),
    cutoff: { day: '2026-10-07', clock: '09:27' },
    seed: SEED,
    draws: B,
    rules: {
      app: 'a'.repeat(40),
      profileSyncedOn: '2026-11-13',
      attempts,
      rule1: rule1(days),
      rule2: rule2(days),
      halfDays: halvesOf(days).map((h) => h.map((d) => d.rows.length)),
      looks: looks(rows),
      selfCheck: { n: 40, brier: 0.2, logLoss: 0.6, baseline: { brier: 0.21, logLoss: 0.62 }, meanPredicted: 0.7, meanObserved: 0.75 },
      today: [{ bucket: 'fork', phase: 'core', head: { rating: 1400, rd: 60, target: 1200 }, view: null, app: { from: 'totals', rating: 1500, rd: 80, target: 1300 }, bankMax: 1900, bankSize: 400 }],
    },
    rule3: {
      app: 'b'.repeat(40),
      profileSyncedOn: '2026-12-01',
      attempts,
      ...third,
      ...(third.status === 'ran' ? { targets: { one: { target: 0.85, band: [0.8, 0.9] }, two: { target: 0.65, band: [0.6, 0.7] } }, presentAim: { new: 0.85, core: 0.75 }, aims: [{ bucket: 'fork', rating: 1500, rd: 80, one: aim, two: aim }, { bucket: 'mateIn1', rating: 1300, rd: 90, one: aim, two: null }] } : {}),
    },
  }
}
const text = (report) => {
  const md = round2Markdown(report).join('\n')
  assert.doesNotMatch(md, /undefined|NaN|\[object|null/)
  return md
}

test('the report says what the rules found, in each of their outcomes', () => {
  // The view beats the headline everywhere; one-move puzzles go better than the chance says.
  const clear = Array.from({ length: 8 }, (_, i) => [...attempts(day(i), 10, 10, { depth: 1, head: 0.3, view: 0.6 }), ...attempts(day(i), 10, i % 2 ? 6 : 4, { depth: 2 + (i % 3), head: 0.3, view: 0.6 })]).flat()
  const kept = text(reportOf(clear, 'view'))
  assert.match(kept, /By the rule, the headline under-predicts him\./)
  assert.match(kept, /By the rule, both halves pass: the view stays the estimate/)
  assert.match(kept, /The halves' days hold, in time order, 20, 20, 20 and 20 scored attempts, and 20, 20, 20 and 20 scored attempts\./)
  assert.match(kept, /each with the chance from the view of his themed sets, the estimate rule 2 leaves serving/)
  assert.match(kept, /By the rule, he solves one-move puzzles more often than the chance says, against longer ones/)
  assert.match(kept, /By the rule, both halves pass and the term is kept/)
  assert.match(kept, /\| mateIn1 \| 1300 ± 90 \| 1450 \| 600 to 1900 \(12\) \| none \| none \|/)
  assert.match(kept, /Over only the 1 bucket whose attempts include both levels \(fork; 80 one-move attempts and 80 longer\)/)
  assert.match(kept, /On the chance from the headline rating, the estimate rule 2 did not leave serving, the statistic is \+\d+\.\d points/)

  // The view loses on the second half's days, so rule 3 reads the headline; both levels are off alike.
  const even = Array.from({ length: 8 }, (_, i) => [...attempts(day(i), 10, 7, { depth: 1, head: 0.7, view: i % 2 ? 0.2 : 0.7 }), ...attempts(day(i), 10, i % 2 ? 8 : 6, { head: 0.7, view: i % 2 ? 0.2 : 0.7 })]).flat()
  const none = text(reportOf(even, 'head'))
  assert.match(none, /By the rule, the headline is calibrated within the noise\./)
  assert.match(none, /By the rule, it does not pass: the view does not stay/)
  assert.match(none, /each with the chance from the headline rating, the estimate rule 2 leaves serving/)
  assert.match(none, /By the rule, no difference shows/)
  assert.doesNotMatch(none, /depth term/)
  assert.match(none, /\| Four moves or more \| 0 \| 0 \| n\/a/)

  // Too few one-move attempts: only the counts.
  const few = [...clear.filter((r) => r.level === 2), ...attempts(day(0), 5, 5, { depth: 1, head: 0.3, view: 0.6 }), ...attempts(day(1), 1, 1, { inBank: false, head: 0.3, view: 0.6 })]
  const waiting = text(reportOf(few, 'view'))
  assert.match(waiting, /\*\*Not enough data\.\*\* Rule 3 needs 30 scored attempts at each level, and the profile at app commit b{40} \(synced 2026-12-01\) holds 5 one-move attempts on 1 day and 80 of two moves or more on 8 days, with 1 left out because the bank no longer holds their puzzle\./)
  assert.doesNotMatch(waiting, /The test, as computed/)

  // A first half with no one-move attempt: the term cannot be fitted.
  const lopsided = Array.from({ length: 8 }, (_, i) => [...attempts(day(i), i % 2 ? 10 : 0, 10, { depth: 1 }), ...attempts(day(i), 10, 5)]).flat()
  const unfitted = text(reportOf(lopsided, 'view'))
  assert.match(unfitted, /The first half holds 0 one-move attempts and 40 longer ones, so a shift for each level cannot be fitted there, and no term is kept\./)
  assert.match(unfitted, /draws that held no attempt at one of the levels were drawn again/)
})

// ---------------------------------------------------------------- the climb
/** A set at one difficulty, of which the first `solved` attempts are solved. */
const setAt = (difficulty, solved, n = CLIMB_WINDOW) => Array.from({ length: n }, (_, i) => ({ difficulty, difficultyRd: 50, score: i < solved ? 1 : 0 }))

test('the last set alone reads a perfect set far above its level, and a half-solved one at it', () => {
  assert.equal(CLIMB_WINDOW, 12)
  assert.equal(CLIMB_MIN, 6)
  // Twelve of twelve with one solve and one miss added is thirteen of fourteen: ln 13 on the app's scale.
  assert.equal(lastSetRating(setAt(1000, 12)), 1451)
  assert.equal(lastSetRating(setAt(1000, 11)), 1315)
  assert.equal(lastSetRating(setAt(1000, 6)), 1000)
  assert.equal(lastSetRating(setAt(1000, 0)), 549)
  const ratings = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((k) => lastSetRating(setAt(1000, k)))
  assert.ok(ratings.every((r, i) => i === 0 || r > ratings[i - 1]))
  // The same record 300 points up reads 300 points up.
  assert.equal(lastSetRating(setAt(1300, 9)), lastSetRating(setAt(1000, 9)) + 300)
})

test('the last set is the last twelve attempts, and needs six', () => {
  assert.equal(lastSetRating(setAt(1000, 5, 5)), null)
  assert.equal(lastSetRating(setAt(1000, 6, 6)), lastSetRating([...setAt(1000, 0, 0), ...setAt(1000, 6, 6)]))
  // Twenty misses long ago do not reach it.
  assert.equal(lastSetRating([...setAt(600, 0, 20), ...setAt(1000, 12)]), 1451)
  // A harder second half, all solved, reads above the same number solved at the lower level alone.
  assert.ok(lastSetRating([...setAt(1000, 6, 6), ...setAt(1200, 6, 6)]) > 1451)
})

test('kept to perfect sets, one miss leaves the view alone', () => {
  assert.equal(lastSetRating(setAt(1000, 12), { perfect: true }), 1451)
  assert.equal(lastSetRating(setAt(1000, 11), { perfect: true }), null)
  assert.equal(climbRating(1300, null), 1300)
  assert.equal(climbRating(1300, 1451), 1451)
  assert.equal(climbRating(1500, 1451), 1500)
})

/** `n` attempts of one sitting on a day, the first `solved` of them solved. */
const sitting = (i, n, solved, { view, climb, raisedBy }) => Array.from({ length: n }, (_, j) => ({ sitting: i, day: day(i), s: j < solved ? 1 : 0, view, climb, raisedBy }))

test('the climb is kept only where the view under-predicts the raised sittings and the climb does not over-predict them', () => {
  const round = (solved, chances, sittings = 6) => Array.from({ length: sittings }, (_, i) => sitting(i, 12, solved, { raisedBy: RAISED_BY, ...chances })).flat()
  const kept = climbRule(round(11, { view: 0.75, climb: 0.9 }))
  assert.equal(kept.status, 'ran')
  assert.deepEqual([kept.counts.attempts, kept.counts.sittings, kept.counts.days], [72, 6, 6])
  assert.deepEqual([kept.viewUnder, kept.climbOver, kept.kept], [true, false, true])
  assert.ok(Math.abs(kept.view.value - (11 / 12 - 0.75)) < 1e-12)
  // He solves what the view says: nothing shows the view too low.
  assert.deepEqual([climbRule(round(9, { view: 0.75, climb: 0.9 })).viewUnder, climbRule(round(9, { view: 0.75, climb: 0.9 })).kept], [false, false])
  // The view is too low and the climb far too high.
  const over = climbRule(round(8, { view: 0.5, climb: 0.95 }))
  assert.deepEqual([over.viewUnder, over.climbOver, over.kept], [true, true, false])
})

test('the rule reads only the raised sittings, and only once they hold enough', () => {
  const few = climbRule([0, 1].flatMap((i) => sitting(i, 12, 12, { view: 0.75, climb: 0.9, raisedBy: RAISED_BY })))
  assert.equal(few.status, 'not enough data')
  assert.deepEqual([few.counts.attempts, few.counts.days, few.counts.needed], [24, 2, MIN_RAISED])
  // Enough attempts on too few days.
  assert.equal(climbRule([0, 1, 2, 3].flatMap((i) => sitting(i, 12, 12, { view: 0.75, climb: 0.9, raisedBy: RAISED_BY }))).status, 'not enough data')
  // Sittings raised by less than the stalled gap are not read.
  const mixed = [...[0, 1, 2, 3, 4].flatMap((i) => sitting(i, 12, 11, { view: 0.75, climb: 0.9, raisedBy: RAISED_BY })), ...[5, 6, 7].flatMap((i) => sitting(i, 12, 0, { view: 0.75, climb: 0.8, raisedBy: RAISED_BY - 1 }))]
  assert.deepEqual([climbRule(mixed).counts.attempts, climbRule(mixed).kept], [60, true])
})
