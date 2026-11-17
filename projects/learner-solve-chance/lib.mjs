// What the rounds share (README.md fixes all of it): the replay of the app's
// learner over a profile, one row per scored puzzle attempt with the solve
// chance each estimate gave just before it; the rules' arithmetic over those
// rows; and the tables both reports print. The learner is the one CHESS_DIR
// names, so a round reads a profile with the code of the commit it is run on.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { join } from 'node:path'
import { chess, CHESS_DIR, LAB_DIR, privateDir } from '../../bridge/lib/chess.mjs'

const { LEARNER_CONTENT } = await chess('src/data/learnerContent.ts')
const { catalogue } = await chess('src/services/learner/competencies.ts')
const { observations, byCompetency } = await chess('src/services/learner/evidence.ts')
const { foldAbilities } = await chess('src/services/learner/ability.ts')
const { channelOf } = await chess('src/services/learner/channels.ts')
const { solveChance, serveTarget, servingAbility, MIN_ATTEMPTS, LADDER_START, SESSION_SIZE } = await chess('src/services/learner/index.ts')
const { ITEM_RD } = await chess('src/services/learner/glicko.ts')
const { ptDayKey } = await chess('src/core/time/index.ts')

// ---------------------------------------------------------------- round 1's profile
/** The commit round 1 measured: its profile is round 1's record, and its last attempt is where round 2's begin. */
export const ROUND1 = 'd8b771238c11c84d0c4b2a8010bb75f5f756b8d9'

/** The folder holding the profile at the commit round 1 measured (progress/profile.json under it), fetched once. */
export function round1Root() {
  const pin = JSON.parse(fs.readFileSync(join(LAB_DIR, 'bridge', 'chess.json'), 'utf8'))
  const root = join(privateDir('learner-solve-chance'), 'round1')
  const file = join(root, 'progress', 'profile.json')
  if (!fs.existsSync(file)) {
    const git = join(LAB_DIR, '.cache', 'chess-round1')
    fs.rmSync(git, { recursive: true, force: true })
    execFileSync('git', ['init', '-q', git])
    execFileSync('git', ['-C', git, 'fetch', '-q', '--depth', '1', pin.repo, ROUND1])
    fs.mkdirSync(join(root, 'progress'), { recursive: true })
    fs.writeFileSync(file, execFileSync('git', ['-C', git, 'show', 'FETCH_HEAD:progress/profile.json']))
    fs.rmSync(git, { recursive: true, force: true })
  }
  return root
}

const isAttempt = (e) => e.type === 'attempt'
/** The time of the last attempt a profile holds, in its legacy log or its events. */
export const lastAttemptAt = (profile) => Math.max(...(profile.attempts ?? []).map((a) => a.at), ...(profile.events ?? []).filter(isAttempt).map((e) => e.at))

// ---------------------------------------------------------------- the replay
export const cat = catalogue(LEARNER_CONTENT.buckets)
export const endgameIds = new Set(LEARNER_CONTENT.endgameDrills.map((d) => d.id))

export const isPuzzle = (o) => o.from === 'log' || (o.item ?? '').startsWith('puzzle:')
export const rated = (o) => channelOf(o.channel) !== null && o.first !== false
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))

/** The profile as it stood just before `t`, with the seed the whole record gives each skill. */
export function before(profile, t, seeds) {
  const cut = { ...profile, attempts: (profile.attempts ?? []).filter((a) => a.at < t), events: (profile.events ?? []).filter((e) => e.at < t) }
  if (!seeds) return cut
  // The stored totals count every logged attempt too: keep them at the seed
  // plus what is logged before t, so the seed is the same at every moment and
  // nothing after t reaches it.
  const obs = observations(cut, cat)
  const stats = {}
  for (const [b, st] of Object.entries(profile.puzzleStats ?? {})) {
    const counted = obs.filter((o) => o.competency === b && isPuzzle(o))
    const seed = seeds.get(b) ?? { attempts: 0, correct: 0 }
    stats[b] = { ...st, attempts: seed.attempts + counted.length, correct: seed.correct + counted.filter((o) => o.score >= 1).length }
  }
  return { ...cut, puzzleStats: stats }
}

/**
 * One row per scored puzzle attempt of a profile, in time order: an attempt
 * is scored when its skill already has a rated attempt in the same channel,
 * and its row holds the solve chance the headline rating and the channel's
 * view gave on the record before it. `withSeed` folds the stored totals as
 * the app does; `logItem` names the puzzle of a legacy log attempt, which
 * carries none; `wanted` limits the rows to the attempts a round scores.
 */
