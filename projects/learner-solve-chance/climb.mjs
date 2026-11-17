// Where each bucket's next sets would aim (README.md, "A faster climb after
// an aced set"): the profile round 2 read, folded by that commit's own
// learner, and then the same learner again after each of three sets solved in
// full, so the size of the app's step after a perfect set is read for every
// bucket as its own record makes it. Beside it, the same path aimed from the
// climb: the higher of the view and the rating the last set gives by itself.
// And how long before the profile's sync each bucket's last first try was
// played: an aim moves only when the bucket gets a set.
//
//   CHESS_DIR="$(bridge/checkout.sh at <the commit round 2 read>)" bridge/run.sh projects/learner-solve-chance/climb.mjs
//
// It reads no attempt recorded after round 2's last, so it refuses any other
// commit, and nothing by a puzzle's depth. results/climb.json and climb.md
// hold one line per bucket.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { join } from 'node:path'
import { chess, CHESS_DIR, resultsDir } from '../../bridge/lib/chess.mjs'
import { CLIMB_MIN, CLIMB_WINDOW, cat, checkBorrowedConstants, climbRating, endgameIds, lastSetRating } from './lib.mjs'

const { loadProfile } = await chess('src/adapters/node/profile/index.ts')
const { nodeLearner } = await chess('src/adapters/node/learner/index.ts')
const { foldAbilities } = await chess('src/services/learner/ability.ts')
const { observations, byCompetency } = await chess('src/services/learner/evidence.ts')
const { channelOf } = await chess('src/services/learner/channels.ts')
const { serveTarget, servingAbility, MIN_ATTEMPTS, SESSION_SIZE, TARGET_P } = await chess('src/services/learner/index.ts')
const { ptDayKey } = await chess('src/core/time/index.ts')

checkBorrowedConstants()
const out = resultsDir('learner-solve-chance')
const round2 = JSON.parse(fs.readFileSync(join(out, 'round2.json'), 'utf8'))
const git = (...a) => execFileSync('git', ['-C', CHESS_DIR, ...a], { encoding: 'utf8' }).trim()
const app = git('rev-parse', 'HEAD')
if (app !== round2.rules.app) throw new Error(`this reads the profile round 2 read, at ${round2.rules.app}: a later profile holds round 3's attempts, which nothing reads before round 3 runs`)
if (git('status', '--porcelain', '--', 'progress', 'src')) throw new Error(`${CHESS_DIR} differs from its commit ${app}`)

