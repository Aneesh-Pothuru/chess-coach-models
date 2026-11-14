// The instrument in README.md: his puzzle first tries rebuilt from the memory
// cards, the app's learner folded on the record before each one, and the two
// solve chances it gives (the headline rating's and the view of the
// attempt's channel). The same replay runs over the profile as the app held
// it at the commit round 1 measured. Also the learner's own self-check, the
// difficulty each estimate would aim a set at as that profile stood, and the
// estimate the app aims it from (servingAbility). Rows go to private/, since
// the attempts are his.
//
//   bridge/run.sh projects/learner-solve-chance/replay.mjs
import fs from 'node:fs'
import { join } from 'node:path'
import { chess, CHESS_DIR, LAB_DIR, privateDir } from '../../bridge/lib/chess.mjs'
import { ROUND1, aims, cat, isPuzzle, lastAttemptAt, rated, replay, round1Root } from './lib.mjs'

const { loadProfile } = await chess('src/adapters/node/profile/index.ts')
const { nodeLearner } = await chess('src/adapters/node/learner/index.ts')
const { observations } = await chess('src/services/learner/evidence.ts')
const { ptDayKey } = await chess('src/core/time/index.ts')

// Round 1 reads the profile at the commit it measured, with the pinned app's
// learner: the attempts recorded after it are round 2's, and round 1 never
// scores them.
const pin = JSON.parse(fs.readFileSync(join(LAB_DIR, 'bridge', 'chess.json'), 'utf8'))
const dir = privateDir('learner-solve-chance')
const round1 = round1Root()
const loaded = loadProfile(join(round1, 'progress', 'profile.json'))
if (!loaded.ok) throw new Error(`the profile does not load: ${loaded.reason}`)
const held = loaded.profile

// The bank: each puzzle's bucket and Lichess rating.
const bank = JSON.parse(fs.readFileSync(join(CHESS_DIR, 'src', 'data', 'puzzles.json'), 'utf8'))
const itemOf = new Map()
for (const [bucket, items] of Object.entries(bank)) for (const it of items) itemOf.set(it.id, { bucket, rating: it.rating })

// ---------------------------------------------------------------- the rebuilt record
const cards = Object.entries(held.srs ?? {})
  .filter(([k]) => k.startsWith('puzzle:'))
  .map(([k, s]) => ({ id: k.slice('puzzle:'.length), reviews: (s.passes ?? 0) + (s.fails ?? 0), passes: s.passes ?? 0, lastAt: s.lastAt }))
const missingFromBank = cards.filter((c) => !itemOf.has(c.id)).length
if (missingFromBank) throw new Error(`${missingFromBank} puzzle cards are not in the bank`)
const isAttempt = (e) => e.type === 'attempt'
const puzzleEvents = new Map()
for (const e of held.events ?? []) if (isAttempt(e) && e.item.kind === 'puzzle') puzzleEvents.set(e.item.id, [...(puzzleEvents.get(e.item.id) ?? []), e])

const once = cards.filter((c) => c.reviews === 1)
const more = cards.filter((c) => c.reviews > 1)
// How the misses sit on the cards: a miss comes back as a redemption card, so
// a card reviewed once is nearly always a solve.
const failsOf = (set) => ({ cards: set.length, withFail: set.filter((c) => c.reviews - c.passes > 0).length, fails: set.reduce((a, c) => a + c.reviews - c.passes, 0) })
const selection = { once: failsOf(cards.filter((c) => c.reviews === 1)), more: failsOf(cards.filter((c) => c.reviews > 1)) }
const checks = { cards: cards.length, once: once.length, more: more.length, fromEvents: 0, rebuilt: 0, eventDisagree: 0, eventsOnMultiCards: 0 }
const rebuiltEvents = []
for (const c of once) {
  const evs = puzzleEvents.get(c.id)
  if (evs) {
    checks.fromEvents++
    // The card's one review and the event are the same attempt: one event, a first exposure, the same result.
    if (evs.length !== 1 || evs[0].first !== true || (evs[0].score >= 1 ? 1 : 0) !== c.passes || evs[0].at !== c.lastAt) checks.eventDisagree++
    continue
  }
  const { bucket, rating } = itemOf.get(c.id)
  checks.rebuilt++
  // The event the app's puzzle credit writes for a first try in a bucket's own set.
  rebuiltEvents.push({
    id: `rebuilt-${c.id}`,
    at: c.lastAt,
    v: 1,
    src: 'app',
    type: 'attempt',
    item: { kind: 'puzzle', id: c.id },
    tags: [{ c: bucket, role: 'primary' }],
    channel: 'themed',
    difficulty: { r: rating, src: 'lichess' },
    score: c.passes,
    first: true,
  })
}
for (const c of more) if (puzzleEvents.has(c.id)) checks.eventsOnMultiCards++
if (checks.eventDisagree || checks.eventsOnMultiCards) throw new Error(`events and cards disagree: ${JSON.stringify(checks)}`)