export function replay(name, profile, withSeed, { logItem = () => null, wanted = () => true } = {}) {
  const all = observations(profile, cat)
  let seeds = null
  if (withSeed) {
    const full = foldAbilities({ profile, catalogue: cat, observations: byCompetency(all), endgameIds, now: profile.updatedAt ?? 0 })
    seeds = new Map([...full].filter(([, st]) => st.seed).map(([id, st]) => [id, { attempts: st.seed.attempts, correct: st.seed.correct }]))
  }
  const rows = []
  const earlier = new Map()
  for (const o of all) {
    if (!rated(o)) continue
    const key = `${o.competency}|${channelOf(o.channel)}`
    const prior = earlier.get(key) ?? { n: 0, solved: 0 }
    if (isPuzzle(o) && prior.n > 0 && wanted(o)) {
      const t = o.at
      const cut = before(profile, t, seeds)
      const states = foldAbilities({ profile: cut, catalogue: cat, observations: byCompetency(observations(cut, cat)), endgameIds, now: t })
      const st = states.get(o.competency)
      if (!st) throw new Error(`${name}: no state for ${o.competency} at ${t}`)
      if (seeds) {
        const want = seeds.get(o.competency) ?? null
        const got = st.seed ? { attempts: st.seed.attempts, correct: st.seed.correct } : null
        if (JSON.stringify(want) !== JSON.stringify(got)) throw new Error(`${name}: the seed moved for ${o.competency} at ${t}`)
      }
      const view = st.channels[channelOf(o.channel)]
      if (!view) throw new Error(`${name}: no ${channelOf(o.channel)} view for ${o.competency} at ${t}`)
      rows.push({
        record: name,
        item: o.item ? o.item.slice('puzzle:'.length) : logItem(o),
        day: ptDayKey(t),
        at: t,
        bucket: o.competency,
        channel: channelOf(o.channel),
        difficulty: o.difficulty,
        rd: o.difficultyRd,
        first: o.first,
        s: o.score >= 0.5 ? 1 : 0,
        head: solveChance(st.ability, o.difficulty, o.difficultyRd),
        view: solveChance({ rating: view.rating, rd: view.rd, volatility: st.ability.volatility }, o.difficulty, o.difficultyRd),
        run: clamp(prior.solved / prior.n, 0.01, 0.99),
        headRating: st.ability.rating,
        headRd: st.ability.rd,
        viewRating: view.rating,
        viewRd: view.rd,
        viewN: view.n,
      })
    }
    earlier.set(key, { n: prior.n + 1, solved: prior.solved + (o.score >= 0.5 ? 1 : 0) })
  }
  return rows
}

/** Per bucket of the bank: the difficulty a set would aim at now from each estimate, and the one the app aims from. */
export function aims(learner, bank, now) {
  return learner
    .skills(now)
    .filter((s) => bank[s.id])
    .map((s) => {
      const pool = bank[s.id].map((p) => ({ id: p.id, rating: p.rating }))
      const phase = s.attempts < MIN_ATTEMPTS ? 'new' : 'core'
      const view = s.channels.themed
      const serving = servingAbility(s, 'themed')
      return {
        bucket: s.id,
        phase,
        head: { rating: s.ability.rating, rd: s.ability.rd, target: serveTarget(s.ability, phase, pool, LADDER_START) },
        view: view ? { rating: view.rating, rd: view.rd, n: view.n, target: serveTarget({ ...s.ability, rating: view.rating, rd: view.rd }, phase, pool, LADDER_START) } : null,
        app: {
          from: view ? 'view' : s.seed?.channel === 'themed' ? 'totals' : 'headline',
          rating: serving.rating,
          rd: serving.rd,
          target: serveTarget(serving, phase, pool, LADDER_START),
        },
        bankMax: Math.max(...pool.map((p) => p.rating)),
        bankSize: pool.length,
      }
    })
}

// ---------------------------------------------------------------- the rules' arithmetic
export const SEED = 7
export const B = 1000
const EPS = 1e-6
const BINS = [0.5, 0.6, 0.7, 0.8, 0.9]
const SHIFTS = []
for (let d = -500; d <= 500; d += 5) SHIFTS.push(d)

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const quantile = (sorted, q) => sorted[Math.round(q * (sorted.length - 1))]
// As the learner's self-check scores a prediction.
const ll = (p, s) => -(s * Math.log(Math.max(EPS, p)) + (1 - s) * Math.log(Math.max(EPS, 1 - p)))
const brier = (p, s) => (p - s) ** 2
export const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length

/** Rows grouped by day, days in time order. */
export function byDay(set) {
  const m = new Map()
  for (const r of set) m.set(r.day, [...(m.get(r.day) ?? []), r])
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, rs]) => ({ day, rows: rs }))
}

/** The mean of f over the rows, and its 95% interval over bootstrap draws of the days. */
function meanInterval(days, f) {
  const parts = days.map((d) => ({ sum: d.rows.reduce((a, r) => a + f(r), 0), n: d.rows.length }))
  const value = parts.reduce((a, p) => a + p.sum, 0) / parts.reduce((a, p) => a + p.n, 0)
  const rng = mulberry32(SEED)
  const draws = []
  for (let b = 0; b < B; b++) {
    let s = 0, n = 0
    for (let t = 0; t < parts.length; t++) { const p = parts[Math.floor(rng() * parts.length)]; s += p.sum; n += p.n }
    draws.push(s / n)
  }
  draws.sort((a, b) => a - b)
  return { value, interval: [quantile(draws, 0.025), quantile(draws, 0.975)] }
}

