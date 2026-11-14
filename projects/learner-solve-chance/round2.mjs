// Round 2, as README.md fixes it ("Round 2, fixed before any of its attempts
// exists" and "Round 2, rule 3: a target by depth"): the puzzle attempts the
// app recorded after round 1's last one, each scored on the profile as it
// stood just before it, then rules 1 and 2 over them and rule 3 by depth.
//
// The commit read is the one CHESS_DIR is checked out at: its profile, its
// bank and its learner, so the profile is read with that commit's own code.
//
//   CHESS_DIR="$(bridge/checkout.sh at <sha>)" bridge/run.sh projects/learner-solve-chance/round2.mjs
//     A check-in: the attempts by day and by depth and how many are scored,
//     on stdout. It reads no result and writes none.
//
//   CHESS_DIR="$(bridge/checkout.sh at <sha>)" bridge/run.sh projects/learner-solve-chance/round2.mjs --run
//     The rules. Rules 1 and 2 run once, at the first commit read whose
//     attempts fall on ten Los Angeles days, with rule 3 beside them when each
//     depth holds its 30 scored attempts. Where one does not, rule 3 reports
//     its counts, and a later --run at a later commit runs it alone, once, on
//     every attempt recorded by then and on the estimate rule 2 left serving;
//     rules 1 and 2 stay as they were recorded. Run again at a commit it has
//     read, it reproduces what it wrote there.
//
// Rows go to private/, since the attempts are his; results/round2.json and
// round2.md hold aggregates, and name the commits they read.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { join } from 'node:path'
import { chess, CHESS_DIR, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { B, MIN_PER_LEVEL, ROUND1, SEED, aims, byDay, cat, depthOf, halvesOf, isPuzzle, lastAttemptAt, levelOf, looks, rated, replay, round1Root, round2Markdown, rule1, rule2, rule3 } from './lib.mjs'

const { loadProfile } = await chess('src/adapters/node/profile/index.ts')
const { nodeLearner } = await chess('src/adapters/node/learner/index.ts')
const { observations } = await chess('src/services/learner/evidence.ts')
const { channelOf } = await chess('src/services/learner/channels.ts')
const { difficultyFor, bucketCeiling, servingAbility, TARGET_P } = await chess('src/services/learner/index.ts')
const { ptDayKey } = await chess('src/core/time/index.ts')

const args = process.argv.slice(2)
if (args.some((a) => a !== '--run')) {
  console.error('usage: bridge/run.sh projects/learner-solve-chance/round2.mjs [--run]')
  process.exit(2)
}
const RUN = args.includes('--run')
const MIN_DAYS = 10
// The book's bands by depth, and the target rule 3's README reads inside each.
const DEPTH_TARGETS = { one: { target: 0.85, band: [0.8, 0.9] }, two: { target: 0.65, band: [0.6, 0.7] } }

// ---------------------------------------------------------------- the commit read
const git = (...a) => execFileSync('git', ['-C', CHESS_DIR, ...a], { encoding: 'utf8' }).trim()
const app = git('rev-parse', 'HEAD')
if (git('status', '--porcelain', '--', 'progress', 'src')) throw new Error(`${CHESS_DIR} differs from its commit ${app}: round 2 reads the app at one commit (bridge/checkout.sh at <sha>)`)

const load = (file) => {
  const loaded = loadProfile(file)
  if (!loaded.ok) throw new Error(`${file} does not load: ${loaded.reason}`)
  return loaded.profile
}
const profile = load(join(CHESS_DIR, 'progress', 'profile.json'))

// Round 2's attempts are those recorded after the last attempt of the profile round 1 read.
const cutoff = lastAttemptAt(load(join(round1Root(), 'progress', 'profile.json')))
const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(cutoff)
if (ptDayKey(cutoff) !== '2026-10-07' || clock !== '09:27') throw new Error(`round 1's last attempt reads ${ptDayKey(cutoff)} ${clock}, not 09:27 on 7 October`)
if (!(lastAttemptAt(profile) > cutoff)) throw new Error(`the profile at ${app} holds no attempt after round 1's last`)

// The bank at the commit read: each puzzle's depth, checked against Lichess's own length theme.
const bank = JSON.parse(fs.readFileSync(join(CHESS_DIR, 'src', 'data', 'puzzles.json'), 'utf8'))
const LENGTH_THEMES = { oneMove: (d) => d === 1, short: (d) => d === 2, long: (d) => d === 3, veryLong: (d) => d >= 4 }
const depthIn = new Map()
for (const items of Object.values(bank)) {
  for (const it of items) {
    const depth = depthOf(it.moves)
    const lengths = (it.themes ?? '').split(/\s+/).filter((t) => t in LENGTH_THEMES)
    if (lengths.length > 1 || lengths.some((t) => !LENGTH_THEMES[t](depth))) throw new Error(`puzzle ${it.id} has ${depth} of his moves and the length theme ${lengths.join(' ')}`)
    if (depthIn.has(it.id) && depthIn.get(it.id) !== depth) throw new Error(`puzzle ${it.id} is in the bank with two depths`)
    depthIn.set(it.id, depth)
  }
}
const depthOfItem = (item) => depthIn.get(item) ?? null
const levelOfItem = (item) => (depthIn.has(item) ? levelOf(depthIn.get(item)) : null)

// ---------------------------------------------------------------- the attempts, with no result read
const all = observations(profile, cat)
const after = all.filter((o) => o.at > cutoff && isPuzzle(o))
// Since round 1 the app writes an event for every puzzle attempt, saying
// whether it was a first exposure. One it cannot say that of would be neither
// kept nor left out by the rule, so the run stops on it.
const unclear = after.filter((o) => o.from !== 'event' || o.role !== 'primary' || typeof o.first !== 'boolean')
if (unclear.length) throw new Error(`${unclear.length} puzzle attempts after round 1's last are not events that say whether they were first exposures`)
const isRound2 = (o) => o.at > cutoff && isPuzzle(o) && channelOf(o.channel) === 'themed' && o.first === true
const attempts = after.filter(isRound2)
const itemOf = (o) => o.item.slice('puzzle:'.length)

// An attempt is scored when its skill already has a rated attempt in the same channel (the replay's own test).
const scoredAttempts = []
const seen = new Set()
for (const o of all) {
  if (!rated(o)) continue
  const key = `${o.competency}|${channelOf(o.channel)}`
  if (isRound2(o) && seen.has(key)) scoredAttempts.push(o)
  seen.add(key)
}

const daysOf = (set) => [...new Set(set.map((o) => ptDayKey(o.at)))].sort()
const count = (set) => ({ attempts: set.length, days: daysOf(set).length })
const byLevel = (set) => ({
  one: count(set.filter((o) => levelOfItem(itemOf(o)) === 1)),
  two: count(set.filter((o) => levelOfItem(itemOf(o)) === 2)),
  notInBank: set.filter((o) => levelOfItem(itemOf(o)) === null).length,
})
const counts = {
  ...count(attempts),
  dayRange: attempts.length ? [daysOf(attempts)[0], daysOf(attempts).at(-1)] : null,
  ...byLevel(attempts),
  scored: { ...count(scoredAttempts), ...byLevel(scoredAttempts) },
  // Puzzle attempts after round 1's last that round 2 leaves out: seen before, or served outside a bucket's own set.
  leftOut: { notFirst: after.filter((o) => o.first === false).length, otherChannel: after.filter((o) => o.first === true && channelOf(o.channel) !== 'themed').length },
}
const profileSyncedOn = ptDayKey(profile.updatedAt)
const enoughDays = counts.days >= MIN_DAYS
const enoughByLevel = counts.scored.one.attempts >= MIN_PER_LEVEL && counts.scored.two.attempts >= MIN_PER_LEVEL

if (!RUN) {
  const perDay = Object.fromEntries(daysOf(attempts).map((d) => [d, attempts.filter((o) => ptDayKey(o.at) === d).length]))
  console.log(JSON.stringify({ app, profileSyncedOn, cutoff: `${ptDayKey(cutoff)} ${clock}`, ...counts, perDay, rules1and2: enoughDays ? 'can run' : `wait: ${counts.days} of ${MIN_DAYS} days`, rule3: enoughByLevel ? 'can run' : `not enough data: ${counts.scored.one.attempts} and ${counts.scored.two.attempts} of ${MIN_PER_LEVEL} scored attempts at each level` }, null, 1))
  process.exit(0)
}

// ---------------------------------------------------------------- what has run already
const out = resultsDir('learner-solve-chance')
const file = join(out, 'round2.json')
const recorded = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
// Rules 1 and 2 run here on a first run, or again at the commit they ran at (a reproduction).
const decideHere = !recorded || recorded.rules.app === app
if (decideHere && !enoughDays) throw new Error(`round 2 runs once its attempts fall on at least ${MIN_DAYS} Los Angeles days: ${counts.attempts} attempts on ${counts.days} days at ${app}. Until then nothing is decided.`)
if (recorded && !decideHere) {
  if (recorded.rule3.status === 'ran' && recorded.rule3.app !== app) throw new Error(`rule 3 ran once, at ${recorded.rule3.app}: a test on more attempts is a new round, fixed before it runs`)
  if (counts.attempts < recorded.rules.attempts.attempts) throw new Error(`the profile at ${app} holds fewer round 2 attempts than rules 1 and 2 read at ${recorded.rules.app}: rule 3 is checked again at a later commit`)
}
// Rule 3 as recorded at a later commit stays when rules 1 and 2 are reproduced at theirs.
const keepRule3 = Boolean(recorded) && decideHere && recorded.rule3.app !== app

// ---------------------------------------------------------------- the rows
const rows = replay('round2', profile, true, { wanted: isRound2 }).map((r) => ({ ...r, depth: depthOfItem(r.item), level: levelOfItem(r.item) }))
if (rows.length !== scoredAttempts.length || rows.some((r, i) => r.at !== scoredAttempts[i].at || r.channel !== 'themed' || r.first !== true)) throw new Error('the replay scored other attempts than the ones counted')
const dir = join(privateDir('learner-solve-chance'), 'round2')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(join(dir, 'rows.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
fs.writeFileSync(join(dir, 'state.json'), JSON.stringify({ app, counts }, null, 1) + '\n')
const days = byDay(rows)
const now = profile.updatedAt
const learner = nodeLearner(CHESS_DIR, { now })

// ---------------------------------------------------------------- rules 1 and 2
const rules = decideHere
  ? {
      app,
      profileSyncedOn,
      attempts: counts,
      rule1: rule1(days),
      rule2: rule2(days),
      // Beside rule 2: the scored attempts on each of the halves' days, in time order.
      halfDays: halvesOf(days).map((h) => h.map((d) => d.rows.length)),
      looks: looks(rows),
      selfCheck: learner.calibration(),
      today: aims(learner, bank, now),
    }
  : recorded.rules
// The estimate rule 2 leaves serving: the view if it stays, the headline if not.
const serving = rules.rule2.passes ? 'view' : 'head'

// ---------------------------------------------------------------- rule 3
/** Per bucket, the difficulty a set would aim at now for each depth's target, from the serving estimate. */
function aimsByDepth() {
  return learner
    .skills(now)
    .filter((s) => bank[s.id])
    .map((s) => {
      const estimate = serving === 'view' ? servingAbility(s, 'themed') : s.ability
      const at = (level, target) => {
        const pool = bank[s.id].filter((p) => levelOf(depthOf(p.moves)) === level).map((p) => ({ id: p.id, rating: p.rating }))
        if (pool.length === 0) return null
        const ratings = pool.map((p) => p.rating)
        return { puzzles: pool.length, lowest: Math.min(...ratings), highest: Math.max(...ratings), aim: Math.min(difficultyFor(estimate, target), bucketCeiling(pool)) }
      }
      return { bucket: s.id, rating: estimate.rating, rd: estimate.rd, one: at(1, DEPTH_TARGETS.one.target), two: at(2, DEPTH_TARGETS.two.target) }
    })
}
const third = rule3(days, serving)
for (const level of ['one', 'two']) {
  if (third.counts[level].attempts !== counts.scored[level].attempts) throw new Error('rule 3 counted other attempts than the ones counted before the replay')
}
const report = {
  round1: ROUND1,
  cutoff: { day: ptDayKey(cutoff), clock },
  seed: SEED,
  draws: B,
  rules,
  // The app's present aim is one target for a whole set: TARGET_P's, while a bucket is new and after.
  rule3: keepRule3 ? recorded.rule3 : { app, profileSyncedOn, attempts: counts, ...third, ...(third.status === 'ran' ? { targets: DEPTH_TARGETS, presentAim: { new: TARGET_P.new, core: TARGET_P.core }, aims: aimsByDepth() } : {}) },
}

// ---------------------------------------------------------------- the report
const md = round2Markdown(report).join('\n')
fs.writeFileSync(file, JSON.stringify(report, null, 1) + '\n')
fs.writeFileSync(join(out, 'round2.md'), md)
console.log(md)
