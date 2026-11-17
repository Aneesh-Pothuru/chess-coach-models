// A faster climb after an aced set, simulated (README.md, "A faster climb
// after an aced set"): made-up players whose solve chance is the app's own,
// served by the app's own learner and serving code, with a set aimed
//   - from the view of the bucket's own sets, as the app aims;
//   - from the higher of the view and the rating the last set gives by
//     itself (the climb);
//   - the same, only after a set solved in full (the climb after a perfect set);
//   - the same, only while every first try the bucket has on record was
//     solved (the climb while he has never missed).
// No attempt of his is read.
//
//   bridge/run.sh projects/learner-solve-chance/climb-sim.mjs
//
// It writes results/climb-sim.json and climb-sim.md: how far the last set
// alone reads above its level, how many sets each way of aiming needs to
// reach a level and what it costs once there, where a round like round 3
// leaves twelve buckets, how far over the view's chance such a round has the
// player solving (beside round 2's own figure, read from results/round2.json),
// and how often a rule on such a round could tell.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { join } from 'node:path'
import { chess, CHESS_DIR, resultsDir } from '../../bridge/lib/chess.mjs'
import { CLIMB_MIN, CLIMB_WINDOW, MIN_RAISED, RAISED_BY, cat, checkBorrowedConstants, climbRating, climbRule, endgameIds, iv, lastSetRating, mean, mulberry32, pct, pp } from './lib.mjs'

const { foldAbilities } = await chess('src/services/learner/ability.ts')
const { observations, byCompetency } = await chess('src/services/learner/evidence.ts')
const { ITEM_RD } = await chess('src/services/learner/glicko.ts')
const { difficultyFor, newAbility, serveTarget, servingAbility, solveChance, SESSION_SIZE, TARGET_P } = await chess('src/services/learner/index.ts')