/** Share solved minus mean chance. */
const gapOf = (days, key) => meanInterval(days, (r) => r.s - r[key])
/** Mean log loss of `a` minus that of `b`. */
const llDiff = (days, a, b) => meanInterval(days, (r) => ll(r[a], r.s) - ll(r[b], r.s))
export const KEYS = ['head', 'view', 'run']
const scores = (set) => Object.fromEntries(KEYS.map((k) => [k, { brier: mean(set.map((r) => brier(r[k], r.s))), logLoss: mean(set.map((r) => ll(r[k], r.s))) }]))

function reliability(set, key) {
  const edges = [0, ...BINS, 1.0000001]
  return edges.slice(0, -1).map((lo, i) => {
    const inBin = set.filter((r) => r[key] >= lo && r[key] < edges[i + 1])
    return { from: lo, to: Math.min(1, edges[i + 1]), n: inBin.length, chance: inBin.length ? mean(inBin.map((r) => r[key])) : null, solved: inBin.length ? mean(inBin.map((r) => r.s)) : null }
  })
}

/** An estimate's chance for an attempt with `sh` rating points taken off the item. */
const shifted = (r, ratingKey, sh) => solveChance({ rating: r[ratingKey], rd: 0, volatility: 0 }, r.difficulty - sh, r.rd)
/** The grid's shift with the highest summed log-likelihood; a tie goes to the smaller shift. */
const argmax = (sum) => {
  let bi = 0
  sum.forEach((v, i) => { if (v > sum[bi] || (v === sum[bi] && Math.abs(SHIFTS[i]) < Math.abs(SHIFTS[bi]))) bi = i })
  return SHIFTS[bi]
}

/** The shift taken off every item's rating that best fits an estimate's chances, and its interval over the days. */
function bestShift(days, ratingKey) {
  const perDay = days.map((d) =>
    SHIFTS.map((sh) => d.rows.reduce((a, r) => a - ll(shifted(r, ratingKey, sh), r.s), 0)),
  )
  const rng = mulberry32(SEED)
  const draws = []
  for (let b = 0; b < B; b++) {
    const sum = SHIFTS.map(() => 0)
    for (let t = 0; t < perDay.length; t++) { const d = perDay[Math.floor(rng() * perDay.length)]; for (let i = 0; i < sum.length; i++) sum[i] += d[i] }
    draws.push(argmax(sum))
  }
  draws.sort((a, b) => a - b)
  return { shift: argmax(SHIFTS.map((_, i) => perDay.reduce((a, d) => a + d[i], 0))), interval: [quantile(draws, 0.025), quantile(draws, 0.975)], edge: [SHIFTS[0], SHIFTS[SHIFTS.length - 1]] }
}

function perBucket(set) {
  return [...new Set(set.map((r) => r.bucket))].sort().map((b) => {
    const rs = set.filter((r) => r.bucket === b)
    return { bucket: b, n: rs.length, solved: mean(rs.map((r) => r.s)), head: mean(rs.map((r) => r.head)), view: mean(rs.map((r) => r.view)), difficulty: mean(rs.map((r) => r.difficulty)) }
  })
}

/** Everything the README reports beside rules 1 and 2, for one record. */
export function looks(set) {
  const days = byDay(set)
  return {
    attempts: set.length,
    days: days.length,
    dayRange: [days[0].day, days[days.length - 1].day],
    solved: mean(set.map((r) => r.s)),
    misses: set.filter((r) => r.s === 0).length,
    headline: { meanChance: mean(set.map((r) => r.head)), gap: gapOf(days, 'head') },
    view: { meanChance: mean(set.map((r) => r.view)), gap: gapOf(days, 'view') },
    run: { meanChance: mean(set.map((r) => r.run)) },
    scores: scores(set),
    candidate: llDiff(days, 'view', 'head'),
    reliability: { head: reliability(set, 'head'), view: reliability(set, 'view') },
    buckets: perBucket(set),
    shift: { head: bestShift(days, 'headRating'), view: bestShift(days, 'viewRating') },
  }
}

/** The days alternate between two halves, the first day in the first half. */
export const halvesOf = (days) => [days.filter((_, i) => i % 2 === 0), days.filter((_, i) => i % 2 === 1)]

/** Rule 1: the share solved minus the headline's mean solve chance, judged by its interval over the days. */
export function rule1(days) {
  const gap = gapOf(days, 'head')
  return { gap, verdict: gap.interval[0] > 0 ? 'under-predicts' : gap.interval[1] < 0 ? 'over-predicts' : 'calibrated' }
}

/** Rule 2: on each half, the view's mean log loss against the headline's; both halves must pass. */
export function rule2(days) {
  const halves = halvesOf(days).map((h) => {
    const rs = h.flatMap((d) => d.rows)
    return { days: h.length, attempts: rs.length, head: mean(rs.map((r) => ll(r.head, r.s))), view: mean(rs.map((r) => ll(r.view, r.s))), ...llDiff(h, 'view', 'head') }
  })
  return { halves, passes: halves.every((t) => t.value < 0 && t.interval[1] < 0) }
}

// ---------------------------------------------------------------- rule 3: a target by depth
/** Rule 3 runs once each level holds this many scored attempts. */
export const MIN_PER_LEVEL = 30