const loaded = loadProfile(join(CHESS_DIR, 'progress', 'profile.json'))
if (!loaded.ok) throw new Error(`the profile does not load: ${loaded.reason}`)
const profile = loaded.profile
const bank = JSON.parse(fs.readFileSync(join(CHESS_DIR, 'src', 'data', 'puzzles.json'), 'utf8'))
const now = profile.updatedAt
const DAY_MS = 86_400_000
const GAP_DAYS = 14
const PERFECT_SETS = 3
/** The middle of sorted numbers: the mean of the two middle ones when their count is even. */
const medianOf = (sorted) => (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
/** Whole Los Angeles days from one moment's day to another's. */
const daysBetween = (from, to) => Math.round((Date.parse(ptDayKey(to)) - Date.parse(ptDayKey(from))) / DAY_MS)

/** The bucket's state on a profile at a moment, as the app's learner folds it. */
function stateOf(p, bucket, at) {
  const all = observations(p, cat)
  return { state: foldAbilities({ profile: p, catalogue: cat, observations: byCompetency(all), endgameIds, now: at }).get(bucket), own: all.filter((o) => o.competency === bucket && channelOf(o.channel) === 'themed' && o.first !== false) }
}
/** Where a set of the bucket would aim from a rating, as the app's serving turns a rating into an aim. */
const aimFrom = (serving, rating, phase, pool) => serveTarget({ ...serving, rating }, phase, pool, 0)
/** The profile with one more set of the bucket on record: SESSION_SIZE first tries at one difficulty, all solved. */
function withPerfectSet(p, bucket, at, difficulty, label) {
  const events = Array.from({ length: SESSION_SIZE }, (_, i) => ({ type: 'attempt', at: at + i * 60_000, src: 'projection', item: { kind: 'puzzle', id: `${label}-${i}` }, tags: [{ c: bucket, role: 'primary' }], channel: 'themed', first: true, score: 1, difficulty: { r: difficulty, src: 'projection' } }))
  const stats = p.puzzleStats?.[bucket] ?? { attempts: 0, correct: 0 }
  return { ...p, updatedAt: at + SESSION_SIZE * 60_000, events: [...(p.events ?? []), ...events], puzzleStats: { ...p.puzzleStats, [bucket]: { ...stats, attempts: stats.attempts + SESSION_SIZE, correct: stats.correct + SESSION_SIZE } } }
}

const skills = new Map(nodeLearner(CHESS_DIR, { now }).skills(now).map((s) => [s.id, s]))
const today = new Map(round2.rules.today.map((t) => [t.bucket, t]))
const buckets = round2.rules.today.map((t) => {
  const bucket = t.bucket
  const pool = bank[bucket].map((p) => ({ id: p.id, rating: p.rating }))
  const skill = skills.get(bucket)
  const phase = skill.attempts < MIN_ATTEMPTS ? 'new' : 'core'
  /** The aims of the next set and of each set after a perfect one, each set aimed by `rule` and solved in full. */
  const path = (rule) => {
    let p = profile
    const aims = []
    for (let k = 0; k <= PERFECT_SETS; k++) {
      const at = now + k * GAP_DAYS * DAY_MS
      const { state, own } = stateOf(p, bucket, at)
      const serving = servingAbility(state, 'themed')
      const aim = aimFrom(serving, rule === 'app' ? serving.rating : climbRating(serving.rating, lastSetRating(own, { perfect: rule === 'perfect' })), k === 0 ? phase : 'core', pool)
      aims.push(aim)
      p = withPerfectSet(p, bucket, at, aim, `projected-${rule}-${bucket}-${k}`)
    }
    return aims
  }
  const { state, own } = stateOf(profile, bucket, now)
  const last = own.slice(-CLIMB_WINDOW)
  const sorted = last.map((o) => o.difficulty).sort((a, b) => a - b)
  const paths = { app: path('app'), climb: path('climb'), perfect: path('perfect') }
  if (paths.app[0] !== today.get(bucket).app.target) throw new Error(`${bucket}: the next aim reads ${paths.app[0]}, and round 2's report has ${today.get(bucket).app.target}`)
  return {
    bucket,
    phase,
    own: own.length,
    lastTryDaysBefore: own.length ? daysBetween(own.at(-1).at, now) : null,
    lastSet: last.length >= CLIMB_MIN ? { attempts: last.length, solved: last.filter((o) => o.score >= 1).length, at: sorted[Math.floor(sorted.length / 2)], own: lastSetRating(own) } : null,
    view: state.channels.themed ? { rating: state.channels.themed.rating, rd: state.channels.themed.rd, n: state.channels.themed.n } : null,
    aimsFrom: today.get(bucket).app.from,
    ...paths,
    bankMax: Math.max(...pool.map((p) => p.rating)),
  }
})

// A step the bucket's ceiling cuts short says nothing of the learner's step, so those buckets are left out of the summary.
const steps = buckets.filter((b) => b.app[1] < b.bankMax + 100).map((b) => b.app[1] - b.app[0]).sort((a, b) => a - b)
const waits = buckets.filter((b) => b.lastTryDaysBefore !== null).map((b) => b.lastTryDaysBefore).sort((a, b) => a - b)
const report = {
  app,
  profileSyncedOn: ptDayKey(now),
  target: TARGET_P.core,
  set: SESSION_SIZE,
  window: CLIMB_WINDOW,
  least: CLIMB_MIN,
  gapDays: GAP_DAYS,
  perfectSets: PERFECT_SETS,
  buckets,
  firstStep: { buckets: steps.length, least: steps[0], median: medianOf(steps), most: steps.at(-1) },
  sinceLastTry: { buckets: waits.length, least: waits[0], median: medianOf(waits), most: waits.at(-1), over30: waits.filter((d) => d > 30).length },
  raisedNow: { climb: buckets.filter((b) => b.climb[0] - b.app[0] >= 100).map((b) => b.bucket), perfect: buckets.filter((b) => b.perfect[0] - b.app[0] >= 100).map((b) => b.bucket) },
}

const arrow = (aims) => aims.join(' → ')
const md = [
  '# Where each bucket\'s next sets would aim',
  '',
  `Written by climb.mjs. App commit ${app}, its profile (synced ${report.profileSyncedOn}) read with that commit's own learner: the profile round 2 read, and no attempt after it. Nothing here is by a puzzle's depth.`,
  '',
  `For each bucket: the first tries its own sets have on record and how many days before the sync the last of them was played, the last set by itself (its last ${CLIMB_WINDOW} first tries, once it has ${CLIMB_MIN}: how many he solved, their median rating, and the rating they give alone), the view the app aims from, and then where the next four sets would aim if he solved each in full, ${GAP_DAYS} days apart: aimed as the app aims, and aimed from the climb (the higher of the view and the last set's own rating). A set here is ${SESSION_SIZE} first tries at the difficulty it aims at; an aim never passes 100 points over the hardest puzzle the bank holds for the bucket.`,
  '',
  '| Bucket | First tries on record | The last, days before the sync | Last set: solved | at about | Its own rating | The view | The app: next set, then after each perfect set | The climb: the same | Hardest in the bank |',
  '|---|---:|---:|---:|---:|---:|---:|---|---|---:|',
  ...buckets.map((b) => `| ${b.bucket} | ${b.own} | ${b.lastTryDaysBefore ?? 'n/a'} | ${b.lastSet ? `${b.lastSet.solved} of ${b.lastSet.attempts}` : 'n/a'} | ${b.lastSet ? b.lastSet.at : 'n/a'} | ${b.lastSet ? b.lastSet.own : 'n/a'} | ${b.view ? `${b.view.rating} ± ${b.view.rd}` : `none (${b.aimsFrom})`} | ${arrow(b.app)} | ${arrow(b.climb)} | ${b.bankMax} |`),
  '',
  `The app's step after one perfect set, over the ${report.firstStep.buckets} buckets where the bank's ceiling does not cut it short: ${report.firstStep.least} points at the least, ${report.firstStep.median} at the median and ${report.firstStep.most} at the most.`,
  '',
  `An aim moves only when the bucket gets a set. The last first try of a bucket's own sets was ${report.sinceLastTry.least} to ${report.sinceLastTry.most} days before the sync, ${report.sinceLastTry.median} at the median of the ${report.sinceLastTry.buckets} buckets that have one, and more than 30 days before it in ${report.sinceLastTry.over30} of them.`,
  '',
  `The climb would aim the next set at least 100 points over the app's aim in ${report.raisedNow.climb.length ? report.raisedNow.climb.join(', ') : 'no bucket'}; kept to perfect sets, in ${report.raisedNow.perfect.length ? report.raisedNow.perfect.join(', ') : 'no bucket'}.`,
  '',
].join('\n')

fs.writeFileSync(join(out, 'climb.json'), JSON.stringify(report, null, 1) + '\n')
fs.writeFileSync(join(out, 'climb.md'), md)
console.log(md)