checkBorrowedConstants()
const app = execFileSync('git', ['-C', CHESS_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const DAY_MS = 86_400_000
const T0 = Date.UTC(2026, 0, 1, 18)
const TARGET = TARGET_P.core
const ARMS = ['app', 'climb', 'perfect', 'unmissed']
const ARM_NAME = { app: 'the view (the app)', climb: 'the climb', perfect: 'the climb after a perfect set', unmissed: 'the climb while he has never missed' }
/** A bucket's level: the difficulty a player rated `rating` there solves at the app's target. */
const goalOf = (rating) => difficultyFor(newAbility(rating), TARGET)

// ---------------------------------------------------------------- one bucket of a made-up player
/** A bucket's record as the app keeps it: an attempt event per puzzle, and the totals beside them. */
const bucketOf = (id) => ({ id, events: [], solved: 0 })
function record(bucket, at, difficulty, score) {
  bucket.events.push({ type: 'attempt', at, item: { kind: 'puzzle', id: `${bucket.id}-${bucket.events.length}` }, tags: [{ c: bucket.id, role: 'primary' }], channel: 'themed', first: true, score, difficulty: { r: difficulty, rd: ITEM_RD, src: 'sim' } })
  bucket.solved += score
}
/** What the app's learner makes of the bucket at `now`, and where each way of aiming would start a set. */
function read(bucket, now) {
  const profile = { createdAt: T0, updatedAt: now, attempts: [], events: bucket.events, puzzleStats: { [bucket.id]: { attempts: bucket.events.length, correct: bucket.solved, workingRating: bucket.events[0].difficulty.r } } }
  const all = observations(profile, cat)
  const state = foldAbilities({ profile, catalogue: cat, observations: byCompetency(all), endgameIds, now }).get(bucket.id)
  if (!state.channels.themed || state.channels.themed.n !== bucket.events.length || state.seed) throw new Error('the made-up record does not fold as a bucket\'s own sets')
  const view = servingAbility(state, 'themed')
  const rating = { app: view.rating, climb: climbRating(view.rating, lastSetRating(all)), perfect: climbRating(view.rating, lastSetRating(all, { perfect: true })), unmissed: climbRating(view.rating, lastSetRating(all, { unmissed: true })) }
  const aim = Object.fromEntries(ARMS.map((arm) => [arm, serveTarget({ ...view, rating: rating[arm] }, 'core', [], 0)]))
  return { rating, aim, raisedBy: rating.climb - rating.app }
}
/**
 * Plays one set of the bucket at `now`: at `fixed` when given, else aimed as `arm` aims. With `eachTry`, every
 * attempt also carries the chance the view gave it on the record as it stood just before, as round 2 scores one.
 */
function playSet(bucket, now, arm, level, rng, fixed = null, eachTry = false) {
  const before = bucket.events.length ? read(bucket, now) : null
  const aim = fixed ?? before.aim[arm]
  const chance = solveChance(newAbility(level), aim)
  let solved = 0
  const tries = []
  for (let i = 0; i < SESSION_SIZE; i++) {
    const at = now + i * 60_000
    const view = eachTry ? solveChance(newAbility((i === 0 ? before : read(bucket, at)).rating.app), aim) : null
    const s = rng() < chance ? 1 : 0
    solved += s
    tries.push({ s, view })
    record(bucket, at, aim, s)
  }
  return { before, aim, chance, solved, tries }
}

// ---------------------------------------------------------------- what the last set alone reads as
const AT = 1000
const lastSetTable = [12, 11, 10, 9, 8].map((solved) => {
  const rating = lastSetRating(Array.from({ length: SESSION_SIZE }, (_, i) => ({ difficulty: AT, difficultyRd: ITEM_RD, score: i < solved ? 1 : 0 })))
  return { solved, above: rating - AT, nextAim: difficultyFor(newAbility(rating), TARGET) - AT }
})

// ---------------------------------------------------------------- every set solved
const GAP_DAYS = 14
function everySetSolved(arm, fixed, sets) {
  const bucket = bucketOf('fork')
  const aims = []
  for (let k = 0; k < sets; k++) aims.push(playSet(bucket, T0 + k * GAP_DAYS * DAY_MS, arm, 99_999, () => 0, fixed[k] ?? null).aim)
  return aims
}
const SOLVED_RUNS = [
  { name: 'a first set at 700', fixed: [700], sets: 8 },
  { name: 'three sets at 800, as serving once held a bucket near one difficulty', fixed: [800, 800, 800], sets: 10 },
].map((r) => ({ ...r, aims: Object.fromEntries(['app', 'climb'].map((arm) => [arm, everySetSolved(arm, r.fixed, r.sets)])) }))

// ---------------------------------------------------------------- one bucket, many random runs
const RUNS = 1000
const SETS = 30
const NEAR = 100
const LATE = 10
const EARLY = 12
const TOO_EASY = 0.9
const TOO_HARD = 0.6
function oneBucketOf({ level, fixed }, arm) {
  const goal = goalOf(level)
  const sum = { setsToGoal: 0, solved: 0, under60: 0, distance: 0, earlyEasy: 0, earlyHard: 0 }
  for (let run = 0; run < RUNS; run++) {
    const rng = mulberry32(7919 * (run + 1))
    const bucket = bucketOf('fork')
    let reached = null
    for (let k = 0; k < fixed.length + SETS; k++) {
      const set = playSet(bucket, T0 + k * GAP_DAYS * DAY_MS, arm, level, rng, fixed[k] ?? null)
      const aimed = k - fixed.length + 1
      if (aimed >= 1 && reached === null && set.aim >= goal - NEAR) reached = aimed
      if (aimed >= 1 && aimed <= EARLY) {
        if (set.chance > TOO_EASY) sum.earlyEasy++
        if (set.chance < TOO_HARD) sum.earlyHard++
      }
      if (aimed > SETS - LATE) {
        sum.solved += set.solved / SESSION_SIZE
        if (set.chance < TOO_HARD) sum.under60++
        sum.distance += Math.abs(set.aim - goal)
      }
    }
    sum.setsToGoal += reached ?? SETS
  }
  return { setsToGoal: sum.setsToGoal / RUNS, earlyEasy: sum.earlyEasy / RUNS, earlyHard: sum.earlyHard / RUNS, lateSolved: sum.solved / (RUNS * LATE), lateUnder60: sum.under60 / (RUNS * LATE), lateDistance: sum.distance / (RUNS * LATE) }
}
const CASES = [
  { name: 'far under his level: one set at 700', level: 1700, fixed: [700] },
  { name: 'far under it, held there: three sets at 800', level: 1500, fixed: [800, 800, 800] },
  { name: 'under it: one set at 900', level: 1400, fixed: [900] },
  { name: 'at his level: one set there', level: 1100, fixed: [goalOf(1100)] },
].map((c) => ({ ...c, goal: goalOf(c.level), ...Object.fromEntries(ARMS.map((arm) => [arm, oneBucketOf(c, arm)])) }))

// ---------------------------------------------------------------- a round on twelve buckets
// A made-up player with twelve buckets, two sets on record in each, aimed as
// the app aims. Then a round like round 3: 32 sets on 20 days, the bucket of
// each drawn at random, aimed as one arm aims. The climb's rule is read on the
// round's attempts as README.md words it: on the sittings the climb's rating
// is RAISED_BY above the view's, the view must under-predict him and the climb
// must not over-predict him. A round aimed from the view also gives the view's
// gap as round 2 reports it: the share solved minus the view's mean chance,
// each attempt scored on the record as it stood just before it.
const PLAYERS = 200
const BUCKETS = ['hangingPiece', 'defensiveMove', 'fork', 'discoveredAttack', 'mateIn1', 'mateIn2', 'backRankMate', 'planning', 'promotion', 'pawnEndgame', 'queenEndgame', 'op:caroKann']
const LEVELS = BUCKETS.map((_, i) => 1150 + 50 * i)
const ROUND_SETS = 32
const ROUND_DAYS = 20
const WORLDS = [
  { name: 'at his level', below: () => 0 },
  { name: 'half of them 400 points under it', below: (i) => (i % 2 === 0 ? 400 : 0) },
  { name: '400 points under it', below: () => 400 },
  { name: '800 points under it', below: () => 800 },
]
function playRound(world, arm, player) {
  const history = mulberry32(5000 + player)
  const pick = mulberry32(1000 + player)
  const play = mulberry32(9000 + player)
  const buckets = BUCKETS.map(bucketOf)
  buckets.forEach((b, i) => {
    playSet(b, T0 + (i / 24) * DAY_MS, 'app', LEVELS[i], history, goalOf(LEVELS[i]) - world.below(i))
    playSet(b, T0 + (14 + i / 24) * DAY_MS, 'app', LEVELS[i], history)
  })
  const start = T0 + 30 * DAY_MS
  const rows = []
  let solved = 0
  let under60 = 0
  let over90 = 0
  let slot = 0
  const tries = []
  for (let k = 0; k < ROUND_SETS; k++) {
    const i = Math.floor(pick() * BUCKETS.length)
    const dayIndex = Math.floor((k * ROUND_DAYS) / ROUND_SETS)
    // A day's sets are two hours apart, so each is a sitting of its own.
    slot = k > 0 && Math.floor(((k - 1) * ROUND_DAYS) / ROUND_SETS) === dayIndex ? slot + 1 : 0
    const set = playSet(buckets[i], start + dayIndex * 3 * DAY_MS + slot * 2 * 3_600_000, arm, LEVELS[i], play, null, arm === 'app')
    solved += set.solved
    if (set.chance < TOO_HARD) under60++
    if (set.chance > TOO_EASY) over90++
    if (arm === 'app') tries.push(...set.tries)
    const chance = (rating) => solveChance(newAbility(rating), set.aim)
    for (let j = 0; j < SESSION_SIZE; j++) {
      rows.push({ sitting: k, day: `day ${String(dayIndex).padStart(2, '0')}`, s: j < set.solved ? 1 : 0, raisedBy: set.before.raisedBy, view: chance(set.before.rating.app), climb: chance(set.before.rating.climb) })
    }
  }
  const end = start + ROUND_DAYS * 3 * DAY_MS
  const shortfall = buckets.map((b, i) => goalOf(LEVELS[i]) - read(b, end).aim[arm])
  return { rule: climbRule(rows), solved: solved / (ROUND_SETS * SESSION_SIZE), under60: under60 / ROUND_SETS, over90: over90 / ROUND_SETS, shortfall: mean(shortfall), distance: mean(shortfall.map(Math.abs)), viewGap: arm === 'app' ? mean(tries.map((t) => t.s - t.view)) : null }
}
/** The mean over the players, and the range the middle 95% of them fall in. */
function spread(xs) {
  const sorted = [...xs].sort((a, b) => a - b)
  const at = (q) => sorted[Math.round(q * (sorted.length - 1))]
  return { mean: mean(xs), middle: [at(0.025), at(0.975)] }
}
const rounds = WORLDS.map((world) => ({
  world: world.name,
  ...Object.fromEntries(
    ARMS.map((arm) => {
      const played = Array.from({ length: PLAYERS }, (_, p) => playRound(world, arm, p))
      const ran = played.filter((r) => r.rule.status === 'ran')
      return [
        arm,
        {
          solved: mean(played.map((r) => r.solved)),
          under60: mean(played.map((r) => r.under60)),
          over90: mean(played.map((r) => r.over90)),
          shortfall: mean(played.map((r) => r.shortfall)),
          distance: mean(played.map((r) => r.distance)),
          ...(arm === 'app' ? { viewGap: spread(played.map((r) => r.viewGap)) } : {}),
          rule: { raisedAttempts: mean(played.map((r) => r.rule.counts.attempts)), enough: ran.length / PLAYERS, viewUnder: ran.filter((r) => r.rule.viewUnder).length / PLAYERS, climbOver: ran.filter((r) => r.rule.climbOver).length / PLAYERS, kept: ran.filter((r) => r.rule.kept).length / PLAYERS },
        },
      ]
    }),
  ),
}))

// ---------------------------------------------------------------- the report
const round2 = JSON.parse(fs.readFileSync(join(resultsDir('learner-solve-chance'), 'round2.json'), 'utf8')).rules
const his = { app: round2.app, solved: round2.looks.solved, viewChance: round2.looks.view.meanChance, gap: round2.looks.view.gap }
const report = { app, target: TARGET, set: SESSION_SIZE, window: CLIMB_WINDOW, least: CLIMB_MIN, raisedBy: RAISED_BY, minRaised: MIN_RAISED, gapDays: GAP_DAYS, lastSetTable, solvedRuns: SOLVED_RUNS, oneBucket: { runs: RUNS, sets: SETS, near: NEAR, early: EARLY, late: LATE, tooEasy: TOO_EASY, tooHard: TOO_HARD, cases: CASES }, round: { players: PLAYERS, sets: ROUND_SETS, days: ROUND_DAYS, buckets: BUCKETS.length, ratings: [LEVELS[0], LEVELS.at(-1)], worlds: rounds }, round2: his }

const one = (x) => x.toFixed(1)
const signed = (x) => (x >= 0 ? '+' : '') + Math.round(x)
const steps = (aims) => aims.slice(1).map((a, i) => a - aims[i])
const md = [
  '# A faster climb after an aced set, simulated',
  '',
  `Written by climb-sim.mjs with the learner and serving code of app commit ${app}. Every player here is made up: he solves a puzzle with the chance the app's own \`solveChance\` gives his rating in the bucket, and no attempt of the real player is read. His level in a bucket is the difficulty he solves ${pct(TARGET)} of the time there, which is where the app means a set to start. A set is ${SESSION_SIZE} puzzles at the difficulty it aims at, and a bucket's sets are ${GAP_DAYS} days apart.`,
  '',
  'Four ways to aim a set:',
  '',
  '- **the view**: from the view of the bucket\'s own sets, as the app aims;',
  `- **the climb**: from the higher of the view's rating and the rating the last set gives by itself (the bucket's last ${CLIMB_WINDOW} first tries, once it has ${CLIMB_MIN});`,
  '- **the climb after a perfect set**: the same, only when every one of those first tries was solved;',
  '- **the climb while he has never missed**: the same, only while every first try the bucket has on record was solved.',
  '',
  '## What the last set alone reads as',
  '',
  `The rating that maximizes the likelihood of a set's ${SESSION_SIZE} attempts under the app's solve chance, with one solve and one miss added at their median difficulty, against the set's difficulty, and where a set aimed from it for a ${pct(TARGET)} chance would start.`,
  '',
  `| Solved of ${SESSION_SIZE} | Its own rating, above the set | The next set's aim, against this set |`,
  '|---:|---:|---:|',
  ...lastSetTable.map((r) => `| ${r.solved} | ${signed(r.above)} | ${signed(r.nextAim)} |`),
  '',
  '## Every set solved',
  '',
  `Each set's aim when every set is solved ${SESSION_SIZE} of ${SESSION_SIZE}. The sets before the first aimed one are at the difficulty named.`,
  '',
  ...SOLVED_RUNS.flatMap((r) => [
    `After ${r.name}:`,
    '',
    '| Aimed from | ' + r.aims.app.map((_, i) => `Set ${i + 1}`).join(' | ') + ' |',
    '|---|' + r.aims.app.map(() => '---:').join('|') + '|',
    `| The view (the app) | ${r.aims.app.join(' | ')} |`,
    `| The climb | ${r.aims.climb.join(' | ')} |`,
    '',
    `Set to set, from the last one at the difficulty named, the app's steps are ${steps(r.aims.app.slice(r.fixed.length - 1)).join(', ')} points and the climb's ${steps(r.aims.climb.slice(r.fixed.length - 1)).join(', ')}.`,
    '',
  ]),
  '## Reaching a level, and the cost once there',
  '',
  `One bucket, ${RUNS} random runs of ${SETS} aimed sets after the sets named. "Sets to his level" counts the aimed sets until one starts within ${NEAR} points of his level (${SETS} when none does). The next two columns count, of the first ${EARLY} aimed sets, those aimed where his chance is over ${pct(TOO_EASY)} (too easy) and under ${pct(TOO_HARD)} (too hard). The last three are the last ${LATE} sets, long after every way of aiming has arrived: the share of puzzles solved, the share of sets aimed where his chance is under ${pct(TOO_HARD)}, and the mean distance of a set's aim from his level.`,
  '',
  `| Player | Aimed from | Sets to his level | Too easy, of the first ${EARLY} | Too hard, of the first ${EARLY} | Solved, late | Sets too hard, late | Distance from his level, late |`,
  '|---|---|---:|---:|---:|---:|---:|---:|',
  ...CASES.flatMap((c) => ARMS.map((arm) => `| Rated ${c.level} (level ${c.goal}), ${c.name} | ${ARM_NAME[arm]} | ${one(c[arm].setsToGoal)} | ${c[arm].earlyEasy.toFixed(2)} | ${c[arm].earlyHard.toFixed(2)} | ${pct(c[arm].lateSolved)} | ${pct(c[arm].lateUnder60)} | ${Math.round(c[arm].lateDistance)} |`)),
  '',
  '## A round on twelve buckets',
  '',
  `${PLAYERS} made-up players, each with ${BUCKETS.length} buckets rated from ${LEVELS[0]} to ${LEVELS.at(-1)}. Each bucket has two sets on record: a first one at the difficulty the row names against the bucket's level, and a second aimed as the app aims. Then a round like round 3: ${ROUND_SETS} sets on ${ROUND_DAYS} days, the bucket of each drawn at random. The last two columns are over the twelve buckets at the round's end: how far under his level the next set would aim, on average, and the mean distance either way.`,
  '',
  `| The buckets began | The round is aimed from | Solved in the round | Sets too easy (over ${pct(TOO_EASY)}) | Sets too hard (under ${pct(TOO_HARD)}) | The next aim, under his level | Its distance from his level |`,
  '|---|---|---:|---:|---:|---:|---:|',
  ...rounds.flatMap((r) => ARMS.map((arm) => `| ${r.world} | ${ARM_NAME[arm]} | ${pct(r[arm].solved)} | ${pct(r[arm].over90)} | ${pct(r[arm].under60)} | ${signed(r[arm].shortfall)} | ${Math.round(r[arm].distance)} |`)),
  '',
  '## Which of these rounds round 2 looks like',
  '',
  `The view's gap, as round 2 reports it: the share solved minus the view's mean chance, each attempt scored on the record as it stood just before it. Here on the rounds aimed from the view, as the app aims: the mean over the ${PLAYERS} players and the range the middle 95% of them fall in. Round 2 itself (results/round2.json, app commit ${his.app}): he solved ${pct(his.solved)} where the view gave him ${pct(his.viewChance)}, a gap of ${pp(his.gap.value)} points (95% interval ${iv(his.gap.interval)}).`,
  '',
  '| The buckets began | The view\'s gap in the round | The middle 95% of players |',
  '|---|---:|---:|',
  ...rounds.map((r) => `| ${r.world} | ${pp(r.app.viewGap.mean)} | ${iv(r.app.viewGap.middle)} |`),
  '',
  '## What a rule on such a round could tell',
  '',
  `The climb's rule, read on the same rounds with the app unchanged (every set aimed from the view): on the sittings where the climb's rating is at least ${RAISED_BY} points above the view's, the view must under-predict him and the climb must not over-predict him, each by its 95% interval over the days, once those sittings hold ${MIN_RAISED.attempts} attempts on ${MIN_RAISED.days} days. The shares are of all ${PLAYERS} players.`,
  '',
  '| The buckets began | Attempts in raised sittings | Enough to read | View under-predicts | Climb over-predicts | Kept |',
  '|---|---:|---:|---:|---:|---:|',
  ...rounds.map((r) => `| ${r.world} | ${one(r.app.rule.raisedAttempts)} | ${pct(r.app.rule.enough)} | ${pct(r.app.rule.viewUnder)} | ${pct(r.app.rule.climbOver)} | ${pct(r.app.rule.kept)} |`),
  '',
].join('\n')

const out = resultsDir('learner-solve-chance')
fs.writeFileSync(join(out, 'climb-sim.json'), JSON.stringify(report, null, 1) + '\n')
fs.writeFileSync(join(out, 'climb-sim.md'), md)
console.log(md)