/** His moves in a puzzle: half its move list in the bank, which opens with the opponent's move and alternates. */
export function depthOf(moves) {
  const n = moves.trim().split(/\s+/).length
  if (n % 2 !== 0) throw new Error(`a move list of odd length: ${moves}`)
  return n / 2
}
/** Level one is a one-move puzzle; level two, two moves or more. */
export const levelOf = (depth) => (depth === 1 ? 1 : 2)

/**
 * f over the attempts of each of B bootstrap draws of the days, as a 95%
 * interval around f over all of them. A draw on which f is null (it holds no
 * attempt of a kind f needs) is drawn again.
 */
function drawInterval(days, f) {
  const value = f(days.flatMap((d) => d.rows))
  if (value === null) return null
  const rng = mulberry32(SEED)
  const draws = []
  let again = 0
  while (draws.length < B) {
    const rows = []
    for (let t = 0; t < days.length; t++) rows.push(...days[Math.floor(rng() * days.length)].rows)
    const v = f(rows)
    if (v === null) {
      if (++again > 1000 * B) throw new Error('the draws almost never hold the attempts the statistic needs')
      continue
    }
    draws.push(v)
  }
  draws.sort((a, b) => a - b)
  return { value, interval: [quantile(draws, 0.025), quantile(draws, 0.975)], drawnAgain: again }
}

const meanOf = (rows, f) => (rows.length ? mean(rows.map(f)) : null)
/** The share solved minus the mean chance over the attempts `pick` keeps, or null where it keeps none. */
const gapIn = (pick, key) => (rows) => meanOf(rows.filter(pick), (r) => r.s - r[key])
/** Rule 3's statistic: level one's share solved minus mean chance, less level two's. */
const depthStat = (key) => (rows) => {
  const one = gapIn((r) => r.level === 1, key)(rows)
  const two = gapIn((r) => r.level === 2, key)(rows)
  return one === null || two === null ? null : one - two
}

/** What the README reports of a group of attempts beside rule 3. */
function depthGroup(days, pick) {
  const rows = days.flatMap((d) => d.rows).filter(pick)
  if (rows.length === 0) return { attempts: 0, days: 0 }
  return {
    attempts: rows.length,
    days: byDay(rows).length,
    misses: rows.filter((r) => r.s === 0).length,
    solved: drawInterval(days, (rs) => meanOf(rs.filter(pick), (r) => r.s)),
    head: { meanChance: mean(rows.map((r) => r.head)), gap: drawInterval(days, gapIn(pick, 'head')) },
    view: { meanChance: mean(rows.map((r) => r.view)), gap: drawInterval(days, gapIn(pick, 'view')) },
  }
}

/** The shift of the grid that maximizes the likelihood of the rows' results under an estimate's chances. */
const fitShift = (rows, ratingKey) => argmax(SHIFTS.map((sh) => rows.reduce((a, r) => a - ll(shifted(r, ratingKey, sh), r.s), 0)))

/**
 * Rule 3 over the days of round 2's scored attempts (each row with its
 * puzzle's `depth` and `level`, null where the bank no longer holds it), on
 * the chance of the estimate rule 2 leaves serving: 'view' or 'head'.
 */