// The legacy log against the cards: an entry within a second of a
// once-reviewed card's review, with its bucket and rating, is that attempt
// (older builds stamped the two a few milliseconds apart); any other belongs to
// a card reviewed more than once.
const MATCH_MS = 1000
const log = { entries: (held.attempts ?? []).length, onceCards: 0, onceDisagree: 0, multiCards: 0, unexplained: 0 }
const matched = new Set()
for (const a of held.attempts ?? []) {
  const c = once.find((x) => !matched.has(x.id) && Math.abs(x.lastAt - a.at) <= MATCH_MS && itemOf.get(x.id).bucket === a.bucket && itemOf.get(x.id).rating === a.rating)
  if (c) {
    matched.add(c.id)
    log.onceCards++
    if (c.passes !== a.ok) log.onceDisagree++
    continue
  }
  const owner = more.find((m) => m.lastAt >= a.at && itemOf.get(m.id).bucket === a.bucket && itemOf.get(m.id).rating === a.rating)
  if (owner) log.multiCards++
  else log.unexplained++
}
if (log.onceDisagree || log.unexplained) throw new Error(`the legacy log and the cards disagree: ${JSON.stringify(log)}`)

const buckets = new Set([...Object.keys(held.puzzleStats ?? {}), ...rebuiltEvents.map((e) => e.tags[0].c)])
const rebuilt = {
  ...held,
  attempts: [],
  events: [...(held.events ?? []), ...rebuiltEvents].sort((a, b) => a.at - b.at),
  // No seed: the rebuilt record holds the first tries the totals count, and no working rating reaches the fold.
  puzzleStats: Object.fromEntries([...buckets].map((b) => [b, { attempts: 0, correct: 0 }])),
}

// ---------------------------------------------------------------- the replay
/** The once-reviewed card a legacy log attempt is (its bucket and rating, within a second), or null. */
const cardAt = (o) => once.find((c) => Math.abs(c.lastAt - o.at) <= MATCH_MS && itemOf.get(c.id).bucket === o.competency && itemOf.get(c.id).rating === o.difficulty)?.id ?? null

const rows = [...replay('rebuilt', rebuilt, false, { logItem: cardAt }), ...replay('held', held, true, { logItem: cardAt })]

// ---------------------------------------------------------------- the record's shape
const firstTries = observations(rebuilt, cat).filter((o) => isPuzzle(o) && rated(o))
const shape = {
  firstTries: firstTries.length,
  firstTriesByBucket: Object.fromEntries([...new Set(firstTries.map((o) => o.competency))].sort().map((b) => [b, firstTries.filter((o) => o.competency === b).length])),
  span: { from: ptDayKey(firstTries[0].at), to: ptDayKey(firstTries[firstTries.length - 1].at) },
  heldPuzzleTotals: Object.values(held.puzzleStats ?? {}).reduce((a, s) => ({ attempts: a.attempts + (s?.attempts ?? 0), correct: a.correct + (s?.correct ?? 0) }), { attempts: 0, correct: 0 }),
}

// ---------------------------------------------------------------- the learner today
const now = held.updatedAt
const learner = nodeLearner(round1, { now })
const selfCheck = learner.calibration()
const today = aims(learner, bank, now)

// Round 2 scores what the profile records after its last attempt here.
shape.profile = ROUND1
shape.lastAttempt = ptDayKey(lastAttemptAt(held))
shape.syncedOn = ptDayKey(now)
fs.writeFileSync(join(dir, 'rows.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
fs.writeFileSync(join(dir, 'state.json'), JSON.stringify({ app: pin.commit, checks, log, selection, shape, selfCheck, today, now }, null, 1) + '\n')
console.log(JSON.stringify({ rows: { rebuilt: rows.filter((r) => r.record === 'rebuilt').length, held: rows.filter((r) => r.record === 'held').length }, checks, log }, null, 1))