export function rule3(scoredDays, serving) {
  if (serving !== 'view' && serving !== 'head') throw new Error(`rule 3 reads the view or the headline, not ${serving}`)
  const all = scoredDays.flatMap((d) => d.rows)
  const rows = all.filter((r) => r.level !== null)
  const count = (rs) => ({ attempts: rs.length, days: byDay(rs).length })
  const counts = { one: count(rows.filter((r) => r.level === 1)), two: count(rows.filter((r) => r.level === 2)), notInBank: all.length - rows.length, needed: MIN_PER_LEVEL }
  if (counts.one.attempts < MIN_PER_LEVEL || counts.two.attempts < MIN_PER_LEVEL) return { status: 'not enough data', serving, counts }

  // The draws are of the days that hold rule 3's attempts; the halves are
  // rule 2's, over every day with a scored attempt.
  const inBank = (d) => ({ day: d.day, rows: d.rows.filter((r) => r.level !== null) })
  const days = scoredDays.map(inBank).filter((d) => d.rows.length > 0)
  const halves = halvesOf(scoredDays).map((h) => h.map(inBank).filter((d) => d.rows.length > 0))
  const statistic = drawInterval(days, depthStat(serving))
  const verdict = statistic.interval[0] > 0 ? 'more often at one move' : statistic.interval[1] < 0 ? 'less often at one move' : 'no difference shows'

  let term = null
  if (verdict !== 'no difference shows') {
    const ratingKey = `${serving}Rating`
    const first = halves[0].flatMap((d) => d.rows)
    const firstAt = (level) => first.filter((r) => r.level === level)
    if (firstAt(1).length === 0 || firstAt(2).length === 0) {
      term = { fitted: false, kept: false, firstHalf: { one: firstAt(1).length, two: firstAt(2).length } }
    } else {
      const one = fitShift(first, ratingKey)
      const byLevel = { 1: fitShift(firstAt(1), ratingKey), 2: fitShift(firstAt(2), ratingKey) }
      const tests = halves.map((h) => {
        const rs = h.flatMap((d) => d.rows)
        const depth = (r) => ll(shifted(r, ratingKey, byLevel[r.level]), r.s)
        const single = (r) => ll(shifted(r, ratingKey, one), r.s)
        return { days: h.length, attempts: rs.length, depth: meanOf(rs, depth), single: meanOf(rs, single), ...(h.length ? meanInterval(h, (r) => depth(r) - single(r)) : { value: null, interval: null }) }
      })
      term = {
        fitted: true,
        firstHalf: { one: firstAt(1).length, two: firstAt(2).length },
        oneShift: one,
        levelShifts: { one: byLevel[1], two: byLevel[2] },
        difference: byLevel[1] - byLevel[2],
        halves: tests,
        kept: tests.every((t) => t.value !== null && t.value < 0 && t.interval[1] < 0),
      }
    }
  }

  const bucketsOf = (level) => new Set(rows.filter((r) => r.level === level).map((r) => r.bucket))
  const both = [...bucketsOf(1)].filter((b) => bucketsOf(2).has(b)).sort()
  const inBoth = days.map((d) => ({ day: d.day, rows: d.rows.filter((r) => both.includes(r.bucket)) })).filter((d) => d.rows.length > 0)
  const other = serving === 'view' ? 'head' : 'view'
  return {
    status: 'ran',
    serving,
    counts,
    statistic,
    verdict,
    term,
    // Beside the test, deciding nothing: the statistic on the estimate rule 2 did not leave serving.
    otherEstimate: { estimate: other, statistic: drawInterval(days, depthStat(other)) },
    groups: {
      one: depthGroup(days, (r) => r.level === 1),
      two: depthGroup(days, (r) => r.level === 2),
      twoOrThree: depthGroup(days, (r) => r.depth === 2 || r.depth === 3),
      fourOrMore: depthGroup(days, (r) => r.depth >= 4),
    },
    bothLevels: {
      buckets: both,
      one: inBoth.flatMap((d) => d.rows).filter((r) => r.level === 1).length,
      two: inBoth.flatMap((d) => d.rows).filter((r) => r.level === 2).length,
      statistic: both.length ? drawInterval(inBoth, depthStat(serving)) : null,
    },
  }
}

// ---------------------------------------------------------------- the climb
// README.md, "A faster climb after an aced set": a set aimed from the higher
// of the view's rating and the rating the bucket's last set gives by itself.

/** The last set is the bucket's last attempts of a set's size, once it has left its new phase: both are the app's constants. */
export const CLIMB_WINDOW = SESSION_SIZE
export const CLIMB_MIN = MIN_ATTEMPTS
/** A sitting is raised when the climb's rating is this far above the view's: the gap at which the app's skill map calls a bucket stalled. */
export const RAISED_BY = 100
/** A rule on the raised sittings would read once they hold this much. */
export const MIN_RAISED = { attempts: 30, days: 5 }

/** Stops unless the app at CHESS_DIR still holds the constant the climb borrows from it and cannot import. */
export function checkBorrowedConstants() {
  const skillMap = fs.readFileSync(join(CHESS_DIR, 'src/services/learner/skillMap.ts'), 'utf8')
  if (!new RegExp(`const STALL_GAP = ${RAISED_BY}\\b`).test(skillMap)) throw new Error(`the app's stalled gap is no longer ${RAISED_BY} points`)
}

/**
 * The rating a bucket's last set gives by itself: the one that maximizes the
 * likelihood of its last CLIMB_WINDOW attempts under the app's solve chance,
 * with one solve and one miss added at their median difficulty. Null under
 * CLIMB_MIN attempts. An attempt is { difficulty, difficultyRd, score }, as
 * the app's observations are. With `perfect`, null too unless every one of
 * those attempts was solved.
 */
export function lastSetRating(attempts, { perfect = false } = {}) {
  if (attempts.length < CLIMB_MIN) return null
  const last = attempts.slice(-CLIMB_WINDOW)
  if (perfect && last.some((a) => a.score < 1)) return null
  const sorted = last.map((a) => a.difficulty).sort((a, b) => a - b)
  // The app's median: the upper of the two middle values.
  const middle = sorted[Math.floor(sorted.length / 2)]
  const terms = [...last.map((a) => ({ d: a.difficulty, rd: a.difficultyRd, s: clamp(a.score, 0, 1) })), { d: middle, rd: ITEM_RD, s: 1 }, { d: middle, rd: ITEM_RD, s: 0 }]
  const logLikelihood = (rating) =>
    terms.reduce((sum, t) => {
      const p = solveChance({ rating, rd: 0, volatility: 0 }, t.d, t.rd)
      return sum + t.s * Math.log(p) + (1 - t.s) * Math.log(1 - p)
    }, 0)
  // The log-likelihood has one peak, so the search closes on it from both sides.
  let lo = sorted[0] - 2000
  let hi = sorted[sorted.length - 1] + 2000
  for (let i = 0; i < 80; i++) {
    const a = lo + (hi - lo) / 3
    const b = hi - (hi - lo) / 3
    if (logLikelihood(a) < logLikelihood(b)) lo = a
    else hi = b
  }
  return Math.round((lo + hi) / 2)
}

/** The climb's rating: the higher of the view's and the last set's own. */
export const climbRating = (viewRating, lastSet) => (lastSet === null ? viewRating : Math.max(viewRating, lastSet))

/**
 * A rule a round could put to the climb, over attempts that each carry the
 * solve chance the view and the climb gave as their sitting was aimed (`view`,
 * `climb`) and how far the climb's rating stood above the view's (`raisedBy`):
 * on the raised sittings, the view must under-predict him and the climb must
 * not over-predict him, each by its 95% interval over the days.
 */
export function climbRule(rows) {
  const raised = rows.filter((r) => r.raisedBy >= RAISED_BY)
  const days = byDay(raised)
  const counts = { attempts: raised.length, sittings: new Set(raised.map((r) => r.sitting)).size, days: days.length, needed: MIN_RAISED }
  if (raised.length < MIN_RAISED.attempts || days.length < MIN_RAISED.days) return { status: 'not enough data', counts }
  const view = gapOf(days, 'view')
  const climb = gapOf(days, 'climb')
  const viewUnder = view.interval[0] > 0
  const climbOver = climb.interval[1] < 0
  return { status: 'ran', counts, solved: mean(raised.map((r) => r.s)), view, climb, viewUnder, climbOver, kept: viewUnder && !climbOver }
}

// ---------------------------------------------------------------- the reports' formats
export const f3 = (x) => (x === null ? 'n/a' : x.toFixed(3))
export const pct = (x) => (x === null ? 'n/a' : (100 * x).toFixed(1) + '%')
export const pp = (x) => (x >= 0 ? '+' : '') + (100 * x).toFixed(1)
export const iv = (i, f = pp) => `${f(i[0])} to ${f(i[1])}`
export const shiftText = (s) => `${s.shift} (${s.interval[0]} to ${s.interval[1]}${s.interval.includes(s.edge[1]) || s.interval.includes(s.edge[0]) ? ', at the grid\'s edge' : ''})`
export const lookTables = (L) => [
  '| Estimate | Mean chance | Brier | Log loss |',
  '|---|---:|---:|---:|',
  ...KEYS.map((k) => `| ${{ head: 'Headline rating', view: 'View of the channel', run: 'Running rate' }[k]} | ${pct(L[k === 'head' ? 'headline' : k].meanChance)} | ${f3(L.scores[k].brier)} | ${f3(L.scores[k].logLoss)} |`),
  '',
  '| Solve chance | Headline: attempts | mean chance | solved | View: attempts | mean chance | solved |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...L.reliability.head.map((b, i) => {
    const v = L.reliability.view[i]
    return `| ${b.from.toFixed(1)} to ${b.to.toFixed(1)} | ${b.n} | ${pct(b.chance)} | ${pct(b.solved)} | ${v.n} | ${pct(v.chance)} | ${pct(v.solved)} |`
  }),
  '',
  '| Bucket | Scored | Mean rating | Solved | Headline\'s chance | View\'s chance |',
  '|---|---:|---:|---:|---:|---:|',
  ...L.buckets.map((b) => `| ${b.bucket} | ${b.n} | ${Math.round(b.difficulty)} | ${pct(b.solved)} | ${pct(b.head)} | ${pct(b.view)} |`),
]
/** The table of what each estimate would aim a set at. */
export const aimTable = (today) => [
  '| Bucket | Phase | Headline | Its target | Themed view | Its target | The app aims from | Its target | Hardest in the bank |',
  '|---|---|---:|---:|---:|---:|---|---:|---:|',
  ...today.map((t) => `| ${t.bucket} | ${t.phase} | ${t.head.rating} ± ${t.head.rd} | ${t.head.target} | ${t.view ? `${t.view.rating} ± ${t.view.rd} (n=${t.view.n})` : 'none'} | ${t.view ? t.view.target : 'n/a'} | ${t.app.from}, ${t.app.rating} ± ${t.app.rd} | ${t.app.target} | ${t.bankMax} |`),
]

// ---------------------------------------------------------------- round 2's report
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : String(xs[0]))
const ivText = (x, f = pp) => `${f(x.value)} (${iv(x.interval, f)})`
const band = (b) => `${Math.round(100 * b[0])} to ${Math.round(100 * b[1])}%`
const SERVING = { view: 'the view of his themed sets', head: 'the headline rating' }
const levelCounts = (c) =>
  `${plural(c.one.attempts, 'one-move attempt')} on ${plural(c.one.days, 'day')} and ${c.two.attempts} of two moves or more on ${plural(c.two.days, 'day')}${c.notInBank ? `, with ${c.notInBank} left out because the bank no longer holds their puzzle` : ''}`
const drawnAgain = (x) => (x.drawnAgain ? `; ${plural(x.drawnAgain, 'draw')} that held no attempt at one of the levels ${x.drawnAgain === 1 ? 'was' : 'were'} drawn again` : '')
const halfText = (h, i, a, b) => `half ${i + 1} (${plural(h.days, 'day')}, ${h.attempts} attempts) ${f3(h[a])} against ${f3(h[b])}, a difference of ${f3(h.value)} (95% interval ${h.interval ? `${f3(h.interval[0])} to ${f3(h.interval[1])}` : 'n/a'})`

function rule3Markdown(r3) {
  const serving = SERVING[r3.serving]
  if (r3.status === 'not enough data') {
    return [
      `**Not enough data.** Rule 3 needs ${r3.counts.needed} scored attempts at each level, and the profile at app commit ${r3.app} (synced ${r3.profileSyncedOn}) holds ${levelCounts(r3.counts)}. It is checked again at each later check-in, unchanged, on every round 2 attempt recorded by then, with the chance from ${serving}, the estimate rule 2 leaves serving. Nothing of the attempts' results by depth is reported until it runs.`,
      '',
    ]
  }
  const g = r3.groups
  const line = (x) => `${pct(x.solved.value)} of ${x.attempts} against a mean chance of ${pct(x[r3.serving].meanChance)}, a gap of ${pp(x[r3.serving].gap.value)} points`
  const verdict = {
    'no difference shows': 'no difference shows: within the interval, the chance is as good at one level as at the other, and a set aimed by depth would land as near its targets as a set aimed at one target does now, with no change to the chance',
    'more often at one move': 'he solves one-move puzzles more often than the chance says, against longer ones: the chance misses by depth, and a target per depth would not land where it says',
    'less often at one move': 'he solves one-move puzzles less often than the chance says, against longer ones: the chance misses by depth, and a target per depth would not land where it says',
  }[r3.verdict]
  const out = [
    `App commit ${r3.app}, its profile (synced ${r3.profileSyncedOn}) read with that commit's own learner: ${levelCounts(r3.counts)}, each with the chance from ${serving}, the estimate rule 2 leaves serving.`,
    '',
    `**The test, as computed.** At one move he solved ${line(g.one)}; at two moves or more, ${line(g.two)}. The statistic, level one's gap minus level two's, is ${pp(r3.statistic.value)} points (95% interval ${iv(r3.statistic.interval)}${drawnAgain(r3.statistic)}). By the rule, ${verdict}.`,
    '',
  ]
  const t = r3.term
  if (t && !t.fitted) {
    out.push(`**The depth term.** The first half holds ${t.firstHalf.one} one-move attempts and ${t.firstHalf.two} longer ones, so a shift for each level cannot be fitted there, and no term is kept.`, '')
  } else if (t) {
    out.push(
      `**The depth term.** Fitted on the first half's attempts (${t.firstHalf.one} at one move, ${t.firstHalf.two} longer): ${t.levelShifts.one} points taken off a one-move puzzle's rating and ${t.levelShifts.two} off a longer one's, a difference of ${t.difference}, against one shift of ${t.oneShift} for all. Mean log loss per attempt, the term against the one shift: ${t.halves.map((h, i) => halfText(h, i, 'depth', 'single')).join('; ')}. By the rule, ${t.kept ? 'both halves pass and the term is kept: it goes to the app as the two levels\' difference in a puzzle\'s difficulty' : 'it does not pass, and no term is kept'}.`,
      '',
    )
  }
  const groupRow = (name, x) =>
    x.attempts === 0
      ? `| ${name} | 0 | 0 | n/a | n/a | n/a | n/a | n/a |`
      : `| ${name} | ${x.attempts} | ${x.days} | ${ivText(x.solved, pct)} | ${pct(x.head.meanChance)} | ${ivText(x.head.gap)} | ${pct(x.view.meanChance)} | ${ivText(x.view.gap)} |`
  const aimCells = (x) => (x ? `${x.aim} | ${x.lowest} to ${x.highest} (${x.puzzles})` : 'none | none')
  const both = r3.bothLevels
  out.push(
    'Reported beside, deciding nothing. Each interval is over the same draws of the days, and a draw that holds no attempt of a group is drawn again for it.',
    '',
    '| Puzzles | Scored | Days | Solved | Headline\'s chance | Solved less it, in points | View\'s chance | Solved less it, in points |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    groupRow('One move', g.one),
    groupRow('Two moves or more', g.two),
    groupRow('Two or three moves', g.twoOrThree),
    groupRow('Four moves or more', g.fourOrMore),
    '',
    `Under the app's present aim, one target for all of a set's puzzles (${pct(r3.presentAim.new)} while a bucket is new, ${pct(r3.presentAim.core)} after), he solved ${pct(g.one.solved.value)} of the one-move puzzles, where the book's band is ${band(r3.targets.one.band)}, and ${pct(g.two.solved.value)} of the longer ones, where it is ${band(r3.targets.two.band)}.`,
    '',
    `On the chance from ${SERVING[r3.otherEstimate.estimate]}, the estimate rule 2 did not leave serving, the statistic is ${pp(r3.otherEstimate.statistic.value)} points (95% interval ${iv(r3.otherEstimate.statistic.interval)}${drawnAgain(r3.otherEstimate.statistic)}).`,
    '',
    both.statistic
      ? `Over only the ${plural(both.buckets.length, 'bucket')} whose attempts include both levels (${both.buckets.join(', ')}; ${both.one} one-move attempts and ${both.two} longer), the statistic is ${pp(both.statistic.value)} points (95% interval ${iv(both.statistic.interval)}${drawnAgain(both.statistic)}).`
      : 'No bucket\'s attempts include both levels, so the statistic cannot be read within buckets.',
    '',
    `What a set would aim at on ${r3.profileSyncedOn} for ${pct(r3.targets.one.target)} at one move and ${pct(r3.targets.two.target)} at two or more, from ${serving}, held under the ceiling of that level's puzzles:`,
    '',
    '| Bucket | Estimate | One move: aim | Its puzzles\' ratings (count) | Two or more: aim | Their ratings (count) |',
    '|---|---:|---:|---:|---:|---:|',
    ...r3.aims.map((a) => `| ${a.bucket} | ${a.rating} ± ${a.rd} | ${aimCells(a.one)} | ${aimCells(a.two)} |`),
    '',
  )
  return out
}

/** Round 2's report, from what round2.mjs computed: every sentence is chosen by the numbers. */
export function round2Markdown(report) {
  const { rules, rule3: r3 } = report
  const L = rules.looks
  const A = rules.attempts
  const r1 = rules.rule1
  const r2 = rules.rule2
  return [
    '# The learner\'s solve chances, round 2: results',
    '',
    `Written by round2.mjs. Rules 1 and 2: app commit ${rules.app}, its profile (synced ${rules.profileSyncedOn}) read with that commit's own learner. Bootstrap: ${report.draws} draws over days, seed ${report.seed}.`,
    '',
    '## The attempts',
    '',
    `Every puzzle attempt in a bucket's own set that the app counts as a first exposure, recorded after the last attempt of the profile round 1 read (app commit ${report.round1}), which was played at ${report.cutoff.clock} on ${report.cutoff.day}, Los Angeles time: ${A.attempts} attempts on ${A.days} days (${A.dayRange[0]} to ${A.dayRange[1]}), ${A.one.attempts} of one move and ${A.two.attempts} of two or more${A.notInBank ? `, and ${A.notInBank} on puzzles the bank no longer holds` : ''}. Left out: ${plural(A.leftOut.notFirst, 'attempt')} on a puzzle he had seen before${A.leftOut.otherChannel ? `, and ${A.leftOut.otherChannel} served outside a bucket's own set` : ''}.`,
    '',
    `${A.scored.attempts} of them are scored, on ${plural(A.scored.days, 'day')}: an attempt is scored when its skill already has a rated attempt in its own sets, so both estimates exist, and the other ${A.attempts - A.scored.attempts} opened a bucket's record there. Each is scored on the profile as it stood just before it: the legacy log, the puzzle totals as the seed and the events, as the app folds them.`,
    '',
    '## Rule 1: how well the headline predicts',
    '',
    `He solved ${pct(L.solved)} of the scored attempts (${plural(L.misses, 'miss', 'misses')}); the headline rating's mean solve chance was ${pct(L.headline.meanChance)}, a gap of ${pp(r1.gap.value)} points (95% interval ${iv(r1.gap.interval)}). By the rule, the headline ${{ calibrated: 'is calibrated within the noise', 'under-predicts': 'under-predicts him', 'over-predicts': 'over-predicts him' }[r1.verdict]}.`,
    '',
    '## Rule 2: the view of a set\'s own channel',
    '',
    `Mean log loss per attempt, the view against the headline: ${r2.halves.map((h, i) => halfText(h, i, 'view', 'head')).join('; ')}. By the rule, ${r2.passes ? 'both halves pass: the view stays the estimate a set\'s solve chance is read from' : 'it does not pass: the view does not stay, and a set\'s solve chance goes back to the headline'}.`,
    '',
    '## Reported beside rules 1 and 2, deciding nothing',
    '',
    `The halves' days hold, in time order, ${rules.halfDays.map((h) => list(h)).join(' scored attempts, and ')} scored attempts.`,
    '',
    `The view's mean solve chance was ${pct(L.view.meanChance)} (gap ${pp(L.view.gap.value)} points, 95% interval ${iv(L.view.gap.interval)}). Over all the days, the view's log loss minus the headline's is ${f3(L.candidate.value)} (${f3(L.candidate.interval[0])} to ${f3(L.candidate.interval[1])}). The shift that best fits the headline's chances takes ${shiftText(L.shift.head)} points off every item's rating; the view's, ${shiftText(L.shift.view)}.`,
    '',
    ...lookTables(L),
    '',
    `The learner's own self-check on this profile: ${rules.selfCheck.n} held-out attempts, Brier ${rules.selfCheck.brier} against ${rules.selfCheck.baseline.brier} for its constant, log loss ${rules.selfCheck.logLoss} against ${rules.selfCheck.baseline.logLoss}; mean predicted ${rules.selfCheck.meanPredicted}, observed ${rules.selfCheck.meanObserved}.`,
    '',
    `What each estimate would aim a set at on ${rules.profileSyncedOn}, when this profile was synced:`,
    '',
    ...aimTable(rules.today),
    '',
    '## Rule 3: a target by depth',
    '',
    ...rule3Markdown(r3),
  ]
}
